# 实时竞拍大师 — 技术选型与问题对策

> 面向答辩的技术文档，记录关键架构决策和解决过的重大问题。

---

## 一、项目架构总览

```
直播画面(video loop) ──→ 客户端(frontend :5173) ──→ WebSocket(:3001) ──→ 竞拍引擎 ──→ MySQL + Redis
                                  │                        │
                          商家后台(admin :3002) ──→ REST API(:3000) ──→ CRUD + 订单
```

- **客户端**：React 18 + antd-mobile，面向最终用户参与竞拍
- **商家后台**：React 18 + antd，面向商家管理商品/订单/控制台
- **后端**：Go + Gin，统一服务两端的 REST 和 WebSocket
- **存储**：MySQL 8.4（业务数据）+ Redis（竞拍状态 + 分布式锁）

---

## 二、技术选型

### 2.1 后端框架：Gin

| 候选 | 淘汰理由 |
|------|----------|
| **Gin（选用）** | 高性能 radix tree 路由，中间件链式调用，社区最活跃 |
| Fiber | 类 Express API 但基于 fasthttp（不支持 HTTP/2），生态不如 Gin |
| Echo | 功能类似但社区规模较小 |
| net/http | 标准库无路由分组、无中间件模型，手写成本高 |

### 2.2 实时通信：gorilla/websocket

- **房间广播模型**：每个竞拍对应 `auction:{goodsId}` 房间，Client 加入/离开房间
- 心跳：服务端 30s Ping，客户端 30s 发 ping 事件，ReadDeadline 90s
- 断线重连：指数退避（1s → 2s → 4s → ... → 30s 上限，最多 10 次）
- **不入库消息**：出价/价格更新/倒计时同步等高频消息通过 WS 直传，不落 MySQL
- 出价记录、订单等**持久化数据走 REST API + MySQL**

### 2.3 状态管理：Redis + 自研 FSM

**为什么不选数据库轮询**：MySQL 轮询无法满足 2s 级别的倒计时精度和出价响应速度。

**自研状态机设计**：
```
状态: NOT_STARTED → ONGOING → DELAYING → ENDED
                       ↓           ↓
                    CANCELLED   CANCELLED

事件: START / BID / TIMEOUT / DELAY / CANCEL
```

- 状态数据序列化为 JSON 存在 Redis，Key: `auction:master:auction:state:{id}`
- **无状态服务**：Go 进程重启后 FSM 从 Redis 恢复，配合 DB 数据自动回补
- Transition 时原子写入 Redis，`TickTimer` 每秒由定时器驱动

### 2.4 出价原子性：Redis 分布式锁 + Lua

```
出价流程:
1. SETNX lock:bid:{goodsId} 获取锁（30s TTL，100ms 间隔重试，最多 50 次）
2. 加载 FSM → 检查状态 → Transition(BID) → 计算新价格 → 写入 Redis
3. 写入 MySQL bid_records（异步落库）
4. Lua 脚本原子释放锁（GET + DEL，防止误删他人锁）
5. BroadcastToAuctionRoom("price-updated")
```

- **为什么不用 MySQL 行锁**：出价是高频操作，MySQL 行锁竞争激烈会导致连接池耗尽
- **为什么 SETNX + Lua 而不是 Redlock**：单节点 Redis 足够，Redlock 增加复杂度且在此场景无必要

### 2.5 前端架构

| 层级 | 客户端 (frontend) | 商家后台 (admin-panel) |
|------|-------------------|----------------------|
| 框架 | React 18 + Vite | 同 |
| UI | antd-mobile（移动端优先） | antd（桌面端） |
| 状态 | Zustand（轻量无模板，5KB） | 组件内 useState |
| 动画 | Framer Motion（价格跳动/倒计时） | 无 |
| WebSocket | 自定义 socketClient（单例） | 无（仅 REST） |

**为什么分两套**：客户端面向手机用户，UI 交互完全不同；商家后台是桌面 CRUD。共享同一个 Go 后端，避免维护两套 API。

### 2.6 视频仿真方案

- 当前：`<video>` 标签循环播放本地 MP4 + LIVE 徽章脉冲动画
- 视频源：`VITE_VIDEO_URL` 环境变量注入
- 升级路径：OBS 推流 → MediaMTX(RTMP→HLS) → 前端 HLS.js 播放

---

## 三、重大 BUG 及对策

### 3.1 后端重启导致竞拍状态丢失

**现象**：Go 进程重启后，Redis 中的 FSM 数据仍在，但出价时提示"竞拍未在进行中"。

> 注：如果 Redis 也重启或 key 被清除，则问题更严重——DB 中状态为"进行中"但 Redis 无状态，FSM 初始化后停留在 NOT_STARTED，所有出价被拒绝。

**根因**：`ProcessBid` 中 FSM 从 Redis 加载失败时，重新 Initialize 到 NOT_STARTED，但没有根据 DB 中的实际状态恢复。

**对策**（[bid_service.go](../backend-go/internal/service/bid_service.go)）：
```go
// GetOrRecoverAuctionState：Redis 丢失时从 DB 恢复
// 如果 DB 显示 ONGOING，Initialize 后自动 Transition(START)
// ProcessBid 和 OnGetState 均使用此恢复逻辑
```

**教训**：缓存层（Redis）的数据应视为可重建的，关键状态应以 DB 为准，缓存丢失时从 DB 恢复。

### 3.2 React StrictMode 导致 WebSocket 竞态

**现象**：进入竞拍房间后出价按钮不显示，控制台反复出现"连接成功→无法发送消息→连接成功"。

**根因**：React StrictMode（开发环境）双重挂载组件，两次 `getDevToken()` Promise 几乎同时 resolve，第二次 `connect()` 将 `this.ws` 覆盖为新的 CONNECTING 状态的连接。第一次连接的 `onopen` 触发时，`this.ws` 已指向第二次连接（尚未 OPEN），`send()` 检查 `readyState !== OPEN` 直接 return。

**对策**（[socketClient.ts](../frontend/src/websocket/socketClient.ts)）：
```typescript
connect() {
    // 同时检查 OPEN 和 CONNECTING 状态，防止覆盖正在建立的连接
    if (this.ws?.readyState === WebSocket.OPEN ||
        this.ws?.readyState === WebSocket.CONNECTING) return
    // ...
}
```

**教训**：WebSocket 单例模式下，`connect()` 必须是幂等的——不能因为重复调用而创建多个底层连接。

### 3.3 出价按钮不显示（双因素）

此问题涉及两个独立根因，需同时修复：

| # | 根因 | 触发条件 | 对策 |
|---|------|----------|------|
| 1 | WebSocket 已连接时不发 join-auction-room | 从首页跳转到房间时 WS 已连着，`connected` 事件不再触发 | 已连接则直接 join，不等待 connected |
| 2 | StrictMode 竞态（见 3.2） | 开发环境首次进入房间 | connect() 幂等化 |

---

## 四、架构经验教训

1. **缓存是加速层，DB 是真相源**：Redis 数据丢失不能影响业务正确性
2. **WebSocket 单例要幂等**：connect/send/join 任一操作都应允许重复调用
3. **分离客户端和商家端**：虽共享后端但独立部署，避免交叉影响
4. **开发环境不等于生产**：StrictMode 双重挂载等行为只在 dev 出现，需要在 dev 下充分测试
5. **FSM 优于 if-else**：竞拍生命周期复杂（延时/封顶价/取消），状态机让状态转移显式化、可测试
