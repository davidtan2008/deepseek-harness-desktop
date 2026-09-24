# ADR 0002：以 Agent Surface 和 TransportDriver 替代 iframe 绑定

- 状态：Proposed
- 日期：2026-09-24
- 相关代码：`apps/workbench/src/AgentPanel.tsx`、`docs/architecture.md`、`docs/roadmap.md`

## 背景

当前 iframe 最大化复用 Harness Web UI，但编辑器无法可靠地取得 turn、取消、工具变更和 per-turn diff。直接把上游 client 复制进 Workbench 又会造成第二个 UI 和 Session 状态。

## 决策

保留 loopback/iframe 作为兼容实现，同时定义可替换的 Agent Surface 与 TransportDriver。Renderer 只依赖稳定的连接、turn、事件、能力和 dispose contract；Harness IPC、ACP 和 CLI 是不同 provider。iframe 在 transport contract 和回归测试完成前不删除。

## 结果

- 可以逐个迁移功能而不破坏当前用户。
- capability manifest 能表达某个 adapter 不支持取消、恢复或 diff。
- 需要维护 transport contract tests、事件顺序和 generation teardown。
- 不能把“URL 能打开”当成 turn 已完成，也不能把 iframe 内的 Web UI 宣称为原生集成。

## 放弃的替代方案

- **立即重写 dsh-client**：范围大、会复制 Session/UI 语义，拒绝。
- **永远只用 iframe**：无法完成 Cursor 级 diff/context 融合，拒绝。
- **为每个 Agent 复制一套 Workbench**：维护成本和状态分裂不可接受，拒绝。
