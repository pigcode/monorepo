/** 验证侧栏渲染导航、项目与会话。 */
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocaleProvider } from "@pigcode/ui-primitives"
import { WorkspaceSidebar, formatThreadTime } from "./workspace-sidebar"

afterEach(cleanup)

describe("WorkspaceSidebar", () => {
  it("shows schedules and plugins next to new chat, and a single add-project row when empty", () => {
    const onOpenSchedules = vi.fn()
    const onOpenPlugins = vi.fn()
    const onAddProject = vi.fn()
    render(
      <LocaleProvider locale="zh-CN">
        <WorkspaceSidebar
          projects={[]}
          threads={[]}
          activeThreadId={null}
          expandedProjects={{}}
          onAddProject={onAddProject}
          onToggleProject={() => {}}
          onOpenThread={() => {}}
          onNewThread={() => {}}
          onOpenSchedules={onOpenSchedules}
          onOpenPlugins={onOpenPlugins}
        />
      </LocaleProvider>,
    )
    fireEvent.click(screen.getByRole("button", { name: "定时任务" }))
    fireEvent.click(screen.getByRole("button", { name: "插件" }))
    expect(onOpenSchedules).toHaveBeenCalledTimes(1)
    expect(onOpenPlugins).toHaveBeenCalledTimes(1)
    const addButtons = screen.getAllByRole("button", { name: "添加项目" })
    expect(addButtons).toHaveLength(2)
    fireEvent.click(addButtons[1] as HTMLElement)
    expect(onAddProject).toHaveBeenCalledTimes(1)
  })

  it("switches to a single list sorted by time from the filter menu and remembers it", async () => {
    window.localStorage.removeItem("pigcode.sidebarGrouping")
    const project = (id: string, name: string) => ({
      id,
      rootPath: `/tmp/${name}`,
      name,
      createdAt: "2026-10-20T00:00:00.000Z",
    })
    const thread = (id: string, projectId: string, title: string, updatedAt: string) => ({
      id,
      projectId,
      title,
      defaultProviderId: "claude",
      lastProviderId: null,
      lastModelId: null,
      permissionMode: "workspace-write" as const,
      createdAt: updatedAt,
      updatedAt,
      archivedAt: null,
      lastRunId: null,
    })
    render(
      <LocaleProvider locale="zh-CN">
        <WorkspaceSidebar
          projects={[project("p1", "alpha"), project("p2", "beta")]}
          threads={[
            thread("t1", "p1", "older", "2026-10-20T01:00:00.000Z"),
            thread("t2", "p2", "newest", "2026-10-20T03:00:00.000Z"),
            thread("t3", "p1", "middle", "2026-10-20T02:00:00.000Z"),
            thread("t4", "gone", "hidden", "2026-10-20T04:00:00.000Z"),
          ]}
          activeThreadId={null}
          expandedProjects={{}}
          onAddProject={() => {}}
          onToggleProject={() => {}}
          onOpenThread={() => {}}
          onNewThread={() => {}}
        />
      </LocaleProvider>,
    )
    const titles = () =>
      Array.from(document.querySelectorAll(".sess-title")).map((node) => node.textContent)
    expect(titles()).toEqual(["older", "middle", "newest"])

    await userEvent.click(screen.getByRole("button", { name: "会话排列方式" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "按时间" }))
    expect(titles()).toEqual(["newest", "middle", "older"])
    expect(screen.getByText("最近会话")).toBeTruthy()
    expect(
      Array.from(document.querySelectorAll(".sess-project")).map((node) => node.textContent),
    ).toEqual(["beta", "alpha", "alpha"])
    expect(window.localStorage.getItem("pigcode.sidebarGrouping")).toBe("time")
    window.localStorage.removeItem("pigcode.sidebarGrouping")
  })

  it("formats thread times compactly so they can stay visible", () => {
    const now = Date.parse("2026-10-21T12:00:00Z")
    expect(formatThreadTime("2026-10-21T11:59:40Z", "zh-CN", now)).toBe("刚刚")
    expect(formatThreadTime("2026-10-21T11:41:00Z", "zh-CN", now)).toBe("19分钟")
    expect(formatThreadTime("2026-10-21T10:00:00Z", "en-US", now)).toBe("2h")
    expect(formatThreadTime("2026-10-16T12:00:00Z", "en-US", now)).toBe("5d")
    expect(formatThreadTime("not a date", "en-US", now)).toBe("")
  })

  it("renders projects and threads", () => {
    render(
      <LocaleProvider locale="zh-CN">
        <WorkspaceSidebar
          projects={[
            {
              id: "p1",
              rootPath: "/tmp/demo",
              name: "demo",
              createdAt: "2026-10-20T00:00:00.000Z",
            },
          ]}
          threads={[
            {
              id: "t1",
              projectId: "p1",
              title: "First thread",
              defaultProviderId: "fake",
              lastProviderId: null,
              lastModelId: null,
              permissionMode: "workspace-write",
              createdAt: "2026-10-20T00:00:00.000Z",
              updatedAt: "2026-10-20T00:00:00.000Z",
              archivedAt: null,
              lastRunId: null,
            },
          ]}
          activeThreadId="t1"
          expandedProjects={{ p1: true }}
          onAddProject={() => {}}
          onToggleProject={() => {}}
          onOpenThread={() => {}}
          onNewThread={() => {}}
          onOpenSettings={() => {}}
        />
      </LocaleProvider>,
    )
    expect(screen.getByText("demo")).toBeTruthy()
    expect(screen.getByText("First thread")).toBeTruthy()
  })
})
