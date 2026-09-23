import { useRef } from 'react'
import { dhd } from './lib'
import { useApp } from './state'

export function AgentPanel({ width }: { width: number }) {
  const app = useApp()
  const frame = useRef<HTMLIFrameElement>(null)
  const url = app.host.status === 'ready' ? app.host.url : undefined

  async function sendSelection() {
    const sel = app.selection
    if (!sel?.text) return
    const payload = [
      `Context from editor ${sel.path}:`,
      '```',
      sel.text,
      '```',
      '',
    ].join('\n')
    await navigator.clipboard.writeText(payload)
    try {
      frame.current?.contentWindow?.postMessage({ type: 'dhd-insert', text: payload }, url ? new URL(url).origin : '*')
    } catch {
      // cross-origin; clipboard still has the payload
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
