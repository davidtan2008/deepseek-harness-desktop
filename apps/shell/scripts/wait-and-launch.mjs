import { spawn } from 'node:child_process'
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
child.on('exit', (code) => process.exit(code ?? 0))
