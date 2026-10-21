/** 外壳依赖的窗口与平台状态：原生平台、标题栏形态、窄窗口与历史快捷键。 */
import { useEffect, useState } from "react"
import { isMacPlatform } from "@pigcode/ui-primitives"

/** 原生桥报告的平台；浏览器与测试环境里为空字符串。 */
export function nativePlatform(): string {
  return typeof window === "undefined" ? "" : (window.pigcodeNative?.platform ?? "")
}

/** Windows 与 Linux 由页面绘制标题栏，系统窗口按钮叠在它上面。 */
export function hasCustomTitleBar(platform: string): boolean {
  return platform === "win32" || platform === "linux"
}

/** ⌘[ / ⌘]（macOS）或 Alt+← / Alt+→（Windows、Linux）对应的历史方向。 */
export function historyStep(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  mac: boolean = isMacPlatform(),
): "back" | "forward" | null {
  if (mac) {
    if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return null
    return event.key === "[" ? "back" : event.key === "]" ? "forward" : null
  }
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null
  return event.key === "ArrowLeft" ? "back" : event.key === "ArrowRight" ? "forward" : null
}

/** 与 globals.css 的窄窗口断点一致：更窄时侧栏改成浮在内容上的抽屉。 */
const NARROW_QUERY = "(max-width: 960px)"

function matchesNarrow(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(NARROW_QUERY).matches
    : false
}

/** 窗口是否窄到侧栏改成抽屉。 */
export function useNarrowWindow(): boolean {
  const [narrow, setNarrow] = useState(matchesNarrow)
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const list = window.matchMedia(NARROW_QUERY)
    const onChange = (event: MediaQueryListEvent): void => setNarrow(event.matches)
    list.addEventListener("change", onChange)
    return () => list.removeEventListener("change", onChange)
  }, [])
  return narrow
}
