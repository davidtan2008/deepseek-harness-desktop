# ADR 0001：保持外部 Harness Host 与桌面壳的进程边界

- 状态：Accepted（当前实现）
- 日期：2026-09-24
- 相关代码：`apps/shell/src/host.ts`、`apps/shell/src/main.ts`、`docs/architecture.md`

## 背景

Harness 是 Node/Cordis Agent runtime，包含动态插件、原生依赖、沙箱、工具和持久 Session。把它直接挂载到 Electron Main 会把 Agent 崩溃、权限和依赖问题带入桌面窗口生命周期，也会绕开上游应用入口约束。

## 决策

DHD 通过外部 Node 进程启动或采用 `dsh web` Host。Main 只观察 Host 状态、解析 ready URL、管理自有进程的退出，并通过受限桌面服务提供平台能力。Renderer 不执行 Agent 工具。

## 结果

- Agent runtime 崩溃不必直接摧毁 Electron Main。
- CLI/Web 的 Session 和 `$DSH_HOME` 语义可以共享。
- 需要维护 Host 启动参数、ready line、token、route 和 pin 兼容测试。
- 不能把 Main 的任意系统能力自动开放给 Agent；审批和沙箱仍由 Host/平台负责。
- 外部 `DHD_HARNESS_URL` Host 不由 DHD 终止。

## 放弃的替代方案

- **Main 内 in-process Cordis**：生命周期和权限边界过于集中，拒绝。
- **只打开外部浏览器**：不能形成 IDE 工作台，拒绝。
- **复制 Agent loop**：会分叉上游语义，拒绝。
