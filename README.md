# StrategicInteractionLab · 博弈对抗实验平台

Full-stack playground (Node/Express + SQLite + React/Vite) for authentication, arena simulations, evaluation dashboards, and a CPU-friendly deep RL demo. 一个涵盖认证、对抗仿真、批量评估以及强化学习训练展示的全栈示例。

## 功能亮点 · Highlights
- **多场景 Arena**：Rock-Paper-Scissors / Matching Pennies / Prisoner’s Dilemma 的在线学习、Socket.IO 可视化，以及逐步决策记录下载。
- **Batch Eval Suite**：批量种子 +  episode 评估，支持柱状/折线图、直方图和逐步动作导出，方便策略对比。
- **Research Notes**：个人化记事本 API 与 UI，用于记录仿真结论。
- **Deep RL Trainer**：新增 RL 页面，利用自博弈策略梯度（policy gradient）在 CPU 上快速训练小模型并导出策略 JSON。
- **认证 / Auth**：邮箱+密码登录、受保护路由、Axios 拦截器。

## 开发启动 · Getting Started
1. **复制环境变量 / Copy envs**
   - 根目录 root: `cp .env.example .env`
   - 后端 server: `cp server/.env.example server/.env`
   - 设置 `JWT_SECRET`（开发可沿用示例值）
2. **安装依赖 / Install deps**
   - `npm install`
3. **启动开发 / Run dev**
   - `npm run dev`（并行启动 server + client）
4. **访问地址 / URLs**
   - Frontend: http://localhost:5173
   - Backend: http://localhost:4000
5. **测试账号 / Seed account**
   - `test@example.com` / `123456`

> Root `postinstall` 会尝试自动安装 `server` 与 `client` 依赖；若已手动安装，可忽略该步骤。  
> The root `postinstall` script tries to install server/client deps automatically; safe to ignore if they’re already installed.

## 脚本 · Scripts
- `npm run dev` – concurrently run Express API + Vite dev server.
- `npm --prefix server run build` – TypeScript compile for backend.
- `npm --prefix client run build` – Vite production build.

## 目录概览 · Structure
```
client/   React + Vite 前端
server/   Node/Express + SQLite 后端
```

欢迎在此基础上扩展更多博弈场景、分布式训练、数据接入等模块，以贴合课程“大规模并行深度强化学习”目标。Feel free to extend with richer scenarios, distributed training, or real data sources to match industrial-scale requirements.
