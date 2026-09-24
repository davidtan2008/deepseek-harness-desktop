import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import {
  AGENT_TRANSPORT_CONTRACT_VERSION,
  AgentTransportUnsupportedError,
  type AgentTransportDescriptor,
  type AgentTransportDriver,
  type AgentTurnEvent,
  type AgentTurnRequest,
} from '@dhd/shared'
import type { AgentSessionPort } from './agent-session-port.ts'

export type { AgentSessionPort } from './agent-session-port.ts'

export type UpstreamHostEvent =
  | { type: 'ready'; url: string; injections?: unknown }
  | { type: 'fatal'; message: string; diagnostic?: string }
  | { type: 'shutdown-complete' }
  | { type: 'platform-session'; session: unknown }
  | { type: 'update-tasks'; requestId: number; active: boolean; error?: string }

export interface AgentHostConnection {
  readonly status: 'disconnected' | 'connecting' | 'ready' | 'error'
  start(): Promise<unknown>
  stop(): Promise<void>
}

export interface UpstreamHostIpcOptions {
  node: string
  entry: string
  runtimeDir: string
  projectDir: string
  primaryRuntime?: string
  pnpmEntry?: string
  nodeBin?: string
  environment?: NodeJS.ProcessEnv
  readyTimeoutMs?: number
}

export interface UpstreamHostReady {
  url: string
  injections?: unknown
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

function upstreamEvent(value: unknown): UpstreamHostEvent {
  const event = record(value)
  if (event === undefined) throw new Error('upstream Desktop Host sent an invalid IPC event')
  const type = event.type
  if (type === 'ready' && typeof event.url === 'string') {
    const url = new URL(event.url)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('upstream Host ready URL is not HTTP')
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('upstream Host ready URL is not loopback')
    return { type, url: event.url, ...(event.injections === undefined ? {} : { injections: event.injections }) }
  }
  if (type === 'fatal' && typeof event.message === 'string') {
    return { type, message: event.message, ...(typeof event.diagnostic === 'string' ? { diagnostic: event.diagnostic } : {}) }
  }
  if (type === 'shutdown-complete') return { type }
  if (type === 'platform-session') return { type, session: event.session ?? null }
  if (type === 'update-tasks' && Number.isSafeInteger(event.requestId) && typeof event.active === 'boolean') {
    return { type, requestId: event.requestId as number, active: event.active, ...(typeof event.error === 'string' ? { error: event.error } : {}) }
  }
  throw new Error('upstream Desktop Host sent an invalid IPC event')
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

function isMissingProcess(error: unknown): boolean {
  return record(error)?.code === 'ESRCH'
}

function signalChild(child: ChildProcess, signal: NodeJS.Signals): void {
  if (process.platform !== 'win32' && child.pid !== undefined) {
    try {
      process.kill(-child.pid, signal)
      return
    } catch (error) {
      if (!isMissingProcess(error)) throw error
      return
    }
  }
  try { child.kill(signal) } catch (error) { if (!isMissingProcess(error)) throw error }
}

/** Owns one upstream Desktop Host child and its structured IPC lifecycle. */
export class UpstreamHostIpcConnection implements AgentHostConnection {
  private child: ChildProcess | undefined
  private ready: Promise<UpstreamHostReady> | undefined
  private resolveReady: ((value: UpstreamHostReady) => void) | undefined
  private rejectReady: ((error: Error) => void) | undefined
  private listeners = new Set<(event: UpstreamHostEvent) => void>()
  private stopping = false
  private readyValue: UpstreamHostReady | undefined
  private failure: Error | undefined
  private stderr = ''
  private nextRequestId = 1

  constructor(private readonly options: UpstreamHostIpcOptions) {}

  get status(): 'disconnected' | 'connecting' | 'ready' | 'error' {
    if (this.failure !== undefined) return 'error'
    if (this.readyValue !== undefined) return 'ready'
    return this.child === undefined ? 'disconnected' : 'connecting'
  }

  get snapshot(): UpstreamHostReady | undefined {
    return this.readyValue === undefined ? undefined : { ...this.readyValue }
  }

  subscribe(listener: (event: UpstreamHostEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start(): Promise<UpstreamHostReady> {
    if (this.ready !== undefined) return this.ready
    this.ready = new Promise<UpstreamHostReady>((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })
    const args = [
      '--expose-internals',
      this.options.entry,
      this.options.runtimeDir,
      this.options.projectDir,
      this.options.primaryRuntime ?? join(this.options.runtimeDir, '..', 'runtime', 'primary-runtime'),
      ...(this.options.pnpmEntry === undefined ? [] : [this.options.pnpmEntry, this.options.nodeBin ?? '']),
    ]
    const child = spawn(this.options.node, args, {
      cwd: this.options.projectDir,
      env: { ...process.env, ...this.options.environment },
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    this.child = child
    child.stdout?.resume()
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => { this.stderr = `${this.stderr}${chunk}`.slice(-64 * 1024) })
    child.on('message', (message: unknown) => {
      let event: UpstreamHostEvent
      try {
        event = upstreamEvent(message)
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)))
        signalChild(child, 'SIGTERM')
        return
      }
      this.publish(event)
      if (event.type === 'ready') {
        this.readyValue = { url: event.url, ...(event.injections === undefined ? {} : { injections: event.injections }) }
        this.resolveReady?.(this.readyValue)
      } else if (event.type === 'fatal') {
        this.fail(new Error(event.message))
        signalChild(child, 'SIGTERM')
      }
    })
    child.once('error', (error) => this.fail(error))
    child.once('close', (code, signal) => {
      if (this.child === child) this.child = undefined
      if (!this.stopping && this.readyValue === undefined) this.fail(new Error(`upstream Desktop Host exited before ready (${String(code ?? signal)})`))
      if (!this.stopping && this.readyValue !== undefined) this.fail(new Error(`upstream Desktop Host exited (${String(code ?? signal)})`))
    })
    const timeout = setTimeout(() => {
      if (this.readyValue === undefined) {
        this.fail(new Error('upstream Desktop Host did not become ready before timeout'))
        signalChild(child, 'SIGTERM')
      }
    }, this.options.readyTimeoutMs ?? 90_000)
    void this.ready.then(
      () => clearTimeout(timeout),
      () => clearTimeout(timeout),
    )
    return this.ready
  }

  async updateTasks(action: 'inspect' | 'lock' | 'unlock'): Promise<boolean> {
    const child = this.child
    if (child === undefined || !child.connected || this.failure !== undefined) throw new Error('upstream Desktop Host is unavailable')
    const requestId = this.nextRequestId++
    return new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error('upstream update task request timed out')) }, 10_000)
      const cleanup = () => {
        clearTimeout(timer)
        child.off('message', onMessage)
      }
      const onMessage = (message: unknown) => {
        const event = record(message)
        if (event?.type !== 'update-tasks' || event.requestId !== requestId) return
        cleanup()
        if (typeof event.error === 'string') reject(new Error(event.error))
        else resolve(event.active === true)
      }
      child.on('message', onMessage)
      child.send({ type: 'update-tasks', requestId, action }, (error) => {
        if (error !== null) {
          cleanup()
          reject(error)
        }
      })
    })
  }

  async stop(): Promise<void> {
    const child = this.child
    if (child === undefined) return
    this.stopping = true
    if (child.connected) child.send({ type: 'shutdown' }, () => undefined)
    if (!await waitForExit(child, 10_000)) {
      signalChild(child, 'SIGTERM')
      if (!await waitForExit(child, 5_000)) {
        signalChild(child, 'SIGKILL')
        if (!await waitForExit(child, 5_000)) throw new Error('upstream Desktop Host did not exit after SIGKILL')
      }
    }
    if (this.child === child) this.child = undefined
    this.readyValue = undefined
  }

  private publish(event: UpstreamHostEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        console.warn('[upstream-host-ipc] event listener failed:', error)
      }
    }
  }

  private fail(error: Error): void {
    if (this.failure !== undefined) return
    this.failure = error
    this.rejectReady?.(error)
  }
}

export class UnsupportedAgentSessionPort implements AgentSessionPort {
  readonly capabilities = { sendTurn: false, cancel: false, resume: false, subscribe: false, contextInjection: 'none', changeProjection: false } as const

  async connect(): Promise<void> {}

  async sendTurn(): Promise<{ turnId: string }> {
    throw new AgentTransportUnsupportedError('sendTurn')
  }

  async cancel(): Promise<void> {
    throw new AgentTransportUnsupportedError('cancel')
  }

  async resume(): Promise<{ turnId: string }> {
    throw new AgentTransportUnsupportedError('resume')
  }

  subscribe(): () => void {
    return () => undefined
  }

  async dispose(): Promise<void> {}
}

/** Adapts upstream Host lifecycle IPC and an injected Session port to the Desktop transport contract. */
export class HostIpcTransportDriver implements AgentTransportDriver {
  private connected = false

  constructor(
    private readonly host: AgentHostConnection,
    private readonly sessions: AgentSessionPort,
    private readonly managed = true,
  ) {}

  capabilities(): AgentTransportDescriptor {
    return {
      contractVersion: AGENT_TRANSPORT_CONTRACT_VERSION,
      id: 'host-ipc',
      status: this.host.status,
      managed: this.managed,
      capabilities: { ...this.sessions.capabilities },
    }
  }

  async connect(): Promise<AgentTransportDescriptor> {
    await this.host.start()
    await this.sessions.connect?.()
    this.connected = true
    return this.capabilities()
  }

  async sendTurn(request: AgentTurnRequest): Promise<{ turnId: string }> {
    this.assertConnected()
    return this.sessions.sendTurn(request)
  }

  async cancel(turnId: string): Promise<void> {
    this.assertConnected()
    await this.sessions.cancel(turnId)
  }

  async resume(turnId: string): Promise<{ turnId: string }> {
    this.assertConnected()
    return this.sessions.resume(turnId)
  }

  subscribe(listener: (event: AgentTurnEvent) => void): () => void {
    return this.sessions.subscribe(listener)
  }

  async dispose(): Promise<void> {
    this.connected = false
    const results = await Promise.allSettled([this.host.stop(), this.sessions.dispose()])
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (failures.length > 0) throw new AggregateError(failures.map((failure) => failure.reason), 'upstream Host transport cleanup failed')
  }

  private assertConnected(): void {
    if (!this.connected) throw new AgentTransportUnsupportedError('connect')
  }
}
