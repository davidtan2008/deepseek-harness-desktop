## 变更说明

<!-- 做了什么、为什么；关联 Issue 用 Fixes #N -->

## 自查清单

- [ ] `pnpm typecheck && pnpm build` 本地通过
- [ ] 未修改 `harness/` 子模块内容（上游改动走上游 PR 或 overlay）
- [ ] 新增/变更 IPC 能力已同步更新 `packages/shared/src/protocol.ts`
- [ ] 用户可见行为变更已更新 `docs/user-guide.md` / `CHANGELOG.md`
- [ ] 提交符合 Conventional Commits
