import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AgentReviewResult, ProjectTestResult } from '@dhd/shared'
import { dhd, randomUUID } from './lib'
import { useApp } from './state'

function reviewLines(review: AgentReviewResult): string[] {
  return review.files.flatMap((file) => {
    if (file.diff === null) return [`--- ${file.path} (comparison unavailable)`]
    if (file.diff.kind !== 'text') return [`--- ${file.path} (${file.diff.kind})`]
    return [`--- ${file.path}`, `+++ ${file.path}`, ...file.diff.hunks.flatMap((hunk) => hunk.lines)]
  })
}

export function ChangesPanel() {
  const app = useApp()
  const [diff, setDiff] = useState('')
  const [testResult, setTestResult] = useState<ProjectTestResult>()
  const [testError, setTestError] = useState<string>()
  const [testing, setTesting] = useState(false)
  const [review, setReview] = useState<AgentReviewResult>()
  const [reviewError, setReviewError] = useState<string>()
  const [askingAgent, setAskingAgent] = useState(false)
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

  async function loadReview() {
    if (agentChange?.type !== 'change-projection') return
    setReviewError(undefined)
    try {
      setReview(await dhd().agent.review(agentChange.turnId))
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : String(error))
    }
  }

  async function askAgentToFix() {
    if (agentChange?.type !== 'change-projection' || testResult === undefined || askingAgent) return
    setAskingAgent(true)
    setReviewError(undefined)
    try {
      const output = testResult.output.slice(-64 * 1024)
      await dhd().agent.send({
        turnId: randomUUID(),
        text: `Agent turn ${agentChange.turnId} 的项目测试失败（${testResult.command}，退出码 ${String(testResult.exitCode)}${testResult.timedOut ? '，超时' : ''}）。请根据以下输出检查并修复相关变更：\n${output}`,
        context: changedPaths.map((path) => ({ kind: 'file' as const, path })),
      })
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : String(error))
    } finally {
      setAskingAgent(false)
    }
  }

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
          <button className="btn" onClick={() => void loadReview()}>加载前后 diff</button>
          <button className="btn" onClick={() => testing ? void dhd().test.cancel() : void runTests()} disabled={!testing && app.projectPath === undefined}>
            {testing ? '取消测试' : '运行测试'}
          </button>
          {testResult && (testResult.exitCode !== 0 || testResult.timedOut) && (
            <button className="btn primary" onClick={() => void askAgentToFix()} disabled={askingAgent}>
              {askingAgent ? '提交中…' : '让 Agent 修复'}
            </button>
          )}
        </div>
      )}
      {!diff.trim() ? (
        <div className="empty">工作区没有未提交的 diff。Agent 写盘后会显示在这里。</div>
      ) : (
        <pre className="diff-pre">{diff.split('\n').map((line, i) => (
          <div key={i} className={line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-del' : ''}>{line}</div>
        ))}</pre>
      )}
      {reviewError !== undefined && <div className="err">Agent diff 加载失败：{reviewError}</div>}
      {review && (
        <div className="test-result">
          <strong>{review.available ? `Agent 前后 diff (${review.files.length} 个文件)` : 'Agent 前后 diff 暂不可用'}</strong>
          {review.available && <pre>{reviewLines(review).join('\n')}</pre>}
        </div>
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
