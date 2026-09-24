import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isRuntimeManifest } from '../packages/shared/dist/runtime.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const resourcesIndex = process.argv.indexOf('--resources')
if (resourcesIndex >= 0 && (process.argv[resourcesIndex + 1] === undefined || process.argv[resourcesIndex + 1].startsWith('--'))) {
  throw new Error('--resources requires a directory path')
}
const resourcesRoot = resourcesIndex >= 0 ? resolve(process.argv[resourcesIndex + 1]) : undefined
const manifestPath = resourcesRoot === undefined
  ? resolve(root, 'apps/shell/runtime-manifest.json')
  : join(resourcesRoot, 'runtime-manifest.json')
const closureRoot = resourcesRoot === undefined
  ? resolve(root, 'apps/shell/runtime-closure')
  : join(resourcesRoot, 'runtime')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const blockers = []
const validManifest = isRuntimeManifest(manifest)

function fail(message) {
  blockers.push(message)
}

function inventory(path, logicalPath, entries, inventoryPlatform = process.platform) {
  if (logicalPath === 'closure.json') return
  const stat = lstatSync(path)
  if (stat.isSymbolicLink()) throw new Error(`symlink at ${logicalPath}`)
  if (stat.isFile()) {
    const body = readFileSync(path)
    entries.push({
      path: logicalPath,
      bytes: body.byteLength,
      sha256: createHash('sha256').update(body).digest('hex'),
      executable: inventoryPlatform !== 'win32' && (stat.mode & 0o111) !== 0,
    })
    return
  }
  if (!stat.isDirectory()) throw new Error(`unsupported entry at ${logicalPath}`)
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const childLogicalPath = logicalPath.length === 0 ? entry.name : `${logicalPath}/${entry.name}`
    inventory(join(path, entry.name), childLogicalPath, entries, inventoryPlatform)
  }
}

function safeRelative(path) {
  return typeof path === 'string' && path.length > 0 && !path.startsWith('/') && !path.includes('\\')
    && !path.split('/').some((part) => part === '' || part === '.' || part === '..')
}

function runVersion(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8' }).trim().split(/\r?\n/u)[0]
  } catch (error) {
    fail(`could not execute ${command}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

if (!validManifest) fail('manifest schema is invalid')
if (validManifest && manifest.mode !== 'packaged') fail('manifest mode is not packaged')
if (validManifest && manifest.desktop.dirty) fail('desktop source tree is dirty')
if (validManifest && !manifest.inventory.complete) fail('desktop build inventory is incomplete')
if (validManifest && manifest.inventory.fileCount === 0) fail('desktop build inventory is empty')

if (!validManifest || manifest.closure === null) {
  fail('runtime closure is missing; run pnpm runtime:prepare')
} else {
  const closure = manifest.closure
  if (resourcesRoot === undefined && (closure.platform !== process.platform || closure.arch !== process.arch)) {
    fail(`closure target ${closure.platform}-${closure.arch} does not match build host ${process.platform}-${process.arch}`)
  }
  if (closure.platform !== manifest.platform.name || closure.arch !== manifest.platform.arch) {
    fail(`closure target ${closure.platform}-${closure.arch} does not match manifest ${manifest.platform.name}-${manifest.platform.arch}`)
  }
  if (closure.harness.commit !== manifest.harness.commit || closure.harness.version !== manifest.harness.version) {
    fail('manifest Harness identity does not match the staged closure')
  }
  if (manifest.node.version !== closure.node.version || manifest.pnpm.version !== closure.pnpm.version || manifest.ripgrep.version !== closure.ripgrep.version) {
    fail('manifest runtime versions do not match the staged closure')
  }
  if (!closure.files.every((file) => safeRelative(file.path))) fail('closure contains an unsafe file path')
  for (const dependency of ['harness', 'node', 'pnpm', 'ripgrep']) {
    if (!manifest.bundled[dependency]) fail(`${dependency} is not marked bundled`)
  }
  const expectedFiles = [...closure.files].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
  const actualFiles = []
  try {
    inventory(closureRoot, '', actualFiles, closure.platform)
  } catch (error) {
    fail(`closure inventory failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  actualFiles.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) fail('runtime closure file inventory does not match closure.json')
  for (const path of [closure.harness.entry, closure.harness.packageJson, closure.node.path, closure.pnpm.path, closure.ripgrep.path]) {
    if (!safeRelative(path) || !existsSync(join(closureRoot, path)) || !lstatSync(join(closureRoot, path)).isFile()) fail(`closure file is missing or unsafe: ${path}`)
  }
  const node = join(closureRoot, closure.node.path)
  const pnpm = join(closureRoot, closure.pnpm.path)
  const rg = join(closureRoot, closure.ripgrep.path)
  const dsh = join(closureRoot, closure.harness.entry)
  const nodeActual = existsSync(node) ? runVersion(node, ['-p', 'process.versions.node']) : null
  const pnpmActual = existsSync(node) && existsSync(pnpm) ? runVersion(node, [pnpm, '--pm-on-fail=ignore', '--version']) : null
  const rgActual = existsSync(rg) ? runVersion(rg, ['--version']) : null
  const dshActual = existsSync(node) && existsSync(dsh) ? runVersion(node, [dsh, '--version']) : null
  if (nodeActual !== closure.node.version) fail(`bundled Node version mismatch: ${String(nodeActual)}`)
  if (pnpmActual !== closure.pnpm.version) fail(`bundled pnpm version mismatch: ${String(pnpmActual)}`)
  if (rgActual !== closure.ripgrep.version) fail(`bundled ripgrep version mismatch: ${String(rgActual)}`)
  if (dshActual === null || !dshActual.includes(closure.harness.version)) fail(`bundled dsh version mismatch: ${String(dshActual)}`)
  const harnessPackagePath = join(closureRoot, closure.harness.packageJson)
  if (existsSync(harnessPackagePath)) {
    try {
      const harnessPackage = JSON.parse(readFileSync(harnessPackagePath, 'utf8'))
      if (harnessPackage.version !== closure.harness.version) fail('bundled dsh package version mismatch')
    } catch (error) {
      fail(`bundled dsh package metadata is invalid: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

if (blockers.length > 0) {
  console.error('Release runtime gate failed:')
  for (const blocker of blockers) console.error(`- ${blocker}`)
  process.exit(1)
}
console.log('Release runtime gate passed.')
