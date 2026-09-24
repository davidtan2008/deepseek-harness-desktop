import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  DesktopApi,
  DesktopCapabilities,
  FileSearchHit,
  IpcChannel,
  IpcEventMap,
  McpServerConfig,
  PtyAcquireResult,
  PtyOptions,
  WorkspaceSyncResult,
} from '@dhd/shared'

const invoke = <T>(channel: IpcChannel, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>

const eventChannels = new Set<keyof IpcEventMap>([
  'host:changed',
  'pty:data',
  'pty:exit',
  'fs:changed',
  'menu:command',
  'settings:changed',
  'search:progress',
  'capabilities:changed',
  'agent:event',
])

const api: DesktopApi = {
  on<K extends keyof IpcEventMap>(channel: K, listener: (payload: IpcEventMap[K]) => void) {
    if (!eventChannels.has(channel)) throw new Error(`Unsupported event channel: ${String(channel)}`)
    const wrapped = (_event: unknown, payload: IpcEventMap[K]) => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },
  app: {
    version: () => invoke('app.version') as Promise<string>,
    platform: () => invoke('app.platform') as Promise<NodeJS.Platform>,
    capabilities: () => invoke('app.capabilities') as Promise<DesktopCapabilities>,
    settings: {
      get: () => invoke('app.settings.get') as Promise<AppSettings>,
      set: (patch: Partial<AppSettings>) => invoke('app.settings.set', patch) as Promise<AppSettings>,
    },
  },
  window: {
    minimize: () => invoke('window.minimize'),
    maximize: () => invoke('window.maximize'),
    close: () => invoke('window.close'),
    new: (projectPath?: string) => invoke('window.new', projectPath),
    setTitle: (title: string) => invoke('window.setTitle', title),
  },
  project: {
    openDialog: () => invoke('project.openDialog') as Promise<string | undefined>,
    open: (projectPath: string) => invoke('project.open', projectPath) as Promise<AppSettings>,
    clone: (url: string, dest: string) => invoke('project.clone', url, dest) as Promise<string>,
    recent: () => invoke('project.recent') as Promise<string[]>,
  },
  fs: {
    readDir: (dir: string) => invoke('fs.readDir', dir),
    readFile: (file: string) => invoke('fs.readFile', file) as Promise<{ text: string; binary: boolean }>,
    writeFile: (file: string, text: string) => invoke('fs.writeFile', file, text),
    stat: (file: string) => invoke('fs.stat', file),
    mkdir: (dir: string) => invoke('fs.mkdir', dir),
    createFile: (file: string) => invoke('fs.createFile', file),
    rename: (from: string, to: string) => invoke('fs.rename', from, to),
    remove: (target: string) => invoke('fs.remove', target),
    reveal: (target: string) => invoke('fs.reveal', target),
  },
  search: {
    files: (root: string, query: string) => invoke('search.files', root, query) as Promise<string[]>,
    content: (root: string, query: string, requestId: string) =>
      invoke('search.content', root, query, requestId) as Promise<FileSearchHit[]>,
    cancel: (requestId: string) => invoke('search.cancel', requestId) as Promise<boolean>,
  },
  git: {
    status: (cwd: string) => invoke('git.status', cwd),
    diff: (cwd: string, file?: string, staged?: boolean) => invoke('git.diff', cwd, file, staged) as Promise<string>,
    stage: (cwd: string, files: string[]) => invoke('git.stage', cwd, files),
    unstage: (cwd: string, files: string[]) => invoke('git.unstage', cwd, files),
    commit: (cwd: string, message: string) => invoke('git.commit', cwd, message),
    push: (cwd: string) => invoke('git.push', cwd) as Promise<string>,
    pull: (cwd: string) => invoke('git.pull', cwd) as Promise<string>,
    checkout: (cwd: string, branch: string) => invoke('git.checkout', cwd, branch),
    branches: (cwd: string) => invoke('git.branches', cwd) as Promise<string[]>,
    log: (cwd: string) => invoke('git.log', cwd),
  },
  pty: {
    acquire: (options: PtyOptions) =>
      invoke('pty.acquire', options) as Promise<PtyAcquireResult>,
    write: (id: string, data: string) => invoke('pty.write', id, data),
    resize: (id: string, cols: number, rows: number) => invoke('pty.resize', id, cols, rows),
    kill: (id: string) => invoke('pty.kill', id),
  },
  host: {
    status: () => invoke('host.status'),
    restart: () => invoke('host.restart'),
  },
  agent: {
    status: () => invoke('agent.status'),
    send: (request) => invoke('agent.send', request),
    cancel: (turnId) => invoke('agent.cancel', turnId),
    resume: (turnId) => invoke('agent.resume', turnId),
  },
  workspace: {
    sync: (projectPath: string) =>
      invoke('workspace.sync', projectPath) as Promise<WorkspaceSyncResult | { error: string }>,
  },
  test: {
    run: (cwd: string) => invoke('test.run', cwd),
    cancel: () => invoke('test.cancel'),
  },
  credentials: {
    has: () => invoke('credentials.has') as Promise<boolean>,
    set: (value: string) => invoke('credentials.set', value),
    clear: () => invoke('credentials.clear'),
  },
  mcp: {
    list: () => invoke('mcp.list') as Promise<McpServerConfig[]>,
    save: (servers: McpServerConfig[]) => invoke('mcp.save', servers),
  },
  rules: {
    list: (projectPath: string) => invoke('rules.list', projectPath),
  },
  inlineEdit: {
    run: (request: unknown) => invoke('inlineEdit.run', request),
  },
  dialog: {
    openFiles: () => invoke('dialog.openFiles') as Promise<string[]>,
    saveFile: (defaultPath?: string) => invoke('dialog.saveFile', defaultPath) as Promise<string | undefined>,
  },
  shell: {
    openExternal: (url: string) => invoke('shell.openExternal', url),
  },
}

contextBridge.exposeInMainWorld('dhd', api)
