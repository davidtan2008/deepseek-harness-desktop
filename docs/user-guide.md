# 用户指南

> **状态说明（2026-09-24）**：本文描述当前源码预览。Agent 面板仍是 Harness Web UI 的 `<iframe>`；Changes 是仓库级 Git diff；`autoSave`、`defaultModel`、`defaultPreset` 和 `sandboxMode` 中部分设置尚未接入实际行为。完整证据和限制见 [支持矩阵](support-matrix.md)，目标路线见 [路线图](roadmap.md)。

## 1. 安装与首次启动

当前为源码发行（v0.1.x），安装包分发在路线图中：

```sh
git clone --recursive git@github.com:davidtan2008/deepseek-harness-desktop.git
cd deepseek-harness-desktop
pnpm install
cd harness && pnpm install && pnpm run build && cd ..   # 初始化 Agent Host
pnpm dev
```

首次启动后建议：

1. **配置 API Key**：`Cmd/Ctrl+,` 打开设置 → 凭证 → 填入 DeepSeek API Key。密钥加密存储于系统钥匙串，并同步到 `~/.dsh/.credentials.yaml` 供 Host 使用。
2. **打开项目**：欢迎页选择最近项目、克隆仓库，或 `Cmd/Ctrl+O` 打开本地文件夹。

## 2. 界面布局

```
┌──┬────────────┬──────────────────────┬──────────────┐
│活│  侧边栏      │      编辑器区          │   Agent 面板  │
│动│ Explorer   │  Monaco 多 Tab        │  (dsh web)   │
│栏│ Search     │                      │              │
│  │ SCM        │                      │              │
│  │ Rules/MCP  │                      │              │
├──┴────────────┴──────────────────────┴──────────────┤
│              面板区：终端 / 输出 / 变更                  │
└─────────────────────────────────────────────────────┘
```

活动栏切换：资源管理器 / 搜索 / 源代码管理 / Agent / Rules / MCP / 设置。

## 3. 快捷键

| 快捷键 | 功能 |
|---|---|
| `Cmd/Ctrl+P` | 快速打开文件（Go to File） |
| `Cmd/Ctrl+Shift+P` | 命令面板 |
| `Cmd/Ctrl+K` | 行内编辑（选区 + 自然语言指令） |
| `Cmd/Ctrl+S` / `Cmd/Ctrl+Alt+S` | 保存 / 全部保存（`autoSave` 目前只持久化，尚未实现自动写入） |
| `Cmd/Ctrl+W` | 关闭当前 Tab |
| `Cmd/Ctrl+B` | 切换侧边栏 |
| `Cmd/Ctrl+L` | 切换 Agent 面板 |
| `Cmd/Ctrl+Shift+L` | 聚焦 Agent |
| `Cmd/Ctrl+J` | 切换底部面板 |
| `Ctrl+`` ` | 新建终端；`Cmd/Ctrl+`` ` 切换终端面板 |
| `Cmd/Ctrl+O` | 打开文件夹 |
| `Cmd/Ctrl+Shift+N` | 新窗口 |
| `Cmd/Ctrl+,` | 设置 |

## 4. 核心功能

**Agent 面板**：内嵌完整 `dsh web`——四种 Agent 模式（标准 / PTC / 极简 / 创造）、会话 Trajectory、工具审批、Skills、`@` 引用全部可用。编辑器中选中代码后点击“发送选区”，内容进入剪贴板并尝试注入 Agent 输入框。状态点实时反映 Host 状态（绿=已连接 / 黄=启动中 / 红=错误，悬停看原因）。

**行内编辑（Cmd/Ctrl+K）**：选中代码 → 输入指令（如“加错误处理”）→ 当前实现直接调用 DeepSeek Chat Completions 并写回编辑器；它尚未进入 Harness Session、审批或 per-turn diff 流程。需先配置 API Key。

**集成终端**：真实 PTY（node-pty），支持系统默认 shell；环境异常时自动回退（python 桥 → macOS `script` → 管道 shell）。**终端会话常驻**：切换底部 Tab（终端 / 变更 / 问题 / 输出）不会结束 shell——回到终端 Tab 时自动重连并回放离开期间的输出（最多 256KB）；切换项目或关闭窗口才会结束会话。zsh 等登录 shell 加载 dotfiles 需要约 1 秒，首次提示符稍有延迟属正常现象。

**源代码管理**：状态、diff、暂存/取消暂存、提交、推送、拉取、分支切换。

**搜索**：文件名快开 + 全局内容搜索。内容搜索走 `rg --json` 流式解析，文件名枚举走 `rg --files`，均自动忽略 node_modules/.git/dist 等目录并尊重 .gitignore；未安装或无法启动 ripgrep 时回退 JS 文件系统遍历（慢 2~3 个数量级，建议 `brew install ripgrep`）。搜索过程显示实时命中数（250ms 节流），内容结果先渲染、文件名结果随后补充，可随时停止并保留已命中的部分结果；搜索启动或运行失败会显示错误，不会伪装成“没有匹配”。

**MCP**：设置 → MCP 面板添加 server（stdio 或 streamable-http），保存至 `~/.dsh/desktop-mcp.patch.yml`，重启 Host 后生效。

**Rules / Skills**：Rules 面板打开项目的 `AGENTS.md`；Skills 管理 `~/.dsh` 下的 skill 目录，与 CLI/Web 版完全互通。

## 5. 设置项

| 设置 | 默认值 | 说明 |
|---|---|---|
| 主题 | dark | system 跟随系统 |
| 字体/字号/缩进 | 系统等宽 / 13 / 2 | 编辑器与终端 |
| 自动保存 | afterDelay（800ms） | 设置已保存；当前 Workbench 尚未按该值自动写盘 |
| 沙箱模式 | workspace-write | 桌面偏好；实际 permission preset 仍以 Host/profile 为准 |
| 默认 Agent 模式 | standard | 桌面显示偏好；尚未证明已转发为 Host effective preset |
| 默认模型 | deepseek-chat | 桌面显示偏好；实际模型由 Host/provider 配置决定 |
| 终端 Shell | 系统默认 | 可指定路径 |

设置持久化在 `~/Library/Application Support/deepseek-harness-desktop/settings.json`（macOS；其他平台对应 userData 目录），窗口布局（侧边栏/面板宽度、可见性）一并记忆。

## 6. 环境变量

| 变量 | 用途 |
|---|---|
| `DHD_HARNESS_ROOT` | 指定 Harness checkout |
| `DHD_HARNESS_URL` | 复用 loopback Host；桌面不会终止外部 Host |
| `DHD_ALLOW_REMOTE_HOST=1` | 仅诊断时允许远程 Host，正常使用不要开启 |
| `DHD_USER_DATA` | 隔离开发实例的 Electron userData |
| `DHD_WORKBENCH_PORT` | 隔离开发实例的 Vite 端口 |
| `DHD_ALLOW_MULTIPLE=1` | 开发/测试时绕过单实例锁 |
| `RIPGREP_PATH` | 指定 ripgrep |

## 7. 数据存储位置

| 数据 | 位置 |
|---|---|
| 应用设置与窗口布局 | Electron `userData`/settings.json |
| API Key（加密） | `userData`/credentials.bin + `~/.dsh/.credentials.yaml` |
| MCP 配置 | `~/.dsh/desktop-mcp.patch.yml` |
| 会话日志 / Skills（Host 侧） | `~/.dsh/`（`DSH_HOME` 可覆盖） |

## 8. 常见问题

**Agent 面板一直“正在启动”或报错**

- 错误提示要求 install/build：进入 `harness/` 执行 `pnpm install && pnpm run build`。
- 提示 3080 端口已有 Host：桌面端需要启动时打印的**完整 URL（含 ?token=）**。要么 `export DHD_HARNESS_URL='http://127.0.0.1:3080/?token=...'` 后重启应用复用它，要么关掉该进程让桌面端自行拉起。
- 用的是旧目录布局的 harness：设置环境变量 `DHD_HARNESS_ROOT` 显式指向它。

**Host 定位到了错误的 harness 副本**

探测顺序：`DHD_HARNESS_ROOT` → 仓库内 `harness/` 子模块（已安装依赖）→ 旧同级目录 → 仅源码的子模块 → 打包内置。用 `DHD_HARNESS_ROOT` 一锤定音。

**Electron 下载超时（国内网络）**

```sh
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
pnpm install
```

**搜索很慢 / 搜不到内容**

- 先确认 ripgrep 已安装：终端执行 `rg --version`。未安装时 `brew install ripgrep`（内容搜索从秒级降到毫秒级）。
- 主进程只在启动时探测一次 rg；安装 rg 后需重启应用。
- GUI 启动的应用 PATH 与终端不同，主进程会额外探测 `/opt/homebrew/bin`、`/usr/local/bin` 等常见位置，brew 安装无需额外配置；自定义位置可用环境变量 `RIPGREP_PATH` 指定。
- 注意：搜索遵循 .gitignore，被忽略的文件（build 产物、依赖目录等）不在结果中。

**终端行为异常**

- "[process exited 0]" 反复出现且 shell 无法交互：多为旧版本已知问题（切 Tab 即杀会话），升级到 ≥ 此修复版本后终端会话常驻，切 Tab 不再结束 shell。
- 终端启动慢：zsh/bash 登录 shell 需加载 dotfiles（nvm/conda 等初始化重时约 1 秒），属正常。
- 原生 PTY 不可用（如 spawn-helper 权限异常）时自动回退 python 桥 / `script` / 管道 shell，管道模式下无颜色与交互能力，可查看 输出 面板的日志确认当前后端。

**重置应用**：删除 `userData` 目录（macOS：`~/Library/Application Support/deepseek-harness-desktop`）与 `~/.dsh/`（会丢会话历史，慎操作）。

**关闭窗口后退出很慢**

- macOS 关闭窗口默认只关闭工作台，Host 会在 Dock 应用仍存活时继续运行；从 Dock 的“退出”触发完整清理。
- 退出会先停止项目监听、搜索、终端会话和自有 Harness Host，等待子进程退出后再结束 Electron；不需要手动结束 Vite 或 Host 进程。

## 9. 已知问题与排查记录

以下问题已在当前版本修复，记录根因供后续排查同类问题参考（架构与生命周期说明见 [docs/architecture.md](architecture.md)）：

1. **终端切 Tab 后报 "[process exited 0]"（已修复）**：根因是旧设计"终端面板卸载即杀会话"与 React StrictMode 双挂载叠加——kill 必然落在 shell 启动窗口内（zsh 首个提示符需 0.8~1.4s，kill 在 spawn 后几毫秒内即发生），此时被杀的 shell 恰好以 exitCode 0 退出，呈现为"[process exited 0]"。现改为会话常驻 + 重连回放模型（`pty.acquire`），切 Tab 不再影响会话。
2. **安装 ripgrep 后搜索显示无结果（已修复）**：内容命中实际 250ms 内已就绪，但文件名枚举存在 O(n²) 性能缺陷（全量结果逐行重过滤，万级文件仓库需 ~50s），而面板等两路结果齐了才渲染，导致"永远搜不到"。现文件名枚举改为增量计数，内容结果独立先行渲染。
3. **Electron 搜索报 `spawn EBADF`（已修复）**：旧项目监听器为每个文件保留一个 fd；大仓库耗尽 Electron 的可用 fd 后，搜索和 Git 的子进程都无法创建。现使用原生递归目录监听，并让搜索在 ripgrep 启动/运行失败时回退 JS 遍历。
4. **关闭窗口后 Dock 退出很慢（已修复）**：旧退出路径异步丢弃 Host/PTY 清理请求，且没有关闭文件监听。现由主进程统一取消任务、停止进程组并等待退出，清理完成后才放行 Electron 退出。
