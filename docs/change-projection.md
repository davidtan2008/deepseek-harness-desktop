# Change Projection

> R2 contract：把 Agent turn、watcher 和外部写入的事实汇总成只读变更投影，不直接覆盖用户 buffer。

## 输入

`FileObservation` 按事件到达顺序提供：

- 相对 POSIX 路径；
- `beforeHash` / `afterHash`；
- `source`：`agent`、`user`、`formatter`、`git-external` 或 `unknown`；
- 可选 `turnId` 和时间戳。

路径拒绝绝对路径、反斜杠和 `..` 段。输入 hash 由 watcher、Git 或 Session/tool 事件的生产者生成；DHD 不把 hash 当作内容授权。

## 投影规则

`projectChanges()` 按路径合并 observation：

- 单一 Agent 写入 → `status: agent`，保留 turn IDs；
- 单一用户写入 → `status: user`；
- formatter/Git 外部写入 → `status: external`；
- Agent 与其他来源交错、链式 hash 不连续 → `status: conflict`，进入 `conflicts`；
- Agent 变更之后发生冲突 → `reloadSuggested: true`；
- 最终 hash 回到初始值 → `status: reverted`。

输出是派生事实，不是决策：它不会选择 Agent、用户或外部写入中的赢家，也不会自动 reload、revert、stage 或 commit。

## 当前状态

- shared 类型和纯函数已实现；
- `pnpm test:contract` 覆盖 Agent/user/formatter、冲突、revert、排序和路径拒绝；
- 已接入 `workspace/changes` Session event 的 changed-path producer，并通过 `agent:event` 投影到 Workbench；ChangesPanel 会按 changed paths 加载当前 Git diff，也可通过 `agent.review` 读取 Host `changes.summary`/`changes.diff` 的前后 diff；watcher observation、冲突和 per-hunk Review 尚未接入；
- 下一步是接入 test-result-to-turn 关联和 watcher/Git observation producer 到 Workspace Generation，并为 Host 重启、取消和外部写补集成测试。

实现依据：[`ADR 0005`](adr/0005-agent-transport-contract.md) 和 [`architecture.md`](architecture.md) 的 Change Projection 章节。
