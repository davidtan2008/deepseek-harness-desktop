import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import WebSocket, { WebSocketServer } from 'ws'
import { HarnessApi } from '../dist/harness-api.mjs'
import { HarnessWebSessionPort } from '../dist/harness-web-session-port.mjs'
import { AgentRuntime } from '../dist/agent-runtime.mjs'

const token = 'agent-session-fixture-token'
const cookie = 'dhd-agent-session-fixture'
let sequence = 0
let turnNumber = 0
let socket
let streamId
let activeTurn
const prompts = []

function sendEvent(event) {
  if (socket === undefined || streamId === undefined || socket.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify({ type: 'item', streamId, value: { type: 'event', event: { ...event, seq: sequence++, time: sequence } } }))
}

function sendTurnStart(requestId, turn) {
  sendEvent({ type: 'turn/start', data: { turn } })
  sendEvent({ type: 'user/message', data: { role: 'user', id: `message-${turn}`, content: [], source: { kind: 'user', rpcId: requestId } } })
  sendEvent({ type: 'tool/call', data: { turn, step: 1, callId: `call-${turn}`, name: 'read', arguments: JSON.stringify({ path: 'README.md' }) } })
  sendEvent({ type: 'approval/asked', data: { id: `approval-${turn}`, toolName: 'read', callId: `call-${turn}`, reason: 'fixture' } })
  sendEvent({ type: 'workspace/changes', data: { turn } })
}

function sendEnd(turn, kind) {
  const reason = kind === 'error' ? { kind, error: { message: 'fixture failure' } } : { kind }
  sendEvent({ type: 'turn/end', data: { turn, reason } })
  if (activeTurn?.turn === turn) activeTurn = undefined
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (request.method === 'GET' && url.pathname === '/') {
    response.writeHead(303, { location: '/', 'set-cookie': `${cookie}=1; Path=/; HttpOnly` })
    response.end()
    return
  }
  if (request.headers.cookie !== `${cookie}=1`) {
    response.writeHead(401)
    response.end()
    return
  }
  if (request.method === 'GET' && url.pathname === '/api/changes.summary') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ turn: Number(url.searchParams.get('turn') ?? 1), files: [{ path: 'src/changed.ts', display: 'src/changed.ts', added: 1, deleted: 0 }], total: 1, added: 1, deleted: 0 }))
    return
  }
  if (request.method === 'GET' && url.pathname === '/api/changes.diff') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ kind: 'text', path: 'src/changed.ts', display: 'src/changed.ts', before: true, after: true, hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-old', '+new'] }], coarse: false }))
    return
  }
  if (request.method !== 'POST' || !url.pathname.startsWith('/api/session/')) {
    response.writeHead(404)
    response.end()
    return
  }
  let body = ''
  for await (const chunk of request) body += chunk
  const envelope = JSON.parse(body)
  const method = url.pathname.slice('/api/session/'.length)
  const requestPayload = envelope.payload.args.request
  if (method === 'prompt') {
    prompts.push(requestPayload)
    const turn = ++turnNumber
    activeTurn = { turn, requestId: requestPayload.requestId }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value: { accepted: true } } }))
    setImmediate(() => {
      sendTurnStart(requestPayload.requestId, turn)
      if (!requestPayload.requestId.endsWith('-2')) setTimeout(() => sendEnd(turn, 'completed'), 10)
    })
    return
  }
  if (method === 'cancel') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value: { accepted: true } } }))
    if (activeTurn !== undefined) setImmediate(() => sendEnd(activeTurn.turn, 'aborted'))
    return
  }
  response.writeHead(404)
  response.end()
})

const webSocketServer = new WebSocketServer({ noServer: true })
webSocketServer.on('connection', (connection) => {
  socket = connection
  connection.on('message', (data) => {
    const message = JSON.parse(data.toString('utf8'))
    if (message.type !== 'open' || message.endpoint !== 'session/follow') return
    streamId = message.streamId
    connection.send(JSON.stringify({
      type: 'item',
      streamId,
      value: { type: 'snapshot', cursor: 0, records: [], hasMore: false },
    }))
  })
})
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (url.pathname !== '/api/remote.mux' || request.headers.cookie !== `${cookie}=1`) {
    socket.destroy()
    return
  }
  webSocketServer.handleUpgrade(request, socket, head, (connection) => webSocketServer.emit('connection', connection, request))
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
assert.notEqual(address, null)
assert.equal(typeof address, 'object')
const origin = `http://127.0.0.1:${address.port}`
const api = new HarnessApi(origin, token)
const port = new HarnessWebSessionPort({ api, sessionId: 'session-fixture' })
const events = []
let runtime
const waitFor = (predicate, label) => new Promise((resolve, reject) => {
  const deadline = Date.now() + 2_000
  const check = () => {
    const found = events.find(predicate)
    if (found !== undefined) return resolve(found)
    if (Date.now() >= deadline) return reject(new Error(`timed out waiting for ${label}`))
    setTimeout(check, 5)
  }
  check()
})

try {
  port.subscribe((event) => events.push(event))
  await port.connect()
  assert.deepEqual(port.capabilities, {
    sendTurn: true,
    cancel: true,
    resume: true,
    subscribe: true,
    contextInjection: 'structured',
    changeProjection: true,
  })
  await port.sendTurn({ turnId: 'turn-1', text: 'complete', context: [{ kind: 'selection', path: 'src/a.ts', text: 'selected' }] })
  await waitFor((event) => event.type === 'turn-completed', 'turn completion')
  await waitFor((event) => event.type === 'change-projection', 'change projection')
  assert.equal(prompts[0].sessionId, 'session-fixture')
  assert.match(prompts[0].content[0].text, /\[dhd-context\]/)
  assert.match(prompts[0].content[0].text, /src\/a\.ts/)
  assert.equal(prompts[0].content[1].text, 'complete')

  await port.sendTurn({ turnId: 'turn-2', text: 'hold', context: [] })
  await waitFor((event) => event.type === 'approval-required' && event.turnId === 'turn-2', 'approval')
  await port.cancel('turn-2')
  await waitFor((event) => event.type === 'turn-cancelled' && event.turnId === 'turn-2', 'cancellation')
  await port.resume('turn-2')
  await waitFor((event) => event.type === 'turn-completed' && event.turnId === 'turn-2', 'resumed completion')
  assert.equal(prompts.length, 3)

  const runtimeEvents = []
  let resolveRuntime
  const runtimeDone = new Promise((resolve) => { resolveRuntime = resolve })
  runtime = new AgentRuntime(
    { getState: () => ({ status: 'ready' }) },
    'session-runtime',
    origin,
    token,
    (event) => {
      runtimeEvents.push(event)
      if (event.type === 'turn-completed') resolveRuntime()
    },
  )
  await runtime.connect()
  assert.equal(runtime.capabilities().id, 'host-ipc')
  assert.equal(runtime.capabilities().managed, false)
  await runtime.sendTurn({ turnId: 'runtime-turn', text: 'runtime smoke', context: [] })
  await Promise.race([
    runtimeDone,
    new Promise((_, reject) => setTimeout(() => reject(new Error('AgentRuntime did not complete')), 2_000)),
  ])
  assert.equal(runtimeEvents.some((event) => event.type === 'turn-started'), true)
  const review = await runtime.review('runtime-turn')
  assert.equal(review.available, true)
  assert.match(review.files[0].diff?.kind ?? '', /text/)
  await runtime.dispose()

  console.log('Harness Web Session port check passed.')
} finally {
  await port.dispose()
  await runtime?.dispose()
  for (const client of webSocketServer.clients) client.terminate()
  await new Promise((resolve) => webSocketServer.close(() => resolve()))
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}
