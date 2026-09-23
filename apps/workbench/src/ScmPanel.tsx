import { useCallback, useEffect, useState } from 'react'
import type { GitStatus } from '@dhd/shared'
import { dhd } from './lib'
import { useApp } from './state'

export function ScmPanel() {
  const app = useApp()
  const [status, setStatus] = useState<GitStatus>()
  const [message, setMessage] = useState('')
  const [diff, setDiff] = useState('')
  const [error, setError] = useState<string>()

  const refresh = useCallback(async () => {
    if (!app.projectPath) return
    setStatus(await dhd().git.status(app.projectPath))
  }, [app.projectPath])

  useEffect(() => {
    void refresh()
    return dhd().on('fs:changed', () => { void refresh() })
  }, [refresh])

  if (!status?.available) return <div className="empty">当前文件夹不是 Git 仓库</div>

  return (
    <div>
      <div className="form">
        <div className="row">
          <strong>{status.branch ?? 'detached'}</strong>
          {status.ahead > 0 && <span className="muted">↑{status.ahead}</span>}
          {status.behind > 0 && <span className="muted">↓{status.behind}</span>}
        </div>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="提交说明" />
        <div className="row">
          <button className="btn primary" disabled={!message.trim()} onClick={async () => {
            try {
              await dhd().git.commit(app.projectPath!, message)
              setMessage('')
              await refresh()
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err))
            }
          }}>提交</button>
          <button className="btn" onClick={async () => { await dhd().git.push(app.projectPath!); await refresh() }}>推送</button>
          <button className="btn" onClick={async () => { await dhd().git.pull(app.projectPath!); await refresh() }}>拉取</button>
        </div>
        {error && <div className="err">{error}</div>}
      </div>
      {status.files.map((file) => (
        <div key={file.path} className="hit" onClick={async () => {
          const text = await dhd().git.diff(app.projectPath!, file.path)
          setDiff(text)
          const full = `${app.projectPath}/${file.path}`
          void app.openFile(full)
        }}>
          <code>{file.index}{file.worktree}</code> {file.path}
          <div className="row">
            <button className="btn" onClick={(e) => { e.stopPropagation(); void dhd().git.stage(app.projectPath!, [file.path]).then(refresh) }}>暂存</button>
            <button className="btn" onClick={(e) => { e.stopPropagation(); void dhd().git.unstage(app.projectPath!, [file.path]).then(refresh) }}>取消暂存</button>
          </div>
        </div>
      ))}
      {diff && (
        <pre className="diff-pre">{diff.split('\n').map((line, i) => (
          <div key={i} className={line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-del' : ''}>{line}</div>
        ))}</pre>
      )}
    </div>
  )
}
