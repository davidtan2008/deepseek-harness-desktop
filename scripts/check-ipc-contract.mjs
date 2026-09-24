import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [protocol, api, preload, ipc, env, windows] = await Promise.all([
  read('packages/shared/src/protocol.ts'),
  read('packages/shared/src/api.ts'),
  read('apps/shell/src/preload.ts'),
  read('apps/shell/src/ipc.ts'),
  read('apps/workbench/src/vite-env.d.ts'),
  read('apps/shell/src/windows.ts'),
])

assert.match(protocol, /'app\.capabilities'/)
assert.match(protocol, /'capabilities:changed'/)
assert.match(protocol, /'agent:event'/)
assert.match(api, /capabilities: \(\) => Promise<DesktopCapabilities>/)
assert.match(api, /agent: \{/)
assert.match(api, /test: \{/)
assert.match(protocol, /'agent\.review'/)
assert.match(preload, /capabilities: \(\) => invoke\('app\.capabilities'\)/)
assert.match(preload, /agent: \{/)
assert.match(ipc, /ipcMain\.handle\('app\.capabilities'/)
const channelBlock = protocol.slice(protocol.indexOf('export type IpcChannel'), protocol.indexOf('export type IpcEventChannel'))
for (const match of channelBlock.matchAll(/'([^']+)'/g)) {
  const channel = match[1]
  assert.match(ipc, new RegExp(`ipcMain\\.handle\\('${channel}'`), `missing Main handler for ${channel}`)
}
assert.doesNotMatch(preload, /\n\s+invoke:\s*\(/)
assert.match(preload, /const eventChannels = new Set<keyof IpcEventMap>/)
assert.match(preload, /'agent:event'/)
assert.doesNotMatch(api, /\n\s+invoke\s*:/)
assert.match(env, /import type \{ DesktopApi \} from '@dhd\/shared'/)
assert.match(windows, /sandbox: true/)
assert.match(windows, /webviewTag: false/)
const host = await read('apps/shell/src/host.ts')
const runtime = await read('apps/shell/src/runtime-manifest.ts')
assert.match(host, /DHD_ALLOW_UNBUNDLED_RUNTIME/)
assert.match(host, /runtime\.bundled\.harness/)
assert.match(host, /harnessRuntimeMismatch/)
assert.match(runtime, /isRuntimeManifest/)

console.log('IPC and preload contract check passed.')
