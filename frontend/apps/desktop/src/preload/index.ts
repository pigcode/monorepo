/** preload：MessagePort 转交 + 最小窗口/主题/菜单桥；不暴露 Node。 */
import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("pigcodeNative", {
  platform: process.platform,
  setThemeSource: (source: "light" | "dark" | "system") =>
    ipcRenderer.invoke("pigcode:set-theme", source),
  windowControl: (action: "minimize" | "maximize" | "close") =>
    ipcRenderer.invoke("pigcode:window", action),
  isMaximized: () => ipcRenderer.invoke("pigcode:is-maximized"),
  isFullScreen: (): Promise<boolean> => ipcRenderer.invoke("pigcode:is-full-screen"),
  onFullScreenChange: (listener: (fullScreen: boolean) => void): (() => void) => {
    const handler = (_event: unknown, value: unknown) => listener(value === true)
    ipcRenderer.on("pigcode:full-screen", handler)
    return () => {
      ipcRenderer.removeListener("pigcode:full-screen", handler)
    }
  },
  setTitleBarColors: (colors: { color: string; symbolColor: string }) =>
    ipcRenderer.invoke("pigcode:title-bar", colors),
  popupMenu: (items: unknown[], position: { x: number; y: number }): Promise<string | null> =>
    ipcRenderer.invoke("pigcode:menu", items, position),
  pickFolder: (labels?: { title?: string; buttonLabel?: string }): Promise<string | null> =>
    ipcRenderer.invoke("pigcode:pick-folder", labels),
  previewOpen: (url: string): Promise<{ id: string }> =>
    ipcRenderer.invoke("pigcode:preview-open", url),
  previewClose: (id?: string): void => {
    void ipcRenderer.invoke("pigcode:preview-close", id).catch(() => undefined)
  },
})

ipcRenderer.on("pigcode:port", (event) => {
  const [port] = event.ports
  if (port) window.postMessage({ type: "pigcode:port" }, "*", [port])
})
