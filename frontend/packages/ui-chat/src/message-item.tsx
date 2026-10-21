/** 消息正文：用户消息右对齐气泡，助手文本按 Markdown 渲染。 */
import { memo, type ReactNode } from "react"
import { Markdown } from "./markdown"

/** 用户消息右对齐气泡。 */
export function UserMessage({ text }: { text: string }) {
  return <div className="msg-user">{text}</div>
}

/** 助手消息容器；时间线按轮渲染后不再逐条显示头像，保留给插件的消息渲染器使用。 */
export function AssistantMessage({ children }: { children: ReactNode }) {
  return <div className="msg-ai md">{children}</div>
}

/** 渲染助手文本；同一段文本只解析一次 Markdown。 */
export const MessageText = memo(function MessageText({ text }: { text: string }) {
  return <Markdown text={text} />
})
