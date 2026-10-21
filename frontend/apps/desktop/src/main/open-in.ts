/** 在系统文件管理器或本机装的编辑器里打开项目文件夹；只接受已存在的绝对目录。 */
import { statSync } from "node:fs"
import { isAbsolute } from "node:path"

/** 能用 URL 打开文件夹的编辑器；安装时会在系统里登记自己的 scheme。 */
export const EDITORS = [
  { id: "cursor", name: "Cursor", scheme: "cursor" },
  { id: "vscode", name: "VS Code", scheme: "vscode" },
  { id: "windsurf", name: "Windsurf", scheme: "windsurf" },
] as const

/** 已安装编辑器的展示信息。 */
export interface EditorInfo {
  id: string
  name: string
}

/** 已存在的绝对目录原样返回，其余一律为 null。 */
export function readDirectory(
  value: unknown,
  isDirectory: (path: string) => boolean = (path) => statSync(path).isDirectory(),
): string | null {
  if (typeof value !== "string" || !isAbsolute(value)) return null
  try {
    return isDirectory(value) ? value : null
  } catch {
    return null
  }
}

/**
 * 等 shell.openPath 的结果，最多等 waitMs。Linux 会话总线不可用时，文件管理器照样打开，
 * openPath 却可能一直不返回；超时就当作已经交给了系统，免得页面一直等不到回复。
 */
export function settleOpenPath(result: Promise<string>, waitMs = 1500): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve(""), waitMs)
  })
  return Promise.race([result, timeout]).finally(() => clearTimeout(timer))
}

/** 系统登记了 URL scheme 的编辑器，即本机装了的编辑器。 */
export function installedEditors(appNameForProtocol: (url: string) => string): EditorInfo[] {
  return EDITORS.filter((editor) => appNameForProtocol(`${editor.scheme}://`) !== "").map(
    ({ id, name }) => ({ id, name }),
  )
}

/**
 * 编辑器打开文件夹的 URL，例如 vscode://file/home/me/app 或 vscode://file/C:/work/app。
 * 每段路径单独编码，# 和 ? 这样的字符不会截断 URL；未知编辑器返回 null。
 */
export function editorUrl(editorId: unknown, folder: string): string | null {
  const editor = EDITORS.find((item) => item.id === editorId)
  if (!editor) return null
  const slashed = folder.replace(/\\/g, "/")
  const path = (slashed.startsWith("/") ? slashed : `/${slashed}`)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
    .replace(/^\/([A-Za-z])%3A(?=\/|$)/, "/$1:")
  return `${editor.scheme}://file${path}`
}
