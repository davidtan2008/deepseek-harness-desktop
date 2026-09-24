import {
  Blocks,
  Bot,
  Files,
  FolderOpen,
  GitBranch,
  Minus,
  Puzzle,
  Search,
  Settings,
  Square,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { AgentPanel } from './AgentPanel'
import { ChangesPanel } from './ChangesPanel'
import { EditorArea } from './EditorArea'
import { Explorer } from './Explorer'
import { InlineEdit } from './InlineEdit'
import { SearchPanel } from './SearchPanel'
import { McpPanel, RulesPanel, SettingsPanel } from './SettingsPanels'
import { ScmPanel } from './ScmPanel'
import { Sash } from './Sash'
import { TerminalPanel } from './TerminalPanel'
import { useApp } from './state'
import { dhd } from './lib'
import type { ActivityId, PanelId, WindowState } from '@dhd/shared'

const ACTIVITIES: Array<{ id: ActivityId; icon: typeof Files; title: string }> = [
  { id: 'explorer', icon: Files, title: '资源管理器' },
  { id: 'search', icon: Search, title: '搜索' },
  { id: 'scm', icon: GitBranch, title: '源代码管理' },
  { id: 'agent', icon: Bot, title: 'Agent' },
  { id: 'rules', icon: Blocks, title: 'Rules / Skills' },
  { id: 'mcp', icon: Puzzle, title: 'MCP' },
]

const PANELS: Array<{ id: PanelId; label: string }> = [
  { id: 'terminal', label: '终端' },
  { id: 'changes', label: '变更' },
  { id: 'problems', label: '问题' },
  { id: 'output', label: '输出' },
  { id: 'jobs', label: '作业' },
]

export function Workbench() {
  const app = useApp()
  const win = app.settings.window
  const showWindowsControls = app.platform !== 'darwin'
  const [sizes, setSizes] = useState({
    sidebarWidth: win.sidebarWidth,
    agentWidth: win.agentWidth,
    panelHeight: win.panelHeight,
  })

  useEffect(() => {
    setSizes({
      sidebarWidth: win.sidebarWidth,
      agentWidth: win.agentWidth,
      panelHeight: win.panelHeight,
    })
  }, [win.sidebarWidth, win.agentWidth, win.panelHeight])

  function persist(patch: Partial<Pick<WindowState, 'sidebarWidth' | 'agentWidth' | 'panelHeight'>>) {
    void app.setSettings({ window: { ...win, ...patch } })
  }

  const agentMax = Math.max(360, window.innerWidth - 48 - (win.sidebarVisible ? sizes.sidebarWidth : 0) - 280)
  const panelMax = Math.max(160, window.innerHeight - 38 - 24 - 160)

  return (
    <div className="app">
      <header className="titlebar">
        <span className="title">{app.projectPath?.split(/[\\/]/).pop()} — DeepSeek Harness Desktop</span>
        <div className="row no-drag">
          <button className="btn" onClick={() => void dhd().project.openDialog().then((p) => { if (p) return app.openProject(p) })}>
            <FolderOpen size={14} /> 打开
          </button>
        </div>
        {showWindowsControls && (
          <div className="win-controls no-drag">
            <button onClick={() => void dhd().window.minimize()}><Minus size={14} /></button>
            <button onClick={() => void dhd().window.maximize()}><Square size={12} /></button>
            <button onClick={() => void dhd().window.close()}><X size={14} /></button>
          </div>
        )}
      </header>
      <div className="workbench">
        <nav className="activity">
          {ACTIVITIES.map((item) => (
            <button
              key={item.id}
              title={item.title}
              className={app.activity === item.id && win.sidebarVisible ? 'active' : ''}
              onClick={() => {
                if (app.activity === item.id) {
                  void app.setSettings({ window: { ...win, sidebarVisible: !win.sidebarVisible } })
                } else {
                  app.setActivity(item.id)
                  void app.setSettings({ window: { ...win, sidebarVisible: true, activity: item.id } })
                }
              }}
            >
              <item.icon size={18} />
            </button>
          ))}
          <div className="spacer" />
          <button
            title="设置"
            className={app.activity === 'settings' ? 'active' : ''}
            onClick={() => { app.setActivity('settings'); void app.setSettings({ window: { ...win, sidebarVisible: true, activity: 'settings' } }) }}
          >
            <Settings size={18} />
          </button>
        </nav>
        {win.sidebarVisible && (
          <>
            <aside className="sidebar" style={{ ['--sidebar-width' as string]: `${sizes.sidebarWidth}px` }}>
              <div className="sidebar-title">
                {app.activity === 'explorer' && '资源管理器'}
                {app.activity === 'search' && '搜索'}
                {app.activity === 'scm' && '源代码管理'}
                {app.activity === 'agent' && 'Agent 会话'}
                {app.activity === 'rules' && 'Rules / Skills'}
                {app.activity === 'mcp' && 'MCP'}
                {app.activity === 'settings' && '设置'}
              </div>
              <div className="sidebar-body">
                {app.activity === 'explorer' && <Explorer />}
                {app.activity === 'search' && <SearchPanel />}
                {app.activity === 'scm' && <ScmPanel />}
                {app.activity === 'agent' && <div className="empty">Agent 在右侧面板。四种模式、Trajectory、Skills 均由 Harness Web UI 提供。</div>}
                {app.activity === 'rules' && <RulesPanel />}
                {app.activity === 'mcp' && <McpPanel />}
                {app.activity === 'settings' && <SettingsPanel />}
              </div>
            </aside>
            <Sash
              axis="x"
              value={sizes.sidebarWidth}
              min={180}
              max={480}
              onChange={(sidebarWidth) => setSizes((current) => ({ ...current, sidebarWidth }))}
              onCommit={(sidebarWidth) => persist({ sidebarWidth })}
            />
          </>
        )}
        <div className="center" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 0, minWidth: 0, position: 'relative', display: 'flex' }}>
            <EditorArea />
            <InlineEdit />
          </div>
          {win.panelVisible && (
            <>
              <Sash
                axis="y"
                invert
                value={sizes.panelHeight}
                min={120}
                max={panelMax}
                onChange={(panelHeight) => setSizes((current) => ({ ...current, panelHeight }))}
                onCommit={(panelHeight) => persist({ panelHeight })}
              />
              <section className="panel" style={{ ['--panel-height' as string]: `${sizes.panelHeight}px` }}>
                <div className="panel-tabs">
                  {PANELS.map((item) => (
                    <button key={item.id} className={app.panel === item.id ? 'active' : ''} onClick={() => app.setPanel(item.id)}>
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="panel-body">
                  {app.panel === 'terminal' && <TerminalPanel />}
                  {app.panel === 'changes' && <ChangesPanel />}
                  {app.panel === 'problems' && <div className="empty">编辑器诊断将显示在这里。语言服务可通过 Harness LSP 插件接入。</div>}
                  {app.panel === 'output' && (
                    <pre className="diff-pre">{app.host.status === 'error' ? app.host.message : `Host: ${app.host.status}`}</pre>
                  )}
                  {app.panel === 'jobs' && <div className="empty">Agent 后台作业显示在 Harness 会话头部。此处预留下一阶段 Host 作业投影。</div>}
                </div>
              </section>
            </>
          )}
        </div>
        {win.agentVisible && (
          <>
            <Sash
              axis="x"
              invert
              value={sizes.agentWidth}
              min={280}
              max={agentMax}
              onChange={(agentWidth) => setSizes((current) => ({ ...current, agentWidth }))}
              onCommit={(agentWidth) => persist({ agentWidth })}
            />
            <AgentPanel width={sizes.agentWidth} />
          </>
        )}
      </div>
      <footer className="statusbar">
        <span>
          {app.host.status === 'ready' ? 'Host ready' : app.host.status}
          <button onClick={() => void dhd().host.restart()}>重启 Host</button>
        </span>
        <span title="Desktop capability contract for adapters and extensions">
          {app.capabilities ? `adapter v${app.capabilities.contractVersion} · ${app.capabilities.surface}` : 'adapter contract'}
        </span>
        <span>
          <button>{app.settings.sandboxMode}</button>
          <button>{app.settings.defaultPreset}</button>
          <button>{app.settings.defaultModel}</button>
          {app.hasKey ? <span className="ok-text">API key</span> : <span className="err">未配置密钥</span>}
        </span>
      </footer>
    </div>
  )
}
