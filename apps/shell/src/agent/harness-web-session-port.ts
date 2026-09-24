import { randomUUID } from 'node:crypto'
import WebSocket, { type RawData } from 'ws'
import {
  AgentTransportUnsupportedError,
  buildContextBundle,
  type AgentReviewDiff,
  type AgentReviewHunk,
  type AgentReviewResult,
  type AgentTransportCapabilities,
  type AgentTurnEvent,
  type AgentTurnRequest,
  type JsonValue,
} from '@dhd/shared'
import type { AgentSessionPort } from './agent-session-port.ts'
import type { HarnessConnection } from '../harness-api.ts'

/** HTTP surface required by the authenticated Session channel. */
export interface HarnessSessionApi {
  authenticated(): Promise<HarnessConnection>
  call<T>(namespace: string, method: string, payload: object): Promise<T>
  getJson<T>(path: string, query?: Record<string, string>): Promise<T>
}

/** Construction inputs for one upstream Web Host Session channel. */
export interface HarnessWebSessionPortOptions {
  api: HarnessSessionApi
  sessionId: string
  maxContextBytes?: number
  streamOpenTimeoutMs?: number
}

interface PendingRequest {
  readonly turnId: string
  readonly request: AgentTurnRequest
  readonly requestId: string
  state: 'submitted' | 'active' | 'terminal'
  turnNumber?: number
}

interface StreamItem {
  readonly value: unknown
}

type StreamFrame =
  | { readonly type: 'item'; readonly value: unknown }
  | { readonly type: 'error'; readonly code: string; readonly message: string }
  | { readonly type: 'end' }

const MAX_STREAM_QUEUE_ITEMS = 1_024

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function positiveInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) > 0 ? value as number : undefined
}

function jsonValue(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (Array.isArray(value)) {
    const values: JsonValue[] = []
    for (const item of value) {
      const converted = jsonValue(item)
      if (converted === undefined) return undefined
      values.push(converted)
    }
    return values
  }
  const object = record(value)
  if (object === undefined) return undefined
  const values: Record<string, JsonValue> = Object.create(null)
  for (const [key, item] of Object.entries(object)) {
    const converted = jsonValue(item)
    if (converted === undefined) return undefined
    values[key] = converted
  }
  return values
}

function rawText(data: RawData): string | undefined {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
  return Buffer.from(data).toString('utf8')
}

function parseStreamFrame(textValue: string): StreamFrame {
  const value: unknown = JSON.parse(textValue)
  const frame = record(value)
  if (frame === undefined) throw new Error('invalid Remote stream frame')
  const type = frame.type
  if (type === 'item') return { type, value: frame.value }
  if (type === 'error') {
    const code = text(frame.code)
    const message = text(frame.message)
    if (code === undefined || message === undefined) throw new Error('invalid Remote stream error frame')
    return { type, code, message }
  }
  if (type === 'end') return { type }
  throw new Error('invalid Remote stream frame')
}

function snapshot(value: unknown): { cursor: number; records: unknown[] } {
  const frame = record(value)
  if (frame?.type !== 'snapshot' || !Number.isSafeInteger(frame.cursor) || !Array.isArray(frame.records)) {
    throw new Error('Session follow did not publish an opening snapshot')
  }
  return { cursor: frame.cursor as number, records: frame.records }
}

function eventRecord(value: unknown): { type: string; seq: number; data: Record<string, unknown> } | undefined {
  const envelope = record(value)
  const event = record(envelope?.event)
  const data = record(event?.data)
  if (event === undefined || data === undefined || typeof event.type !== 'string' || !Number.isSafeInteger(event.seq)) return undefined
  return { type: event.type, seq: event.seq as number, data }
}

function sourceRequestId(data: Record<string, unknown>): string | undefined {
  const source = record(data.source)
  return source?.kind === 'user' ? text(source.rpcId) : undefined
}

function reasonMessage(reason: Record<string, unknown> | undefined, kind: string): string {
  const error = record(reason?.error)
  return text(error?.message) ?? `Harness turn ended with ${kind}`
}

function changePaths(value: unknown): string[] | undefined {
  const summary = record(value)
  if (summary === undefined || !Array.isArray(summary.files)) return undefined
  const paths: string[] = []
  for (const file of summary.files) {
    const path = text(record(file)?.path)
    if (path === undefined) return undefined
    paths.push(path)
  }
  return paths
}

interface ReviewSummaryFile {
  path: string
  display: string
  added: number
  deleted: number
}

function reviewSummary(value: unknown): ReviewSummaryFile[] | undefined {
  const summary = record(value)
  if (summary === undefined || !Array.isArray(summary.files) || summary.files.length > 500) return undefined
  const files: ReviewSummaryFile[] = []
  for (const value of summary.files) {
    const file = record(value)
    const path = text(file?.path)
    const display = text(file?.display)
    if (file === undefined || path === undefined || display === undefined || !Number.isSafeInteger(file.added) || !Number.isSafeInteger(file.deleted)) return undefined
    files.push({ path, display, added: file.added as number, deleted: file.deleted as number })
  }
  return files
}

function reviewHunk(value: unknown): AgentReviewHunk | undefined {
  const hunk = record(value)
  if (hunk === undefined || ![hunk.oldStart, hunk.oldLines, hunk.newStart, hunk.newLines].every((field) => Number.isSafeInteger(field) && (field as number) >= 0) || !Array.isArray(hunk.lines) || !hunk.lines.every((line) => typeof line === 'string')) return undefined
  return {
    oldStart: hunk.oldStart as number,
    oldLines: hunk.oldLines as number,
    newStart: hunk.newStart as number,
    newLines: hunk.newLines as number,
    lines: hunk.lines as string[],
  }
}

function reviewDiff(value: unknown): AgentReviewDiff | undefined {
  const diff = record(value)
  const path = text(diff?.path)
  const display = text(diff?.display)
  if (diff === undefined || path === undefined || display === undefined) return undefined
  if (diff.kind === 'binary' || diff.kind === 'oversized') return { kind: diff.kind, path, display }
  if (diff.kind !== 'text' || typeof diff.before !== 'boolean' || typeof diff.after !== 'boolean' || typeof diff.coarse !== 'boolean' || !Array.isArray(diff.hunks)) return undefined
  const hunks: AgentReviewHunk[] = []
  for (const value of diff.hunks) {
    const hunk = reviewHunk(value)
    if (hunk === undefined) return undefined
    hunks.push(hunk)
  }
  return { kind: 'text', path, display, before: diff.before, after: diff.after, hunks, coarse: diff.coarse }
}

function promptContent(request: AgentTurnRequest, maxContextBytes: number): Array<{ type: 'text'; text: string }> {
  const bundle = buildContextBundle(request.context, maxContextBytes)
  if (bundle.items.length === 0) return [{ type: 'text', text: request.text }]
  return [
    { type: 'text', text: `[dhd-context]\n${bundle.canonical}[/dhd-context]` },
    { type: 'text', text: request.text },
  ]
}

/** Authenticated upstream Session channel backed by Host's Remote WebSocket stream. */
export class HarnessWebSessionPort implements AgentSessionPort {
  readonly capabilities: Pick<AgentTransportCapabilities, 'sendTurn' | 'cancel' | 'resume' | 'subscribe' | 'contextInjection' | 'changeProjection'> = {
    sendTurn: true,
    cancel: true,
    resume: true,
    subscribe: true,
    contextInjection: 'structured',
    changeProjection: true,
  }

  private readonly listeners = new Set<(event: AgentTurnEvent) => void>()
  private readonly requests = new Map<string, PendingRequest>()
  private readonly submitted: PendingRequest[] = []
  private readonly unassignedTurns: number[] = []
  private readonly requestIds = new Map<string, string>()
  private readonly turnNumbers = new Map<number, string>()
  private readonly callTurns = new Map<string, string>()
  private readonly terminalTurns = new Set<number>()
  private readonly queue: StreamItem[] = []
  private readonly waiters = new Set<{
    resolve: (item: StreamItem) => void
    reject: (error: Error) => void
  }>()
  private socket: WebSocket | undefined
  private connectPromise: Promise<void> | undefined
  private streamFailure: Error | undefined
  private streamGeneration = 0
  private streamEnded = false
  private connected = false
  private disposed = false
  private nextRequest = 1
  private activeTurnId: string | undefined
  private cursorValue: number | undefined
  private readonly streamId = randomUUID()
  private readonly maxContextBytes: number
  private readonly streamOpenTimeoutMs: number

  constructor(private readonly options: HarnessWebSessionPortOptions) {
    if (options.sessionId.length === 0) throw new Error('Harness Session id must not be empty')
    this.maxContextBytes = options.maxContextBytes ?? 128 * 1024
    this.streamOpenTimeoutMs = options.streamOpenTimeoutMs ?? 15_000
    if (!Number.isSafeInteger(this.streamOpenTimeoutMs) || this.streamOpenTimeoutMs <= 0) {
      throw new Error('Harness Session stream timeout must be a positive integer')
    }
  }

  get cursor(): number | undefined {
    return this.cursorValue
  }

  async connect(): Promise<void> {
    this.assertNotDisposed()
    if (this.connected) return
    if (this.connectPromise !== undefined) return this.connectPromise
    this.streamFailure = undefined
    this.streamEnded = false
    this.queue.length = 0
    this.unassignedTurns.length = 0
    this.activeTurnId = undefined
    const attempt = this.openStream(++this.streamGeneration)
    this.connectPromise = attempt
    try {
      await attempt
      this.connected = true
    } catch (error) {
      if (this.connectPromise === attempt) this.connectPromise = undefined
      throw error
    }
  }

  subscribe(listener: (event: AgentTurnEvent) => void): () => void {
    this.assertNotDisposed()
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async sendTurn(request: AgentTurnRequest): Promise<{ turnId: string }> {
    if (!this.connected) await this.connect()
    this.assertReady()
    if (request.turnId.length === 0) throw new Error('Agent turn id must not be empty')
    if (this.requests.has(request.turnId)) throw new Error(`turn already exists: ${request.turnId}`)
    return this.submit(request)
  }

  async cancel(turnId: string): Promise<void> {
    if (!this.connected) await this.connect()
    this.assertReady()
    const request = this.requests.get(turnId)
    if (request?.turnNumber === undefined) throw new Error(`turn is not active: ${turnId}`)
    const result: unknown = await this.options.api.call('session', 'cancel', { sessionId: this.options.sessionId })
    if (record(result)?.accepted !== true) throw new Error('Harness did not accept Session cancellation')
  }

  async resume(turnId: string): Promise<{ turnId: string }> {
    if (!this.connected) await this.connect()
    this.assertReady()
    const previous = this.requests.get(turnId)
    if (previous === undefined || previous.state !== 'terminal') throw new Error(`turn cannot be resumed: ${turnId}`)
    return this.submit(previous.request)
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.connected = false
    this.connectPromise = undefined
    const socket = this.socket
    this.socket = undefined
    if (socket !== undefined) {
      if (socket.readyState === WebSocket.CONNECTING) socket.terminate()
      else if (socket.readyState === WebSocket.OPEN) socket.close(1000, 'session port disposed')
    }
    const error = new Error('Harness Session port disposed')
    this.fail(error)
    this.listeners.clear()
  }

  private async submit(request: AgentTurnRequest): Promise<{ turnId: string }> {
    if (new TextEncoder().encode(request.text).byteLength > 1024 * 1024) throw new Error('Agent turn text exceeds 1 MiB')
    const requestId = `dhd-${request.turnId}-${this.nextRequest++}`
    if (requestId.length > 512) throw new Error('Agent turn id is too long for a Harness request id')
    const content = promptContent(request, this.maxContextBytes)
    const pending: PendingRequest = {
      turnId: request.turnId,
      request,
      requestId,
      state: 'submitted',
    }
    this.requests.set(request.turnId, pending)
    this.submitted.push(pending)
    this.requestIds.set(requestId, request.turnId)
    try {
      const result: unknown = await this.options.api.call('session', 'prompt', {
        requestId,
        sessionId: this.options.sessionId,
        mode: 'queue',
        content,
      })
      if (record(result)?.accepted !== true) throw new Error('Harness did not accept the Session prompt')
      return { turnId: request.turnId }
    } catch (error) {
      this.requests.delete(request.turnId)
      this.requestIds.delete(requestId)
      const index = this.submitted.indexOf(pending)
      if (index >= 0) this.submitted.splice(index, 1)
      throw error
    }
  }

  private async openStream(generation: number): Promise<void> {
    const connection = await this.options.api.authenticated()
    const url = new URL('/api/remote.mux', connection.origin)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(url, { headers: { Cookie: connection.cookie } })
    this.socket = socket
    try {
      await this.waitForOpen(socket)
      this.attachSocket(socket)
      socket.send(JSON.stringify({
        type: 'open',
        streamId: this.streamId,
        endpoint: 'session/follow',
        payload: { args: { request: { address: { kind: 'session', sessionId: this.options.sessionId }, assistantStream: true } } },
      }))
      const first = await this.nextItem(this.streamOpenTimeoutMs)
      const opening = snapshot(first.value)
      this.cursorValue = opening.cursor
      for (const record of opening.records) this.processEvent(record)
      this.connected = true
      void this.consume(generation)
    } catch (error) {
      if (this.socket === socket) this.socket = undefined
      if (socket.readyState === WebSocket.CONNECTING) socket.terminate()
      else if (socket.readyState === WebSocket.OPEN) socket.close(1000, 'Session stream setup failed')
      throw error
    }
  }

  private waitForOpen(socket: WebSocket): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => finish(new Error('Harness Session WebSocket open timed out')), this.streamOpenTimeoutMs)
      const cleanup = (): void => {
        clearTimeout(timer)
        socket.off('open', opened)
        socket.off('error', failed)
        socket.off('close', closed)
      }
      const finish = (error?: Error): void => {
        if (settled) return
        settled = true
        cleanup()
        if (error === undefined) resolve()
        else reject(error)
      }
      const opened = (): void => finish()
      const failed = (error: Error): void => finish(error)
      const closed = (): void => finish(new Error('Harness Session WebSocket closed before opening'))
      socket.once('open', opened)
      socket.once('error', failed)
      socket.once('close', closed)
    })
  }

  private attachSocket(socket: WebSocket): void {
    socket.on('message', (data: RawData, isBinary: boolean) => {
      if (this.socket !== socket) return
      if (isBinary) {
        this.fail(new Error('Harness Session WebSocket sent a binary frame'))
        socket.close(1003, 'text frames required')
        return
      }
      const value = rawText(data)
      if (value === undefined) return
      try {
        const frame = parseStreamFrame(value)
        if (frame.type === 'item') this.push({ value: frame.value })
        else if (frame.type === 'error') this.fail(new Error(`${frame.code}: ${frame.message}`))
        else {
          this.streamEnded = true
          this.fail(new Error('Harness Session follow stream ended'))
        }
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)))
        socket.close(1008, 'invalid Remote stream frame')
      }
    })
    socket.on('error', (error) => {
      if (this.socket === socket) this.fail(error)
    })
    socket.on('close', () => {
      if (this.socket !== socket) return
      this.socket = undefined
      if (!this.disposed && !this.streamEnded) this.fail(new Error('Harness Session WebSocket closed'))
    })
  }

  private async consume(generation: number): Promise<void> {
    try {
      while (!this.disposed && generation === this.streamGeneration) {
        const item = await this.nextItem()
        if (generation !== this.streamGeneration) return
        this.processEvent(item.value)
      }
    } catch (error) {
      if (!this.disposed && generation === this.streamGeneration) this.fail(error instanceof Error ? error : new Error(String(error)))
    }
  }

  private processEvent(value: unknown): void {
    const event = eventRecord(value)
    if (event === undefined) return
    this.cursorValue = event.seq
    if (event.type === 'turn/start') {
      const turn = positiveInteger(event.data.turn)
      if (turn !== undefined && this.submitted.length > 0) this.unassignedTurns.push(turn)
      return
    }
    if (event.type === 'user/message') {
      const requestId = sourceRequestId(event.data)
      if (requestId !== undefined) {
        const turnId = this.requestIds.get(requestId)
        const pending = turnId === undefined ? undefined : this.requests.get(turnId)
        const turn = this.takeUnassignedTurn()
        if (pending !== undefined && turn !== undefined) this.assignTurn(turn, pending)
      } else {
        this.assignFallbackTurn()
      }
      return
    }
    if (event.type === 'tool/call') {
      const turn = positiveInteger(event.data.turn)
      const turnId = turn === undefined ? this.activeTurnId : this.turnNumbers.get(turn) ?? this.assignFallbackTurn(turn)
      if (turnId === undefined) return
      const callId = text(event.data.callId)
      if (callId !== undefined) this.callTurns.set(callId, turnId)
      const input = parseToolArguments(event.data.arguments)
      this.emit({ type: 'tool-call', turnId, tool: text(event.data.name) ?? 'unknown', ...(input === undefined ? {} : { input }) })
      return
    }
    if (event.type === 'approval/asked') {
      const callId = text(event.data.callId)
      const turnId = callId === undefined
        ? this.activeTurnId ?? this.assignFallbackTurn()
        : this.callTurns.get(callId) ?? this.activeTurnId ?? this.assignFallbackTurn()
      const approvalId = text(event.data.id)
      if (turnId !== undefined && approvalId !== undefined) this.emit({ type: 'approval-required', turnId, approvalId })
      return
    }
    if (event.type === 'workspace/changes') {
      const turn = positiveInteger(event.data.turn)
      const turnId = turn === undefined ? this.activeTurnId : this.turnNumbers.get(turn) ?? this.assignFallbackTurn(turn)
      if (turnId !== undefined) void this.emitChangeProjection(turnId, event.seq)
      return
    }
    if (event.type !== 'turn/end') return
    const turn = positiveInteger(event.data.turn)
    if (turn === undefined || this.terminalTurns.has(turn)) return
    this.terminalTurns.add(turn)
    const turnId = this.turnNumbers.get(turn) ?? this.assignFallbackTurn(turn) ?? this.activeTurnId
    if (turnId === undefined) return
    const request = this.requests.get(turnId)
    if (request !== undefined) request.state = 'terminal'
    const reason = record(event.data.reason)
    const kind = text(reason?.kind) ?? 'unknown'
    if (this.activeTurnId === turnId) this.activeTurnId = undefined
    if (kind === 'completed') this.emit({ type: 'turn-completed', turnId })
    else if (kind === 'aborted') this.emit({ type: 'turn-cancelled', turnId })
    else this.emit({ type: 'turn-failed', turnId, message: reasonMessage(reason, kind) })
  }

  private assignTurn(turn: number, pending: PendingRequest): string {
    pending.state = 'active'
    pending.turnNumber = turn
    const submittedIndex = this.submitted.indexOf(pending)
    if (submittedIndex >= 0) this.submitted.splice(submittedIndex, 1)
    this.turnNumbers.set(turn, pending.turnId)
    this.activeTurnId = pending.turnId
    this.emit({ type: 'turn-started', turnId: pending.turnId })
    return pending.turnId
  }

  private takeUnassignedTurn(): number | undefined {
    return this.unassignedTurns.shift()
  }

  private assignFallbackTurn(turn = this.takeUnassignedTurn()): string | undefined {
    if (turn === undefined) return undefined
    const pending = this.submitted.find((candidate) => candidate.state === 'submitted')
    if (pending === undefined) return this.turnNumbers.get(turn)
    return this.assignTurn(turn, pending)
  }

  async review(seq: number): Promise<Omit<AgentReviewResult, 'turnId'>> {
    if (!Number.isSafeInteger(seq) || seq < 0) throw new Error('Agent review sequence is invalid')
    try {
      const summaryValue: unknown = await this.options.api.getJson('/api/changes.summary', {
        sessionId: this.options.sessionId,
        seq: String(seq),
      })
      const summary = reviewSummary(summaryValue)
      if (summary === undefined) return { seq, available: false, files: [] }
      const files = await Promise.all(summary.map(async (file, index) => {
        let diff: AgentReviewDiff | null = null
        try {
          const value: unknown = await this.options.api.getJson('/api/changes.diff', {
            sessionId: this.options.sessionId,
            seq: String(seq),
            index: String(index),
          })
          diff = reviewDiff(value) ?? null
        } catch {
          // A live Session may outlive the optional comparison route.
        }
        return { ...file, diff }
      }))
      return { seq, available: true, files }
    } catch {
      return { seq, available: false, files: [] }
    }
  }

  private async emitChangeProjection(turnId: string, seq: number): Promise<void> {
    try {
      const value: unknown = await this.options.api.getJson('/api/changes.summary', {
        sessionId: this.options.sessionId,
        seq: String(seq),
      })
      const paths = changePaths(value)
      if (paths !== undefined) this.emit({ type: 'change-projection', turnId, changedPaths: paths, summarySeq: seq })
    } catch {
      // The event remains in the Session log when the optional UI summary route is not mounted.
    }
  }

  private emit(event: AgentTurnEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        console.warn('[harness-session-port] event listener failed:', error)
      }
    }
  }

  private push(item: StreamItem): void {
    const waiter = this.waiters.values().next().value
    if (waiter !== undefined) {
      this.waiters.delete(waiter)
      waiter.resolve(item)
    } else {
      if (this.queue.length >= MAX_STREAM_QUEUE_ITEMS) {
        this.fail(new Error(`Harness Session stream exceeded ${MAX_STREAM_QUEUE_ITEMS} buffered items`))
        return
      }
      this.queue.push(item)
    }
  }

  private nextItem(timeoutMs?: number): Promise<StreamItem> {
    const item = this.queue.shift()
    if (item !== undefined) return Promise.resolve(item)
    if (this.streamFailure !== undefined) return Promise.reject(this.streamFailure)
    if (this.streamEnded) return Promise.reject(new Error('Harness Session follow stream ended'))
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject }
      if (timeoutMs === undefined) {
        this.waiters.add(waiter)
        return
      }
      const timer = setTimeout(() => {
        this.waiters.delete(waiter)
        reject(new Error('Harness Session follow stream timed out'))
      }, timeoutMs)
      const originalResolve = waiter.resolve
      waiter.resolve = (value) => {
        clearTimeout(timer)
        originalResolve(value)
      }
      const originalReject = waiter.reject
      waiter.reject = (error) => {
        clearTimeout(timer)
        originalReject(error)
      }
      this.waiters.add(waiter)
    })
  }

  private fail(error: Error): void {
    const firstFailure = this.streamFailure === undefined
    this.streamGeneration += 1
    this.connectPromise = undefined
    this.streamFailure ??= error
    const failure = this.streamFailure
    for (const waiter of this.waiters) waiter.reject(failure)
    this.waiters.clear()
    if (firstFailure && !this.disposed) {
      for (const request of this.requests.values()) {
        if (request.state !== 'terminal') {
          request.state = 'terminal'
          this.emit({ type: 'turn-failed', turnId: request.turnId, message: failure.message })
        }
      }
    }
    this.connected = false
    const socket = this.socket
    if (!this.disposed && socket?.readyState === WebSocket.OPEN) socket.close(1011, 'Session stream failed')
  }

  private assertReady(): void {
    this.assertNotDisposed()
    if (!this.connected) throw new AgentTransportUnsupportedError('connect')
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error('Harness Session port is disposed')
  }
}

function parseToolArguments(value: unknown): JsonValue | undefined {
  if (typeof value !== 'string') return jsonValue(value)
  try {
    return jsonValue(JSON.parse(value))
  } catch {
    return value
  }
}
