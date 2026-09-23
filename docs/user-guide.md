# 用户指南

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
| `Cmd/Ctrl+S` / `Cmd/Ctrl+Alt+S` | 保存 / 全部保存（默认自动保存延迟 800ms） |
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

**行内编辑（Cmd/Ctrl+K）**：选中代码 → 输入指令（如“加错误处理”）→ DeepSeek 返回替换文本，确认后写回编辑器。需先配置 API Key。

**集成终端**：真实 PTY（node-pty），支持系统默认 shell；环境异常时自动回退管道模式。

**源代码管理**：状态、diff、暂存/取消暂存、提交、推送、拉取、分支切换。

**搜索**：文件名快开 + 全局内容搜索（ripgrep 加速，无 rg 时回退文件系统遍历；自动忽略 node_modules/.git/dist 等）。

**MCP**：设置 → MCP 面板添加 server（stdio 或 streamable-http），保存至 `~/.dsh/desktop-mcp.patch.yml`，重启 Host 后生效。

**Rules / Skills**：Rules 面板打开项目的 `AGENTS.md`；Skills 管理 `~/.dsh` 下的 skill 目录，与 CLI/Web 版完全互通。

## 5. 设置项

| 设置 | 默认值 | 说明 |
|---|---|---|
| 主题 | dark | system 跟随系统 |
| 字体/字号/缩进 | 系统等宽 / 13 / 2 | 编辑器与终端 |
| 自动保存 | afterDelay（800ms） | 可关闭 |
| 沙箱模式 | workspace-write | 对应 Host 的 permission preset |
| 默认 Agent 模式 | standard | 新会话初始模式 |
| 默认模型 | deepseek-chat | — |
| 终端 Shell | 系统默认 | 可指定路径 |

设置持久化在 `~/Library/Application Support/deepseek-harness-desktop/settings.json`（macOS；其他平台对应 userData 目录），窗口布局（侧边栏/面板宽度、可见性）一并记忆。

## 6. 数据存储位置

| 数据 | 位置 |
|---|---|
| 应用设置与窗口布局 | Electron `userData`/settings.json |
| API Key（加密） | `userData`/credentials.bin + `~/.dsh/.credentials.yaml` |
| MCP 配置 | `~/.dsh/desktop-mcp.patch.yml` |
| 会话日志 / Skills（Host 侧） | `~/.dsh/`（`DSH_HOME` 可覆盖） |

## 7. 常见问题

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

**重置应用**：删除 `userData` 目录（macOS：`~/Library/Application Support/deepseek-harness-desktop`）与 `~/.dsh/`（会丢会话历史，慎操作）。
