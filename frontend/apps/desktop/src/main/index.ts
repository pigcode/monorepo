/** Electron main：单实例、窗口、Host utilityProcess、原生桥与端口转交。 */
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from "electron"
import { join } from "node:path"
import { pickFolder, readFolderPickerLabels } from "./folder-picker"
import { startHostProcess, type HostProcess } from "./host-process"
import { popupNativeMenu, readMenuPosition, readNativeMenu } from "./native-menu"
import { editorUrl, installedEditors, readDirectory, settleOpenPath } from "./open-in"
import { registerAppProtocol, registerPluginProtocol, registerPrivilegedSchemes } from "./protocol"
import { closePreview, isAllowedPreviewUrl, openPreview } from "./preview"
import {
  TITLE_BAR_HEIGHT,
  createMainWindowOptions,
  readThemeSource,
  readTitleBarColors,
  usesTitleBarOverlay,
} from "./window-options"

registerPrivilegedSchemes()

let host: HostProcess | undefined
let mainWindow: BrowserWindow | undefined
let quitting = false

/** 把应用内相对路径解析到 app.getAppPath() 之下。 */
export function resolveAppPath(...segments: string[]): string {
  return join(app.getAppPath(), ...segments)
}

function profileDir(): string {
  return process.env.PIGCODE_PROFILE_DIR ?? join(app.getPath("userData"), "profiles", "desktop")
}

/** 注册主题与窗口控制 IPC；只接受已知的动作和外观值。 */
function registerNativeBridge(): void {
  ipcMain.handle("pigcode:set-theme", (_event, value: unknown) => {
    const source = readThemeSource(value)
    if (source) nativeTheme.themeSource = source
  })
  ipcMain.handle("pigcode:window", (event, action: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return
    if (action === "minimize") window.minimize()
    else if (action === "maximize") {
      if (window.isMaximized()) window.unmaximize()
      else window.maximize()
    } else if (action === "close") window.close()
  })
  ipcMain.handle("pigcode:is-maximized", (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })
  ipcMain.handle("pigcode:is-full-screen", (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false
  })
  // 原生窗口按钮的底色与图标色跟随页面当前外观；macOS 的交通灯不需要。
  ipcMain.handle("pigcode:title-bar", (event, value: unknown) => {
    const colors = readTitleBarColors(value)
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!colors || !window || !usesTitleBarOverlay(process.platform)) return
    window.setTitleBarOverlay({ ...colors, height: TITLE_BAR_HEIGHT })
  })
  // 标题栏菜单由页面描述、主进程弹出原生菜单；返回被点击的命令 id。
  ipcMain.handle("pigcode:menu", (event, items: unknown, position: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const menu = readNativeMenu(items, { allowDevRoles: !app.isPackaged })
    const at = readMenuPosition(position)
    if (!window || !menu || !at) return null
    const zoom = event.sender.getZoomFactor()
    return popupNativeMenu(Menu, window, menu, { x: at.x * zoom, y: at.y * zoom })
  })
  // 创建项目时用系统文件管理器选择源文件夹；返回路径，取消时为 null。
  ipcMain.handle("pigcode:pick-folder", (event, labels: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null
    return pickFolder(
      (parent, options) => dialog.showOpenDialog(parent, options),
      window,
      readFolderPickerLabels(labels),
    )
  })
  // 项目文件夹交给系统文件管理器或编辑器打开；页面只能传已存在的目录，编辑器 URL 由主进程拼。
  ipcMain.handle("pigcode:open-folder", async (_event, value: unknown) => {
    const folder = readDirectory(value)
    if (!folder) throw new Error("FOLDER_NOT_FOUND")
    const error = await settleOpenPath(shell.openPath(folder))
    if (error) throw new Error(error)
  })
  ipcMain.handle("pigcode:list-editors", () =>
    installedEditors((url) => app.getApplicationNameForProtocol(url)),
  )
  ipcMain.handle("pigcode:open-in-editor", async (_event, editorId: unknown, value: unknown) => {
    const folder = readDirectory(value)
    if (!folder) throw new Error("FOLDER_NOT_FOUND")
    const url = editorUrl(editorId, folder)
    if (!url) throw new Error("EDITOR_NOT_SUPPORTED")
    await shell.openExternal(url)
  })
  // 预览窗口：URL 合法性由 preview.ts 统一校验，IPC 只做类型收敛。
  ipcMain.handle("pigcode:preview-open", (_event, url: unknown) => {
    if (typeof url !== "string") throw new Error("PREVIEW_URL_NOT_ALLOWED")
    return openPreview(url)
  })
  ipcMain.handle("pigcode:preview-close", (_event, id: unknown) => {
    if (typeof id === "string") closePreview(id)
    else if (id === undefined || id === null) closePreview()
  })
}

registerNativeBridge()

function startHost(): HostProcess {
  const next = startHostProcess(resolveAppPath("out/host/index.mjs"), profileDir())
  next.child.on("exit", () => {
    if (quitting) return
    host = startHost()
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.postMessage("pigcode:port", null, [host.appPort])
    }
  })
  return next
}

/** 创建调试窗口，并在页面加载后把 Host 的 MessagePort 交给渲染进程。 */
export async function createWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow(
    createMainWindowOptions({
      platform: process.platform,
      preloadPath: resolveAppPath("out/preload/index.cjs"),
      isPackaged: app.isPackaged,
      dark: nativeTheme.shouldUseDarkColors,
    }),
  )
  window.once("ready-to-show", () => window.show())
  // macOS 全屏时交通灯隐藏，页面据此收回为交通灯预留的空间。
  window.on("enter-full-screen", () => window.webContents.send("pigcode:full-screen", true))
  window.on("leave-full-screen", () => window.webContents.send("pigcode:full-screen", false))
  // 右侧浏览器用 iframe 内嵌本机页面；子框架的跳转与重定向同样只能留在 loopback。
  const guardFrame = (event: { isMainFrame: boolean; url: string; preventDefault: () => void }) => {
    if (!event.isMainFrame && /^https?:/i.test(event.url) && !isAllowedPreviewUrl(event.url)) {
      event.preventDefault()
    }
  }
  window.webContents.on("will-frame-navigate", guardFrame)
  window.webContents.on("will-redirect", guardFrame)
  window.webContents.on("did-finish-load", () => {
    if (host) window.webContents.postMessage("pigcode:port", null, [host.appPort])
  })
  await window.loadURL("pigcode://app/index.html")
  return window
}

app.whenReady().then(async () => {
  registerAppProtocol(resolveAppPath("out/renderer"))
  registerPluginProtocol(profileDir())
  host = startHost()
  mainWindow = await createWindow()

  if (process.env.PIGCODE_E2E === "1") {
    app.on("pigcode:test-kill-host" as never, () => {
      host?.stop()
    })
  }
})

app.on("before-quit", () => {
  quitting = true
  host?.stop()
})

app.on("window-all-closed", () => {
  quitting = true
  host?.stop()
  app.quit()
})
