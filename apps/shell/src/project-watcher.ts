import { watch, type FSWatcher } from 'node:fs'
import { lstat, readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { IGNORED_DIR_NAMES } from '@dhd/shared'

export type ProjectChangeType = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
export type ProjectChangeHandler = (path: string, type: ProjectChangeType) => void

export interface ProjectWatcher {
  close: () => void
}

const MAX_DEPTH = 8

function isIgnored(path: string): boolean {
  return path.split(/[\\/]/).some((part) => IGNORED_DIR_NAMES.has(part))
}

function exceedsDepth(root: string, path: string): boolean {
  const pathFromRoot = relative(root, path)
  return pathFromRoot.split(sep).length > MAX_DEPTH + 1
}

function safeEmit(handler: ProjectChangeHandler, path: string, type: ProjectChangeType): void {
  if (isIgnored(path)) return
  try {
    handler(path, type)
  } catch (error) {
    console.warn('[watch] change handler failed:', error)
  }
}

/**
 * Fallback for platforms without recursive fs.watch. It watches directories,
 * not files, so a large repository does not consume one descriptor per file.
 */
class DirectoryWatcher implements ProjectWatcher {
  private readonly watchers = new Map<string, FSWatcher>()
  private readonly pending = new Set<string>()
  private closed = false

  constructor(private readonly root: string, private readonly handler: ProjectChangeHandler) {
    void this.addDirectory(root, 0)
  }

  close(): void {
    this.closed = true
    for (const watcher of this.watchers.values()) {
      try {
        watcher.close()
      } catch (error) {
        console.warn('[watch] failed to close directory watcher:', error)
      }
    }
    this.watchers.clear()
    this.pending.clear()
  }

  private async addDirectory(directory: string, depth: number): Promise<void> {
    if (this.closed || depth > MAX_DEPTH || isIgnored(directory) || this.watchers.has(directory) || this.pending.has(directory)) return
    this.pending.add(directory)

    let watcher: FSWatcher
    try {
      watcher = watch(directory, { persistent: true }, (_event, filename) => {
        if (this.closed) return
        const name = filename?.toString()
        const path = name ? join(directory, name) : directory
        if (isIgnored(path)) return
        safeEmit(this.handler, path, 'change')
        if (name) void this.refreshPath(path, depth + 1)
      })
    } catch (error) {
      this.pending.delete(directory)
      console.warn(`[watch] cannot watch ${directory}:`, error)
      return
    }

    this.watchers.set(directory, watcher)
    watcher.on('error', (error) => {
      if (!this.closed) console.warn(`[watch] ${directory} failed:`, error)
      this.removeSubtree(directory)
    })

    try {
      const entries = await readdir(directory, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) void this.addDirectory(join(directory, entry.name), depth + 1)
      }
    } catch (error) {
      if (!this.closed) console.warn(`[watch] cannot read ${directory}:`, error)
    } finally {
      this.pending.delete(directory)
    }
  }

  private async refreshPath(path: string, depth: number): Promise<void> {
    if (this.closed) return
    try {
      const info = await lstat(path)
      if (info.isDirectory()) await this.addDirectory(path, depth)
    } catch {
      this.removeSubtree(path)
    }
  }

  private removeSubtree(path: string): void {
    const prefix = `${path}${sep}`
    for (const [directory, watcher] of this.watchers) {
      if (directory !== path && !directory.startsWith(prefix)) continue
      try {
        watcher.close()
      } catch (error) {
        console.warn('[watch] failed to remove directory watcher:', error)
      }
      this.watchers.delete(directory)
    }
  }
}

/**
 * Watch a project without opening a descriptor for every file. Native
 * recursive watching is one OS watcher on supported platforms; the directory
 * fallback preserves basic change notifications elsewhere.
 */
export function watchProject(root: string, handler: ProjectChangeHandler): ProjectWatcher {
  let closed = false
  let fallback: DirectoryWatcher | undefined
  let native: FSWatcher
  try {
    native = watch(root, { persistent: true, recursive: true }, (_event, filename) => {
      if (closed) return
      const name = filename?.toString()
      const path = name ? join(root, name) : root
      if (exceedsDepth(root, path)) return
      safeEmit(handler, path, 'change')
    })
  } catch (error) {
    console.warn('[watch] recursive fs.watch unavailable, using directory fallback:', error)
    return new DirectoryWatcher(root, handler)
  }

  native.on('error', (error) => {
    if (closed) return
    console.warn('[watch] recursive watcher failed, using directory fallback:', error)
    try {
      native.close()
    } catch {
      // The native watcher is already unusable.
    }
    fallback ??= new DirectoryWatcher(root, handler)
  })

  return {
    close: () => {
      if (closed) return
      closed = true
      try {
        native.close()
      } catch (error) {
        console.warn('[watch] failed to close recursive watcher:', error)
      }
      fallback?.close()
    },
  }
}
