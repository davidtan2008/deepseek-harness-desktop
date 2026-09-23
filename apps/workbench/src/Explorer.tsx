import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, File, Folder } from 'lucide-react'
import type { FileEntry } from '@dhd/shared'
import { dhd } from './lib'
import { useApp } from './state'

function Node({ entry, depth, active }: { entry: FileEntry; depth: number; active?: string }) {
  const app = useApp()
  const [open, setOpen] = useState(depth < 1)
  const [children, setChildren] = useState<FileEntry[]>()
  const [menu, setMenu] = useState<{ x: number; y: number }>()

  useEffect(() => {
    if (entry.isDirectory && open && !children) {
      void dhd().fs.readDir(entry.path).then(setChildren)
    }
  }, [children, entry.isDirectory, entry.path, open])

  return (
    <div>
      <div
        className={`tree-item ${active === entry.path ? 'active' : ''}`}
        style={{ ['--depth' as string]: depth }}
        onClick={() => {
          if (entry.isDirectory) setOpen((v) => !v)
          else void app.openFile(entry.path)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY })
        }}
      >
        <span className="indent" />
        {entry.isDirectory ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span style={{ width: 14 }} />}
        {entry.isDirectory ? <Folder size={14} /> : <File size={14} />}
        <span className="name">{entry.name}</span>
      </div>
      {open && children?.map((child) => (
        <Node key={child.path} entry={child} depth={depth + 1} active={active} />
      ))}
      {menu && (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onMouseLeave={() => setMenu(undefined)}>
          <button onClick={() => void app.openFile(entry.path)}>打开</button>
          <button onClick={() => void dhd().fs.reveal(entry.path)}>在访达 / 资源管理器中显示</button>
          <button onClick={async () => {
            const name = window.prompt('新文件名', 'untitled.ts')
            if (!name) return
            const dir = entry.isDirectory ? entry.path : entry.path.replace(/[\\/][^\\/]+$/, '')
            await dhd().fs.createFile(`${dir}/${name}`)
            setChildren(undefined)
          }}>新建文件</button>
          <button onClick={async () => {
            const name = window.prompt('新文件夹', 'folder')
            if (!name) return
            const dir = entry.isDirectory ? entry.path : entry.path.replace(/[\\/][^\\/]+$/, '')
            await dhd().fs.mkdir(`${dir}/${name}`)
            setChildren(undefined)
          }}>新建文件夹</button>
          <button onClick={async () => {
            if (!window.confirm(`删除 ${entry.name}？`)) return
            await dhd().fs.remove(entry.path)
            setChildren(undefined)
          }}>删除</button>
        </div>
      )}
    </div>
  )
}

export function Explorer() {
  const app = useApp()
  const [roots, setRoots] = useState<FileEntry[]>([])

  useEffect(() => {
    if (!app.projectPath) return
    void dhd().fs.readDir(app.projectPath).then(setRoots)
    return dhd().on('fs:changed', () => {
      void dhd().fs.readDir(app.projectPath!).then(setRoots)
    })
  }, [app.projectPath])

  if (!app.projectPath) return <div className="empty">打开一个文件夹</div>
  return (
    <div>
      {roots.map((entry) => (
        <Node key={entry.path} entry={entry} depth={0} active={app.activePath} />
      ))}
    </div>
  )
}
