import type { DesktopApi } from '@dhd/shared'

declare global {
  interface Window {
    dhd: DesktopApi
  }
}

export {}
