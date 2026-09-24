# Changelog

本项目的所有显著变更都记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- **R1 runtime manifest 基础**：新增 `RuntimeManifest` schema、source/packaged 生成命令、doctor 校验、`app.capabilities.runtime` 集成和 `electron-builder` 资源声明；manifest schema 升至 v2，并记录 DHD build-output 的排序 digest inventory；完整 Harness/Node/pnpm/ripgrep 尚未 bundled。
- **上游 Desktop 兼容门**：新增 `pnpm upstream:check`，在 contract 测试中固定检查 Host IPC protocol、generation cleanup、runtime hash、Profile recovery 和 `runProfile` seam 的存在性。
- **上游 Desktop 启动/退出 spike**：在 macOS arm64 补齐 Harness workspace 依赖后观察到 Electron 和 `dsh web` authenticated ready URL；通过 macOS app quit 验证 graceful shutdown、exit 0 和无残留 Host。启动期间有 bounded HTTP 503 inventory warning。
- **Agent Transport contract**：新增 `AgentTransportDescriptor`/`AgentTransportDriver`、纯 `AgentTurnController` 和 R2 ADR 0005；Desktop capability contract 升至 v2，当前 iframe transport 明确声明 turn/cancel/resume/projection 尚未实现，选区仅支持 clipboard fallback。
- **Context Sources contract**：新增 bounded `buildContextBundle()`，AgentPanel 发送选区时生成结构化 context；Session log 自动记录仍待真实 TransportDriver 接入。
- **Change Projection contract**：新增只读 `projectChanges()` 纯函数和冲突/revert/路径安全 fixture；尚未接入真实 watcher、Session/tool event 或 Review UI。
- **Workspace/session smoke**：新增 `pnpm smoke:workspace`，通过真实 Host RPC 验证 `workspace/create` 幂等、session 创建/复用、token/cookie 认证和无残留退出。
- **Packaged runtime fail-closed**：packaged Host 启动前校验 runtime manifest；缺失或不完整时拒绝静默回退到 `npx`/系统 Node，`DHD_ALLOW_UNBUNDLED_RUNTIME=1` 仅作为本地诊断逃生开关。
- macOS arm64 的 unpacked/完整 electron-builder 打包已验证，`runtime-manifest.json` 已进入 App Resources；本机未配置 notarization，因此仍不宣称正式发行。
- **AI-agent-friendly product and engineering documentation**：新增市场与生态调研、重设计路线图、支持矩阵、架构目标 seam、并行 Agent 开发指南、`llms.txt`、GitHub 增长策略和四份 ADR；README 现在明确 source preview、iframe 边界、上游关系和未实现能力。
- **版本化 capability contract**：新增 `packages/shared/src/api.ts` 与 `packages/shared/src/capabilities.ts`，通过 `app.capabilities` 暴露 Desktop contract version、Host surface 和能力状态；状态栏显示当前 adapter contract。
- **多实例开发隔离入口**：支持 `DHD_USER_DATA`、`DHD_WORKBENCH_PORT` 和仅开发使用的 `DHD_ALLOW_MULTIPLE=1`，让不同 coding agent 可在独立 worktree/Harness home 中启动。

### Security

- Renderer 改为 `sandbox: true`，移除未使用的 `webviewTag`，增加 popup 和主 frame 外部导航的受限处理；preload 不再暴露通用 `invoke(channel)`，跨进程 API 统一由 shared `DesktopApi` 约束。
- 手工 smoke 验证自定义 userData/端口的双实例可同时启动，两个 Electron 主进程收到 SIGINT 后均正常退出且无 Vite/Host 残留。
- 当前仍未完成的 ProjectBroker、sender/frame 授权、Host token 分离、路径/symlink 限制和签名发行已在 `SECURITY.md` 与路线图中明确列为后续工作，未将源码预览误报为安全发行版。

### Fixed

- **Electron 搜索 `spawn EBADF` / Git 子进程无法启动**：项目监听器此前通过 chokidar 为大仓库中的每个文件保留持久 fd，耗尽 Electron 的文件描述符后，主进程无法再创建 `rg` 或 `git` 子进程。现改用原生递归 `fs.watch`（不支持递归的平台按目录回退），并在退出时显式关闭监听器。
- **搜索启动失败被伪装成无结果**：`searchContent` 现在捕获同步/异步 ripgrep 启动与运行失败，等待子进程关闭后回退 JavaScript 遍历；UI 区分搜索错误与无匹配，并在新查询/取消/卸载时清理旧状态。
- **关闭窗口后 Dock 退出很慢**：主进程现在统一取消搜索、关闭项目监听、停止并等待 PTY 与自有 Harness Host 的进程组退出，清理完成后才放行 Electron 退出；开发启动器转发终止信号并保留正确的退出码。

- **终端无法启动（pty.create 报 spawn EBADF）**：`tryNodePty` 仍按旧版布局检查 `build/Release/spawn-helper`，而 node-pty ≥ 1.1 改用 `prebuilds/<platform>-<arch>/`，导致原生 PTY 后端被永久跳过、落入管道回退链。现同时探测两种布局，并在首次使用时为缺失执行位的 `spawn-helper` 恢复 0755（pnpm 安装的预构建产物为 0644，posix_spawnp 会以 EACCES 拒绝）。管道回退链同步加固：python 桥在第 4 个 fd 触发 EBADF 时自动降级为三管道（仅失去 resize），macOS 增加 `script -q /dev/null` 真 PTY 回退层；修正 Windows 下 PATH 拼接误用 `:` 的分隔符 bug。
- **搜索缓慢且无进度**：`execFile('rg')` 在 GUI 启动（PATH 不含 rg）时静默 ENOENT，始终退化为慢速 JS 遍历。现一次性探测 `RIPGREP_PATH`、常见安装位置与 PATH（未安装 ripgrep 时可 `brew install ripgrep` 提速两个数量级）；内容搜索改为 `rg --json` 流式解析，命中上限即终止子进程；`listFiles` 优先 `rg --files`。新增 `search:progress` 事件（250ms 节流）与 `search.cancel` 通道；搜索框 300ms 防抖自动搜索，显示实时命中数并可随时停止；取消后返回已命中的部分结果。
- **安装 ripgrep 后搜索仍显示无结果**：`listFiles` 的早停回调对每一行都对全量累计结果重跑 `relative()` + 过滤（O(n²)，本仓库 9639 文件 ≈ 4600 万次运算，实测 49.7s），而搜索面板等文件名与内容两路结果全部就绪才渲染——内容命中其实 250ms 内已就绪却永远显示不出来。现改为逐行增量计数（同仓库实测 50ms），内容结果独立先行渲染，文件名结果随后补充。
- **切换底部 Tab 后终端报 "[process exited 0]" 且会话丢失**：旧实现中终端面板随 Tab 切换被卸载即 `pty.kill`，配合 React StrictMode 的双挂载语义，kill 几乎必然落在 shell 启动窗口内（实证：zsh 登录 shell 首个提示符需 0.8~1.4s，而 kill 发生在 spawn 后数毫秒——此时被杀恰报 exitCode 0）。重构为 VS Code 式会话常驻模型：会话由主进程按 (窗口, 项目) 持有，切 Tab 只是分离渲染层，回到终端 Tab 时 `pty.acquire` 幂等重连并回放缓冲（上限 256KB）；StrictMode 并发 acquire 合并为一次 spawn；切换项目才杀旧会话；窗口销毁/退出时统一回收。

### Added

- **打开项目时 harness 面板自动切换工作区**：Host 就绪后，主进程通过其 Typert Gateway HTTP RPC（`workspace/create` → 必要时 `session/create`）把当前项目注册为 harness workspace，并把 web 端的持久化选中态（`dsh.sessions.current`）注入 AgentPanel iframe 后重载，实现左侧选项目、右侧 harness 面板跟随切换；iframe 未加载时挂起至 `did-frame-finish-load` 再注入。同一路径重复打开幂等复用已有 workspace/session。

### Docs

- 新增贡献指南（CONTRIBUTING.md，含 submodule 更新 SOP 与提交规范）、实际架构文档（docs/architecture.md）、用户指南（docs/user-guide.md）、安全策略（SECURITY.md）与 PR 模板；README 增加文档索引。

### Build

- 上游 harness 子模块从 dsh `0.1.6-alpha.2` 升级到 `0.1.7-alpha.2`（ddefc45 → 0010283）。
- 根 `typecheck` 脚本改为自包含：先构建 `@dhd/shared` 再全量类型检查，新克隆开箱即用。

## [0.1.0] - 2026-09-23

首个仓库化版本。此前代码散落在工作区目录中，本版本完成独立仓库 `deepseek-harness-desktop` 的整理与发布。

### Added

- **Electron 壳（apps/shell）**：多窗口、应用菜单、单实例锁（`--folder=` 打开项目）、窗口状态记忆、自动更新骨架（electron-updater + GitHub provider）。
- **工作台（apps/workbench）**：React 18 + Vite 6 五区布局——文件树、Monaco 多 Tab 编辑器（自动保存/脏标记/minimap 开关）、xterm 集成终端（node-pty，失败回退管道 shell）、Git 面板（状态/diff/暂存/提交/推送/拉取/分支）、文件与内容搜索（ripgrep 优先）、命令面板与快开（Cmd+P / Cmd+Shift+P）、Cmd+K 行内编辑（DeepSeek API）、发送选区到 Agent、欢迎页（最近项目/克隆）、设置/凭证/MCP/Rules 面板。
- **共享协议（packages/shared）**：主进程 ↔ 渲染进程的 IPC 通道枚举、事件类型映射与 `AppSettings`/`HostState` 契约类型。
- **Host 集成**：以子进程方式拉起 `dsh web`（`--port 0` 免端口冲突，`--patch` 注入 MCP overlay），支持 `DHD_HARNESS_URL` 复用已运行 Host；harness 根目录探测链（环境变量 → 子模块 → 旧同级布局 → 打包内置）。
- **凭证**：API Key 经 `safeStorage` 加密存储，同步 `~/.dsh/.credentials.yaml` 与 CLI/Web 互通。
- **工程化**：pnpm workspace、TypeScript 严格模式、esbuild/Vite 构建、electron-builder 三平台打包（mac dmg/zip、win nsis/zip、linux AppImage/deb）、GitHub Actions 三平台 CI、跨平台 LF 行尾策略（.gitattributes）。
- **文档**：设计文档（docs/design.md）、贡献指南（CONTRIBUTING.md）、架构文档、用户指南。

### 上游

- harness 子模块锁定 `deepseek-ai/deepseek-harness`，初始 pin dsh `0.1.6-alpha.2`（ddefc45）。
