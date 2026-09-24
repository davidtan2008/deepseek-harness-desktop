import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const child = { current: undefined }
let output = ''

function redact(value) {
  return value.replace(/([?&]token=)[^&\s]+/gu, '$1<redacted>')
}

function remember(chunk) {
  output = `${output}${chunk.toString()}`.slice(-32 * 1024)
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        reject(new Error('could not reserve a local smoke port'))
        return
      }
      const port = address.port
      server.close((error) => error === undefined ? resolvePort(port) : reject(error))
    })
  })
}

async function main() {
  const userData = await mkdtemp(join(tmpdir(), 'dhd-workspace-user-'))
  const dshHome = await mkdtemp(join(tmpdir(), 'dhd-workspace-home-'))
  const project = await mkdtemp(join(tmpdir(), 'dhd-workspace-project-'))
  await mkdir(project, { recursive: true })
  await writeFile(join(project, 'README.md'), '# workspace smoke\n', 'utf8')
  const port = await freePort()
  const environment = {
    ...process.env,
    DHD_USER_DATA: userData,
    DSH_HOME: dshHome,
    DHD_WORKBENCH_PORT: String(port),
    DHD_ALLOW_MULTIPLE: '1',
  }
  const processHandle = spawn(pnpm, ['dev'], {
    cwd: root,
    env: environment,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.current = processHandle
  processHandle.stdout.on('data', remember)
  processHandle.stderr.on('data', remember)

  try {
    const ready = await waitForReady(processHandle)
    const url = new URL(ready)
    const token = url.searchParams.get('token')
    assert.ok(token, 'Host ready URL did not contain a launch token')
    const origin = url.origin
    const cookie = await authenticate(origin, token)
    const first = await rpc(origin, cookie, 'workspace/create', { path: project })
    assert.equal(typeof first.workspace.workspaceId, 'string')
    assert.ok(Array.isArray(first.workspace.sessionIds))
    const sessionId = first.workspace.sessionIds[0] ?? (await rpc(origin, cookie, 'session/create', {
      workspaceId: first.workspace.workspaceId,
    })).sessionId
    assert.equal(typeof sessionId, 'string')
    const second = await rpc(origin, cookie, 'workspace/create', { path: project })
    assert.equal(second.workspace.workspaceId, first.workspace.workspaceId)
    assert.equal(second.created, false)
    assert.equal(second.workspace.sessionIds[0], sessionId)
    console.log('Workspace/session smoke passed (workspace/create is idempotent).')
  } finally {
    await stop(processHandle)
    child.current = undefined
    await Promise.all([
      rm(userData, { recursive: true, force: true }),
      rm(dshHome, { recursive: true, force: true }),
      rm(project, { recursive: true, force: true }),
    ])
  }
}

async function waitForReady(processHandle) {
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const cleanOutput = output.replace(/\u001B\[[0-?]*[ -/]*[@-~]/gu, '')
    const match = cleanOutput.match(/dsh web:\s*(https?:\/\/[^\s]+)/u)
    if (match?.[1]) return match[1]
    if (processHandle.exitCode !== null) throw new Error(`dev exited before Host ready (${processHandle.exitCode})\n${redact(output)}`)
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  throw new Error(`dev did not report Host ready\n${redact(output)}`)
}

async function authenticate(origin, token) {
  const response = await fetch(`${origin}/?token=${encodeURIComponent(token)}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(5_000),
  })
  const pair = (response.headers.getSetCookie?.() ?? [])
    .map((value) => value.split(';', 1)[0] ?? '')
    .find((value) => value.includes('='))
  assert.ok(pair, 'Host did not issue a session cookie')
  return pair
}

async function rpc(origin, cookie, method, request) {
  const rpcId = randomUUID()
  const response = await fetch(`${origin}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId,
      method,
      payload: { args: { request } },
    }),
    signal: AbortSignal.timeout(15_000),
  })
  assert.equal(response.ok, true, `RPC ${method} returned HTTP ${response.status}`)
  const body = await response.json()
  assert.equal(body.type, 'server-response')
  assert.equal(body.rpcId, rpcId)
  assert.equal(body.result.ok, true, `RPC ${method} failed`)
  return body.result.value
}

async function stop(processHandle) {
  if (processHandle.exitCode !== null) return
  const pids = await mainProcessIds(processHandle.pid)
  for (const pid of pids) {
    try { process.kill(pid, 'SIGINT') } catch (error) { if (error.code !== 'ESRCH') throw error }
  }
  if (pids.length === 0) {
    try { process.kill(-processHandle.pid, 'SIGINT') } catch (error) { if (error.code !== 'ESRCH') throw error }
  }
  try {
    await Promise.race([
      new Promise((resolveExit) => processHandle.once('exit', resolveExit)),
      new Promise((resolveTimeout) => setTimeout(resolveTimeout, 20_000)),
    ])
  } catch (error) {
    void error
  }
  if (processHandle.exitCode === null) {
    try { process.kill(-processHandle.pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
    await waitForExit(processHandle, 5_000)
  }
}

async function waitForExit(processHandle, timeout) {
  if (processHandle.exitCode !== null) return
  await Promise.race([
    new Promise((resolveExit) => processHandle.once('exit', resolveExit)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, timeout)),
  ])
}

async function mainProcessIds(rootPid) {
  if (process.platform === 'win32') return []
  try {
    const result = await execFileAsync('ps', ['-axo', 'pid=,ppid=,command='])
    const children = new Map()
    const commands = new Map()
    for (const line of result.stdout.split('\n')) {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/u)
      if (match === null) continue
      const pid = Number(match[1])
      const parent = Number(match[2])
      commands.set(pid, match[3])
      const entries = children.get(parent) ?? []
      entries.push(pid)
      children.set(parent, entries)
    }
    const resultPids = []
    const pending = [rootPid]
    const visited = new Set()
    while (pending.length > 0) {
      const pid = pending.pop()
      if (visited.has(pid)) continue
      visited.add(pid)
      const command = commands.get(pid) ?? ''
      if ((command.includes('apps/shell/dist/main.js') || command.includes('./dist/main.js')) && !command.includes('rg ')) resultPids.push(pid)
      pending.push(...(children.get(pid) ?? []))
    }
    return resultPids
  } catch {
    return []
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
