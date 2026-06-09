import http from 'http';
import WebSocket from 'ws';

const API = '/api';
const WS_URL = 'ws://localhost:3001/ws';
const WS_PATH = '/ws';
const INCREMENT_PRICE = 10;
const START_PRICE = 0;
const DURATION_SECONDS = 120;

// ── Helpers ──────────────────────────────────────────
const apiRequest = (method, path, body, token) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : undefined;
  const headers = { 'Content-Type': 'application/json' };
  if (data) headers['Content-Length'] = Buffer.byteLength(data);
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const options = { hostname: 'localhost', port: 3000, path: API + path, method, headers };
  const req = http.request(options, (res) => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve(d); } });
  });
  req.on('error', reject);
  if (data) req.write(data);
  req.end();
});
const apiPost = (p, b, t) => apiRequest('POST', p, b, t);
const apiGet = (p, t) => apiRequest('GET', p, null, t);

function connectWS(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
    const timer = setTimeout(() => reject(new Error('WS timeout')), 10000);
    ws.on('open', () => { clearTimeout(timer); resolve(ws); });
    ws.on('error', e => { clearTimeout(timer); reject(e); });
  });
}

function wsWait(ws, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Timeout: ' + event)), timeout);
    const h = (raw) => {
      try {
        const m = JSON.parse(raw.toString());
        if (m.event === event) { clearTimeout(t); ws.removeListener('message', h); resolve(m.data); }
      } catch (e) {}
    };
    ws.on('message', h);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ─────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const NUM_USERS = parseInt(args[0]) || 50;
  const BURST_SIZE = parseInt(args[1]) || NUM_USERS;
  const ROUNDS = parseInt(args[2]) || 3;

  console.log('═══════════════════════════════════════');
  console.log('  Redis Lock Stress Test');
  console.log('═══════════════════════════════════════');
  console.log(`  Users: ${NUM_USERS}  |  Burst: ${BURST_SIZE}  |  Rounds: ${ROUNDS}`);
  console.log(`  Start Price: ¥${START_PRICE}  |  Increment: ¥${INCREMENT_PRICE}`);
  console.log('═══════════════════════════════════════\n');

  // ── Phase 1: Setup admin + generate user tokens ──
  console.log('[Phase 1] Setting up admin and generating user tokens...');
  const startReg = Date.now();

  // Get admin token for auction creation (role=admin via query param)
  const adminRes = await apiPost('/auth/dev-token?username=stress_admin&role=admin', {});
  const adminToken = adminRes.data.accessToken || adminRes.data.token;
  console.log(`  Admin token obtained (role: ${adminRes.data.role || 'admin'})`);

  const users = [];
  for (let i = 1; i <= NUM_USERS; i++) {
    const name = `stress_u${i}`;
    const res = await apiPost(`/auth/dev-token?username=${name}&role=user`, {});
    const token = res.data?.accessToken || res.data?.token;
    if (!token) { console.error(`  Token failed for user ${i}:`, JSON.stringify(res)); continue; }
    users.push({ id: res.data.userId, username: name, token, refreshToken: res.data.refreshToken });
    if (i % 25 === 0) process.stdout.write(`  ${i}/${NUM_USERS}...\n`);
  }
  console.log(`  Done in ${Date.now() - startReg}ms (${(Date.now() - startReg) / NUM_USERS | 0}ms/user)\n`);

  // ── Phase 2: Create & Start Auction ──
  console.log('[Phase 2] Creating auction...');
  const create = await apiPost('/auctions', {
    name: 'Stress Test Auction',
    startPrice: START_PRICE,
    incrementPrice: INCREMENT_PRICE,
    durationSeconds: DURATION_SECONDS,
    autoDelaySeconds: 5,
  }, adminToken);
  const goodsId = create.data.id;
  await apiPost(`/auctions/${goodsId}/start`, {}, adminToken);
  await sleep(300);
  console.log(`  Auction #${goodsId} started\n`);

  // ── Phase 3: Connect all WebSockets ──
  console.log('[Phase 3] Connecting WebSockets...');
  const startConn = Date.now();
  const connections = [];
  for (let i = 0; i < NUM_USERS; i++) {
    try {
      const ws = await connectWS(users[i].token);
      connections.push({ ws, user: users[i], joined: false });
    } catch (e) {
      console.error(`  User ${i + 1} connection failed:`, e.message);
    }
    if ((i + 1) % 25 === 0) process.stdout.write(`  ${i + 1}/${NUM_USERS} connected...\n`);
  }
  const actualUsers = connections.length;
  console.log(`  ${actualUsers}/${NUM_USERS} connected in ${Date.now() - startConn}ms\n`);

  // ── Phase 4: Join room ──
  console.log('[Phase 4] Joining auction room...');
  const startJoin = Date.now();
  for (const conn of connections) {
    conn.ws.send(JSON.stringify({ event: 'join-auction-room', data: goodsId }));
  }
  // Wait for joined-room on all
  await Promise.all(connections.map(async (c, i) => {
    try {
      await wsWait(c.ws, 'joined-room', 5000);
      c.joined = true;
    } catch (e) {
      console.error(`  User ${c.user.id} join failed:`, e.message);
    }
    if ((i + 1) % 25 === 0) process.stdout.write(`  ${i + 1}/${actualUsers} joined...\n`);
  }));
  const joinedUsers = connections.filter(c => c.joined);
  console.log(`  ${joinedUsers.length}/${actualUsers} joined in ${Date.now() - startJoin}ms\n`);

  // ── Phase 5: Stress rounds ──
  console.log('[Phase 5] Bidding rounds');
  console.log('─'.repeat(60));

  let totalBidsSent = 0;
  let totalBidsOk = 0;
  let totalBidsErr = 0;
  let totalOutbidSent = 0;
  const roundStats = [];

  for (let round = 1; round <= ROUNDS; round++) {
    const bidderPool = joinedUsers.slice(0, Math.min(BURST_SIZE, joinedUsers.length));

    // Collect metrics per user in this round
    const roundLatencies = [];
    let roundOk = 0, roundErr = 0, roundOutbid = 0;

    // Set up message handlers for this round
    const pending = bidderPool.map(async (conn) => {
      return new Promise((resolve) => {
        const start = Date.now();
        let done = false;

        const handler = (raw) => {
          if (done) return;
          try {
            const msg = JSON.parse(raw.toString());
            if (msg.event === 'price-updated') {
              // Only count as MY success if I'm the one who bid
              if (msg.data?.latestBidderId === conn.user.id) {
                roundLatencies.push(Date.now() - start);
                roundOk++;
                done = true;
                conn.ws.removeListener('message', handler);
                resolve();
              }
              // else: someone else won, keep waiting
            } else if (msg.event === 'bid-error') {
              roundErr++;
              done = true;
              conn.ws.removeListener('message', handler);
              resolve();
            } else if (msg.event === 'outbid') {
              // outbid means our previous bid was overtaken
              roundOutbid++;
            }
          } catch (e) {}
        };
        conn.ws.on('message', handler);

        // Send bid
        conn.ws.send(JSON.stringify({ event: 'bid', data: goodsId }));

        // Timeout after 5 seconds
        setTimeout(() => {
          if (!done) {
            roundErr++;
            done = true;
            conn.ws.removeListener('message', handler);
            resolve();
          }
        }, 5000);
      });
    });

    await Promise.all(pending);
    await sleep(200); // brief pause between rounds

    // Sort latencies for percentile
    roundLatencies.sort((a, b) => a - b);
    const avg = roundLatencies.length > 0 ? roundLatencies.reduce((a, b) => a + b, 0) / roundLatencies.length : 0;
    const p50 = roundLatencies.length > 0 ? roundLatencies[Math.floor(roundLatencies.length * 0.5)] : 0;
    const p95 = roundLatencies.length > 0 ? roundLatencies[Math.floor(roundLatencies.length * 0.95)] : 0;
    const p99 = roundLatencies.length > 0 ? roundLatencies[Math.floor(roundLatencies.length * 0.99)] : 0;

    roundStats.push({ round, users: bidderPool.length, ok: roundOk, err: roundErr, outbid: roundOutbid, avg: Math.round(avg), p50, p95, p99 });

    console.log(`  Round ${round}: ${bidderPool.length} users → OK:${roundOk} ERR:${roundErr} OUTBID:${roundOutbid} | avg:${Math.round(avg)}ms p50:${p50}ms p95:${p95}ms p99:${p99}ms`);

    totalBidsSent += bidderPool.length;
    totalBidsOk += roundOk;
    totalBidsErr += roundErr;
    totalOutbidSent += roundOutbid;
  }
  console.log('─'.repeat(60) + '\n');

  // ── Phase 6: Verify data consistency ──
  console.log('[Phase 6] Data consistency check...');
  const auction = await apiGet(`/auctions/${goodsId}`, adminToken);
  const bidHistory = await apiGet('/bids/me?page=1&pageSize=1000', users[0].token);

  // Calculate expected price: startPrice + (totalSuccessBids * incrementPrice)
  // But wait: totalSuccessBids != totalBidsOk because some bids from same user are rejected
  // We can check: bidHistory.total should equal totalBidsOk (minus overlap from same users)
  // Actually totalBidsOk counts price-updated events across all rounds.
  // Each price-updated also increments the price by INCREMENT_PRICE
  // So finalPrice = START_PRICE + totalBidsOk * INCREMENT_PRICE (approximately)

  // Simpler check: get the current auction state from Redis via the sequence endpoint
  const seq = await apiGet('/auctions/sequence', adminToken);
  const ongoing = seq.data?.ongoing;
  let currentPrice = ongoing ? 'N/A' : 'N/A';

  // Connect one more WS to get state
  const checkWs = await connectWS(adminToken);
  checkWs.send(JSON.stringify({ event: 'join-auction-room', data: goodsId }));
  let stateData = null;
  checkWs.on('message', (raw) => {
    try {
      const m = JSON.parse(raw.toString());
      if (m.event === 'auction-state') stateData = m.data;
    } catch (e) {}
  });
  await sleep(500);

  // Get bid records from DB
  const bidsRes = await apiGet(`/bids/me?page=1&pageSize=1000`, users[1].token);

  // ── Phase 7: Cleanup ──
  console.log('[Phase 7] Cleanup...');
  // Cancel the auction so it doesn't keep running
  await apiPost(`/auctions/${goodsId}/cancel`, {}, adminToken);

  for (const conn of connections) {
    try { conn.ws.close(); } catch (e) {}
  }
  try { checkWs.close(); } catch (e) {}

  // ── Final Report ──
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║           STRESS TEST REPORT                     ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Total bids sent:     ${String(totalBidsSent).padStart(6)}                       ║`);
  console.log(`║  Successful:          ${String(totalBidsOk).padStart(6)}  (${(totalBidsOk / totalBidsSent * 100).toFixed(1)}%)                  ║`);
  console.log(`║  Failed/Rejected:     ${String(totalBidsErr).padStart(6)}  (${(totalBidsErr / totalBidsSent * 100).toFixed(1)}%)                  ║`);
  console.log(`║  Outbid events:       ${String(totalOutbidSent).padStart(6)}                       ║`);
  console.log('╠══════════════════════════════════════════════════╣');

  if (stateData) {
    const expectedPrice = START_PRICE + (totalBidsOk * INCREMENT_PRICE);
    console.log(`║  Expected price:      ¥${String(expectedPrice.toFixed(2)).padStart(8)}                      ║`);
    console.log(`║  Actual price:        ¥${String(stateData.currentPrice.toFixed(2)).padStart(8)}                      ║`);
    const consistent = Math.abs(stateData.currentPrice - expectedPrice) < 0.01;
    console.log(`║  Price consistent:    ${consistent ? '✓ YES' : '✗ NO (MISMATCH!)'}                  ║`);
  }
  console.log(`║  Participants:        ${String(stateData?.participantCount || 'N/A').padStart(6)}                       ║`);
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║  LATENCY (successful bids):                      ║');
  if (roundStats.length > 0) {
    const allLats = roundStats;
    const bestRound = allLats.reduce((a, b) => a.avg < b.avg ? a : b);
    const worstRound = allLats.reduce((a, b) => a.avg > b.avg ? a : b);
    console.log(`║  Best round avg:      ${String(bestRound.avg).padStart(5)}ms  (${bestRound.users} users)              ║`);
    console.log(`║  Worst round avg:     ${String(worstRound.avg).padStart(5)}ms  (${worstRound.users} users)              ║`);
    console.log(`║  Best p99:            ${String(bestRound.p99).padStart(5)}ms                        ║`);
    console.log(`║  Worst p99:           ${String(worstRound.p99).padStart(5)}ms                        ║`);
  }
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Redis lock:          SETNX + Lua release        ║`);
  console.log(`║  Lock key:            bid:${goodsId}                        ║`);
  console.log(`║  Contention:          ${(totalBidsErr / totalBidsSent * 100).toFixed(1)}% rejected                    ║`);
  console.log(`║  Throughput:          ~${totalBidsOk / ROUNDS} bids/sec/round               ║`);
  console.log('╚══════════════════════════════════════════════════╝');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
