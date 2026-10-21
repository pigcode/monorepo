/** 工具调用卡片；查看按钮展开输入与输出。 */
import { useState } from "react"
import {
  ChevronRight,
  FilePen,
  FileText,
  Globe,
  ListChecks,
  Search,
  SquareTerminal,
  Wrench,
  type LucideIcon,
} from "lucide-react"
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
}

const STATUS_KEYS = {
  running: "chat.tool.running",
  completed: "chat.tool.completed",
  failed: "chat.tool.failed",
} as const

/** 常见工具名到图标的映射；未知工具用扳手。 */
const TOOL_ICONS: Array<[RegExp, LucideIcon]> = [
  [/^(bash|shell|exec|command|run|terminal)/i, SquareTerminal],
  [/^(read|view|cat|open)/i, FileText],
  [/^(edit|write|multiedit|patch|apply|str_replace|create)/i, FilePen],
  [/^(grep|glob|search|find|ls|list)/i, Search],
  [/^(web|fetch|http|browse)/i, Globe],
  [/^(todo|plan|task)/i, ListChecks],
]

/** 选出工具图标。 */
export function toolIcon(name: string): LucideIcon {
  return TOOL_ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? Wrench
}

/** 从工具输入里挑一行最能说明意图的摘要：JSON 优先取命令、路径或查询字段。 */
export function toolPreview(input: string | undefined): string | undefined {
  if (!input) return undefined
  const text = input.trim()
  if (text.startsWith("{")) {
    try {
      const value = JSON.parse(text) as Record<string, unknown>
      for (const field of ["command", "cmd", "file_path", "path", "pattern", "query", "url"]) {
        const candidate = value[field]
        if (typeof candidate === "string" && candidate.trim())
          return candidate.trim().split("\n")[0]
      }
    } catch {
      // 不是合法 JSON 时按普通文本取第一行。
    }
  }
  return text.split("\n")[0]
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
  const Icon = toolIcon(tool.name)
  const preview = toolPreview(tool.input)

  function toggle(): void {
    onView?.(tool)
    if (hasDetails) setOpen((value) => !value)
  }

  return (
    <div className={open ? "tool-card is-open" : "tool-card"} data-status={tool.status}>
      <Button
        variant="plain"
        className="tool-head"
        type="button"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="tool-icon" aria-hidden="true">
          <Icon className="ic ic-sm" />
        </span>
        <span className="tool-name">
          {tool.name === "tool" ? t("chat.tool.unknown") : tool.name}
        </span>
        {preview ? (
          <span className="tool-preview truncate">{preview}</span>
        ) : (
          <span className="grow" />
        )}
        <span className={`tool-status ${tool.status}`}>{t(STATUS_KEYS[tool.status])}</span>
        {hasDetails ? (
          <span className="tool-toggle">
            <span className="sr-only">{open ? t("chat.hide") : t("chat.view")}</span>
            <ChevronRight className="ic ic-sm chev" aria-hidden="true" />
          </span>
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
