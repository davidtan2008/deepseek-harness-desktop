import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const closureRoot = join(root, 'apps/shell/runtime-closure')
const descriptor = JSON.parse(await readFile(join(closureRoot, 'closure.json'), 'utf8'))
const node = join(closureRoot, descriptor.node.path)
const dsh = join(closureRoot, descriptor.harness.entry)
const profile = join(root, 'packages/desktop-profile/cordis.patch.yml')
const dshHome = await mkdtemp(join(tmpdir(), 'dhd-packaged-host-'))
const child = spawn(node, [dsh, 'web', '--patch', profile, '--no-open', '--port', '0', '--host', '127.0.0.1'], {
  cwd: join(closureRoot, 'dsh'),
  env: {
    ...process.env,
    DSH_HOME: dshHome,
    DHD_DESKTOP: '1',
    PATH: `${join(closureRoot, 'bin')}${delimiter}${process.env.PATH ?? ''}`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
child.stdout.setEncoding('utf8')
child.stderr.setEncoding('utf8')
const append = (chunk) => { output = `${output}${chunk}`.slice(-64 * 1024) }
const diagnostics = () => output.replace(/([?&]token=)[^&\s]+/giu, '$1<redacted>')
child.stdout.on('data', append)
child.stderr.on('data', append)

try {
  await new Promise((resolveReady, rejectReady) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      rejectReady(new Error(`packaged Host did not become ready: ${diagnostics()}`))
    }, 90_000)
    const onData = () => {
      if (settled || !/dsh web:\s*https?:\/\/[^\s]+/u.test(output)) return
      settled = true
      clearTimeout(timer)
      resolveReady()
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      rejectReady(error)
    })
    child.once('close', (code, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      rejectReady(new Error(`packaged Host exited before ready (${String(code ?? signal)}): ${diagnostics()}`))
    })
  })
} finally {
  if (child.exitCode === null) child.kill('SIGTERM')
  await new Promise((resolveExit) => {
    if (child.exitCode !== null) {
      resolveExit()
      return
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolveExit()
    }, 10_000)
    child.once('close', () => {
      clearTimeout(timer)
      resolveExit()
    })
  })
  await rm(dshHome, { recursive: true, force: true })
}
assert.match(output, /dsh web:\s*https?:\/\/[^\s]+/u)
console.log(`Packaged Host smoke passed (${descriptor.platform}-${descriptor.arch}).`)
