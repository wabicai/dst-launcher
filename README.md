# DST Launcher

基于 `Electron + Next.js + Fastify sidecar + SQLite + Docker Compose` 的《饥荒联机版》桌面启动器工程。

## 目录结构

- `apps/web`：桌面端 UI（Next.js App Router + shadcn/ui 风格组件）
- `apps/desktop`：Electron 主进程与 preload
- `apps/sidecar`：本地后台服务，负责 Docker / SSH / 配置 / 备份 / 日志
- `packages/shared`：共享类型、Schema、配置渲染器、Compose 生成器

## 常用命令

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
```

## 第一版约束

- 首发平台：macOS
- 本地模式：完整支持
- 远程模式：SSH 管理远程 Docker 的基础链路
- 底层运行时：Docker Compose
