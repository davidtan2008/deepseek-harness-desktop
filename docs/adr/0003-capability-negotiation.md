# ADR 0003：用版本化 capability manifest 做能力发现

- 状态：Accepted（第一步已实现，动态 registry 计划中）
- 日期：2026-09-24
- 相关代码：`packages/shared/src/capabilities.ts`、`packages/shared/src/api.ts`、`apps/shell/src/ipc.ts`

## 背景

桌面端未来会同时面对 Harness、ACP、CLI 和外部 coding agent。每个 provider 支持的模型、取消、恢复、diff、插件和权限不同；如果 UI 通过硬编码或 feature flag 猜测，用户会看到“按钮存在但运行失败”的状态。

## 决策

桌面 contract 提供版本化 `DesktopCapabilities` snapshot。能力有 `available`、`degraded` 或 `unavailable` 状态、实现标识和可选原因。Renderer 只能通过 `DesktopApi` 读取它；adapter 和插件应基于 capability negotiation 启用功能，不支持的能力返回结构化 `unsupported`。

## 当前实现与限制

- `app.capabilities` 已通过共享类型和 preload 暴露。
- Host managed/adopted mode、iframe surface 和开发/打包状态进入 manifest。
- 目前多数 feature 状态仍是静态描述；下一步要接入真实 backend/provider probe，并在 Host 状态变化时刷新。
- manifest 是能力发现，不是授权；安全边界仍由 IPC、路径 broker、Host approval 和 OS sandbox 强制执行。

## 结果

- UI 和插件可以显示真实降级状态，而不是伪装成功。
- contract 可以在不改变业务语义的情况下增加 capability id/字段版本。
- 兼容矩阵和测试需要维护 capability version。
- 不能为了“全部 available”而把尚未验证的 updater、extension 或 Agent diff 标为可用。

## 放弃的替代方案

- 只在 UI 中写 feature flag：无法跨 adapter 协商。
- 暴露任意 service map：扩大 Renderer 和第三方插件权限。
- 以插件存在推断 capability 存在：插件声明不等于运行时 provider。
