/** 助手消息的轻量 Markdown 渲染；只产出 React 元素，不注入 HTML。 */
import type { ReactNode } from "react"

type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { kind: "code"; lang: string; text: string }
  | { kind: "list"; ordered: boolean; start: number; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "rule" }

const FENCE = /^\s*(```|~~~)\s*([\w+-]*)\s*$/
const HEADING = /^(#{1,4})\s+(.+?)\s*#*\s*$/
const BULLET = /^\s*[-*+]\s+(.*)$/
const ORDERED = /^\s*(\d{1,9})[.)]\s+(.*)$/
const QUOTE = /^\s*>\s?(.*)$/
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/

/** 判断一行是否开启新的块，段落遇到它就结束。 */
function startsBlock(line: string): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line) ||
    QUOTE.test(line) ||
    RULE.test(line)
  )
}

/** 把文本切成块；未闭合的代码围栏把剩余内容都当作代码，适配流式输出。 */
export function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  const blocks: Block[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ""
    if (line.trim() === "") {
      index += 1
      continue
    }
    const fence = FENCE.exec(line)
    if (fence) {
      const marker = fence[1] ?? "```"
      const body: string[] = []
      index += 1
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith(marker)) {
        body.push(lines[index] ?? "")
        index += 1
      }
      index += 1
      blocks.push({ kind: "code", lang: fence[2] ?? "", text: body.join("\n") })
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      const level = Math.min(4, heading[1]?.length ?? 1) as 1 | 2 | 3 | 4
      blocks.push({ kind: "heading", level, text: heading[2] ?? "" })
      index += 1
      continue
    }
    if (RULE.test(line)) {
      blocks.push({ kind: "rule" })
      index += 1
      continue
    }
    if (QUOTE.test(line)) {
      const body: string[] = []
      while (index < lines.length && QUOTE.test(lines[index] ?? "")) {
        body.push(QUOTE.exec(lines[index] ?? "")?.[1] ?? "")
        index += 1
      }
      blocks.push({ kind: "quote", text: body.join("\n") })
      continue
    }
    const ordered = ORDERED.exec(line)
    if (ordered || BULLET.test(line)) {
      const pattern = ordered ? ORDERED : BULLET
      const items: string[] = []
      while (index < lines.length) {
        const current = lines[index] ?? ""
        const match = pattern.exec(current)
        if (match) {
          items.push((ordered ? match[2] : match[1]) ?? "")
        } else if (current.trim() !== "" && /^\s{2,}\S/.test(current) && items.length > 0) {
          items[items.length - 1] += `\n${current.trim()}`
        } else {
          break
        }
        index += 1
      }
      blocks.push({
        kind: "list",
        ordered: Boolean(ordered),
        start: ordered ? Number(ordered[1]) : 1,
        items,
      })
      continue
    }
    const body: string[] = [line]
    index += 1
    while (index < lines.length) {
      const current = lines[index] ?? ""
      if (current.trim() === "" || startsBlock(current)) break
      body.push(current)
      index += 1
    }
    blocks.push({ kind: "paragraph", text: body.join("\n") })
  }
  return blocks
}

/** 行内标记：代码、加粗、斜体、删除线与链接；按出现位置最靠前者优先匹配。 */
const INLINE =
  /(`+)([\s\S]+?)\1|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\*(?!\s)([^*\n]+?)\*|\[([^\]\n]+)\]\(([^)\s]+)\)/

/** 只放行 http、https 与 mailto 链接，其余按普通文本显示。 */
function safeHref(href: string): string | null {
  return /^(https?:|mailto:)/i.test(href) ? href : null
}

/** 渲染行内 Markdown。 */
export function renderInline(text: string, keyPrefix = "i"): ReactNode[] {
  const nodes: ReactNode[] = []
  let rest = text
  let key = 0
  while (rest.length > 0) {
    const match = INLINE.exec(rest)
    if (!match) {
      nodes.push(rest)
      break
    }
    if (match.index > 0) nodes.push(rest.slice(0, match.index))
    const id = `${keyPrefix}-${key}`
    key += 1
    const [whole, , code, strong, strongAlt, strike, em, label, href] = match
    if (code !== undefined) {
      nodes.push(<code key={id}>{code.trim()}</code>)
    } else if (strong !== undefined || strongAlt !== undefined) {
      nodes.push(<strong key={id}>{renderInline(strong ?? strongAlt ?? "", id)}</strong>)
    } else if (strike !== undefined) {
      nodes.push(<del key={id}>{renderInline(strike, id)}</del>)
    } else if (em !== undefined) {
      nodes.push(<em key={id}>{renderInline(em, id)}</em>)
    } else if (label !== undefined && href !== undefined) {
      const safe = safeHref(href)
      nodes.push(
        safe ? (
          <a key={id} href={safe} target="_blank" rel="noopener noreferrer">
            {renderInline(label, id)}
          </a>
        ) : (
          whole
        ),
      )
    }
    rest = rest.slice(match.index + whole.length)
  }
  return nodes
}

/** 渲染一段 Markdown 文本。 */
export function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text)
  return (
    <>
      {blocks.map((block, index) => {
        const key = `b-${index}`
        switch (block.kind) {
          case "heading": {
            const Tag = `h${block.level + 2}` as "h3" | "h4" | "h5" | "h6"
            return (
              <Tag key={key} className={`md-h md-h${block.level}`}>
                {renderInline(block.text, key)}
              </Tag>
            )
          }
          case "code":
            return (
              <pre key={key} className="md-code" data-lang={block.lang || undefined}>
                <code>{block.text}</code>
              </pre>
            )
          case "list": {
            const items = block.items.map((item, itemIndex) => (
              <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
            ))
            return block.ordered ? (
              <ol key={key} className="md-list" start={block.start === 1 ? undefined : block.start}>
                {items}
              </ol>
            ) : (
              <ul key={key} className="md-list">
                {items}
              </ul>
            )
          }
          case "quote":
            return (
              <blockquote key={key} className="md-quote">
                {renderInline(block.text, key)}
              </blockquote>
            )
          case "rule":
            return <hr key={key} className="md-rule" />
          default:
            return <p key={key}>{renderInline(block.text, key)}</p>
        }
      })}
    </>
  )
}
