import { useState } from 'react'
import { dhd } from './lib'
import { applyInlineReplacement } from './EditorArea'
import { useApp } from './state'

export function InlineEdit() {
  const app = useApp()
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  if (!app.inlineOpen) return null
  const tab = app.tabs.find((t) => t.path === app.activePath)
  const sel = app.selection

  async function run() {
    if (!tab || !sel) return
    setBusy(true)
    setError(undefined)
    try {
      const result = await dhd().inlineEdit.run({
        path: tab.path,
        language: tab.language,
        fullText: tab.text,
        selectionStart: sel.start,
        selectionEnd: sel.end,
        selectedText: sel.text || tab.text,
        instruction,
      })
      const next = applyInlineReplacement(tab.text, sel.start || 0, sel.end || tab.text.length, result.replacement)
      app.updateText(tab.path, next)
      app.setInlineOpen(false)
      setInstruction('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="inline-edit">
      <div className="muted" style={{ marginBottom: 8 }}>
        Cmd+K 行内编辑 {sel?.text ? `· 已选 ${sel.text.length} 字符` : '· 未选区则改整文件'}
      </div>
      <textarea
        autoFocus
        value={instruction}
        placeholder="描述你想怎么改这段代码"
        onChange={(e) => setInstruction(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') app.setInlineOpen(false)
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void run()
        }}
      />
      {error && <div className="err">{error}</div>}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn primary" disabled={busy || !instruction.trim() || !tab} onClick={() => void run()}>
          {busy ? '生成中…' : '生成并预览到编辑器'}
        </button>
        <button className="btn" onClick={() => app.setInlineOpen(false)}>取消</button>
      </div>
    </div>
  )
}
