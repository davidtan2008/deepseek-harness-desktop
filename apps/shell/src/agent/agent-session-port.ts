import type {
  AgentTransportCapabilities,
  AgentTurnEvent,
  AgentTurnRequest,
} from '@dhd/shared'

/** Session-facing operations used by the Host IPC transport adapter. */
export interface AgentSessionPort {
  readonly capabilities: Pick<AgentTransportCapabilities, 'sendTurn' | 'cancel' | 'resume' | 'subscribe' | 'contextInjection' | 'changeProjection'>
  connect?(): Promise<void>
  sendTurn(request: AgentTurnRequest): Promise<{ turnId: string }>
  cancel(turnId: string): Promise<void>
  resume(turnId: string): Promise<{ turnId: string }>
  subscribe(listener: (event: AgentTurnEvent) => void): () => void
  dispose(): Promise<void>
}
