import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { useApp } from './state'

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  },
}

function monacoLanguage(id: string): string {
  if (id === 'typescriptreact') return 'typescript'
  if (id === 'javascriptreact') return 'javascript'
  return id
}

export function EditorArea() {
  const app = useApp()
  const host = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const pathRef = useRef<string>()
  const updateTextRef = useRef(app.updateText)
  const setSelectionRef = useRef(app.setSelection)
  updateTextRef.current = app.updateText
  setSelectionRef.current = app.setSelection

  useEffect(() => {
    const el = host.current
    if (!el) return

    const editor = monaco.editor.create(el, {
      theme: 'vs-dark',
      automaticLayout: true,
      fontSize: app.settings.fontSize,
      fontFamily: app.settings.fontFamily,
      tabSize: app.settings.tabSize,
      wordWrap: app.settings.wordWrap ? 'on' : 'off',
      minimap: { enabled: app.settings.minimap },
      smoothScrolling: true,
      padding: { top: 8 },
      value: '',
      readOnly: true,
    })
    editorRef.current = editor

    const subContent = editor.onDidChangeModelContent(() => {
      const model = editor.getModel()
      if (!model || !pathRef.current) return
      updateTextRef.current(pathRef.current, model.getValue())
    })
    const subSel = editor.onDidChangeCursorSelection(() => {
      const model = editor.getModel()
      const sel = editor.getSelection()
      if (!model || !sel || !pathRef.current) return
      const text = model.getValueInRange(sel)
      setSelectionRef.current({
        path: pathRef.current,
        text,
        start: model.getOffsetAt(sel.getStartPosition()),
        end: model.getOffsetAt(sel.getEndPosition()),
      })
    })

    const ro = new ResizeObserver(() => editor.layout())
    ro.observe(el)

    return () => {
      subContent.dispose()
      subSel.dispose()
      ro.disconnect()
      editor.dispose()
      editorRef.current = null
    }
    // created once per mount; options are applied in a later effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    editorRef.current?.updateOptions({
      fontSize: app.settings.fontSize,
      wordWrap: app.settings.wordWrap ? 'on' : 'off',
      minimap: { enabled: app.settings.minimap },
    })
  }, [app.settings.fontSize, app.settings.minimap, app.settings.wordWrap])

  const tab = app.tabs.find((t) => t.path === app.activePath)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    pathRef.current = tab?.path

    if (!tab || tab.binary) {
      editor.setModel(null)
      return
    }

    const uri = monaco.Uri.parse(`dhd://file/${encodeURIComponent(tab.path)}`)
    let model = monaco.editor.getModel(uri)
    if (!model) {
      model = monaco.editor.createModel(tab.text, monacoLanguage(tab.language), uri)
    } else if (model.getValue() !== tab.text) {
      model.setValue(tab.text)
    }
    if (editor.getModel() !== model) {
      editor.setModel(model)
    }
    editor.updateOptions({ readOnly: false })
    requestAnimationFrame(() => editor.layout())
  }, [app.activePath, tab])

  return (
    <div className="editor-area">
      <div className="tabs">
        {app.tabs.map((item) => (
          <div
            key={item.path}
            className={`tab ${item.path === app.activePath ? 'active' : ''} ${item.dirty ? 'dirty' : ''}`}
            onClick={() => app.setActive(item.path)}
          >
            {item.path.split(/[\\/]/).pop()}
            <button className="close" onClick={(e) => { e.stopPropagation(); void app.closeTab(item.path) }}>×</button>
          </div>
        ))}
      </div>
      <div className="editor">
        {tab?.binary && <div className="editor-empty">二进制文件，无法在编辑器中打开</div>}
        {!tab && <div className="editor-empty">打开文件开始编辑，或按 Cmd/Ctrl+P 快开</div>}
        <div
          ref={host}
          className="monaco-host"
          style={{ visibility: tab && !tab.binary ? 'visible' : 'hidden' }}
        />
      </div>
    </div>
  )
}

export function applyInlineReplacement(text: string, start: number, end: number, replacement: string): string {
  return `${text.slice(0, start)}${replacement}${text.slice(end)}`
}
