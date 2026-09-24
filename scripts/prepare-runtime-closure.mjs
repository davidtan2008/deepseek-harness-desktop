import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const harness = resolve(process.env.DHD_HARNESS_ROOT ?? join(root, 'harness'))
const output = resolve(process.env.DHD_RUNTIME_CLOSURE ?? join(root, 'apps/shell/runtime-closure'))
const platform = process.env.DHD_RUNTIME_PLATFORM ?? process.platform
const arch = process.env.DHD_RUNTIME_ARCH ?? process.arch
const target = `${platform}-${arch}`
const upstreamTarget = `${platform === 'darwin' ? 'mac' : platform === 'win32' ? 'win' : platform}-${arch}`

function option(name) {
  const prefix = `--${name}=`
  const inline = process.argv.find((value) => value.startsWith(prefix))
  if (inline !== undefined) return inline.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function requiredFile(path, label) {
  if (path === undefined || !existsSync(path) || !lstatSync(path).isFile()) {
    throw new Error(`${label} is missing: ${path ?? '<unset>'}`)
  }
  return path
}

function version(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim()
}

function firstLine(value) {
  return value.split(/\r?\n/u)[0]?.trim() ?? ''
}

function packageJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function findNode() {
  const explicit = option('node') ?? process.env.DHD_NODE_BIN
  const candidates = [
    explicit,
    join(harness, 'apps/desktop/.desktop-build/targets', upstreamTarget, 'runtime/primary-runtime/dependencies/node/bin', platform === 'win32' ? 'node.exe' : 'node'),
    process.execPath,
  ].filter((value) => value !== undefined)
  for (const candidate of candidates) {
    if (!existsSync(candidate) || !lstatSync(candidate).isFile()) continue
    try {
      const actual = version(candidate, ['-p', 'process.versions.node'])
      if (/^v?\d+\.\d+\.\d+/u.test(actual)) return { path: resolve(candidate), version: actual }
    } catch {
      // Try the next target-specific runtime candidate.
    }
  }
  throw new Error(`no usable Node binary for ${target}; pass --node or set DHD_NODE_BIN`)
}

function findPnpm() {
  const explicit = option('pnpm') ?? process.env.DHD_PNPM_DIR
  const harnessPackage = packageJson(join(harness, 'package.json'))
  const expectedVersion = typeof harnessPackage.packageManager === 'string'
    ? harnessPackage.packageManager.match(/^pnpm@(.+)$/u)?.[1]
    : undefined
  const candidates = []
  if (explicit !== undefined) candidates.push(explicit)
  const packageRoot = join(harness, 'node_modules/.pnpm')
  if (existsSync(packageRoot)) {
    for (const entry of readdirSync(packageRoot).sort()) {
      if (/^pnpm@/u.test(entry)) candidates.push(join(packageRoot, entry, 'node_modules/pnpm'))
    }
  }
  candidates.push(join(harness, 'apps/desktop/node_modules/pnpm'))
  for (const candidate of candidates) {
    const path = resolve(candidate)
    const manifestPath = join(path, 'package.json')
    const entry = join(path, 'bin/pnpm.mjs')
    if (!existsSync(manifestPath) || !existsSync(entry)) continue
    const manifest = packageJson(manifestPath)
    if (typeof manifest.version !== 'string') continue
    if (expectedVersion !== undefined && manifest.version !== expectedVersion) continue
    return { path, entry, version: manifest.version }
  }
  throw new Error('no pnpm package found in the Harness checkout; pass --pnpm or set DHD_PNPM_DIR')
}

function findRipgrep() {
  const explicit = option('rg') ?? process.env.RIPGREP_PATH
  const packageName = `@vscode/ripgrep-${platform}-${arch}`
  const packageRoot = join(harness, 'node_modules/.pnpm')
  const candidates = [explicit]
  if (existsSync(packageRoot)) {
    for (const entry of readdirSync(packageRoot).sort()) {
      if (entry.startsWith(`@vscode+ripgrep-${platform}-${arch}@`)) {
        candidates.push(join(packageRoot, entry, 'node_modules', packageName, 'bin', platform === 'win32' ? 'rg.exe' : 'rg'))
      }
    }
  }
  const pathValue = process.env.PATH ?? ''
  const pathCandidates = pathValue.split(platform === 'win32' ? ';' : ':').map((directory) => join(directory, platform === 'win32' ? 'rg.exe' : 'rg'))
  candidates.push(...pathCandidates)
  for (const candidate of candidates) {
    if (candidate === undefined) continue
    const path = resolve(candidate)
    if (!existsSync(path) || !lstatSync(path).isFile()) continue
    try {
      const actual = version(path, ['--version']).split(/\r?\n/u)[0]
      if (actual.length > 0) return { path, version: actual }
    } catch {
      // Try the next target-specific binary.
    }
  }
  throw new Error(`no usable ripgrep binary for ${target}; pass --rg or set RIPGREP_PATH`)
}

function copyFile(source, destination, executable = false) {
  mkdirSync(dirname(destination), { recursive: true })
  cpSync(source, destination, { recursive: false, dereference: true })
  if (executable && platform !== 'win32') chmodSync(destination, 0o755)
}

function walkFiles(path, logicalPath, entries) {
  const stat = lstatSync(path)
  if (stat.isSymbolicLink()) throw new Error(`runtime closure contains a symlink: ${logicalPath}`)
  if (stat.isFile()) {
    if (logicalPath === '.gitkeep' || logicalPath.endsWith('/.gitkeep')) return
    const body = readFileSync(path)
    entries.push({
      path: logicalPath,
      bytes: body.byteLength,
      sha256: createHash('sha256').update(body).digest('hex'),
      executable: platform !== 'win32' && (stat.mode & 0o111) !== 0,
    })
    return
  }
  if (!stat.isDirectory()) throw new Error(`runtime closure contains an unsupported entry: ${logicalPath}`)
  for (const entry of readdirSync(path, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const childLogicalPath = logicalPath.length === 0 ? entry.name : `${logicalPath}/${entry.name}`
    walkFiles(join(path, entry.name), childLogicalPath, entries)
  }
}

function materializeTree(source, destination, active = new Set(), skipNodeModules = false) {
  const stat = lstatSync(source)
  if (stat.isSymbolicLink()) {
    const target = realpathSync(source)
    if (active.has(target)) throw new Error(`runtime closure symlink cycle: ${source}`)
    const workspaceTarget = target === harness || target.startsWith(`${harness}${sep}`)
    return materializeTree(target, destination, active, skipNodeModules || workspaceTarget)
  }
  if (stat.isDirectory()) {
    const real = realpathSync(source)
    if (active.has(real)) throw new Error(`runtime closure directory cycle: ${source}`)
    active.add(real)
    mkdirSync(destination, { recursive: true })
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      if (skipNodeModules && entry.name === 'node_modules') continue
      materializeTree(join(source, entry.name), join(destination, entry.name), active, skipNodeModules)
    }
    active.delete(real)
    return
  }
  if (!stat.isFile()) throw new Error(`runtime closure contains an unsupported entry: ${source}`)
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(source, destination)
  if (platform !== 'win32' && (stat.mode & 0o111) !== 0) chmodSync(destination, 0o755)
}

// pnpm deploy intentionally omits workspace peer packages; the pinned Harness
// vendor packages are part of the runtime and must be materialized beside dsh.
const vendorRuntimeDirectories = ['cordis', 'cosmokit', 'group', 'hmr', 'include', 'loader', 'logger-console', 'schemastery', 'timer']

function collectPackageDirectories(directory, depth = 0, result = []) {
  if (depth > 3 || !existsSync(directory)) return result
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'lib' || entry.name.startsWith('.')) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) collectPackageDirectories(path, depth + 1, result)
    else if (entry.name === 'package.json') {
      const manifest = packageJson(path)
      if (typeof manifest.name === 'string') result.push({ path: dirname(path), manifest })
    }
  }
  return result
}

// The CLI package declares many first-party peers; pnpm deploy does not copy
// those workspace peers, so materialize the pinned built package set beside it.
function includeWorkspaceRuntimePackages(dshRoot) {
  const roots = [join(harness, 'packages'), join(harness, 'native/system/packages')]
  const packages = roots.flatMap((root) => collectPackageDirectories(root))
  const nativeTarget = `${platform === 'win32' ? 'win' : platform}-${arch}`
  for (const { path: source, manifest } of packages) {
    const hasBuiltOutput = existsSync(join(source, 'lib'))
    const targetNativePackage = manifest.name.endsWith(`-${nativeTarget}`)
    if (!hasBuiltOutput && !targetNativePackage) continue
    const destination = join(dshRoot, 'node_modules', ...manifest.name.split('/'))
    const destinationHasBuild = existsSync(join(destination, 'lib'))
    if (!existsSync(join(destination, 'package.json')) || (hasBuiltOutput && !destinationHasBuild)) {
      materializeTree(source, destination, new Set(), true)
    }
  }
}

function includeVendorRuntimePackages(dshRoot) {
  for (const directory of vendorRuntimeDirectories) {
    const source = join(harness, 'vendor', directory)
    const manifest = packageJson(join(source, 'package.json'))
    if (typeof manifest.name !== 'string') throw new Error(`vendor runtime package has no name: ${source}`)
    const destination = join(dshRoot, 'node_modules', ...manifest.name.split('/'))
    const sourceHasBuild = existsSync(join(source, 'lib'))
    const destinationHasBuild = existsSync(join(destination, 'lib'))
    if (!existsSync(join(destination, 'package.json')) || (sourceHasBuild && !destinationHasBuild)) {
      materializeTree(source, destination, new Set(), true)
    }
  }
}

function deployDsh() {
  if (platform !== process.platform || arch !== process.arch) {
    throw new Error(`cross-target closure is not supported: build host is ${process.platform}-${process.arch}, target is ${target}`)
  }
  const deployParent = mkdtempSync(join(tmpdir(), 'dhd-runtime-deploy-'))
  const deployRoot = join(deployParent, 'dsh')
  const dshRoot = join(output, 'dsh')
  mkdirSync(output, { recursive: true })
  try {
    execFileSync('pnpm', [
      '--config.manage-package-manager-versions=false',
      '--dir', harness,
      '--config.node-linker=hoisted',
      '--config.allow-unused-patches=true',
      '--filter', '@deepseek-ai/dsh',
      'deploy', '--prod', '--legacy', deployRoot,
    ], { stdio: 'inherit' })
    materializeTree(deployRoot, dshRoot)
    includeWorkspaceRuntimePackages(dshRoot)
    includeVendorRuntimePackages(dshRoot)
  } catch (error) {
    rmSync(deployParent, { recursive: true, force: true })
    throw error
  }
  rmSync(deployParent, { recursive: true, force: true })
  const manifest = packageJson(join(dshRoot, 'package.json'))
  const entry = join(dshRoot, 'lib/bin.js')
  requiredFile(entry, 'deployed dsh entry')
  if (manifest.name !== '@deepseek-ai/dsh' || typeof manifest.version !== 'string') {
    throw new Error('deployed dsh package metadata is invalid')
  }
  return { root: 'dsh', entry: 'dsh/lib/bin.js', version: manifest.version, packageJson: 'dsh/package.json' }
}

const main = () => {
  rmSync(output, { recursive: true, force: true })
  mkdirSync(output, { recursive: true })
  const harnessStatus = execFileSync('git', ['-C', harness, 'status', '--short'], { encoding: 'utf8' }).trim()
  if (harnessStatus.length > 0) throw new Error('Harness working tree is dirty; runtime closure requires a clean pinned checkout')
  const node = findNode()
  const pnpm = findPnpm()
  const ripgrep = findRipgrep()
  const harnessInfo = deployDsh()
  const nodeName = platform === 'win32' ? 'node.exe' : 'node'
  const rgName = platform === 'win32' ? 'rg.exe' : 'rg'
  copyFile(node.path, join(output, 'bin', nodeName), true)
  materializeTree(pnpm.path, join(output, 'pnpm'))
  const bundledPnpmVersion = firstLine(version(node.path, [join(output, 'pnpm/bin/pnpm.mjs'), '--pm-on-fail=ignore', '--version']))
  if (bundledPnpmVersion !== pnpm.version) throw new Error(`bundled pnpm version mismatch: ${bundledPnpmVersion}`)
  const bundledDshVersion = firstLine(version(node.path, [join(output, harnessInfo.entry), '--version']))
  if (!bundledDshVersion.includes(harnessInfo.version)) throw new Error(`bundled dsh version mismatch: ${bundledDshVersion}`)
  copyFile(ripgrep.path, join(output, 'ripgrep', rgName), true)
  const harnessCommit = execFileSync('git', ['-C', harness, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const harnessPackage = packageJson(join(harness, 'package.json'))
  const files = []
  walkFiles(output, '', files)
  files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
  const descriptor = {
    schemaVersion: 1,
    platform,
    arch,
    harness: { ...harnessInfo, commit: harnessCommit, packageManager: harnessPackage.packageManager ?? null },
    node: { path: `bin/${nodeName}`, version: node.version },
    pnpm: { path: 'pnpm/bin/pnpm.mjs', version: pnpm.version },
    ripgrep: { path: `ripgrep/${rgName}`, version: ripgrep.version },
    files,
  }
  writeFileSync(join(output, 'closure.json'), `${JSON.stringify(descriptor, null, 2)}\n`, 'utf8')
  console.log(`runtime closure (${target}) -> ${output}`)
  console.log(`  dsh ${harnessInfo.version}; node ${node.version}; pnpm ${pnpm.version}; ${ripgrep.version}`)
  console.log(`  ${files.length} files`)
}

try {
  main()
} catch (error) {
  rmSync(output, { recursive: true, force: true })
  throw error
}
