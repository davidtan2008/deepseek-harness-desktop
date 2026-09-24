import { BrowserWindow, ipcMain, shell as electronShell } from 'electron'
import { watch, type FSWatcher } from 'chokidar'
import type { AppSettings, McpServerConfig, PtyOptions, SearchPhase, WorkspaceSyncResult } from '@dhd/shared'
import { hasApiKey, setApiKey, clearApiKey } from './credentials.ts'
import { HarnessApi, seedHarnessSession } from './harness-api.ts'
import * as fs from './fs-service.ts'
import * as git from './git-service.ts'
import { runInlineEdit } from './inline-edit.ts'
import { listRuleFiles, loadMcp, saveMcp } from './mcp-service.ts'
import { acquirePty, killPty, killSessionsOfOwner, resizePty, writePty } from './pty-service.ts'
import { cancelSearch, listFiles, searchContent } from './search-service.ts'
import { loadSettings, rememberProject, saveSettings } from './settings-store.ts'
import type { HostProcess } from './host.ts'

export interface IpcContext {
  host: HostProcess
  getWindow: () => BrowserWindow | undefined
  openWindow: (projectPath?: string) => void
}

let watcher: FSWatcher | undefined

export function registerIpc(ctx: IpcContext): void {
  ipcMain.handle('app.version', () => process.env.npm_package_version ?? '0.1.0')
  ipcMain.handle('app.platform', () => process.platform)
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
    if (!sender.isDestroyed()) sender.send('search:progress', { requestId, phase, count })
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
      return result
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
  void watcher?.close()
  watcher = watch(projectPath, {
    ignoreInitial: true,
    ignored: /(^|[/\\])(node_modules|\.git|dist|out)([/\\]|$)/,
    depth: 8,
  })
  watcher.on('all', (event, path) => {
    const type = event === 'add' || event === 'addDir' || event === 'change' || event === 'unlink' || event === 'unlinkDir'
      ? event
      : 'change'
    ctx.getWindow()?.webContents.send('fs:changed', { path, type })
  })
}
