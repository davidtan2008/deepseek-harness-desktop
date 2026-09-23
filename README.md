# DeepSeek Harness Desktop

[![CI](https://github.com/davidtan2008/deepseek-harness-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/davidtan2008/deepseek-harness-desktop/actions/workflows/ci.yml)

跨平台 AI IDE（macOS / Windows / Linux）：Agent 内核是上游 [DeepSeek Harness](https://www.deepseek.com/harness/)，桌面层提供 Cursor 风格的工作台——资源管理器、Monaco 多 Tab 编辑器、集成终端、Git 面板、命令面板、`Cmd/Ctrl+K` 行内编辑、MCP 配置与 Rules / Skills。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/design.md](docs/design.md) | 原型设计、架构决策、技术选型与 P0–P3 落地路线图 |
| [docs/architecture.md](docs/architecture.md) | 实际架构：进程模型、IPC 契约、服务层、Host 生命周期 |
| [docs/user-guide.md](docs/user-guide.md) | 安装、快捷键、功能说明与常见问题 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 开发环境、提交规范、submodule 更新 SOP、发布流程 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更记录 |
| [SECURITY.md](SECURITY.md) | 安全设计与漏洞报告方式 |

## 架构

```
Electron Main  ──spawn──►  dsh web (Harness Host, 子进程)
       │                         │
       │ IPC                     │ loopback HTTP + cookie
       ▼                         ▼
  Workbench renderer ◄──webview── Agent UI (dsh-client)
```

- 主进程不执行工具、不改会话日志，只负责窗口、菜单、IPC 白名单和拉起 Host。
- Renderer 无 Node 集成，只通过 preload 暴露的白名单 API 访问系统能力。
- Agent 内核完整复用上游 Harness（四种 Agent 模式、Trajectory、Skills、审批、沙箱），以 `--patch` overlay 方式注入桌面配置，不做 fork。

## 仓库结构

```
deepseek-harness-desktop/
├── apps/
│   ├── shell/               # Electron 主进程 + preload（TypeScript, esbuild 打包）
│   └── workbench/           # 渲染进程工作台（React 18 + Vite 6 + Monaco + xterm）
├── packages/
│   ├── shared/              # 主进程 ↔ 渲染进程共享的类型与协议
│   └── desktop-profile/     # dsh profile overlay（cordis.patch.yml）
├── harness/                 # 上游 deepseek-harness（git submodule，锁 commit）
├── docs/                    # design / architecture / user-guide
└── .github/                 # 三平台 CI（macOS / Ubuntu / Windows）+ PR 模板
```

## 环境要求

- Node.js 22.19+（与 Harness `engines` 对齐；Host 用本机 Node 运行，不使用 Electron 内嵌 Node）
- pnpm 10+（仓库通过 `packageManager` 字段锁定 `pnpm@10.14.0`，可用 `corepack` 自动匹配）
- 若 Electron 二进制下载超时（常见于国内网络），设置镜像后再装：

```sh
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
```

## 快速开始

```sh
git clone --recursive git@github.com:davidtan2008/deepseek-harness-desktop.git
cd deepseek-harness-desktop

# 1. 安装桌面端依赖
pnpm install

# 2. 初始化上游 Harness 子模块（Agent Host 运行时）
cd harness
pnpm install && pnpm run build
cd ..

# 3. 启动开发模式（Vite 工作台 + Electron 壳）
pnpm dev
```

`pnpm dev` 会同时拉起 Vite 工作台（`127.0.0.1:5173`）和 Electron 壳，并以子进程启动 Harness Host：

```sh
node --import tsx/esm apps/cli/src/bin.ts web --no-open --port 0
```

### Harness 路径解析

主进程按以下顺序探测 Harness 根目录（要求其中已执行过 `pnpm install`）：

1. 环境变量 `DHD_HARNESS_ROOT`
2. 仓库内子模块 `harness/`（已安装依赖时优先）
3. 旧版同级布局 `<仓库上级目录>/deepseek/deepseek-harness`
4. 打包产物 `resources/harness`

也可用 `DHD_HARNESS_URL` 直接复用一条已在运行的 `dsh web` URL（含 `?token=`），此时桌面端不再自行拉起 Host。

> `--patch` 必须紧跟 `web`，不能放在 `--no-open` 后面（否则 web 应用会报 `unknown option '--patch'`）。桌面端使用 `--port 0`，不会与已在 3080 端口运行的 `dsh web` 抢端口。

## 打包分发

```sh
pnpm pack          # 当前平台
pnpm pack:mac
pnpm pack:win
pnpm pack:linux
```

产物在 `release/`。安装包不捆绑完整 Harness monorepo；运行时仍需要本机 Node 22 拉起 Host（或使用 `DHD_HARNESS_URL` 连接已有 Host）。

## 功能对照

| 能力 | 实现 |
|---|---|
| 四种 Agent 模式 / Trajectory / Skills / 审批 | Agent 槽位加载完整 `dsh web` |
| 文件树 / Monaco 多 Tab / 保存 | 工作台 |
| 集成终端 | xterm + node-pty（失败则管道 shell） |
| Git 状态 / 暂存 / 提交 / 推送 | 源代码管理 |
| 内容与文件搜索 | ripgrep，否则文件系统回退 |
| Cmd+P / Cmd+Shift+P | 快开与命令面板 |
| Cmd+K 行内编辑 | DeepSeek API，补丁写回编辑器 |
| 发送选区到 Agent | 剪贴板 + 尝试注入 composer |
| MCP 配置 | `~/.dsh/desktop-mcp.patch.yml` |
| Rules / Skills | 打开 AGENTS.md 与 skill 目录 |
| API Key | `safeStorage` + 同步 `~/.dsh/.credentials.yaml` |
| 多窗口 / 菜单 / 单实例 | Electron 壳 |

## 环境变量

| 变量 | 作用 |
|---|---|
| `DHD_HARNESS_ROOT` | 显式指定 Harness 源码根目录（优先级最高） |
| `DHD_HARNESS_URL` | 复用已运行的 `dsh web` 完整 URL（含 token） |
| `DHD_NODE` | 显式指定拉起 Host 用的 Node 可执行文件 |
| `DSH_HOME` | Harness 数据目录（默认 `~/.dsh`） |
| `ELECTRON_MIRROR` | Electron 二进制下载镜像 |

## 许可证

[MIT](LICENSE)。上游 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 以其自身许可证发布（见 `harness/LICENSE`）。
