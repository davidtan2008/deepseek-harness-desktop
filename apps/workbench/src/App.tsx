import { useEffect } from 'react'
import { CommandPalette } from './CommandPalette'
import { Welcome } from './Welcome'
import { Workbench } from './Workbench'
import { dhd } from './lib'
import { useApp } from './state'

export function App() {
  const app = useApp()

  useEffect(() => {
    function onMenu(event: Event) {
      const command = (event as CustomEvent<string>).detail
      if (command === 'openFolder') {
        void dhd().project.openDialog().then((p) => { if (p) return app.openProject(p) })
      }
      if (command === 'save') void app.save()
      if (command === 'saveAll') void app.saveAll()
      if (command === 'closeTab' && app.activePath) void app.closeTab(app.activePath)
      if (command === 'commandPalette') app.setPalette('command')
      if (command === 'quickOpen') app.setPalette('file')
      if (command === 'inlineEdit') app.setInlineOpen(true)
      if (command === 'toggleSidebar') void app.setSettings({ window: { ...app.settings.window, sidebarVisible: !app.settings.window.sidebarVisible } })
      if (command === 'toggleAgent') void app.setSettings({ window: { ...app.settings.window, agentVisible: !app.settings.window.agentVisible } })
      if (command === 'togglePanel' || command === 'toggleTerminal' || command === 'newTerminal') {
        void app.setSettings({ window: { ...app.settings.window, panelVisible: command === 'togglePanel' ? !app.settings.window.panelVisible : true, panel: 'terminal' } })
        app.setPanel('terminal')
      }
      if (command === 'openSettings') app.setActivity('settings')
      if (command === 'restartHost') void dhd().host.restart()
      if (command === 'focusAgent') void app.setSettings({ window: { ...app.settings.window, agentVisible: true } })
      if (command === 'newWindow') void dhd().window.new()
      if (command === 'openDocs') void dhd().shell.openExternal('https://deepseek-harness.github.io/deepseek-harness/')
    }
    window.addEventListener('dhd-menu', onMenu)
    return () => window.removeEventListener('dhd-menu', onMenu)
  }, [app])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); app.setPalette('command') }
      else if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); app.setPalette('file') }
      else if (mod && e.key.toLowerCase() === 'k' && !e.shiftKey) { e.preventDefault(); app.setInlineOpen(true) }
      else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void app.save() }
      else if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        void app.setSettings({ window: { ...app.settings.window, sidebarVisible: !app.settings.window.sidebarVisible } })
      }
      else if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        void app.setSettings({ window: { ...app.settings.window, panelVisible: !app.settings.window.panelVisible } })
      }
      else if (mod && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        void app.setSettings({ window: { ...app.settings.window, agentVisible: !app.settings.window.agentVisible } })
      }
      else if (e.key === 'Escape') {
        app.setPalette(null)
        app.setInlineOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [app])

  if (!app.ready) return <div className="welcome"><p className="muted">正在启动…</p></div>
  return (
    <>
      {app.projectPath ? <Workbench /> : <Welcome />}
      <CommandPalette />
    </>
  )
}
