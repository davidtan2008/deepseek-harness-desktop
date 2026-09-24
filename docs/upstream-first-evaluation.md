# Upstream-first Evaluation

> R1 评估文档。它记录当前 Harness pin 中官方 Desktop 实现与 DHD 外层实现的差异，作为下一步 Host/transport 选型的依据。

## 结论摘要

> **不要在外层继续复制一套 Host loader、Profile 初始化、认证、更新和 runtime integrity。优先复用或回馈上游 Desktop Host；DHD 外层保留当前 loopback/iframe adapter 作为迁移期 fallback。**

这不是“上游有代码就立刻切换”的结论。`dsh-desktop-host` 和部分 Desktop package 可能是私有/快速变化的 seam，必须先做兼容 spike；如果不能形成稳定 contract，就将最小 seam 回馈上游，而不是长期依赖内部路径。

## 当前 pin 中的上游事实

基于 `00102833dfaee1da9f48a3a8eae9d34005a75218`：

| 上游模块 | 已观察到的事实 | 对 DHD 的意义 |
|---|---|---|
| `apps/desktop/src/host-process.ts` | 通过 child stdio IPC 接收结构化 `ready/fatal/shutdown-complete/update-tasks`；不解析 stdout ready line；有 bounded diagnostic 和 graceful/forced stop | 应优先复用 Host lifecycle contract |
| `apps/desktop/src/backend-controller.ts` | 独立拥有 backend generation；串行化启动/重试/停止；启动、失败、清理状态分离 | DHD 的全局 Host/watcher 状态应向 generation model 迁移 |
| `apps/desktop/src/runtime-tree.ts` | `desktop-runtime.json` 记录 release、platform/arch、shared package、文件 bytes/SHA-256/executable；提供 read/verify | DHD 的 runtime manifest 应逐步升级到同样的 inventory/integrity 语义 |
| `apps/desktop/src/project-manager.ts` | Profile lock、runtime descriptor 校验、插件 profile 初始化、第三方插件禁用/恢复 | Safe Mode 和安装事务应复用成熟实现，不在外层另造一套 |
| `apps/desktop-host/src/index.ts` | 通过 `runProfile` 启动 `desktop` profile，固定 loopback/port/authenticated URL，并向 Electron 发送结构化事件 | 这是 DHD 目标 TransportDriver 的最佳候选 |
| `apps/desktop/src/web-document.ts` / `ipc.ts` | 自定义文档、sender/frame 授权、受控 WebSocket/HTTP forwarding | 可作为 DHD Renderer/Host 安全边界的参考 |

## DHD 当前差异

| 方面 | DHD 当前实现 | 风险 |
|---|---|---|
| Host readiness | `host.ts` 解析 `dsh web:` stdout | pin 变化易碎，错误诊断与 ready 状态混合 |
| Host 启动 | `node --import tsx/esm ... web`，无 Harness 时回退 `npx` | source/package 语义不一致，包可能隐式依赖网络/全局 Node |
| 认证/UI | tokenized URL + iframe + cookie/localStorage seed | Renderer 和外层代码接触私有 Web 细节 |
| Profile | 只有 `cordis.patch.yml` 资源；没有上游同等 runtime/profile transaction | 插件失败恢复和升级不可证明 |
| Runtime | 新增 `runtime-manifest` 和 DHD build-output digest inventory，但不包含完整 Harness/Node 逐文件 inventory | 可做诊断和 DHD build 变更检测，不能作为完整发行完整性证明 |
| 状态 | 一个全局 Host、一个 watcher、多个窗口共享设置 | 无法安全表达 per-window generation |
| 退出 | DHD 已有 coordinator，行为正确 | 可保留作为 fallback，但不应继续扩展更多上游职责 |

## 当前 Spike 证据（2026-09-24）

- `pnpm --dir harness --filter @deepseek-ai/dsh-desktop build`：通过；上游 Desktop 的 TypeScript、tsdown 和 welcome bundle 均成功生成。
- `pnpm --dir harness --filter @deepseek-ai/dsh-desktop start`：补齐 Harness workspace 依赖并使用 `ELECTRON_MIRROR` 后，上游 Electron 启动并观察到 `dsh web: http://127.0.0.1:19387/?token=…` ready；通过 macOS app quit 触发 graceful shutdown，进程 exit 0 且无残留 Host。启动期间观察到 bounded HTTP 503 inventory/sync warning，未阻断 ready。
- `pnpm smoke:upstream-host`：DHD `UpstreamHostIpcConnection` 直接接收上游 `dsh-desktop-host` 的 `ready`、`update-tasks` 和 `shutdown-complete` IPC，真实 child lifecycle smoke 通过；同一 Host 的 authenticated `session/create` + `session/follow` WebSocket 也已打开。Host IPC 尚无 turn 消息，turn channel 使用上游既有 Remote API。
- `pnpm test:contract`：本地 HTTP/WebSocket fixture 验证 `session/prompt`、structured context、tool/approval/change events、cancel 和 resume；真实 provider/model turn 尚未验证。
- 当前只验证了 macOS arm64 的上游 build；上游 Host 的 Windows/Linux 行为仍未验证。

因此当前决策仍是“保留 DHD iframe fallback，先完成真实 provider turn、Session/workspace 和跨平台 spike”，而不是直接删除现有 adapter。Host lifecycle、Session follow 和本地 Session channel fixture 已有 macOS arm64/本地证据，但 provider/model、跨平台和 Host restart 行为仍缺失。

## 自动化兼容门

`pnpm upstream:check` 和 `pnpm test:contract` 会检查当前 Harness pin 是否仍提供候选 seam：

- Desktop Host IPC protocol version；
- `ready`、`fatal`、`shutdown-complete` 和 update-task 消息；
- `DesktopBackendController` 的 generation/cleanup API；
- runtime tree 的 hash/verify API；
- ProjectManager 的 Profile/plugin recovery API；
- `desktop-host` 的 `runProfile`、authenticated URL 和 IPC 事件。

任一 seam 消失或版本漂移都会使检查失败，提示先更新 ADR 和迁移计划，而不是让 DHD 静默继续依赖私有实现。该检查只证明源码兼容，不等于上游 Desktop 已完成真实启动验证。

## 迁移策略

```text
当前 source/iframe adapter
        │
        ├─ 继续作为开发 fallback
        │
        ▼
Upstream Desktop Host adapter
  - 结构化 ready/fatal/shutdown
  - profile/runtime preflight
  - authenticated transport
  - update/recovery hooks
        │
        ▼
DHD Workbench Application Layer
  - editor/terminal/Git
  - turn/change projection
  - multi-agent/provider UX
```

## R1 Spike 任务

1. 用当前 Harness checkout 构建并启动上游 Desktop。
2. 记录启动阶段、Profile 目录、Session/workspace change、错误恢复和停止时序。
3. 以 `DesktopHostProcess` 的事件字段为候选 contract，验证 DHD 是否只需要一个 adapter。
4. 验证 `dsh-desktop-host` 的 package/export 是否可作为受支持入口；若不稳定，向上游提交最小 public seam RFC。
5. 比较两条路径的包体、升级复杂度、renderer 安全和 per-window 能力。
6. 写出 Accepted/Rejected/Contribute-upstream ADR，再开始删除 DHD 私有耦合。

## Spike 验收标准

- 至少一条真实启动路径不依赖 stdout ready 文本；
- Host fatal/shutdown 事件可以结构化传给 DHD；
- Profile/runtime 不匹配时在启动前失败；
- 旧 DHD source adapter 仍可回退；
- 不复制上游 Session、Profile 或 runtime integrity 实现；
- 结论包含可回滚的文件/接口清单，而不是只有架构偏好。

## 暂时不做

- 不直接 import `harness/apps/desktop/src` 到 DHD 业务层；
- 不把上游私有 package 当作已经稳定的第三方 API；
- 不在没有 upstream contract test 的情况下删除 iframe；
- 不为了“复用”而放弃 DHD 的 Agent-to-diff 和多 provider 差异化。

## 证据入口

- [ADR 0004](adr/0004-upstream-first-evaluation.md)
- [Harness Desktop README](../harness/apps/desktop/README.md)
- [Harness Desktop Host](../harness/apps/desktop-host/src/index.ts)
- [Host process](../harness/apps/desktop/src/host-process.ts)
- [Runtime tree](../harness/apps/desktop/src/runtime-tree.ts)
- [Project manager](../harness/apps/desktop/src/project-manager.ts)
