import { execFileSync } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const markdownRoots = ['README.md', 'README.en.md', 'AGENTS.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md', 'llms.txt']
const docsDir = join(root, 'docs')

async function collectMarkdown(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await collectMarkdown(path))
    else if (entry.name.endsWith('.md')) files.push(path)
  }
  return files
}

const files = [...markdownRoots.map((file) => join(root, file)), ...await collectMarkdown(docsDir)]
const missing = []
const linkPattern = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

for (const file of files) {
  const source = await readFile(file, 'utf8')
  const withoutFences = source.replace(/```[\s\S]*?```/g, '')
  for (const match of withoutFences.matchAll(linkPattern)) {
    const raw = match[1]
    if (/^(?:[a-z]+:|#)/i.test(raw)) continue
    const target = raw.replace(/^<|>$/g, '').split('#')[0].split('?')[0]
    if (!target) continue
    const absolute = resolve(dirname(file), target)
    try {
      await stat(absolute)
    } catch {
      missing.push(`${relative(root, file)} -> ${raw}`)
    }
  }
}

const harnessHead = execFileSync('git', ['-C', join(root, 'harness'), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const harnessPackage = JSON.parse(await readFile(join(root, 'harness/package.json'), 'utf8'))
const matrix = await readFile(join(docsDir, 'support-matrix.md'), 'utf8')
if (!matrix.includes(harnessHead)) missing.push(`docs/support-matrix.md does not contain Harness commit ${harnessHead}`)
if (!matrix.includes(harnessPackage.version)) missing.push(`docs/support-matrix.md does not contain Harness version ${harnessPackage.version}`)

if (missing.length > 0) {
  console.error('Documentation check failed:')
  for (const item of missing) console.error(`- ${item}`)
  process.exit(1)
}

console.log(`Documentation check passed (${files.length} files; Harness ${harnessHead.slice(0, 7)}).`)
