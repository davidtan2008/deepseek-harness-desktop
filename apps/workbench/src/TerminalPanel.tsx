import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { dhd } from './lib'
import { useApp } from './state'

export function TerminalPanel() {
  const app = useApp()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !app.projectPath) return
    let cancelled = false
    let ptyId: string | undefined

    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      theme: { background: '#1a1a1a', foreground: '#e8e8e8', cursor: '#e8e8e8' },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(el)
    const layout = () => {
      try { fit.fit() } catch { /* container not ready */ }
    }
    layout()
    const ro = new ResizeObserver(() => {
      layout()
      if (ptyId) void dhd().pty.resize(ptyId, Math.max(term.cols, 80), Math.max(term.rows, 24))
    })
    ro.observe(el)

    const unsubData = dhd().on('pty:data', (payload) => {
      if (ptyId === payload.id) term.write(payload.data)
    })
    const unsubExit = dhd().on('pty:exit', (payload) => {
      if (ptyId === payload.id) {
        term.write(`\r\n[process exited ${payload.exitCode}]\r\n`)
      }
    })
    const dataHook = term.onData((data) => {
      if (ptyId) void dhd().pty.write(ptyId, data)
    })

    void (async () => {
      try {
        // Sessions survive tab switches: this reattaches to the live shell
        // (replaying what it printed while the panel was hidden) or starts
        // one when none exists yet. StrictMode's double-mount acquires the
        // same session twice; the cancelled effect must not kill it.
        const { id, replay } = await dhd().pty.acquire({
          cwd: app.projectPath!,
          cols: Math.max(term.cols, 80),
          rows: Math.max(term.rows, 24),
        })
        if (cancelled) return
        ptyId = id
        if (replay) term.write(replay)
        void dhd().pty.resize(id, Math.max(term.cols, 80), Math.max(term.rows, 24))
      } catch (err) {
        if (!cancelled) {
          term.write(`\r\nFailed to start shell: ${err instanceof Error ? err.message : String(err)}\r\n`)
        }
      }
    })()

    return () => {
      cancelled = true
      dataHook.dispose()
      ro.disconnect()
      unsubData()
      unsubExit()
      // Deliberately no pty.kill here: the shell keeps running so switching
      // back to this tab reattaches to it. It is killed when the project or
      // window changes (see pty.acquire / killSessionsOfOwner).
      term.dispose()
    }
  }, [app.projectPath])

  if (!app.projectPath) {
    return <div className="empty">打开文件夹后终端会在项目目录启动</div>
  }

  return <div className="xterm-wrap"><div className="xterm" ref={ref} /></div>
}
