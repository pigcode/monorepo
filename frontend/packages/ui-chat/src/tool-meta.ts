/** 工具调用的元信息：图标与动作文案、摘要、命令文本与改动行数。 */
import {
  FilePen,
  FileText,
  Globe,
  ListChecks,
  Search,
  SquareTerminal,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import type { MessageKey } from "@pigcode/ui-primitives"

/** 工具调用的生命周期状态。 */
export type ToolStatus = "running" | "completed" | "failed"

/** 时间线里一行工具调用需要的数据。 */
export interface ToolCall {
  id: string
  name: string
  status: ToolStatus
  input: string | undefined
  output: string | undefined
  /** 开始与结束时间（事件的 createdAt），用来显示耗时。 */
  startedAt?: string | undefined
  endedAt?: string | undefined
  /** 命令的退出码；provider 不报告时缺省。 */
  exitCode?: number | undefined
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

/** 真正执行 shell 命令的工具（Claude 的 Bash、Codex 的 commandExecution 等）。 */
const COMMAND_TOOL = /^(bash|shell|exec|exec_command|local_shell|run_command|terminal)$/i

export function isCommandTool(name: string): boolean {
  return COMMAND_TOOL.test(name)
}

function parseJson(text: string | undefined): Record<string, unknown> | undefined {
  if (!text) return undefined
  const trimmed = text.trim()
  if (!trimmed.startsWith("{")) return undefined
  try {
    const value: unknown = JSON.parse(trimmed)
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

/** 从工具输入里挑一行最能说明意图的摘要：JSON 优先取命令、路径或查询字段。 */
export function toolPreview(input: string | undefined): string | undefined {
  if (!input) return undefined
  const value = parseJson(input)
  if (value) {
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
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim().split("\n")[0]
    }
    const command = value.command
    if (Array.isArray(command)) return commandText(input)?.split("\n")[0]
    return undefined
  }
  return input.trim().split("\n")[0]
}

/** 去掉 `bash -lc '…'` 这类外壳，只留真正执行的命令。 */
function unwrapShell(command: string): string {
  const match = /^(?:\/bin\/)?(?:zsh|bash|sh)\s+-l?c\s+([\s\S]+)$/i.exec(command.trim())
  if (!match?.[1]) return command.trim()
  const inner = match[1].trim()
  const quoted = /^(['"])([\s\S]*)\1$/.exec(inner)
  return (quoted?.[2] ?? inner).trim()
}

/** 命令工具执行的完整命令；输入可能是字符串、JSON 里的字符串，或 argv 数组。 */
export function commandText(input: string | undefined): string | undefined {
  if (!input) return undefined
  const value = parseJson(input)
  if (!value) return unwrapShell(input)
  const command = value.command ?? value.cmd
  if (typeof command === "string") return unwrapShell(command)
  if (Array.isArray(command) && command.every((part) => typeof part === "string")) {
    const parts = command as string[]
    const shell = parts.findIndex((part) => part === "-lc" || part === "-c")
    if (shell >= 0 && parts[shell + 1]) return parts[shell + 1]!.trim()
    return parts.join(" ")
  }
  return undefined
}

function countLines(text: unknown): number {
  if (typeof text !== "string" || text.length === 0) return 0
  return text.replace(/\n$/, "").split("\n").length
}

/** 统一 diff 里新增与删除的行数，跳过 +++/--- 文件头。 */
function unifiedStats(diff: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue
    if (line.startsWith("+")) added += 1
    else if (line.startsWith("-")) removed += 1
  }
  return { added, removed }
}

/** Codex 的文件改动列表：每项带统一 diff，或新文件的完整内容。 */
function parseChanges(input: string | undefined): { added: number; removed: number } | null {
  if (!input?.trim().startsWith("[")) return null
  let entries: unknown
  try {
    entries = JSON.parse(input)
  } catch {
    return null
  }
  if (!Array.isArray(entries)) return null
  let added = 0
  let removed = 0
  for (const entry of entries as Array<Record<string, unknown> | null>) {
    const diff = entry?.diff ?? entry?.unified_diff
    if (typeof diff === "string") {
      const stats = unifiedStats(diff)
      added += stats.added
      removed += stats.removed
    } else if (typeof entry?.content === "string") {
      added += countLines(entry.content)
    }
  }
  return { added, removed }
}

/** 编辑类工具改了多少行；无法判断时返回 null。 */
export function diffStats(tool: Pick<ToolCall, "name" | "input">): {
  added: number
  removed: number
} | null {
  if (toolKind(tool.name) !== "chat.tool.kind.edit") return null
  const changes = parseChanges(tool.input)
  if (changes) return changes
  const value = parseJson(tool.input)
  if (!value) return null
  if (typeof value.old_string === "string" || typeof value.new_string === "string") {
    return { added: countLines(value.new_string), removed: countLines(value.old_string) }
  }
  if (Array.isArray(value.edits)) {
    let added = 0
    let removed = 0
    for (const edit of value.edits as Array<Record<string, unknown>>) {
      added += countLines(edit?.new_string)
      removed += countLines(edit?.old_string)
    }
    return { added, removed }
  }
  if (typeof value.content === "string") return { added: countLines(value.content), removed: 0 }
  if (typeof value.patch === "string") return unifiedStats(value.patch)
  return null
}
