/** 把线程事件的 payload 解析成时间线组件需要的结构；字段名兼容各 provider 的变体。 */
import type { ThreadEvent } from "@pigcode/contracts"
import type { ApprovalDecision, ApprovalRequest } from "./approval-card"
import type { DiffFile, FileChangeSummary } from "./diff-summary"
import type { PlanStep, PlanStepStatus, PlanUpdate } from "./plan-card"
import type { SubagentCall, SubagentStatus } from "./subagent-card"
import type { ToolCall, ToolStatus } from "./tool-card"

/** 把 unknown payload 收窄为对象。 */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

/** 把 unknown payload 收窄为数组。 */
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : []
}

/** 只接受字符串字段。 */
export function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

/** 只接受有限数字字段。 */
function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

/** 把任意 payload 值转成可读文本。 */
function displayValue(value: unknown): string | undefined {
  if (typeof value === "string") return value || undefined
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (value === null || value === undefined) return undefined
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

/** 解析工具调用事件；字段名兼容常见的 tool / command / output 变体。 */
export function toolFromEvent(event: ThreadEvent, status: ToolStatus): ToolCall | undefined {
  const payload = asRecord(event.payload)
  if (!payload) return undefined
  const name = asText(payload.name) ?? asText(payload.tool) ?? asText(payload.title) ?? "tool"
  const id =
    asText(payload.id) ??
    asText(payload.toolCallId) ??
    asText(payload.callId) ??
    `tool-${event.seq}`
  return {
    id,
    name,
    status,
    input:
      displayValue(payload.input) ??
      displayValue(payload.command) ??
      displayValue(payload.arguments),
    output: displayValue(payload.output) ?? displayValue(payload.result),
  }
}

/** 合并同一工具的 started / completed 事件。 */
function mergeTool(existing: ToolCall | undefined, next: ToolCall): ToolCall {
  if (!existing) return next
  return {
    id: existing.id,
    name: next.name === "tool" ? existing.name : next.name,
    status: next.status,
    input: next.input ?? existing.input,
    output: next.output ?? existing.output,
  }
}

/** 收集工具最终状态；渲染时只输出一张卡片。 */
export function collectTools(events: ThreadEvent[]): Map<string, ToolCall> {
  const tools = new Map<string, ToolCall>()
  for (const event of events) {
    if (event.type !== "tool.started" && event.type !== "tool.completed") continue
    const payload = asRecord(event.payload)
    const failed = payload?.error !== undefined || payload?.status === "failed"
    const status: ToolStatus =
      event.type === "tool.started" ? "running" : failed ? "failed" : "completed"
    const next = toolFromEvent(event, status)
    if (!next) continue
    tools.set(next.id, mergeTool(tools.get(next.id), next))
  }
  return tools
}

/** 解析审批请求。 */
export function approvalFromEvent(event: ThreadEvent): ApprovalRequest | undefined {
  const payload = asRecord(event.payload)
  if (!payload) return undefined
  return {
    id: asText(payload.id) ?? asText(payload.requestId) ?? `approval-${event.seq}`,
    title: asText(payload.title),
    description: asText(payload.description) ?? asText(payload.reason) ?? asText(payload.question),
    command: displayValue(payload.command),
  }
}

/** 把审批决议字段归一化为本地联合类型。 */
function asDecision(value: unknown): ApprovalDecision | undefined {
  switch (value) {
    case "allow-once":
    case "allow_once":
    case "allowOnce":
      return "allow-once"
    case "allow-for-session":
    case "allow_for_session":
    case "allowSession":
      return "allow-for-session"
    case "deny":
    case "denied":
      return "deny"
    default:
      return undefined
  }
}

/** 收集已处理的审批请求。 */
export function collectResolved(events: ThreadEvent[]): Map<string, ApprovalDecision> {
  const resolved = new Map<string, ApprovalDecision>()
  for (const event of events) {
    if (event.type !== "approval.resolved") continue
    const payload = asRecord(event.payload)
    if (!payload) continue
    const id = asText(payload.id) ?? asText(payload.requestId)
    const decision =
      asDecision(payload.decision) ?? asDecision(payload.action) ?? asDecision(payload.outcome)
    if (id && decision) resolved.set(id, decision)
  }
  return resolved
}

/** 归一化计划步骤状态。 */
function asPlanStatus(value: unknown): PlanStepStatus {
  switch (value) {
    case "completed":
    case "done":
      return "completed"
    case "in-progress":
    case "in_progress":
    case "active":
    case "running":
      return "in-progress"
    default:
      return "pending"
  }
}

/** 解析 plan.updated 事件；支持字符串步骤和对象步骤。 */
export function planFromEvent(event: ThreadEvent): PlanUpdate | undefined {
  const payload = asRecord(event.payload)
  if (!payload) return undefined
  const rawSteps =
    asArray(payload.steps).length > 0 ? asArray(payload.steps) : asArray(payload.plan)
  const steps: PlanStep[] = []
  for (const [index, entry] of rawSteps.entries()) {
    if (typeof entry === "string") {
      steps.push({ text: entry, status: "pending" })
      continue
    }
    const record = asRecord(entry)
    if (!record) continue
    steps.push({
      text: asText(record.text) ?? asText(record.step) ?? asText(record.title) ?? `#${index + 1}`,
      status: asPlanStatus(record.status),
    })
  }
  if (steps.length === 0 && typeof payload.text === "string") {
    for (const line of payload.text.split("\n")) {
      const text = line.trim()
      if (text) steps.push({ text, status: "pending" })
    }
  }
  if (steps.length === 0) return undefined
  return { title: asText(payload.title) ?? asText(payload.explanation), steps }
}

/** 解析 diff 文本或行数组。 */
function parseDiffLines(value: unknown): string[] {
  if (typeof value === "string") return value.split("\n").filter((line) => line.length > 0)
  if (!Array.isArray(value)) return []
  const lines: string[] = []
  for (const entry of value as unknown[]) {
    if (typeof entry === "string") lines.push(entry)
  }
  return lines
}

/** 解析 file.changed 事件。 */
export function diffFromEvent(event: ThreadEvent): FileChangeSummary | undefined {
  const payload = asRecord(event.payload)
  if (!payload) return undefined
  const entries =
    asArray(payload.files).length > 0 ? asArray(payload.files) : asArray(payload.changes)
  const files: DiffFile[] = []
  for (const entry of entries) {
    if (typeof entry === "string") {
      files.push({ path: entry, lines: [] })
      continue
    }
    const record = asRecord(entry)
    if (!record) continue
    const path = asText(record.path) ?? asText(record.file) ?? asText(record.name)
    if (!path) continue
    files.push({ path, lines: parseDiffLines(record.diff ?? record.patch ?? record.lines) })
  }
  if (files.length === 0) {
    const path = asText(payload.path) ?? asText(payload.file) ?? asText(payload.name)
    if (path) files.push({ path, lines: parseDiffLines(payload.diff ?? payload.patch) })
  }
  if (files.length === 0) return undefined

  let additions = asNumber(payload.additions)
  let deletions = asNumber(payload.deletions)
  if (additions === undefined || deletions === undefined) {
    let countedAdditions = 0
    let countedDeletions = 0
    for (const file of files) {
      for (const line of file.lines) {
        if (line.startsWith("+")) countedAdditions += 1
        else if (line.startsWith("-") || line.startsWith("−")) countedDeletions += 1
      }
    }
    additions = additions ?? countedAdditions
    deletions = deletions ?? countedDeletions
  }
  return { files, additions, deletions }
}

/** 解析子 agent 完成状态；缺失时按 isError 推导。 */
function asSubagentStatus(value: unknown, isError: boolean): SubagentStatus {
  switch (value) {
    case "running":
    case "completed":
    case "failed":
    case "interrupted":
      return value
    default:
      return isError ? "failed" : "completed"
  }
}

/** 子 agent 交回的结果：字符串、文本块数组或带 content 的对象，取出其中的文字。 */
function subagentOutput(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined
  if (Array.isArray(value)) {
    const text = value
      .map((block) => (typeof block === "string" ? block : asText(asRecord(block)?.text)))
      .filter((part): part is string => Boolean(part))
      .join("\n\n")
    return text.trim() || undefined
  }
  const record = asRecord(value)
  if (!record) return undefined
  return subagentOutput(record.content) ?? asText(record.text) ?? asText(record.result)
}

/** 判断事件是否属于某个子 agent；这类事件只在卡片内部展示。 */
export function isParentScoped(type: ThreadEvent["type"]): boolean {
  return type === "message.completed" || type === "tool.started" || type === "tool.completed"
}

/** 收集子 agent 卡片及其内部事件。 */
export function collectSubagents(events: ThreadEvent[]): Map<string, SubagentCall> {
  const children = new Map<string, ThreadEvent[]>()
  for (const event of events) {
    if (!isParentScoped(event.type)) continue
    const payload = asRecord(event.payload)
    const parent = asText(payload?.parentToolUseId)
    if (!parent) continue
    const list = children.get(parent) ?? []
    list.push(event)
    children.set(parent, list)
  }

  const subagents = new Map<string, SubagentCall>()
  for (const event of [...events].sort((left, right) => left.seq - right.seq)) {
    const payload = asRecord(event.payload)
    if (!payload) continue
    const id = asText(payload.toolCallId) ?? asText(payload.id)
    if (!id) continue
    if (event.type === "subagent.started") {
      const entry: SubagentCall = {
        id,
        name: asText(payload.name) ?? id,
        status: "running",
        events: children.get(id) ?? [],
        runId: event.runId,
      }
      const description = asText(payload.description)
      if (description) entry.description = description
      const prompt = asText(payload.prompt)
      if (prompt) entry.prompt = prompt
      const model = asText(payload.model)
      if (model) entry.model = model
      subagents.set(id, entry)
      continue
    }
    if (event.type === "subagent.completed") {
      const entry = subagents.get(id)
      if (!entry) continue
      entry.status = asSubagentStatus(payload.status, payload.isError === true)
      const output = subagentOutput(payload.output)
      if (output) entry.output = output
    }
  }
  return subagents
}
