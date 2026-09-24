# AI Code Agent 开发指南

> 面向 Claude Code、Codex、OpenCode、Cursor、Aider、Harness Agent 以及任何能读写代码的自动化 agent。目标是让新 agent 在几分钟内理解项目全貌、知道边界、选择正确检查并留下可验证的交接。

## 1. 先读什么

按以下顺序建立上下文：

1. [`README.md`](../README.md)：产品定位、当前能力、限制和入口。
2. [`llms.txt`](../llms.txt)：压缩后的 source-of-truth 索引。
3. [`docs/market-research.md`](market-research.md)：为什么这样定位，以及竞品取舍。
4. [`docs/architecture.md`](architecture.md)：当前 as-built 进程、数据和生命周期。
5. [`docs/roadmap.md`](roadmap.md)：目标架构与阶段退出条件。
6. [`packages/shared/src/protocol.ts`](../packages/shared/src/protocol.ts)：跨进程数据与通道真源。
7. [`packages/shared/src/runtime.ts`](../packages/shared/src/runtime.ts) 和 [`docs/runtime-manifest.md`](runtime-manifest.md)：当前 runtime 和 bundled 依赖的身份契约。
8. [`packages/shared/src/agent-transport.ts`](../packages/shared/src/agent-transport.ts)、[`apps/shell/src/agent/harness-web-session-port.ts`](../apps/shell/src/agent/harness-web-session-port.ts)、[`scripts/prepare-runtime-closure.mjs`](../scripts/prepare-runtime-closure.mjs) 和 [`packages/shared/src/change-projection.ts`](../packages/shared/src/change-projection.ts)：Agent transport、真实 Session channel、packaged runtime closure、turn 和变更投影 contract。
9. 受影响目录的源码和测试；不要从 `harness/` 子模块内部开始改桌面代码。

## 2. Source-of-truth 优先级

发生冲突时按以下顺序判断：

1. **源代码、配置和锁文件**：实际行为。
2. **生成的 runtime/capability 信息**：必须绑定 gitlink 或版本。
3. [`docs/support-matrix.md`](support-matrix.md)：哪些能力已验证、在哪个平台验证。
4. [`docs/architecture.md`](architecture.md)：当前实现和明确限制。
5. [`docs/roadmap.md`](roadmap.md)：未来目标，不是已交付承诺。
6. [`docs/design.md`](design.md)：历史设计背景。
7. README 和用户指南：面向人的摘要，必须链接回上述真源。

不要因为旧文档或 Agent 的记忆而把计划功能当成现状。发现文档与代码不一致时，先修正文档或同时修复实现。

## 3. 三种“多 Agent”不要混淆

### 3.1 Harness 内部 Agent

这是上游运行时能力：subagent、fork、workflow、实验性 Agent Teams、外部 provider。DHD 通过 iframe 复用它们，不重新实现 Session 或 Agent loop。

当前 pin 的重要限制：

- Agent Teams 是实验性、单进程、共享 checkout；没有 worktree、远程成员或跨进程 exactly-once mailbox。
- `writeScopes` 只是冲突提示，不是文件锁。
- Agent Team 的成员、任务和 mailbox 是 log-only coordination state，不等于模型上下文。
- Codex/Claude/ACP 等 provider 有各自的认证、权限和生命周期；不能因为能编辑文件就宣称它们是 DHD 内置 Agent。

### 3.2 Desktop 原生多 Agent 体验

这是 DHD 未来需要投影的 UI：roster、task、job、child session、approval、turn diff 和 review。当前还没有完整原生实现；Jobs/Problems/Team 面板不能被描述成已完成。

### 3.3 多个 coding agent 改这个仓库

这是贡献者协作问题。一个 Agent 的工作树、凭据、端口和测试资源不能与另一个 Agent 共享。推荐每个写入任务使用独立 worktree 和独立环境：

```sh
git worktree add ../dhd-<agent-id> -b agent/<topic>
cd ../dhd-<agent-id>
DSH_HOME="$(mktemp -d)" \
DHD_USER_DATA="$(mktemp -d)" \
DHD_WORKBENCH_PORT=5183 \
DHD_ALLOW_MULTIPLE=1 \
pnpm dev
```

变量说明：

| 变量 | 作用 |
|---|---|
| `DHD_HARNESS_ROOT` | 指向该 worktree 使用的 Harness 源码 |
| `DSH_HOME` | 隔离 Harness profile、session、credential reference |
| `DHD_USER_DATA` | 隔离 Electron 设置、窗口状态和 desktop userData |
| `DHD_WORKBENCH_PORT` | 为 Vite renderer 选择独立端口 |
| `DHD_ALLOW_MULTIPLE` | 仅开发/测试时允许绕过单实例锁 |
| `DHD_HARNESS_URL` | 复用 loopback 外部 Host；桌面不会终止外部 Host（远程需显式不安全开关） |
| `DHD_ALLOW_REMOTE_HOST` | 仅诊断时允许非 loopback Host；不要在日常开发使用 |
| `DHD_ALLOW_UNBUNDLED_RUNTIME=1` | 仅诊断 packaged app 的外部 runtime；正式发行禁止 |

不要把这些变量写进提交、fixture 或用户真实配置。不要把 API key 复制到多个工作树；通过环境变量或安全的外部凭证存储提供。

## 4. 当前架构边界

| 层 | 可以做 | 不可以做 |
|---|---|---|
| `apps/shell` | 窗口、菜单、Host supervisor、PTY、fs/git/search、preload、平台 API、Main-owned transport lifecycle | 执行 Agent 工具、直接写 Session log、在 Main 中挂载 Cordis |
| `apps/workbench` | 编辑器、文件树、终端视图、Git/搜索/设置、iframe Agent surface | 依赖 Node/Electron 私有对象、绕过 Host 权限 |
| `packages/shared` | 可序列化类型、IPC channel、capability manifest、Desktop API contract | 放运行时副作用或平台实现 |
| `packages/desktop-profile` | 计划中的 DSH overlay/资源 | 假设已经被 `host.ts` 加载；当前启动只附加 MCP overlay |
| `harness/` | 上游源码和官方 Agent runtime | 在桌面功能分支直接修改并提交 |

跨进程 API 必须走 `packages/shared/src/protocol.ts`、`api.ts` 和 preload 白名单。Renderer 不得拥有通用 `invoke(channel)`；新增能力要同时更新协议、Main handler、preload API、Renderer consumer 和验证。

## 5. 常用命令

```sh
pnpm install --frozen-lockfile
pnpm doctor:env
pnpm dev
pnpm smoke:workspace
pnpm smoke:upstream-host
pnpm smoke:native-turn
pnpm runtime:prepare
pnpm smoke:runtime-closure
pnpm smoke:packaged-host
pnpm typecheck
pnpm test:contract
pnpm build
git diff --check
```

当前外层仓库没有完整 `pnpm test` 或 Playwright suite；`pnpm test:contract` 验证 capability、IPC/preload、Host IPC fixture、authenticated Session prompt/follow fixture 和上游 Desktop 静态兼容门。不要把“typecheck/build 通过”写成“真实 provider/model 测试通过”。新增测试或 E2E 后，应把真实命令写进对应文档和 CI。

按改动选择检查：

| 改动面 | 最低检查 | 额外真实流程 |
|---|---|---|
| 文档/README | 链接、命令、`git diff --check` | 校对版本和 claim |
| shared protocol/preload | `pnpm typecheck`、`pnpm build` | 检查每个新增 channel 的 Main/Preload/Renderer 三方覆盖 |
| Host/PTY/退出 | `pnpm typecheck`、`pnpm build` | 真实启动、取消、重启、Dock/窗口退出和残留进程检查 |
| 搜索/watcher | `pnpm typecheck`、`pnpm build` | 真实大仓库、rg 失败 fallback、取消和 fd 检查 |
| UI 状态 | `pnpm typecheck`、`pnpm build` | 实际窗口中的打开、保存、切换、失败态 |
| 打包配置 | `pnpm runtime:prepare`、`pnpm build` | `pnpm smoke:runtime-closure`、`pnpm smoke:packaged-host`、`pnpm check:packaged-runtime`、目标原生安装包 smoke；开发构建不能代替它 |
| Harness pin | 先在 `harness/` 构建 | `pnpm smoke:workspace` 验证 workspace/session idempotency，`pnpm smoke:native-turn` 验证真实 Harness loop + mock provider 的 native turn；再记录 Host 启动、session resume 和版本 |

## 6. 修改工作流

### 6.1 开始前

- 读取根 `AGENTS.md`、受影响目录规则和 `docs/architecture.md`。
- 用 `git status --short` 确认没有把别的 Agent 的 WIP 覆盖。
- 找到真正的 owner：协议、生命周期、UI 组件或打包配置。
- 把任务缩成一个可验证垂直切片；不要同时改锁文件、gitlink、版本和多个业务域。

### 6.2 实现时

- 先定义输入、输出、失败和 dispose 语义，再写 UI。
- 异步任务必须有取消、错误出口和清理；不要用空 `catch` 隐藏失败。
- 进程/PTY/Host 操作必须有 owner 和等待退出；不要只发信号后返回。
- 事件只能在 operation commit point 发布；UI 状态从权威事件/状态派生。
- 外部输入按不可信处理；不要把路径、URL 或配置直接交给 shell。
- 不要修改 `harness/` 子模块内容；需要上游变化时写 overlay、patch 或上游 PR。
- 不要为了让测试通过而扩大类型、关闭 strict、吞掉错误或写临时兼容分支。

### 6.3 交接前

- 说明改动的行为，不只说文件列表。
- 写出实际运行的命令和结果；未执行的检查明确写“未执行”。
- 检查 `git diff`，尤其是共享协议、锁文件、gitlink 和用户数据路径。
- 更新当前行为文档、CHANGELOG 和 ADR（若改变边界）。
- 报告限制：平台、版本、权限、未覆盖的失败路径。

## 7. Host contract 检查清单

任何涉及 Agent 启动、会话或工作区的改动都要回答：

- Host 是自有进程还是 `DHD_HARNESS_URL` 外部进程？退出时谁拥有终止权？
- ready URL、token、origin 和 iframe/transport 的边界是什么？
- 启动参数顺序是否仍符合 `dsh web` 的 launcher 语法？
- workspace/session sync 失败时，UI 是否会错误显示另一个项目？
- Host 重启、取消和窗口关闭是否清理 watcher、搜索、PTY 和订阅？
- 依赖的 Harness gitlink、preset、HTTP route 或 localStorage key 是否变化？

当前 Host stdout ready line、Typert Gateway 请求和 iframe `dsh.sessions.current` 注入都是**私有兼容面**，不是稳定的第三方插件 API。详见 [`docs/architecture.md`](architecture.md) 和 [`docs/adr/0004-upstream-first-evaluation.md`](adr/0004-upstream-first-evaluation.md)。

## 8. 安全规则

- Renderer `contextIsolation: true`、`nodeIntegration: false`；只通过 preload 白名单。
- 不把 token、API key、完整 Host stderr 或敏感配置写进普通日志/README/fixture。
- 外部 URL 只允许受控协议；不要让 renderer 任意 `shell.openExternal`。
- Agent 工具仍由 Harness 的 approval/sandbox 负责；桌面不通过 PTY 绕过审批。
- 目录监听不能按文件永久占用 fd；关闭项目/窗口/应用时必须释放。
- 搜索失败必须显示失败，不能伪装成“无匹配”。
- 递归删除、外部 URL、Git push、插件安装和更新必须有明确用户动作与可恢复策略。

## 9. 任务交接模板

```md
## 目标
一句话说明用户可完成的动作。

## 范围
- 修改：
- 不修改：

## 真源
- 协议/ADR/文档：
- 相关文件：

## 验收
- [ ] 正常路径：
- [ ] 失败路径：
- [ ] 取消/重启/退出：
- [ ] 权限/数据安全：

## 实际验证
- `pnpm typecheck`：
- `pnpm build`：
- 真实流程：

## 未完成/风险
明确写出没有覆盖的部分。
```

## 10. 新 Agent 常见误区

- 把 `harness/apps/desktop` 当成本仓库的代码；那是上游实现，必须保持独立身份。
- 把 iframe 中的 Web UI 说成“原生集成”；当前是 URL + iframe。
- 把 `postMessage` 没有接收端当成自动注入成功；剪贴板才是当前可靠 fallback。
- 把仓库级 Git diff 说成 Agent turn diff；当前没有 per-turn attribution。
- 把设置面板的 `defaultModel`/`defaultPreset` 当成 Host effective setting；需要验证转发链路。
- 把实验性 Agent Teams 说成 worktree 隔离；它明确共享 checkout。
- 把 `pnpm build` 说成完整运行时验收；它不启动 Electron、Host 或安装包。
- 把旧 `docs/design.md` 的 P0–P3 状态当成当前产品状态；以本文件和 support matrix 为准。
