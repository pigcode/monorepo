/**
 * 工具调用的紧凑行：图标、动作（运行/读取/编辑/搜索…）、对象（命令、路径、查询），
 * 运行中显示点阵、失败标红；点击展开输入与输出。连续的查阅合成一行。
 */
import { memo, useState } from "react"
import {
  ChevronRight,
  FilePen,
  FileText,
  Globe,
  ListChecks,
  Search,
  SquareTerminal,
  Telescope,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import { DotMatrix, useLocale, type MessageKey } from "@pigcode/ui-primitives"

/** 工具调用的生命周期状态。 */
export type ToolStatus = "running" | "completed" | "failed"

/** 时间线里一行工具调用需要的数据。 */
export interface ToolCall {
  id: string
  name: string
  status: ToolStatus
  input: string | undefined
  output: string | undefined
}

/** 常见工具名到图标与动作文案的映射；未知工具用扳手和工具名。 */
const TOOL_KINDS: Array<[RegExp, LucideIcon, MessageKey]> = [
  [/^(bash|shell|exec|command|run|terminal)/i, SquareTerminal, "chat.tool.kind.run"],
  [/^(read|view|cat|open)/i, FileText, "chat.tool.kind.read"],
  [
    /^(edit|write|multiedit|patch|apply|str_replace|create|notebookedit)/i,
    FilePen,
    "chat.tool.kind.edit",
  ],
  [/^(grep|glob|search|find)/i, Search, "chat.tool.kind.search"],
  [/^(ls|list)/i, Search, "chat.tool.kind.list"],
  [/^(web|fetch|http|browse)/i, Globe, "chat.tool.kind.fetch"],
  [/^(todo|plan|task)/i, ListChecks, "chat.tool.kind.task"],
]

/** 选出工具图标。 */
export function toolIcon(name: string): LucideIcon {
  return TOOL_KINDS.find(([pattern]) => pattern.test(name))?.[1] ?? Wrench
}

/** 工具的动作文案；未知工具返回 null，界面直接显示工具名。 */
export function toolKind(name: string): MessageKey | null {
  return TOOL_KINDS.find(([pattern]) => pattern.test(name))?.[2] ?? null
}

/** 从工具输入里挑一行最能说明意图的摘要：JSON 优先取命令、路径或查询字段。 */
export function toolPreview(input: string | undefined): string | undefined {
  if (!input) return undefined
  const text = input.trim()
  if (text.startsWith("{")) {
    try {
      const value = JSON.parse(text) as Record<string, unknown>
      for (const field of [
        "command",
        "cmd",
        "file_path",
        "path",
        "pattern",
        "query",
        "url",
        "description",
      ]) {
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
export const ToolCard = memo(function ToolCard({
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
  const kind = toolKind(tool.name)
  const preview = toolPreview(tool.input)
  const label = kind ? t(kind) : tool.name === "tool" ? t("chat.tool.unknown") : tool.name

  function toggle(): void {
    onView?.(tool)
    if (hasDetails) setOpen((value) => !value)
  }

  return (
    <div className={open ? "tool-row is-open" : "tool-row"} data-status={tool.status}>
      <button
        type="button"
        className="tool-row-head"
        aria-expanded={hasDetails ? open : undefined}
        onClick={toggle}
      >
        <Icon className="ic ic-sm tool-row-icon" aria-hidden="true" />
        <span className="tool-row-kind" title={tool.name}>
          {label}
        </span>
        {preview ? <span className="tool-row-target truncate">{preview}</span> : null}
        {tool.status === "running" ? (
          <span className="tool-row-status">
            <DotMatrix label={t("chat.tool.running")} />
          </span>
        ) : tool.status === "failed" ? (
          <span className="tool-row-status is-failed">{t("chat.tool.failed")}</span>
        ) : (
          <span className="sr-only">{t("chat.tool.completed")}</span>
        )}
        {hasDetails ? <ChevronRight className="ic ic-sm tool-row-chev" aria-hidden="true" /> : null}
      </button>
      {open ? (
        <div className="tool-row-body">
          {tool.input ? (
            <>
              <div className="tool-row-label">{t("chat.tool.input")}</div>
              <pre>{tool.input}</pre>
            </>
          ) : null}
          {tool.output ? (
            <>
              <div className="tool-row-label">{t("chat.tool.output")}</div>
              <pre>{tool.output}</pre>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
})

/** 连续的查阅（读文件、搜索、列目录）合成一行，展开后逐条列出。 */
export const ExploreGroup = memo(function ExploreGroup({
  tools,
  onView,
}: {
  tools: readonly ToolCall[]
  onView?: ((tool: ToolCall) => void) | undefined
}) {
  const { t } = useLocale()
  const [open, setOpen] = useState(false)
  const files = tools.filter((tool) => toolKind(tool.name) === "chat.tool.kind.read").length
  const searches = tools.length - files
  const summary = [
    files > 0 ? t("chat.tool.explore.files").replace("{count}", String(files)) : null,
    searches > 0 ? t("chat.tool.explore.searches").replace("{count}", String(searches)) : null,
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <div
      className={open ? "tool-row tool-group is-open" : "tool-row tool-group"}
      data-status="completed"
    >
      <button
        type="button"
        className="tool-row-head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Telescope className="ic ic-sm tool-row-icon" aria-hidden="true" />
        <span className="tool-row-kind">{t("chat.tool.explore")}</span>
        <span className="tool-row-target truncate">{summary}</span>
        <ChevronRight className="ic ic-sm tool-row-chev" aria-hidden="true" />
      </button>
      {open ? (
        <div className="tool-group-body">
          {tools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} onView={onView} />
          ))}
        </div>
      ) : null}
    </div>
  )
})
