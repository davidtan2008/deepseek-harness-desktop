export const RUNTIME_MANIFEST_SCHEMA_VERSION = 2 as const

export type RuntimeMode = 'source' | 'packaged'

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

export function isRuntimeManifest(value: unknown): value is RuntimeManifest {
  const root = record(value)
  const desktop = record(root?.desktop)
  const harness = record(root?.harness)
  const node = record(root?.node)
  const pnpm = record(root?.pnpm)
  const platform = record(root?.platform)
  const ripgrep = record(root?.ripgrep)
  const inventory = record(root?.inventory)
  const bundled = record(root?.bundled)
  return root?.schemaVersion === RUNTIME_MANIFEST_SCHEMA_VERSION
    && (root.mode === 'source' || root.mode === 'packaged')
    && typeof root.generatedAt === 'string'
    && typeof desktop?.version === 'string'
    && typeof desktop?.gitCommit === 'string'
    && typeof desktop?.dirty === 'boolean'
    && typeof harness?.commit === 'string'
    && typeof harness?.version === 'string'
    && (harness?.packageManager === null || typeof harness?.packageManager === 'string')
    && typeof node?.version === 'string'
    && (pnpm?.version === null || typeof pnpm?.version === 'string')
    && typeof platform?.name === 'string'
    && typeof platform?.arch === 'string'
    && typeof ripgrep?.available === 'boolean'
    && (ripgrep?.version === null || typeof ripgrep?.version === 'string')
    && inventory?.scope === 'desktop-build'
    && typeof inventory?.complete === 'boolean'
    && typeof inventory?.fileCount === 'number'
    && Number.isSafeInteger(inventory.fileCount)
    && inventory.fileCount >= 0
    && (inventory.digest === null || (typeof inventory.digest === 'string' && /^[a-f0-9]{64}$/u.test(inventory.digest)))
    && (inventory.complete ? inventory.fileCount > 0 && inventory.digest !== null : inventory.digest === null)
    && typeof bundled?.harness === 'boolean'
    && typeof bundled?.node === 'boolean'
    && typeof bundled?.pnpm === 'boolean'
    && typeof bundled?.ripgrep === 'boolean'
}

export interface RuntimeInventory {
  scope: 'desktop-build'
  complete: boolean
  fileCount: number
  digest: string | null
}

export interface RuntimeManifest {
  schemaVersion: typeof RUNTIME_MANIFEST_SCHEMA_VERSION
  generatedAt: string
  mode: RuntimeMode
  desktop: {
    version: string
    gitCommit: string
    dirty: boolean
  }
  harness: {
    commit: string
    version: string
    packageManager: string | null
  }
  node: {
    version: string
  }
  pnpm: {
    version: string | null
  }
  platform: {
    name: string
    arch: string
  }
  ripgrep: {
    available: boolean
    version: string | null
  }
  inventory: RuntimeInventory
  bundled: {
    harness: boolean
    node: boolean
    pnpm: boolean
    ripgrep: boolean
  }
}
