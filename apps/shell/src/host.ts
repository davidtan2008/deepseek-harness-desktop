import { spawn, type ChildProcess } from 'node:child_process'
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

export class HostProcess {
  private child: ChildProcess | undefined
  private owned = false
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
    if (this.state.status === 'ready' || this.state.status === 'starting') return this.state
    this.set({ status: 'starting' })
    this.buffer = ''
    this.owned = false

    const adopted = await this.adoptExisting()
    if (adopted) return this.state

    return this.spawnOwned()
  }

  async stop(): Promise<void> {
    const child = this.child
    this.child = undefined
    if (!this.owned || !child || child.killed) {
      this.owned = false
      if (this.state.status === 'ready' && !child) return
      this.set({ status: 'stopped' })
      return
    }
    this.owned = false
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        resolve()
      }, 4000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      child.kill('SIGTERM')
    })
    this.set({ status: 'stopped' })
  }

  async restart(): Promise<HostState> {
    await this.stop()
    return this.start()
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
    this.child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    return await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.state.status === 'starting') {
          this.set({
            status: 'error',
            message: 'Harness host did not become ready in time. Build the upstream repo with pnpm run build, or set DHD_HARNESS_URL to the printed dsh web URL.',
          })
          resolve(this.state)
        }
      }, 90_000)

      const onData = (chunk: Buffer) => {
        const text = chunk.toString('utf8')
        this.buffer += text
        process.stdout.write(`[dsh] ${text}`)
        const match = this.buffer.match(READY)
        if (match?.[1]) {
          clearTimeout(timeout)
          const ready = parseReadyUrl(match[1])
          if (!ready) {
            this.set({ status: 'error', message: `Invalid host URL: ${match[1]}` })
            resolve(this.state)
            return
          }
          this.set(ready)
          resolve(this.state)
        }
      }

      this.child?.stdout?.on('data', onData)
      this.child?.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8')
        this.buffer += text
        process.stderr.write(`[dsh:err] ${text}`)
        onData(chunk)
      })
      this.child?.on('exit', (code) => {
        clearTimeout(timeout)
        this.child = undefined
        this.owned = false
        if (this.state.status !== 'ready') {
          void this.failWithHint(code).then(resolve)
        } else {
          this.set({ status: 'stopped' })
          resolve(this.state)
        }
      })
    })
  }

  private async failWithHint(code: number | null): Promise<HostState> {
    const running = await probeUrl(`${DEFAULT_ORIGIN}/`)
    const tail = this.tail()
    const hint = running
      ? `本机 ${DEFAULT_ORIGIN} 已有 dsh web，但桌面需要启动时打印的完整 URL（含 ?token=）。把它设为环境变量 DHD_HARNESS_URL 后重启桌面；或关掉该进程，由桌面端用空闲端口自行拉起。`
      : '请确认已在 deepseek-harness 目录执行 pnpm install && pnpm run build。'
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
    for (const listener of this.listeners) listener(state)
  }
}
