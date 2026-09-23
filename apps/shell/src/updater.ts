import { app } from 'electron'

export function setupUpdater(): void {
  if (!app.isPackaged) return
  void import('electron-updater').then(({ autoUpdater }) => {
    autoUpdater.autoDownload = true
    autoUpdater.checkForUpdatesAndNotify().catch((err: unknown) => {
      console.warn('auto-update skipped', err)
    })
  }).catch(() => {
    // electron-updater is optional until a signed feed exists
  })
}
