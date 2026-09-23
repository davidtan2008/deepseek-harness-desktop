# Changelog

本项目的所有显著变更都记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

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
