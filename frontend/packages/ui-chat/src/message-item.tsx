/** 用户与助手消息结构，沿用 pigclaude 的 msg-user / msg-ai 类名。 */
import { useEffect, useState, type ReactNode } from "react"
import { Check, Copy } from "lucide-react"
import { useLocale } from "@pigcode/ui-primitives"

/** 复制到剪贴板；没有剪贴板 API 时静默忽略。 */
function copyText(text: string): Promise<boolean> {
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard
  if (!clipboard?.writeText) return Promise.resolve(false)
  return clipboard.writeText(text).then(
    () => true,
    () => false,
  )
}

/** 复制按钮：点击后短暂显示“已复制”。 */
function CopyButton({ text, className }: { text: string; className: string }) {
  const { t } = useLocale()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return undefined
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  return (
    <button
      type="button"
      className={className}
      aria-label={t("chat.copy")}
      title={t("chat.copy")}
      data-copied={copied || undefined}
      onClick={() => void copyText(text).then((ok) => ok && setCopied(true))}
    >
      {copied ? (
        <Check className="ic ic-sm" aria-hidden="true" />
      ) : (
        <Copy className="ic ic-sm" aria-hidden="true" />
      )}
      <span>{copied ? t("chat.copied") : t("chat.copy")}</span>
    </button>
  )
}

/** 用户消息：整行的提示卡片，悬停时可复制。 */
export function UserMessage({ text }: { text: string }) {
  return (
    <div className="msg-user">
      <div className="msg-user-text">{text}</div>
      <CopyButton text={text} className="msg-user-copy" />
    </div>
  )
}

/** 助手消息：正文直接落在时间线上；下方一行是复制与时间。 */
export function AssistantMessage({
  children,
  name = "Assistant",
  time,
  timeTitle,
  text,
}: {
  children: ReactNode
  name?: string
  /** 兼容旧调用方；新版不再显示头像首字母。 */
  initial?: string
  /** 已格式化的时间文本；流式消息没有时间。 */
  time?: string
  /** 悬停时显示的完整时间。 */
  timeTitle?: string
  /** 原始正文；提供时显示复制按钮。 */
  text?: string
}) {
  return (
    <div className="msg-ai">
      <div className="msg-ai-body">{children}</div>
      {text || time ? (
        <div className="msg-ai-actions">
          {text ? <CopyButton text={text} className="msg-ai-copy" /> : null}
          {time ? (
            <time className="msg-ai-time num" title={timeTitle ?? `${name}`}>
              {time}
            </time>
          ) : null}
        </div>
      ) : null}
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

/** 文本段里的块级结构：标题、列表或段落。 */
export type TextBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "paragraph"; text: string }

/** 把一段纯文本切成标题、列表与段落；段落之间以空行分隔。 */
export function splitBlocks(text: string): TextBlock[] {
  const blocks: TextBlock[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  function flushParagraph(): void {
    const value = paragraph.join("\n").trim()
    if (value) blocks.push({ kind: "paragraph", text: value })
    paragraph = []
  }
  function flushList(): void {
    if (list && list.items.length > 0) blocks.push({ kind: "list", ...list })
    list = null
  }

  for (const line of text.split("\n")) {
    const heading = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line)
    const bullet = /^\s*[-*•]\s+(.+)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push({ kind: "heading", level: heading[1]?.length ?? 1, text: heading[2] ?? "" })
      continue
    }
    if (bullet || numbered) {
      flushParagraph()
      const ordered = Boolean(numbered)
      const item = (numbered?.[1] ?? bullet?.[1] ?? "").trim()
      if (list && list.ordered !== ordered) flushList()
      list ??= { ordered, items: [] }
      list.items.push(item)
      continue
    }
    if (line.trim().length === 0) {
      flushParagraph()
      flushList()
      continue
    }
    flushList()
    paragraph.push(line)
  }
  flushParagraph()
  flushList()
  return blocks
}

/** 行内标记：`代码` 与 **加粗**；其余原样输出。 */
export function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g)
  return parts.map((part, index) => {
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>
    }
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

/** 代码块：语言标签 + 复制按钮 + 等宽正文。 */
export function CodeBlock({ code, lang }: { code: string; lang: string }) {
  return (
    <div className="msg-code" data-lang={lang || undefined}>
      <div className="msg-code-head">
        <span className="msg-code-lang">{lang || "text"}</span>
        <CopyButton text={code} className="msg-code-copy" />
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

/** 渲染一个文本块；trailing 接在最后一个块的末尾。 */
function Block({ block, trailing }: { block: TextBlock; trailing?: ReactNode }) {
  if (block.kind === "heading") {
    const Tag = block.level === 1 ? "h3" : block.level === 2 ? "h4" : "h5"
    return (
      <Tag className="msg-heading">
        {renderInline(block.text)}
        {trailing}
      </Tag>
    )
  }
  if (block.kind === "list") {
    const Tag = block.ordered ? "ol" : "ul"
    const last = block.items.length - 1
    return (
      <Tag className="msg-list">
        {block.items.map((item, index) => (
          <li key={index}>
            {renderInline(item)}
            {index === last ? trailing : null}
          </li>
        ))}
      </Tag>
    )
  }
  return (
    <p>
      {renderInline(block.text)}
      {trailing}
    </p>
  )
}

/**
 * 把正文拆成标题、列表、段落与代码块；段内换行由 CSS 保留。
 * trailing（如流式光标）接在最后一个块的行尾；最后一段是代码块时放在其后。
 */
export function MessageText({ text, trailing }: { text: string; trailing?: ReactNode }) {
  const segments = splitMessage(text)
  const lastSegment = segments.length - 1
  const lastIsText = segments[lastSegment]?.kind === "text"
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.kind === "code") {
          return <CodeBlock key={index} code={segment.code} lang={segment.lang} />
        }
        const blocks = splitBlocks(segment.text)
        const lastBlock = blocks.length - 1
        return blocks.map((block, blockIndex) => (
          <Block
            key={`${index}-${blockIndex}`}
            block={block}
            trailing={index === lastSegment && blockIndex === lastBlock ? trailing : undefined}
          />
        ))
      })}
      {trailing && !lastIsText ? trailing : null}
    </>
  )
}
