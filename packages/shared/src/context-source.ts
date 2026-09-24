import type { AgentContextItem } from './agent-transport.js'

export interface ContextBundle {
  items: AgentContextItem[]
  canonical: string
  byteLength: number
}

export class ContextBundleError extends Error {
  readonly code: 'INVALID_CONTEXT' | 'CONTEXT_TOO_LARGE'

  constructor(code: ContextBundleError['code'], message: string) {
    super(message)
    this.name = 'ContextBundleError'
    this.code = code
  }
}

const DEFAULT_MAX_BYTES = 128 * 1024

function safePath(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && !path.includes('\\') && !path.split('/').includes('..')
}

function render(item: AgentContextItem): string {
  const label = item.path === undefined ? item.kind : `${item.kind}:${item.path}`
  return `[${label}]\n${item.text ?? ''}\n`
}

/** Build a bounded, deterministic context payload before it can reach a model. */
export function buildContextBundle(items: readonly AgentContextItem[], maxBytes = DEFAULT_MAX_BYTES): ContextBundle {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new ContextBundleError('INVALID_CONTEXT', 'context maxBytes must be positive')
  const normalized = items.map((item) => {
    if (item.path !== undefined && !safePath(item.path)) throw new ContextBundleError('INVALID_CONTEXT', `unsafe context path: ${item.path}`)
    if (item.text !== undefined && typeof item.text !== 'string') throw new ContextBundleError('INVALID_CONTEXT', 'context text must be a string')
    return { ...item }
  })
  const canonical = normalized.map(render).join('\n')
  const byteLength = new TextEncoder().encode(canonical).byteLength
  if (byteLength > maxBytes) throw new ContextBundleError('CONTEXT_TOO_LARGE', `context exceeds ${maxBytes} bytes`)
  return { items: normalized, canonical, byteLength }
}
