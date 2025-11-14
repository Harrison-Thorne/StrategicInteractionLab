# StrategicInteractionLab

一个包含 Node/Express + SQLite 认证示例的全栈项目脚手架。

## 开发启动
- 复制环境变量示例：
  - 根目录：将 `.env.example` 复制为 `.env`
  - 后端：将 `server/.env.example` 复制为 `server/.env`
  - 将 `JWT_SECRET` 设置为你自己的值（开发可使用示例）
- 安装依赖：
  - 在项目根目录运行：`npm install`
- 启动开发：
  - 运行：`npm run dev`
- 默认地址：
  - 前端：http://localhost:5173
  - 后端：http://localhost:4000
- 预置账号：`test@example.com` / `123456`

> 提示：根目录 `postinstall` 会尝试为 `server`（和可选的 `client`）安装依赖。
