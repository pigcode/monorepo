/** 工具调用卡片；紧凑单行展示状态、名称、摘要与耗时，点击展开输入输出。 */
import { useState } from "react"
import { AlertCircle, Check, ChevronRight, Loader2 } from "lucide-react"
import { Button, useLocale } from "@pigcode/ui-primitives"

/** 工具调用的生命周期状态。 */
export type ToolStatus = "running" | "completed" | "failed"

/** 时间线里一张工具卡片需要的数据。 */
export interface ToolCall {
  id: string
  name: string
  status: ToolStatus
  input: string | undefined
  output: string | undefined
  /** 开始与结束时间（ISO）；两者都有时显示耗时。 */
  startedAt?: string
  completedAt?: string
}

const STATUS_KEYS = {
  running: "chat.tool.running",
  completed: "chat.tool.completed",
  failed: "chat.tool.failed",
} as const

/** 把毫秒耗时压成一眼能读的短文本。 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return ""
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`
}

/** 由开始/结束时间计算耗时；缺任一端或时间非法时不显示。 */
export function toolDuration(tool: Pick<ToolCall, "startedAt" | "completedAt">): string {
  if (!tool.startedAt || !tool.completedAt) return ""
  const start = Date.parse(tool.startedAt)
  const end = Date.parse(tool.completedAt)
  if (Number.isNaN(start) || Number.isNaN(end)) return ""
  return formatDuration(end - start)
}

/** 输入的第一行作为摘要；JSON 对象只保留主干，避免整行都是花括号。 */
function summarize(input: string | undefined): string {
  if (!input) return ""
  const firstLine = input.split("\n").find((line) => line.trim().length > 0) ?? ""
  return firstLine.trim().slice(0, 160)
}

/** 渲染工具调用；有输入或输出时允许展开查看。 */
export function ToolCard({
  tool,
  onView,
}: {
  tool: ToolCall
  onView?: ((tool: ToolCall) => void) | undefined
}) {
  const { t } = useLocale()
  const [open, setOpen] = useState(false)
  const hasDetails = Boolean(tool.input || tool.output)
  const duration = toolDuration(tool)
  const summary = summarize(tool.input)

  function toggle(): void {
    onView?.(tool)
    if (hasDetails) setOpen((value) => !value)
  }

  return (
    <div className={`tool-card${open ? " is-open" : ""}`} data-status={tool.status}>
      <Button
        variant="plain"
        className="tool-head"
        type="button"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="tool-icon" data-status={tool.status} aria-hidden="true">
          {tool.status === "running" ? (
            <Loader2 className="ic ic-sm spin" />
          ) : tool.status === "failed" ? (
            <AlertCircle className="ic ic-sm" />
          ) : (
            <Check className="ic ic-sm" />
          )}
        </span>
        <span className="tool-name">
          {tool.name === "tool" ? t("chat.tool.unknown") : tool.name}
        </span>
        {summary ? (
          <span className="tool-summary truncate" title={summary}>
            {summary}
          </span>
        ) : null}
        <span className="grow" />
        {duration ? <span className="tool-duration num">{duration}</span> : null}
        <span className={`tool-status ${tool.status}`}>{t(STATUS_KEYS[tool.status])}</span>
        {hasDetails ? (
          <ChevronRight className="ic ic-sm chev tool-chev" aria-hidden="true" />
        ) : null}
      </Button>
      {open ? (
        <div className="tool-body">
          {tool.input ? (
            <>
              <div className="tool-label">{t("chat.tool.input")}</div>
              <pre>{tool.input}</pre>
            </>
          ) : null}
          {tool.output ? (
            <>
              <div className="tool-label">{t("chat.tool.output")}</div>
              <pre>{tool.output}</pre>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
