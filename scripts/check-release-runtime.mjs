import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isRuntimeManifest } from '../packages/shared/dist/runtime.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const path = resolve(root, 'apps/shell/runtime-manifest.json')
const manifest = JSON.parse(readFileSync(path, 'utf8'))
const valid = isRuntimeManifest(manifest)
const blockers = []

if (!valid) blockers.push('manifest schema is invalid')
if (valid && manifest.mode !== 'packaged') blockers.push('manifest mode is not packaged')
if (valid && manifest.desktop.dirty) blockers.push('desktop source tree is dirty')
if (valid) {
  for (const dependency of ['harness', 'node', 'pnpm', 'ripgrep']) {
    if (!manifest.bundled[dependency]) blockers.push(`${dependency} is not bundled`)
  }
  if (!manifest.harness.commit || manifest.harness.commit === 'unavailable') blockers.push('Harness commit is unavailable')
}

if (blockers.length > 0) {
  console.error('Release runtime gate failed:')
  for (const blocker of blockers) console.error(`- ${blocker}`)
  process.exit(1)
}
console.log('Release runtime gate passed.')
