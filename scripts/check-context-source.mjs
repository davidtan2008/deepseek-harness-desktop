import assert from 'node:assert/strict'
import { buildContextBundle, ContextBundleError } from '../packages/shared/dist/context-source.js'

const bundle = buildContextBundle([
  { kind: 'selection', path: 'src/app.ts', text: 'const value = 1' },
  { kind: 'git-diff', path: 'src/app.ts', text: '@@ -1 +1 @@' },
])
assert.equal(bundle.items.length, 2)
assert.match(bundle.canonical, /\[selection:src\/app\.ts\]/)
assert.equal(bundle.canonical.includes('const value = 1'), true)
assert.equal(bundle.byteLength, new TextEncoder().encode(bundle.canonical).byteLength)
assert.throws(() => buildContextBundle([{ kind: 'file', path: '../escape', text: 'x' }]), ContextBundleError)
assert.throws(() => buildContextBundle([{ kind: 'selection', path: 'a.ts', text: 'x' }], 1), /context exceeds/)
assert.throws(() => buildContextBundle([], 0), /maxBytes/)

console.log('Context source contract check passed.')
