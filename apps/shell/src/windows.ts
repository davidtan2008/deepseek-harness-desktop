import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import { join } from 'node:path'
import { PRODUCT_NAME, type AppSettings } from '@dhd/shared'
import { shellRoot, workbenchIndexPath } from './paths.ts'

export interface WindowOpenOptions {
  projectPath?: string
  settings: AppSettings
}

export function createWorkbenchWindow(options: WindowOpenOptions): BrowserWindow {
  const { window } = options.settings
  const opts: BrowserWindowConstructorOptions = {
    width: window.width,
    height: window.height,
    x: window.x,
    y: window.y,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: PRODUCT_NAME,
    backgroundColor: '#141414',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 14 },
    autoHideMenuBar: process.platform === 'win32',
    webPreferences: {
      preload: join(shellRoot(), 'dist/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      spellcheck: false,
    },
  }
  const win = new BrowserWindow(opts)
  if (window.isMaximized) win.maximize()

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  const query = options.projectPath ? `?project=${encodeURIComponent(options.projectPath)}` : ''
  if (rendererUrl) {
    void win.loadURL(`${rendererUrl}${query}`)
  } else {
    void win.loadFile(workbenchIndexPath(), {
      query: options.projectPath ? { project: options.projectPath } : {},
    })
  }

  win.once('ready-to-show', () => win.show())
  return win
}
