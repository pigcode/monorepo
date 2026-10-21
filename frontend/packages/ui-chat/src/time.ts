/** 时间线上的时间文案：相对时间给列表，完整时间给悬停提示。 */

/** 把事件时间压成「刚刚 / 2 分钟前 / 3 小时前 / 2 天前」；超过一周显示日期。 */
export function formatRelative(
  value: string,
  locale: string,
  now = Date.now(),
): string | undefined {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  const zh = locale.startsWith("zh")
  const minutes = Math.max(0, Math.floor((now - date.getTime()) / 60_000))
  if (minutes < 1) return zh ? "刚刚" : "just now"
  if (minutes < 60) return zh ? `${minutes} 分钟前` : `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return zh ? `${hours} 小时前` : `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return zh ? `${days} 天前` : `${days}d ago`
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date)
}

/** 完整时间，放在悬停提示里。 */
export function formatFull(value: string, locale: string): string | undefined {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date)
}
