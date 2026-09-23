import { execFile } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { promisify } from 'node:util'
import { IGNORED_DIR_NAMES, type FileSearchHit } from '@dhd/shared'

const exec = promisify(execFile)

export async function listFiles(root: string, query = '', limit = 200): Promise<string[]> {
  const needle = query.trim().toLowerCase()
  const out: string[] = []

  async function walk(dir: string): Promise<void> {
    if (out.length >= limit) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (out.length >= limit) return
      if (entry.name.startsWith('.') && entry.name !== '.gitignore' && entry.name !== '.env.example') {
        if (IGNORED_DIR_NAMES.has(entry.name) || entry.name === '.git') continue
      }
      if (IGNORED_DIR_NAMES.has(entry.name)) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
        continue
      }
      const rel = relative(root, full)
      if (!needle || rel.toLowerCase().includes(needle) || entry.name.toLowerCase().includes(needle)) {
        out.push(full)
      }
    }
  }

  await walk(root)
  return out
}

export async function searchContent(root: string, query: string, limit = 200): Promise<FileSearchHit[]> {
  const needle = query.trim()
  if (!needle) return []
  try {
    const { stdout } = await exec('rg', ['-n', '--no-heading', '--color', 'never', '-F', needle, root], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    })
    return stdout.split('\n').filter(Boolean).slice(0, limit).map((line) => {
      const match = line.match(/^(.*?):(\d+):(.*)$/)
      return {
        path: match?.[1] ?? line,
        line: Number(match?.[2] ?? 1),
        column: 1,
        preview: (match?.[3] ?? '').slice(0, 240),
      }
    })
  } catch {
    return walkSearch(root, needle, limit)
  }
}

async function walkSearch(root: string, needle: string, limit: number): Promise<FileSearchHit[]> {
  const hits: FileSearchHit[] = []
  const lower = needle.toLowerCase()

  async function walk(dir: string): Promise<void> {
    if (hits.length >= limit) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (hits.length >= limit) return
      if (IGNORED_DIR_NAMES.has(entry.name) || entry.name === '.git') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
        continue
      }
      try {
        const s = await stat(full)
        if (s.size > 1_000_000) continue
        const text = await readFile(full, 'utf8')
        const lines = text.split('\n')
        for (let i = 0; i < lines.length; i += 1) {
          const line = lines[i] ?? ''
          const idx = line.toLowerCase().indexOf(lower)
          if (idx >= 0) {
            hits.push({ path: full, line: i + 1, column: idx + 1, preview: line.trim().slice(0, 240) })
            if (hits.length >= limit) return
          }
        }
      } catch {
        // binary or unreadable
      }
    }
  }

  await walk(root)
  return hits
}
