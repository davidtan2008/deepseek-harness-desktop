import assert from 'node:assert/strict'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
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
  console.log('Project test service check passed.')
} finally {
  if (previousPath === undefined) delete process.env.PATH
  else process.env.PATH = previousPath
  await rm(directory, { recursive: true, force: true })
}
