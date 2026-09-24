import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { AgentTransportUnsupportedError } from '../packages/shared/dist/agent-transport.js'
import { HostIpcTransportDriver, UpstreamHostIpcConnection, UnsupportedAgentSessionPort } from '../apps/shell/dist/host-ipc-driver.mjs'

const fixture = fileURLToPath(new URL('./fixtures/upstream-host-ipc-fixture.mjs', import.meta.url))
const connection = new UpstreamHostIpcConnection({
  node: process.execPath,
  entry: fixture,
  runtimeDir: process.cwd(),
  projectDir: process.cwd(),
  readyTimeoutMs: 10_000,
})
const events = []
const unsubscribe = connection.subscribe((event) => events.push(event.type))
const ready = await connection.start()
assert.match(ready.url, /^http:\/\/127\.0\.0\.1:/u)
assert.equal(await connection.updateTasks('inspect'), false)
assert.deepEqual(events, ['ready', 'update-tasks'])

const driver = new HostIpcTransportDriver(connection, new UnsupportedAgentSessionPort())
const descriptor = await driver.connect()
assert.equal(descriptor.id, 'host-ipc')
assert.equal(descriptor.status, 'ready')
assert.equal(descriptor.capabilities.sendTurn, false)
await assert.rejects(
  () => driver.sendTurn({ turnId: 'turn-1', text: 'hello', context: [] }),
  (error) => error instanceof AgentTransportUnsupportedError || (error?.name === 'AgentTransportUnsupportedError' && error?.code === 'unsupported'),
)
await driver.dispose()
assert.equal(connection.status, 'disconnected')
assert.equal(events.includes('shutdown-complete'), true)
unsubscribe()

console.log('Upstream Host IPC transport check passed.')
