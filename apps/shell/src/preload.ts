import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, IpcEventMap, McpServerConfig, PtyCreateOptions } from '@dhd/shared'

const api = {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on<K extends keyof IpcEventMap>(channel: K, listener: (payload: IpcEventMap[K]) => void) {
    const wrapped = (_event: unknown, payload: IpcEventMap[K]) => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },
  app: {
    version: () => ipcRenderer.invoke('app.version') as Promise<string>,
    platform: () => ipcRenderer.invoke('app.platform') as Promise<NodeJS.Platform>,
    settings: {
      get: () => ipcRenderer.invoke('app.settings.get') as Promise<AppSettings>,
      set: (patch: Partial<AppSettings>) => ipcRenderer.invoke('app.settings.set', patch) as Promise<AppSettings>,
    },
  },
  window: {
    minimize: () => ipcRenderer.invoke('window.minimize'),
    maximize: () => ipcRenderer.invoke('window.maximize'),
    close: () => ipcRenderer.invoke('window.close'),
    new: (projectPath?: string) => ipcRenderer.invoke('window.new', projectPath),
    setTitle: (title: string) => ipcRenderer.invoke('window.setTitle', title),
  },
  project: {
    openDialog: () => ipcRenderer.invoke('project.openDialog') as Promise<string | undefined>,
    open: (projectPath: string) => ipcRenderer.invoke('project.open', projectPath) as Promise<AppSettings>,
    clone: (url: string, dest: string) => ipcRenderer.invoke('project.clone', url, dest) as Promise<string>,
    recent: () => ipcRenderer.invoke('project.recent') as Promise<string[]>,
  },
  fs: {
    readDir: (dir: string) => ipcRenderer.invoke('fs.readDir', dir),
    readFile: (file: string) => ipcRenderer.invoke('fs.readFile', file) as Promise<{ text: string; binary: boolean }>,
    writeFile: (file: string, text: string) => ipcRenderer.invoke('fs.writeFile', file, text),
    stat: (file: string) => ipcRenderer.invoke('fs.stat', file),
    mkdir: (dir: string) => ipcRenderer.invoke('fs.mkdir', dir),
    createFile: (file: string) => ipcRenderer.invoke('fs.createFile', file),
    rename: (from: string, to: string) => ipcRenderer.invoke('fs.rename', from, to),
    remove: (target: string) => ipcRenderer.invoke('fs.remove', target),
    reveal: (target: string) => ipcRenderer.invoke('fs.reveal', target),
  },
  search: {
    files: (root: string, query: string) => ipcRenderer.invoke('search.files', root, query) as Promise<string[]>,
    content: (root: string, query: string) => ipcRenderer.invoke('search.content', root, query),
  },
  git: {
    status: (cwd: string) => ipcRenderer.invoke('git.status', cwd),
    diff: (cwd: string, file?: string, staged?: boolean) => ipcRenderer.invoke('git.diff', cwd, file, staged) as Promise<string>,
    stage: (cwd: string, files: string[]) => ipcRenderer.invoke('git.stage', cwd, files),
    unstage: (cwd: string, files: string[]) => ipcRenderer.invoke('git.unstage', cwd, files),
    commit: (cwd: string, message: string) => ipcRenderer.invoke('git.commit', cwd, message),
    push: (cwd: string) => ipcRenderer.invoke('git.push', cwd) as Promise<string>,
    pull: (cwd: string) => ipcRenderer.invoke('git.pull', cwd) as Promise<string>,
    checkout: (cwd: string, branch: string) => ipcRenderer.invoke('git.checkout', cwd, branch),
    branches: (cwd: string) => ipcRenderer.invoke('git.branches', cwd) as Promise<string[]>,
    log: (cwd: string) => ipcRenderer.invoke('git.log', cwd),
  },
  pty: {
    create: (options: PtyCreateOptions) => ipcRenderer.invoke('pty.create', options) as Promise<string>,
    write: (id: string, data: string) => ipcRenderer.invoke('pty.write', id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.invoke('pty.resize', id, cols, rows),
    kill: (id: string) => ipcRenderer.invoke('pty.kill', id),
  },
  host: {
    status: () => ipcRenderer.invoke('host.status'),
    restart: () => ipcRenderer.invoke('host.restart'),
  },
  credentials: {
    has: () => ipcRenderer.invoke('credentials.has') as Promise<boolean>,
    set: (value: string) => ipcRenderer.invoke('credentials.set', value),
    clear: () => ipcRenderer.invoke('credentials.clear'),
  },
  mcp: {
    list: () => ipcRenderer.invoke('mcp.list') as Promise<McpServerConfig[]>,
    save: (servers: McpServerConfig[]) => ipcRenderer.invoke('mcp.save', servers),
  },
  rules: {
    list: (projectPath: string) => ipcRenderer.invoke('rules.list', projectPath),
  },
  inlineEdit: {
    run: (request: unknown) => ipcRenderer.invoke('inlineEdit.run', request),
  },
  dialog: {
    openFiles: () => ipcRenderer.invoke('dialog.openFiles') as Promise<string[]>,
    saveFile: (defaultPath?: string) => ipcRenderer.invoke('dialog.saveFile', defaultPath) as Promise<string | undefined>,
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell.openExternal', url),
  },
}

contextBridge.exposeInMainWorld('dhd', api)

export type DesktopApi = typeof api
