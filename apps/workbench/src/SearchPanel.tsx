import { useState } from 'react'
import type { FileSearchHit } from '@dhd/shared'
import { dhd, basename } from './lib'
import { useApp } from './state'

export function SearchPanel() {
  const app = useApp()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<FileSearchHit[]>([])
  const [files, setFiles] = useState<string[]>([])

  async function run() {
    if (!app.projectPath || !query.trim()) return
    const [content, names] = await Promise.all([
      dhd().search.content(app.projectPath, query),
      dhd().search.files(app.projectPath, query),
    ])
    setHits(content)
    setFiles(names)
  }

  return (
    <div>
      <div className="form">
        <input
          value={query}
          placeholder="搜索文件与内容"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void run() }}
        />
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
