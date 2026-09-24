## 变更说明

<!-- 用户可完成什么行为？为什么这样改？关联 Issue 用 Fixes #N -->

## 影响范围

- [ ] Renderer / Workbench
- [ ] Electron Main / Host / process lifecycle
- [ ] shared IPC / capability contract
- [ ] plugin / profile / MCP
- [ ] packaging / signing / update
- [ ] docs / GitHub metadata

## 真源与不变量

- 相关 ADR/文档：
- 是否修改 `harness/` gitlink、锁文件、版本或 release metadata：
- 是否改变权限、路径、凭证、Session 或退出语义：

## 验证清单

- [ ] `pnpm docs:check`
- [ ] `pnpm typecheck`
- [ ] `pnpm test:contract`
- [ ] `pnpm build`
- [ ] `git diff --check`
- [ ] 相关真实流程（Host/PTY/搜索/窗口/打包/多窗口）：
- [ ] 未执行的平台和原因：

## Agent 协作

- [ ] 使用了独立 worktree / `DSH_HOME` / `DHD_USER_DATA` / 端口（如适用）
- [ ] 未把真实凭证、用户路径或 profile 内容加入 diff
- [ ] shared contract 的 Main、preload、Renderer 使用方已同步

## 文档

- [ ] 当前行为已更新到 owning document
- [ ] `CHANGELOG.md` 已记录用户可见变化
- [ ] Roadmap/Support Matrix 状态没有把计划写成已交付

## 提交

- [ ] Conventional Commits
- [ ] 未直接修改 `harness/` 子模块内容
