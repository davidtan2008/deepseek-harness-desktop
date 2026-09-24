# 贡献指南

感谢参与 DeepSeek Harness Desktop。项目目标是构建一个 **Harness-native、可组合、可恢复、对多个 coding agent 友好的本地 AI workbench**。开始前请先读：

- [`AGENTS.md`](AGENTS.md)：给自动化 agent 的常驻规则。
- [`docs/agent-development.md`](docs/agent-development.md)：完整的阅读顺序、并行 worktree 和交接格式。
- [`docs/architecture.md`](docs/architecture.md)：当前进程和 contract 真源。
- [`docs/support-matrix.md`](docs/support-matrix.md)：哪些功能已经有证据。

## 环境

| 依赖 | 版本/要求 |
|---|---|
| Node.js | `^22.19.0` 或 `>=24` |
| 根 pnpm | `10.14.0`（由根 `packageManager` 锁定） |
| Harness pnpm | 以 `harness/package.json` 和其 lockfile 为准，不要与根版本混用 |
| Git | 支持 submodule 的版本 |
| 原生依赖 | node-pty 可选；未安装时会走 fallback |

## 初始化

```sh
git clone --recursive git@github.com:davidtan2008/deepseek-harness-desktop.git
cd deepseek-harness-desktop
pnpm install
cd harness && pnpm install && pnpm run build && cd ..
pnpm dev
```

如果不需要运行 Agent，可暂时不初始化 Harness；打开项目时会显示 Host 缺失提示。Electron 下载困难时：

```sh
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
pnpm install
```

## 常用命令

```sh
pnpm dev             # Vite workbench + Electron shell + Host
pnpm doctor:env      # 检查 Node、pnpm、submodule、native/runtime 前置条件
pnpm upstream:check  # 检查 Harness Desktop Host seam 和 protocol version
pnpm typecheck       # 先构建 shared，再检查所有 workspace
pnpm test:contract   # capability manifest + IPC/preload + upstream contract checks
pnpm smoke:workspace # 真实 Host workspace/session idempotency（macOS arm64）
pnpm smoke:upstream-host # 真实 upstream Host IPC lifecycle（需 Harness Desktop build）
pnpm build           # shared -> workbench -> shell
pnpm pack            # 当前平台 electron-builder
pnpm pack:mac
pnpm pack:win
pnpm pack:linux
```

外层仓库当前没有 `test`、unit 或 Playwright script。新增测试后，必须在文档中记录真实命令；不要将 `typecheck`/`build` 描述为运行时测试。

## 代码边界

- `apps/shell`：窗口、菜单、Host supervisor、fs/git/search/pty/mcp/凭证、preload 和平台 API。
- `apps/workbench`：React/Monaco/xterm UI；不能 import Electron 或 Node 私有 API。
- `packages/shared`：`protocol.ts`、`api.ts`、`capabilities.ts` 是跨进程 contract 真源。
- `packages/desktop-profile`：当前只作为资源/未来 overlay；`host.ts` 当前实际附加的是 MCP overlay，不要假设 profile 已自动加载。
- `harness/`：上游 gitlink。禁止在桌面功能分支直接修改并提交；需要上游变化时做 overlay、patch 或上游 PR。

### 新增 IPC

1. 在 `packages/shared/src/protocol.ts` 增加 channel/event 和可序列化 payload。
2. 在 `packages/shared/src/api.ts` 增加最小 Renderer API。
3. 在 `apps/shell/src/ipc.ts` 注册 Main handler。
4. 在 `apps/shell/src/preload.ts` 暴露明确方法，禁止通用 `invoke(channel)`。
5. 在 Renderer 消费失败、取消和资源清理路径。
6. 更新架构、用户指南、CHANGELOG，并按改动面运行检查。

## Agent/并行协作

一个写入任务一个 worktree：

```sh
git worktree add ../dhd-<agent-id> -b agent/<topic>
cd ../dhd-<agent-id>
DSH_HOME="$(mktemp -d)" \
DHD_USER_DATA="$(mktemp -d)" \
DHD_WORKBENCH_PORT=5183 \
DHD_ALLOW_MULTIPLE=1 \
pnpm dev
```

`DHD_ALLOW_MULTIPLE=1` 仅用于开发/测试。不要让两个写入 agent 共享 checkout、`DSH_HOME`、Electron userData 或端口。锁文件、Harness gitlink、版本和 `packages/shared/src/protocol.ts` 在一个 PR 中应视为 single-writer 文件。

## 检查选择

| 改动 | 最低检查 | 真实流程 |
|---|---|---|
| 文档 | 链接、命令真实性、`git diff --check` | 校对 claim 与 support matrix |
| shared/preload | `pnpm typecheck && pnpm build` | 三方 contract 覆盖检查 |
| Host/PTY/退出 | 同上 | 启动、重启、取消、关闭、残留进程 |
| 搜索/watcher | 同上 | 大仓库、rg 失败 fallback、取消、fd |
| UI | 同上 | 实际窗口操作和失败态 |
| 打包 | `pnpm build` | 目标原生安装包 smoke；开发包不能代替 |
| Harness pin | 先在 `harness/` 构建 | ready、workspace sync、preset、Session resume |

## Harness pin 更新 SOP

Harness 是 developer preview，更新 gitlink 必须独立提交：

```sh
git submodule update --remote harness
cd harness
pnpm install && pnpm run build
cd ..
pnpm typecheck && pnpm build
```

然后重新核对：

- `dsh web` 启动参数和 ready line；
- token/cookie 和 workspace/session route；
- iframe bootstrap 与当前选中 Session 的存储键；
- preset、subagent、Team、Session format；
- `DHD_HARNESS_URL` 外部 Host 行为；
- 退出时自有 Host 的进程组清理。

更新 `docs/support-matrix.md`、CHANGELOG 和回滚说明；不要把 pin bump 与无关 UI 功能混在一起。

## 提交规范

使用 Conventional Commits：

```text
<type>(<scope>): <subject>
```

type：`feat`、`fix`、`docs`、`refactor`、`build`、`test`、`chore`。subject 使用英文祈使句，正文说明动机、行为和限制。

提交前：

```sh
pnpm docs:check
pnpm typecheck
pnpm test:contract
pnpm build
git diff --check
git status --short
```

发行候选额外运行 `pnpm release:check`；当前 runtime 尚未 bundled 时该命令应明确失败。

PR 中列出实际执行的命令、未执行的平台验证、关联 issue 和文档更新。不要提交真实 API key、用户路径、DSH_HOME、Electron userData 或 `harness/` 未说明的本地改动。

## 安全报告

不要在公开 Issue 报告漏洞。请使用 [SECURITY.md](SECURITY.md) 中的私密渠道；安全修复优先于功能发布。
