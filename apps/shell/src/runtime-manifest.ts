import { app } from 'electron'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isRuntimeManifest, type RuntimeManifest } from '@dhd/shared'
import { shellRoot } from './paths.ts'

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

function harnessIdentity(root: string): { commit: string | null; version: string | null } {
  let commit: string | null = null
  try {
    commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
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
