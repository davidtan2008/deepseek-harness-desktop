import { spawn } from 'node:child_process'
import { constants as osConstants } from 'node:os'
import { createRequire } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'

const require = createRequire(import.meta.url)
const electronBin = require('electron')
const url = process.env.ELECTRON_RENDERER_URL ?? 'http://127.0.0.1:5173'

async function waitForRenderer() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(500) })
      if (res.ok || res.status === 404) return
    } catch {
      await delay(250)
    }
  }
  throw new Error(`Workbench did not start at ${url}`)
}

await waitForRenderer()
const child = spawn(electronBin, ['./dist/main.js'], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RENDERER_URL: url },
})
let stopping = false
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    if (stopping) {
      try { child.kill('SIGKILL') } catch { /* already gone */ }
      return
    }
    stopping = true
    try { child.kill(signal) } catch { /* already gone */ }
  })
}
child.on('error', (error) => {
  console.error(`[shell] Electron launch failed: ${error.message}`)
  process.exit(1)
})
child.on('close', (code, signal) => {
  if (signal) {
    const signalNumber = osConstants.signals[signal]
    process.exit(128 + (signalNumber ?? 1))
  }
  process.exit(code ?? 1)
})
