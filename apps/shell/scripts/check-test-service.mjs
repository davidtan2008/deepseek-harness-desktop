import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runProjectTests } from '../dist/test-service.mjs'

const directory = await mkdtemp(join(tmpdir(), 'dhd-test-service-'))
const pnpm = join(directory, 'pnpm')
await writeFile(pnpm, '#!/bin/sh\nprintf "fixture test output\\n"\nexit 0\n')
await chmod(pnpm, 0o755)
const previousPath = process.env.PATH
process.env.PATH = directory
try {
  const result = await runProjectTests(directory, 991)
  assert.deepEqual(result, {
    command: 'pnpm',
    exitCode: 0,
    output: 'fixture test output\n',
    timedOut: false,
  })

  if (process.platform !== 'win32') {
    const runtimeDirectory = join(directory, 'runtime')
    const packagedNode = join(runtimeDirectory, 'bin/node')
    const argsPath = join(directory, 'packaged-args.txt')
    await mkdir(join(runtimeDirectory, 'bin'), { recursive: true })
    await writeFile(packagedNode, `#!/bin/sh\nprintf '%s\\n' "$@" > '${argsPath}'\nprintf 'packaged test output\\n'\nexit 0\n`)
    await chmod(packagedNode, 0o755)
    const previousResourcesPath = Object.getOwnPropertyDescriptor(process, 'resourcesPath')
    Object.defineProperty(process, 'resourcesPath', { value: directory, configurable: true })
    try {
      const packagedResult = await runProjectTests(directory, 992)
      assert.deepEqual(packagedResult, {
        command: 'pnpm',
        exitCode: 0,
        output: 'packaged test output\n',
        timedOut: false,
      })
      const args = (await readFile(argsPath, 'utf8')).trim().split('\n')
      assert.deepEqual(args, [join(runtimeDirectory, 'pnpm/bin/pnpm.mjs'), '--pm-on-fail=ignore', 'test'])
    } finally {
      if (previousResourcesPath === undefined) delete process.resourcesPath
      else Object.defineProperty(process, 'resourcesPath', previousResourcesPath)
    }
  }
  console.log('Project test service check passed.')
} finally {
  if (previousPath === undefined) delete process.env.PATH
  else process.env.PATH = previousPath
  await rm(directory, { recursive: true, force: true })
}
