import { app, BrowserWindow, ipcMain, shell as electronShell } from 'electron'
import { createDesktopCapabilities } from '@dhd/shared'
import type { AgentContextItem, AgentTransportDescriptor, AgentTurnRequest, AppSettings, HostState, McpServerConfig, PtyOptions, SearchPhase, WorkspaceSyncResult } from '@dhd/shared'
import { AgentRuntime, unavailableAgentTransport } from './agent-runtime.ts'
import { hasApiKey, setApiKey, clearApiKey } from './credentials.ts'
import { HarnessApi, seedHarnessSession } from './harness-api.ts'
import * as fs from './fs-service.ts'
import * as git from './git-service.ts'
import { runInlineEdit } from './inline-edit.ts'
import { listRuleFiles, loadMcp, saveMcp } from './mcp-service.ts'
import { acquirePty, killPty, killSessionsOfOwner, resizePty, writePty } from './pty-service.ts'
import { cancelAllSearches, cancelSearch, listFiles, searchContent } from './search-service.ts'
import { loadSettings, rememberProject, saveSettings } from './settings-store.ts'
import type { HostProcess } from './host.ts'
import { watchProject, type ProjectWatcher } from './project-watcher.ts'
import { cancelProjectTests, runProjectTests } from './test-service.ts'
import { loadRuntimeManifest } from './runtime-manifest.ts'

export interface IpcContext {
  host: HostProcess
  getWindow: () => BrowserWindow | undefined
  openWindow: (projectPath?: string) => void
}

let watcher: ProjectWatcher | undefined
const agentRuntimes = new Map<number, AgentRuntime>()
const agentRuntimeDisposers = new Map<number, () => void>()

function parseAgentTurnRequest(value: unknown): AgentTurnRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('agent turn request must be an object')
  const request = value as Record<string, unknown>
  if (typeof request.turnId !== 'string' || request.turnId.length === 0 || request.turnId.length > 256) throw new Error('agent turn request requires a bounded turnId')
  if (typeof request.text !== 'string' || Buffer.byteLength(request.text, 'utf8') > 1024 * 1024) throw new Error('agent turn request requires bounded text')
  if (!Array.isArray(request.context) || request.context.length > 128) throw new Error('agent turn request requires bounded context items')
  const context: AgentContextItem[] = request.context.map((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new Error('agent context item must be an object')
    const value = item as Record<string, unknown>
    if (!['file', 'selection', 'open-tabs', 'git-diff', 'problems'].includes(String(value.kind))) throw new Error('agent context kind is invalid')
    if (value.path !== undefined && typeof value.path !== 'string') throw new Error('agent context path is invalid')
    if (value.text !== undefined && typeof value.text !== 'string') throw new Error('agent context text is invalid')
    return {
      kind: value.kind as AgentContextItem['kind'],
      ...(value.path === undefined ? {} : { path: value.path }),
      ...(value.text === undefined ? {} : { text: value.text }),
    }
  })
  return { turnId: request.turnId, text: request.text, context }
}

function parseTurnId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) throw new Error('agent turn id is invalid')
  return value
}

async function disposeAgentRuntime(sender: Electron.WebContents): Promise<void> {
  const runtime = agentRuntimes.get(sender.id)
  const dispose = agentRuntimeDisposers.get(sender.id)
  agentRuntimes.delete(sender.id)
  if (dispose !== undefined) {
    agentRuntimeDisposers.delete(sender.id)
    dispose()
  }
  if (runtime !== undefined) await runtime.dispose()
}

async function ensureAgentRuntime(
  host: HostProcess,
  sender: Electron.WebContents,
  state: Extract<HostState, { status: 'ready' }>,
  sessionId: string,
): Promise<AgentTransportDescriptor> {
  const current = agentRuntimes.get(sender.id)
  if (current?.id === sessionId && current.matches(state.origin, state.token)) return current.capabilities()
  await disposeAgentRuntime(sender)
  const runtime = new AgentRuntime(
    host,
    sessionId,
    state.origin,
    state.token,
    (event) => {
      if (!sender.isDestroyed()) sender.send('agent:event', event)
    },
  )
  agentRuntimes.set(sender.id, runtime)
  const onDestroyed = (): void => {
    if (agentRuntimes.get(sender.id) !== runtime) return
    agentRuntimes.delete(sender.id)
    agentRuntimeDisposers.delete(sender.id)
    void runtime.dispose()
  }
  const cleanup = (): void => { sender.off('destroyed', onDestroyed) }
  agentRuntimeDisposers.set(sender.id, cleanup)
  sender.once('destroyed', onDestroyed)
  try {
    return await runtime.connect()
  } catch (error) {
    if (agentRuntimes.get(sender.id) === runtime) {
      agentRuntimes.delete(sender.id)
      agentRuntimeDisposers.delete(sender.id)
      cleanup()
    }
    await runtime.dispose().catch(() => undefined)
    console.warn('[agent] native Session transport unavailable:', error)
    return unavailableAgentTransport()
  }
}

export function getDesktopCapabilities(host: HostProcess): ReturnType<typeof createDesktopCapabilities> {
  return createDesktopCapabilities({
    appVersion: app.getVersion(),
    host: host.getState(),
    externalHost: host.getMode() === 'external',
    packaged: app.isPackaged,
    runtime: loadRuntimeManifest(),
  })
}

export function stopWatching(): void {
  watcher?.close()
  watcher = undefined
}

export async function stopAgentRuntimes(): Promise<void> {
  const runtimes = [...agentRuntimes.values()]
  const cleanups = [...agentRuntimeDisposers.values()]
  agentRuntimes.clear()
  agentRuntimeDisposers.clear()
  for (const cleanup of cleanups) cleanup()
  await Promise.allSettled(runtimes.map((runtime) => runtime.dispose()))
}

export function registerIpc(ctx: IpcContext): void {
  ipcMain.handle('app.version', () => app.getVersion())
  ipcMain.handle('app.platform', () => process.platform)
  ipcMain.handle('app.capabilities', () => getDesktopCapabilities(ctx.host))
  ipcMain.handle('app.settings.get', () => loadSettings())
  ipcMain.handle('app.settings.set', (_e, patch: Partial<AppSettings>) => {
    const next = { ...loadSettings(), ...patch, window: { ...loadSettings().window, ...(patch.window ?? {}) } }
    saveSettings(next)
    ctx.getWindow()?.webContents.send('settings:changed', next)
    return next
  })

  ipcMain.handle('window.minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.handle('window.maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.handle('window.close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())
  ipcMain.handle('window.new', (_e, projectPath?: string) => ctx.openWindow(projectPath))
  ipcMain.handle('window.setTitle', (e, title: string) => {
    BrowserWindow.fromWebContents(e.sender)?.setTitle(title)
  })

  ipcMain.handle('project.openDialog', () => fs.openFolderDialog())
  ipcMain.handle('project.open', (_e, projectPath: string) => {
    const settings = rememberProject(loadSettings(), projectPath)
    startWatch(projectPath, ctx)
    return settings
  })
  ipcMain.handle('project.clone', async (_e, url: string, dest: string) => {
    await git.gitClone(url, dest)
    rememberProject(loadSettings(), dest)
    return dest
  })
  ipcMain.handle('project.recent', () => loadSettings().recentProjects)

  ipcMain.handle('fs.readDir', (_e, dir: string) => fs.readDir(dir))
  ipcMain.handle('fs.readFile', (_e, file: string) => fs.readTextFile(file))
  ipcMain.handle('fs.writeFile', (_e, file: string, text: string) => fs.writeTextFile(file, text))
  ipcMain.handle('fs.stat', (_e, file: string) => fs.fileStat(file))
  ipcMain.handle('fs.mkdir', (_e, dir: string) => fs.makeDir(dir))
  ipcMain.handle('fs.createFile', (_e, file: string) => fs.createFile(file))
  ipcMain.handle('fs.rename', (_e, from: string, to: string) => fs.renamePath(from, to))
  ipcMain.handle('fs.remove', (_e, target: string) => fs.removePath(target))
  ipcMain.handle('fs.reveal', (_e, target: string) => fs.revealInOs(target))

  ipcMain.handle('search.files', (_e, root: string, query: string) => listFiles(root, query))

  const searchProgress = (sender: Electron.WebContents, requestId: string, phase: SearchPhase, count: number): void => {
    if (sender.isDestroyed()) return
    try { sender.send('search:progress', { requestId, phase, count }) } catch { /* window closed during shutdown */ }
  }
  ipcMain.handle('search.content', async (e, root: string, query: string, requestId: string) => {
    const hits = await searchContent(root, query, requestId, {
      onProgress: (count) => searchProgress(e.sender, requestId, 'running', count),
    })
    searchProgress(e.sender, requestId, 'done', hits.length)
    return hits
  })
  ipcMain.handle('search.cancel', (_e, requestId: string) => {
    cancelSearch(requestId)
    return true
  })

  ipcMain.handle('git.status', (_e, cwd: string) => git.gitStatus(cwd))
  ipcMain.handle('git.diff', (_e, cwd: string, file?: string, staged?: boolean) => git.gitDiff(cwd, file, staged))
  ipcMain.handle('git.stage', (_e, cwd: string, files: string[]) => git.gitStage(cwd, files))
  ipcMain.handle('git.unstage', (_e, cwd: string, files: string[]) => git.gitUnstage(cwd, files))
  ipcMain.handle('git.commit', (_e, cwd: string, message: string) => git.gitCommit(cwd, message))
  ipcMain.handle('git.push', (_e, cwd: string) => git.gitPush(cwd))
  ipcMain.handle('git.pull', (_e, cwd: string) => git.gitPull(cwd))
  ipcMain.handle('git.checkout', (_e, cwd: string, branch: string) => git.gitCheckout(cwd, branch))
  ipcMain.handle('git.branches', (_e, cwd: string) => git.gitBranches(cwd))
  ipcMain.handle('git.log', (_e, cwd: string) => git.gitLog(cwd))

  ipcMain.handle('pty.acquire', async (e, options: PtyOptions) => {
    try {
      const owner = e.sender.id
      // Terminal sessions outlive panel switches; they die with their window.
      e.sender.once('destroyed', () => killSessionsOfOwner(owner))
      return await acquirePty(options, owner, (id, data) => {
        if (!e.sender.isDestroyed()) e.sender.send('pty:data', { id, data })
      }, (id, exitCode) => {
        if (!e.sender.isDestroyed()) e.sender.send('pty:exit', { id, exitCode })
      })
    } catch (err) {
      console.error('[pty.acquire]', err)
      throw err
    }
  })
  ipcMain.handle('pty.write', (_e, id: string, data: string) => writePty(id, data))
  ipcMain.handle('pty.resize', (_e, id: string, cols: number, rows: number) => resizePty(id, cols, rows))
  ipcMain.handle('pty.kill', (_e, id: string) => killPty(id))

  ipcMain.handle('host.status', () => ctx.host.getState())
  ipcMain.handle('host.restart', () => ctx.host.restart())
  ipcMain.handle('agent.status', (e) => agentRuntimes.get(e.sender.id)?.capabilities() ?? unavailableAgentTransport())
  ipcMain.handle('agent.send', async (e, request: unknown) => {
    const runtime = agentRuntimes.get(e.sender.id)
    if (runtime === undefined) throw new Error('native Agent Session is not connected')
    return runtime.sendTurn(parseAgentTurnRequest(request))
  })
  ipcMain.handle('agent.cancel', async (e, turnId: unknown) => {
    const runtime = agentRuntimes.get(e.sender.id)
    if (runtime === undefined) throw new Error('native Agent Session is not connected')
    await runtime.cancel(parseTurnId(turnId))
  })
  ipcMain.handle('agent.resume', async (e, turnId: unknown) => {
    const runtime = agentRuntimes.get(e.sender.id)
    if (runtime === undefined) throw new Error('native Agent Session is not connected')
    return runtime.resume(parseTurnId(turnId))
  })
  ipcMain.handle('agent.review', async (e, turnId: unknown) => {
    const runtime = agentRuntimes.get(e.sender.id)
    if (runtime === undefined) throw new Error('native Agent Session is not connected')
    return runtime.review(parseTurnId(turnId))
  })
  ipcMain.handle('test.run', (e, cwd: unknown) => {
    if (typeof cwd !== 'string' || cwd.length === 0) throw new Error('test cwd is invalid')
    const onDestroyed = (): void => { cancelProjectTests(e.sender.id) }
    e.sender.once('destroyed', onDestroyed)
    return runProjectTests(cwd, e.sender.id).finally(() => e.sender.off('destroyed', onDestroyed))
  })
  ipcMain.handle('test.cancel', (e) => cancelProjectTests(e.sender.id))

  const pendingSeed = new WeakMap<Electron.WebContents, { origin: string; sessionId: string }>()
  ipcMain.handle('workspace.sync', async (e, projectPath: string): Promise<WorkspaceSyncResult | { error: string }> => {
    const state = ctx.host.getState()
    if (state.status !== 'ready') return { error: 'host-not-ready' }
    if (!state.token) return { error: 'host-without-token' }
    const api = new HarnessApi(state.origin, state.token)
    try {
      const result = await api.openWorkspace(projectPath)
      const seeded = await seedHarnessSession(e.sender, state.origin, result.sessionId)
      if (!seeded) {
        // AgentPanel iframe not loaded yet; seed it as soon as the frame lands.
        pendingSeed.set(e.sender, { origin: state.origin, sessionId: result.sessionId })
        const onFrameLoad = (): void => {
          const pending = pendingSeed.get(e.sender)
          if (!pending) return
          void seedHarnessSession(e.sender, pending.origin, pending.sessionId).then((ok) => {
            if (ok) {
              pendingSeed.delete(e.sender)
              if (!e.sender.isDestroyed()) e.sender.removeListener('did-frame-finish-load', onFrameLoad)
            }
          })
        }
        e.sender.on('did-frame-finish-load', onFrameLoad)
      }
      const agentTransport = await ensureAgentRuntime(ctx.host, e.sender, state, result.sessionId)
      return { ...result, agentTransport }
    } catch (err) {
      console.error('[workspace.sync]', err)
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('credentials.has', () => hasApiKey())
  ipcMain.handle('credentials.set', (_e, value: string) => setApiKey(value))
  ipcMain.handle('credentials.clear', () => clearApiKey())

  ipcMain.handle('mcp.list', () => loadMcp())
  ipcMain.handle('mcp.save', (_e, servers: McpServerConfig[]) => saveMcp(servers))
  ipcMain.handle('rules.list', (_e, projectPath: string) => listRuleFiles(projectPath))
  ipcMain.handle('inlineEdit.run', (_e, request) => runInlineEdit(request))
  ipcMain.handle('dialog.openFiles', () => fs.openFilesDialog())
  ipcMain.handle('dialog.saveFile', (_e, defaultPath?: string) => fs.saveFileDialog(defaultPath))
  ipcMain.handle('shell.openExternal', (_e, url: string) => electronShell.openExternal(url))
}

function startWatch(projectPath: string, ctx: IpcContext): void {
  stopWatching()
  watcher = watchProject(projectPath, (path, type) => {
    const target = ctx.getWindow()
    if (!target || target.isDestroyed() || target.webContents.isDestroyed()) return
    try { target.webContents.send('fs:changed', { path, type }) } catch { /* window closed during shutdown */ }
  })
}
