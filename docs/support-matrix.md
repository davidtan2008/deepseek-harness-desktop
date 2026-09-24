# 当前支持矩阵

> 这是“当前版本能做什么”的唯一摘要。版本绑定：`f163779`；Harness gitlink：`00102833dfaee1da9f48a3a8eae9d34005a75218` / `dsh-v0.1.7-alpha.2`；快照：2026-09-24。
>
> 状态标签：`已验证`、`已实现未自动化`、`上游能力`、`实验性`、`计划中`、`不支持/未实现`。

## 1. 身份与运行模式

| 项目 | 状态 | 证据/说明 |
|---|---|---|
| 独立社区项目 | 已验证 | 不是 DeepSeek 官方 Desktop，也没有官方背书；见 README |
| 源码开发模式 | 已验证 | `pnpm install` → `pnpm dev`；需要本机 Node 22.19+ 和可运行的 Harness checkout |
| 上游 Desktop build spike | 部分验证 | macOS arm64 build、启动 ready、graceful quit 和 `pnpm upstream:check` 通过；启动期间有 bounded HTTP 503 warning，Session/workspace 和其他平台仍未验证 |
| 外部 Host 复用 | 已实现未自动化 | `DHD_HARNESS_URL` 解析后不由桌面终止；workspace sync 需要 token |
| Workspace/session sync | 已验证（macOS arm64） | `pnpm smoke:workspace` 通过真实 Host RPC 验证 `workspace/create` 幂等、session 创建/复用和无残留退出；DHD Renderer 注入仍依赖 iframe 私有 storage seam |
| Runtime manifest | 已验证 | `pnpm runtime:manifest` / `packaged` 生成，包含 DHD build-output digest；`doctor:env` 和 `app.capabilities.runtime` 可读取 |
| Packaged runtime preflight | 已验证 | macOS arm64 packaged app 在 `bundled.* = false` 时保持启动但拒绝启动外部 Host，无新增 `dsh web` 进程 |
| 打包脚本 | 已验证（macOS arm64）/未发行 | electron-builder unpacked、zip、DMG 已验证；未配置 notarization，Windows/Linux 未验证 |
| 完整 runtime 捆绑 | 计划中 | 当前 `electron-builder.yml` 不携带完整 Harness/Node 闭包；packaged Host 对不完整 manifest fail closed |
| Linux 安装包 | 计划中 | 可构建配置存在，但未纳入本版本的质量/发行承诺 |

## 2. Workbench 能力

| 能力 | 状态 | Owner / 限制 |
|---|---|---|
| 文件树与多 Tab | 已实现未自动化 | `Explorer.tsx`、`EditorArea.tsx`；大目录虚拟化仍需补强 |
| 保存/自动保存/脏标记 | 已实现未自动化 | `AppSettings.autoSave`；状态在 Renderer |
| 内容/文件搜索 | 已验证 | ripgrep 优先，失败回退 JS；真实大仓库和 `RIPGREP_PATH` 失败路径已手工验证 |
| 搜索流式进度/取消 | 已验证 | `search:progress`、`search.cancel`；错误与无匹配分离 |
| 集成终端 | 已验证 | node-pty → Python/`script`/管道 fallback；Tab 切换保持会话 |
| Git 状态/diff/stage/commit/push | 已实现未自动化 | `git-service.ts` 的 CLI 封装；不是 Agent turn diff |
| 命令面板/快开 | 已实现未自动化 | `CommandPalette.tsx`；尚未统一所有插件命令 |
| `Cmd/Ctrl+K` | 已实现未自动化 | 调用 DeepSeek API；结果直接替换选区，未接入统一 turn projection |
| Rules/Skills/MCP 入口 | 已实现未自动化 | 打开/写入配置；不等于完整插件管理 UI |
| Problems / Jobs | 计划中 | 当前是占位内容；Agent jobs 主要在 Harness iframe |
| Agent 变更 Apply/Reject | 计划中 | 当前 ChangesPanel 是仓库级 Git diff |
| 多窗口独立项目/Agent 隔离 | 计划中 | 多窗口可打开，但 Host、settings、watcher 和 session 选择仍有全局共享状态 |

## 3. Agent surface

| 能力 | 状态 | 说明 |
|---|---|---|
| Harness Web UI | 已验证 | `AgentPanel` 通过带 token 的 URL 加载 `<iframe>` |
| 工作区 → Harness workspace | 已验证（macOS arm64） | `pnpm smoke:workspace` 调用 `/api/workspace/create`，验证幂等、session 创建/复用和无残留退出；Renderer 注入仍依赖 iframe storage seam |
| Agent Transport contract | contract 已定义 | `AgentTransportDescriptor`/`AgentTransportDriver` 已进入 shared contract；当前 iframe descriptor 明确 send/cancel/resume/projection unsupported |
| Turn Controller 状态机 | contract 已验证 | `pnpm test:contract` 覆盖 start/running/approval/cancel/resume/complete/dispose 事件顺序；尚未接入真实 Host |
| Change Projection 纯函数 | contract 已验证 | 覆盖 Agent/user/formatter、冲突、revert、排序和路径安全；尚未接入 watcher/Session/UI |
| 选区发送 | 部分验证 | 剪贴板 fallback 可用；`dhd-insert` postMessage 接收端未在当前 pin 中确认 |
| Turn 原生投影 | 计划中 | 需要 TransportDriver、turn controller、Session event projection |
| Agent diff attribution | 计划中 | 需要把 tool events、watcher 和 Git 状态合并成 turn 变更集 |
| Trajectory/审批/工具卡 | 上游能力 | 在 iframe 的 Harness Web UI 中可用，DHD 尚未原生重做 |
| Session resume | 上游能力 | 依赖 Harness Session log；Host 重启后的桌面投影仍需加强 |

## 4. Harness preset（以当前 gitlink 的 preset YAML 为准）

| Preset | Subagent | `subagent_fork` | Workflow | Agent Teams | Codex/Claude provider | Ralph | 备注 |
|---|---|---|---|---|---|---|---|
| `standard` | 有，continuable | 有 | 有 | 未默认挂载 | 默认 disabled | disabled | 默认工作流入口 |
| `ptc` | 有，continuable | 有 | disabled | 未默认挂载 | 默认 disabled | disabled | PTC presentation；workflow 当前关闭 |
| `minimal` | 未提供 | 未提供 | 未提供 | 未提供 | 未提供 | 未提供 | 受控终端/编辑器基线 |
| `cordis` | 有，continuable | 有 | 有 | 未默认挂载 | 默认 disabled | disabled | 额外提供 Cordis 工具 |

说明：

- 上表描述 Harness preset 的组成，不等于 DHD 已经提供原生 Team UI。
- Agent Teams 需要额外挂载实验性 Team packages 和持久 Session storage；它是 opt-in、experimental、单进程、共享 checkout。
- Codex/Claude/ACP 是上游 provider/自动化入口，是否可用取决于 Harness profile、凭据和上游版本；DHD 当前不把它们包装成内置 Agent。
- preset 变化属于 Harness pin 变化，必须更新 gitlink 兼容记录和本表。

## 5. Host 与平台

| 能力 | macOS | Windows | Linux |
|---|---|---|---|
| 源码启动 | 已验证 | 未在本次验证 | 未在本次验证 |
| node-pty | 已验证 | 代码有 Windows fallback，未本次验证 | 代码有 fallback，未本次验证 |
| 关闭最后窗口后 Dock 退出清理 | 已验证 | 预期语义不同，未本次验证 | 预期语义不同，未本次验证 |
| 签名/公证安装包 | 未提供 | 未提供 | 未提供 |
| 自动更新 | 骨架 | 骨架 | 骨架 |

## 6. 本地设置与 effective Host 设置

| 设置 | 当前存储 | 是否已验证为 Host effective setting |
|---|---|---|
| `defaultModel` | Desktop `settings.json` | 否；不能从 UI 标签推断 Host 已采用 |
| `defaultPreset` | Desktop `settings.json` | 否；需要在 Host/profile contract 中显式转发后才算有效 |
| `sandboxMode` | Desktop `settings.json` | 否；Host permission preset 仍由 Harness 决定 |
| API Key | `safeStorage` + `~/.dsh/.credentials.yaml` | 凭证写入路径已实现；模型调用需实际 Host 流程验证 |
| MCP | `~/.dsh/desktop-mcp.patch.yml` | Host 启动时会附加生成的 overlay |

这张表是后续 `EffectiveSettings` contract 的输入；不要为了让 UI 看起来一致而把本地值伪装成 Host 已生效。

## 7. 验证记录

| 检查 | 状态 | 备注 |
|---|---|---|
| `pnpm install --frozen-lockfile --offline` | 已验证 | 基线修复后执行 |
| `pnpm typecheck` | 已验证 | 本轮 capability contract 改动后再次通过 |
| `pnpm build` | 待本轮文档/代码完成后复跑 | 证明构建，不证明运行时 |
| `git diff --check` | 待本轮完成后执行 | 文档和代码共同检查 |
| 真实 Electron 搜索/搜索 fallback | 已验证 | 手工验证记录在 CHANGELOG |
| 真实 Host/PTY/退出 | 已验证 | macOS 本机验证；不等于三平台 CI |
| 外层 contract checks | 已验证 | `pnpm test:contract` 覆盖 capability manifest、IPC/preload 和上游 Desktop 静态兼容门；完整 unit/E2E 仍未实现 |

## 8. 维护规则

- Harness gitlink 更新必须单独提交，并重新核对 Host 命令、ready line、workspace route、preset 和 session format。
- 本表不因 roadmap 目标自动变成“已支持”；只有代码、测试和真实流程都完成后才更新状态。
- 任何平台从“未验证”变成“已验证”，必须记录 OS、架构、版本、命令和限制。
