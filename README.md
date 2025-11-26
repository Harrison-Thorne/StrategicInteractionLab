# StrategicInteractionLab · 博弈对抗实验平台

## 一、项目概述

StrategicInteractionLab 是一个面向“博弈对抗决策智能体训练”课设的全栈示例，融合了 Node/Express + SQLite 后端与 React/Vite 前端。项目聚焦于以下能力：

- **博弈场景配置**：提供 RPS / Matching Pennies / Prisoner’s Dilemma 等对抗场景，可作为复杂场景扩展基础。
- **数据接入与可视化**：Arena 页面通过 Socket.IO 推送对抗过程，Eval 页面展示批量实验统计，支持逐步决策导出。
- **算法配置与训练**：Arena/ Eval 支持 Hedge / Regret / Fictitious Play；RL 页面新增自博弈策略梯度训练示例（CPU 友好），并提供“分布式演示”多 worker 聚合训练，便于展示并行训练流程。
- **性能对比与部署示例**：Eval/RL 均提供可视化曲线、直方图、日志导出，方便对比不同配置；后端暴露 REST API，便于集成部署。

---

## 二、功能一览

| 模块 | 描述 |
| ---- | ---- |
| 认证/Auth | 邮箱 + 密码登录，前端受保护路由，Axios 拦截器自动重定向 |
| Dashboard | 登录问候 + 场景介绍 |
| Arena | 在线学习仿真，包含概率轨迹、热力图、逐步决策轨迹（可下载 CSV） |
| Notes | 研究笔记 CRUD |
| Eval | 批量实验（多种种子/episode），展示摘要统计、逐步动作、直方图，支持 CSV 导出 |
| RL Train | 自博弈策略梯度训练（Policy Gradient），CPU 运行，提供参数配置、训练曲线、策略 JSON 下载；支持“分布式演示”多 worker 聚合 |

---

## 三、开发环境准备

1. **复制环境变量**
   ```bash
   cp .env.example .env
   cp server/.env.example server/.env
   # 可修改 JWT_SECRET、数据库路径等
   ```
2. **安装依赖**
   ```bash
   npm install
   ```
3. **启动开发模式**
   ```bash
   npm run dev
   ```
   - 该命令通过 concurrently 同时启动 `server` (Express) 与 `client` (Vite)。
4. **访问地址**
   - 前端：http://localhost:5173
   - 后端 API：http://localhost:4000
5. **默认账号**
   - 邮箱：`test@example.com`
   - 密码：`123456`

> 根目录 `postinstall` 会尝试自动安装 `server` / `client` 依赖；若已手动安装，可忽略。

---

## 四、生产构建与部署

1. **分别构建**
   ```bash
   npm --prefix server run build   # 生成 dist/index.js
   npm --prefix client run build   # 生成 dist 静态资源
   ```
2. **生产运行（示例）**
   ```bash
   # 1) 启动后端
   npm --prefix server run start

   # 2) 部署前端
   #   - `client/dist` 可交由任意静态资源服务器托管（Nginx、Vercel 等）
   #   - 若需同域部署，可在 Express 中挂载 dist
   ```
3. **环境变量（后端）**
   - `PORT`：默认 4000
   - `JWT_SECRET`：JWT 密钥
   - `DB_PATH`（可在 `.env` 中扩展）：SQLite 存储位置
4. **数据库迁移**
   - 服务器启动时自动执行 `ensureMigrations()`（含用户、笔记、评估、总结表）。

---

## 五、页面使用指南

### 1. Arena（在线仿真）
1. 登录后访问 `/arena`
2. 选择 Game/Steps/Seed/Learning Rate，可切换是否使用后端 Socket 模式
3. 点击 Start 运行；可随时 Stop、Reset
4. “Decision Trace” 区域支持查看每个时间步双方动作，并导出 CSV

### 2. Eval（批量评估）
1. 输入游戏、两侧算法、Seeds、Episodes、Steps/Ep、lr 等
2. 点击 “Run Eval”，等待 Summary/Charts/Trace 加载
3. Trace 卡片可按 Seed + Episode 查看逐步动作，并下载 CSV

### 3. RL Train（深度强化学习示例 + 分布式演示）
1. 访问 `/rl`
2. 配置 Game、Episodes、Steps、Learning Rate、Hidden Size、Seed
3. 如需并行演示，勾选 “Distributed demo”，设置 Workers 数量（默认 4），将启动多 worker 训练并聚合曲线
4. 点击 Train，查看 Reward/Win 曲线（分布式模式显示聚合结果）
5. 可下载 JSON（单机模式下载单次策略；分布式模式下载聚合信息和各 worker 运行 ID）

### 4. Notes
1. 访问 `/notes`
2. 录入实验记录，支持删除

---

## 六、目录结构
```
client/        React + Vite + TypeScript 前端
  src/pages    Dashboard / Arena / Eval / RL / Notes / Login
  src/auth     AuthContext、RequireAuth
  src/components Navbar 等

server/        Node + Express + SQLite 后端
  src/auth     登录/鉴权
  src/arena    Socket 仿真
  src/eval     批量评估
  src/rl       强化学习训练
  src/notes    笔记 API
```

---

## 七、可扩展方向
- 增加战场级别复杂场景，接入真实态势数据
- 引入分布式训练（Ray、RLlib、PettingZoo 等）
- 构建部署流水线：模型存储、服务化推理
- 完善性能对比（更多指标、可视化、A/B 对照）

---

# StrategicInteractionLab · Game-Theoretic ML Lab

## 1. Overview

StrategicInteractionLab is a Node/Express + SQLite + React/Vite stack tailored for game-theoretic decision-making coursework. It showcases:

- **Scenario configuration** via predefined matrix games (RPS, Matching Pennies, Prisoner’s Dilemma).
- **Data ingestion & visualization** – Arena streams live learning dynamics; Eval aggregates batch experiments with rich charts and CSV exports.
- **Algorithm configuration & training** – Hedge/Regret/FP for online learning; a CPU-friendly policy-gradient self-play demo (RL page) with an optional “distributed demo” that runs multiple workers and aggregates their curves to illustrate parallel training.
- **Performance comparison & deployment hooks** – Visual metrics, downloadable logs/policies, REST APIs for integration.

## 2. Feature Matrix

| Module | Description |
| ------ | ----------- |
| Auth | Email/password login + protected routes, Axios interceptor |
| Dashboard | Welcome screen |
| Arena | Online learning sim (probability trajectories, heatmaps, decision trace + CSV) |
| Notes | Personal notebook CRUD |
| Eval | Batch evaluation across seeds/episodes, summary stats, full traces, CSV export |
| RL Train | Self-play policy-gradient (two-layer nets) with configurable hyperparams and JSON policy export; optional multi-worker aggregated “distributed demo” |

## 3. Development Setup

1. **Environment variables**
   ```bash
   cp .env.example .env
   cp server/.env.example server/.env
   ```
   Populate `JWT_SECRET`, DB paths, etc.
2. **Install dependencies**
   ```bash
   npm install
   ```
3. **Run dev servers**
   ```bash
   npm run dev
   ```
   This concurrently launches Express (http://localhost:4000) and Vite (http://localhost:5173).
4. **Seed account**
   - Email: `test@example.com`
   - Password: `123456`

> Root `postinstall` auto-installs server/client deps; ignore if you already ran `npm install` manually.

## 4. Production Build & Deployment

1. **Build**
   ```bash
   npm --prefix server run build
   npm --prefix client run build
   ```
2. **Serve**
   - Backend: `npm --prefix server run start`
   - Frontend: host `client/dist` on any static server (Nginx, Netlify, etc.) or mount inside Express for single-domain hosting.
3. **Environment variables**
   - `PORT` (default 4000), `JWT_SECRET`, optional DB path via `.env`.
4. **Migrations**
   - `ensureMigrations()` runs automatically on server boot, creating tables for users, notes, eval_runs, eval_metrics, eval_summaries.

## 5. Usage Guide

### Arena
1. Navigate to `/arena`.
2. Configure game/steps/seed/learning rate; toggle backend Socket mode if desired.
3. Start → monitor reward/probability/heatmap charts; use Decision Trace panel to inspect every timestep and download CSV.

### Eval
1. Fill in game, algorithms (A/B), seeds, episodes, steps/episode, learning rate.
2. Run evaluation; wait for summary + metrics + trace.
3. Trace card lets you filter by seed/episode and export step-by-step actions.

### RL Train
1. Open `/rl`.
2. Pick game, episodes, steps/episode, learning rate, hidden size, seed.  
   - To demonstrate parallelism, check “Distributed demo” and set `workers` (default 4); the backend runs multiple workers with different seeds and aggregates results.
3. Press Train; view reward/win curves (aggregated if distributed) and download final policy JSON that contains weights/config/logs (single-run or aggregated metadata).

### Notes
1. `/notes` allows quick logging of experiment observations; includes delete controls.

## 6. Repository Layout

```
client/
  src/pages      Dashboard, Arena, Eval, RL, Notes, Login
  src/auth       AuthContext, RequireAuth
  src/components Navbar, etc.

server/
  src/auth       Authentication routes
  src/arena      Socket-driven online learning engine
  src/eval       Batch evaluation pipeline
  src/rl         Policy-gradient trainer + API
  src/notes      Notes CRUD
```

## 7. Extension Ideas

- Add richer war-game environments or integrate external telemetry feeds.
- Hook into distributed RL frameworks (Ray/RLlib, PettingZoo) for large-scale training.
- Introduce model registry + deployment endpoints for serving trained agents.
- Expand evaluation dashboards (ROC-style comparisons, scenario filtering, automated reporting).

---

Happy hacking!

MIAO YAN
