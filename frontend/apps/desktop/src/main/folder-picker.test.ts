/** 验证系统文件夹选择框的参数与返回值。 */
import type { BrowserWindow } from "electron"
import { describe, expect, it, vi } from "vitest"
import { pickFolder, readFolderPickerLabels, type ShowOpenDialog } from "./folder-picker"

const window = {} as BrowserWindow

describe("readFolderPickerLabels", () => {
  it("keeps short text labels and drops anything else", () => {
    expect(readFolderPickerLabels({ title: "选择项目文件夹", buttonLabel: "选择" })).toEqual({
      title: "选择项目文件夹",
      buttonLabel: "选择",
    })
    expect(readFolderPickerLabels({ title: "", buttonLabel: 3 })).toEqual({})
    expect(readFolderPickerLabels({ title: "x".repeat(81) })).toEqual({})
    expect(readFolderPickerLabels("选择")).toEqual({})
    expect(readFolderPickerLabels(null)).toEqual({})
  })
})

describe("pickFolder", () => {
  it("opens a directory picker parented to the window and returns the chosen folder", async () => {
    const show = vi.fn<ShowOpenDialog>().mockResolvedValue({
      canceled: false,
      filePaths: ["/home/me/pigcode"],
    })
    await expect(pickFolder(show, window, { title: "选择项目文件夹" })).resolves.toBe(
      "/home/me/pigcode",
    )
    expect(show).toHaveBeenCalledWith(window, {
      properties: ["openDirectory", "createDirectory"],
      title: "选择项目文件夹",
    })
  })

  it("returns null when the picker is cancelled", async () => {
    const show = vi.fn<ShowOpenDialog>().mockResolvedValue({ canceled: true, filePaths: [] })
    await expect(pickFolder(show, window, {})).resolves.toBeNull()
  })
})
