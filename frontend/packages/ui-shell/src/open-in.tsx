/** 在本机编辑器或系统文件管理器里打开项目文件夹：线程头的「IDE ↗」与侧栏项目菜单共用。 */
import { useCallback, useEffect, useState } from "react"
import { Menu, copyText, useLocale, type MessageKey } from "@pigcode/ui-primitives"
import { Icon } from "./icon"
import { useToast } from "./toast"
import { nativePlatform } from "./window-state"

/** 本机装了的编辑器。 */
export interface EditorInfo {
  id: string
  name: string
}

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

/** 本机编辑器列表；挂载时取一次，菜单每次打开再刷新，装了新编辑器不用重启。 */
function useEditors(): [EditorInfo[], () => void] {
  const [editors, setEditors] = useState<EditorInfo[]>([])
  const refresh = useCallback(() => {
    void window.pigcodeNative
      ?.listEditors?.()
      .then(setEditors)
      .catch(() => setEditors([]))
  }, [])
  useEffect(refresh, [refresh])
  return [editors, refresh]
}

/** 线程头右侧的「IDE ↗」：选一个本机编辑器打开项目，或者在文件管理器里打开、复制路径。 */
export function OpenInMenu({ path }: { path: string }) {
  const { t } = useLocale()
  const toast = useToast()
  const failed = useOpenFailure()
  const fail = () => failed(path)
  const [editors, refresh] = useEditors()

  return (
    <Menu.Root
      onOpenChange={(open) => {
        if (open) refresh()
      }}
    >
      <Menu.Trigger className="chip-btn open-in" type="button" title={t("openIn.title")}>
        IDE
        <Icon name="arrow-up-right" small />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="menu-positioner" side="bottom" align="end" sideOffset={6}>
          <Menu.Popup className="menu-popup">
            {editors.map((editor) => (
              <Menu.Item
                key={editor.id}
                className="menu-item"
                onClick={() => {
                  void window.pigcodeNative?.openInEditor?.(editor.id, path).catch(fail)
                }}
              >
                <Icon name="external" small />
                <span className="grow">{t("openIn.editor").replace("{name}", editor.name)}</span>
              </Menu.Item>
            ))}
            {editors.length === 0 ? <div className="menu-label">{t("openIn.noEditor")}</div> : null}
            <Menu.Separator className="menu-sep" />
            <Menu.Item className="menu-item" onClick={() => void openFolder(path).catch(fail)}>
              <Icon name="folder-open" small />
              <span className="grow">{t(revealLabelKey())}</span>
            </Menu.Item>
            <Menu.Item
              className="menu-item"
              onClick={() => {
                void copyText(path).then(() => toast(t("openIn.copied")))
              }}
            >
              <Icon name="copy" small />
              <span className="grow">{t("openIn.copyPath")}</span>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
