# DHD 产品与技术路线图

> 版本：2026-09-24 重设计版。基线：`c58b815`；Harness gitlink：`00102833d`（`dsh-v0.1.7-alpha.2`）。
>
> 这份文档是未来工作的 source of truth。`docs/design.md` 保留为历史原型与决策背景，不再代表当前实现状态。

## 1. North Star

> 让任何 DeepSeek Harness 用户都能安装一个可信的本地工作台，在同一个窗口完成“理解仓库 → 运行 Agent → 审阅变更 → 测试 → 提交”，同时让插件作者和多个 coding agent 能在稳定 contract 上接入。

North Star 不是“功能数量最多”，而是下面五个可感知结果：

1. **可信启动**：用户知道运行的是哪个 DSH、哪些插件和哪些数据目录；失败时有可操作的恢复入口。
2. **上下文透明**：Agent 看到了什么、做了什么、改了哪些文件，都能在 Trajectory / projection / diff 中追溯。
3. **闭环高效**：日常任务不需要在浏览器、VS Code、终端和多个窗口之间来回切换。
4. **可组合**：Harness 原生插件、Desktop contract 和未来的 ACP/CLI adapter 可以独立演进。
5. **可重复交付**：安装、升级、回滚、签名、测试和 CI 都有明确证据。

## 2. 定位与边界

### 2.1 定位

DHD 是独立的社区 Electron workbench，不是 DeepSeek 官方 Desktop 的替代品，也不暗示官方背书。当前 pin 的上游 checkout 已包含更完整的官方 Desktop 源码；DHD 的长期竞争力必须来自透明的 Agent-to-diff 工作流、跨 provider contract、可恢复 Profile 和社区可验证的工程，而不是功能数量。官方 Harness 仍是 Agent runtime、Session、工具、Skills、MCP、权限和沙箱的权威。

### 2.2 三层多 Agent 概念

产品、用户和贡献者文档必须区分以下三件事：

| 层次 | 含义 | DHD 方向 |
|---|---|---|
| Harness multi-agent | 上游 subagent、fork、workflow、实验性 Agent Teams、外部 provider | 保持上游语义，提供观察和安全说明 |
| Desktop multi-agent UX | roster、task、job、child session、diff、审批的桌面投影 | 先定义 contract，再逐项投影，不复制 Session |
| Multiple coding agents contributing | 多个 AI agent 在本仓库并行工作 | worktree、隔离环境、单写文件和交接格式 |

### 2.3 不做的事情

- 不在 Electron Main 重写 Agent loop、工具执行器、Session log 或沙箱。
- 不把 iframe 中的 Harness UI 宣称为已经完成的原生 client integration。
- 不在没有 worktree/merge/锁语义时宣传 Agent Teams 隔离。
- 不把本地设置伪装成已经作用于 Host 的 effective settings。
- 不把开发构建、updater 骨架或未签名包宣传成生产发行版。
- 不在 Renderer 暴露通用 `invoke(channel)` 或任意 Electron API。
- 不以插件市场、主题、桌宠数量作为核心差异化。

## 3. 当前基线与关键缺口

### 已具备

- Electron Main + sandboxed React Workbench + 外部 Harness Host 三进程拓扑。
- Monaco 编辑、文件树、搜索、xterm 终端、Git 面板、命令面板、MCP/Rules 入口。
- `dsh web` 启动、loopback URL、工作区同步、外部 Host 复用。
- 低 fd watcher、搜索 fallback、PTY fallback、统一退出清理。
- 共享 IPC 协议、preload 白名单、版本化 capability manifest（本次重构新增）。
- 独立的 `DHD_USER_DATA`、`DHD_WORKBENCH_PORT`、`DHD_ALLOW_MULTIPLE` 开发隔离入口（本次重构新增）。

### 关键缺口

| 缺口 | 用户影响 | 首个行动 |
|---|---|---|
| iframe 是 Agent 集成边界 | 上下文、状态、diff 难以原生融合 | 定义 TransportDriver / AgentSurface contract |
| 没有外层自动化测试 | 升级和跨平台回归风险高 | 先测纯逻辑、Host 生命周期和 IPC contract |
| 打包不带完整 Harness/Node | 新用户仍需环境准备 | 设计 runtime manifest 和 staged packaging |
| 变更没有 turn 归因 | 不能可靠审阅 Agent 写入 | 从 Session/tool events 做 change projection |
| 多个窗口共享全局状态 | 项目和 Agent 可能串线 | 引入 per-window WorkspaceGeneration |
| 本地设置未全部 effective | UI 显示和实际 Agent 行为不一致 | 分离 presentation/effective settings |
| 没有稳定扩展 API | 插件作者只能猜内部实现 | 版本化 capability/adapter contract + ADR |
| 缺少 signed release / rollback | 安装信任和升级风险高 | 先做 release rehearsal，再谈自动更新 |

## 0. 执行状态（2026-09-24）

| 阶段 | 状态 | 当前证据 / 下一步 |
|---|---|---|
| R0 真实基线 | ✅ 完成 | README、支持矩阵、架构、ADR、`AGENTS.md`、`llms.txt`、capability/IPC contract 已落盘 |
| R1 可安装可恢复 | 🚧 进行中 | 已完成 schema v3 runtime manifest/doctor/capability 摘要、target closure staging、bundled `dsh web` Host smoke，以及 macOS arm64 closure-inclusive app resources 的 post-pack inventory/签名变更校验；上游 Desktop 启动/退出、workspace smoke 和 upstream Host IPC lifecycle 已验证；跨平台、升级回滚、正式签名和公证仍待验证 |
| R2 Agent 原生闭环 | 🚧 进行中 | 已定义 `AgentTransportDescriptor`/`AgentTransportDriver` contract，验证 Turn Controller 状态机，实现 upstream Host IPC lifecycle、authenticated Session prompt/follow、structured context、tool/approval/change events、Session WebSocket reconnect 和 Main-owned AgentRuntime；`smoke:native-turn` 已用真实 Harness loop + mock provider 验证 Session log，外部 provider、完整 review loop 和跨平台验证仍待完成 |
| R3–R6 | ⏳ 后续 | 按 Gate 顺序推进，不提前宣传 |

本轮 R1 切片：`runtime-manifest` → `app.capabilities.runtime` 摘要 → target closure staging → bundled `dsh web` Host smoke → macOS arm64 post-pack resource/signing inventory check；R1 workspace/session smoke 已通过。R2 已从 contract-first 进入第一个真实 Session vertical slice：workspace sync 后建立 authenticated `session/follow`，native AgentRuntime 可发送结构化 turn 并接收 tool/approval/change/terminal events；`smoke:native-turn` 已用真实 Harness loop + mock provider 验证 prompt/context 和 Session log，外部 provider、跨平台 reconnect 和完整 review loop 仍未完成。正式 release 仍必须满足 R1 全部退出门。

## 4. 阶段路线图

每个阶段都有可演示结果和退出门；日期不是承诺，退出条件才是承诺。

### R0 — Truthful Baseline / 真实基线（立即）

**目标**：让新用户和新贡献者在第一次接触仓库时不会被过期或夸大的文档误导。

**交付**：

- README 首屏标明 source preview、unofficial、iframe 边界和当前限制。
- `docs/architecture.md` 只描述 as-built；`docs/roadmap.md` 描述目标。
- `docs/support-matrix.md` 绑定 Harness gitlink、preset 和验证状态。
- 根 `AGENTS.md`、`llms.txt`、贡献指南和 PR 模板形成 AI agent 阅读路径。
- capability manifest、共享 `DesktopApi` 和 preload 白名单进入类型检查。

**退出条件**：

- 每个“已实现”陈述都能指向代码、测试或明确的人工验证记录。
- 没有文档把 planned capability 写成当前能力。
- 任何新的 AI agent 只读 README + `llms.txt` + architecture 就能找到 owner、边界和验证命令。

### R1 — Installable & Recoverable / 可安装可恢复

**目标**：从“能跑源码”提升为“用户能安全安装、升级、失败后恢复”。

**范围**：

1. **Runtime manifest**
   - 记录 Desktop version、Harness commit/version、Node、pnpm、平台/架构、原生依赖和 DHD build-output digest；schema v3、target-specific runtime closure inventory 和 macOS arm64 post-pack resource check 已实现，正式跨平台发行证据仍待验证。
   - 运行时版本成为 Host 启动、更新和兼容检查的唯一输入。
   - `pnpm release:check` 是正式发行的 fail-closed gate；它验证 staged closure 和 source/desktop inventory，但不会替代签名、公证、安装后和跨平台证据。
   - 先评估复用当前 pin 的上游 `apps/desktop`/`desktop-host` 能力，避免在外层重新实现同一套 loader、profile 和更新闭包；具体分析和 Spike 任务见 [`upstream-first-evaluation.md`](upstream-first-evaluation.md)，结论记录在 [`ADR 0004`](adr/0004-upstream-first-evaluation.md)。
2. **打包**
   - 捆绑目标平台 Node、Harness runtime、pnpm、ripgrep、PTY 依赖和必要资源。
   - 开发源码模式与 packaged 模式明确分开。
3. **签名与更新**
   - macOS Developer ID + notarization；Windows Authenticode；checksums/SBOM。
   - staged update、原子替换、失败回滚、stable/beta 通道。
4. **恢复**
   - Safe Mode 只加载官方核心；保留用户会话和设置。
   - 启动失败显示 bounded diagnostics、最后已知良好 profile 和针对性修复。
5. **Doctor / bootstrap**
   - 报告 Node、pnpm、submodule、Electron、PTY、rg、DSH_HOME、端口和 userData 冲突。

**退出条件**：

- macOS arm64/x64、Windows x64、Linux（若继续支持）均有干净机器安装和卸载 smoke。
- 从一个旧版本升级到新版本后，Session、设置、Profile 和插件状态可恢复；失败不会破坏旧版本。
- 安装包内没有依赖用户全局 Node、pnpm 或未声明网络下载的启动路径。
- release 日志包含源码 commit、运行时版本、目标平台、hash 和未解决限制。

### R2 — Agent Loop / Agent 原生闭环

**目标**：从“右侧 iframe”进化为可追踪、可取消、可恢复的 Agent 工作流，同时保留 iframe 作为兼容回退。

**范围**：

1. **TransportDriver**
   - 定义 `connect`、`sendTurn`、`cancel`、`resume`、`subscribe`、capability negotiation。
   - loopback/iframe 继续作为完整 UI fallback；Host IPC lifecycle bridge 和 authenticated Session port 已接入；外部 Host 不能被误标为自有进程。
2. **Turn Controller**
   - 将发送、运行、工具调用、审批、结束、失败和取消建模为显式状态。
   - Host 重启后从 Session log 恢复，不把 UI loading 状态当作完成。
3. **Context Sources**
   - 当前文件、选区、打开 Tab、Git diff、Problems 作为结构化 context source；基础 builder、边界检查和真实 Session user-message 编码已实现。
   - 模型可见内容必须进入 Session log；复制到剪贴板只能作为明确 fallback。
4. **Change Projection**
   - 结合 Session/tool events、文件 watcher 和 Git 状态生成 turn 变更集；Session `workspace/changes` 的 changed-path producer 和 native event 已接入，before/after diff、watcher 冲突和 Review UI 尚未接入。
   - 展示 before/after diff、来源 turn、冲突和 reload 建议；不直接覆盖用户修改。
5. **Review loop**
   - 选中变更 → 打开 diff → 运行命令/测试 → 接受、恢复或继续让 Agent 修复。当前 changed-path diff、Host 前后 diff 和固定 test command 已有桌面入口，测试结果与 turn 的持久关联和 per-hunk 决策仍待完成。
   - 所有写操作经过 Host 的权限和审批语义。

**退出条件**：

- “让 Agent 改一个函数 → 查看 diff → 运行测试 → 提交”全程不离开工作台。
- 取消不会留下孤儿子进程；Host 重启后能恢复或明确重建 Session。
- 任意模型可见上下文都能从 Trajectory/Session log 解释。
- 变更归因测试覆盖：Agent 写、用户写、格式化器写、Git 外部写、冲突和取消。

### R3 — Cursor-grade Workbench / Cursor 级日常工作台

**目标**：把 Harness 的 Agent 能力放进开发者已经熟悉的 IDE 工作流。

**范围**：

- 编辑器：多根工作区、分屏、符号大纲、Problems、LSP、跳转、括号/搜索增强。
- 导航：命令注册表统一文件、命令、Session、Skills、模型和设置入口。
- 终端：持久 PTY、cwd/环境预览、Agent 命令与用户终端的明确边界、复制/回放。
- SCM：状态、diff、stage/unstage、commit、branch、history、冲突提示。
- Review：inline/side-by-side diff、per-hunk accept/revert、测试结果关联。
- 多窗口：每个窗口独立 workspace、Host connection lease、Agent selection 和布局。
- 无障碍：键盘导航、焦点域、减少动画、高对比、屏幕阅读器语义。

**退出条件**：

- 新用户 5 分钟内可以打开仓库、运行一个 Agent 任务、审阅 diff 并执行测试。
- 10,000+ 文件仓库中搜索、文件树和 watcher 不产生进程/FD 泄漏。
- 终端、搜索、Git 和 Agent 并发操作不会互相覆盖状态。
- 快捷键、菜单、命令面板和状态栏使用同一命令注册表，避免快捷键漂移。

### R4 — Plugin & Profile Ecosystem / 插件和 Profile 生态

**目标**：让“一切皆插件”从理念变成可测试的兼容层。

**范围**：

1. **Desktop capability contract**
   - 公开 Service Definition、Provider、Consumer 和版本兼容范围。
   - 提供 TypeScript 类型、最小示例、权限声明、生命周期和错误语义。
2. **Profile generation**
   - Desktop 使用独立 Profile；切换/卸载按 generation 原子化。
   - Profile、插件包、路径、symlink、大小、hash 和迁移有校验。
3. **Plugin manager / Safe Mode**
   - 安装、启用、禁用、升级、卸载、快照、回滚和失败归因。
   - Safe Mode 不删除用户数据；恢复动作可审计。
4. **Marketplace（后置）**
   - 先提供可验证 manifest、来源、版本、权限、兼容性和 hash，再做目录 UI。
   - 目录收录不是安全审查；明确写在 UI 和文档中。

**退出条件**：

- 一个最小外部插件可以在 Web 和 Desktop 中复用，或明确声明只支持 Desktop contract。
- 插件卸载后没有残留订阅、进程、watcher、fd 或临时文件。
- 坏插件可被单独归因并在不回滚用户 Session 的情况下禁用。
- Profile 导入不会接受路径穿越、未声明 symlink 或隐式覆盖。

### R5 — Agent Interoperability / 多 coding agent 互操作

**目标**：让“换一个 coding agent”成为 adapter 选择，而不是 fork 产品。

**优先级顺序**：

1. Harness Host（第一方、完整能力）。
2. ACP provider（上游自动化 contract）。
3. DSH SDK / CLI provider（脚本和 headless）。
4. 可选的外部 CLI bridge（Codex、Claude Code、OpenCode 等），遵守其原生认证、权限和生命周期。

每个 adapter 必须提供：

- 能力 manifest（模型、会话、工具、审批、取消、恢复、diff）。
- 版本和兼容范围。
- 统一的 context/turn/event vocabulary。
- 明确的凭据 owner 和 sandbox owner。
- 不支持的能力返回结构化 `unsupported`，不静默降级。

**退出条件**：

- 同一 Workbench 可以启动两个 adapter，并清楚显示它们的能力差异。
- 任何模型可见上下文和用户审批都进入所选 adapter 的审计/Session 流。
- 关闭 adapter 后没有残留进程、权限或文件 watcher。
- 适配器 contract 有独立测试 fixture，不依赖 UI 点击才能验证。

### R6 — Optional Remote / 可选远程

远程不是默认安全边界，也不是早期主路径。若本地闭环稳定后再做：

- 优先用户控制的 Tailscale Serve / Cloudflare Access 等私有网络。
- 出站连接、短时配对、设备撤销、只读模式、审批可见。
- 不提供通用 shell/PTY RPC；远程动作复用本地审批和 Session 记录。
- 默认不启用公网 tunnel/LAN 暴露；任何暴露都需要显式确认和审计。

## 5. 架构决策门

| Gate | 通过条件 | 未通过时 |
|---|---|---|
| G0 身份 | 明确社区定位、商标/归属、上游 PR 策略 | 暂停对外增长，先修 README/包元数据 |
| G1 真实基线 | 文档与代码、支持矩阵一致 | 不宣称新功能或生产可用 |
| G2 Host contract | 启动、token、workspace sync、重启、退出有测试 | 不移除 iframe fallback |
| G3 Agent loop | turn cancel/resume/context/diff projection 有行为测试 | 不宣称 Cursor 级融合 |
| G4 发行 | 原生平台安装、签名、hash、升级回滚通过 | 只发布 source preview |
| G5 生态 | 外部插件按公开 contract 组合并可卸载 | 不开放稳定扩展 API/市场 |
| G6 互操作 | 至少两个 adapter 通过 capability/turn contract | 不宣传“支持所有 coding agent” |

## 6. 优先级和资源原则

每个候选功能按以下四项评分（1–5）：

- 每日用户价值；
- Harness/Desktop contract 杠杆；
- 安全与可恢复性收益；
- 实现和上游升级成本。

优先做高价值、低耦合、能增加测试证据的切片。典型排序：

1. contract/test/recovery；
2. Agent context/turn/diff；
3. 编辑器、终端、Git、导航；
4. Profile/plugin transaction；
5. packaging/signing/update；
6. 远程、市场、装饰性功能。

## 7. 工程工作流

每个阶段都按垂直切片交付：

```text
真实用户动作 → 最小 contract → 失败语义 → UI/IPC → 自动化测试 → 文档 → release evidence
```

禁止以下交付方式：

- 只有 UI 按钮，没有底层状态和失败出口；
- 只有成功路径 screenshot，没有取消/重启/恢复测试；
- 只有“兼容 Harness”文字，没有 gitlink、命令和验证记录；
- 只有 capability 名称，没有 provider、consumer、dispose 和权限说明。

## 8. GitHub 与社区运营

### 每周

- 发布一个可运行的小切片或修复；
- 更新 CHANGELOG、support matrix 和 roadmap 状态；
- 回复 Harness/Desktop/插件问题并标注 owner；
- 精选一个社区插件或 Agent workflow 示例。

### 每月

- 做一次上游 pin 兼容演练；
- 发布带 hash 的 preview（不自动声称 stable）；
- 汇总搜索、崩溃、启动和 Host 失败数据（默认本地、脱敏）；
- 邀请插件作者审查 capability contract。

### 长期

- 建立兼容矩阵、示例插件、架构图和可复现 demo；
- 对安全报告提供私密渠道和响应时限；
- 采用 RFC/ADR 记录破坏性 contract 变化；
- 不通过刷星、夸大 benchmark 或“官方”字样换增长。

## 9. 风险清单

| 风险 | 早期信号 | 应对 |
|---|---|---|
| 上游 developer preview 频繁破坏 | Host 启动/ready line/API 变化 | 锁 gitlink、compatibility job、最小 overlay、adapter |
| 官方 Desktop 与本项目身份混淆 | 用户误以为官方发行 | 首屏声明、链接官方 source、独立 app id/数据 |
| 插件执行任意代码 | renderer/Host 权限过宽 | 最小 IPC、审批、Profile 隔离、OS sandbox、Safe Mode |
| 共享 checkout 互相覆盖 | diff 冲突、任务状态失真 | Lead 分配 owner、最终 diff review、后续 worktree |
| 发行包不可复现 | 用户缺 Node/网络/原生库 | runtime manifest、bundled runtime、hash、native smoke |
| 远程泄露 | Host 暴露公网、token 长期有效 | 默认 loopback、私有 overlay、短时 capability、审计 |
| 文档漂移 | README 声称未实现功能 | support matrix、生成检查、release evidence |

## 10. 下一轮执行清单

1. 将当前 DHD build-output digest inventory 扩展为与上游 `desktop-runtime.json` 对齐的完整 inventory/hash，并确定 Node、Harness、pnpm、rg 的闭包打包方案。
2. 在当前 authenticated Session port 上完成外部 provider/model turn smoke，验证 Session log、审批决策、取消/恢复和 Host restart/reconnect；`smoke:native-turn` 已覆盖真实 Harness loop + mock provider，`smoke:upstream-host` 已覆盖真实 Host lifecycle + Session follow。
3. 将 `workspace/changes` changed paths 接到 before/after diff、watcher 冲突和 Review loop；当前 Workbench 已能按 turn changed paths 加载 Git diff、读取 Host 前后 diff、启动固定项目 test command，并把失败输出作为下一轮 Agent feedback。持久化 test-result-to-turn 关联、watcher 冲突和 per-hunk review 仍待接入。保持 `pnpm smoke:workspace` 的真实 Host/session 回归，并补齐 Host 生命周期、PTY 和搜索 fallback 的最小行为测试矩阵。
4. 只有 R1 的安装/恢复证据达到退出门后，才把 native Agent surface 设为默认；在此之前继续保留 iframe fallback 和版本化 capability 状态。
5. 在有可安装、可签名、可回滚的包之前，README 继续使用 `source preview`，不添加虚假的下载 badge。
