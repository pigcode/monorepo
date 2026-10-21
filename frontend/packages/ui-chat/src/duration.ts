/** 时长的显示与运行中的计时。 */
import { useEffect, useState } from "react"

/** 把时长写成「12 秒 / 3 分 5 秒 / 1 时 2 分」，英文为「12s / 3m 5s / 1h 2m」。 */
export function formatDuration(ms: number, locale: string): string {
  const total = Math.max(1, Math.round(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const zh = locale.startsWith("zh")
  const unit = (value: number, zhUnit: string, enUnit: string) =>
    zh ? `${value} ${zhUnit}` : `${value}${enUnit}`
  if (hours > 0)
    return [unit(hours, "时", "h"), minutes > 0 ? unit(minutes, "分", "m") : null]
      .filter(Boolean)
      .join(" ")
  if (minutes > 0)
    return [unit(minutes, "分", "m"), seconds > 0 ? unit(seconds, "秒", "s") : null]
      .filter(Boolean)
      .join(" ")
  return unit(seconds, "秒", "s")
}

/** 运行中每秒刷新一次当前时间；结束后停止计时。 */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return undefined
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

/** 两个时间点之间的毫秒数；缺任何一个时为 null。 */
export function elapsed(
  from: string | null | undefined,
  to: string | number | null | undefined,
): number | null {
  if (!from || to === null || to === undefined) return null
  const start = Date.parse(from)
  const end = typeof to === "number" ? to : Date.parse(to)
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : null
}
