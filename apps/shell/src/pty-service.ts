import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PtyAcquireResult, PtyOptions } from '@dhd/shared'

interface PtyHandle {
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => void
  onData: (cb: (data: string) => void) => void
  onExit: (cb: (e: { exitCode: number }) => void) => void
}

function packageRequire(): NodeRequire {
  const here = dirname(fileURLToPath(import.meta.url))
  return createRequire(join(here, '..', 'package.json'))
}

function resolveShell(): string {
  if (process.platform === 'win32') {
    const comspec = process.env.COMSPEC
    if (comspec && existsSync(comspec)) return comspec
    return 'powershell.exe'
  }
  for (const candidate of [process.env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh']) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return '/bin/sh'
}

function shellEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!key || value === undefined) continue
    if (key.startsWith('ELECTRON_')) continue
    env[key] = value
  }
  const sep = process.platform === 'win32' ? ';' : ':'
  const pathParts = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    env.PATH,
  ].filter(Boolean)
  env.PATH = [...new Set(pathParts.join(sep).split(sep).filter(Boolean))].join(sep)
  env.TERM = 'xterm-256color'
  env.COLORTERM = 'truecolor'
  env.TERM_PROGRAM = 'DeepSeekHarnessDesktop'
  return env
}

function wrapPipes(child: ChildProcessWithoutNullStreams, resizeStream?: NodeJS.WritableStream): PtyHandle {
  return {
    write: (data) => {
      if (!child.killed && child.stdin.writable) child.stdin.write(data)
    },
    resize: (cols, rows) => {
      if (resizeStream && 'writable' in resizeStream && resizeStream.writable) {
        resizeStream.write(`${Math.max(cols, 2)} ${Math.max(rows, 2)}\n`)
      }
    },
    kill: () => {
      if (!child.killed) child.kill()
    },
    onData: (cb) => {
      child.stdout.on('data', (buf: Buffer) => cb(buf.toString('utf8')))
      child.stderr.on('data', (buf: Buffer) => cb(buf.toString('utf8')))
    },
    onExit: (cb) => {
      child.on('error', () => cb({ exitCode: 1 }))
      child.on('exit', (code) => cb({ exitCode: code ?? 0 }))
    },
  }
}

function spawnPiped(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
  extraFd = false,
): Promise<PtyHandle> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: extraFd ? ['pipe', 'pipe', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
    })
    const resizeStream = extraFd ? (child.stdio[3] as NodeJS.WritableStream | null) ?? undefined : undefined
    const handle = wrapPipes(child, resizeStream)
    const onError = (err: Error) => reject(err)
    child.once('error', onError)
    child.once('spawn', () => {
      child.off('error', onError)
      resolve(handle)
    })
  })
}

/**
 * node-pty >= 1.1 ships `prebuilds/<platform>-<arch>/` next to the native
 * module; older source builds place artifacts under `build/Release/`. The
 * packaged spawn-helper sometimes lands without the executable bit (pnpm
 * restores it mode 0644), which makes the native spawn fail with
 * `posix_spawnp` EACCES — restore 0755 once, best effort.
 */
function resolvePtyHelper(entry: string): string | undefined {
  const base = dirname(dirname(entry))
  const candidates = [
    join(base, 'build', 'Release', 'spawn-helper'),
    join(base, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'),
  ]
  const helper = candidates.find((p) => existsSync(p))
  if (!helper) return undefined
  try {
    chmodSync(helper, 0o755)
  } catch {
    // read-only install or packaged asar; the bit may already be correct
  }
  return helper
}

function tryNodePty(shell: string, cwd: string, cols: number, rows: number, env: Record<string, string>): PtyHandle | undefined {
  try {
    const req = packageRequire()
    const entry = req.resolve('node-pty')
    const helper = resolvePtyHelper(entry)
    if (!helper) {
      console.warn('[pty] node-pty spawn-helper not found, skip native backend')
      return undefined
    }
    const mod = req('node-pty') as {
      spawn: (file: string, args: string[], opts: object) => {
        write: (data: string) => void
        resize: (cols: number, rows: number) => void
        kill: () => void
        onData: (cb: (data: string) => void) => void
        onExit: (cb: (e: { exitCode: number }) => void) => void
      }
    }
    return mod.spawn(shell, process.platform === 'win32' ? [] : ['-il'], {
      cwd,
      cols,
      rows,
      env,
      name: 'xterm-256color',
    })
  } catch (err) {
    console.warn('[pty] node-pty spawn failed, falling back:', err)
    return undefined
  }
}

function resolvePython(): string | undefined {
  for (const candidate of ['/opt/homebrew/bin/python3', '/usr/local/bin/python3', '/usr/bin/python3']) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

function resolvePtyBridge(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, 'pty-bridge.py'),
    join(here, '..', 'scripts', 'pty-bridge.py'),
    typeof process.resourcesPath === 'string' ? join(process.resourcesPath, 'pty-bridge.py') : '',
  ].filter(Boolean)
  return candidates.find((path) => existsSync(path))
}

/** Real PTY via Python; Electron keeps talking over pipes (macOS `script` cannot). */
async function spawnViaPython(
  shell: string,
  cwd: string,
  env: Record<string, string>,
  cols: number,
  rows: number,
): Promise<PtyHandle> {
  const python = resolvePython()
  if (!python) throw new Error('python3 not found')
  const bridge = resolvePtyBridge()
  if (!bridge) throw new Error('pty-bridge.py not found')
  console.info(`[pty] python bridge ${python} ${bridge}`)
  const bridgeEnv = {
    ...env,
    DHD_PTY_CWD: cwd,
    DHD_PTY_SHELL: shell,
    COLUMNS: String(cols),
    LINES: String(rows),
    PYTHONUNBUFFERED: '1',
  }
  try {
    return await spawnPiped(python, ['-u', bridge], cwd, bridgeEnv, true)
  } catch (err) {
    // Hosts whose std fd table rejects a 4th slot (spawn EBADF) still work
    // over three pipes; the bridge treats a missing control fd as optional.
    if ((err as NodeJS.ErrnoException).code !== 'EBADF') throw err
    console.warn('[pty] python bridge without resize control fd (EBADF)')
    return spawnPiped(python, ['-u', bridge], cwd, bridgeEnv)
  }
}

async function spawnFallback(
  shell: string,
  cwd: string,
  env: Record<string, string>,
  cols: number,
  rows: number,
): Promise<PtyHandle> {
  if (process.platform === 'win32') {
    return spawnPiped(shell, [], cwd, env)
  }
  const errors: string[] = []
  try {
    return await spawnViaPython(shell, cwd, env, cols, rows)
  } catch (err) {
    errors.push(`python: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (process.platform === 'linux') {
    try {
      return await spawnPiped('/usr/bin/script', ['-qefc', `${shell} -il`, '/dev/null'], cwd, env)
    } catch (err) {
      errors.push(`script: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  if (process.platform === 'darwin') {
    // macOS `script` wraps the shell in a real PTY and speaks over our pipes,
    // unlike the python bridge it survives hosts where extra stdio fds fail.
    try {
      return await spawnPiped('/usr/bin/script', ['-q', '/dev/null', shell, '-il'], cwd, {
        ...env,
        COLUMNS: String(cols),
        LINES: String(rows),
      })
    } catch (err) {
      errors.push(`script: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  try {
    return await spawnPiped(shell, ['-il'], cwd, env)
  } catch (err) {
    errors.push(`shell: ${err instanceof Error ? err.message : String(err)}`)
    throw new Error(`Unable to start terminal. ${errors.join(' | ')}`)
  }
}

interface Session {
  id: string
  /** webContents.id of the window that owns this terminal. */
  owner: number
  /** Requested cwd; sessions are matched per (owner, cwdKey). */
  cwdKey: string
  /** Raw output replay buffer, capped, so a reattached panel can catch up. */
  replay: string
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => void
}

const sessions = new Map<string, Session>()
const pendingAcquires = new Map<string, Promise<PtyAcquireResult>>()
const REPLAY_CAP = 256 * 1024

function findSession(owner: number, cwdKey: string): Session | undefined {
  for (const session of sessions.values()) {
    if (session.owner === owner && session.cwdKey === cwdKey) return session
  }
  return undefined
}

/**
 * Acquire the terminal for (window, project). Sessions outlive panel/tab
 * switches: an existing live session is returned together with its buffered
 * output instead of being respawned. Concurrent acquires (React StrictMode
 * double-mount) share one spawn. Acquiring a different project kills this
 * window's previous session (single-terminal model).
 */
export async function acquirePty(
  options: PtyOptions,
  owner: number,
  onData: (id: string, data: string) => void,
  onExit: (id: string, exitCode: number) => void,
): Promise<PtyAcquireResult> {
  const cwdKey = options.cwd ?? ''
  const key = `${owner}::${cwdKey}`
  const inFlight = pendingAcquires.get(key)
  if (inFlight) return inFlight

  const promise = (async (): Promise<PtyAcquireResult> => {
    for (const [id, session] of sessions) {
      if (session.owner === owner && session.cwdKey !== cwdKey) killPty(id)
    }
    const existing = findSession(owner, cwdKey)
    if (existing) return { id: existing.id, replay: existing.replay }

    const id = randomUUID()
    const shell = resolveShell()
    const cwd = (options.cwd && existsSync(options.cwd) ? options.cwd : homedir()) || process.cwd()
    const env = shellEnv()
    const cols = Math.max(options.cols || 0, 80)
    const rows = Math.max(options.rows || 0, 24)

    let proc = tryNodePty(shell, cwd, cols, rows, env)
    if (!proc) {
      proc = await spawnFallback(shell, cwd, env, cols, rows)
    }

    const session: Session = {
      id,
      owner,
      cwdKey,
      replay: '',
      write: (data) => proc.write(data),
      resize: (c, r) => proc.resize(Math.max(c, 2), Math.max(r, 2)),
      kill: () => proc.kill(),
    }
    proc.onData((data) => {
      session.replay = session.replay + data
      if (session.replay.length > REPLAY_CAP) session.replay = session.replay.slice(-REPLAY_CAP)
      onData(id, data)
    })
    proc.onExit((e) => {
      sessions.delete(id)
      onExit(id, e.exitCode)
    })
    sessions.set(id, session)
    return { id, replay: '' }
  })()

  pendingAcquires.set(key, promise)
  try {
    return await promise
  } finally {
    pendingAcquires.delete(key)
  }
}

export function writePty(id: string, data: string): void {
  sessions.get(id)?.write(data)
}

export function resizePty(id: string, cols: number, rows: number): void {
  sessions.get(id)?.resize(cols, rows)
}

export function killPty(id: string): void {
  sessions.get(id)?.kill()
  sessions.delete(id)
}

export function killSessionsOfOwner(owner: number): void {
  for (const [id, session] of sessions) {
    if (session.owner === owner) killPty(id)
  }
}

export function killAllPty(): void {
  for (const session of sessions.values()) session.kill()
  sessions.clear()
}
