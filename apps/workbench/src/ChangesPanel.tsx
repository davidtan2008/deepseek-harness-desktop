import { useCallback, useEffect, useMemo, useState } from 'react'
import { dhd } from './lib'
import { useApp } from './state'

export function ChangesPanel() {
  const app = useApp()
  const [diff, setDiff] = useState('')
  const agentChange = useMemo(
    () => [...app.agentEvents].reverse().find((event) => event.type === 'change-projection'),
    [app.agentEvents],
  )
  const changedPaths = useMemo(
    () => agentChange?.type === 'change-projection' ? agentChange.changedPaths : [],
    [agentChange],
  )

  const load = useCallback(async () => {
    const projectPath = app.projectPath
    if (projectPath === undefined) return
    if (changedPaths.length === 0) {
      setDiff(await dhd().git.diff(projectPath))
      return
    }
    const sections = await Promise.all(changedPaths.map(async (path) => {
      const content = await dhd().git.diff(projectPath, path)
      return content.trim().length === 0 ? '' : `--- ${path}\n${content}`
    }))
    setDiff(sections.filter((section) => section.length > 0).join('\n\n'))
  }, [app.projectPath, changedPaths])

  useEffect(() => {
    void load()
    return dhd().on('fs:changed', () => { void load() })
  }, [load])

  return (
    <>
      {agentChange?.type === 'change-projection' && (
        <div className="changes-review-head">
          <span>Agent turn {agentChange.turnId.slice(0, 8)}</span>
          <span>{changedPaths.length} 个 changed paths · 当前工作区 diff</span>
        </div>
      )}
      {!diff.trim() ? (
        <div className="empty">工作区没有未提交的 diff。Agent 写盘后会显示在这里。</div>
      ) : (
        <pre className="diff-pre">{diff.split('\n').map((line, i) => (
          <div key={i} className={line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-del' : ''}>{line}</div>
        ))}</pre>
      )}
    </>
  )
}
