import { spawn } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'
import { createInterface } from 'node:readline'
import { IGNORED_DIR_NAMES, type FileSearchHit } from '@dhd/shared'

export interface SearchCallbacks {
  /** Periodic live hit count while the search is running. */
  onProgress?: (count: number) => void
}

interface RunningSearch {
  cancel: () => void
}

const running = new Map<string, RunningSearch>()

let rgProbe: string | undefined | null = null

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * ripgrep is not on PATH for GUI launches; probe the common install locations
 * plus PATH once per process. Returns undefined when no usable binary exists.
 */
function resolveRg(): string | undefined {
  if (rgProbe !== null) return rgProbe
  const exe = process.platform === 'win32' ? 'rg.exe' : 'rg'
  const candidates = [
    process.env.RIPGREP_PATH,
    join(homedir(), '.cargo', 'bin', exe),
    '/opt/homebrew/bin/rg',
    '/usr/local/bin/rg',
    '/usr/bin/rg',
    '/bin/rg',
    ...(process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':').map((d) => join(d, exe)),
  ].filter((c): c is string => Boolean(c))
  rgProbe = candidates.find(isExecutable)
  return rgProbe
}

/** Glob excludes shared by --files and content search, derived from the shared ignore list. */
function rgExcludes(): string[] {
  return [...IGNORED_DIR_NAMES].flatMap((name) => ['-g', `!${name}/**`])
}

export async function listFiles(root: string, query = '', limit = 200): Promise<string[]> {
  const needle = query.trim().toLowerCase()
  const rg = resolveRg()
  if (rg) {
    const args = ['--files', ...rgExcludes(), root]
    const out = await collectLines(rg, args, (lines) => {
      const filtered = needle
        ? lines.filter((line) => relative(root, line).toLowerCase().includes(needle))
        : lines
      return filtered.length >= limit
    })
    const hits = out
      .filter((line) => !needle || relative(root, line).toLowerCase().includes(needle))
      .slice(0, limit)
    if (hits.length > 0 || out.length > 0) return hits
    // rg with no output may mean an empty project or unreadable root; fall through
  }
  return walkList(root, needle, limit)
}

async function walkList(root: string, needle: string, limit: number): Promise<string[]> {
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

interface RgMatchEvent {
  type: 'match'
  data: {
    path: { text: string }
    line_number?: number
    submatches?: { match: { text: string }; start: number }[]
    lines?: { text: string }
  }
}

/**
 * Stream `rg --json` matches, invoking the throttled progress callback and
 * stopping at `limit`. Resolves with partial results when cancelled through
 * `cancelSearch(requestId)`.
 */
export async function searchContent(
  root: string,
  query: string,
  requestId: string,
  cb?: SearchCallbacks,
  limit = 200,
): Promise<FileSearchHit[]> {
  const needle = query.trim()
  if (!needle) return []
  running.get(requestId)?.cancel()

  const hits: FileSearchHit[] = []
  let cancelled = false
  let child: ReturnType<typeof spawn> | undefined

  const done = new Promise<FileSearchHit[]>((resolve) => {
    const finish = (): void => {
      running.delete(requestId)
      resolve(hits)
    }
    running.set(requestId, {
      cancel: () => {
        cancelled = true
        try { child?.kill() } catch { /* already gone */ }
        finish()
      },
    })

    const rg = resolveRg()
    if (!rg) {
      void walkSearch(root, needle, limit, () => cancelled, (count) => cb?.onProgress?.(count))
        .then((walked) => {
          hits.push(...walked)
          finish()
        })
      return
    }

    const args = [
      '--json', '--no-messages', '--hidden', '-g', '!.git', '-S', '-F',
      '--max-filesize', '4M',
      ...rgExcludes(),
      '--', needle, root,
    ]
    child = spawn(rg, args, { stdio: ['ignore', 'pipe', 'ignore'] })
    const rl = createInterface({ input: child.stdout! })

    let lastReport = 0
    rl.on('line', (line) => {
      if (cancelled || hits.length >= limit) return
      let event: RgMatchEvent
      try {
        event = JSON.parse(line) as RgMatchEvent
      } catch {
        return
      }
      if (event.type !== 'match' || event.data.line_number === undefined) return
      const text = event.data.lines?.text ?? ''
      const sub = event.data.submatches?.[0]
      hits.push({
        path: event.data.path.text,
        line: event.data.line_number,
        column: (sub?.start ?? 0) + 1,
        preview: text.trim().slice(0, 240),
      })
      const now = Date.now()
      if (cb?.onProgress && now - lastReport > 250) {
        lastReport = now
        cb.onProgress(hits.length)
      }
      if (hits.length >= limit) {
        try { child?.kill() } catch { /* already gone */ }
      }
    })
    child.on('exit', () => {
      rl.close()
      finish()
    })
    child.on('error', () => {
      try { rl.close() } catch { /* noop */ }
      finish()
    })
  })

  const result = await done
  cb?.onProgress?.(result.length)
  return result
}

export function cancelSearch(requestId: string): void {
  running.get(requestId)?.cancel()
  running.delete(requestId)
}

/** Collect stdout lines until the child exits; `earlyExit` may stop collection early. */
function collectLines(
  command: string,
  args: string[],
  earlyExit?: (lines: string[]) => boolean,
): Promise<string[]> {
  return new Promise((resolve) => {
    const lines: string[] = []
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] })
    } catch {
      resolve([])
      return
    }
    const rl = createInterface({ input: child.stdout! })
    rl.on('line', (line) => {
      lines.push(line)
      if (earlyExit?.(lines) === true) {
        try { child.kill() } catch { /* already gone */ }
      }
    })
    child.on('exit', () => {
      rl.close()
      resolve(lines)
    })
    child.on('error', () => {
      try { rl.close() } catch { /* noop */ }
      resolve([])
    })
  })
}

async function walkSearch(
  root: string,
  needle: string,
  limit: number,
  isCancelled: () => boolean,
  onProgress?: (count: number) => void,
): Promise<FileSearchHit[]> {
  const hits: FileSearchHit[] = []
  const lower = needle.toLowerCase()
  const directories = [root]
  let reported = 0

  while (directories.length > 0 && hits.length < limit && !isCancelled()) {
    const dir = directories.shift()!
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (hits.length >= limit || isCancelled()) return hits
      if (IGNORED_DIR_NAMES.has(entry.name) || entry.name === '.git') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        directories.push(full)
        continue
      }
      try {
        const s = await stat(full)
        if (s.size > 4_000_000) continue
        const text = await readFile(full, 'utf8')
        const lines = text.split('\n')
        for (let i = 0; i < lines.length; i += 1) {
          const line = lines[i] ?? ''
          const idx = line.toLowerCase().indexOf(lower)
          if (idx >= 0) {
            hits.push({ path: full, line: i + 1, column: idx + 1, preview: line.trim().slice(0, 240) })
            if (hits.length >= limit) return hits
          }
        }
      } catch {
        // binary or unreadable
      }
    }
    if (onProgress && hits.length - reported >= 20) {
      reported = hits.length
      onProgress(hits.length)
    }
  }
  return hits
}
