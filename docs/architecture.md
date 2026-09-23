# 架构文档（As-Built）

> 本文描述**当前代码的实际架构**，与代码同步维护。设计动机与演进路线见 [design.md](design.md)；用户视角的功能说明见 [user-guide.md](user-guide.md)。

## 1. 总览

```
┌─────────────────────────────────────────────────────────────────┐
│  Electron Main（apps/shell）                                     │
│  窗口/菜单/单实例 · IPC 注册表 · fs/git/search/pty/mcp/凭证服务     │
└────────────┬──────────────────────────────┬─────────────────────┘
             │ preload 白名单 IPC            │ spawn (子进程)
             ▼                              ▼
┌─────────────────────────────┐   ┌──────────────────────────────┐
│  Workbench Renderer         │   │  dsh Host（harness/ 子模块）    │
│  React 18 + Vite 6          │   │  node --import tsx/esm        │
│  Monaco · xterm · 命令面板    │◄──┤  apps/cli/src/bin.ts web      │
│  AgentPanel(iframe→Host URL)│   │  --patch <mcp> --port 0       │
└─────────────────────────────┘   └──────────────────────────────┘
        iframe 加载 Host URL（loopback HTTP + ?token=）
```

三个进程各司其职：

| 进程 | 技术栈 | 职责 | 禁止事项 |
|---|---|---|---|
| Main | Electron 36 + TypeScript | 窗口/菜单生命周期、IPC 分发、系统能力服务、拉起并守护 Host | 不执行 Agent 工具、不改会话日志 |
| Renderer | React 18 + Vite 6 + Monaco + xterm | 工作台 UI、编辑器、终端视图、Agent 面板 | 无 Node 集成，仅 preload 白名单 API |
| dsh Host | 上游 Harness（Cordis 插件树） | Agent loop、工具执行、沙箱、会话持久化 | 桌面端不 fork、不改其源码 |

## 2. 模块地图

```
apps/shell/src/
├── main.ts            # 启动：单实例锁(--folder=)、窗口注册表、Host 生命周期、updater
├── windows.ts         # BrowserWindow：contextIsolation:true / nodeIntegration:false
│                      #   / webviewTag:true / hiddenInset 标题栏(mac)
├── menu.ts            # 应用菜单 → 'menu:command' 事件下发给渲染层
├── ipc.ts             # IPC 注册表（唯一 ipcMain 入口）+ chokidar 项目监听
├── host.ts            # HostProcess：子进程状态机（见 §4）
├── paths.ts           # 路径解析：harness 探测、DSH_HOME、设置/MCP 文件位置
├── fs-service.ts      # 目录/文件读写/重命名/删除/系统对话框/在 OS 中显示
├── git-service.ts     # git CLI 封装：status/diff/stage/commit/push/pull/branch/log
├── search-service.ts  # ripgrep 优先，缺失时回退文件系统遍历
├── pty-service.ts     # node-pty 集成终端，加载失败回退管道 shell（Windows 走 pty-bridge）
├── mcp-service.ts     # MCP server 配置读写 → ~/.dsh/desktop-mcp.patch.yml
├── settings-store.ts  # 应用设置持久化 → userData/settings.json
├── credentials.ts     # API Key：safeStorage 加密 + 同步 ~/.dsh/.credentials.yaml
├── inline-edit.ts     # Cmd+K 行内编辑 → DeepSeek chat/completions
├── updater.ts         # electron-updater（仅打包后启用，GitHub provider）
└── preload.ts         # contextBridge 暴露白名单 API（Renderer 唯一入口）

apps/workbench/src/
├── state.tsx          # AppProvider：React Context 全局状态（EditorTab/Host/设置/面板）
├── Workbench.tsx      # 五区布局：Activity Bar/Sidebar/Editor/Agent/Panel
├── Explorer.tsx       # 文件树（fs:changed 驱动刷新）
├── EditorArea.tsx     # Monaco 多 Tab 编辑器（自动保存、脏标记）
├── TerminalPanel.tsx  # xterm.js ↔ pty:data/pty:exit 事件流
├── ScmPanel.tsx       # Git 状态/暂存/提交/推送
├── SearchPanel.tsx    # 文件名 + 内容搜索
├── CommandPalette.tsx # Cmd+Shift+P 命令面板 / Cmd+P 快开
├── InlineEdit.tsx     # Cmd+K 浮层：选区+指令 → inlineEdit.run → 补丁写回
├── AgentPanel.tsx     # iframe 加载 Host URL；发送选区（剪贴板+postMessage）
├── SettingsPanels.tsx # 设置/凭证/MCP/Rules 各面板
├── ChangesPanel.tsx   # 变更视图
├── Welcome.tsx        # 欢迎/最近项目/克隆仓库
└── Sash.tsx           # 可拖拽分割条

packages/shared/src/
├── protocol.ts        # IPC 通道枚举、事件类型映射、AppSettings/HostState 等契约类型
└── index.ts           # 常量（PRODUCT_*/PROTOCOL/CREDENTIAL_REF）与工具函数
```

## 3. IPC 契约

契约的**唯一真源**是 `packages/shared/src/protocol.ts`。Renderer 通过 preload 暴露的 `dhd()` API 调用，Main 侧在 `ipc.ts` 集中注册。

**请求通道（Renderer → Main，`ipcMain.handle`）**

| 前缀 | 通道 | 说明 |
|---|---|---|
| `app.` | version / platform / settings.get / settings.set | 应用信息与设置 |
| `window.` | minimize / maximize / close / new / setTitle | 窗口控制 |
| `project.` | openDialog / open / clone / recent | 项目打开、克隆、最近列表 |
| `fs.` | readDir / readFile / writeFile / stat / mkdir / createFile / rename / remove / reveal | 文件系统 |
| `search.` | files / content | 快开过滤 / 全局内容搜索 |
| `git.` | status / diff / stage / unstage / commit / push / pull / checkout / branches / log | SCM |
| `pty.` | create / write / resize / kill | 终端会话 |
| `host.` | status / restart | Host 查询与重启 |
| `credentials.` | has / set / clear | API Key |
| `mcp.` | list / save | MCP 配置 |
| 其他 | rules.list / inlineEdit.run / dialog.openFiles / dialog.saveFile / shell.openExternal | Rules、行内编辑、对话框、外链 |

**事件通道（Main → Renderer，`webContents.send`）**

| 通道 | 载荷 | 触发源 |
|---|---|---|
| `host:changed` | `HostState` | host.ts 状态机每次迁移 |
| `settings:changed` | `AppSettings` | 设置写入后广播 |
| `fs:changed` | `{ path, type }` | chokidar 监听项目目录（忽略 node_modules/.git/dist/out，深度 8） |
| `pty:data` / `pty:exit` | `{ id, data/exitCode }` | 终端输出与退出 |
| `menu:command` | `string` | 菜单/快捷键命令（渲染层再以 DOM CustomEvent `dhd-menu` 分发） |

## 4. Host 生命周期（`host.ts`）

状态机：`stopped → starting → ready | error`，每次迁移广播 `host:changed`。

**启动决策**：

1. `DHD_HARNESS_URL` 环境变量存在且合法 → 直接采用（复用已运行的 `dsh web`，含 token）
2. 否则定位 harness 根目录（`paths.ts` 探测，见 §5），spawn：

```sh
node --import tsx/esm <harness>/apps/cli/src/bin.ts web [--patch ~/.dsh/desktop-mcp.patch.yml] --no-open --port 0
```

3. 解析 stdout 中 `dsh web: <url>` 行得到带 token 的 URL → `ready`；90 秒超时或进程先退 → `error`（附诊断提示：3080 端口已有 Host 需带 token 复用、或子模块未 install/build）

**关键细节**：`--patch` 是 launcher 级参数必须紧跟 `web`；`--port 0` 由 OS 分配空闲端口，不与已有 `dsh web` 冲突；退出时 SIGTERM 优雅停止，4 秒后 SIGKILL。

## 5. Harness 根目录探测（`paths.ts`）

| 顺序 | 候选 | 条件 |
|---|---|---|
| 1 | `$DHD_HARNESS_ROOT` | 存在即用（显式覆盖） |
| 2 | `<repo>/harness/`（子模块） | 入口存在**且** `node_modules` 已安装（ready） |
| 3 | `<repo>/../deepseek/deepseek-harness` | 旧版同级布局，同 ready 条件 |
| 4 | `<repo>/harness/` | 仅源码也接受（启动时提示 install/build） |
| 5 | `resources/harness` | 打包产物内置 |

"ready" 判定依据：Host 通过 `node --import tsx/esm` 直接运行 TS 源码，tsx 与 workspace 依赖必须能从 harness 的 `node_modules` 解析。

## 6. 安全模型

- **进程隔离**：`contextIsolation: true`、`nodeIntegration: false`；Renderer 只见 `contextBridge` 暴露的白名单方法，通道枚举在共享包中静态收口。
- **凭证**：API Key 经 `safeStorage` 加密存 `userData/credentials.bin`（回退明文时文件权限 0600），并同步写入 `~/.dsh/.credentials.yaml`（`DEEPSEEK_API_KEY` ref，权限 0600）供 CLI/Host 侧读取。
- **Agent 沙箱**：沙箱与审批由上游 Host 执行（Linux bwrap/Landlock、macOS Seatbelt、Windows restricted token）；桌面端设置里的 `sandboxMode` 只是对 Host preset 的偏好。
- **网络边界**：Renderer ↔ Host 只经 loopback；Host URL 含一次性 token（`?token=...`）。

## 7. 与上游的关系

- 上游以 `harness/` submodule 锁定精确 commit，升级即移动 gitlink（见 [CONTRIBUTING](../CONTRIBUTING.md) 的 SOP）。
- 桌面定制走 overlay：MCP 配置以 `--patch ~/.dsh/desktop-mcp.patch.yml` 注入，不改上游源码。
- 数据共享：桌面与 `dsh web` 共用 `~/.dsh`（`DSH_HOME` 可覆盖），凭证、会话、Skills 互通。

## 8. 构建与打包

- **shell**：esbuild 打包为 ESM（`dist/main.js`）+ CJS preload（`dist/preload.cjs`），electron/electron-updater/node-pty/chokidar/yaml 外置；`pty-bridge.py` 复制到 dist。
- **workbench**：Vite 6 静态产物；开发时 Main 经 `ELECTRON_RENDERER_URL` 加载 5173，打包后 `loadFile` 本地 HTML。
- **electron-builder**：appId `com.deepseek.harness.desktop`；mac（dmg+zip，hardenedRuntime）、win（nsis+zip）、linux（AppImage+deb）；extraResources 携带 workbench 产物、desktop-profile overlay 与 pty-bridge.py；`publish: github` 预留自动更新流。
- **CI**：三平台矩阵执行 `pnpm install --frozen-lockfile` → shared build → typecheck → build（不依赖 harness 子模块内容）。
