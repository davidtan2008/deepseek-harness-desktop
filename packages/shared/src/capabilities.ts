import type { HostState } from './protocol.js'
import type { RuntimeManifest } from './runtime.js'

export const DESKTOP_CONTRACT_VERSION = 1 as const

export type AgentSurface = 'managed-iframe' | 'external-loopback'
export type CapabilityState = 'available' | 'degraded' | 'unavailable'
export type CapabilityId =
  | 'workspace'
  | 'editor'
  | 'terminal'
  | 'git'
  | 'search'
  | 'agent'
  | 'mcp'
  | 'rules'
  | 'inline-edit'
  | 'updates'
  | 'extensions'

export interface CapabilityDescriptor {
  state: CapabilityState
  implementation: string
  detail?: string
}

export interface DesktopCapabilities {
  contractVersion: typeof DESKTOP_CONTRACT_VERSION
  appVersion: string
  runtime: RuntimeManifest | null
  surface: AgentSurface
  host: {
    status: HostState['status']
    managed: boolean
  }
  features: Record<CapabilityId, CapabilityDescriptor>
}

function hostCapabilityState(status: HostState['status']): CapabilityState {
  if (status === 'ready') return 'available'
  if (status === 'starting') return 'degraded'
  return 'unavailable'
}

export function createDesktopCapabilities(input: {
  appVersion: string
  host: HostState
  externalHost: boolean
  packaged: boolean
  runtime?: RuntimeManifest | null
}): DesktopCapabilities {
  const agentState = hostCapabilityState(input.host.status)
  return {
    contractVersion: DESKTOP_CONTRACT_VERSION,
    appVersion: input.appVersion,
    runtime: input.runtime ?? null,
    surface: input.externalHost ? 'external-loopback' : 'managed-iframe',
    host: {
      status: input.host.status,
      managed: !input.externalHost,
    },
    features: {
      workspace: { state: 'available', implementation: 'ipc/project' },
      editor: { state: 'available', implementation: 'monaco' },
      terminal: { state: 'available', implementation: 'pty-with-fallback' },
      git: { state: 'available', implementation: 'git-cli' },
      search: { state: 'available', implementation: 'ripgrep-or-js' },
      agent: {
        state: agentState,
        implementation: input.externalHost ? 'external-loopback' : 'managed-iframe',
        detail: input.host.status === 'error' ? input.host.message : undefined,
      },
      mcp: { state: 'available', implementation: 'harness-patch' },
      rules: { state: 'available', implementation: 'filesystem' },
      'inline-edit': {
        state: 'degraded',
        implementation: 'deepseek-api',
        detail: '直接调用模型 API，尚未进入 Harness Session/审批投影',
      },
      updates: {
        state: 'degraded',
        implementation: 'electron-updater',
        detail: input.packaged ? '打包骨架已接入，发行签名与安装后验证尚未完成' : '开发构建不执行自动更新',
      },
      extensions: {
        state: 'unavailable',
        implementation: 'not-enabled',
        detail: '公共 Desktop 扩展 contract 尚未稳定',
      },
    },
  }
}
