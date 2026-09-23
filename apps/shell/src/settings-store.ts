import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DEFAULT_SETTINGS, type AppSettings } from '@dhd/shared'
import { settingsPath } from './paths.ts'

function mergeSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS, window: { ...DEFAULT_SETTINGS.window } }
  const parsed = raw as Partial<AppSettings>
  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    recentProjects: Array.isArray(parsed.recentProjects) ? parsed.recentProjects.filter((p) => typeof p === 'string') : [],
    window: { ...DEFAULT_SETTINGS.window, ...(parsed.window ?? {}) },
  }
}

export function loadSettings(): AppSettings {
  try {
    return mergeSettings(JSON.parse(readFileSync(settingsPath(), 'utf8')))
  } catch {
    return mergeSettings(undefined)
  }
}

export function saveSettings(settings: AppSettings): void {
  const file = settingsPath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
}

export function rememberProject(settings: AppSettings, projectPath: string): AppSettings {
  const recent = [projectPath, ...settings.recentProjects.filter((p) => p !== projectPath)].slice(0, 12)
  const next = { ...settings, recentProjects: recent }
  saveSettings(next)
  return next
}
