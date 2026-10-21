# Pigcode Frontend

Pigcode 桌面端的 pnpm monorepo，包含 `apps/`（desktop、host）与 `packages/`（contracts、client-runtime、UI 包等）。

## UI and shortcuts

- Window buttons are always the system's own. On macOS the native traffic lights sit in the
  sidebar's top row. On Windows and Linux the app draws a title bar with File, Edit, View, and
  Help (each opens a native menu), and the system minimize, maximize, and close buttons overlay
  it on whichever side the desktop puts them.
- Shortcut hints read `⌘` on macOS and `Ctrl` on Windows and Linux; the shortcuts below accept
  either modifier.
- Add project opens the create-project dialog. The source folder is chosen with the system file
  manager (Finder, Explorer, or the GTK chooser); a blank project name uses the folder name.
- `⌘K` opens the command palette for actions, thread switching, and projects.
- `⌘N` creates a new session; `⌘B` toggles the sidebar; `⌘J` toggles the workbench;
  `⌘,` opens settings.
- New sessions are automatically titled from the first user message.
- The workbench width is draggable; double-click the divider to reset it.
- Running, queued, waiting-approval, completed, failed, and interrupted states are shown
  on both tabs and the sidebar; a running thread shows an animated 3×3 dot matrix.
- The thread header's split button opens the project folder in the file manager, an
  installed editor (VS Code, Cursor, Windsurf, Trae, Zed, CodeBuddy, JetBrains…) or a
  terminal (Terminal, iTerm, Ghostty, Warp, Windows Terminal, GNOME Terminal…), with the
  app's own icon; the last choice becomes the default.

## Composer

- The model chip opens a picker with the agents (Claude Code, Codex, plugin providers)
  on the left; only the selected agent's models are listed. Search, `⌘1…9`, and stars
  for favorites work inside it; `⌘/` opens it from the input box.
- Thinking depth lists only the levels the current model supports (Codex
  `supportedReasoningEfforts`, Claude effort levels) and is remembered per model.
- Permissions: ask every time, plan mode, read only, and full access (asks for
  confirmation). `⇧Tab` cycles the first three; the choice is stored on the thread.
- `@` references a project file, `/` at the start of a line runs a command, `↑`/`↓` in
  an empty box bring back sent messages, and each thread keeps its own draft. The input
  is plain text: Markdown markers are sent as typed, and `⇧↵` adds a line break.

## Timeline

Each run is one turn: the user's message on the right, then the agent's work (tool calls,
plans, intermediate messages, subagents) under a "Working for…" header that folds into
"Worked for N s" when the run ends, leaving the final answer, file changes and the copy
button. Pending approvals always stay visible.

## TypeScript

Everything is TypeScript, including scripts and configs. Scripts run with Node's built-in
type stripping (Node 22.18 or newer), for example `pnpm build:host` or
`node scripts/create-plugin.ts`. Plugins can point `main`, `pigcode.host`, and
`pigcode.client` at `.ts` files; see [docs/plugin-authoring.md](docs/plugin-authoring.md).

## Workbench

The right panel provides files, per-run diffs, an embedded PTY terminal, checkpoints,
and git worktrees. Checkpoints are stored under
`refs/pigcode/checkpoints/<thread>/<run>/<phase>` and never add commits to your branch.

After a clean install, rebuild the native PTY helper for Electron before running the
workbench E2E:

```bash
pnpm --dir apps/desktop rebuild:native
```

## Multi-session and ecosystem

Threads open in tabs and keep running in the background when you switch away. Runs beyond
the concurrency limit enter a FIFO queue (`run.list` / `run.queued`), and every tab shows
its own queued, running, waiting-approval, completed, failed, or interrupted state.

M5 also adds subagent timelines, thread-scoped MCP tools from capability plugins, GitHub
PR creation through the `gh` CLI, loopback-only browser previews, and interval schedules
persisted in SQLite. See [docs/m5-ecosystem.md](docs/m5-ecosystem.md) for commands,
limits, and prerequisites.

## Plugins

Plugins are ordinary npm packages with a `pigcode` manifest field. Install a local
directory or npm spec from Settings → Plugins. Provider, capability, and UI plugins
load and unload without restarting the app.

See [docs/plugin-authoring.md](docs/plugin-authoring.md).

## Real Claude smoke

Set `PIGCODE_REAL_CLAUDE=1` and run:

```bash
pnpm real:claude
```

The test uses the installed and authenticated Claude Code CLI with a minimal
prompt. It never logs in and never reads credential files.

## Real Codex smoke

Set `PIGCODE_REAL_CODEX=1` and run:

```bash
pnpm real:codex
```

The test uses the installed and authenticated Codex CLI with a minimal prompt.
It never logs in and never reads credential files.

If the default model is at capacity, override it:

```bash
PIGCODE_REAL_CODEX=1 PIGCODE_CODEX_MODEL=gpt-6-astra pnpm real:codex
```

## Real Codex multi-session

The M5 acceptance test runs two real Codex threads in parallel and expects `OK-1` and
`OK-2`. It defaults to `gpt-6.1-sol`:

```bash
PIGCODE_REAL_CODEX=1 PIGCODE_CODEX_MODEL=gpt-6.1-sol pnpm real:codex:multi
```

It is skipped unless `PIGCODE_REAL_CODEX=1`, so it never consumes quota by default.
