import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { UpstreamHostIpcConnection } from '../apps/shell/dist/host-ipc-driver.mjs'
import { HarnessApi } from '../apps/shell/dist/harness-api.mjs'
import { HarnessWebSessionPort } from '../apps/shell/dist/harness-web-session-port.mjs'

const root = process.cwd()
const harness = resolve(root, 'harness')
const runtimeDir = resolve(harness, 'apps/desktop/.desktop-build/development/project')
const projectDir = runtimeDir
const primaryRuntime = resolve(harness, 'apps/desktop/.desktop-build/targets/mac-arm64/runtime/primary-runtime')
const entry = resolve(harness, 'apps/desktop-host/lib/index.js')
for (const [label, path] of [['desktop-host', entry], ['development project', runtimeDir], ['primary runtime', primaryRuntime]]) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}; run the Harness Desktop build first`)
}

const dshHome = await mkdtemp(join(tmpdir(), 'dhd-upstream-ipc-home-'))
let sessionPort
const connection = new UpstreamHostIpcConnection({
  node: process.execPath,
  entry,
  runtimeDir,
  projectDir,
  primaryRuntime,
  environment: { DSH_HOME: dshHome },
  readyTimeoutMs: 90_000,
})
try {
  const ready = await connection.start()
  assert.equal(new URL(ready.url).hostname, '127.0.0.1')
  assert.equal(await connection.updateTasks('inspect'), false)
  const launch = new URL(ready.url)
  const api = new HarnessApi(launch.origin, launch.searchParams.get('token') ?? '')
  const created = await api.call('session', 'create', { cwd: process.cwd() })
  assert.equal(typeof created.sessionId, 'string')
  sessionPort = new HarnessWebSessionPort({ api, sessionId: created.sessionId })
  await sessionPort.connect()
  assert.equal(sessionPort.capabilities.contextInjection, 'structured')
  console.log('Upstream Host IPC smoke passed (ready + update-tasks + Session follow + lifecycle).')
} finally {
  await sessionPort?.dispose()
  await connection.stop()
  await rm(dshHome, { recursive: true, force: true })
}
