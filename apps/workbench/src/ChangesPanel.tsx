import { useCallback, useEffect, useState } from 'react'
import { dhd } from './lib'
import { useApp } from './state'

export function ChangesPanel() {
  const app = useApp()
  const [diff, setDiff] = useState('')

  const load = useCallback(async () => {
    if (!app.projectPath) return
    setDiff(await dhd().git.diff(app.projectPath))
  }, [app.projectPath])

  useEffect(() => {
    void load()
    return dhd().on('fs:changed', () => { void load() })
  }, [load])

  if (!diff.trim()) return <div className="empty">工作区没有未提交的 diff。Agent 写盘后会显示在这里。</div>
  return (
    <pre className="diff-pre">{diff.split('\n').map((line, i) => (
      <div key={i} className={line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-del' : ''}>{line}</div>
    ))}</pre>
  )
}
