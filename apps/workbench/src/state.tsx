import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  DEFAULT_SETTINGS,
  languageFromPath,
  type ActivityId,
  type AppSettings,
  type HostState,
  type PanelId,
} from '@dhd/shared'
import { basename, dhd } from './lib'

export interface EditorTab {
  path: string
  text: string
  original: string
  language: string
  dirty: boolean
  binary: boolean
}

interface AppModel {
  ready: boolean
  settings: AppSettings
  projectPath?: string
  host: HostState
  platform: string
  hasKey: boolean
  activity: ActivityId
  panel: PanelId
  tabs: EditorTab[]
  activePath?: string
  selection: { path: string; text: string; start: number; end: number } | null
  palette: 'command' | 'file' | null
  inlineOpen: boolean
  setSettings: (patch: Partial<AppSettings>) => Promise<void>
  openProject: (path: string) => Promise<void>
  setActivity: (id: ActivityId) => void
  setPanel: (id: PanelId) => void
  openFile: (path: string) => Promise<void>
  closeTab: (path: string) => Promise<void>
  setActive: (path: string) => void
  updateText: (path: string, text: string) => void
  save: (path?: string) => Promise<void>
  saveAll: () => Promise<void>
  setSelection: (sel: AppModel['selection']) => void
  setPalette: (kind: AppModel['palette']) => void
  setInlineOpen: (open: boolean) => void
  setHasKey: (value: boolean) => void
}

const Ctx = createContext<AppModel | null>(null)

function projectFromUrl(): string | undefined {
  const raw = new URLSearchParams(window.location.search).get('project')
  return raw ? decodeURIComponent(raw) : undefined
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [projectPath, setProjectPath] = useState<string | undefined>(projectFromUrl())
  const [host, setHost] = useState<HostState>({ status: 'starting' })
  const [platform, setPlatform] = useState('darwin')
  const [hasKey, setHasKey] = useState(false)
  const [activity, setActivity] = useState<ActivityId>('explorer')
  const [panel, setPanel] = useState<PanelId>('terminal')
  const [tabs, setTabs] = useState<EditorTab[]>([])
  const [activePath, setActivePath] = useState<string>()
  const [selection, setSelection] = useState<AppModel['selection']>(null)
  const [palette, setPalette] = useState<AppModel['palette']>(null)
  const [inlineOpen, setInlineOpen] = useState(false)

  useEffect(() => {
    let unsubHost: (() => void) | undefined
    let unsubMenu: (() => void) | undefined
    let unsubSettings: (() => void) | undefined
    void (async () => {
      const api = dhd()
      const [loaded, plat, key, hostState] = await Promise.all([
        api.app.settings.get(),
        api.app.platform(),
        api.credentials.has(),
        api.host.status(),
      ])
      setSettingsState(loaded)
      setActivity(loaded.window.activity)
      setPanel(loaded.window.panel)
      setPlatform(plat)
      setHasKey(key)
      setHost(hostState)
      document.documentElement.dataset.theme = loaded.theme === 'system'
        ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
        : loaded.theme
      const initial = projectFromUrl()
      if (initial) await api.project.open(initial)
      unsubHost = api.on('host:changed', setHost)
      unsubSettings = api.on('settings:changed', setSettingsState)
      unsubMenu = api.on('menu:command', (command) => {
        window.dispatchEvent(new CustomEvent('dhd-menu', { detail: command }))
      })
      setReady(true)
    })()
    return () => {
      unsubHost?.()
      unsubMenu?.()
      unsubSettings?.()
    }
  }, [])

  const setSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const next = await dhd().app.settings.set(patch)
    setSettingsState(next)
    if (patch.theme) {
      document.documentElement.dataset.theme = next.theme === 'system' ? 'dark' : next.theme
    }
  }, [])

  const openProject = useCallback(async (path: string) => {
    await dhd().project.open(path)
    setProjectPath(path)
    setTabs([])
    setActivePath(undefined)
    await dhd().window.setTitle(`${basename(path)} — DeepSeek Harness Desktop`)
  }, [])

  const openFile = useCallback(async (path: string) => {
    setActivePath(path)
    try {
      const file = await dhd().fs.readFile(path)
      const next: EditorTab = {
        path,
        text: file.binary ? '' : file.text,
        original: file.binary ? '' : file.text,
        language: languageFromPath(path),
        dirty: false,
        binary: file.binary,
      }
      setTabs((current) => (current.some((t) => t.path === path) ? current : [...current, next]))
    } catch (err) {
      console.error('openFile failed', path, err)
      window.alert(`无法打开文件：${path}\n${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  const closeTab = useCallback(async (path: string) => {
    const tab = tabs.find((t) => t.path === path)
    if (tab?.dirty) {
      await dhd().fs.writeFile(path, tab.text)
    }
    setTabs((current) => {
      const next = current.filter((t) => t.path !== path)
      if (activePath === path) setActivePath(next.at(-1)?.path)
      return next
    })
  }, [activePath, tabs])

  const updateText = useCallback((path: string, text: string) => {
    setTabs((current) => current.map((tab) => (
      tab.path === path ? { ...tab, text, dirty: text !== tab.original } : tab
    )))
  }, [])

  const save = useCallback(async (path?: string) => {
    const target = path ?? activePath
    const tab = tabs.find((t) => t.path === target)
    if (!tab || tab.binary) return
    await dhd().fs.writeFile(tab.path, tab.text)
    setTabs((current) => current.map((t) => (
      t.path === tab.path ? { ...t, original: t.text, dirty: false } : t
    )))
  }, [activePath, tabs])

  const saveAll = useCallback(async () => {
    for (const tab of tabs.filter((t) => t.dirty && !t.binary)) {
      await dhd().fs.writeFile(tab.path, tab.text)
    }
    setTabs((current) => current.map((t) => ({ ...t, original: t.text, dirty: false })))
  }, [tabs])

  const value = useMemo<AppModel>(() => ({
    ready,
    settings,
    projectPath,
    host,
    platform,
    hasKey,
    activity,
    panel,
    tabs,
    activePath,
    selection,
    palette,
    inlineOpen,
    setSettings,
    openProject,
    setActivity,
    setPanel,
    openFile,
    closeTab,
    setActive: setActivePath,
    updateText,
    save,
    saveAll,
    setSelection,
    setPalette,
    setInlineOpen,
    setHasKey,
  }), [ready, settings, projectPath, host, platform, hasKey, activity, panel, tabs, activePath, selection, palette, inlineOpen, setSettings, openProject, openFile, closeTab, updateText, save, saveAll])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppModel {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp outside provider')
  return ctx
}
