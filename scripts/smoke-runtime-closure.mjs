import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const closureRoot = join(root, 'apps/shell/runtime-closure')
const descriptor = JSON.parse(readFileSync(join(closureRoot, 'closure.json'), 'utf8'))
const node = join(closureRoot, descriptor.node.path)
const pnpm = join(closureRoot, descriptor.pnpm.path)
const ripgrep = join(closureRoot, descriptor.ripgrep.path)
const dsh = join(closureRoot, descriptor.harness.entry)
const nodeVersion = execFileSync(node, ['-p', 'process.versions.node'], { encoding: 'utf8' }).trim()
const pnpmVersion = execFileSync(node, [pnpm, '--pm-on-fail=ignore', '--version'], { encoding: 'utf8' }).trim().split(/\r?\n/u)[0]
const ripgrepVersion = execFileSync(ripgrep, ['--version'], { encoding: 'utf8' }).trim().split(/\r?\n/u)[0]
const dshVersion = execFileSync(node, [dsh, '--version'], { encoding: 'utf8' }).trim().split(/\r?\n/u)[0]
assert.equal(nodeVersion, descriptor.node.version)
assert.equal(pnpmVersion, descriptor.pnpm.version)
assert.equal(ripgrepVersion, descriptor.ripgrep.version)
assert.ok(dshVersion.includes(descriptor.harness.version), `unexpected dsh version: ${dshVersion}`)
const project = mkdtempSync(join(tmpdir(), 'dhd-runtime-pnpm-'))
try {
  writeFileSync(join(project, 'package.json'), JSON.stringify({
    name: 'runtime-smoke-project',
    private: true,
    packageManager: 'pnpm@10.14.0',
    scripts: { test: 'node --version' },
  }))
  const output = execFileSync(node, [pnpm, '--pm-on-fail=ignore', 'test'], {
    cwd: project,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${join(closureRoot, 'bin')}${delimiter}${process.env.PATH ?? ''}` },
  })
  assert.ok(output.includes(`v${descriptor.node.version}`), `unexpected test output: ${output}`)
} finally {
  rmSync(project, { recursive: true, force: true })
}
console.log(`Runtime closure smoke passed (${descriptor.platform}-${descriptor.arch}, ${descriptor.files.length} files).`)
