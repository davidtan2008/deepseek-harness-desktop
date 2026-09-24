import { copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = dirname(fileURLToPath(import.meta.url))
const src = join(root, '../src')
const outdir = join(root, '../dist')

await build({
  absWorkingDir: join(root, '..'),
  entryPoints: [join(src, 'main.ts')],
  outfile: join(outdir, 'main.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external: ['electron', 'electron-updater', 'node-pty', 'ws', 'yaml'],
})

await build({
  absWorkingDir: join(root, '..'),
  entryPoints: [join(src, 'preload.ts')],
  outfile: join(outdir, 'preload.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: true,
  external: ['electron'],
})

await build({
  absWorkingDir: join(root, '..'),
  entryPoints: [join(src, 'agent/host-ipc-driver.ts')],
  outfile: join(outdir, 'host-ipc-driver.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
})

await build({
  absWorkingDir: join(root, '..'),
  entryPoints: [join(src, 'agent/harness-web-session-port.ts')],
  outfile: join(outdir, 'harness-web-session-port.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external: ['ws'],
})

await build({
  absWorkingDir: join(root, '..'),
  entryPoints: [join(src, 'agent-runtime.ts')],
  outfile: join(outdir, 'agent-runtime.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external: ['ws'],
})

await build({
  absWorkingDir: join(root, '..'),
  entryPoints: [join(src, 'harness-api.ts')],
  outfile: join(outdir, 'harness-api.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
})

copyFileSync(join(root, 'pty-bridge.py'), join(outdir, 'pty-bridge.py'))
console.log('shell build ok')
