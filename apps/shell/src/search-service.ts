import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { accessSync, constants, statSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'
import { createInterface } from 'node:readline'
import { IGNORED_DIR_NAMES, type FileSearchHit } from '@dhd/shared'
import { packagedRipgrepPath } from './paths.ts'

export interface SearchCallbacks {
  /** Periodic live hit count while the search is running. */
  onProgress?: (count: number) => void
}

interface RunningSearch {
  cancel: () => void
}

const running = new Map<string, RunningSearch>()
const activeChildren = new Set<ChildProcess>()

let rgProbe: string | undefined | null = null

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return statSync(path).isFile()
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
  if (app.isPackaged) {
    rgProbe = isExecutable(packagedRipgrepPath()) ? packagedRipgrepPath() : undefined
    return rgProbe
  }
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
    const matches = (line: string): boolean =>
      !needle || relative(root, line).toLowerCase().includes(needle)
    let matched = 0
    const out = await collectLines(rg, ['--no-config', '--files', ...rgExcludes(), root], (line) => {
      if (matches(line)) matched += 1
      return matched >= limit
    })
    const hits = out.filter(matches).slice(0, limit)
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
  running.get(requestId)?.cancel()
  if (!needle) return []

  const hits: FileSearchHit[] = []
  let cancelled = false
  let child: ChildProcess | undefined
  let fallbackStarted = false
  let processFailed = false
  let limitReached = false

  const done = new Promise<FileSearchHit[]>((resolve) => {
    let finished = false
    const finish = (): void => {
      if (finished) return
      finished = true
      running.delete(requestId)
      resolve(hits)
    }
    const fallback = (): void => {
      if (fallbackStarted || cancelled) return
      fallbackStarted = true
      if (child) activeChildren.delete(child)
      void walkSearch(root, needle, limit, () => cancelled, (count) => cb?.onProgress?.(count))
        .then((walked) => {
          if (!cancelled) {
            hits.length = 0
            hits.push(...walked)
          }
          finish()
        })
        .catch((error: unknown) => {
          console.warn('[search] JavaScript fallback failed:', error)
          finish()
        })
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
      fallback()
      return
    }

    const args = [
      '--no-config', '--json', '--no-messages', '--hidden', '-g', '!.git', '-S', '-F',
      '--max-filesize', '4M',
      ...rgExcludes(),
      '--', needle, root,
    ]
    try {
      child = spawn(rg, args, { stdio: ['ignore', 'pipe', 'ignore'] })
    } catch (error) {
      console.warn('[search] ripgrep could not start; using JavaScript fallback:', error)
      fallback()
      return
    }

    const activeChild = child
    activeChildren.add(activeChild)
    const stdout = activeChild.stdout
    if (!stdout) {
      activeChildren.delete(activeChild)
      try { activeChild.kill() } catch { /* already gone */ }
      console.warn('[search] ripgrep returned no stdout; using JavaScript fallback')
      fallback()
      return
    }
    let rl: ReturnType<typeof createInterface>
    try {
      rl = createInterface({ input: stdout })
    } catch (error) {
      activeChildren.delete(activeChild)
      try { activeChild.kill() } catch { /* already gone */ }
      console.warn('[search] could not read ripgrep output; using JavaScript fallback:', error)
      fallback()
      return
    }
    let lastReport = 0

    rl.on('line', (line) => {
      if (cancelled || processFailed || hits.length >= limit) return
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
        limitReached = true
        try { activeChild.kill() } catch { /* already gone */ }
      }
    })

    activeChild.once('exit', (code, signal) => {
      if (!cancelled && !limitReached && (signal !== null || (code !== 0 && code !== 1))) {
        processFailed = true
      }
    })
    activeChild.once('error', (error) => {
      activeChildren.delete(activeChild)
      processFailed = true
      try { rl.close() } catch { /* noop */ }
      try { activeChild.kill() } catch { /* already gone */ }
      if (!cancelled) {
        console.warn('[search] ripgrep failed; using JavaScript fallback:', error)
        fallback()
      }
    })
    activeChild.once('close', () => {
      activeChildren.delete(activeChild)
      try { rl.close() } catch { /* noop */ }
      if (fallbackStarted) return
      if (processFailed && !cancelled) fallback()
      else finish()
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

export async function cancelAllSearches(): Promise<void> {
  for (const requestId of [...running.keys()]) cancelSearch(requestId)
  const children = [...activeChildren]
  for (const child of children) {
    try { child.kill() } catch { /* already gone */ }
  }
  await Promise.all(children.map((child) => new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve()
      return
    }
    const timer = setTimeout(resolve, 750)
    const finish = (): void => {
      clearTimeout(timer)
      child.off('close', finish)
      child.off('error', finish)
      resolve()
    }
    child.once('close', finish)
    child.once('error', finish)
  })))
}

/**
 * Collect stdout lines until the child exits; `shouldStop` receives each new
 * line and may request an early kill by returning true (used for result caps).
 */
function collectLines(
  command: string,
  args: string[],
  shouldStop?: (line: string) => boolean,
): Promise<string[]> {
  return new Promise((resolve) => {
    const lines: string[] = []
    let child: ChildProcess
    try {
      child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] })
    } catch {
      resolve([])
      return
    }
    activeChildren.add(child)
    const stdout = child.stdout
    if (!stdout) {
      activeChildren.delete(child)
      resolve([])
      return
    }
    const rl = createInterface({ input: stdout })
    let stopped = false
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      activeChildren.delete(child)
      try { rl.close() } catch { /* noop */ }
      resolve(lines)
    }
    rl.on('line', (line) => {
      lines.push(line)
      if (!stopped && shouldStop?.(line) === true) {
        stopped = true
        try { child.kill() } catch { /* already gone */ }
      }
    })
    child.once('error', finish)
    child.once('close', finish)
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
