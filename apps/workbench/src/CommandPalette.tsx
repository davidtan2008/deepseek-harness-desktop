import { useEffect, useMemo, useState } from 'react'
import { dhd, fuzzy } from './lib'
import { useApp } from './state'

interface Item {
  id: string
  label: string
  hint?: string
  run: () => void
}

export function CommandPalette() {
  const app = useApp()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [files, setFiles] = useState<string[]>([])

  useEffect(() => {
    if (app.palette === 'file' && app.projectPath) {
      void dhd().search.files(app.projectPath, '').then(setFiles)
    }
  }, [app.palette, app.projectPath])

  const items = useMemo<Item[]>(() => {
    if (app.palette === 'file') {
      return files.filter((f) => fuzzy(query, f)).slice(0, 50).map((path) => ({
        id: path,
        label: path.split(/[\\/]/).pop() ?? path,
        hint: path,
        run: () => { void app.openFile(path); app.setPalette(null) },
      }))
    }
    const commands: Item[] = [
      { id: 'open', label: '打开文件夹', run: async () => { const p = await dhd().project.openDialog(); if (p) await app.openProject(p); app.setPalette(null) } },
      { id: 'save', label: '保存', hint: '⌘S', run: () => { void app.save(); app.setPalette(null) } },
      { id: 'saveAll', label: '全部保存', run: () => { void app.saveAll(); app.setPalette(null) } },
      { id: 'term', label: '切换终端', hint: '⌘J', run: () => { void app.setSettings({ window: { ...app.settings.window, panelVisible: !app.settings.window.panelVisible, panel: 'terminal' } }); app.setPalette(null) } },
      { id: 'agent', label: '切换 Agent', hint: '⌘L', run: () => { void app.setSettings({ window: { ...app.settings.window, agentVisible: !app.settings.window.agentVisible } }); app.setPalette(null) } },
      { id: 'sidebar', label: '切换侧栏', hint: '⌘B', run: () => { void app.setSettings({ window: { ...app.settings.window, sidebarVisible: !app.settings.window.sidebarVisible } }); app.setPalette(null) } },
      { id: 'inline', label: '行内编辑', hint: '⌘K', run: () => { app.setInlineOpen(true); app.setPalette(null) } },
      { id: 'settings', label: '打开设置', run: () => { app.setActivity('settings'); app.setPalette(null) } },
      { id: 'scm', label: '打开源代码管理', run: () => { app.setActivity('scm'); app.setPalette(null) } },
      { id: 'mcp', label: '打开 MCP', run: () => { app.setActivity('mcp'); app.setPalette(null) } },
      { id: 'rules', label: '打开 Rules / Skills', run: () => { app.setActivity('rules'); app.setPalette(null) } },
      { id: 'restart', label: '重启 Harness Host', run: () => { void dhd().host.restart(); app.setPalette(null) } },
      { id: 'docs', label: '打开 Harness 文档', run: () => { void dhd().shell.openExternal('https://deepseek-harness.github.io/deepseek-harness/'); app.setPalette(null) } },
      { id: 'newwin', label: '新建窗口', run: () => { void dhd().window.new(); app.setPalette(null) } },
    ]
    return commands.filter((c) => fuzzy(query, c.label))
  }, [app, files, query])

  useEffect(() => setIndex(0), [query, app.palette])

  if (!app.palette) return null
  const current = items[index]

  return (
    <div className="overlay" onClick={() => app.setPalette(null)}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder={app.palette === 'file' ? '转到文件' : '命令面板'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') app.setPalette(null)
            if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, items.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)) }
            if (e.key === 'Enter' && current) current.run()
          }}
        />
        <div className="palette-list">
          {items.map((item, i) => (
            <div key={item.id} className={`palette-item ${i === index ? 'active' : ''}`} onClick={item.run}>
              <span>{item.label}</span>
              <span className="kbd">{item.hint}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
