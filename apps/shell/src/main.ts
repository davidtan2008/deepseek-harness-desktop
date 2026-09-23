import { app, BrowserWindow, Menu, protocol } from 'electron'
import { PRODUCT_NAME, PROTOCOL } from '@dhd/shared'
import { HostProcess } from './host.ts'
import { registerIpc } from './ipc.ts'
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

function currentWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? [...windows][0]
}

function openWindow(projectPath?: string): BrowserWindow {
  const win = createWorkbenchWindow({ projectPath, settings: loadSettings() })
  windows.add(win)
  win.on('closed', () => windows.delete(win))
  return win
}

app.setName(PRODUCT_NAME)

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
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
      for (const win of windows) win.webContents.send('host:changed', state)
    })
    const project = process.argv.find((arg) => arg.startsWith('--folder='))?.slice('--folder='.length)
    openWindow(project)
    void host.start()
    setupUpdater()
  })

  app.on('activate', () => {
    if (windows.size === 0) openWindow()
  })

  app.on('before-quit', () => {
    killAllPty()
    void host.stop()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
