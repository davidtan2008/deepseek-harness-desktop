import { useState } from 'react'
import { dhd } from './lib'
import { useApp } from './state'

export function Welcome() {
  const app = useApp()
  const [cloneUrl, setCloneUrl] = useState('')
  const [cloneDest, setCloneDest] = useState('')
  const [key, setKey] = useState('')
  const [error, setError] = useState<string>()

  async function openFolder() {
    const path = await dhd().project.openDialog()
    if (path) await app.openProject(path)
  }

  async function clone() {
    try {
      setError(undefined)
      const dest = cloneDest || undefined
      const folder = dest ?? await dhd().dialog.saveFile('repo')
      if (!folder || !cloneUrl) return
      const path = await dhd().project.clone(cloneUrl, folder)
      await app.openProject(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function saveKey() {
    await dhd().credentials.set(key)
    app.setHasKey(true)
    setKey('')
  }

  return (
    <div className="welcome">
      <div className="welcome-card">
        <h1>DeepSeek Harness Desktop</h1>
        <p>本地 AI IDE。Agent 内核是 DeepSeek Harness，编辑器、终端、Git 与命令面板在桌面工作台。</p>
        <div className="actions">
          <button className="btn primary" onClick={() => void openFolder()}>打开文件夹</button>
          <button className="btn" onClick={() => void dhd().window.new()}>新建窗口</button>
        </div>
        {!app.hasKey && (
          <div className="form" style={{ padding: 0, marginBottom: 24 }}>
            <label>
              DeepSeek API Key（写入系统加密存储，并同步 ~/.dsh/.credentials.yaml）
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-…" />
            </label>
            <button className="btn primary" disabled={!key.trim()} onClick={() => void saveKey()}>保存密钥</button>
          </div>
        )}
        <div className="form" style={{ padding: 0, marginBottom: 28 }}>
          <label>
            从 Git 克隆
            <input value={cloneUrl} onChange={(e) => setCloneUrl(e.target.value)} placeholder="https://github.com/org/repo.git" />
          </label>
          <label>
            目标目录
            <input value={cloneDest} onChange={(e) => setCloneDest(e.target.value)} placeholder="留空则另存为…" />
          </label>
          <button className="btn" onClick={() => void clone()}>克隆并打开</button>
        </div>
        {error && <div className="err">{error}</div>}
        <h3 style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>最近项目</h3>
        <div className="recent">
          {app.settings.recentProjects.length === 0 && <div className="empty">还没有打开过项目</div>}
          {app.settings.recentProjects.map((path) => (
            <button key={path} onClick={() => void app.openProject(path)}>
              {path.split(/[\\/]/).pop()}
              <span className="path">{path}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
