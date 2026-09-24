import {
  AgentTurnController,
  AGENT_TRANSPORT_CONTRACT_VERSION,
  type AgentReviewResult,
  type AgentTransportDescriptor,
  type AgentTurnEvent,
  type AgentTurnRequest,
} from '@dhd/shared'
import { HostIpcTransportDriver, type AgentHostConnection } from './agent/host-ipc-driver.ts'
import { HarnessWebSessionPort } from './agent/harness-web-session-port.ts'
import { HarnessApi } from './harness-api.ts'
import type { HostProcess } from './host.ts'

class ExistingHostConnection implements AgentHostConnection {
  constructor(private readonly host: HostProcess) {}

  get status(): AgentHostConnection['status'] {
    switch (this.host.getState().status) {
      case 'ready': return 'ready'
      case 'starting': return 'connecting'
      case 'error': return 'error'
      default: return 'disconnected'
    }
  }

  async start(): Promise<HostProcess> {
    const state = this.host.getState()
    if (state.status !== 'ready') throw new Error('Harness Host is not ready')
    return this.host
  }

  async stop(): Promise<void> {
    // The application HostProcess owns the shared web Host; the Agent runtime
    // must not stop the iframe's Host as a side effect of one Session closing.
  }
}

/** Owns one Main-process Agent transport and its Session stream. */
export class AgentRuntime {
  private readonly port: HarnessWebSessionPort
  private readonly driver: HostIpcTransportDriver
  private readonly controller: AgentTurnController
  private readonly unsubscribe: () => void
  private readonly reviewSequences = new Map<string, number>()
  private connected = false

  constructor(
    private readonly host: HostProcess,
    private readonly sessionId: string,
    private readonly origin: string,
    private readonly token: string,
    private readonly emit: (event: AgentTurnEvent) => void,
  ) {
    const api = new HarnessApi(origin, token)
    this.port = new HarnessWebSessionPort({ api, sessionId })
    this.driver = new HostIpcTransportDriver(new ExistingHostConnection(host), this.port, false)
    this.controller = new AgentTurnController(this.driver)
    this.unsubscribe = this.driver.subscribe((event) => {
      if (event.type === 'change-projection' && event.summarySeq !== undefined) {
        this.reviewSequences.set(event.turnId, event.summarySeq)
      }
      this.emit(event)
    })
  }

  get id(): string {
    return this.sessionId
  }

  capabilities(): AgentTransportDescriptor {
    return this.driver.capabilities()
  }

  async connect(): Promise<AgentTransportDescriptor> {
    const descriptor = await this.driver.connect()
    this.connected = true
    return descriptor
  }

  async sendTurn(request: AgentTurnRequest): Promise<{ turnId: string }> {
    if (!this.connected) throw new Error('Agent runtime is not connected')
    const snapshot = await this.controller.start(request)
    return { turnId: snapshot.turnId }
  }

  async cancel(turnId: string): Promise<void> {
    await this.controller.cancel(turnId)
  }

  async resume(turnId: string): Promise<{ turnId: string }> {
    const snapshot = await this.controller.resume(turnId)
    return { turnId: snapshot.turnId }
  }

  async review(turnId: string): Promise<AgentReviewResult> {
    const seq = this.reviewSequences.get(turnId)
    if (seq === undefined) throw new Error(`no workspace change summary is available for turn: ${turnId}`)
    const result = await this.port.review(seq)
    return { turnId, ...result }
  }

  async dispose(): Promise<void> {
    this.connected = false
    this.reviewSequences.clear()
    this.unsubscribe()
    await this.controller.dispose()
  }
}

/** Descriptor used before a workspace has established a native Session. */
export function unavailableAgentTransport(): AgentTransportDescriptor {
  return {
    contractVersion: AGENT_TRANSPORT_CONTRACT_VERSION,
    id: 'managed-iframe',
    status: 'disconnected',
    managed: true,
    capabilities: {
      sendTurn: false,
      cancel: false,
      resume: false,
      subscribe: false,
      contextInjection: 'clipboard-fallback',
      changeProjection: false,
    },
  }
}
