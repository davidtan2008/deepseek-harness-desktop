import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mode = process.argv[2] === 'packaged' ? 'packaged' : 'source'
const output = join(root, 'apps/shell/runtime-manifest.json')
const closurePath = join(root, 'apps/shell/runtime-closure/closure.json')

function command(commandName, args) {
  const result = spawnSync(commandName, args, { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : null
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

function packageJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return {}
  }
}

function record(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined
}

function readClosure() {
  if (mode !== 'packaged' || !existsSync(closurePath)) return null
  let value
  try {
    value = JSON.parse(readFileSync(closurePath, 'utf8'))
  } catch (error) {
    throw new Error(`runtime closure descriptor is invalid: ${String(error)}`)
  }
  const closure = record(value)
  const harness = record(closure?.harness)
  const node = record(closure?.node)
  const pnpm = record(closure?.pnpm)
  const ripgrep = record(closure?.ripgrep)
  if (closure?.schemaVersion !== 1 || typeof closure.platform !== 'string' || typeof closure.arch !== 'string'
    || !Array.isArray(closure.files) || closure.files.length === 0
    || harness === undefined || typeof harness.version !== 'string' || typeof harness.commit !== 'string'
    || node === undefined || typeof node.version !== 'string'
    || pnpm === undefined || typeof pnpm.version !== 'string'
    || ripgrep === undefined || typeof ripgrep.version !== 'string') {
    throw new Error('runtime closure descriptor is incomplete')
  }
  return value
}

function collectInventory(path, logicalPath, entries) {
  if (!existsSync(path)) return false
  const stat = lstatSync(path)
  if (stat.isSymbolicLink()) return false
  if (stat.isFile()) {
    const body = readFileSync(path)
    entries.push({
      path: logicalPath,
      bytes: body.byteLength,
      sha256: createHash('sha256').update(body).digest('hex'),
    })
    return true
  }
  if (!stat.isDirectory()) return false
  let complete = true
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    complete = collectInventory(join(path, entry.name), `${logicalPath}/${entry.name}`, entries) && complete
  }
  return complete
}

function desktopBuildInventory() {
  const entries = []
  let complete = true
  for (const [path, logicalPath] of [
    [join(root, 'apps/shell/dist'), 'shell'],
    [join(root, 'apps/workbench/dist'), 'workbench'],
    [join(root, 'packages/desktop-profile/cordis.patch.yml'), 'desktop-profile/cordis.patch.yml'],
  ]) {
    complete = collectInventory(path, logicalPath, entries) && complete
  }
  entries.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
  const digest = complete && entries.length > 0
    ? createHash('sha256').update(entries.map((entry) => `${entry.path}\0${entry.bytes}\0${entry.sha256}`).join('\n')).digest('hex')
    : null
  return { scope: 'desktop-build', complete, fileCount: entries.length, digest }
}

const desktopPackage = packageJson(join(root, 'package.json'))
const harnessPackage = packageJson(join(root, 'harness/package.json'))
const closure = readClosure()
const bundled = closure === null
  ? { harness: false, node: false, pnpm: false, ripgrep: false }
  : { harness: true, node: true, pnpm: true, ripgrep: true }
const sourceNodeVersion = process.version
const sourcePnpmVersion = command('pnpm', ['--version'])
const sourceRgVersion = command(process.env.RIPGREP_PATH || 'rg', ['--version'])?.split(/\r?\n/u)[0] || null
const harnessCommit = closure?.harness?.commit ?? git(['-C', 'harness', 'rev-parse', 'HEAD']) ?? 'unavailable'
const harnessVersion = closure?.harness?.version ?? harnessPackage.version ?? 'unavailable'
const packageManager = closure?.harness?.packageManager ?? harnessPackage.packageManager ?? null
const platformName = closure?.platform ?? process.platform
const platformArch = closure?.arch ?? process.arch
const nodeVersion = closure?.node?.version ?? sourceNodeVersion
const pnpmVersion = closure?.pnpm?.version ?? sourcePnpmVersion
const ripgrepVersion = closure?.ripgrep?.version ?? sourceRgVersion

const manifest = {
  schemaVersion: 3,
  generatedAt: new Date().toISOString(),
  mode,
  desktop: {
    version: desktopPackage.version ?? '0.0.0',
    gitCommit: git(['rev-parse', 'HEAD']) ?? 'unknown',
    dirty: Boolean(git(['status', '--short'])),
  },
  harness: {
    commit: harnessCommit,
    version: harnessVersion,
    packageManager,
  },
  node: {
    version: nodeVersion,
  },
  pnpm: {
    version: pnpmVersion,
  },
  platform: {
    name: platformName,
    arch: platformArch,
  },
  ripgrep: {
    available: ripgrepVersion !== null,
    version: ripgrepVersion,
  },
  inventory: desktopBuildInventory(),
  bundled,
  closure,
}

mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`runtime manifest (${mode}) -> ${output}`)
