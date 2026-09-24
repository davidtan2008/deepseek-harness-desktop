import type { AgentTransportDriver, AgentTurnEvent, AgentTurnRequest, AgentTurnStatus } from './agent-transport.js'

export interface AgentTurnSnapshot {
  turnId: string
  status: AgentTurnStatus
  error?: string
}

export type AgentTurnListener = (snapshot: AgentTurnSnapshot) => void

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Owns turn state and maps transport events to observable snapshots. */
export class AgentTurnController {
  private readonly turns = new Map<string, AgentTurnSnapshot>()
  private readonly listeners = new Set<AgentTurnListener>()
  private readonly unsubscribeDriver: () => void
  private disposed = false

  constructor(private readonly driver: AgentTransportDriver) {
    this.unsubscribeDriver = driver.subscribe((event) => this.apply(event))
  }

  async start(request: AgentTurnRequest): Promise<AgentTurnSnapshot> {
    this.assertActive()
    if (this.turns.has(request.turnId)) throw new Error(`turn already exists: ${request.turnId}`)
    this.set(request.turnId, 'starting')
    try {
      await this.driver.sendTurn(request)
      return this.get(request.turnId)
    } catch (error) {
      this.set(request.turnId, 'failed', message(error))
      throw error
    }
  }

  async cancel(turnId: string): Promise<AgentTurnSnapshot> {
    this.assertActive()
    const current = this.require(turnId)
    if (isTerminal(current.status)) return current
    this.set(turnId, 'cancelling')
    try {
      await this.driver.cancel(turnId)
      return this.get(turnId)
    } catch (error) {
      this.set(turnId, 'failed', message(error))
      throw error
    }
  }

  async resume(turnId: string): Promise<AgentTurnSnapshot> {
    this.assertActive()
    const current = this.require(turnId)
    if (current.status !== 'failed' && current.status !== 'cancelled') {
      throw new Error(`turn cannot be resumed from ${current.status}`)
    }
    this.set(turnId, 'starting')
    try {
      await this.driver.resume(turnId)
      return this.get(turnId)
    } catch (error) {
      this.set(turnId, 'failed', message(error))
      throw error
    }
  }

  get(turnId: string): AgentTurnSnapshot {
    this.assertActive()
    return { ...this.require(turnId) }
  }

  subscribe(listener: AgentTurnListener): () => void {
    this.assertActive()
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribeDriver()
    this.listeners.clear()
    this.turns.clear()
    await this.driver.dispose()
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('agent turn controller is disposed')
  }

  private require(turnId: string): AgentTurnSnapshot {
    const turn = this.turns.get(turnId)
    if (turn === undefined) throw new Error(`turn not found: ${turnId}`)
    return turn
  }

  private set(turnId: string, status: AgentTurnStatus, error?: string): void {
    const snapshot: AgentTurnSnapshot = error === undefined ? { turnId, status } : { turnId, status, error }
    this.turns.set(turnId, snapshot)
    for (const listener of this.listeners) listener({ ...snapshot })
  }

  private apply(event: AgentTurnEvent): void {
    if (this.disposed) return
    switch (event.type) {
      case 'turn-started':
        this.set(event.turnId, 'running')
        return
      case 'approval-required':
        this.set(event.turnId, 'awaiting-approval')
        return
      case 'turn-completed':
        this.set(event.turnId, 'completed')
        return
      case 'turn-failed':
        this.set(event.turnId, 'failed', event.message)
        return
      case 'turn-cancelled':
        this.set(event.turnId, 'cancelled')
        return
      case 'tool-call':
      case 'change-projection':
        return
      default:
        return
    }
  }
}

function isTerminal(status: AgentTurnStatus): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'failed'
}
