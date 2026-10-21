/** 一轮回复结束后显示在下方的一行：复制整轮回复、回复时间。 */
import { useEffect, useState } from "react"
import { Check, Copy } from "lucide-react"
import { useLocale } from "@pigcode/ui-primitives"

/** 把时间写成「刚刚 / 5 分钟前 / 昨天」；超过一周显示日期。 */
export function formatReplyTime(value: string, locale: string, justNow: string, now = Date.now()): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const seconds = Math.round((now - date.getTime()) / 1000)
  if (seconds < 60) return justNow
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return relative.format(-minutes, "minute")
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return relative.format(-hours, "hour")
  const days = Math.floor(hours / 24)
  if (days < 7) return relative.format(-days, "day")
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date)
}

/** 剪贴板接口不可用时，退回选中隐藏文本框再复制。 */
function copyWithSelection(text: string): void {
  const area = document.createElement("textarea")
  area.value = text
  area.setAttribute("readonly", "")
  area.style.position = "fixed"
  area.style.opacity = "0"
  document.body.append(area)
  area.select()
  document.execCommand("copy")
  area.remove()
}

/** 复制按钮与时间；复制成功后短暂显示对勾。 */
export function TurnActions({ text, at }: { text: string; at: string | null }) {
  const { t, locale } = useLocale()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      copyWithSelection(text)
    }
    setCopied(true)
  }

  const label = copied ? t("chat.copied") : t("chat.copy")
  return (
    <div className="turn-actions">
      <button
        type="button"
        className="turn-action"
        aria-label={label}
        title={label}
        onClick={() => void copy()}
      >
        {copied ? (
          <Check className="ic ic-sm" aria-hidden="true" />
        ) : (
          <Copy className="ic ic-sm" aria-hidden="true" />
        )}
      </button>
      {at ? (
        <time dateTime={at} title={new Date(at).toLocaleString(locale)}>
          {formatReplyTime(at, locale, t("chat.justNow"))}
        </time>
      ) : null}
    </div>
  )
}
