# GitHub 可发现性与社区增长

目标不是“刷高星数”，而是让真正使用 DeepSeek Harness、编写插件或贡献代码的人能在第一次搜索中找到项目，并相信文档和 release 证据。

## 1. 仓库元数据

建议在 GitHub Settings 中设置：

- **Description**：`Unofficial Electron workbench for DeepSeek Harness — local-first, plugin-friendly, Cursor-style coding workflow.`
- **Website**：项目文档站或 GitHub Pages。
- **Topics**：`dsh`、`deepseek-harness`、`deepseek-harness-desktop`、`ai-ide`、`coding-agent`、`electron`、`cordis`、`local-first`、`agent-skills`、`mcp`、`macos`、`windows`、`linux`。
- **Social preview**：产品名 + “Harness-native workbench” + 简洁工作台截图，不使用官方 Logo 暗示背书。
- ** Discussions**：开启；将“使用问题”“插件开发”“路线提案”分流。

建议的仓库 issue 标签：

| 标签 | 用途 |
|---|---|
| `area:host` | 启动、端口、进程、退出 |
| `area:workbench` | 编辑器、终端、Git、布局 |
| `area:agent-surface` | iframe/transport/turn/diff |
| `area:plugin` | Profile、插件、Cordis contract |
| `area:packaging` | 安装、更新、签名、运行时 |
| `kind:bug` / `kind:feature` / `kind:docs` | Issue 类型 |
| `status:needs-repro` | 缺少可复现信息 |

## 2. README 首屏规则

首屏必须回答：

1. 这是什么，是否官方，当前是否 source preview。
2. 用户解决什么问题，与普通 `dsh web` 的差别是什么。
3. 当前能做什么、明确不能做什么。
4. 如何安装/运行，失败时去哪看文档。
5. Agent、插件作者、贡献者分别从哪个入口开始。

推荐首屏结构：

```text
定位 + 状态免责声明
一张架构/工作流图
三分钟源码运行
已验证能力表
当前限制
文档和路线图
```

不要把星数、benchmark 或 roadmap 目标放在能力证据之前。

## 3. 内容和搜索入口

围绕真实用户搜索词建立自然入口：

- DeepSeek Harness desktop / DSH Desktop
- DeepSeek Harness AI IDE
- local-first coding agent
- Cursor-style AI workbench
- Cordis plugin desktop
- DeepSeek Harness subagent / Agent Teams / ACP
- Electron AI coding agent
- DSH plugin development

关键词应出现在真实的标题、描述、文档标题、topic 和 release note 中，不要堆砌或伪造官方身份。推荐文档标题：

- `DeepSeek Harness Desktop：本地优先的 AI coding workbench`
- `从 DSH Web 到 Cursor 式工作台`
- `为 DSH 插件作者提供 Desktop capability contract`
- `Harness subagent、workflow 与 Agent Teams：当前能做什么`

## 4. Release 质量

每个公开 release 都应包含：

- Desktop 版本、精确 Harness gitlink/package version；
- 支持的 OS/架构；
- 安装包 SHA-256；
- runtime manifest（Node、pnpm、native dependency）；
- 签名/公证状态；
- 已知限制和回滚方式；
- 与上一版本的迁移/数据变化；
- 对应 CI 和安装后 smoke 结果。

没有签名或完整 runtime 的构建应标为 `source` / `preview`，不要使用“stable”标签。

## 5. Issue 和 PR 质量

Bug 模板应自动询问：

- Desktop version 与 Harness gitlink；
- OS、架构、Node、root/harness pnpm 版本；
- 启动模式（source / packaged / external Host）；
- 脱敏后的 `DSH_HOME`、profile 和 userData 路径；
- preset、model、sandbox；
- 复现步骤、日志和最小项目；
- 是否涉及插件、Agent turn、文件写入或远程访问。

PR 模板应要求：

- 影响的 contract/owner；
- 正常、失败、取消、重启/退出验证；
- 是否修改 `harness/`、锁文件、gitlink、版本或 release metadata；
- 实际执行的命令和未执行项；
- 用户可见行为对应的文档/CHANGELOG 更新。

## 6. 内容节奏

### 每周

- 发布一个可运行切片：bugfix、adapter 示例、契约测试或文档澄清。
- 在 Discussions 展示一个真实工作流：Plan → Agent → diff → test。
- 回复现有 issue，并把 Harness runtime 问题路由到上游。

### 每月

- 做一次 Harness pin compatibility rehearsal。
- 发布带 hash 的 preview。
- 更新 roadmap 的已完成项和证据链接。
- 邀请一个插件作者审查 capability contract。

### 每季度

- 发布架构决策和迁移指南。
- 回顾安全报告、启动失败、搜索性能和退出清理数据。
- 评估是否将某个实验能力提升为稳定 contract。

## 7. 社区增长原则

- 不购买星标、不制造下载、不宣称官方关系。
- 不把插件目录收录描述成安全审计。
- 不将实验性 Agent Teams 写成“隔离的多 Agent 平台”。
- 不隐藏失败：不安装、Host 崩溃、签名缺失和上游不兼容要明确写出。
- 让外部贡献者能通过小 PR 获得反馈；优先改善文档、测试、适配器和恢复工具，而不是要求新贡献者重写整个 IDE。

## 8. 衡量指标

不要只看 stars。更有意义的指标：

| 指标 | 目标方向 |
|---|---|
| 首次 clone → 成功启动 | 变短 |
| 文档链接到正确 owner | 变准确 |
| Harness pin bump 的回归时间 | 变短 |
| 启动/退出残留进程 | 保持为零 |
| 搜索、PTY、workspace sync 的失败可诊断率 | 上升 |
| 可复现安装包和签名覆盖率 | 上升 |
| 外部插件按 contract 集成的数量 | 上升 |
| Agent turn → diff → test 的完成率 | 上升 |
