/** 用户与助手消息结构，沿用 pigclaude 的 msg-user / msg-ai 类名。 */
import type { ReactNode } from "react"
import { Markdown } from "./markdown"

/** 用户消息右对齐气泡。 */
export function UserMessage({ text }: { text: string }) {
  return <div className="msg-user">{text}</div>
}

/**
 * 助手消息：小头像 + 名称 + 内容，让时间线有明确归属。
 * 同一轮回复里的后续消息传 continued，只保留内容，避免头像反复出现。
 */
export function AssistantMessage({
  children,
  name = "Assistant",
  initial = "AI",
  continued = false,
}: {
  children: ReactNode
  name?: string
  initial?: string
  continued?: boolean
}) {
  return (
    <div className={continued ? "msg-ai is-continued" : "msg-ai"}>
      {continued ? null : (
        <div className="msg-ai-head">
          <span className="msg-avatar" aria-hidden="true">
            {initial}
          </span>
          <span className="msg-ai-name">{name}</span>
        </div>
      )}
      <div className="msg-ai-body md">{children}</div>
    </div>
  )
}

/** 渲染助手文本；段落、列表、代码块与行内标记按 Markdown 解析。 */
export function MessageText({ text }: { text: string }) {
  return <Markdown text={text} />
}
