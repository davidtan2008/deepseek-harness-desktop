import assert from 'node:assert/strict'
import { projectChanges } from '../packages/shared/dist/change-projection.js'

const projection = projectChanges([
  { path: 'src/agent.ts', beforeHash: 'a', afterHash: 'b', source: 'agent', turnId: 'turn-1', observedAt: '2026-09-24T00:00:00Z' },
  { path: 'src/agent.ts', beforeHash: 'b', afterHash: 'c', source: 'user', observedAt: '2026-09-24T00:00:01Z' },
  { path: 'README.md', beforeHash: 'old', afterHash: 'new', source: 'formatter', observedAt: '2026-09-24T00:00:02Z' },
  { path: 'src/revert.ts', beforeHash: 'same', afterHash: 'changed', source: 'agent', turnId: 'turn-2', observedAt: '2026-09-24T00:00:03Z' },
  { path: 'src/revert.ts', beforeHash: 'changed', afterHash: 'same', source: 'agent', turnId: 'turn-2', observedAt: '2026-09-24T00:00:04Z' },
])

assert.deepEqual(projection.changes.map((change) => change.path), ['README.md', 'src/agent.ts', 'src/revert.ts'])
const agentConflict = projection.changes.find((change) => change.path === 'src/agent.ts')
assert.equal(agentConflict.status, 'conflict')
assert.equal(agentConflict.source, 'mixed')
assert.deepEqual(agentConflict.turnIds, ['turn-1'])
assert.equal(agentConflict.reloadSuggested, true)
assert.equal(projection.conflicts.length, 1)
const formatter = projection.changes.find((change) => change.path === 'README.md')
assert.equal(formatter.status, 'external')
const reverted = projection.changes.find((change) => change.path === 'src/revert.ts')
assert.equal(reverted.status, 'reverted')
assert.equal(reverted.conflict, false)
assert.throws(() => projectChanges([{ path: '../escape', beforeHash: null, afterHash: 'x', source: 'user', observedAt: 'now' }]), /unsafe projected path/)

console.log('Change projection contract check passed.')
