import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { HarnessApi } from '../apps/shell/dist/harness-api.mjs'
import { HarnessWebSessionPort } from '../apps/shell/dist/harness-web-session-port.mjs'
import { UpstreamHostIpcConnection } from '../apps/shell/dist/host-ipc-driver.mjs'

function completionEvents() {
  return [
    { type: 'message_start', message: { id: 'dhd-smoke-response', model: 'mock-model', usage: { input_tokens: 4, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: 'native Session turn completed' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
    { type: 'message_stop' },
  ]
}

const root = process.cwd()
const harness = resolve(root, 'harness')
const runtimeDir = resolve(harness, 'apps/desktop/.desktop-build/development/project')
const primaryRuntime = resolve(harness, 'apps/desktop/.desktop-build/targets/mac-arm64/runtime/primary-runtime')
const entry = resolve(harness, 'apps/desktop-host/lib/index.js')
for (const [label, path] of [['desktop-host', entry], ['development project', runtimeDir], ['primary runtime', primaryRuntime]]) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}; run the Harness Desktop build first`)
}
const temp = await mkdtemp(join(tmpdir(), 'dhd-native-turn-'))
const workspace = join(temp, 'workspace')
await mkdir(workspace)

const provider = createServer((request, response) => {
  let body = ''
  request.setEncoding('utf8')
  request.on('data', (chunk) => { body += chunk })
  request.on('end', () => {
    try {
      const parsed = JSON.parse(body)
      const userText = (parsed.messages ?? []).flatMap((message) => message.content ?? [])
        .filter((part) => part.type === 'text').map((part) => part.text).join('\n')
      assert.match(userText, /native Session context marker/)
    } catch (error) {
      response.writeHead(500)
      response.end(String(error))
      return
    }
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    for (const event of completionEvents()) response.write(`data: ${JSON.stringify(event)}\n\n`)
    response.end()
  })
})
await new Promise((resolveListen) => provider.listen(0, '127.0.0.1', resolveListen))
const providerAddress = provider.address()
assert.notEqual(providerAddress, null)
assert.equal(typeof providerAddress, 'object')

let sessionPort
const connection = new UpstreamHostIpcConnection({
  node: process.execPath,
  entry,
  runtimeDir,
  projectDir: runtimeDir,
  primaryRuntime,
  environment: {
    DSH_HOME: join(temp, 'dsh'),
    DSH_AGENTS_HOME: join(temp, 'agents'),
    DEEPSEEK_API_KEY: 'dhd-smoke-key',
    DEEPSEEK_BASE_URL: `http://127.0.0.1:${providerAddress.port}`,
  },
  readyTimeoutMs: 90_000,
})

try {
  const ready = await connection.start()
  const launch = new URL(ready.url)
  const api = new HarnessApi(launch.origin, launch.searchParams.get('token') ?? '')
  const created = await api.call('session', 'create', { cwd: workspace })
  sessionPort = new HarnessWebSessionPort({ api, sessionId: created.sessionId })
  const events = []
  let resolveTurn
  let rejectTurn
  const turnDone = new Promise((resolveDone, rejectDone) => { resolveTurn = resolveDone; rejectTurn = rejectDone })
  sessionPort.subscribe((event) => {
    events.push(event)
    if (event.type === 'turn-completed') resolveTurn()
    if (event.type === 'turn-failed') rejectTurn(new Error(event.message))
  })
  await sessionPort.connect()
  await sessionPort.sendTurn({
    turnId: 'native-turn-1',
    text: 'Reply to this native Session smoke.',
    context: [{ kind: 'selection', path: 'README.md', text: 'native Session context marker' }],
  })
  await Promise.race([
    turnDone,
    new Promise((_, reject) => setTimeout(() => reject(new Error('native turn did not complete in 45s')), 45_000)),
  ])
  const cursor = sessionPort.cursor
  assert.equal(typeof cursor, 'number')
  const page = await api.call('session', 'page', {
    address: { kind: 'session', sessionId: created.sessionId }, throughSeq: cursor, maxMessages: 50,
  })
  const logText = page.records.flatMap((record) => record.event.data.content ?? [])
    .filter((part) => part.type === 'text').map((part) => part.text).join('\n')
  assert.match(logText, /native Session context marker/)
  assert.match(logText, /Reply to this native Session smoke\./)
  assert.equal(events.some((event) => event.type === 'turn-started'), true)
  assert.equal(events.some((event) => event.type === 'turn-completed'), true)
  console.log('Native upstream Session turn smoke passed (real Harness loop + mock provider + Session log).')
} finally {
  await sessionPort?.dispose()
  await connection.stop()
  await new Promise((resolveClose) => provider.close(() => resolveClose()))
  await rm(temp, { recursive: true, force: true })
}
