import assert from 'node:assert/strict'
import { AgentTurnController } from '../packages/shared/dist/turn-controller.js'

class FakeDriver {
  constructor() {
    this.listeners = new Set()
    this.calls = []
    this.disposed = false
  }

  capabilities() {
    return { contractVersion: 1, id: 'host-ipc', status: 'ready', managed: true, capabilities: { sendTurn: true, cancel: true, resume: true, subscribe: true, contextInjection: 'structured', changeProjection: true } }
  }

  async connect() {
    return this.capabilities()
  }

  async sendTurn(request) {
    this.calls.push(['sendTurn', request.turnId])
    return { turnId: request.turnId }
  }

  async cancel(turnId) {
    this.calls.push(['cancel', turnId])
  }

  async resume(turnId) {
    this.calls.push(['resume', turnId])
    return { turnId }
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async dispose() {
    this.disposed = true
  }

  emit(event) {
    for (const listener of this.listeners) listener(event)
  }
}

const driver = new FakeDriver()
const controller = new AgentTurnController(driver)
const snapshots = []
const unsubscribe = controller.subscribe((snapshot) => snapshots.push(snapshot))

const request = { turnId: 'turn-1', text: 'inspect the repository', context: [{ kind: 'file', path: 'README.md' }] }
assert.equal((await controller.start(request)).status, 'starting')
driver.emit({ type: 'turn-started', turnId: 'turn-1' })
assert.equal(controller.get('turn-1').status, 'running')
driver.emit({ type: 'tool-call', turnId: 'turn-1', tool: 'read' })
assert.equal(controller.get('turn-1').status, 'running')
driver.emit({ type: 'approval-required', turnId: 'turn-1', approvalId: 'approval-1' })
assert.equal(controller.get('turn-1').status, 'awaiting-approval')
driver.emit({ type: 'turn-completed', turnId: 'turn-1' })
assert.equal(controller.get('turn-1').status, 'completed')
assert.deepEqual(driver.calls[0], ['sendTurn', 'turn-1'])

await controller.start({ ...request, turnId: 'turn-2' })
driver.emit({ type: 'turn-started', turnId: 'turn-2' })
assert.equal((await controller.cancel('turn-2')).status, 'cancelling')
driver.emit({ type: 'turn-cancelled', turnId: 'turn-2' })
assert.equal((await controller.resume('turn-2')).status, 'starting')
driver.emit({ type: 'turn-started', turnId: 'turn-2' })
assert.equal(controller.get('turn-2').status, 'running')
assert.deepEqual(driver.calls.slice(1), [['sendTurn', 'turn-2'], ['cancel', 'turn-2'], ['resume', 'turn-2']])

unsubscribe()
const snapshotCount = snapshots.length
driver.emit({ type: 'turn-completed', turnId: 'turn-2' })
assert.equal(snapshots.length, snapshotCount)
await controller.dispose()
assert.equal(driver.disposed, true)
assert.throws(() => controller.get('turn-1'), /disposed/)

console.log('Turn controller contract check passed.')
