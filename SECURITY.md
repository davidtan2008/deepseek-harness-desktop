# Security Policy

## Current status

DHD is an unofficial source-preview project. It launches a code-execution-capable DeepSeek Harness runtime and should be treated as a developer tool, not as a hardened production sandbox.

| Version | Status |
|---|---|
| `0.1.x` | Supported for security fixes on a best-effort basis |

## Current boundaries

- **Renderer**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; the preload exposes a typed method whitelist and no generic `invoke(channel)`.
- **Host**: runs outside Electron Main. Main supervises owned Hosts; an adopted `DHD_HARNESS_URL` Host is not terminated by DHD.
- **Agent execution**: tools, approvals and sandbox policy are owned by Harness. Electron renderer isolation is not an Agent sandbox.
- **Credentials**: API keys use Electron `safeStorage` and a permission-restricted compatibility file; do not put keys in logs, fixtures or issues.
- **Network**: current Agent surface uses a loopback Host URL. `DHD_HARNESS_URL` rejects non-loopback hosts by default; `DHD_ALLOW_REMOTE_HOST=1` is an explicit, unsafe escape hatch. Do not expose a Host to LAN or the public internet by default; future remote access must use explicit, short-lived capabilities and user-controlled private networking.
- **Filesystem/Git/PTY**: current IPC accepts paths from the Workbench. Production hardening must add project-root ownership, realpath/symlink policy, bounded reads, atomic writes and sender/frame validation.

## Known security work

These are tracked in [`docs/roadmap.md`](docs/roadmap.md), not claims of completion:

1. Validate the sender window, frame, origin and project owner in every privileged IPC handler.
2. Introduce a `ProjectBroker` for canonical paths, symlink containment, file size limits and atomic writes.
3. Remove unnecessary webview capability and keep navigation/popup policy narrow.
4. Split private Host authentication/token state from public Host status.
5. Validate external Host URLs and reject custom/file schemes or untrusted authorities.
6. Replace direct inline-edit API calls with a Host-mediated, logged and cancellable turn.
7. Add untrusted-frame, traversal, symlink, URL, MCP configuration and plugin recovery tests.
8. Add signed native packages, checksums, SBOM and installed-artifact smoke tests.

## Reporting a vulnerability

Do not open a public Issue for a vulnerability or include a real API key/token. Use the repository’s private security advisory form:

<https://github.com/davidtan2008/deepseek-harness-desktop/security/advisories/new>

Include:

- affected commit/version and Harness gitlink;
- OS/architecture and launch mode;
- minimal reproduction without real credentials;
- expected and observed authorization boundary;
- impact, reproducibility and suggested mitigation.

The project aims to acknowledge reports within 72 hours. Do not publicly disclose a suspected issue until a fix and coordinated release plan are ready.

## Safe local use

- Use a disposable repository or worktree for untrusted plugins and Agent tools.
- Keep `workspace-write`/approval boundaries enabled.
- Review `git diff` and test output before accepting changes.
- Do not run untrusted MCP commands or plugins with credentials available.
- Use a private overlay (for example Tailscale/Cloudflare Access) rather than raw public tunnels if remote access is required.
