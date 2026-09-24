import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fail = []

function report(label, value, ok = true) {
  console.log(`${ok ? '✓' : '✗'} ${label}: ${value}`)
  if (!ok) fail.push(label)
}

function command(commandName, args = []) {
  const result = spawnSync(commandName, args, { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : undefined
}

const node = process.versions.node
const [majorText, minorText] = node.split('.')
const major = Number(majorText)
const minor = Number(minorText)
const nodeOk = major >= 24 || (major === 22 && minor >= 19)
report('Node.js', `${node} (需要 ^22.19 或 >=24)`, nodeOk)

const pnpm = command('pnpm', ['--version'])
report('pnpm', pnpm ?? '未找到', Boolean(pnpm))

const harnessHead = command('git', ['-C', join(root, 'harness'), 'rev-parse', 'HEAD'])
report('Harness gitlink', harnessHead ?? '未初始化', Boolean(harnessHead))

if (harnessHead) {
  const harnessPackagePath = join(root, 'harness/package.json')
  if (existsSync(harnessPackagePath)) {
    const harnessPackage = JSON.parse(readFileSync(harnessPackagePath, 'utf8'))
    report('Harness package version', harnessPackage.version ?? '未知', true)
  } else {
    report('Harness package version', 'harness/package.json 缺失', false)
  }
  const harnessStatus = command('git', ['-C', join(root, 'harness'), 'status', '--short'])
  report('Harness working tree', harnessStatus || 'clean', !harnessStatus)
}

const required = [
  ['root dependencies', join(root, 'node_modules')],
  ['Harness dependencies', join(root, 'harness/node_modules')],
  ['Harness CLI entry', join(root, 'harness/apps/cli/src/bin.ts')],
]
for (const [label, path] of required) report(label, existsSync(path) ? path : '缺失', existsSync(path))

const optionalBuilds = [
  ['built workbench', join(root, 'apps/workbench/dist/index.html')],
  ['built shell', join(root, 'apps/shell/dist/main.js')],
]
for (const [label, path] of optionalBuilds) {
  const present = existsSync(path)
  console.log(`${present ? '✓' : 'ℹ'} ${label}: ${present ? path : '未构建（运行 pnpm build 或 pnpm dev）'}`)
}

const rg = process.env.RIPGREP_PATH || command('rg', ['--version'])?.split('\n')[0] || '未找到（搜索会使用 JS fallback）'
report('ripgrep', rg, true)

console.log(`\nDSH_HOME: ${process.env.DSH_HOME || join(homedir(), '.dsh')}`)
console.log(`DHD_USER_DATA: ${process.env.DHD_USER_DATA || '(Electron default)'}`)
console.log(`DHD_WORKBENCH_PORT: ${process.env.DHD_WORKBENCH_PORT || '5173'}`)
console.log(`DHD_ALLOW_MULTIPLE: ${process.env.DHD_ALLOW_MULTIPLE || '0'}`)
console.log(`DHD_ALLOW_REMOTE_HOST: ${process.env.DHD_ALLOW_REMOTE_HOST || '0'}`)

if (fail.length > 0) {
  console.error(`\n${fail.length} 个基础条件未满足。源码启动前请先修复上面的 ✗ 项。`)
  process.exit(1)
}
console.log('\nDoctor completed: source prerequisites are present.')
