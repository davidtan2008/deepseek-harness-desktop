# ADR 0004：先评估复用上游 Desktop，再扩展外层 Workbench

- 状态：Proposed
- 日期：2026-09-24
- 相关文档：`docs/market-research.md`、`docs/roadmap.md`、`harness/apps/desktop/README.md`

## 背景

当前 Harness pin 已經包含上游 `apps/desktop`、`desktop-host`、连接/会话/工作区变更和交付物 UI。随着上游 Desktop 成熟，外层 DHD 如果继续复制 Host loader、认证、Profile 初始化、runtime tree 和更新逻辑，会产生安全与升级债务。

## 决策门

在实现完整 TransportDriver 或第二套插件管理之前，必须做一个可重复的 upstream-first spike：

1. 用当前 gitlink 启动上游 Desktop，记录启动、Profile、Session、workspace changes 和 shutdown contract。
2. 列出 DHD Workbench 真正需要的最小 upstream service/client seam。
3. 比较“复用上游 Desktop Host”与“保留兼容 iframe adapter”的成本、升级风险和 UI 自由度。
4. 写出采用/拒绝结论和回滚路径 ADR；未完成前不删除现有 fallback。

## 可能结果

- **复用上游 Desktop runtime**：DHD 专注 Agent-native Workbench、review、provider UX 和社区发行。
- **保留兼容 adapter**：仅在上游 seam 不足以支持 per-window generation/change projection 时保留，并严格限制私有依赖。
- **贡献上游**：若 DHD 需要的核心能力属于 Harness，优先向上游提交，而不是在外层长期分叉。

## 非目标

本决策不要求立即切换 Electron/Tauri、不要求复制上游 UI，也不把“官方已有源码”当成公开稳定插件 API。
