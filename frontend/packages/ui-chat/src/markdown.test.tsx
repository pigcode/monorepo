/** 验证助手消息的 Markdown 渲染：块结构、流式未闭合围栏与链接白名单。 */
// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { Markdown, parseBlocks } from "./markdown"

afterEach(cleanup)

describe("parseBlocks", () => {
  it("splits headings, lists, quotes, rules and paragraphs", () => {
    const blocks = parseBlocks(
      ["# Title", "", "1. one", "2. two", "   more", "", "> quoted", "---", "plain", "text"].join(
        "\n",
      ),
    )
    expect(blocks).toEqual([
      { kind: "heading", level: 1, text: "Title" },
      { kind: "list", ordered: true, start: 1, items: ["one", "two\nmore"] },
      { kind: "quote", text: "quoted" },
      { kind: "rule" },
      { kind: "paragraph", text: "plain\ntext" },
    ])
  })

  it("treats an unclosed fence as code until the end", () => {
    expect(parseBlocks("intro\n```ts\nconst a = 1\n# not a heading")).toEqual([
      { kind: "paragraph", text: "intro" },
      { kind: "code", lang: "ts", text: "const a = 1\n# not a heading" },
    ])
  })
})

describe("Markdown", () => {
  it("renders inline marks and only links safe protocols", () => {
    const { container } = render(
      <Markdown text="Run `pnpm test`, **then** see [docs](https://example.com) or [x](javascript:alert(1))" />,
    )
    expect(container.querySelector("code")?.textContent).toBe("pnpm test")
    expect(container.querySelector("strong")?.textContent).toBe("then")
    const links = container.querySelectorAll("a")
    expect(links).toHaveLength(1)
    expect(links[0]?.getAttribute("href")).toBe("https://example.com")
    expect(links[0]?.getAttribute("rel")).toBe("noopener noreferrer")
    expect(container.textContent).toContain("[x](javascript:alert(1))")
  })

  it("renders fenced code with its language", () => {
    const { container } = render(<Markdown text={"```bash\necho <b>hi</b>\n```"} />)
    const pre = container.querySelector("pre.md-code")
    expect(pre?.getAttribute("data-lang")).toBe("bash")
    expect(pre?.textContent).toBe("echo <b>hi</b>")
    expect(container.querySelector("b")).toBeNull()
  })
})
