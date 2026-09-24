import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createDesktopCapabilities } from '../packages/shared/dist/capabilities.js'
import { isRuntimeManifest } from '../packages/shared/dist/runtime.js'

const base = {
  appVersion: '0.1.0-test',
  externalHost: false,
  packaged: false,
  runtime: {
    schemaVersion: 3,
    generatedAt: '2026-09-24T00:00:00.000Z',
    mode: 'source',
    desktop: { version: '0.1.0-test', gitCommit: 'test', dirty: false },
    harness: { commit: 'test-harness', version: '0.1.7-alpha.2', packageManager: 'pnpm@11.7.0' },
    node: { version: 'v24.0.0' },
    pnpm: { version: '10.14.0' },
    platform: { name: 'darwin', arch: 'arm64' },
    ripgrep: { available: true, version: 'ripgrep 15.0.0' },
    inventory: { scope: 'desktop-build', complete: true, fileCount: 3, digest: 'a'.repeat(64) },
    bundled: { harness: false, node: false, pnpm: false, ripgrep: false },
    closure: null,
  },
}

assert.equal(isRuntimeManifest(base.runtime), true)
assert.equal(isRuntimeManifest({ ...base.runtime, schemaVersion: 1 }), false)
const closureRuntime = {
  ...base.runtime,
  mode: 'packaged',
  bundled: { harness: true, node: true, pnpm: true, ripgrep: true },
  closure: {
    schemaVersion: 1,
    platform: 'darwin',
    arch: 'arm64',
    harness: { root: 'dsh', entry: 'dsh/lib/bin.js', packageJson: 'dsh/package.json', version: '0.1.7-alpha.2', commit: 'test-harness', packageManager: 'pnpm@11.7.0' },
    node: { path: 'bin/node', version: 'v24.0.0' },
    pnpm: { path: 'pnpm/bin/pnpm.mjs', version: '11.7.0' },
    ripgrep: { path: 'ripgrep/rg', version: 'ripgrep 15.0.0' },
    files: [
      { path: 'dsh/lib/bin.js', bytes: 1, sha256: 'a'.repeat(64), executable: false },
      { path: 'dsh/package.json', bytes: 1, sha256: 'b'.repeat(64), executable: false },
      { path: 'bin/node', bytes: 1, sha256: 'c'.repeat(64), executable: true },
      { path: 'pnpm/bin/pnpm.mjs', bytes: 1, sha256: 'd'.repeat(64), executable: false },
      { path: 'ripgrep/rg', bytes: 1, sha256: 'e'.repeat(64), executable: true },
    ],
  },
}
assert.equal(isRuntimeManifest(closureRuntime), true)
const summarized = createDesktopCapabilities({ ...base, packaged: true, runtime: closureRuntime, host: { status: 'ready' } })
assert.equal(summarized.runtime?.closure?.fileCount, 5)
assert.equal('files' in (summarized.runtime?.closure ?? {}), false)
const generated = JSON.parse(readFileSync('apps/shell/runtime-manifest.json', 'utf8'))
assert.equal(isRuntimeManifest(generated), true)
assert.equal(generated.inventory.scope, 'desktop-build')
assert.equal(Number.isSafeInteger(generated.inventory.fileCount), true)

const stopped = createDesktopCapabilities({ ...base, host: { status: 'stopped' } })
assert.equal(stopped.contractVersion, 2)
assert.equal(stopped.host.status, 'stopped')
assert.equal(stopped.features.agent.state, 'unavailable')
assert.equal(stopped.surface, 'managed-iframe')
assert.equal(stopped.runtime?.mode, 'source')
assert.equal(stopped.agentTransport.id, 'managed-iframe')
assert.equal(stopped.agentTransport.capabilities.sendTurn, false)

const starting = createDesktopCapabilities({ ...base, host: { status: 'starting' } })
assert.equal(starting.features.agent.state, 'degraded')

const ready = createDesktopCapabilities({
  ...base,
  host: { status: 'ready', url: 'http://127.0.0.1:1234/?token=secret', origin: 'http://127.0.0.1:1234', token: 'secret' },
})
assert.equal(ready.features.agent.state, 'available')
assert.equal(ready.host.managed, true)
assert.equal(JSON.stringify(ready).includes('secret'), false)

const external = createDesktopCapabilities({
  ...base,
  externalHost: true,
  host: { status: 'ready', url: 'http://127.0.0.1:1234/?token=secret', origin: 'http://127.0.0.1:1234', token: 'secret' },
})
assert.equal(external.surface, 'external-loopback')
assert.equal(external.agentTransport.id, 'external-loopback')
assert.equal(external.host.managed, false)

const packaged = createDesktopCapabilities({ ...base, packaged: true, host: { status: 'ready', url: 'http://127.0.0.1:1/?token=x', origin: 'http://127.0.0.1:1', token: 'x' } })
assert.equal(packaged.features.updates.state, 'degraded')
assert.match(packaged.features.updates.detail ?? '', /签名/)

console.log('Capability contract check passed.')
