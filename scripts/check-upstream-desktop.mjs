import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const harness = join(root, 'harness')
// This is the protocol version observed at the pinned gitlink; changing it requires an ADR update.
const expectedProtocolVersion = 4
const failures = []

function source(relativePath) {
  const path = join(harness, relativePath)
  if (!existsSync(path)) {
    failures.push(`missing ${relativePath}`)
    return ''
  }
  return readFileSync(path, 'utf8')
}

function requirePattern(label, text, pattern) {
  if (!pattern.test(text)) failures.push(`${label} does not expose ${pattern}`)
}

const hostProtocol = source('apps/desktop/src/host-protocol.ts')
const hostProcess = source('apps/desktop/src/host-process.ts')
const backendController = source('apps/desktop/src/backend-controller.ts')
const runtimeTree = source('apps/desktop/src/runtime-tree.ts')
const projectManager = source('apps/desktop/src/project-manager.ts')
const desktopHost = source('apps/desktop-host/src/index.ts')

const protocolMatch = hostProtocol.match(/DESKTOP_HOST_PROTOCOL_VERSION\s*=\s*(\d+)/)
if (protocolMatch?.[1] !== String(expectedProtocolVersion)) {
  failures.push(`desktop Host protocol is ${protocolMatch?.[1] ?? 'missing'}, expected ${expectedProtocolVersion}`)
}

requirePattern('host-process.ts', hostProcess, /stdio:\s*\[[\s\S]*['"]ipc['"]/)
requirePattern('host-process.ts', hostProcess, /child\.on\(['"]message['"]/)
requirePattern('host-process.ts', hostProcess, /type:\s*['"]shutdown['"]/)
requirePattern('host-process.ts', hostProcess, /shutdown-complete/)
requirePattern('host-process.ts', hostProcess, /type:\s*['"]fatal['"]/)
requirePattern('backend-controller.ts', backendController, /class\s+DesktopBackendController/)
requirePattern('backend-controller.ts', backendController, /close\(\)\s*:\s*Promise/)
requirePattern('runtime-tree.ts', runtimeTree, /DESKTOP_RUNTIME_FILE/)
requirePattern('runtime-tree.ts', runtimeTree, /sha256/)
requirePattern('runtime-tree.ts', runtimeTree, /readDesktopRuntime/)
requirePattern('project-manager.ts', projectManager, /initProfile/)
requirePattern('project-manager.ts', projectManager, /disableAllPlugins/)
requirePattern('desktop-host/src/index.ts', desktopHost, /runProfile\(/)
requirePattern('desktop-host/src/index.ts', desktopHost, /authenticatedUrl\(/)
requirePattern('desktop-host/src/index.ts', desktopHost, /type:\s*['"]ready['"]/)
requirePattern('desktop-host/src/index.ts', desktopHost, /type:\s*['"]shutdown-complete['"]/)
requirePattern('desktop-host/src/index.ts', desktopHost, /process\.once\(['"]disconnect['"]/)

if (failures.length > 0) {
  console.error('Upstream Desktop compatibility check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Upstream Desktop compatibility check passed (Host protocol v${expectedProtocolVersion}).`)
