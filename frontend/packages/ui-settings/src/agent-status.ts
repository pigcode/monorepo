/** 把 agent 的启用状态与检测结果归成一行状态：色调、标题与补充说明。 */
import type { AgentSummary, ProviderStatus } from "@pigcode/contracts"
import type { MessageKey } from "@pigcode/ui-primitives"

/** 状态色调；与 status-dot 的颜色一一对应。 */
export type AgentTone = "ready" | "warning" | "error" | "checking" | "off"

/** 一行状态。 */
export interface AgentHeadline {
  tone: AgentTone
  label: MessageKey
  /** 版本、账号或错误原因，没有时为 null。 */
  detail: string | null
}

/**
 * 停用 > 加载失败 > 检测中 > 未安装 > 未登录 > 就绪。
 * 没实现检测的 agent（authenticated 为 null 且没有版本）直接算就绪。
 */
export function agentHeadline(
  agent: Pick<AgentSummary, "enabled" | "registered" | "error">,
  status: ProviderStatus | undefined,
): AgentHeadline {
  if (!agent.enabled) return { tone: "off", label: "agents.status.disabled", detail: null }
  if (!agent.registered) {
    return { tone: "error", label: "agents.status.failed", detail: agent.error }
  }
  if (!status) return { tone: "checking", label: "agents.status.checking", detail: null }
  // 找不到可执行文件的细节（试过的路径、安装方式）放在展开的编辑区里，列表只说结论。
  if (!status.installed) return { tone: "error", label: "agents.status.notInstalled", detail: null }
  const detail = [status.version, status.account].filter(Boolean).join(" · ") || null
  if (status.authenticated === false) {
    return { tone: "warning", label: "agents.status.signedOut", detail }
  }
  return { tone: "ready", label: "agents.status.ready", detail }
}

/** 头像上的缩写：取每个词的首字母，最多两个。 */
export function agentInitials(name: string): string {
  const words = name.split(/[\s_-]+/).filter(Boolean)
  const letters =
    words.length > 1 ? words.map((word) => word[0]) : [...(words[0] ?? "?").slice(0, 2)]
  return letters.slice(0, 2).join("").toUpperCase()
}

/** 按 id 得到一个稳定的色相，给没有图标的 agent 区分颜色。 */
export function agentHue(id: string): number {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return hash
}
