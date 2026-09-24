import type { DesktopCapabilities } from './capabilities.js'
import type { AgentTransportDescriptor, AgentTurnEvent } from './agent-transport.js'

export type HostState =
  | { status: 'stopped' }
  | { status: 'starting' }
  | { status: 'ready'; url: string; origin: string; token: string }
  | { status: 'error'; message: string }

export type ActivityId =
  | 'explorer'
  | 'search'
  | 'scm'
  | 'agent'
  | 'extensions'
  | 'rules'
  | 'mcp'
  | 'settings'

export type PanelId = 'terminal' | 'problems' | 'output' | 'changes' | 'jobs'

export type ThemeId = 'system' | 'dark' | 'light'
export type KeymapId = 'cursor' | 'vscode' | 'default'

export interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized: boolean
  sidebarWidth: number
  agentWidth: number
  panelHeight: number
  sidebarVisible: boolean
  agentVisible: boolean
  panelVisible: boolean
  activity: ActivityId
  panel: PanelId
}

export interface AppSettings {
  theme: ThemeId
  keymap: KeymapId
  fontFamily: string
  fontSize: number
  tabSize: number
  wordWrap: boolean
  minimap: boolean
  autoSave: 'off' | 'afterDelay'
  autoSaveDelayMs: number
  sandboxMode: 'read-only' | 'workspace-write' | 'danger-full-access'
  defaultPreset: 'standard' | 'ptc' | 'minimal' | 'cordis'
  defaultModel: string
  terminalShell?: string
  recentProjects: string[]
  window: WindowState
}

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  isSymbolicLink: boolean
}

export interface FileSearchHit {
  path: string
  line: number
  column: number
  preview: string
}

export interface GitFileStatus {
  path: string
  index: string
  worktree: string
  originalPath?: string
}

export interface GitStatus {
  available: boolean
  root?: string
  branch?: string
  ahead: number
  behind: number
  detached: boolean
  files: GitFileStatus[]
}

export interface GitCommit {
  hash: string
  short: string
  author: string
  date: string
  subject: string
}

export interface McpServerConfig {
  id: string
  command: string
  args: string[]
  env: Record<string, string>
  disabled: boolean
  transport: 'stdio' | 'streamable-http'
  url?: string
}

export interface RuleFile {
  path: string
  kind: 'agents' | 'skill' | 'dsh-skill' | 'readme'
  relative: string
}

export interface InlineEditRequest {
  path: string
  language: string
  fullText: string
  selectionStart: number
  selectionEnd: number
  selectedText: string
  instruction: string
}

export interface InlineEditResult {
  replacement: string
  model: string
}

export interface PtyOptions {
  cwd: string
  cols: number
  rows: number
}

/** Terminal sessions survive panel/tab switches: acquiring an existing
 *  (window, cwd) session reattaches to it and replays buffered output. */
export interface PtyAcquireResult {
  id: string
  replay: string
}

/** Result of registering a project directory as a harness workspace. */
export interface WorkspaceSyncResult {
  workspaceId: string
  sessionId: string
  created: boolean
  agentTransport?: AgentTransportDescriptor
}

/** One bounded hunk in an Agent turn before/after comparison. */
export interface AgentReviewHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

/** Before/after comparison served by the Harness workspace-changes route. */
export type AgentReviewDiff =
  | {
    kind: 'text'
    path: string
    display: string
    before: boolean
    after: boolean
    hunks: AgentReviewHunk[]
    coarse: boolean
  }
  | { kind: 'binary' | 'oversized'; path: string; display: string }

/** Review data for one announced Agent workspace change. */
export interface AgentReviewResult {
  turnId: string
  seq: number
  available: boolean
  files: Array<{
    path: string
    display: string
    added: number
    deleted: number
    diff: AgentReviewDiff | null
  }>
}

/** Bounded result from the fixed project test command. */
export interface ProjectTestResult {
  command: 'pnpm' | 'npm'
  exitCode: number | null
  output: string
  timedOut: boolean
}

export type SearchPhase = 'running' | 'done' | 'cancelled'

export interface SearchProgressEvent {
  requestId: string
  phase: SearchPhase
  count: number
}

export type IpcChannel =
  | 'app.version'
  | 'app.platform'
  | 'app.capabilities'
  | 'app.settings.get'
  | 'app.settings.set'
  | 'window.minimize'
  | 'window.maximize'
  | 'window.close'
  | 'window.new'
  | 'window.setTitle'
  | 'project.openDialog'
  | 'project.open'
  | 'project.clone'
  | 'project.recent'
  | 'fs.readDir'
  | 'fs.readFile'
  | 'fs.writeFile'
  | 'fs.stat'
  | 'fs.mkdir'
  | 'fs.createFile'
  | 'fs.rename'
  | 'fs.remove'
  | 'fs.reveal'
  | 'search.files'
  | 'search.content'
  | 'search.cancel'
  | 'git.status'
  | 'git.diff'
  | 'git.stage'
  | 'git.unstage'
  | 'git.commit'
  | 'git.push'
  | 'git.pull'
  | 'git.checkout'
  | 'git.branches'
  | 'git.log'
  | 'pty.acquire'
  | 'pty.write'
  | 'pty.resize'
  | 'pty.kill'
  | 'host.status'
  | 'host.restart'
  | 'agent.status'
  | 'agent.send'
  | 'agent.cancel'
  | 'agent.resume'
  | 'agent.review'
  | 'test.run'
  | 'test.cancel'
  | 'workspace.sync'
  | 'credentials.has'
  | 'credentials.set'
  | 'credentials.clear'
  | 'mcp.list'
  | 'mcp.save'
  | 'rules.list'
  | 'inlineEdit.run'
  | 'dialog.openFiles'
  | 'dialog.saveFile'
  | 'shell.openExternal'

export type IpcEventChannel =
  | 'host:changed'
  | 'pty:data'
  | 'pty:exit'
  | 'fs:changed'
  | 'menu:command'
  | 'settings:changed'
  | 'search:progress'
  | 'capabilities:changed'
  | 'agent:event'

export interface IpcEventMap {
  'host:changed': HostState
  'pty:data': { id: string; data: string }
  'pty:exit': { id: string; exitCode: number }
  'fs:changed': { path: string; type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir' }
  'menu:command': string
  'settings:changed': AppSettings
  'search:progress': SearchProgressEvent
  'capabilities:changed': DesktopCapabilities
  'agent:event': AgentTurnEvent
}

export const DEFAULT_WINDOW: WindowState = {
  width: 1440,
  height: 900,
  isMaximized: false,
  sidebarWidth: 260,
  agentWidth: 420,
  panelHeight: 220,
  sidebarVisible: true,
  agentVisible: true,
  panelVisible: true,
  activity: 'explorer',
  panel: 'terminal',
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  keymap: 'cursor',
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
  fontSize: 13,
  tabSize: 2,
  wordWrap: true,
  minimap: false,
  autoSave: 'afterDelay',
  autoSaveDelayMs: 800,
  sandboxMode: 'workspace-write',
  defaultPreset: 'standard',
  defaultModel: 'deepseek-chat',
  recentProjects: [],
  window: DEFAULT_WINDOW,
}

export const IGNORED_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  'release',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  '.dsh',
  '.cursor',
])
