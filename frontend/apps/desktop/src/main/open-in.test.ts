/** 验证打开项目文件夹前的路径校验、编辑器探测与编辑器 URL。 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { editorUrl, installedEditors, readDirectory, settleOpenPath } from "./open-in"

const folder = mkdtempSync(join(tmpdir(), "pigcode-open-in-"))
const file = join(folder, "notes.txt")
writeFileSync(file, "")

afterAll(() => rmSync(folder, { recursive: true, force: true }))

describe("readDirectory", () => {
  it("accepts only existing absolute directories", () => {
    expect(readDirectory(folder)).toBe(folder)
    expect(readDirectory(file)).toBeNull()
    expect(readDirectory(join(folder, "missing"))).toBeNull()
    expect(readDirectory("relative/path")).toBeNull()
    expect(readDirectory(42)).toBeNull()
  })
})

describe("settleOpenPath", () => {
  it("passes on the system's answer, and treats no answer as opened", async () => {
    await expect(settleOpenPath(Promise.resolve(""), 50)).resolves.toBe("")
    await expect(settleOpenPath(Promise.resolve("No application found"), 50)).resolves.toBe(
      "No application found",
    )
    await expect(settleOpenPath(new Promise<string>(() => undefined), 20)).resolves.toBe("")
  })
})

describe("installedEditors", () => {
  it("lists the editors whose URL scheme the system knows", () => {
    const names: Record<string, string> = { "cursor://": "Cursor", "windsurf://": "Windsurf" }
    expect(installedEditors((url) => names[url] ?? "")).toEqual([
      { id: "cursor", name: "Cursor" },
      { id: "windsurf", name: "Windsurf" },
    ])
    expect(installedEditors(() => "")).toEqual([])
  })
})

describe("editorUrl", () => {
  it("builds the editor's open-folder URL on every platform", () => {
    expect(editorUrl("vscode", "/home/me/my app")).toBe("vscode://file/home/me/my%20app")
    expect(editorUrl("cursor", "/Users/me/项目#1")).toBe(
      "cursor://file/Users/me/%E9%A1%B9%E7%9B%AE%231",
    )
    expect(editorUrl("vscode", "C:\\work\\app")).toBe("vscode://file/C:/work/app")
    expect(editorUrl("notepad", "/home/me")).toBeNull()
  })
})
