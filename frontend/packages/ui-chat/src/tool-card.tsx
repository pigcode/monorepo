/**
 * 工具调用的紧凑行：图标、动作（读取/编辑/搜索…）、对象（路径、查询），编辑类显示改动行数；
 * 运行中动作文字扫光，失败标红，点击展开输入与输出。终端命令交给 CommandRow，
 * 连续的查阅合成一行。
 */
import { memo } from "react"
import { ChevronRight, Telescope } from "lucide-react"
import { useLocale } from "@pigcode/ui-primitives"
import { CommandRow } from "./command-row"
import {
  diffStats,
  isCommandTool,
  toolIcon,
  toolKind,
  toolPreview,
  type ToolCall,
} from "./tool-meta"
import { useToolOpen } from "./tool-open"

export {
  commandText,
  diffStats,
  isCommandTool,
  toolIcon,
  toolKind,
  toolPreview,
  type ToolCall,
  type ToolStatus,
} from "./tool-meta"

function firstLine(text: string | undefined): string | undefined {
  return text
    ?.split("\n")
    .find((line) => line.trim().length > 0)
    ?.trim()
}

/** 渲染工具调用；有输入或输出时允许展开查看。live 是命令运行中流出的输出。 */
export const ToolCard = memo(function ToolCard({
  tool,
  live,
  onView,
}: {
  tool: ToolCall
  live?: string | undefined
  onView?: ((tool: ToolCall) => void) | undefined
}) {
  if (isCommandTool(tool.name)) return <CommandRow tool={tool} live={live} onView={onView} />
  return <GenericToolRow tool={tool} onView={onView} />
})

function GenericToolRow({
  tool,
  onView,
}: {
  tool: ToolCall
  onView?: ((tool: ToolCall) => void) | undefined
}) {
  const { t } = useLocale()
  const [open, setOpen] = useToolOpen(tool.id, false)
  const hasDetails = Boolean(tool.input || tool.output)
  const Icon = toolIcon(tool.name)
  const kind = toolKind(tool.name)
  const preview = toolPreview(tool.input)
  const stats = diffStats(tool)
  const label = kind ? t(kind) : tool.name === "tool" ? t("chat.tool.unknown") : tool.name
  const running = tool.status === "running"

  function toggle(): void {
    onView?.(tool)
    if (hasDetails) setOpen(!open)
  }

  return (
    <div className={open && hasDetails ? "tool-row is-open" : "tool-row"} data-status={tool.status}>
      <button
        type="button"
        className="tool-row-head"
        aria-expanded={hasDetails ? open : undefined}
        onClick={toggle}
      >
        <Icon className="ic ic-sm tool-row-icon" aria-hidden="true" />
        <span
          className={running ? "tool-row-kind tool-shimmer" : "tool-row-kind"}
          title={tool.name}
        >
          {label}
        </span>
        {preview ? <span className="tool-row-target truncate">{preview}</span> : null}
        {stats && (stats.added > 0 || stats.removed > 0) ? (
          <span className="tool-row-diff" aria-label={`+${stats.added} −${stats.removed}`}>
            {stats.added > 0 ? <span className="add">+{stats.added}</span> : null}
            {stats.removed > 0 ? <span className="del">−{stats.removed}</span> : null}
          </span>
        ) : null}
        {running ? (
          <span className="sr-only">{t("chat.tool.running")}</span>
        ) : tool.status === "failed" ? (
          <span className="tool-row-status is-failed" title={firstLine(tool.output)}>
            {t("chat.tool.failed")}
          </span>
        ) : (
          <span className="sr-only">{t("chat.tool.completed")}</span>
        )}
        {hasDetails ? <ChevronRight className="ic ic-sm tool-row-chev" aria-hidden="true" /> : null}
      </button>
      {open && hasDetails ? (
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
}

/** 连续的查阅（读文件、搜索、列目录）合成一行，展开后逐条列出。 */
export const ExploreGroup = memo(function ExploreGroup({
  tools,
  onView,
}: {
  tools: readonly ToolCall[]
  onView?: ((tool: ToolCall) => void) | undefined
}) {
  const { t } = useLocale()
  const [open, setOpen] = useToolOpen(`explore-${tools[0]?.id ?? ""}`, false)
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
        onClick={() => setOpen(!open)}
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
