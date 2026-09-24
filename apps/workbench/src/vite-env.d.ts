import type {
  AppSettings,
  FileEntry,
  FileSearchHit,
  GitCommit,
  GitStatus,
  HostState,
  InlineEditRequest,
  InlineEditResult,
  IpcEventMap,
  McpServerConfig,
  PtyAcquireResult,
  PtyOptions,
  RuleFile,
  WorkspaceSyncResult,
} from '@dhd/shared'

export interface DesktopApi {
  on<K extends keyof IpcEventMap>(channel: K, listener: (payload: IpcEventMap[K]) => void): () => void
  app: {
    version: () => Promise<string>
    platform: () => Promise<NodeJS.Platform>
    settings: {
      get: () => Promise<AppSettings>
      set: (patch: Partial<AppSettings>) => Promise<AppSettings>
    }
  }
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    new: (projectPath?: string) => Promise<void>
    setTitle: (title: string) => Promise<void>
  }
  project: {
    openDialog: () => Promise<string | undefined>
    open: (projectPath: string) => Promise<AppSettings>
    clone: (url: string, dest: string) => Promise<string>
    recent: () => Promise<string[]>
  }
  fs: {
    readDir: (dir: string) => Promise<FileEntry[]>
    readFile: (file: string) => Promise<{ text: string; binary: boolean }>
    writeFile: (file: string, text: string) => Promise<void>
    stat: (file: string) => Promise<{ isDirectory: boolean; size: number; mtimeMs: number }>
    mkdir: (dir: string) => Promise<void>
    createFile: (file: string) => Promise<void>
    rename: (from: string, to: string) => Promise<void>
    remove: (target: string) => Promise<void>
    reveal: (target: string) => Promise<void>
  }
  search: {
    files: (root: string, query: string) => Promise<string[]>
    content: (root: string, query: string, requestId: string) => Promise<FileSearchHit[]>
    cancel: (requestId: string) => Promise<boolean>
  }
  git: {
    status: (cwd: string) => Promise<GitStatus>
    diff: (cwd: string, file?: string, staged?: boolean) => Promise<string>
    stage: (cwd: string, files: string[]) => Promise<void>
    unstage: (cwd: string, files: string[]) => Promise<void>
    commit: (cwd: string, message: string) => Promise<void>
    push: (cwd: string) => Promise<string>
    pull: (cwd: string) => Promise<string>
    checkout: (cwd: string, branch: string) => Promise<void>
    branches: (cwd: string) => Promise<string[]>
    log: (cwd: string) => Promise<GitCommit[]>
  }
  pty: {
    acquire: (options: PtyOptions) => Promise<PtyAcquireResult>
    write: (id: string, data: string) => Promise<void>
    resize: (id: string, cols: number, rows: number) => Promise<void>
    kill: (id: string) => Promise<void>
  }
  host: {
    status: () => Promise<HostState>
    restart: () => Promise<HostState>
  }
  workspace: {
    sync: (projectPath: string) => Promise<WorkspaceSyncResult | { error: string }>
  }
  credentials: {
    has: () => Promise<boolean>
    set: (value: string) => Promise<void>
    clear: () => Promise<void>
  }
  mcp: {
    list: () => Promise<McpServerConfig[]>
    save: (servers: McpServerConfig[]) => Promise<void>
  }
  rules: {
    list: (projectPath: string) => Promise<RuleFile[]>
  }
  inlineEdit: {
    run: (request: InlineEditRequest) => Promise<InlineEditResult>
  }
  dialog: {
    openFiles: () => Promise<string[]>
    saveFile: (defaultPath?: string) => Promise<string | undefined>
  }
  shell: {
    openExternal: (url: string) => Promise<void>
  }
}

declare global {
  interface Window {
    dhd: DesktopApi
  }
}

export {}
