import { useEffect, useState } from 'react'
import type { McpServerConfig } from '@dhd/shared'
import { dhd } from './lib'
import { useApp } from './state'

export function SettingsPanel() {
  const app = useApp()
  const [key, setKey] = useState('')
  const s = app.settings

  return (
    <div className="form">
      <label>
        主题
        <select value={s.theme} onChange={(e) => void app.setSettings({ theme: e.target.value as typeof s.theme })}>
          <option value="dark">深色</option>
          <option value="light">浅色</option>
          <option value="system">跟随系统</option>
        </select>
      </label>
      <label>
        键位
        <select value={s.keymap} onChange={(e) => void app.setSettings({ keymap: e.target.value as typeof s.keymap })}>
          <option value="cursor">Cursor 兼容</option>
          <option value="vscode">VS Code 兼容</option>
          <option value="default">默认</option>
        </select>
      </label>
      <label>
        字号
        <input type="number" value={s.fontSize} onChange={(e) => void app.setSettings({ fontSize: Number(e.target.value) })} />
      </label>
      <label className="row">
        <input type="checkbox" checked={s.wordWrap} onChange={(e) => void app.setSettings({ wordWrap: e.target.checked })} />
        自动换行
      </label>
      <label className="row">
        <input type="checkbox" checked={s.minimap} onChange={(e) => void app.setSettings({ minimap: e.target.checked })} />
        小地图
      </label>
      <label>
        默认 Agent 模式
        <select value={s.defaultPreset} onChange={(e) => void app.setSettings({ defaultPreset: e.target.value as typeof s.defaultPreset })}>
          <option value="standard">标准</option>
          <option value="ptc">PTC</option>
          <option value="minimal">极简</option>
          <option value="cordis">创造</option>
        </select>
      </label>
      <label>
        沙箱
        <select value={s.sandboxMode} onChange={(e) => void app.setSettings({ sandboxMode: e.target.value as typeof s.sandboxMode })}>
          <option value="read-only">只读</option>
          <option value="workspace-write">工作区可写</option>
          <option value="danger-full-access">关闭沙箱（危险）</option>
        </select>
      </label>
      <label>
        DeepSeek API Key
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={app.hasKey ? '已保存，输入以轮换' : 'sk-…'} />
      </label>
      <div className="row">
        <button className="btn primary" disabled={!key.trim()} onClick={async () => {
          await dhd().credentials.set(key)
          app.setHasKey(true)
          setKey('')
        }}>保存密钥</button>
        <button className="btn" onClick={async () => { await dhd().credentials.clear(); app.setHasKey(false) }}>清除</button>
      </div>
    </div>
  )
}

export function McpPanel() {
  const [servers, setServers] = useState<McpServerConfig[]>([])
  useEffect(() => { void dhd().mcp.list().then(setServers) }, [])

  function update(index: number, patch: Partial<McpServerConfig>) {
    setServers((current) => current.map((s, i) => i === index ? { ...s, ...patch } : s))
  }

  return (
    <div className="form">
      <p className="muted">MCP 服务器会写成 ~/.dsh/desktop-mcp.patch.yml，并在下次启动 Host 时以 --patch 加载。</p>
      {servers.map((server, i) => (
        <div key={server.id} className="form" style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8 }}>
          <input value={server.id} onChange={(e) => update(i, { id: e.target.value })} placeholder="id" />
          <select value={server.transport} onChange={(e) => update(i, { transport: e.target.value as McpServerConfig['transport'] })}>
            <option value="stdio">stdio</option>
            <option value="streamable-http">streamable-http</option>
          </select>
          <input value={server.command} onChange={(e) => update(i, { command: e.target.value })} placeholder="command" />
          <input value={server.args.join(' ')} onChange={(e) => update(i, { args: e.target.value.split(/\s+/).filter(Boolean) })} placeholder="args" />
          <input value={server.url ?? ''} onChange={(e) => update(i, { url: e.target.value })} placeholder="url (http transport)" />
          <label className="row">
            <input type="checkbox" checked={server.disabled} onChange={(e) => update(i, { disabled: e.target.checked })} />
            禁用
          </label>
        </div>
      ))}
      <div className="row">
        <button className="btn" onClick={() => setServers((s) => [...s, { id: `server-${s.length + 1}`, command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: {}, disabled: false, transport: 'stdio' }])}>添加</button>
        <button className="btn primary" onClick={() => void dhd().mcp.save(servers)}>保存</button>
      </div>
    </div>
  )
}

export function RulesPanel() {
  const app = useApp()
  const [files, setFiles] = useState<Array<{ path: string; kind: string; relative: string }>>([])
  useEffect(() => {
    if (!app.projectPath) return
    void dhd().rules.list(app.projectPath).then(setFiles)
  }, [app.projectPath])
  if (!files.length) return <div className="empty">未找到 AGENTS.md 或 skills。可在项目根创建 AGENTS.md。</div>
  return (
    <div>
      {files.map((file) => (
        <div key={file.path} className="hit" onClick={() => void app.openFile(file.path)}>
          {file.relative}
          <div className="meta">{file.kind} · {file.path}</div>
        </div>
      ))}
      <div className="form">
        <button className="btn" onClick={async () => {
          if (!app.projectPath) return
          const path = `${app.projectPath}/AGENTS.md`
          try { await dhd().fs.createFile(path) } catch { /* exists */ }
          await app.openFile(path)
        }}>创建 AGENTS.md</button>
      </div>
    </div>
  )
}
