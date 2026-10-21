/** 「源文件夹」的系统选择框：用系统自带的文件管理器挑一个文件夹。 */
import type { BrowserWindow, OpenDialogOptions, OpenDialogReturnValue } from "electron"

/** 选择框的标题与确认按钮文案；由页面按当前语言传入。 */
export interface FolderPickerLabels {
  title?: string
  buttonLabel?: string
}

const MAX_LABEL = 80

/** 校验页面传来的文案；不合法的字段直接丢弃，选择框照常打开。 */
export function readFolderPickerLabels(value: unknown): FolderPickerLabels {
  if (typeof value !== "object" || value === null) return {}
  const record = value as Record<string, unknown>
  const labels: FolderPickerLabels = {}
  for (const key of ["title", "buttonLabel"] as const) {
    const text = record[key]
    if (typeof text === "string" && text.length > 0 && text.length <= MAX_LABEL) labels[key] = text
  }
  return labels
}

/** 弹出系统选择框的 Electron 接口；测试里可以替换。 */
export type ShowOpenDialog = (
  window: BrowserWindow,
  options: OpenDialogOptions,
) => Promise<OpenDialogReturnValue>

/** 以窗口为父弹出系统文件夹选择框；取消时返回 null。 */
export async function pickFolder(
  showOpenDialog: ShowOpenDialog,
  window: BrowserWindow,
  labels: FolderPickerLabels,
): Promise<string | null> {
  const result = await showOpenDialog(window, {
    properties: ["openDirectory", "createDirectory"],
    ...labels,
  })
  if (result.canceled) return null
  return result.filePaths[0] ?? null
}
