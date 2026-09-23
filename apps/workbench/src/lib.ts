export function dhd() {
  if (!window.dhd) {
    throw new Error('Desktop bridge is unavailable. Run this UI inside Electron.')
  }
  return window.dhd
}

export function basename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath
}

export function dirname(filePath: string): string {
  const parts = filePath.split(/[\\/]/)
  parts.pop()
  return parts.join('/') || '/'
}

export function joinPath(root: string, ...parts: string[]): string {
  const sep = root.includes('\\') ? '\\' : '/'
  return [root.replace(/[\\/]+$/, ''), ...parts].join(sep)
}

export function fuzzy(query: string, text: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const t = text.toLowerCase()
  if (t.includes(q)) return true
  let i = 0
  for (const ch of t) {
    if (ch === q[i]) i += 1
    if (i >= q.length) return true
  }
  return false
}
