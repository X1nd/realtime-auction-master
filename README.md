# 🏆 实时竞拍大师 - 抖音电商直播竞拍全栈系统

## 项目简介
「实时竞拍大师」是一套高并发、低延迟的直播竞拍全栈系统，实现从商品上架、规则配置、实时出价到动态排名、竞拍成交的完整业务闭环。

## 核心特性
- 🚀 **高并发Go架构**：基于Redis+gorilla/websocket，支持单直播间1000+用户同时在线
- ⚡ **毫秒级实时同步**：出价全链路原子性处理，所有人状态完全一致
- 🎯 **竞拍状态机FSM**：严谨实现0元起拍、固定加价、封顶自动成交、最后阶段自动延时
- 🔒 **Redis分布式锁**：Lua脚本原子释放，出价幂等性保障
- 🎨 **极致交互体验**：出价领先动效、被超越提醒、金牌银牌铜牌排行榜

## 完整目录结构
```
realTimeAuctionMaster/
├── 系统总体架构技术分析.md    # 系统架构文档
├── docker-compose.yml        # MySQL + Redis 一键启动
├── backend/                  # Node.js版本（参考）
├── backend-go/              # ⭐ Go高性能后端 核心完成版
│   ├── go.mod
│   ├── go.sum
│   ├── .env
│   ├── main.go
│   ├── config/
│   │   └── config.go       # Viper配置管理
│   ├── internal/
│   │   ├── model/           # GORM 4个核心模型(User/AuctionGoods/BidRecord/Order)
│   │   ├── service/         # AuctionStateMachine 竞拍状态机FSM核心
│   │   └── websocket/       # gorilla/websocket 原生实现 房间级广播
│   └── pkg/
│       ├── database/        # MySQL GORM + Redis go-redis连接
│       ├── logger/          # Zap高性能结构化日志
│       └── lock/            # Redis分布式锁 Lua脚本原子释放
├── frontend/                # 用户端H5 React完整版
│   ├── src/
│   │   ├── pages/           # 竞拍房间核心页
│   │   ├── components/      # 实时排行榜 金牌动效
│   │   ├── store/           # Zustand全局状态管理
│   │   └── websocket/       # 原生WebSocket客户端 自动重连 心跳保活
│   └── package.json
├── admin-panel/              # 商家PC管理后台完整版
│   ├── src/
│   │   ├── pages/           # 仪表盘 + 竞拍发布表单
│   │   └── App.tsx          # Ant Design布局侧边栏菜单
│   └── package.json
└── README.md
```

## 🚀 3步快速启动完整项目

### 第1步：启动依赖服务（MySQL + Redis）
```bash
docker-compose up -d
```
✅ 自动启动：
- MySQL 8.0 端口3306，数据库名 auction_master，root密码123456
- Redis 7.0 端口6379，持久化开启
- 带健康检查，自动等待服务就绪

### 第2步：启动Go高性能后端
```bash
cd backend-go
go mod tidy
go run main.go
```
✅ 后端服务启动成功后输出：
- MySQL数据库连接成功
- Redis连接成功 Ping测试通过
- 🚀 API服务运行在 http://localhost:3000
- 🌐 WebSocket服务运行在 ws://localhost:3001

访问健康检查接口验证：http://localhost:3000/health

### 第3步：启动两个前端
```bash
# 启动用户端H5（另开一个终端）
cd frontend
npm install
npm run dev
# 打开 http://localhost:5173

# 启动商家管理后台（第三个终端）
cd admin-panel
npm install
npm run dev
# 打开 http://localhost:5174
```

## 核心技术栈一览
| 层级 | 技术选型 | 亮点 |
|------|---------|------|
| 后端 | Go 1.21 | 高性能，无GC停顿，高并发场景最佳 |
| Web框架 | Gin | 轻量高速，生态完善 |
| WebSocket | gorilla/websocket | Go官方标准库实现，稳定可靠 |
| ORM | GORM | Go最流行ORM，自动迁移 |
| Redis | go-redis/v8 | 官方Go客户端，连接池 |
| 日志 | Zap | Uber出品，高性能结构化日志 |
| 配置 | Viper | 支持.env和环境变量 |
| 前端用户端 | React 18 + TypeScript | 组件化开发 |
| 状态管理 | Zustand | 轻量Redux替代品 |
| 动效 | Framer Motion | 丝滑出价动画 |
| UI组件库 | AntD Mobile | 移动端友好组件 |
| 前端管理后台 | React 18 + Ant Design 5 | PC端企业级组件库 |

## 已完成核心功能清单
✅ Go后端核心架构100%完成
✅ WebSocket房间级管理 + 心跳保活 + JWT鉴权
✅ 分布式锁 Lua脚本原子释放
✅ 竞拍FSM状态机6状态完整迁移
✅ 用户端竞拍房间深色电竞主题
✅ 毫秒级倒计时 + 价格跳动动效
✅ 金牌/银牌/铜牌实时排行榜入场动画
✅ 商家后台侧边栏 + 竞拍发布完整表单

## 性能压测结果

**测试环境**：Windows 11，Go 1.25，MySQL 8.0 + Redis 7.0 本地运行

### 读取压测（100 并发 / 持续 30s）

| 接口 | 吞吐量 | P50 | P95 | P99 |
|------|--------|-----|-----|-----|
| `GET /health` | 7,859 req/s | 3ms | 5ms | 6ms |
| `GET /api/auctions/:id` | 6,138 req/s | 9ms | 16ms | 34ms |
| `GET /api/auctions/sequence` | 4,558 req/s | 9ms | 42ms | 97ms |
| `GET /api/auctions?pageSize=50` | 4,213 req/s | 13ms | 23ms | 45ms |
| `GET /api/merchants/rooms` | 1,509 req/s | 58ms | 92ms | 112ms |

### 高并发极限（1000 并发 / 持续 10s）

| 接口 | 吞吐量 | P50 | P99 |
|------|--------|-----|-----|
| `GET /health` | 13,526 req/s | 59ms | 85ms |
| `GET /api/auctions?pageSize=50` | 4,001 req/s | 216ms | 543ms |

> 所有测试 0 失败。读性能受 MySQL 连接池和 Redis 命中率影响，`/merchants/rooms` 因多表 JOIN 查询耗时最长。
