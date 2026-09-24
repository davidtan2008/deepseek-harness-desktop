# ADR 0005：先定义 Agent Transport contract，再实现 turn loop

- 状态：Accepted（contract 已实现，driver 实现从 R2 垂直切片开始）
- 日期：2026-09-24
- 相关代码：`packages/shared/src/agent-transport.ts`、`packages/shared/src/capabilities.ts`、`docs/roadmap.md`

## 背景

DHD 当前把 Harness Web UI 放在 tokenized iframe 中。这个 surface 能显示 Agent，但不能给 Workbench 一个稳定、可取消、可恢复、可归因的 turn API。直接把 iframe 的 DOM、localStorage 或私有 HTTP route 暴露给所有插件，会把兼容实现误变成公共 contract。

## 决策

`DesktopCapabilities` contract 升至 v2，以携带 transport descriptor；先建立可序列化的 `AgentTransportDescriptor` 和 `AgentTransportDriver` contract：

- `connect` 负责 generation/连接状态；
- `sendTurn` 接收带结构化 context 的 turn；
- `cancel`、`resume` 明确表示控制权；
- `subscribe` 只发布 turn/tool/approval/projection 事件；
- capability snapshot 必须声明当前 transport 是否支持每个操作；
- 不支持的能力返回结构化 `unsupported`，不静默降级。

当前实现只登记 `managed-iframe` / `external-loopback` descriptor：`sendTurn`、`cancel`、`resume` 和 change projection 均为 `false`，选区注入明确标为 `clipboard-fallback`。纯 `AgentTurnController` 状态机已通过 contract fixture 验证；`UpstreamHostIpcConnection` 已接入真实 upstream Host lifecycle IPC，但默认 `AgentSessionPort` 仍返回结构化 `unsupported`，尚未接入真实 turn/session channel。这比把“有一个 iframe”标成完整 Agent API 更诚实。

## 边界

- Harness 继续拥有 Agent loop、Session、工具、审批和 sandbox。
- DHD Main 拥有 transport generation、订阅和 dispose。
- Renderer 只通过 `DesktopApi`/capability snapshot 获取 transport，不接触 Electron 或任意 IPC channel。
- 未来 `host-ipc`、`acp` 和 CLI adapter 实现同一 contract，但不能用私有上游路径作为稳定公共 API。

## 迁移顺序

1. 用当前 iframe adapter 实现只读/状态 descriptor；
2. 为 upstream Desktop Host 增加结构化 IPC adapter；
3. 实现 Turn Controller、取消/恢复和 Session 恢复；
4. 将 context sources 与 change projection 接入；
5. 再评估 ACP/第二个 provider。

在上述行为和测试完成前，不删除 iframe fallback，也不宣传 Cursor-grade 原生 Agent 融合。
