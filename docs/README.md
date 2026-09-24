# DHD 文档索引

## 我想…

| 问题 | 入口 |
|---|---|
| AI agent 常驻规则 | [`AGENTS.md`](../AGENTS.md) · [`CLAUDE.md`](../CLAUDE.md) |
|---|---|
| 第一次运行源码 | [用户指南](user-guide.md) |
| 理解当前进程和 contract | [架构文档](architecture.md) |
| 查看当前运行环境和发布依赖 | [Runtime Manifest](runtime-manifest.md) |
| 评估上游 Desktop Host 复用方案 | [Upstream-first Evaluation](upstream-first-evaluation.md) |
| 理解 Agent turn 和变更归因 contract | [Agent Transport](adr/0005-agent-transport-contract.md) · [Host IPC Transport](host-ipc-transport.md) · [Context Sources](context-sources.md) · [Change Projection](change-projection.md) |
| 判断某功能是否已交付 | [支持矩阵](support-matrix.md) |
| 了解产品定位和竞品 | [市场调研](market-research.md) |
| 参与开发或接手 AI agent 任务 | [AI Agent 开发指南](agent-development.md) · [`llms.txt`](../llms.txt) |
| 查看下一阶段 | [路线图](roadmap.md) |
| 了解为什么这样设计 | [ADR 目录](adr/) |
| 改进 GitHub 搜索和社区 | [增长策略](github-growth.md) |
| 报告安全问题 | [安全策略](../SECURITY.md) |

## 当前身份

DHD 是独立的社区 source preview。它使用固定的 Harness checkout，但当前 Agent surface 是 iframe；计划中的 transport、turn projection、原生多 Agent UI、完整 runtime 捆绑和签名发行不能当作现有能力。
