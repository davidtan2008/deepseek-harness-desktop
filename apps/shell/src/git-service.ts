import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { GitCommit, GitFileStatus, GitStatus } from '@dhd/shared'

const exec = promisify(execFile)

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', args, { cwd, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
  return stdout
}

export async function gitStatus(cwd: string): Promise<GitStatus> {
  try {
    const root = (await git(cwd, ['rev-parse', '--show-toplevel'])).trim()
    const branchOut = await git(root, ['status', '-sb', '--porcelain=v1'])
    const lines = branchOut.split('\n')
    const header = lines[0] ?? ''
    const detached = header.includes('HEAD (no branch)') || header.startsWith('## HEAD')
    const branchMatch = header.match(/^## ([^.[\s]+)/)
    const ahead = Number(header.match(/ahead (\d+)/)?.[1] ?? 0)
    const behind = Number(header.match(/behind (\d+)/)?.[1] ?? 0)
    const files: GitFileStatus[] = []
    for (const line of lines.slice(1)) {
      if (!line) continue
      const index = line[0] ?? ' '
      const worktree = line[1] ?? ' '
      let rest = line.slice(3)
      let originalPath: string | undefined
      if (rest.includes(' -> ')) {
        const [from, to] = rest.split(' -> ')
        originalPath = from
        rest = to ?? rest
      }
      files.push({ path: rest, index, worktree, originalPath })
    }
    return {
      available: true,
      root,
      branch: detached ? undefined : branchMatch?.[1],
      ahead,
      behind,
      detached,
      files,
    }
  } catch {
    return { available: false, ahead: 0, behind: 0, detached: false, files: [] }
  }
}

export async function gitDiff(cwd: string, file?: string, staged = false): Promise<string> {
  const args = ['diff', '--no-color']
  if (staged) args.push('--cached')
  if (file) args.push('--', file)
  return git(cwd, args)
}

export async function gitStage(cwd: string, files: string[]): Promise<void> {
  await git(cwd, ['add', '--', ...files])
}

export async function gitUnstage(cwd: string, files: string[]): Promise<void> {
  await git(cwd, ['restore', '--staged', '--', ...files])
}

export async function gitCommit(cwd: string, message: string): Promise<void> {
  await git(cwd, ['commit', '-m', message])
}

export async function gitPush(cwd: string): Promise<string> {
  return git(cwd, ['push'])
}

export async function gitPull(cwd: string): Promise<string> {
  return git(cwd, ['pull', '--rebase', '--autostash'])
}

export async function gitCheckout(cwd: string, branch: string): Promise<void> {
  await git(cwd, ['checkout', branch])
}

export async function gitBranches(cwd: string): Promise<string[]> {
  const out = await git(cwd, ['branch', '--list', '--format=%(refname:short)'])
  return out.split('\n').map((s) => s.trim()).filter(Boolean)
}

export async function gitLog(cwd: string, limit = 30): Promise<GitCommit[]> {
  const out = await git(cwd, ['log', `-n${limit}`, '--pretty=format:%H%x09%h%x09%an%x09%ad%x09%s', '--date=iso'])
  return out.split('\n').filter(Boolean).map((line) => {
    const [hash, short, author, date, ...rest] = line.split('\t')
    return { hash: hash ?? '', short: short ?? '', author: author ?? '', date: date ?? '', subject: rest.join('\t') }
  })
}

export async function gitClone(url: string, dest: string): Promise<void> {
  await exec('git', ['clone', url, dest], { encoding: 'utf8' })
}
