# DST Launcher

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Platform: macOS](https://img.shields.io/badge/Platform-macOS-lightgrey?logo=apple)](https://github.com/wabicai/dst-launcher/releases)
[![Release](https://img.shields.io/github/v/release/wabicai/dst-launcher?include_prereleases)](https://github.com/wabicai/dst-launcher/releases)

> A desktop launcher for Don't Starve Together dedicated servers — manage Docker/SSH servers, mods, and real-time logs from a single native app.
>
> 《饥荒联机版》专属桌面启动器 —— 在一个原生应用中管理 Docker/SSH 服务器、Mod 及实时日志。

---

## Features / 功能特性

- **Server Management / 服务器管理** — Start, stop, and configure DST dedicated servers via local Docker or remote SSH
- **Mod Management / Mod 管理** — Browse, enable/disable, and configure Workshop mods with live preview
- **Real-time Logs / 实时日志** — Stream server console output with filtering and search
- **Multi-cluster / 多集群** — Manage Overworld + Caves clusters independently
- **macOS Native / 原生 macOS** — Built with Electron, feels like a first-party app

---

## Architecture / 架构

| Package | Description |
|---------|-------------|
| `apps/web` | Desktop UI — Next.js App Router + shadcn/ui |
| `apps/desktop` | Electron main process & preload scripts |
| `apps/sidecar` | Local backend — Docker / SSH / config / logs (Fastify + SQLite) |
| `packages/shared` | Shared types, schemas, config renderer, Compose generator |

---

## Prerequisites / 环境要求

| Requirement | Version |
|-------------|---------|
| macOS | 13 Ventura+ |
| Node.js | ≥ 22 |
| pnpm | ≥ 10 |
| Docker Desktop | latest |

---

## Quick Start / 快速开始

```bash
# Install dependencies / 安装依赖
pnpm install

# Start development / 启动开发环境
pnpm dev

# Run tests / 运行测试
pnpm test

# Build all packages / 构建所有包
pnpm build
```

---

## Build & Distribution / 打包分发

```bash
# Build and package as DMG / 构建并打包为 DMG
pnpm dist
```

Output / 产物: `apps/desktop/dist/DST Launcher-<version>-arm64.dmg`

> **Note:** Code signing is optional for local builds. Set `CSC_IDENTITY_AUTO_DISCOVERY=false` to skip.

---

## Project Structure / 目录结构

```
dst-launcher/
├── apps/
│   ├── web/          # Next.js UI
│   ├── desktop/      # Electron shell
│   └── sidecar/      # Fastify backend
├── packages/
│   └── shared/       # Shared types & utilities
├── scripts/          # Dev/build scripts
└── tests/            # E2E & runtime smoke tests
```

---

## Contributing / 贡献指南

1. Fork the repo and create a feature branch
2. `pnpm install` and `pnpm dev` to start hacking
3. Ensure `pnpm lint` and `pnpm test` pass
4. Open a Pull Request with a clear description

Issues and PRs are welcome!

---

## License / 开源协议

[MIT](./LICENSE) © 2024 DST Launcher Contributors
