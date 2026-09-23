import { dialog, shell } from 'electron'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { FileEntry } from '@dhd/shared'

const BINARY_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'pdf', 'zip', 'gz', 'woff', 'woff2', 'ttf', 'exe', 'dll', 'so', 'dylib', 'bin'])

export async function readDir(dirPath: string): Promise<FileEntry[]> {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const mapped: FileEntry[] = []
  for (const entry of entries) {
    const full = join(dirPath, entry.name)
    let isDirectory = entry.isDirectory()
    if (entry.isSymbolicLink()) {
      try {
        isDirectory = (await stat(full)).isDirectory()
      } catch {
        isDirectory = false
      }
    }
    mapped.push({
      name: entry.name,
      path: full,
      isDirectory,
      isSymbolicLink: entry.isSymbolicLink(),
    })
  }
  mapped.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return mapped
}

export async function readTextFile(filePath: string): Promise<{ text: string; binary: boolean }> {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  if (BINARY_EXT.has(ext)) {
    return { text: '', binary: true }
  }
  const buf = await readFile(filePath)
  if (buf.includes(0)) return { text: '', binary: true }
  return { text: buf.toString('utf8'), binary: false }
}

export async function writeTextFile(filePath: string, text: string): Promise<void> {
  await writeFile(filePath, text, 'utf8')
}

export async function fileStat(filePath: string) {
  const s = await stat(filePath)
  return { isDirectory: s.isDirectory(), size: s.size, mtimeMs: s.mtimeMs }
}

export async function makeDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true })
}

export async function createFile(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, '', { flag: 'wx' })
}

export async function renamePath(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true })
  await rename(from, to)
}

export async function removePath(target: string): Promise<void> {
  await rm(target, { recursive: true, force: true })
}

export async function revealInOs(target: string): Promise<void> {
  shell.showItemInFolder(target)
}

export async function openFolderDialog(): Promise<string | undefined> {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  })
  return result.canceled ? undefined : result.filePaths[0]
}

export async function openFilesDialog(): Promise<string[]> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
  })
  return result.canceled ? [] : result.filePaths
}

export async function saveFileDialog(defaultPath?: string): Promise<string | undefined> {
  const result = await dialog.showSaveDialog({ defaultPath })
  return result.canceled ? undefined : result.filePath
}
