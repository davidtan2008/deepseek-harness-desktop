import { useEffect, useRef, useState } from 'react'
import { randomUUID } from './lib'
import type { FileSearchHit } from '@dhd/shared'
import { dhd, basename } from './lib'
import { useApp } from './state'

export function SearchPanel() {
  const app = useApp()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<FileSearchHit[]>([])
  const [files, setFiles] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string>()
  const requestId = useRef('')
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      if (requestId.current) void dhd().search.cancel(requestId.current)
    }
  }, [])

  useEffect(() => {
    const text = query.trim()
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    if (!app.projectPath || !text) {
      if (requestId.current) void dhd().search.cancel(requestId.current)
      setRunning(false)
      setHits([])
      setFiles([])
      setProgress(0)
      setError(undefined)
      return
    }
    debounceTimer.current = setTimeout(() => { void run(text, app.projectPath) }, 300)
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      if (requestId.current) {
        void dhd().search.cancel(requestId.current)
        requestId.current = ''
      }
    }
  }, [query, app.projectPath])

  async function run(text: string, root = app.projectPath) {
    if (!root || !text) return
    if (requestId.current) void dhd().search.cancel(requestId.current)
    const id = randomUUID()
    requestId.current = id
    setRunning(true)
    setProgress(0)
    setHits([])
    setFiles([])
    setError(undefined)

    const onProgress = dhd().on('search:progress', (event) => {
      if (event.requestId === id && event.phase === 'running') setProgress(event.count)
    })
    try {
      // Content hits are the primary result: render them as soon as they land
      // instead of waiting on the (potentially slower) file-name listing.
      const contentPromise = dhd().search.content(root, text, id).then((content) => {
        if (requestId.current !== id) return
        setHits(content)
        setProgress(content.length)
      })
      const namesPromise = dhd().search.files(root, text).then((names) => {
        if (requestId.current !== id) return
        setFiles(names)
      })
      await Promise.all([contentPromise, namesPromise])
    } catch (err) {
      if (requestId.current === id) {
        setError(err instanceof Error ? err.message : String(err))
        console.error('search failed', err)
      }
    } finally {
      onProgress()
      if (requestId.current === id) {
        setRunning(false)
        requestId.current = ''
      }
    }
  }

  function cancel() {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    if (requestId.current) void dhd().search.cancel(requestId.current)
    setRunning(false)
  }

  return (
    <div>
      <div className="form">
        <input
          value={query}
          placeholder="搜索文件与内容（输入后自动搜索）"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (debounceTimer.current) clearTimeout(debounceTimer.current)
              void run(query.trim())
            }
            if (e.key === 'Escape') cancel()
          }}
        />
        {running && (
          <button className="btn" onClick={cancel}>停止</button>
        )}
      </div>
      <div className="meta" style={{ padding: '4px 8px' }}>
        {error
          ? `搜索失败：${error}`
          : running
            ? `搜索中… 已命中 ${progress} 处`
            : hits.length > 0 || files.length > 0
              ? `${files.length} 个文件 · ${hits.length} 处内容命中`
              : ''}
      </div>
      {files.slice(0, 20).map((file) => (
        <div key={file} className="hit" onClick={() => void app.openFile(file)}>
          {basename(file)}
          <div className="meta">{file}</div>
        </div>
      ))}
      {hits.map((hit) => (
        <div key={`${hit.path}:${hit.line}`} className="hit" onClick={() => void app.openFile(hit.path)}>
          {basename(hit.path)}:{hit.line}
          <div className="meta">{hit.preview}</div>
        </div>
      ))}
    </div>
  )
}
