/** 验证回复时间的相对写法。 */
import { describe, expect, it } from "vitest"
import { formatReplyTime } from "./turn-actions"

describe("formatReplyTime", () => {
  const now = Date.parse("2026-10-21T12:00:00Z")

  it("says just now, then minutes, hours and days ago", () => {
    expect(formatReplyTime("2026-10-21T11:59:30Z", "zh-CN", "刚刚", now)).toBe("刚刚")
    expect(formatReplyTime("2026-10-21T11:55:00Z", "zh-CN", "刚刚", now)).toBe("5分钟前")
    expect(formatReplyTime("2026-10-21T09:00:00Z", "en-US", "Just now", now)).toBe("3 hours ago")
    expect(formatReplyTime("2026-10-20T11:00:00Z", "en-US", "Just now", now)).toBe("yesterday")
  })

  it("shows a date after a week and nothing for invalid input", () => {
    expect(formatReplyTime("2026-10-01T12:00:00Z", "en-US", "Just now", now)).toBe("Oct 1")
    expect(formatReplyTime("nope", "en-US", "Just now", now)).toBe("")
  })
})
