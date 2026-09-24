# DHD Agent Guide

This file is the standing operating manual for humans and AI coding agents working in this repository. Read it before changing code, documentation, packaging, or the Harness pin.

## Source-of-truth order

1. Source, configuration, lockfiles, and the pinned `harness/` gitlink describe actual behavior.
2. `docs/support-matrix.md` records evidence and current limitations.
3. `docs/architecture.md` describes the as-built process and contract boundaries.
4. `docs/roadmap.md` describes intended future work, never shipped behavior by default.
5. `docs/design.md` is historical design context.
6. `README.md` and user-facing docs are summaries and must link back to the sources above.

When sources disagree, fix the stale source or document the discrepancy. Do not promote a planned capability because a UI contains a placeholder.

## Read first

- `README.md`
- `docs/agent-development.md`
- `docs/architecture.md`
- `packages/shared/src/protocol.ts`
- `packages/shared/src/api.ts`
- `packages/shared/src/capabilities.ts`
- the affected source and nearest tests

## Ownership boundaries

- `apps/shell` owns windows, menus, Host supervision, fs/git/search/pty/mcp/credentials, platform APIs, and IPC. It does not execute Agent tools or write Harness Session logs.
- `apps/workbench` owns React/Monaco/xterm presentation and Renderer state. It has no Node integration and cannot import Electron internals.
- `packages/shared` owns serializable cross-process types, `DesktopApi`, IPC channel names, and capability discovery. It contains no platform side effects.
- `harness/` is an upstream submodule. Never commit direct edits from a desktop feature branch. Use an overlay, a tracked patch, or an upstream PR.
- Main-process and Renderer code must communicate through the typed shared contract. Do not add arbitrary `ipcRenderer.invoke` or expose Electron objects across the bridge.

## Safe workflow

1. Check `git status --short`; do not overwrite another agent's WIP.
2. Partition concurrent work by non-overlapping paths. Use one Git worktree and branch per writing agent.
3. Isolate `DSH_HOME`, `DHD_USER_DATA`, `DHD_WORKBENCH_PORT`, and (for development only) `DHD_ALLOW_MULTIPLE=1` per instance.
4. Define normal, failure, cancellation, restart, shutdown, and permission behavior before implementing UI.
5. Keep one lifecycle owner for each subprocess, watcher, search, PTY, event subscription, and Host generation.
6. Never put secrets, tokens, real user paths, or profile contents in source, fixtures, logs, or documentation.
7. Update the owning documentation and `CHANGELOG.md` with behavior changes.
8. Report exact checks run and explicitly list unverified platforms or runtime flows.

## Checks

Baseline commands:

```sh
pnpm docs:check
pnpm typecheck
pnpm test:contract
pnpm build
git diff --check
```

There is currently no outer `pnpm test` or Playwright suite. For Host, PTY, search, watcher, window, packaging, or multi-window changes, also run the relevant real application flow and report the OS, architecture, Harness commit, and result. A successful build is not a runtime test.

## Harness compatibility

The Harness checkout is in developer preview. Treat stdout ready lines, launcher arguments, HTTP routes, iframe storage keys, preset composition, Session format, and plugin APIs as pin-specific compatibility surfaces. Update the submodule in a separate, reversible commit, rebuild it, rerun Host/workspace/session smoke tests, and update `docs/support-matrix.md` and the changelog.

## Multi-agent safety

Harness subagents, forks, workflows, experimental Agent Teams, and external providers are upstream concepts; they are not automatically Desktop-native features. Agent Teams currently share a checkout and are experimental. `writeScopes` are advisory, not locks. The final diff and tests remain the integration boundary.

## Definition of done

A change is ready only when:

- the user-visible behavior and failure state are clear;
- cross-process changes update protocol, API, Main, preload, and Renderer together;
- resources are cancellable and cleaned up;
- relevant checks and real flows are recorded;
- current docs do not overstate the implementation;
- no unrelated submodule, lockfile, credential, or user-data change is included.

## Harness-specific tooling

- If using MobileBuildMCP, use the installed MobileBuildMCP skill before calling MobileBuildMCP tools.
