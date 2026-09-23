# 安全策略

## 支持版本

| 版本 | 状态 |
|---|---|
| 0.1.x | 支持 |

## 安全设计概要

- **进程隔离**：渲染进程 `contextIsolation: true`、`nodeIntegration: false`，仅能通过 preload 白名单调用受控 IPC 通道；通道枚举在 `packages/shared/src/protocol.ts` 静态收口。
- **凭证保护**：API Key 使用 Electron `safeStorage`（底层为 macOS Keychain / Windows DPAPI / Linux libsecret）加密存储；同步文件 `~/.dsh/.credentials.yaml` 与回退文件均强制 `0600` 权限。
- **网络边界**：Renderer 与 Agent Host 之间仅经 loopback HTTP 通信，Host URL 携带一次性 token；行内编辑请求直连 `api.deepseek.com`，密钥不出本机进程。
- **Agent 沙箱与审批**：由上游 Harness Host 执行（Linux bwrap/Landlock、macOS Seatbelt、Windows restricted token），桌面主进程不执行任何 Agent 工具。

## 报告漏洞

请**勿在公开 Issue 中报告安全漏洞**。使用 GitHub 仓库的
[私有安全通告](https://github.com/davidtan2008/deepseek-harness-desktop/security/advisories/new)，
或联系仓库所有者。收到报告后将在 72 小时内响应。
