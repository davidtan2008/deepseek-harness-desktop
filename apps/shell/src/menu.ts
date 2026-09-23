import { Menu, type BrowserWindow } from 'electron'
import { PRODUCT_NAME } from '@dhd/shared'

function send(win: BrowserWindow | undefined, command: string): void {
  win?.webContents.send('menu:command', command)
}

export function buildAppMenu(getWindow: () => BrowserWindow | undefined): Menu {
  const isMac = process.platform === 'darwin'
  const menu = Menu.buildFromTemplate([
    ...(isMac
      ? [{
          label: PRODUCT_NAME,
          submenu: [
            { role: 'about' as const },
            { type: 'separator' as const },
            { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => send(getWindow(), 'openSettings') },
            { type: 'separator' as const },
            { role: 'services' as const },
            { type: 'separator' as const },
            { role: 'hide' as const },
            { role: 'hideOthers' as const },
            { role: 'unhide' as const },
            { type: 'separator' as const },
            { role: 'quit' as const },
          ],
        }]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => send(getWindow(), 'newWindow') },
        { label: 'Open Folder…', accelerator: 'CmdOrCtrl+O', click: () => send(getWindow(), 'openFolder') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send(getWindow(), 'save') },
        { label: 'Save All', accelerator: 'CmdOrCtrl+Alt+S', click: () => send(getWindow(), 'saveAll') },
        { type: 'separator' },
        { label: 'Close Editor', accelerator: 'CmdOrCtrl+W', click: () => send(getWindow(), 'closeTab') },
        ...(!isMac ? [
          { type: 'separator' as const },
          { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => send(getWindow(), 'openSettings') },
          { role: 'quit' as const },
        ] : []),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Inline Edit', accelerator: 'CmdOrCtrl+K', click: () => send(getWindow(), 'inlineEdit') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Command Palette', accelerator: 'CmdOrCtrl+Shift+P', click: () => send(getWindow(), 'commandPalette') },
        { label: 'Go to File', accelerator: 'CmdOrCtrl+P', click: () => send(getWindow(), 'quickOpen') },
        { type: 'separator' },
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: () => send(getWindow(), 'toggleSidebar') },
        { label: 'Toggle Agent', accelerator: 'CmdOrCtrl+L', click: () => send(getWindow(), 'toggleAgent') },
        { label: 'Toggle Panel', accelerator: 'CmdOrCtrl+J', click: () => send(getWindow(), 'togglePanel') },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { role: 'togglefullscreen' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
      ],
    },
    {
      label: 'Agent',
      submenu: [
        { label: 'Focus Agent', accelerator: 'CmdOrCtrl+Shift+L', click: () => send(getWindow(), 'focusAgent') },
        { label: 'Restart Harness Host', click: () => send(getWindow(), 'restartHost') },
        { label: 'New Agent Session', click: () => send(getWindow(), 'newAgentSession') },
      ],
    },
    {
      label: 'Terminal',
      submenu: [
        { label: 'New Terminal', accelerator: 'Ctrl+`', click: () => send(getWindow(), 'newTerminal') },
        { label: 'Toggle Terminal', accelerator: 'CmdOrCtrl+`', click: () => send(getWindow(), 'toggleTerminal') },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : []),
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'DeepSeek Harness Docs', click: () => send(getWindow(), 'openDocs') },
      ],
    },
  ])
  return menu
}
