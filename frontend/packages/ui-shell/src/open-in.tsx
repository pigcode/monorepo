/** 在系统文件管理器里打开项目文件夹。 */
import { useLocale, type MessageKey } from "@pigcode/ui-primitives"
import { useToast } from "./toast"
import { nativePlatform } from "./window-state"

/** 按系统习惯称呼文件管理器：访达、资源管理器，其他平台统称文件管理器。 */
export function revealLabelKey(platform: string = nativePlatform()): MessageKey {
  if (platform === "darwin") return "openIn.finder"
  if (platform === "win32") return "openIn.explorer"
  return "openIn.fileManager"
}

/** 在系统文件管理器里打开文件夹；没有原生桥或文件夹已不存在时抛错。 */
export async function openFolder(path: string): Promise<void> {
  const open = window.pigcodeNative?.openFolder
  if (!open) throw new Error("FOLDER_NOT_FOUND")
  await open(path)
}

/** 打开失败时的提示；原生桥的错误码对用户没有意义，只显示文件夹路径。 */
export function useOpenFailure(): (path: string) => void {
  const { t } = useLocale()
  const toast = useToast()
  return (path) => toast(`${t("openIn.failed")} ${path}`, "alert")
}
