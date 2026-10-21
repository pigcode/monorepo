/** 工具调用的元信息：图标与动作文案、摘要、命令文本与改动行数。 */
import {
  Camera,
  FilePen,
  FileText,
  Globe,
  Keyboard,
  ListChecks,
  MousePointerClick,
  ScanText,
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

/** MCP 工具名 `mcp__server__tool` 里的工具部分；其他名字原样返回。 */
export function baseToolName(name: string): string {
  if (!name.startsWith("mcp__")) return name
  return name.split("__").slice(2).join("__") || name
}

const BROWSER_ACTIONS: Record<string, [LucideIcon, MessageKey]> = {
  open: [Globe, "chat.tool.browser.open"],
  navigate: [Globe, "chat.tool.browser.navigate"],
  snapshot: [ScanText, "chat.tool.browser.snapshot"],
  click: [MousePointerClick, "chat.tool.browser.click"],
  type: [Keyboard, "chat.tool.browser.type"],
  press: [Keyboard, "chat.tool.browser.press"],
  scroll: [Globe, "chat.tool.browser.scroll"],
  wait_for: [Globe, "chat.tool.browser.wait"],
  evaluate: [Globe, "chat.tool.browser.evaluate"],
  screenshot: [Camera, "chat.tool.browser.screenshot"],
}

/** 内置浏览器工具的动作名（open、click…）；不是浏览器工具时返回 null。 */
export function browserAction(name: string): string | null {
  const base = baseToolName(name)
  return base.startsWith("browser_") ? base.slice("browser_".length) : null
}

/** 选出工具图标。 */
export function toolIcon(name: string): LucideIcon {
  const action = browserAction(name)
  if (action) return BROWSER_ACTIONS[action]?.[0] ?? Globe
  return TOOL_KINDS.find(([pattern]) => pattern.test(name))?.[1] ?? Wrench
}

/** 工具的动作文案；未知工具返回 null，界面直接显示工具名。 */
export function toolKind(name: string): MessageKey | null {
  const action = browserAction(name)
  if (action) return BROWSER_ACTIONS[action]?.[1] ?? null
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

/** 工具输出里的文字与图片（MCP 或 Anthropic 的内容块数组）；不是内容块时文字就是原输出。 */
export function toolOutputParts(output: string | undefined): { text: string; images: string[] } {
  if (!output?.trim().startsWith("[")) return { text: output ?? "", images: [] }
  let blocks: unknown
  try {
    blocks = JSON.parse(output)
  } catch {
    return { text: output, images: [] }
  }
  if (!Array.isArray(blocks)) return { text: output, images: [] }
  const texts: string[] = []
  const images: string[] = []
  for (const block of blocks as Array<Record<string, unknown> | null>) {
    if (block?.type === "text" && typeof block.text === "string") texts.push(block.text)
    if (block?.type !== "image") continue
    const source = block.source as Record<string, unknown> | undefined
    const data = typeof block.data === "string" ? block.data : source?.data
    const mime = typeof block.mimeType === "string" ? block.mimeType : source?.media_type
    if (typeof data === "string" && typeof mime === "string" && /^image\//.test(mime)) {
      images.push(`data:${mime};base64,${data}`)
    }
  }
  if (texts.length === 0 && images.length === 0) return { text: output, images: [] }
  return { text: texts.join("\n"), images }
}

function hostOf(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`
  } catch {
    return url
  }
}

/** 浏览器工具的一行摘要：打开的网址、点击的元素、输入的文字…… */
export function browserPreview(
  tool: Pick<ToolCall, "name" | "input" | "output">,
): string | undefined {
  const action = browserAction(tool.name)
  if (!action) return undefined
  const value = parseJson(tool.input) ?? {}
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const candidate = value[key]
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim()
    }
    return undefined
  }
  switch (action) {
    case "open":
    case "navigate": {
      const url = pick("url")
      return url ? hostOf(url) : pick("action")
    }
    case "click":
      return pick("text", "selector", "ref")
    case "type": {
      const text = pick("text")
      const target = pick("ref", "selector")
      return text ? `"${text}"${target ? ` → ${target}` : ""}` : target
    }
    case "press":
      return pick("key")
    case "scroll":
      return pick("ref", "selector", "direction") ?? "down"
    case "wait_for":
      return pick("text", "selector", "url")
    case "evaluate":
      return pick("expression")?.split("\n")[0]
    default: {
      const text = toolOutputParts(tool.output).text
      const url = /(?:URL: |Screenshot of )(\S+)/.exec(text)?.[1]
      return url ? hostOf(url) : undefined
    }
  }
}

/** 读写文件类工具操作的文件路径；其他工具返回 undefined。 */
export function toolFilePath(tool: Pick<ToolCall, "name" | "input">): string | undefined {
  const kind = toolKind(tool.name)
  if (kind !== "chat.tool.kind.read" && kind !== "chat.tool.kind.edit") return undefined
  const value = parseJson(tool.input)
  if (value) {
    for (const key of ["file_path", "path", "notebook_path"]) {
      const candidate = value[key]
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim()
    }
    return undefined
  }
  if (!tool.input?.trim().startsWith("[")) return undefined
  try {
    const entries = JSON.parse(tool.input) as Array<{ path?: unknown } | null>
    const first = Array.isArray(entries) ? entries[0]?.path : undefined
    return typeof first === "string" && first.trim() ? first.trim() : undefined
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
