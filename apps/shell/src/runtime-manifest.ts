import { app } from 'electron'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isRuntimeManifest, type RuntimeManifest } from '@dhd/shared'
import { shellRoot } from './paths.ts'

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

function harnessIdentity(root: string): { commit: string | null; version: string | null } {
  let commit: string | null = null
  try {
    const topLevel = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
    if (resolve(realpathSync(topLevel)) === resolve(realpathSync(root))) {
      commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    }
  } catch {
    // A packaged runtime may not contain a .git directory; version is then authoritative.
  }
  try {
    const value: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const pkg = record(value)
    return { commit, version: typeof pkg?.version === 'string' ? pkg.version : null }
  } catch {
    return { commit, version: null }
  }
}

function runtimeResource(relativePath: string): string {
  if (relativePath.length === 0 || relativePath.startsWith('/') || relativePath.includes('\\') || relativePath.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`invalid packaged runtime path: ${relativePath}`)
  }
  return join(process.resourcesPath, 'runtime', ...relativePath.split('/'))
}

export function packagedRuntimeMismatch(manifest: RuntimeManifest): string | undefined {
  if (!app.isPackaged || manifest.mode !== 'packaged') return undefined
  const closure = manifest.closure
  if (closure === null) return 'Packaged runtime closure descriptor is missing'
  if (closure.platform !== process.platform || closure.arch !== process.arch) {
    return `Packaged runtime target ${closure.platform}-${closure.arch} does not match ${process.platform}-${process.arch}`
  }
  try {
    const paths = [closure.harness.entry, closure.harness.packageJson, closure.node.path, closure.pnpm.path, closure.ripgrep.path]
    for (const path of paths) {
      const absolute = runtimeResource(path)
      if (!existsSync(absolute)) return `Packaged runtime file is missing: ${path}`
    }
    const harnessPackage: unknown = JSON.parse(readFileSync(runtimeResource(closure.harness.packageJson), 'utf8'))
    const packageRecord = record(harnessPackage)
    if (packageRecord?.version !== closure.harness.version) return 'Packaged Harness version does not match the runtime descriptor'
    const nodeVersion = execFileSync(runtimeResource(closure.node.path), ['-p', 'process.versions.node'], { encoding: 'utf8' }).trim()
    if (nodeVersion !== closure.node.version) return `Packaged Node version mismatch: ${nodeVersion}`
    const pnpmVersion = execFileSync(runtimeResource(closure.node.path), [runtimeResource(closure.pnpm.path), '--pm-on-fail=ignore', '--version'], { encoding: 'utf8' }).trim().split(/\r?\n/u)[0]
    if (pnpmVersion !== closure.pnpm.version) return `Packaged pnpm version mismatch: ${pnpmVersion}`
    const ripgrepVersion = execFileSync(runtimeResource(closure.ripgrep.path), ['--version'], { encoding: 'utf8' }).trim().split(/\r?\n/u)[0]
    if (ripgrepVersion !== closure.ripgrep.version) return `Packaged ripgrep version mismatch: ${ripgrepVersion}`
  } catch (error) {
    return `Packaged runtime validation failed: ${error instanceof Error ? error.message : String(error)}`
  }
  return undefined
}

export function harnessRuntimeMismatch(manifest: RuntimeManifest, root: string): string | undefined {
  const actual = harnessIdentity(root)
  if (actual.version === null) return 'Harness package metadata is missing'
  if (actual.version !== manifest.harness.version) {
    return `Harness version mismatch: manifest ${manifest.harness.version}, actual ${actual.version}`
  }
  if (actual.commit !== null && actual.commit !== manifest.harness.commit) {
    return `Harness commit mismatch: manifest ${manifest.harness.commit}, actual ${actual.commit}`
  }
  return undefined
}

export function loadRuntimeManifest(): RuntimeManifest | null {
  const path = app.isPackaged
    ? join(process.resourcesPath, 'runtime-manifest.json')
    : join(shellRoot(), 'runtime-manifest.json')
  if (!existsSync(path)) return null
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!isRuntimeManifest(value)) {
      console.warn('[runtime] invalid manifest')
      return null
    }
    return value
  } catch (error) {
    console.warn('[runtime] could not read manifest:', error)
    return null
  }
}
