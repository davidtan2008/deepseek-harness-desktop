import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ProjectTestResult } from '@dhd/shared'
import { dhd } from './lib'
import { useApp } from './state'

export function ChangesPanel() {
  const app = useApp()
  const [diff, setDiff] = useState('')
  const [testResult, setTestResult] = useState<ProjectTestResult>()
  const [testError, setTestError] = useState<string>()
  const [testing, setTesting] = useState(false)
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

  async function runTests() {
    if (app.projectPath === undefined || testing) return
    setTesting(true)
    setTestError(undefined)
    try {
      setTestResult(await dhd().test.run(app.projectPath))
    } catch (error) {
      setTestError(error instanceof Error ? error.message : String(error))
    } finally {
      setTesting(false)
    }
  }

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
          <button className="btn" onClick={() => testing ? void dhd().test.cancel() : void runTests()} disabled={!testing && app.projectPath === undefined}>
            {testing ? '取消测试' : '运行测试'}
          </button>
        </div>
      )}
      {!diff.trim() ? (
        <div className="empty">工作区没有未提交的 diff。Agent 写盘后会显示在这里。</div>
      ) : (
        <pre className="diff-pre">{diff.split('\n').map((line, i) => (
          <div key={i} className={line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-del' : ''}>{line}</div>
        ))}</pre>
      )}
      {testError !== undefined && <div className="err">测试失败：{testError}</div>}
      {testResult && (
        <div className={testResult.exitCode === 0 && !testResult.timedOut ? 'test-result ok' : 'test-result err'}>
          <strong>{testResult.command} test {testResult.timedOut ? '超时' : testResult.exitCode === 0 ? '通过' : `退出码 ${String(testResult.exitCode)}`}</strong>
          <pre>{testResult.output}</pre>
        </div>
      )}
    </>
  )
}
