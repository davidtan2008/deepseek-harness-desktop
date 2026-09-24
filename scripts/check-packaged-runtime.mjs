import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const candidates = process.platform === 'darwin'
  ? [join(root, 'release/mac-arm64/DeepSeek Harness Desktop.app/Contents/Resources')]
  : process.platform === 'win32'
    ? [join(root, 'release/win-unpacked/resources')]
    : [join(root, 'release/linux-unpacked/resources')]
const resources = candidates.find((candidate) => existsSync(join(candidate, 'runtime-manifest.json')))
if (resources === undefined) throw new Error(`packaged app resources are missing: ${candidates.join(', ')}`)
const result = spawnSync(process.execPath, [join(root, 'scripts/check-release-runtime.mjs'), '--resources', resources], { stdio: 'inherit' })
process.exit(result.status ?? 1)
