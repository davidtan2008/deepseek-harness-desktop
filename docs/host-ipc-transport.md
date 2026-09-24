# Upstream Host IPC Transport

> R2 vertical slice：把上游 `dsh-desktop-host` 的 child IPC lifecycle 接入 DHD `AgentTransportDriver`，同时不把尚不存在的 turn IPC 伪装成已支持。

## 已实现

`apps/shell/src/agent/host-ipc-driver.ts` 负责：

- 以 `stdio: ['ignore', 'pipe', 'pipe', 'ipc']` 启动上游 Host；
- 校验 `ready`、`fatal`、`platform-session`、`update-tasks` 和 `shutdown-complete`；
- 限制 ready 诊断和 stderr tail；
- 发送 `shutdown`，按 graceful → SIGTERM → SIGKILL 顺序回收；
- 通过注入的 `AgentSessionPort` 提供 turn/cancel/resume/subscribe contract。

`HostIpcTransportDriver` 的 `capabilities()` 会真实反映 Session port 能力。默认 `UnsupportedAgentSessionPort` 明确返回 `unsupported`，所以当前状态是“Host lifecycle 已接入，turn/session channel 未接入”。

## 真实验证

```sh
pnpm --dir harness --filter @deepseek-ai/dsh-desktop build
pnpm smoke:upstream-host
```

`smoke:upstream-host` 使用当前 pin 的真实 `dsh-desktop-host/lib/index.js`，验证 authenticated ready URL、`update-tasks` 请求和 shutdown 生命周期；不会打印 token。

## 下一步

1. 确认上游可支持的 Session/turn channel（优先回馈上游稳定的最小 contract）；
2. 将 `AgentContextItem` 写入真实 Session event；
3. 将 `AgentTurnEvent` 映射到 Turn Controller；
4. 用 `projectChanges()` 接入 watcher/Session events；
5. 只有真实 turn channel 通过 cancellation/resume tests 后，才在 Workbench 默认启用该 transport。

当前 DHD 仍保留 loopback/iframe fallback，且没有修改 `harness/` 子模块源码。
