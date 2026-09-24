# 市场与生态调研

> 调研快照：2026-09-24。GitHub 星数、版本和 release 资产会变化；本文用它们描述竞争态势，不把星数当作质量证明。

## 1. 调研问题

本轮调研要回答四个问题：

1. DeepSeek Harness 的产品哲学是什么，哪些原则必须成为桌面端的设计约束？
2. GitHub 上已有的 DeepSeek Harness 桌面项目集中在解决什么问题，哪些能力已经同质化？
3. 本仓库当前实现与用户要求（Cursor 级工作流、多 AI code agent 友好、可长期维护）之间的真实差距是什么？
4. 怎样用可验证的工程质量而不是功能堆砌，在 GitHub 和 Harness 社区中建立辨识度？

## 2. 官方产品哲学

### 2.1 Agent = Model + Harness

官方产品页把 Agent 拆为模型和 Harness 两部分。模型提供推理能力，Harness 负责让模型理解环境、调用工具、组合技能、管理会话并在真实工作区持续工作。桌面端因此不应该把“换了一个模型”误认为“提供了 Agent 产品”；真正的产品价值在于工作区、工具、权限、会话和恢复能力。

来源：[DeepSeek Harness 开发者预览](https://www.deepseek.com/harness/en/)。

### 2.2 Everything is a plugin

Harness 的模型适配器、工具、技能、会话、沙箱、存储、循环、调度和 UI 都可以被替换或重新组合。Cordis 负责插件挂载、卸载、依赖和事件协调。对 DHD 的直接启发是：

- 不复制或重写 Agent loop、工具执行器、会话日志和沙箱。
- 桌面能力也应有清晰的扩展边界，而不是把所有逻辑塞进 Electron Main。
- Profile、bundle、配置 overlay 和运行 generation 必须有明确的生命周期。
- 第三方能力应依赖公开 contract，不应依赖 Electron 私有对象或某个版本的内部实现。

来源：[官方 README](https://github.com/deepseek-ai/deepseek-harness/blob/master/README.md)、[官方架构文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)。

### 2.3 能力通过 seam 组合

官方架构把 capability seam 拆成 Service Definition、Service Provider、Consumer 三部分，并通过事件让能力之间协作。DHD 应采用同样的方法：先定义跨进程的桌面能力和状态，再分别实现 Harness、ACP、CLI 等适配器，最后让编辑器、终端、Git 和 Agent 面板消费这些能力。

### 2.4 论文带来的两个设计原则

论文 [*A Programming Paradigm for Spatiotemporal Composability*](https://arxiv.org/abs/2608.25512)（arXiv:2608.25512，2026-08-26）讨论了可组合系统的两个正交维度：

- **Temporal composability（时间可组合）**：组件卸载时，运行时能够撤销该组件造成的副作用。
- **Spatial composability（空间可组合）**：组件声明对其他能力和上下文变化的依赖，运行时按变化激活或停用组件。

论文的 Cordis 实现强调 effect tracking、coeffect resolution、声明式 loader、配置 reconciliation 和 HMR。对桌面产品的工程翻译是：

1. Host、PTY、搜索、watcher、窗口和事件订阅都必须有可等待的 `dispose`。
2. Profile 或 Host generation 切换时，不能把旧窗口句柄、RPC 订阅、subprocess 或 service 引用带入新 generation。
3. 插件卸载后，不能继续收到旧事件或保留文件描述符。
4. 兼容多个 Agent 的关键不是复制多个 UI，而是让 provider、transport、projection 都有可替换的注册与撤销点。

论文的 92 页正文包含形式化定义和元理论；本文只采用其对产品架构直接可验证的原则，不把论文结论夸大为桌面端已经实现的功能。

## 3. GitHub 竞品扫描

### 3.1 样本

通过 GitHub repository search（`deepseek harness desktop`，按 stars 降序）、`dsh-plugin` topic 和项目 README/架构文档交叉检查。直接桌面竞品与相邻生态项目分开统计。

| 项目（2026-09-24 观察） | Stars | 主要定位 | 形态 / 强项 | 对 DHD 的启示 |
|---|---:|---|---|---|
| [`anywhere-labs/dsh-desktop`](https://github.com/anywhere-labs/dsh-desktop) | 28.8k | 面向 DSH 插件生态的现代桌面端 | 薄 Electron Host、固定上游、Profile、插件服务、手机远程、市场、渠道 | “桌面本身也是插件”、公开 Desktop service、Profile generation 和安全边界很强；DHD 不能只复制“套 Web UI + 窗口” |
| [`dataelement/dsh-desktop`](https://github.com/dataelement/dsh-desktop) | 9.0k | local-first、跨平台桌面客户端 | 独立数据、Safe Mode、恢复、手机访问、签名/公证、运行时打包 | 可靠启动、恢复和数据所有权是用户留存的核心；文档必须区分开发构建与已签名发行版 |
| [`lencx/Minke`](https://github.com/lencx/Minke) | 666 | local-first 远程工作空间 | PWA、Tailscale/Cloudflare Access 私有网络、runtime status、Safe Mode | 远程执行应留在 host，远程只做窄控制面；默认不应使用公网 relay |
| [`web-casa/DeepSeek-Harness-Desktop`](https://github.com/web-casa/DeepSeek-Harness-Desktop) | 124 | 发行工程导向的桌面端 | 多架构、SHA-256、SBOM、CodeQL、minisign、runtime manifest | 供应链、hash、原生 smoke 和可回滚发布可以成为长期信任护城河 |
| [`fufankeji/deepseek-harness-studio`](https://github.com/fufankeji/deepseek-harness-studio) | 660 | 面向非技术用户的插件/预设目录 | Plugin Center、Preset Square、权限预设 | 面向开发者的 DHD 应把“兼容性和恢复”放在“目录数量”之前 |
| [`PawWork`](https://github.com/Astro-Han/pawwork) | 199 | 面向知识工作者的 DHD 产品层 | 隐藏 DSH 概念、Office skills、调度、macOS 签名 | 垂直用户需要更短的首次价值路径；DHD 不必复制，但应优化 onboarding |
| [`vibeinging/dsh-desktop`](https://github.com/vibeinging/dsh-desktop) | 588 | 受控 bundle 的薄桌面宿主 | 官方 Web/Profile 为唯一权威、签名包、worktree、任务板 | “不复制上游状态”是值得学习的信任策略；不要引入第二套插件数据库 |
| [`zhukunpenglinyutong/desktop-cc-gui`](https://github.com/zhukunpenglinyutong/desktop-cc-gui) | 4.4k | 多引擎 AI coding GUI | Claude Code、Codex、Gemini、OpenCode、DSH；文件/Git/工具调用/流式输出 | 多 Agent 兼容应以 adapter + capability negotiation 表达，而不是堆入口；工具调用和 diff 可见性是高价值共性 |
| [`dsh-tauri/deepseek-harness-desktop`](https://github.com/dsh-tauri/deepseek-harness-desktop) | 2.6k | 轻量 Tauri DSH 客户端 | 约 5MB 安装包、零环境配置、预设/内置插件、worktree、running changes | 小包体积不是唯一卖点；插件内聚和“Agent 改了哪些文件”是可复用的产品语言 |
| [`DSH-EAC/DSH-Desktop-EAC`](https://github.com/DSH-EAC/DSH-Desktop-EAC) | 1.8k | 高度可配置的社区桌面端 | Tauri/Electron、多实例、插件保护、市场、手机、多智能体、主题 | 功能广度很快，但同时维护多个发行线会放大升级、签名和恢复风险；DHD 应优先做深主路径 |
| [`Prism-Shadow/penguin-harness`](https://github.com/Prism-Shadow/penguin-harness) | 2.4k | 多 Agent 自动开发平台 | 透明的多 Agent 协作与自动化 | 多 Agent 的价值在可观察的任务、角色和恢复，不在“多 Agent”标签本身 |
| [`whitelonng/dshcode`](https://github.com/whitelonng/dshcode) | 714 | 最小 Electron companion | 上游 Web profile、macOS/Windows、持续同步 | 薄壳有利于跟随上游；DHD 需要在薄壳和深度 IDE 之间明确阶段边界 |
| [`ningbainb/deepseek-harness-desktop`](https://github.com/ningbainb/deepseek-harness-desktop) | 708 | Windows 优先的 DSH 客户端 | Codex、插件、Skills、SSH、手机、皮肤 | 远程和迁移是生态入口；不能牺牲本地安全边界和可重复发布 |
| [`nexu-io/open-design`](https://github.com/nexu-io/open-design) | 97.9k | DSH 设计插件 / 设计工作台 | 多种 coding agent、BYOK、真实文件导出、DSH plugin | 不是直接桌面竞品，但说明“插件生态 + 多 CLI + 可交付产物”能获得很大关注；DHD 应提供可组合扩展而非复制设计工具 |

官方 [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness) 在调研日约 234.7k stars；它不是桌面竞品，而且当前仓库的上游 checkout 已包含官方 `apps/desktop`。调研时官方 source 已有成熟的 Desktop 打包/更新实现，但公开落地页没有把普通用户桌面下载作为主要入口，且 npm/source 版本通道存在差异。这个事实同时是 DHD 的战略威胁和机会：必须把 runtime compatibility 做成可验证 contract，而不是与官方抢同一个“壳”叙事。

因此 DHD 必须在 README 首屏明确“独立社区项目，不是官方 Desktop 替代品或背书”，避免用户误判身份。

### 3.2 竞争能力聚类

| 已被竞品反复证明的能力 | 用户价值 | DHD 的选择 |
|---|---|---|
| 一键启动、自动拉起 Host、无需手动管端口 | 降低首次使用门槛 | **必须做到**；同时提供 source doctor 和清晰的失败出口 |
| Profile / 多实例 / 数据迁移 | 防止插件、会话和设置互相污染 | **近期基础能力**；先定义数据所有权，再做 UI |
| 插件市场、插件管理、插件保护 | 生态扩展和故障恢复 | 先后端 contract、权限、回滚，再做市场；不把未稳定接口伪装成公共 API |
| 手机/远程/SSH | 移动办公和长任务跟进 | 作为可选 adapter，不阻塞本地主路径；默认不暴露公网 Host |
| 主题、桌宠、语音、PPT | 传播和个性化 | 不作为核心差异化；只在不污染 Agent 闭环时做 |
| 多 Agent / Team / workflow | 复杂任务并行 | 先提供安全的 Harness 原生能力说明和观察面；不把实验能力宣传成稳定隔离 |
| 运行时捆绑、签名、公证、自动更新 | 安装和信任 | 发行前硬门槛；开发版必须明确不能替代安装包 |
| Agent 改动可见、diff、测试、提交 | Cursor 式日常开发 | **DHD 的主战场**：把 Harness 事件投影为可审阅、可恢复的本地开发闭环 |

## 4. 现有项目的事实审计

本轮同时审计了当前代码，而不是只相信旧 README。基线为 `f163779`，Harness gitlink 为 `00102833d`（`dsh-v0.1.7-alpha.2`）。

### 已实现且有证据

- Electron Main 启动/监督外部 `dsh web` Host；Host 不进入 Electron Main。
- 沙箱化 React/Monaco/xterm Workbench：文件树、多 Tab、编辑、终端、Git、搜索、命令面板、行内编辑入口。
- Host URL 加载到 `AgentPanel` 的 `<iframe>`；工作区同步通过 Host HTTP RPC 注册 workspace/session。
- ripgrep 优先搜索、JavaScript fallback、低 fd 项目 watcher、PTY 多级 fallback、统一 shutdown coordinator。
- `packages/shared/src/protocol.ts` 集中声明 IPC 通道和事件类型；本轮新增了版本化 capability manifest 和共享 `DesktopApi`，并移除了 preload 对任意 IPC 通道的暴露。

### 尚未实现或不能这样宣传

- Agent 面板是 iframe，不是已经嵌入的 `dsh-client` 或 WebContentsView。
- “发送选区”当前可靠路径是剪贴板；`postMessage` 的 `dhd-insert` 接收端未在当前 Harness 源码中得到验证。
- `ChangesPanel` 是仓库级 Git diff，不是按 Agent turn 归因的 diff，也没有完整的 Apply/Reject 流程。
- Jobs、Problems 和原生 Team roster/projector 仍是占位或只存在于 Harness iframe。
- 多个窗口共享一个 Host、全局设置和一个项目 watcher；还没有每窗口 Agent/project 隔离。
- `defaultPreset`、`defaultModel`、`sandboxMode` 当前是桌面本地设置，尚未全部转换为 Host 的 effective settings。
- 在本审计快照中，打包配置不包含完整 Harness/Node 闭包；当前仓库已增加 target-specific closure staging，但签名、公证和已安装包 smoke 流程完成前仍不能称为自包含发行版。
- 外层仓库没有完整 unit/E2E 测试套件；当前新增的 `test:contract` 只覆盖 capability 与 IPC/preload contract，CI 仍主要验证安装、类型检查和构建。

这些事实记录在 [support-matrix.md](support-matrix.md) 和 [architecture.md](architecture.md)，避免 README、路线图和实际代码继续漂移。

## 5. 产品定位决策

### 一句话定位

> **DHD 是面向 DeepSeek Harness 用户的本地优先、插件友好、Cursor 式 AI coding workbench：保留 Harness 的 Agent 语义，把工作区、编辑、终端、变更审阅和恢复做成同一条闭环。**

### 三个不可替代的承诺

1. **Harness-native**：官方 Host、Session、Skills、MCP、工具和沙箱仍是权威；DHD 不复制 Agent loop。
2. **Agent-to-diff**：从上下文、Agent turn、工具结果到本地 diff、测试和提交都有可追踪的投影；未来通过 transport/provider seam 支持其它 coding agent。
3. **可组合且可恢复**：Desktop contract、Profile generation、插件和进程资源都有明确 owner、dispose、失败出口和恢复路径。

### 不与竞品争的功能

不做“主题数量最多”“插件数量最多”“桌面宠物最可爱”的竞争；这些功能容易被复制，且会放大升级和安全成本。资源集中在一条可证明的工作流：

```text
打开仓库 → 选择上下文 → Agent 执行 → 审阅变更 → 运行测试 → 提交/回滚
```

## 6. GitHub 可发现性策略

仓库设置建议（需要在 GitHub UI 操作）：

- Description：`Unofficial Electron workbench for DeepSeek Harness — local-first, plugin-friendly, Cursor-style coding workflow.`
- Topics：`dsh`、`deepseek-harness`、`deepseek-harness-desktop`、`ai-ide`、`coding-agent`、`electron`、`cordis`、`local-first`、`agent-skills`、`mcp`、`macos`、`windows`、`linux`。
- 将官方 Harness、桌面体验、插件生态和安全问题分别指向正确的 Issue/Discussion；不要让用户在两个仓库之间猜测归属。
- 每个 release 附 SHA-256、运行时版本、支持的平台和已知限制。
- README 首屏放产品截图/短 GIF、当前状态、源码安装和 release 链接；不要只放代码树。
- 每周至少发布一次可验证进展：修复、契约测试、示例或路线更新，优于没有证据的星标承诺。

详细执行清单见 [github-growth.md](github-growth.md)。

## 7. 调研结论

市场已经证明“把 DSH 装进桌面”有价值，也证明该功能很容易同质化。DHD 要脱颖而出，必须把差距放在用户每天能感知的四件事上：

1. 打开和恢复是否可靠；
2. Agent 的上下文和文件变更是否透明；
3. 出问题后是否能解释、回滚和继续；
4. 插件作者和多个 coding agent 是否能在不读源码猜谜的情况下接入。

因此下一阶段优先投资 **contract、测试、projection、runtime packaging 和文档**，而不是继续横向增加装饰性功能。
