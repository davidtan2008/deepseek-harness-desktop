import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mode = process.argv[2] === 'packaged' ? 'packaged' : 'source'
const output = join(root, 'apps/shell/runtime-manifest.json')

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
const pnpmVersion = command('pnpm', ['--version'])
const rgVersion = command(process.env.RIPGREP_PATH || 'rg', ['--version'])?.split('\n')[0] || null
// Do not let environment variables claim that a dependency is bundled. The
// release gate must only be enabled by a real packaging implementation.
const bundled = { harness: false, node: false, pnpm: false, ripgrep: false }

const manifest = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  mode,
  desktop: {
    version: desktopPackage.version ?? '0.0.0',
    gitCommit: git(['rev-parse', 'HEAD']) ?? 'unknown',
    dirty: Boolean(git(['status', '--short'])),
  },
  harness: {
    commit: git(['-C', 'harness', 'rev-parse', 'HEAD']) ?? 'unavailable',
    version: harnessPackage.version ?? 'unavailable',
    packageManager: harnessPackage.packageManager ?? null,
  },
  node: {
    version: process.version,
  },
  pnpm: {
    version: pnpmVersion,
  },
  platform: {
    name: process.platform,
    arch: process.arch,
  },
  ripgrep: {
    available: Boolean(rgVersion),
    version: rgVersion,
  },
  inventory: desktopBuildInventory(),
  bundled,
}

mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`runtime manifest (${mode}) -> ${output}`)
