import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import type { ProjectTestResult } from '@dhd/shared'

const OUTPUT_LIMIT = 256 * 1024
const TEST_TIMEOUT_MS = 120_000
const active = new Map<number, ChildProcess>()
const electronProcess = process as NodeJS.Process & { resourcesPath?: string }

function isPackaged(): boolean {
  return typeof electronProcess.resourcesPath === 'string' && electronProcess.resourcesPath.length > 0
}

function packagedRuntimePath(...parts: string[]): string {
  if (!isPackaged()) throw new Error('packaged runtime path requested outside Electron')
  return join(electronProcess.resourcesPath as string, 'runtime', ...parts)
}

function testEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, CI: '1' }
  if (isPackaged()) {
    const bundledBin = packagedRuntimePath('bin')
    environment.PATH = `${bundledBin}${delimiter}${environment.PATH ?? ''}`
  }
  return environment
}

function which(command: string): string | undefined {
  const path = process.env.PATH ?? ''
  const extensions = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : ['']
  for (const directory of path.split(process.platform === 'win32' ? ';' : ':')) {
    for (const extension of extensions) {
      const candidate = join(directory, `${command}${extension}`)
      if (existsSync(candidate)) return candidate
    }
  }
  return undefined
}

function signal(child: ChildProcess, signalName: NodeJS.Signals): void {
  if (process.platform !== 'win32' && child.pid !== undefined) {
    try {
      process.kill(-child.pid, signalName)
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      return
    }
  }
  try { child.kill(signalName) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}

function packageCommand(): { command: string; args: string[]; label: 'pnpm' | 'npm' } {
  if (isPackaged()) {
    return {
      command: packagedRuntimePath('bin', process.platform === 'win32' ? 'node.exe' : 'node'),
      args: [packagedRuntimePath('pnpm', 'bin', 'pnpm.mjs'), '--pm-on-fail=ignore', 'test'],
      label: 'pnpm',
    }
  }
  const pnpm = which('pnpm')
  if (pnpm !== undefined) return { command: pnpm, args: ['test'], label: 'pnpm' }
  const npm = which('npm')
  if (npm !== undefined) return { command: npm, args: ['test'], label: 'npm' }
  throw new Error('neither pnpm nor npm is available to run project tests')
}

/** Run the project's fixed test command with bounded output and an explicit timeout. */
export function runProjectTests(cwd: string, owner: number): Promise<ProjectTestResult> {
  if (!existsSync(cwd)) return Promise.reject(new Error(`project directory does not exist: ${cwd}`))
  if (active.has(owner)) return Promise.reject(new Error('a project test run is already active for this window'))
  const selected = packageCommand()
  const child = spawn(selected.command, selected.args, {
    cwd,
    env: testEnvironment(),
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  active.set(owner, child)
  return new Promise<ProjectTestResult>((resolve, reject) => {
    let output = ''
    let timedOut = false
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    const append = (chunk: Buffer): void => {
      output = `${output}${chunk.toString('utf8')}`.slice(-OUTPUT_LIMIT)
    }
    const finish = (result: ProjectTestResult | Error): void => {
      if (settled) return
      settled = true
      if (timeout !== undefined) clearTimeout(timeout)
      if (active.get(owner) === child) active.delete(owner)
      if (result instanceof Error) reject(result)
      else resolve(result)
    }
    child.stdout?.on('data', append)
    child.stderr?.on('data', append)
    child.once('error', (error) => finish(error))
    child.once('close', (code) => finish({
      command: selected.label,
      exitCode: code,
      output,
      timedOut,
    }))
    timeout = setTimeout(() => {
      timedOut = true
      try { signal(child, 'SIGTERM') } catch { /* already gone */ }
      setTimeout(() => {
        try { signal(child, 'SIGKILL') } catch { /* already gone */ }
      }, 2_000).unref()
    }, TEST_TIMEOUT_MS)
  })
}

/** Cancel all test children owned by the desktop process. */
export function stopProjectTests(): Promise<void> {
  const children = [...active.values()]
  for (const child of children) {
    try { signal(child, 'SIGTERM') } catch { /* already gone */ }
  }
  return new Promise((resolve) => {
    if (children.length === 0) {
      resolve()
      return
    }
    let remaining = children.length
    const done = (): void => {
      remaining -= 1
      if (remaining === 0) resolve()
    }
    for (const child of children) {
      if (child.exitCode !== null || child.signalCode !== null) {
        done()
        continue
      }
      child.once('close', done)
      setTimeout(() => {
        try { signal(child, 'SIGKILL') } catch { /* already gone */ }
      }, 2_000).unref()
    }
  })
}

export function cancelProjectTests(owner: number): void {
  const child = active.get(owner)
  if (child === undefined) return
  try { signal(child, 'SIGTERM') } catch { /* already gone */ }
}
