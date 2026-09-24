import { app, BrowserWindow, Menu, protocol } from 'electron'
import { PRODUCT_NAME, PROTOCOL } from '@dhd/shared'
import { HostProcess } from './host.ts'
import { registerIpc, stopWatching } from './ipc.ts'
import { cancelAllSearches } from './search-service.ts'
import { buildAppMenu } from './menu.ts'
import { killAllPty } from './pty-service.ts'
import { loadSettings } from './settings-store.ts'
import { createWorkbenchWindow } from './windows.ts'
import { setupUpdater } from './updater.ts'

protocol.registerSchemesAsPrivileged([
  { scheme: PROTOCOL, privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const windows = new Set<BrowserWindow>()
const host = new HostProcess()
let shuttingDown = false
let quitApproved = false
let shutdownPromise: Promise<void> | undefined

function currentWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? [...windows][0]
}

function openWindow(projectPath?: string): BrowserWindow {
  const win = createWorkbenchWindow({ projectPath, settings: loadSettings() })
  windows.add(win)
  win.on('closed', () => windows.delete(win))
  return win
}

async function disposeApplication(): Promise<void> {
  shuttingDown = true
  stopWatching()
  const searchCleanup = cancelAllSearches()
  for (const win of [...windows]) {
    if (!win.isDestroyed()) win.destroy()
  }
  await Promise.allSettled([searchCleanup, killAllPty(), host.stop()])
}

app.setName(PRODUCT_NAME)

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    if (shuttingDown) return
    const existing = currentWindow()
    if (existing) {
      if (existing.isMinimized()) existing.restore()
      existing.focus()
    }
    const folder = argv.find((arg) => arg.startsWith('--folder='))?.slice('--folder='.length)
    if (folder) openWindow(folder)
  })

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(buildAppMenu(currentWindow))
    registerIpc({
      host,
      getWindow: currentWindow,
      openWindow,
    })
    host.on((state) => {
      for (const win of windows) {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('host:changed', state)
      }
    })
    const project = process.argv.find((arg) => arg.startsWith('--folder='))?.slice('--folder='.length)
    openWindow(project)
    void host.start().catch((error: unknown) => {
      console.error('[host] startup failed:', error)
    })
    setupUpdater()
  })

  app.on('activate', () => {
    if (!shuttingDown && windows.size === 0) openWindow()
  })

  app.on('before-quit', (event) => {
    if (quitApproved) return
    event.preventDefault()
    if (shutdownPromise) return
    shutdownPromise = disposeApplication()
      .catch((error: unknown) => {
        console.error('[shutdown] cleanup failed:', error)
      })
      .finally(() => {
        quitApproved = true
        app.quit()
      })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
