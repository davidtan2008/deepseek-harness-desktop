export const RUNTIME_MANIFEST_SCHEMA_VERSION = 3 as const

export type RuntimeMode = 'source' | 'packaged'

export interface RuntimeClosureFile {
  path: string
  bytes: number
  sha256: string
  executable: boolean
}

export interface RuntimeClosure {
  schemaVersion: 1
  platform: string
  arch: string
  harness: {
    root: string
    entry: string
    packageJson: string
    version: string
    commit: string
    packageManager: string | null
  }
  node: {
    path: string
    version: string
  }
  pnpm: {
    path: string
    version: string
  }
  ripgrep: {
    path: string
    version: string
  }
  files: RuntimeClosureFile[]
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function validRelativePath(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && !value.startsWith('/')
    && !value.includes('\\')
    && !value.split('/').some((part) => part === '' || part === '.' || part === '..')
}

function validClosureFile(value: unknown): value is RuntimeClosureFile {
  const file = record(value)
  return file !== undefined
    && validRelativePath(file.path)
    && typeof file.bytes === 'number'
    && Number.isSafeInteger(file.bytes)
    && file.bytes >= 0
    && typeof file.sha256 === 'string'
    && /^[a-f0-9]{64}$/u.test(file.sha256)
    && typeof file.executable === 'boolean'
}

function validClosure(value: unknown): value is RuntimeClosure {
  const closure = record(value)
  const files = Array.isArray(closure?.files) ? closure.files : []
  const filePaths = new Set<string>()
  for (const file of files) {
    if (!validClosureFile(file) || filePaths.has(file.path)) return false
    filePaths.add(file.path)
  }
  const harnessValue = record(closure?.harness)
  const nodeValue = record(closure?.node)
  const pnpmValue = record(closure?.pnpm)
  const ripgrepValue = record(closure?.ripgrep)
  if (harnessValue === undefined || nodeValue === undefined || pnpmValue === undefined || ripgrepValue === undefined) return false
  if (![harnessValue.entry, harnessValue.packageJson, nodeValue.path, pnpmValue.path, ripgrepValue.path].every((path) => validRelativePath(path) && filePaths.has(path))) return false
  const harness = harnessValue
  const node = nodeValue
  const pnpm = pnpmValue
  const ripgrep = ripgrepValue
  return closure?.schemaVersion === 1
    && typeof closure.platform === 'string'
    && typeof closure.arch === 'string'
    && harness !== undefined
    && typeof harness.root === 'string'
    && typeof harness.entry === 'string'
    && typeof harness.packageJson === 'string'
    && typeof harness.version === 'string'
    && typeof harness.commit === 'string'
    && (harness.packageManager === null || typeof harness.packageManager === 'string')
    && node !== undefined
    && typeof node.path === 'string'
    && typeof node.version === 'string'
    && pnpm !== undefined
    && typeof pnpm.path === 'string'
    && typeof pnpm.version === 'string'
    && ripgrep !== undefined
    && typeof ripgrep.path === 'string'
    && typeof ripgrep.version === 'string'
    && Array.isArray(closure.files)
    && closure.files.every(validClosureFile)
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
    && (root.closure === null || validClosure(root.closure))
}

export interface RuntimeInventory {
  scope: 'desktop-build'
  complete: boolean
  fileCount: number
  digest: string | null
}

export interface RuntimeClosureSummary {
  schemaVersion: 1
  platform: string
  arch: string
  harness: RuntimeClosure['harness']
  node: RuntimeClosure['node']
  pnpm: RuntimeClosure['pnpm']
  ripgrep: RuntimeClosure['ripgrep']
  fileCount: number
}

export type RuntimeManifestSummary = Omit<RuntimeManifest, 'closure'> & {
  closure: RuntimeClosureSummary | null
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
  closure: RuntimeClosure | null
}
