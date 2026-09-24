# Upstream Host IPC Transport

> R2 vertical slice：复用上游 Host 的 lifecycle IPC，并通过同一 authenticated loopback Host 的 Remote API 接入真实 Session channel；DHD 保留 iframe 作为兼容回退，不修改 `harness/` 子模块。

## 已实现

`apps/shell/src/agent/host-ipc-driver.ts` 负责：

- 以 `stdio: ['ignore', 'pipe', 'pipe', 'ipc']` 启动上游 `dsh-desktop-host`；
- 校验 `ready`、`fatal`、`platform-session`、`update-tasks` 和 `shutdown-complete`；
- 限制 stderr tail，按 graceful → SIGTERM → SIGKILL 顺序回收 child；
- 通过 `AgentHostConnection` 接入上游 child IPC，或接入 DHD 已经监督的 `dsh web` Host；
- 通过注入的 `AgentSessionPort` 提供 turn/cancel/resume/subscribe contract。

`apps/shell/src/agent/harness-web-session-port.ts` 使用 Host 的 token/cookie 认证和 `/api/remote.mux`：

- `session/follow` 提供 opening snapshot、durable Session events 和 assistant stream；
- `session/prompt` 把用户文本和 bounded structured context 写成 Session user message，因此模型可见输入可从 Session log 重建；
- `session/cancel` 取消活动 Agent；
- `turn/start`、`tool/call`、`approval/asked`、`workspace/changes` 和 `turn/end` 映射为 `AgentTurnEvent`；
- `workspace/changes` 通过可选的 `/api/changes.summary` route 读取 changed paths；route 未挂载时保留 Session event，不伪造空变更集。

`apps/shell/src/agent-runtime.ts` 为每个 Renderer/WebContents 拥有一个 Main-process runtime，并把事件通过 typed IPC 发送给 Workbench。iframe 仍负责完整 Harness Web UI；native controls 是同一 Host/Session 的并行投影。

## 真实验证

```sh
pnpm --dir harness --filter @deepseek-ai/dsh-desktop build
pnpm smoke:upstream-host
pnpm smoke:native-turn
pnpm test:contract
```

`smoke:upstream-host` 使用当前 pin 的真实 `dsh-desktop-host/lib/index.js`，验证 authenticated ready URL、`update-tasks`、Session create/follow WebSocket 和 shutdown 生命周期；不会打印 token。`smoke:native-turn` 再启动真实 Harness loop，用本地 OpenAI-compatible mock provider 验证 native prompt/context、Session log user message 和 turn terminal event；它不是外部 DeepSeek 模型可用性的证明。`test:contract` 另用本地 HTTP/WebSocket fixture 验证 tool/approval/change events、cancel 和 resume。

## 仍未完成

- 真实 provider/model turn、审批决策和跨平台 Host restart/reconnect 仍需端到端验证；
- `workspace/changes` 目前投影 changed paths，Workbench ChangesPanel 可加载当前 Git diff，并可启动固定项目 test command；before/after diff、watcher 冲突、test-result-to-turn 关联和 per-hunk review 仍待接入；
- 上游 child IPC 本身没有 turn 消息；turn channel 使用 Host 已有的 authenticated Remote API，不把 child IPC 误报为 turn protocol；
- 只有 native channel 通过真实 Session/model/restart smoke 后，才考虑把它设为默认 Agent surface。

当前 DHD 仍保留 loopback/iframe fallback，且没有修改 `harness/` 子模块源码。
