import http from 'http';

const API = '/api';
const HOST = process.env.HOST || 'localhost';
const PORT = parseInt(process.env.PORT) || 3000;

const apiGet = (path, token) => new Promise((resolve) => {
  const headers = {};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const req = http.request({ hostname: HOST, port: PORT, path: API + path, method: 'GET', headers }, (res) => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      try { resolve({ code: res.statusCode, data: JSON.parse(d) }); }
      catch (e) { resolve({ code: res.statusCode, data: d }); }
    });
  });
  req.on('error', () => resolve({ code: 0, data: null }));
  req.setTimeout(5000, () => { req.destroy(); resolve({ code: 0, data: null }); });
  req.end();
});

const apiGetRaw = (path) => new Promise((resolve) => {
  const req = http.request({ hostname: HOST, port: PORT, path, method: 'GET' }, (res) => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => resolve({ code: res.statusCode }));
  });
  req.on('error', () => resolve({ code: 0 }));
  req.setTimeout(5000, () => { req.destroy(); resolve({ code: 0 }); });
  req.end();
});

const apiPost = (path, body) => new Promise((resolve) => {
  const data = JSON.stringify(body || {});
  const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
  const req = http.request({ hostname: HOST, port: PORT, path: API + path, method: 'POST', headers }, (res) => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      try { resolve({ code: res.statusCode, data: JSON.parse(d) }); }
      catch (e) { resolve({ code: res.statusCode, data: d }); }
    });
  });
  req.on('error', () => resolve({ code: 0, data: null }));
  req.setTimeout(5000, () => { req.destroy(); resolve({ code: 0, data: null }); });
  req.write(data);
  req.end();
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ─────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const CONCURRENCY = parseInt(args[0]) || 100;
  const DURATION_SEC = parseInt(args[1]) || 30;
  const endpoint = args[2] || 'all'; // health|rooms|auctions|sequence|detail|all

  console.log('═══════════════════════════════════════');
  console.log('  READ Endpoint Stress Test');
  console.log('═══════════════════════════════════════');
  console.log(`  Concurrency: ${CONCURRENCY}  |  Duration: ${DURATION_SEC}s`);
  console.log(`  Endpoint: ${endpoint}`);
  console.log(`  Target: http://${HOST}:${PORT}`);
  console.log('═══════════════════════════════════════\n');

  // ── Setup: get tokens ──
  console.log('[Setup] Generating user tokens...');
  const adminRes = await apiPost('/auth/dev-token?username=read_admin&role=admin');
  const adminToken = adminRes.data?.data?.accessToken || adminRes.data?.accessToken;
  if (!adminToken) { console.error('Failed to get admin token:', JSON.stringify(adminRes).substring(0,100)); process.exit(1); }

  // Pre-warm: get a list of auction IDs to use for detail queries
  const auctionsRes = await apiGet('/auctions?pageSize=50', adminToken);
  const list = auctionsRes.data?.data?.list || auctionsRes.data?.list || [];
  const auctionIds = list.map(g => g.id);
  console.log(`  Found ${auctionIds.length} auctions for detail queries\n`);

  const tokens = [];
  for (let i = 1; i <= CONCURRENCY; i++) {
    const res = await apiPost(`/auth/dev-token?username=read_user_${i}&role=user`);
    const tok = res.data?.data?.accessToken || res.data?.accessToken;
    if (tok) tokens.push(tok);
  }
  console.log(`  Generated ${tokens.length} user tokens\n`);

  // ── Test endpoints configuration ──
  const endpoints = {
    health: {
      label: 'GET /health',
      fn: () => apiGetRaw('/health'),
      needsAuth: false,
    },
    rooms: {
      label: 'GET /api/merchants/rooms',
      fn: (token) => apiGet('/merchants/rooms', token),
      needsAuth: true,
    },
    auctions: {
      label: 'GET /api/auctions?pageSize=50',
      fn: (token) => apiGet('/auctions?pageSize=50', token),
      needsAuth: true,
    },
    sequence: {
      label: 'GET /api/auctions/sequence',
      fn: (token) => apiGet('/auctions/sequence', token),
      needsAuth: true,
    },
    detail: {
      label: 'GET /api/auctions/:id',
      fn: (token) => auctionIds.length > 0
        ? apiGet(`/auctions/${auctionIds[Math.floor(Math.random() * auctionIds.length)]}`, token)
        : Promise.resolve({ code: 404, data: null }),
      needsAuth: true,
    },
  };

  const targets = endpoint === 'all'
    ? ['health', 'rooms', 'auctions', 'sequence', 'detail']
    : [endpoint];

  // ── Run tests ──
  for (const key of targets) {
    const ep = endpoints[key];
    console.log(`\n[${ep.label}]`);
    console.log('─'.repeat(60));

    const latencies = [];
    let ok = 0, fail = 0;
    const startTime = Date.now();
    const deadline = startTime + DURATION_SEC * 1000;
    let running = true;

    const worker = async (workerId) => {
      const token = tokens[workerId % tokens.length];
      while (running) {
        const t0 = Date.now();
        const result = ep.needsAuth ? await ep.fn(token) : await ep.fn();
        const lat = Date.now() - t0;
        latencies.push(lat);
        if (result.code === 200) ok++; else fail++;
        // Small jitter to avoid thundering herd
        await sleep(Math.random() * 10);
      }
    };

    // Launch workers
    const workers = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      workers.push(worker(i));
    }

    // Progress report every 5 seconds
    const progressTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const total = ok + fail;
      const rps = total / Math.max(elapsed, 1);
      process.stdout.write(`  ${elapsed}s | req:${total} | ok:${ok} | fail:${fail} | rps:${rps.toFixed(0)}\r`);
    }, 5000);

    // Wait for duration
    await sleep(DURATION_SEC * 1000);
    running = false;
    await Promise.all(workers);
    clearInterval(progressTimer);

    const elapsed = (Date.now() - startTime) / 1000;
    const total = ok + fail;
    const rps = total / elapsed;

    // Calculate percentiles
    latencies.sort((a, b) => a - b);
    const avg = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
    const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
    const min = latencies[0] || 0;
    const max = latencies[latencies.length - 1] || 0;

    console.log(`\n  ┌─────────────────────────────────────┐`);
    console.log(`  │  ${ep.label.padEnd(35)}│`);
    console.log(`  ├─────────────────────────────────────┤`);
    console.log(`  │  Requests:    ${String(total).padStart(8)}                  │`);
    console.log(`  │  OK (200):    ${String(ok).padStart(8)}  (${(ok/total*100).toFixed(1)}%)            │`);
    console.log(`  │  Failed:      ${String(fail).padStart(8)}  (${(fail/total*100).toFixed(1)}%)            │`);
    console.log(`  │  Duration:    ${String(elapsed.toFixed(1)).padStart(8)}s                 │`);
    console.log(`  │  Throughput:  ${String(rps.toFixed(1)).padStart(8)} req/s            │`);
    console.log(`  ├─────────────────────────────────────┤`);
    console.log(`  │  LATENCY                              │`);
    console.log(`  │  Avg:  ${String(avg.toFixed(2)).padStart(8)} ms                      │`);
    console.log(`  │  Min:  ${String(min).padStart(8)} ms                      │`);
    console.log(`  │  P50:  ${String(p50).padStart(8)} ms                      │`);
    console.log(`  │  P95:  ${String(p95).padStart(8)} ms                      │`);
    console.log(`  │  P99:  ${String(p99).padStart(8)} ms                      │`);
    console.log(`  │  Max:  ${String(max).padStart(8)} ms                      │`);
    console.log(`  └─────────────────────────────────────┘`);
  }

  // ── Summary ──
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║         READ STRESS TEST COMPLETE        ║');
  console.log('╚══════════════════════════════════════════╝');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
