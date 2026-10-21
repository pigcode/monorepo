/** 右侧面板验收：多标签 surface、内嵌浏览器的 loopback 限制、最大化与底部终端。 */
import { mkdirSync, rmSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { _electron as electron, expect, test } from "@playwright/test"
import { addProject } from "./projects"

/** 过滤 undefined，满足 Playwright env 的 string 值约束。 */
function launchEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
}

/** 本机页面：首页链接到同源第二页，第二页链接到远程地址。 */
function startSite(): Promise<Server> {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8")
    if (request.url === "/second") {
      response.end('<h1>second page</h1><a id="out" href="https://example.com/">leave</a>')
      return
    }
    response.end('<h1>local home</h1><a id="in" href="/second">next</a>')
  })
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)))
}

test("right panel surfaces, embedded browser, maximize and bottom terminal", async () => {
  const projectRoot = "/tmp/pigcode-m6-e2e"
  rmSync(projectRoot, { recursive: true, force: true })
  mkdirSync(projectRoot, { recursive: true })
  const site = await startSite()
  const base = `http://127.0.0.1:${(site.address() as AddressInfo).port}`
  const app = await electron.launch({
    args: ["."],
    env: { ...launchEnv(), PIGCODE_PROVIDER: "fake" },
  })
  try {
    const page = await app.firstWindow()
    await addProject(app, page, projectRoot)
    await page
      .locator(".proj-block")
      .filter({ hasText: "pigcode-m6-e2e" })
      .locator(".proj-add")
      .click()
    await expect(page.locator(".tiptap")).toHaveAttribute("contenteditable", "true")

    // 右栏收起时布局按钮在线程头；打开后出现在面板标签栏，并显示启动器。
    const header = page.locator(".panel-top")
    await header.getByRole("button", { name: "切换右侧面板" }).click()
    const bar = page.locator(".right-panel-bar")
    await expect(page.getByLabel("打开一个面板")).toBeVisible()
    await expect(bar.getByRole("button", { name: "切换右侧面板" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    await expect(header.getByRole("button", { name: "切换右侧面板" })).toHaveCount(0)

    // 焦点不在输入框时，单键 B 打开浏览器。
    await page.locator(".right-panel-body").click({ position: { x: 8, y: 8 } })
    await page.keyboard.press("b")
    await expect(page.getByRole("tab", { name: "浏览器" })).toHaveAttribute("aria-selected", "true")

    // 远程地址被地址栏拒绝；本机页面在 iframe 里加载，标签标题换成主机名。
    const address = page.getByRole("textbox", { name: /输入本地地址/ })
    await address.fill("https://example.com")
    await address.press("Enter")
    await expect(page.getByRole("alert")).toContainText("仅支持本地")
    await address.fill(base)
    await address.press("Enter")
    const frame = page.frameLocator("iframe.browser-frame")
    await expect(frame.getByRole("heading", { name: "local home" })).toBeVisible()
    await expect(page.getByRole("tab", { name: new URL(base).host })).toBeVisible()

    // 页面内的同源跳转放行，跳去远程地址被主进程拦下，iframe 留在本机页面。
    await frame.locator("#in").click()
    await expect(frame.getByRole("heading", { name: "second page" })).toBeVisible()
    await frame.locator("#out").click()
    await page.waitForTimeout(800)
    await expect(frame.getByRole("heading", { name: "second page" })).toBeVisible()
    const frameUrls = page.frames().map((item) => item.url())
    expect(frameUrls.some((url) => url.includes("example.com"))).toBe(false)

    // 再开两个终端标签：序号递增，切换标签后浏览器保持挂载。
    await page.getByRole("button", { name: "添加面板" }).click()
    await page.getByRole("menuitem", { name: /终端/ }).click()
    await expect(page.locator(".surface-pane:not([hidden]) .xterm")).toBeVisible()
    await page.getByRole("button", { name: "新建终端" }).click()
    await expect(page.getByRole("tab")).toHaveText([new URL(base).host, "终端 1", "终端 2"])
    await page.getByRole("tab", { name: new URL(base).host }).click()
    await expect(frame.getByRole("heading", { name: "second page" })).toBeVisible()

    // 标签按线程保存：新线程显示启动器；切回来后浏览器按地址栏最近的地址恢复页面。
    await page
      .locator(".proj-block")
      .filter({ hasText: "pigcode-m6-e2e" })
      .locator(".proj-add")
      .click()
    await expect(page.getByLabel("打开一个面板")).toBeVisible()
    await page.locator('.sess:not([aria-current="page"])').click()
    await expect(page.getByRole("tab")).toHaveText([new URL(base).host, "终端 1", "终端 2"])
    await page.getByRole("tab", { name: new URL(base).host }).click()
    await expect(frame.getByRole("heading", { name: "local home" })).toBeVisible()
    await expect(page.getByRole("textbox", { name: /输入本地地址/ })).toHaveValue(`${base}/`)

    // 关闭当前标签激活右侧邻居。
    await page.getByRole("button", { name: `关闭 ${new URL(base).host}` }).click()
    await expect(page.getByRole("tab", { name: "终端 1" })).toHaveAttribute("aria-selected", "true")

    // 最大化时聊天区隐藏，还原后回来。
    await bar.getByRole("button", { name: "最大化面板" }).click()
    await expect(page.locator(".app")).toHaveClass(/is-right-max/)
    await expect(page.locator("main.panel")).toBeHidden()
    await bar.getByRole("button", { name: "还原面板大小" }).click()
    await expect(page.locator("main.panel")).toBeVisible()

    // 收起右栏后标签仍在；⌃` 打开底部终端并能执行命令，再按一次隐藏。
    await bar.getByRole("button", { name: "切换右侧面板" }).click()
    await expect(page.locator(".right-panel")).toBeHidden()
    await page.keyboard.press("Control+Backquote")
    const drawer = page.getByRole("region", { name: "底部终端" })
    await expect(drawer.locator(".xterm")).toBeVisible()
    await drawer.locator(".xterm").click()
    await page.keyboard.type("echo DRAWER_OK")
    await page.keyboard.press("Enter")
    await expect(drawer.locator(".xterm")).toContainText("DRAWER_OK")
    await expect(header.getByRole("button", { name: "切换底部终端" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    await page.keyboard.press("Control+Backquote")
    await expect(drawer).toBeHidden()

    await header.getByRole("button", { name: "切换右侧面板" }).click()
    await expect(page.getByRole("tab")).toHaveText(["终端 1", "终端 2"])
  } finally {
    await app.close()
    site.close()
  }
})
