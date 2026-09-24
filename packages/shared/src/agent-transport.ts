export const AGENT_TRANSPORT_CONTRACT_VERSION = 1 as const

export type AgentTransportId = 'managed-iframe' | 'external-loopback' | 'host-ipc' | 'acp' | 'cli'
export type AgentTransportStatus = 'disconnected' | 'connecting' | 'ready' | 'degraded' | 'unsupported' | 'error'
export type AgentContextKind = 'file' | 'selection' | 'open-tabs' | 'git-diff' | 'problems'
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export type AgentTurnStatus = 'idle' | 'starting' | 'running' | 'awaiting-approval' | 'cancelling' | 'completed' | 'cancelled' | 'failed'

export interface AgentTransportCapabilities {
  sendTurn: boolean
  cancel: boolean
  resume: boolean
  subscribe: boolean
  contextInjection: 'none' | 'clipboard-fallback' | 'structured'
  changeProjection: boolean
}

export interface AgentTransportDescriptor {
  contractVersion: typeof AGENT_TRANSPORT_CONTRACT_VERSION
  id: AgentTransportId
  status: AgentTransportStatus
  managed: boolean
  capabilities: AgentTransportCapabilities
}

export interface AgentContextItem {
  kind: AgentContextKind
  path?: string
  text?: string
}

export interface AgentTurnRequest {
  turnId: string
  text: string
  context: AgentContextItem[]
}

export type AgentTurnEvent =
  | { type: 'turn-started'; turnId: string }
  | { type: 'tool-call'; turnId: string; tool: string; input?: JsonValue }
  | { type: 'approval-required'; turnId: string; approvalId: string }
  | { type: 'turn-completed'; turnId: string }
  | { type: 'turn-failed'; turnId: string; message: string }
  | { type: 'turn-cancelled'; turnId: string }
  | { type: 'change-projection'; turnId: string; changedPaths: string[] }

/** Main-process owner for one Agent transport generation. */
export interface AgentTransportDriver {
  capabilities(): AgentTransportDescriptor
  connect(): Promise<AgentTransportDescriptor>
  sendTurn(request: AgentTurnRequest): Promise<{ turnId: string }>
  cancel(turnId: string): Promise<void>
  resume(turnId: string): Promise<{ turnId: string }>
  subscribe(listener: (event: AgentTurnEvent) => void): () => void
  dispose(): Promise<void>
}
