import { useEffect, useRef, useState } from 'react'
import type { AgentContextItem, AgentTurnEvent } from '@dhd/shared'
import { buildContextBundle } from '@dhd/shared'
import { dhd, randomUUID } from './lib'
import { useApp } from './state'

function terminalEvent(event: AgentTurnEvent): boolean {
  return event.type === 'turn-completed' || event.type === 'turn-failed' || event.type === 'turn-cancelled'
}

export function AgentPanel({ width }: { width: number }) {
  const app = useApp()
  const frame = useRef<HTMLIFrameElement>(null)
  const [prompt, setPrompt] = useState('')
  const [activeTurn, setActiveTurn] = useState<string>()
  const [error, setError] = useState<string>()
  const url = app.host.status === 'ready' ? app.host.url : undefined
  const nativeReady = app.agentStatus?.id === 'host-ipc' && app.agentStatus.capabilities.sendTurn
  const recentEvents = app.agentEvents.slice(-6)
  const changeEvent = [...app.agentEvents].reverse().find((event) => event.type === 'change-projection')

  useEffect(() => {
    if (activeTurn === undefined) return
    if (app.agentEvents.some((event) => event.turnId === activeTurn && terminalEvent(event))) setActiveTurn(undefined)
  }, [activeTurn, app.agentEvents])

  async function sendNative(text: string, context: AgentContextItem[]): Promise<void> {
    if (!nativeReady) return
    setError(undefined)
    try {
      const result = await dhd().agent.send({ turnId: randomUUID(), text, context })
      setActiveTurn(result.turnId)
      setPrompt('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function sendSelection() {
    const sel = app.selection
    if (!sel?.text) return
    let bundle: ReturnType<typeof buildContextBundle>
    try {
      bundle = buildContextBundle([{ kind: 'selection', path: sel.path, text: sel.text }])
    } catch {
      return
    }
    if (nativeReady) {
      await sendNative(prompt.trim() || '请处理当前选区。', bundle.items)
      return
    }
    await navigator.clipboard.writeText(bundle.canonical)
    try {
      frame.current?.contentWindow?.postMessage({ type: 'dhd-insert', text: bundle.canonical, context: bundle.items }, url ? new URL(url).origin : '*')
    } catch {
      // cross-origin; clipboard still has the payload
    }
  }

  async function sendPrompt() {
    const text = prompt.trim()
    if (text.length === 0) return
    await sendNative(text, [])
  }

  async function cancelTurn() {
    if (activeTurn === undefined) return
    try {
      await dhd().agent.cancel(activeTurn)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <div className="agent" style={{ ['--agent-width' as string]: `${width}px` }}>
      <div className="agent-status">
        <span className={`dot ${app.host.status === 'ready' ? 'ok' : app.host.status === 'error' ? 'err' : 'warn'}`} />
        {app.host.status === 'ready' && 'Harness 已连接'}
        {app.host.status === 'starting' && '正在启动 Harness Host…'}
        {app.host.status === 'stopped' && 'Host 已停止'}
        {app.host.status === 'error' && (
          <span title={app.host.message} style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {app.host.message}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => void sendSelection()} disabled={!app.selection?.text}>发送选区</button>
        <button className="btn" onClick={() => void dhd().host.restart()}>重启</button>
      </div>
      {nativeReady && (
        <div className="agent-native">
          <div className="agent-native-head">
            <span>Native Session transport</span>
            {activeTurn !== undefined && <button className="btn" onClick={() => void cancelTurn()}>取消</button>}
          </div>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void sendPrompt()
            }}
            placeholder="向 Harness Agent 发送消息"
            rows={3}
          />
          <div className="row">
            <button className="btn primary" onClick={() => void sendPrompt()} disabled={prompt.trim().length === 0}>发送</button>
            {changeEvent?.type === 'change-projection' && (
              <button className="btn" onClick={() => app.setPanel('changes')}>查看 {changeEvent.changedPaths.length} 个变更</button>
            )}
          </div>
          {error !== undefined && <div className="err">{error}</div>}
          <div className="agent-event-list">
            {recentEvents.map((event, index) => (
              <div key={`${event.turnId}-${event.type}-${index}`} className="agent-event">
                {event.type === 'tool-call' && `工具：${event.tool}`}
                {event.type === 'approval-required' && '等待审批'}
                {event.type === 'change-projection' && `变更：${event.changedPaths.join('、')}`}
                {event.type === 'turn-started' && 'Agent 已开始'}
                {event.type === 'turn-completed' && 'Agent 已完成'}
                {event.type === 'turn-failed' && `失败：${event.message}`}
                {event.type === 'turn-cancelled' && '已取消'}
              </div>
            ))}
          </div>
        </div>
      )}
      {url ? (
        <iframe ref={frame} src={url} title="DeepSeek Harness" style={{ flex: 1, border: 0 }} />
      ) : (
        <div className="empty">
          {app.host.status === 'error' ? app.host.message : '等待 DeepSeek Harness Host。首次需在上游仓库执行 pnpm install && pnpm run build。'}
        </div>
      )}
    </div>
  )
}
