/** 工具调用：一行“动词 + 对象”的步骤；shell 命令单独成卡片；点击展开输入与输出。 */
import { useState } from "react"
import {
  AlertCircle,
  Bot,
  ChevronRight,
  FilePen,
  FileText,
  FolderOpen,
  Globe,
  ListChecks,
  Loader2,
  Search,
  Terminal,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import { Button, useLocale, type MessageKey } from "@pigcode/ui-primitives"

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

/** 工具种类：决定图标、动词与是否按命令卡片渲染。 */
export type ToolKind =
  | "read"
  | "write"
  | "edit"
  | "command"
  | "search"
  | "find"
  | "list"
  | "fetch"
  | "subagent"
  | "todo"
  | "other"

const KIND_VERB: Record<ToolKind, MessageKey | null> = {
  read: "chat.tool.verb.read",
  write: "chat.tool.verb.write",
  edit: "chat.tool.verb.edit",
  command: "chat.tool.verb.command",
  search: "chat.tool.verb.search",
  find: "chat.tool.verb.find",
  list: "chat.tool.verb.list",
  fetch: "chat.tool.verb.fetch",
  subagent: "chat.tool.verb.subagent",
  todo: "chat.tool.verb.todo",
  other: null,
}

const KIND_ICON: Record<ToolKind, LucideIcon> = {
  read: FileText,
  write: FilePen,
  edit: FilePen,
  command: Terminal,
  search: Search,
  find: Search,
  list: FolderOpen,
  fetch: Globe,
  subagent: Bot,
  todo: ListChecks,
  other: Wrench,
}

/** 按 Claude Code / Codex 常见工具名归类；未知名字按通用工具处理。 */
export function toolKind(name: string): ToolKind {
  const key = name.toLowerCase().replace(/[^a-z_]/g, "")
  if (/^(bash|shell|exec|exec_command|terminal|run_command|container_exec)$/.test(key)) {
    return "command"
  }
  if (/^(read|read_file|view|cat|notebookread)$/.test(key)) return "read"
  if (/^(write|write_file|create_file)$/.test(key)) return "write"
  if (/^(edit|multiedit|apply_patch|str_replace|notebookedit|update_file)$/.test(key)) {
    return "edit"
  }
  if (/^(grep|rg|search|codebase_search|websearch|web_search)$/.test(key)) return "search"
  if (/^(glob|find|file_search)$/.test(key)) return "find"
  if (/^(ls|list|list_dir|list_directory)$/.test(key)) return "list"
  if (/^(webfetch|fetch|web_fetch|http)$/.test(key)) return "fetch"
  if (/^(task|agent|subagent)$/.test(key)) return "subagent"
  if (/^(todowrite|todo|update_plan)$/.test(key)) return "todo"
  return "other"
}

/** 从输入里挑出最能代表这次调用的对象：文件路径、命令或查询词。 */
export function toolTarget(input: string | undefined): string {
  if (!input) return ""
  const trimmed = input.trim()
  if (trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (typeof parsed === "object" && parsed !== null) {
        const record = parsed as Record<string, unknown>
        for (const key of [
          "command",
          "cmd",
          "file_path",
          "filePath",
          "path",
          "notebook_path",
          "pattern",
          "query",
          "url",
          "description",
          "prompt",
        ]) {
          const value = record[key]
          if (typeof value === "string" && value.trim().length > 0) {
            return value.trim().split("\n")[0]?.slice(0, 200) ?? ""
          }
          if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
            return (value as string[]).join(" ").slice(0, 200)
          }
        }
      }
    } catch {
      // 不是 JSON 就当普通文本处理。
    }
  }
  return (
    trimmed
      .split("\n")
      .find((line) => line.trim().length > 0)
      ?.trim()
      .slice(0, 200) ?? ""
  )
}

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

/** 状态图标：运行中转圈，失败警告，其余用工具种类的图标。 */
function StatusGlyph({ status, kind }: { status: ToolStatus; kind: ToolKind }) {
  if (status === "running") return <Loader2 className="ic ic-sm spin" aria-hidden="true" />
  if (status === "failed") return <AlertCircle className="ic ic-sm" aria-hidden="true" />
  const Icon = KIND_ICON[kind]
  return <Icon className="ic ic-sm" aria-hidden="true" />
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
  const kind = toolKind(tool.name)
  const hasDetails = Boolean(tool.input || tool.output)
  const duration = toolDuration(tool)
  const target = toolTarget(tool.input)
  const verbKey = KIND_VERB[kind]
  const verb = verbKey ? t(verbKey) : tool.name === "tool" ? t("chat.tool.unknown") : tool.name
  const statusText = t(STATUS_KEYS[tool.status])

  function toggle(): void {
    onView?.(tool)
    if (hasDetails) setOpen((value) => !value)
  }

  const details = open ? (
    <div className="tool-body">
      {kind !== "command" && tool.input ? (
        <>
          <div className="tool-label">{t("chat.tool.input")}</div>
          <pre>{tool.input}</pre>
        </>
      ) : null}
      {tool.output ? (
        <>
          {kind !== "command" ? <div className="tool-label">{t("chat.tool.output")}</div> : null}
          <pre>{tool.output}</pre>
        </>
      ) : null}
    </div>
  ) : null

  if (kind === "command") {
    return (
      <div
        className={`tool-card tool-command${open ? " is-open" : ""}`}
        data-status={tool.status}
        data-kind={kind}
      >
        <Button
          variant="plain"
          className="tool-head"
          type="button"
          aria-expanded={open}
          title={tool.name}
          onClick={toggle}
        >
          <span className="tool-icon" aria-hidden="true">
            <StatusGlyph status={tool.status} kind={kind} />
          </span>
          <span className="tool-command-line truncate" title={target || undefined}>
            <span className="tool-prompt" aria-hidden="true">
              $
            </span>
            <span className="tool-name">{target || verb}</span>
          </span>
          <span className="grow" />
          {duration ? <span className="tool-duration num">{duration}</span> : null}
          <span className={`tool-status ${tool.status}`}>{statusText}</span>
          {hasDetails ? <ChevronRight className="ic ic-sm tool-chev" aria-hidden="true" /> : null}
        </Button>
        {details}
      </div>
    )
  }

  return (
    <div
      className={`tool-card${open ? " is-open" : ""}`}
      data-status={tool.status}
      data-kind={kind}
    >
      <Button
        variant="plain"
        className="tool-head"
        type="button"
        aria-expanded={open}
        title={tool.name}
        onClick={toggle}
      >
        <span className="tool-icon" aria-hidden="true">
          <StatusGlyph status={tool.status} kind={kind} />
        </span>
        <span className="tool-name">{verb}</span>
        {target ? (
          <span className="tool-summary truncate" title={target}>
            {target}
          </span>
        ) : null}
        <span className="grow" />
        {duration ? <span className="tool-duration num">{duration}</span> : null}
        <span className={`tool-status ${tool.status}`}>{statusText}</span>
        {hasDetails ? <ChevronRight className="ic ic-sm tool-chev" aria-hidden="true" /> : null}
      </Button>
      {details}
    </div>
  )
}
