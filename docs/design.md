# DeepSeek Harness Desktop — 原型、架构与落地路线图（历史设计稿）

> **重要：** 本文保留最初的原型、技术选型和决策背景，曾把未来阶段写成“已实现”，不再代表当前代码状态。当前事实以 [`architecture.md`](architecture.md) 和 [`support-matrix.md`](support-matrix.md) 为准；新的产品路线、阶段门和生态策略见 [`roadmap.md`](roadmap.md) 与 [`market-research.md`](market-research.md)。

| 项 | 内容 |
|---|---|
| 状态 | **历史设计稿**；当前版本和能力边界见 as-built 文档 |
| 日期 | 2026-09-01（初稿）/ 2026-09-23（仓库化整理） |
| 产品名（暂定） | DeepSeek Harness Desktop（下文简称 **DHD**） |
| 上游 | [DeepSeek Harness](https://www.deepseek.com/harness/)；当前 gitlink `00102833dfaee1da9f48a3a8eae9d34005a75218` / `dsh-v0.1.7-alpha.2`，开发者预览版 |
| 源码 | `harness/`（git submodule，锁 commit；上游 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)） |
| 对标 | Cursor 桌面 IDE 的核心工作流，而非像素级复制 |
| 平台 | macOS、Windows、Linux |

本文回答六件事：原型长什么样、系统怎么分层、技术怎么选、关键路径怎么跑通、哪里会卡住、按什么顺序落地。

---

## 1. 目标与非目标

### 1.1 目标

1. **完整保留**现有 Harness 能力：标准 / PTC / 极简 / 创造四种 Agent 模式、会话日志与 Trajectory、工具、Skills、计划 / 目标 / 子 Agent / 工作流、沙箱与审批、插件组合、设置与凭证。
2. **对标 Cursor 的桌面工作流**：本地项目、编辑器、终端、Agent 改代码、审 diff、多会话、命令面板、原生窗口与系统集成。
3. **跨平台桌面分发**：同一套架构打出 Mac / Windows / Linux 安装包。
4. **不破坏「一切皆插件」**：桌面壳、传输层、工作台都做成可替换层，不把 Agent 能力写进 Electron 主进程。
5. **可跟上游**：Harness 仍在开发者预览、承诺会有破坏性变更。桌面端以依赖 + overlay 接入，避免大规模 fork。

### 1.2 非目标（第一年明确不做）

- 不做 Cursor 的闭源模型协议、Tab 补全模型训练、Cloud Agent 云端执行集群。
- 第一年不做完整 VS Code 扩展市场兼容（见 §5 技术选项）。
- 不把 Harness 的 Agent 循环、工具管道、会话日志在桌面端重写一遍。
- 不把 Web UI 简单套一层浏览器窗口就称为「对标 Cursor」。

### 1.3 成功标准

| 阶段 | 用户能完成的事 |
|---|---|
| P0 可安装桌面端 | 双击打开原生窗口，完整使用现有 Web Harness，不丢功能 |
| P1 可用 IDE | 打开本地仓库，浏览文件、编辑、终端、Agent 同屏工作 |
| P2 Agent 融入编辑器 | Agent 改文件后可审 diff / 一键应用；编辑器选区可发给 Agent；`Cmd/Ctrl+K` 行内编辑 |
| P3 对标 Cursor 主路径 | 命令面板、多 Tab、Git 基础面板、MCP 配置 UI、Rules/Skills、代码库检索、多 Agent 会话 |

---

## 2. 现状：上游已经有什么

DeepSeek Harness 是 **Node + Cordis 插件树**，不是静态站点。本文初稿写作时把“官方没有桌面版”作为假设；当前 pin 已包含上游 `apps/desktop` 源码实现。DHD 仍保持独立社区项目身份，当前实现边界以 [support-matrix.md](support-matrix.md) 为准。

上游 `dsh-host-webserver` 文档曾预留 Electron 路径：

> Electron loads dist over `file://` and carries fetch over an IPC bridge.

### 2.1 现有产品面

| 入口 | 作用 |
|---|---|
| `dsh web` | 本机 `127.0.0.1:3080` 浏览器 GUI |
| `dsh --profile headless` | 一次性 CLI Agent |
| `dsh --profile sdk` | stdio JSON-RPC，给 TS/Python SDK |
| `dsh --profile acp` | Agent Client Protocol |

Web UI 是 **React 18 + Vite 6 + 客户端 Cordis 插件树**。浏览器通过 HTTP POST `/api` 做 RPC，WebSocket `/api/remote.mux` 收事件流。Host 注入 `window.__DSH_BOOT__`，裸 `file://` 打不开。

### 2.2 必须留在 Node Host 的能力

这些不能迁进渲染进程或 Rust 侧重写：

- Cordis 启动、profile / bundle / overlay
- Agent loop、会话只追加日志、compaction、spill
- LLM 适配器（DeepSeek / pi-ai）与凭证解析
- 工具执行：fs、shell、ripgrep、LSP、MCP、workflow worker thread
- 沙箱：Linux bwrap → Landlock、macOS Seatbelt、Windows restricted token + ACL
- 会话持久化（`$DSH_HOME/sessions/` JSONL）、附件、settings.yaml
- 子 Agent、审批、permission presets

### 2.3 已经可复用的客户端

`packages/client/*` 约 40 个包：三栏布局、会话、Trajectory、工具卡片、审批、Settings、模型选择、Skills / `@` 引用、Plan / Goal。它们建立在 React-free 的 Session / Connection 对象层上，**适合嵌进桌面工作台，而不是整页 iframe 一辈子**。

### 2.4 现有 Web 明确没有的 IDE 面

- 文件树 / 多 Tab 编辑器 / 分屏
- 独立终端面板（只有 chat 里的 bash/pwsh 工具卡片）
- Git / SCM 面板
- 行内编辑（Cursor `Cmd+K`）
- Tab 补全
- 代码库语义索引
- 原生菜单、多窗口、自动更新、系统钥匙串

结论：上游是 **完整的 Agent Runtime + 对话壳**，不是 IDE。桌面版的增量是 **Workbench + 原生壳 + 传输适配**，Agent 内核继续用 Harness。

---

## 3. 对标 Cursor：能力矩阵

图例：`已有` = Harness 已具备；`桌面补` = DHD 新增；`后置` = P3 及以后；`不做` = 不复制闭源能力。

| Cursor 能力 | 对标策略 | 归属 |
|---|---|---|
| 打开本地项目 / 多根工作区 | 复用 `ctx.workspace` + 原生选目录，补多根与最近项目 | 已有 + 桌面补 |
| 文件树 + 搜索文件 | 新 Workbench | 桌面补 |
| Monaco 级编辑器、多 Tab、分屏 | 新 Workbench（P1） | 桌面补 |
| 语言服务 / 诊断 / 跳转 | 先接 Harness `packages/lsp`（opt-in），编辑器侧再接 LSP client | 已有 + 桌面补 |
| 集成终端 | xterm.js + node-pty，与 Agent bash 共用 cwd / 环境 | 桌面补 |
| Agent 对话 / Composer | 复用 `dsh-client` 会话与 composer | 已有 |
| Plan / Ask / Agent 模式 | 映射到 preset + plan mode，不另起一套循环 | 已有 + 桌面补 |
| 工具调用可视化 | Trajectory + tool cards | 已有 |
| Skills / Rules / AGENTS.md | Skills 已有；Rules 编辑器与项目约定文件浏览为桌面补 | 已有 + 桌面补 |
| MCP | `packages/mcp` 已有，补配置 UI | 已有 + 桌面补 |
| 审批 / 沙箱权限 | 已有 permission presets | 已有 |
| 子 Agent | 已有 | 已有 |
| Apply / 审 diff | 把工具写出的文件变更投影到编辑器 diff 视图 | 桌面补 |
| `Cmd+K` 行内编辑 | 选区 → 短会话 → 补丁应用 | 桌面补 |
| `@file` / `@code` | 已有 reference；补编辑器当前文件 / 选区 | 已有 + 桌面补 |
| Tab 补全 | 后置；需补全模型或自建 FIM 通道 | 后置 |
| 代码库索引 / 语义检索 | 后置；先做 ripgrep + 符号，再向量索引 | 后置 |
| Git 面板 / PR | 上游无 git 工具（靠 bash / MCP）；P3 做基础 SCM | 桌面补 |
| 命令面板 | P1 必做 | 桌面补 |
| 多窗口 / 多会话 | 原生多窗 + 现有 session list | 桌面补 |
| 设置 / API Key | 复用 settings；桌面把密钥写入 OS keychain | 已有 + 桌面补 |
| 扩展市场 | 不做 VS Code 市场；继续 Cordis / `dsh-plugin` | 不做（V1） |
| Cloud Agents | 不做云端执行；本机 Harness 即可 | 不做（V1） |

原则：**Agent 智能走 Harness，IDE 体感走 Workbench，二者在「文件变更」和「上下文」上交汇。**

---

## 4. APP 原型设计

### 4.1 产品信息架构

```text
DeepSeek Harness Desktop
├── 欢迎页 / 最近项目
├── 工作区窗口（一个窗口 ≈ 一个项目，可多开）
│   ├── 活动栏：资源管理器 | 搜索 | 源码管理 | Agent | 插件 | 设置
│   ├── 侧栏：随活动栏切换
│   ├── 编辑器组：Tab、分屏、diff、预览
│   ├── 底栏：终端、问题、输出、Agent 作业
│   ├── 右侧（可关）：Agent 会话 / Trajectory
│   └── 状态栏：分支、沙箱模式、模型、preset、连接状态
├── 独立 Agent 窗（可选，对应 Cursor 的独立 Composer）
└── 系统：菜单栏、命令面板、通知、更新
```

### 4.2 主界面线框（工作区）

```text
┌─ DeepSeek Harness Desktop ── project/foo ── 标准模式 ── deepseek-chat ─┐
│ 文件  编辑  选择  查看  转到  Agent  终端  窗口  帮助                   │
├────┬─────────────────────────────┬────────────────────────────────────┤
│ 资 │ EXPLORER                    │  main.ts x    utils.ts x           │
│ 搜 │ ▸ src                       │ ┌────────────────────────────────┐ │
│ 源 │   ▸ app                     │ │  12  export function boot() {  │ │
│ 聊 │     main.ts                 │ │  13    const ctx = create()    │ │
│ 插 │     utils.ts                │ │  14    ctx.plugin(desktop)     │ │
│ 设 │ ▸ packages                  │ │  15  }                         │ │
│    │                             │ └────────────────────────────────┘ │
│    │                             ├────────────────────────────────────┤
│    │                             │ TERMINAL          PROBLEMS   JOBS  │
│    │                             │ $ git status                       │
├────┴─────────────────────────────┴──────────────┬─────────────────────┤
│ ready  workspace-write  standard  deepseek-chat │ Agent · 会话 3      │
└─────────────────────────────────────────────────┴─────────────────────┘
```

右侧 Agent 面板默认打开，可拖到左侧或独立窗口。窄屏时 Agent 占中栏（接近现有 Web 三栏）。

### 4.3 关键界面

**欢迎页**

- 最近项目、打开文件夹、从 Git 克隆
- 继续上次会话
- 首次引导：API Key（系统钥匙串）、默认模型、沙箱模式

**Agent 面板（复用现有 client）**

- 会话列表按工作区分组（已有）
- 输入框、附件、`/` 命令、`@` 引用（已有）
- 模式切换：标准 / PTC / 极简 / 创造；Plan 开关（已有）
- 新增：把「当前文件 / 选区 / 打开的 Tab / git diff」注入 `@` 引用源

**Diff 审阅（新）**

- Agent 每次 `write` / `edit` 在编辑器打开 side-by-side 或 inline diff
- 操作：全部应用（已写入则标为已应用）、按块撤销、在编辑器打开
- 与会话 Trajectory 的工具卡片双向跳转

**行内编辑 `Cmd/Ctrl+K`（P2）**

- 选区上方浮层：指令输入
- 走短生命周期 session（或同一 session 的 scoped turn）
- 预览补丁，Accept / Reject

**命令面板 `Cmd/Ctrl+P` / `Cmd/Ctrl+Shift+P`**

- 文件快开、命令、会话、Skills、模型、preset
- 与现有 Web command menu 合并为一套目录，桌面补原生快捷键

**设置**

- 沿用现有 Models / Plugins / General
- 增加：编辑器、键位、终端、更新、钥匙串、网络代理

### 4.4 核心用户流程

1. **安装 → 登录密钥 → 打开项目 → 提问改代码 → 审 diff → 终端验证 → 提交**
2. **选中代码 → Cmd+K → 改这段 → Accept**
3. **Plan 模式先出方案 → 批准 → Agent 执行 → Trajectory 回放**
4. **切换 PTC / 极简 / 创造，不换窗口、不丢会话**
5. **断线重连 / 恢复会话**：继续用只追加 JSONL，桌面只负责把 Host 拉起来

### 4.5 交互与平台约定

| 平台 | 窗口 | 菜单 | 快捷键 | 打包 |
|---|---|---|---|---|
| macOS | 无边框 + 交通灯，hiddenInset | 系统菜单栏 | Cmd | `dmg` / `zip`，Apple 公证 |
| Windows | 自定义标题栏 | 窗口内菜单 | Ctrl | `nsis` / `msi`，Authenticode |
| Linux | 跟随系统 CSD | 窗口内菜单 | Ctrl | `AppImage` + `deb` / `rpm` |

键位提供 `Default` / `Cursor 兼容` / `VS Code 兼容` 三套，默认 Cursor 兼容，降低迁移成本。

视觉：深浅色跟随系统，编辑器与 Agent 共用一套 token。不重新发明 Harness 的对话视觉，避免两套 UI 语言。

---

## 5. 技术选项

### 5.1 桌面壳

| 选项 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| **A. Electron** | 与 Cursor / VS Code 同族；Harness 文档已预留 IPC；Chromium 直接跑现有 React client + Monaco；Node 与 Host 同生态 | 包体积大（~150–200MB）；内存高于 Tauri | **推荐** |
| B. Tauri 2 | 包小、内存低、Rust 安全边界清晰 | Harness 必须另起 Node sidecar（Landlock addon、动态插件、tsx、worker thread）；两套运行时、两套 IPC；现有 client 的 cookie / WS 假设要全部改 | 备选，不作为 V1 |
| C. 纯 WebView 包一层 | 最快做出「桌面图标」 | 不是 IDE；无编辑器/终端/原生能力；对标 Cursor 失败 | 只作 P0 过渡，不是终态 |
| D. Flutter / .NET / Qt | 原生感强 | 无法复用 React client 与 Cordis 动态加载 | 否决 |

### 5.2 编辑器内核

| 选项 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| **A. Monaco + 自研 Workbench** | 可控、包体小、与 Harness 插件哲学一致、3–6 个月能做出主路径 | 没有 VS Code 扩展生态；LSP / debug / 多根要自己接 | **V1 推荐** |
| B. Code-OSS fork（Cursor 同路） | 扩展、键位、调试器、SCM 一次到位 | 跟 VS Code 月更；与「一切皆插件」两套体系；团队规模不够会拖死 | P3 后再评估 |
| C. monaco-vscode-api / Theia | 可嵌入部分 VS Code 服务 | API 变动大、调试成本高、许可与更新策略复杂 | 观察，不作为 V1 主路径 |
| D. CodeMirror 6 | 轻 | 缺 IDE 级 LSP / diff / 多模型体验 | 否决 |

### 5.3 与 Harness 的集成方式

| 选项 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| **A. 子进程跑 `dsh --profile desktop`** | 崩溃隔离；遵守上游「所有应用走 dsh 入口」；便于跟版本 | 要管进程生命周期、stdio/端口、升级双包 | **推荐** |
| B. Electron 主进程 in-process 加载 Cordis | 少一个进程 | 主进程被 Agent / 沙箱拖死；与上游入口约束冲突 | 否决 |
| C. 只嵌 `http://127.0.0.1:3080` | P0 一天能跑 | 传输与窗口生命周期都是浏览器模型；做不成编辑器融合 | **仅 P0** |
| D. 只接 `sdk` JSON-RPC，UI 全自研 | 协议稳 | 丢掉现成 client 与 Trajectory，工作量翻倍 | 否决 |

### 5.4 传输层

| 选项 | 说明 | 结论 |
|---|---|---|
| **IPC Fetch Bridge** | 上游已写明：渲染进程 `file://` 或自定义协议，fetch/WS 经 `contextBridge` 转到 Host | **P1 起的目标形态** |
| 本机 loopback HTTP | 复用现有 cookie token 流程 | **P0 采用**，作为兼容基线 |
| SDK stdio JSON-RPC | 给无 UI 自动化，不适合富交互 | 保留给脚本 / 测试 |

P0 用 loopback 换时间；P1 把 `dsh-client-connection` 的 transport 抽成可替换 driver，desktop driver 走 IPC。这是桌面版最关键的工程缝。

### 5.5 推荐技术栈（确认后按此实现）

| 层 | 选型 | 版本基线 |
|---|---|---|
| 壳 | Electron + electron-builder | Electron 36+（与 Node 22 对齐 Harness engines） |
| 语言 | TypeScript strict | 与上游一致 |
| 包管理 | pnpm workspace | 与上游一致 |
| 渲染 UI | React 18 | 复用 `dsh-client-*` |
| 编辑器 | Monaco Editor | 最新稳定 |
| 终端 | xterm.js + node-pty | 平台预编译 |
| 状态 | 工作台自有 store；Agent 继续用 client store | 不引入 Redux |
| 进程通信 | electron `ipcMain` / `contextBridge` + 类型化 RPC | 自研薄层 |
| 密钥 | OS keychain（keytar 或 electron safeStorage）同步到 `ctx.credentials` | |
| 更新 | electron-updater + 自建或 GitHub Releases | |
| 日志 | 主进程 + Host 日志分目录，不进会话 JSONL | |
| 测试 | vitest（单测）+ Playwright Electron（E2E） | |
| CI | GitHub Actions：macOS / Windows / Ubuntu 矩阵 | |
| 上游接入 | git submodule（`harness/`，锁 commit） | 锁版本 |

不选 Tauri 的核心原因不是「Electron 更好」，而是 **Harness 已经是 Node 世界的操作系统**：动态插件、Landlock native addon、workflow worker thread、ripgrep 打包。再套一层 Rust 壳只会增加边界，不会减少复杂度。

---

## 6. 架构设计

### 6.1 仓库与模块边界

桌面产品放在上游仓库**外面**，避免触发上游 `verify-application-entrypoints`（禁止绕过 `dsh` 的 Node 入口）。本仓库即桌面产品本身，上游以 `harness/` submodule 锁定：

```text
deepseek-harness-desktop/          # 本产品（pnpm workspace）
├── apps/shell/                    # Electron 主进程 + preload
├── apps/workbench/                # 渲染进程入口（React + Monaco + xterm）
├── packages/shared/               # Host ↔ Renderer 共享协议与类型
├── packages/desktop-profile/      # dsh profile overlay（desktop）
├── harness/                       # 上游 submodule，锁 commit，尽量不改
└── docs/                          # 本设计文档
```

对上游的改动原则：

1. **能 overlay 就不改源码**（新 profile、新 plugin、`--patch`）。
2. 必须改上游时（例如 connection 的 transport 抽象），做 **最小 PR 回馈上游** 或本地 patch 文件，禁止大面积 fork。
3. 桌面专属能力以 Cordis 插件形式存在，id 稳定，可被用户 `cordis.patch.yml` 关掉。

### 6.2 进程模型

```text
┌─────────────────────────────────────────────────────────────┐
│  Electron Main                                              │
│  窗口 / 菜单 / 协议 dsh-desktop:// / 更新 / 崩溃上报         │
│  拉起、守护、优雅退出 Harness 子进程                         │
└─────────────┬───────────────────────────────┬───────────────┘
              │ spawn + 监督                   │ IPC
              ▼                               ▼
┌──────────────────────────┐    ┌─────────────────────────────┐
│  Harness Host            │    │  Renderer (Workbench)       │
│  `dsh --profile desktop` │◄──►│  编辑器 / 树 / 终端         │
│  Cordis: dsh-base        │ RPC│  Agent 槽位 = dsh-client    │
│        + desktop-app     │ WS │  preload: 白名单 API        │
│  沙箱 / 工具 / LLM       │    │  无 Node 集成、无裸 ipc     │
└──────────────────────────┘    └─────────────────────────────┘
```

约束：

- Renderer **不** `nodeIntegration`，只走 preload 白名单。
- Agent 工具仍然在 Host 里以 OS 用户身份运行，沙箱策略不变。
- Main 不执行工具、不碰会话日志、不解析模型流。
- Host 崩溃：Main 提示并重启 Host，Renderer 走已有 reconnect；会话在 JSONL 里。
- 退出：先取消 in-flight turn，再停 Host，再关窗。

### 6.3 逻辑分层

```text
┌──────────────────────────────────────────────┐
│ Presentation                                 │
│  Workbench chrome · Monaco · xterm · Agent UI│
├──────────────────────────────────────────────┤
│ Application                                  │
│  命令注册表 · 窗口会话 · 项目服务 · Diff 应用 │
├──────────────────────────────────────────────┤
│ Transport                                    │
│  Typed RPC · Event mux · Auth · Generation   │
├──────────────────────────────────────────────┤
│ Domain (Harness, 不改语义)                   │
│  Session log · Agent loop · Tools · LLM      │
├──────────────────────────────────────────────┤
│ Platform                                     │
│  FS · PTY · Sandbox · Keychain · Auto-update │
└──────────────────────────────────────────────┘
```

依赖只能向下。Agent UI 可以调 Application（打开文件、应用补丁），不能反向让 Main 依赖 client 包。

### 6.4 `desktop` Profile

新增 profile，不污染 `web`：

```yaml
# 概念示意，不是最终 YAML
bundles:
  - '@deepseek-ai/dsh-base'
  - '@deepseek-ai/dsh-web-app'          # 先复用 client 清单
  - '@dhd/desktop-app'                  # 替换传输、选目录、钥匙串、不自动开浏览器
```

`desktop-app` overlay 职责：

- `--no-open`，不打印可被浏览器打开的 token URL（改走 IPC 握手）
- 用 Electron dialog 替换 / 增强 `directory-picker-native`
- credentials 增加 OS keychain provider，文件回退仍保留
- 注册桌面专属 remotes：`window.openFile`、`diff.apply`、`terminal.reveal`
- P0 阶段仍可绑定 loopback，便于先跑通

### 6.5 Agent 与编辑器的交汇（产品真正成立的点）

```text
用户选区 / 打开文件 / git 状态
        │
        ▼
 Desktop Context Sources ──► @ 引用 / 系统提示注入（仍写进 SessionEvent）
        │
        ▼
 Agent loop + tools (read/edit/write/bash)
        │
        ▼
 SessionEvent 工具结果
        │
        ▼
 Desktop Projection：文件变更清单 → Diff 视图 / 打开 Tab / 问题面板
```

硬规则（与上游一致）：**凡是模型看见的东西必须进会话日志。** 编辑器上下文不能只活在 React state 里。

### 6.6 安全边界

| 边界 | 做法 |
|---|---|
| Renderer | 无 Node，CSP，preload 白名单 |
| Host HTTP（P0） | 继续 127.0.0.1 + cookie + Host/Origin 围栏 |
| Host IPC（P1+） | 握手密钥仅 Main↔Host，Renderer 拿 session capability，不拿启动 token |
| 密钥 | 钥匙串为主，`.credentials.yaml` 为兼容；设置 UI 只存引用名 |
| 工具执行 | 不绕过 `ctx.sandbox` / `ctx.approval` |
| 自动更新 | 签名校验；更新通道与 Host 版本绑定 |
| 协议 | `dsh-desktop://` 只处理受控动作（打开项目），不执行任意脚本 |

### 6.7 配置与数据

沿用 `$DSH_HOME`（默认 `~/.dsh`），桌面增加并列目录：

| 路径 | 内容 |
|---|---|
| `$DSH_HOME/` | 会话、插件、settings、credentials（与 Web 互通） |
| `$DHD_HOME/` 或 `app.getPath('userData')` | 窗口布局、最近项目、键位、更新状态 |
| 项目内 `.dsh/` | 项目 skills / 附件（已有） |

**同一套会话在 Web 与 Desktop 之间可读**，这是「保留完整功能」的验收项。

---

## 7. 实现原理

### 7.1 启动时序

```text
1. 用户打开 DHD
2. Main：单实例锁 → 恢复窗口 → 解析要打开的项目
3. Main：spawn Host
     DSH_HOME=...
     DSH_DESKTOP=1
     dsh --profile desktop --no-open
4. Host：Loader 启动至 ready
     P0：打印 loopback URL + token（仅内部管道，不进系统浏览器）
     P1：在 stdio 或 Unix socket 上报 IPC endpoint
5. Main：把 capability 交给 Renderer
6. Renderer：挂 Workbench → 挂 Agent client
7. Client：RPC + event generation ready → 拉取 workspace / sessions
8. 用户工作；关闭时反向拆
```

### 7.2 P0：loopback 嵌入（保功能）

Renderer 里 Agent 区先用 `<webview>` 或同域加载 `http://127.0.0.1:<port>/?token=...`。

- 优点：一天内对齐现有 Web 的全部功能与快照行为
- 缺点：编辑器无法深度融合；webview 与工作台是两棵树
- 退出条件：P1 IPC bridge 通过「创会话 / 发消息 / 跑一轮工具 / 恢复会话」契约测试后删除 webview 主路径

### 7.3 P1：IPC Fetch Bridge（上游预留的正道）

把浏览器的三件事翻译成 IPC：

1. **Unary RPC**：`POST /api` → `ipcRenderer.invoke('dsh:rpc', payload)`
2. **Event mux**：`WS /api/remote.mux` → Main 维持与 Host 的流，转 `ipc` 事件
3. **Index boot**：`renderIndex` / `__DSH_BOOT__` 由 Main 在加载工作台时注入，不再依赖 `frontend-static` 的 HTML 改写

实现落点：

- Host 侧：`desktop-transport` 插件实现与 `webserver` 相同的 Remote 表面，不走 `node:http`（或 http 仅绑到抽象 request handler）
- Client 侧：`dsh-client-connection` 增加 `TransportDriver`；desktop 实现替换 `fetch` + `WebSocket`
- 认证：用 Main 签发的桌面 session 代替 cookie；围栏从 Host/Origin 改为「仅来自本应用 preload」

这是最高风险、最高杠杆的模块，必须先写契约测试再铺 UI。

### 7.4 文件变更投影

Harness 工具已经在改磁盘。Desktop 不重写 `edit`/`write`，只订阅：

- 会话里的 `tool/result`（write/edit）
- 工作区 `fs.watch`
- 可选：git status

合成「本次 turn 的变更集」，驱动 diff 视图。用户在编辑器里的手改与 Agent 写盘冲突时：以磁盘为真，提示 reload / keep。

### 7.5 行内编辑

`Cmd+K` 不新开一套模型客户端，而是：

1. 收集 `path + range + text + instruction`
2. 开 scoped turn（独立 session 或带 `startsRequestSeries` 的短循环）
3. 工具白名单仅 `read` / `edit`（或只返回 patch，由 Application 层 apply）
4. 结果进同一套 SessionEvent，Trajectory 可回放

### 7.6 终端与 Agent Shell

- 用户终端：node-pty，cwd = 工作区，环境注入 `DSH_HOME` 等（与 `shell-env` 对齐）
- Agent `bash`/`pwsh`：继续走 Host 沙箱，不进用户 PTY
- 需要「在终端显示 Agent 命令」时：只做只读回放或「复制到终端」，不把沙箱进程接到 xterm，避免绕过审批

### 7.7 打包与运行时

安装包内含：

- Electron 壳
- 已构建的 workbench
- 已构建的 `@deepseek-ai/dsh` 与 desktop profile（或打包 Node + `node_modules` 闭包）
- 平台 native：`node-pty`、Linux `landlock-run`、ripgrep

Harness `engines` 要求 Node `^22.19 || >=24`。Electron 内嵌 Node 必须满足，或 Host 使用随包的独立 Node，而不是 Electron 的 Node。**推荐 Host 使用独立 Node 运行时**，减少 Electron ABI 与 landlock / pty addon 的耦合。

### 7.8 编码实践（桌面软件）

- 主进程薄：只做生命周期与原生 API
- 所有跨进程 API 有 TypeScript 契约，禁止裸字符串频道扩散
- 渲染进程可测：Workbench 不 `import 'electron'`
- 失败可见：Host 未就绪、沙箱降级、密钥缺失都有明确空态
- 不在 UI 线程做索引 / grep；长任务进 Host 或 utility process
- 日志分级，会话 JSONL 不写密钥
- 每个 P 级都有「上游 Harness 升级」演练，desktop 锁版本 + changelog

---

## 8. 阻碍点与对策

| # | 阻碍 | 影响 | 对策 |
|---|---|---|---|
| H1 | 上游是 developer preview，**明确会有破坏性变更** | overlay 与 client API 会碎 | 锁 commit；升级走适配层；transport / boot 做成抗变的窄契约 |
| H2 | `__DSH_BOOT__` 与 cookie 认证绑定 HTTP | 不能直接 `file://` | P0 loopback；P1 抽 TransportDriver + 桌面握手 |
| H3 | `0.0.0.0` 被拒绝、loopback 假设写进 connection | 自定义协议 / 非 loopback 会 403 | desktop profile 改 trust；不要复用 web 的 Host 围栏 |
| H4 | 动态 client 插件从 `/plugins/<id>/client.js` 加载 | 离线包、asarnasar 校验、路径映射 | 打包时固化插件图；IPC 提供 `loadClientPlugin(id)` |
| H5 | Landlock / Seatbelt / Win ACL + Electron 签名 | Linux addon、macOS 公证、Windows 策略 | Host 用独立 Node；CI 三平台各打一次沙箱冒烟 |
| H6 | node-pty 与 Electron ABI | 终端是 IDE 标配 | 预编译；Host 独立 Node 可降低风险 |
| H7 | 无 Git 一等工具 | 对标 Cursor SCM 要从零做 | P1 用 bash + 状态栏分支；P3 再做面板 |
| H8 | Web 无文件树 / 编辑器 | 「桌面版」若只包浏览器，产品不成立 | 路线图把 P1 Workbench 当最小 IDE，而不是无限打磨 P0 |
| H9 | 同一用户 Agent 非 VM | 误操作仍能伤机器 | 默认 `workspace-write`；危险模式二次确认；桌面把 preset 放状态栏 |
| H10 | 包体积与内存 | Electron + Node Host 双运行时 | Host 按需拉起；单实例；渲染进程一张工作台 |
| H11 | 上游禁止第三方 Node 入口 | 不能把 Cordis 塞进 Electron main | 永远 spawn `dsh` |
| H12 | client 与 workbench 两套快捷键 | 输入框抢键 | 焦点域：编辑器 / 终端 / Agent composer 三套 keymap |
| H13 | 中文 Windows 路径、macOS TCC、Linux 无 zenity | 选目录 / 开文件失败 | 已有 native/browse 双后端；Electron dialog 为第三后端 |
| H14 | Tab 补全、向量索引无现成上游 | 无法第一年做满 Cursor | 产品叙事先打「可组合 Agent IDE」，补全列为 P3+ |
| H15 | 许可证 | 上游 MIT；Monaco / Electron / xterm 需 NOTICE | 沿用并扩展 `THIRD_PARTY_NOTICES` |

---

## 9. 落地路线图

总原则：**先保功能，再融编辑器，再追 Cursor 主路径。** 每个阶段都有可演示的安装包。

```text
P0  桌面壳 + 完整 Harness     3–4 周     可分发，功能 = 今天的 dsh web
P1  Workbench 最小 IDE        6–8 周     树 + 编辑器 + 终端 + Agent 同屏
P2  Agent ↔ 编辑器融合        6–8 周     diff / apply / Cmd+K / @选区
P3  Cursor 主路径             8–12 周    Git、MCP UI、Rules、检索、多窗
P4  硬化与分发                持续       签名、更新、无障碍、性能、上游跟随
```

### P0 — 原生壳（约 3–4 周）

**范围**

- Electron 壳、三平台打包
- 子进程拉起 `dsh --profile desktop`（先等价 `web --no-open`）
- 窗口加载完整 Web UI
- 系统菜单、单实例、托盘可选
- 首次运行 API Key 引导
- 自动更新骨架

**验收**

- 四种 preset、Trajectory、审批、设置、会话恢复与 Web 一致
- 不打开系统浏览器
- macOS / Windows / Linux 各一份包能装能开

**不做**：自研编辑器。

### P1 — 工作台（约 6–8 周）

**范围**

- 资源管理器、Monaco 多 Tab、保存 / 脏标记
- 命令面板、键位、主题
- 集成终端
- Agent 从全屏 webview 降为右侧槽位（仍可全屏）
- TransportDriver 立项，loopback 仍可回退
- Electron 目录选择器接入 `directory-picker` 缝

**验收**

- 打开本仓库，手改文件 + Agent 对话同时可用
- 终端 cwd 为项目根
- 刷新 / 重启后布局与会话都在

### P2 — 融合（约 6–8 周）

**范围**

- IPC bridge 切为主路径，去掉 Agent webview
- 变更集 + diff 审阅
- `@file` / 当前选区 / 打开 Tab
- `Cmd+K` 行内编辑
- 状态栏：沙箱、模型、preset、Host 连接
- 钥匙串凭证

**验收**

- 「让 Agent 改一个函数 → 看 diff → 终端跑测试」不离开窗口
- 模型可见上下文全部可在 Trajectory 回放
- 杀掉 Host 再拉起，会话不丢

### P3 — 对标主路径（约 8–12 周）

**范围**

- Git：状态、diff、暂存、提交、推送（可先封装 git CLI）
- MCP 服务器配置 UI
- 项目 Rules / Skills 编辑入口
- 工作区文件搜索（复用 ripgrep）+ 符号大纲
- 多窗口、拖出 Agent 窗
- 基础代码库索引（文件 / 符号，不做大模型 Tab）
- 可选：打开 LSP 插件作为编辑器智能感知

**验收**

- 日常写代码不再需要再开 VS Code / Cursor 才能完成「改、测、提交」

### P4 — 硬化

- 公证 / 签名、自动更新、崩溃还原
- 启动时间、内存、大仓库文件树虚拟化
- 无障碍与高对比
- 上游月度升级列车
- 评估是否引入 Code-OSS（仅当扩展生态成为明确需求）

### 人力假设

| 角色 | 人数 | 主责 |
|---|---|---|
| 桌面壳 / 打包 | 1 | Electron、CI、签名 |
| Workbench | 1–2 | 编辑器、树、终端、命令面板 |
| Agent 集成 | 1 | profile、transport、client 嵌入、diff |
| QA | 0.5–1 | 三平台 + 上游回归 |

单人也可以按 P0 → P1 纵向切片，但 P2 的 transport 与 diff 不建议并行换人重写。

### 里程碑与决策门

| 门 | 通过才进入下一阶段 |
|---|---|
| G0 | 本文技术选项确认（Electron、不 fork Code-OSS、子进程 Host） |
| G1 | P0 包在三平台跑通四种 preset |
| G2 | Transport 契约测试绿，webview 可删 |
| G3 | P2 主路径演示：改代码 → diff → 测试 |
| G4 | 是否立项 Code-OSS / Tab 补全（独立决策，默认否） |

---

## 10. 建议的项目落地顺序（确认后执行）

1. 建 pnpm workspace（本仓库根目录），把上游收为 `harness/` submodule 并锁 commit。
2. 实现 `apps/shell` + `desktop` profile，P0 嵌入现有 Web。
3. 抽 `TransportDriver` 并写契约测试。
4. 做 Workbench 最小闭环（树 / 编辑器 / 终端）。
5. 嵌 `dsh-client` 到 Agent 槽，接上下文与 diff。
6. 三平台 CI 打包与沙箱冒烟。
7. 再开 P3 功能。

---

## 11. 需要你确认的决策

请按条回复「同意 / 调整」：

1. **产品定位**：本地 AI IDE，Agent 内核 = DeepSeek Harness，而不是「把 dsh web 装进窗口」。
2. **壳**：Electron，不用 Tauri。
3. **编辑器**：V1 用 Monaco 自研 Workbench，不 fork Code-OSS。
4. **Host**：永远子进程执行 `dsh --profile desktop`，不把 Cordis 塞进 Electron main。
5. **仓库**：桌面代码在本仓库根目录，上游保持 `harness/` submodule，尽量 overlay。
6. **节奏**：P0 先出可装包保功能，P1/P2 再对标 Cursor 主路径。
7. **密钥**：桌面用系统钥匙串，会话数据与 `dsh web` 共享 `~/.dsh`。
8. **产品名**：暂用 DeepSeek Harness Desktop；若要另一名字（例如自有品牌），现在定。

确认以上决策后，再开始按 P0 做完整实现。
