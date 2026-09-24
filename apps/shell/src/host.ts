import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { HostState } from '@dhd/shared'
import { harnessRoot, resolveDshHome } from './paths.ts'
import { desktopMcpPatchPath } from './mcp-service.ts'

const READY = /dsh web:\s*(https?:\/\/[^\s]+)/
const DEFAULT_ORIGIN = 'http://127.0.0.1:3080'

export type HostListener = (state: HostState) => void

function which(bin: string): string | undefined {
  const pathEnv = process.env.PATH ?? ''
  const ext = process.platform === 'win32' ? ['.cmd', '.exe', ''] : ['']
  for (const dir of pathEnv.split(process.platform === 'win32' ? ';' : ':')) {
    for (const suffix of ext) {
      const candidate = join(dir, `${bin}${suffix}`)
      if (existsSync(candidate)) return candidate
    }
  }
  return undefined
}

function resolveNode(): string {
  if (process.env.DHD_NODE?.trim()) return process.env.DHD_NODE
  const fromPath = which('node')
  if (fromPath) return fromPath
  const common = [
    '/usr/local/bin/node',
    '/opt/homebrew/bin/node',
    join(homedir(), '.nvm/current/bin/node'),
  ]
  return common.find((p) => existsSync(p)) ?? 'node'
}

function parseReadyUrl(raw: string): HostState | undefined {
  try {
    const parsed = new URL(raw)
    return {
      status: 'ready',
      url: raw,
      origin: parsed.origin,
      token: parsed.searchParams.get('token') ?? '',
    }
  } catch {
    return undefined
  }
}

/** Launcher flags (`web`, `--patch`) must come before app flags (`--no-open`, `--port`). */
function dshWebArgs(): string[] {
  const args = ['web']
  const mcpPatch = desktopMcpPatchPath()
  if (existsSync(mcpPatch)) args.push('--patch', mcpPatch)
  args.push('--no-open', '--port', '0')
  return args
}

async function probeUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(1500) })
    return res.status === 200 || res.status === 302 || res.status === 303 || res.status === 401
  } catch {
    return false
  }
}

function waitForExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      child.off('exit', finish)
      child.off('error', finish)
      child.off('close', finish)
      resolve()
    }
    child.once('exit', finish)
    child.once('error', finish)
    child.once('close', finish)
  })
}

async function exitsWithin(exit: Promise<void>, milliseconds: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), milliseconds)
  })
  try {
    return await Promise.race([exit.then(() => true), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Signal an owned Host and its descendants without affecting an adopted Host. */
function signalTree(child: ChildProcess, signal: NodeJS.Signals): void {
  const pid = child.pid
  if (pid === undefined) {
    try { child.kill(signal) } catch { /* already gone */ }
    return
  }
  if (process.platform === 'win32') {
    if (signal === 'SIGKILL') {
      try {
        spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      } catch {
        try { child.kill(signal) } catch { /* already gone */ }
      }
      return
    }
    try { child.kill(signal) } catch { /* already gone */ }
    return
  }
  try {
    process.kill(-pid, signal)
  } catch {
    try { child.kill(signal) } catch { /* already gone */ }
  }
}

export class HostProcess {
  private child: ChildProcess | undefined
  private owned = false
  private stopping = false
  private lifecycleToken = 0
  private stopPromise: Promise<void> | undefined
  private state: HostState = { status: 'stopped' }
  private readonly listeners = new Set<HostListener>()
  private buffer = ''

  on(listener: HostListener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  getState(): HostState {
    return this.state
  }

  async start(): Promise<HostState> {
    if (this.stopPromise) await this.stopPromise
    if (this.stopping) return this.state
    if (this.state.status === 'ready' || this.state.status === 'starting') return this.state
    const token = ++this.lifecycleToken
    this.set({ status: 'starting' })
    this.buffer = ''
    this.owned = false

    const adopted = await this.adoptExisting()
    if (this.stopping || token !== this.lifecycleToken) {
      this.set({ status: 'stopped' })
      return this.state
    }
    if (adopted) return this.state

    return this.spawnOwned()
  }

  async stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise
    this.lifecycleToken += 1
    this.stopping = true
    const child = this.child
    if (!this.owned || !child) {
      this.owned = false
      this.set({ status: 'stopped' })
      this.stopping = false
      return
    }

    const promise = this.stopChild(child)
    this.stopPromise = promise
    try {
      await promise
    } finally {
      if (this.stopPromise === promise) this.stopPromise = undefined
      this.stopping = false
      if (this.child === child && (child.exitCode !== null || child.signalCode !== null)) {
        this.child = undefined
        this.owned = false
      }
    }
  }

  async restart(): Promise<HostState> {
    await this.stop()
    return this.start()
  }

  private async stopChild(child: ChildProcess): Promise<void> {
    const exited = waitForExit(child)
    signalTree(child, 'SIGTERM')
    if (!await exitsWithin(exited, 2000)) {
      signalTree(child, 'SIGKILL')
      if (!await exitsWithin(exited, 1000)) {
        console.warn('[host] child did not exit after SIGKILL')
      }
    }
    this.owned = false
    if (this.child === child) this.child = undefined
    this.set({ status: 'stopped' })
  }

  private async adoptExisting(): Promise<boolean> {
    const fromEnv = process.env.DHD_HARNESS_URL?.trim()
    if (fromEnv) {
      const ready = parseReadyUrl(fromEnv)
      if (ready) {
        this.set(ready)
        return true
      }
    }
    return false
  }

  private async spawnOwned(): Promise<HostState> {
    const harness = harnessRoot()
    const node = resolveNode()
    const dshHome = resolveDshHome()
    const webArgs = dshWebArgs()
    let command = node
    let args: string[]
    let cwd: string | undefined

    if (harness) {
      const bin = join(harness, 'apps/cli/src/bin.ts')
      cwd = harness
      args = ['--import', 'tsx/esm', bin, ...webArgs]
    } else {
      command = which('npx') ?? 'npx'
      args = ['--yes', '@deepseek-ai/dsh', ...webArgs]
    }

    const env: NodeJS.ProcessEnv = { ...process.env, DSH_HOME: dshHome, DHD_DESKTOP: '1' }
    delete env.ELECTRON_RUN_AS_NODE
    this.owned = true
    let child: ChildProcess
    try {
      child = spawn(command, args, {
        cwd,
        env,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      this.owned = false
      this.set({ status: 'error', message: `Harness host could not start: ${String(error)}` })
      return this.state
    }
    this.child = child

    return await new Promise((resolve) => {
      let settled = false
      const finish = (state: HostState = this.state): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve(state)
      }
      const timeout = setTimeout(() => {
        if (this.state.status === 'starting') {
          this.set({
            status: 'error',
            message: 'Harness host did not become ready in time. Run pnpm install && pnpm run build inside the harness/ submodule, or set DHD_HARNESS_URL to the printed dsh web URL.',
          })
          signalTree(child, 'SIGTERM')
        }
        finish(this.state)
      }, 90_000)

      const onData = (chunk: Buffer): void => {
        const text = chunk.toString('utf8')
        this.buffer = `${this.buffer}${text}`.slice(-128 * 1024)
        process.stdout.write(`[dsh] ${text}`)
        const match = this.buffer.match(READY)
        if (match?.[1] && this.state.status === 'starting') {
          const ready = parseReadyUrl(match[1])
          if (!ready) {
            this.set({ status: 'error', message: `Invalid host URL: ${match[1]}` })
            signalTree(child, 'SIGTERM')
            finish(this.state)
            return
          }
          this.set(ready)
          finish(this.state)
        }
      }

      child.stdout?.on('data', onData)
      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8')
        this.buffer = `${this.buffer}${text}`.slice(-128 * 1024)
        process.stderr.write(`[dsh:err] ${text}`)
        onData(chunk)
      })
      child.once('error', (error) => {
        if (this.child === child) {
          this.child = undefined
          this.owned = false
        }
        this.set({ status: 'error', message: `Harness host process failed: ${error.message}` })
        finish(this.state)
      })
      child.once('exit', (code) => {
        if (this.child === child) {
          this.child = undefined
          this.owned = false
        }
        if (settled) return
        if (this.state.status !== 'ready') {
          void this.failWithHint(code).then(finish)
        } else {
          this.set({ status: 'stopped' })
          finish(this.state)
        }
      })
    })
  }

  private async failWithHint(code: number | null): Promise<HostState> {
    const running = await probeUrl(`${DEFAULT_ORIGIN}/`)
    const tail = this.tail()
    const hint = running
      ? `本机 ${DEFAULT_ORIGIN} 已有 dsh web，但桌面需要启动时打印的完整 URL（含 ?token=）。把它设为环境变量 DHD_HARNESS_URL 后重启桌面；或关掉该进程，由桌面端用空闲端口自行拉起。`
      : '请确认已在 harness/ 子模块（或 DHD_HARNESS_ROOT 指向的目录）执行 pnpm install && pnpm run build。'
    this.set({
      status: 'error',
      message: `Harness exited before ready (code ${code ?? 'null'}). ${hint} ${tail}`,
    })
    return this.state
  }

  private tail(): string {
    return this.buffer.trim().split(/\n/).slice(-8).join('\n')
  }

  private set(state: HostState): void {
    this.state = state
    for (const listener of this.listeners) {
      try { listener(state) } catch (error) { console.warn('[host] state listener failed:', error) }
    }
  }
}
