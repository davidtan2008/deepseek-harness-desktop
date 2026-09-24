import assert from 'node:assert/strict'
import { createDesktopCapabilities } from '../packages/shared/dist/capabilities.js'

const base = {
  appVersion: '0.1.0-test',
  externalHost: false,
  packaged: false,
}

const stopped = createDesktopCapabilities({ ...base, host: { status: 'stopped' } })
assert.equal(stopped.host.status, 'stopped')
assert.equal(stopped.features.agent.state, 'unavailable')
assert.equal(stopped.surface, 'managed-iframe')

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
assert.equal(external.host.managed, false)

const packaged = createDesktopCapabilities({ ...base, packaged: true, host: { status: 'ready', url: 'http://127.0.0.1:1/?token=x', origin: 'http://127.0.0.1:1', token: 'x' } })
assert.equal(packaged.features.updates.state, 'degraded')
assert.match(packaged.features.updates.detail ?? '', /签名/)

console.log('Capability contract check passed.')
