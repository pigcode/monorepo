/** 用户与助手消息结构，沿用 pigclaude 的 msg-user / msg-ai 类名。 */
import { useEffect, useState, type ReactNode } from "react"
import { Check, Copy } from "lucide-react"
import { useLocale } from "@pigcode/ui-primitives"

/** 用户消息右对齐气泡。 */
export function UserMessage({ text }: { text: string }) {
  return <div className="msg-user">{text}</div>
}

/** 助手消息：小头像 + 名称 + 时间 + 内容，让时间线有明确归属。 */
export function AssistantMessage({
  children,
  name = "Assistant",
  initial = "AI",
  time,
}: {
  children: ReactNode
  name?: string
  initial?: string
  /** 已格式化的时间文本；流式消息没有时间。 */
  time?: string
}) {
  return (
    <div className="msg-ai">
      <div className="msg-ai-head">
        <span className="msg-avatar" aria-hidden="true">
          {initial}
        </span>
        <span className="msg-ai-name">{name}</span>
        {time ? <time className="msg-ai-time num">{time}</time> : null}
      </div>
      <div className="msg-ai-body">{children}</div>
    </div>
  )
}

/** 消息正文的分段：普通文本或围栏代码块。 */
export type MessageSegment =
  { kind: "text"; text: string } | { kind: "code"; code: string; lang: string }

/**
 * 按 ``` 围栏把正文切成文本段与代码段。
 * 未闭合的围栏视为延续到结尾，流式输出时代码块也能立即以等宽显示。
 */
export function splitMessage(text: string): MessageSegment[] {
  const segments: MessageSegment[] = []
  const lines = text.split("\n")
  let buffer: string[] = []
  let code: string[] | null = null
  let lang = ""

  function flushText(): void {
    // 围栏前后的空行不进入段落，否则 pre-wrap 会多出一行空白。
    const value = buffer.join("\n").replace(/^\n+|\n+$/g, "")
    if (value.trim().length > 0) segments.push({ kind: "text", text: value })
    buffer = []
  }

  for (const line of lines) {
    const fence = /^\s*```\s*([\w+#.-]*)\s*$/.exec(line)
    if (fence && code === null) {
      flushText()
      code = []
      lang = fence[1] ?? ""
      continue
    }
    if (fence && code !== null) {
      segments.push({ kind: "code", code: code.join("\n"), lang })
      code = null
      lang = ""
      continue
    }
    if (code !== null) code.push(line)
    else buffer.push(line)
  }
  if (code !== null) segments.push({ kind: "code", code: code.join("\n"), lang })
  else flushText()
  return segments
}

/** 把一段纯文本里的 `行内代码` 换成 code 元素；其余原样输出。 */
function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(`[^`\n]+`)/g)
  return parts.map((part, index) =>
    part.length > 2 && part.startsWith("`") && part.endsWith("`") ? (
      <code key={index}>{part.slice(1, -1)}</code>
    ) : (
      part
    ),
  )
}

/** 代码块：语言标签 + 复制按钮 + 等宽正文。 */
export function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const { t } = useLocale()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return undefined
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  function copy(): void {
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard
    if (!clipboard?.writeText) return
    void clipboard.writeText(code).then(
      () => setCopied(true),
      () => undefined,
    )
  }

  return (
    <div className="msg-code" data-lang={lang || undefined}>
      <div className="msg-code-head">
        <span className="msg-code-lang">{lang || "text"}</span>
        <button
          type="button"
          className="msg-code-copy"
          aria-label={t("chat.copy")}
          title={t("chat.copy")}
          data-copied={copied || undefined}
          onClick={copy}
        >
          {copied ? (
            <Check className="ic ic-sm" aria-hidden="true" />
          ) : (
            <Copy className="ic ic-sm" aria-hidden="true" />
          )}
          <span>{copied ? t("chat.copied") : t("chat.copy")}</span>
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

/**
 * 把正文拆成段落与代码块；单段内的换行由 CSS 保留。
 * trailing（如流式光标）接在最后一个段落的行尾；最后一段是代码块时放在其后。
 */
export function MessageText({ text, trailing }: { text: string; trailing?: ReactNode }) {
  const segments = splitMessage(text)
  const lastIndex = segments.length - 1
  const lastIsText = segments[lastIndex]?.kind === "text"
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.kind === "code") {
          return <CodeBlock key={index} code={segment.code} lang={segment.lang} />
        }
        const paragraphs = segment.text
          .split(/\n{2,}/)
          .filter((paragraph) => paragraph.trim().length > 0)
        return paragraphs.map((paragraph, paragraphIndex) => (
          <p key={`${index}-${paragraphIndex}`}>
            {renderInline(paragraph)}
            {index === lastIndex && paragraphIndex === paragraphs.length - 1 ? trailing : null}
          </p>
        ))
      })}
      {trailing && !lastIsText ? trailing : null}
    </>
  )
}
