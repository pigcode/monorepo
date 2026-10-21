# Pigcode UI Refinement Design

**Date:** 2026-10-21
**Status:** Chosen direction: efficiency + craft (recommended option; no user objection received)
**Scope:** Desktop UI shell, thread navigation, chat timeline, composer, workbench layout, command palette, keyboard interactions, visual tokens and motion. No changes to provider/runtime architecture.

## Goals

1. **操作流畅**：常用动作不超过一次点击或一个快捷键；切换线程、打开工作台、切换主题、创建会话都能在键盘上完成。
2. **信息清楚**：线程状态、当前 provider/model、运行状态、工具调用与审批在界面中一眼可辨。
3. **有层次但不臃肿**：保留轻量 macOS 外壳，不变成 IDE；右栏仍按需展开。
4. **细节可靠**：焦点、空状态、溢出、滚动、减少动效和深浅色都有一致行为。

## Principles

- **Keyboard first, pointer friendly**：所有主操作有快捷键，同时保留可发现的按钮与悬停操作。
- **One primary action per surface**：主内容区只突出“发送/停止”，侧栏只突出“新会话”。
- **Status is ambient**：运行/排队/审批状态用颜色、文字和动效同时表达，不只靠颜色。
- **Motion explains state**：只为层级变化、状态变化和面板开合使用动效，时长 120–220ms，尊重 `prefers-reduced-motion`。
- **No fake density**：不为了“像 IDE”塞入编辑器；工作台只在当前会话需要时出现。

## Layout

### Sidebar (left, 248px, collapsible)

- Top brand row: small logo mark + “Pigcode” + compact “新会话” primary button.
- Search/command entry: a single “搜索或执行命令…” row, opens command palette (⌘K).
- Project sections: project name + thread count; active project has a subtle accent bar.
- Thread rows: status dot, title, provider badge (CL/CX/third-party), relative time; hover reveals a “…” menu (rename/archive later) and pin; active row has accent bar and stronger surface.
- Footer: settings button, theme toggle, connection status.
- Empty state: “还没有项目” with a single “添加项目” button and a one-line hint.

### Main area

- **Tab strip** above the header: compact pills with title, status dot, provider glyph; active tab has a filled surface and 2px accent underline; close button appears on hover/active; a “+” at the end. Horizontal overflow with fade masks.
- **Header**: thread title (semibold 15px), project breadcrumb, status pill, provider/model chips, workbench toggle, more menu. No duplicated “新会话” title when a thread is active.
- **Timeline**: assistant messages get a small avatar/initial, provider name and time; user messages are accent-tinted bubbles aligned right. Tool calls become compact rows with icon, tool name, status, duration (when available) and expandable body. Approvals are prominent but not modal. Subagent cards remain collapsible.
- **Empty chat**: centered brand mark, “从一个任务开始”, 3 quick prompts, and shortcut hints (⌘K, ⌘N). No giant blank area.
- **Scroll behavior**: auto-follow when near bottom; floating “回到底部” button when scrolled up; new messages do not yank the viewport if the user is reading history.
- **Composer**: 18px radius, stronger focus ring, top padding, bottom toolbar; send button is an accent circular button with arrow; running state becomes a stop button with a subtle pulse; keyboard hint “⌘↵ 发送” appears when focused.

### Right workbench

- Remove the standalone “Worktrees” block above the tabs; worktree selection moves into the Files tab header as a compact chip/menu.
- Tab bar: Files, Diff, Terminal, Checkpoints, PR, Preview with icons and active underline; panel header has a title and close button.
- Resizable width: drag handle between chat and workbench, min 320px, max 58vw, persisted in localStorage. Double-click resets to default.
- Empty states: icon + one sentence + one action (e.g., “打开终端”).
- Terminal keeps xterm; preview/PR panels follow the same header rhythm.

## Command Palette

- Opens with ⌘K or sidebar search row; closes with Esc/backdrop click.
- Sections: “行动” (new session, toggle sidebar, toggle workbench, settings, plugins, theme), “会话” (open threads with status/provider), “项目” (add project).
- Fuzzy filter on label + keywords; ↑/↓ move, ↵ run, Esc close; first item selected; empty query shows actions and recent threads.
- Palette is a centered modal with 12px radius, 520px width, search input, grouped list, footer shortcut hints.

## Keyboard Map

| Shortcut | Action |
| --- | --- |
| ⌘K | Command palette |
| ⌘N | New session |
| ⌘B | Toggle sidebar |
| ⌘J | Toggle workbench |
| ⌘, | Settings |
| ⌘↵ | Send (composer) |
| Esc | Close palette/drawer; stop only when composer focused and running |

## Visual System

- Add an accent token (calm blue) used for primary send, active tab underline, selected thread bar, focus ring and links. Keep the neutral macOS base.
- Elevation: three levels — flat content, raised cards/composer, popover/palette. Use hairline borders plus soft shadow; no heavy borders.
- Typography: 11.5/12/13/13.5/15/20 scale; thread title 13, chat body 14, empty-state title 20. Content line-height 1.7.
- Spacing: 4/8/12/16/24/32; sidebar rows 30px, tabs 32px, header 48px, composer max-width 720px.
- Radii: controls 8, cards 12, composer 18, modal 16, pills 999.
- Status colors: running green with pulse, queued blue, waiting amber, failed red, completed muted green.
- Motion: tab switch fade/slide 160ms; panel open 200ms; message enter 180ms; hover 90ms; all disabled under `prefers-reduced-motion`.

## Accessibility & Reliability

- All interactive elements keyboard reachable; palette and tabs use roving tabindex/aria-selected; status has text, not color alone.
- Focus-visible rings use the accent; inputs have labels.
- Panel resize handle has `role="separator"` and keyboard arrow support.
- No layout shift when status text changes; tab titles truncate with title tooltip.
- E2E covers: create thread → auto-title, open second tab, command palette actions, toggle workbench, keyboard shortcuts, close tab, resizable panel bounds.

## Out of Scope

- Full IDE editor, file editing in the right panel, drag-and-drop tab reordering, custom themes, mobile layout.
- New backend capabilities; UI uses existing RPC and data.
