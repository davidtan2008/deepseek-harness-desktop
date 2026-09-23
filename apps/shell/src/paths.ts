import { app } from 'electron'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function shellRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..')
}

export function userDataDir(): string {
  return app.getPath('userData')
}

export function settingsPath(): string {
  return join(userDataDir(), 'settings.json')
}

export function mcpConfigPath(): string {
  return join(userDataDir(), 'mcp.yaml')
}

export function resolveDshHome(): string {
  const override = process.env.DSH_HOME?.trim()
  if (override) return resolve(override)
  return join(homedir(), '.dsh')
}

export function credentialsFilePath(): string {
  return join(resolveDshHome(), '.credentials.yaml')
}

export function desktopPatchPath(): string {
  const packaged = join(process.resourcesPath, 'desktop-profile', 'cordis.patch.yml')
  if (app.isPackaged && existsSync(packaged)) return packaged
  return resolve(shellRoot(), '../../packages/desktop-profile/cordis.patch.yml')
}

export function workbenchIndexPath(): string {
  if (!app.isPackaged) {
    return join(shellRoot(), '../workbench/dist/index.html')
  }
  return join(process.resourcesPath, 'workbench', 'index.html')
}

export function repoRoot(): string {
  return resolve(shellRoot(), '../../..')
}

export function harnessRoot(): string | undefined {
  const env = process.env.DHD_HARNESS_ROOT?.trim()
  if (env && existsSync(env)) return resolve(env)
  const sibling = join(repoRoot(), 'deepseek', 'deepseek-harness')
  if (existsSync(join(sibling, 'apps', 'cli', 'src', 'bin.ts'))) return sibling
  const packaged = join(process.resourcesPath, 'harness')
  if (existsSync(packaged)) return packaged
  return undefined
}
