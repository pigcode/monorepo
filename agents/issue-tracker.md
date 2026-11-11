# Issue tracker: GitHub

Issues and specs for all of Pigcode (frontend and docs) live as GitHub issues on the aggregate repo **pigcode/monorepo**. Use the `gh` CLI for all operations.

**Always pass `-R pigcode/monorepo`.** `gh` infers the repo from the current directory's `git remote`, and inside `frontend/` or `docs/` that resolves to the submodule's own repo (pigcode/pigcode or pigcode/docs), which is the wrong tracker. For `gh api` calls, use `repos/pigcode/monorepo/...` explicitly.

## Conventions

- **Create an issue**: `gh issue create -R pigcode/monorepo --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view -R pigcode/monorepo <number> --json number,title,body,labels,comments`.
- **List issues**: `gh issue list -R pigcode/monorepo --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Make an issue a sub-issue of a parent**: `gh issue create -R pigcode/monorepo --parent <parent> ...`, or `gh issue edit -R pigcode/monorepo <parent> --add-sub-issue <child>` afterwards (`gh` 2.94+). Older `gh`: `gh api --method POST repos/pigcode/monorepo/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>` (database id, as in **Blocking** below). Without sub-issues, put `Part of #<parent>` at the top of the child body.
- **Comment on an issue**: `gh issue comment -R pigcode/monorepo <number> --body "..."`
- **Apply / remove labels**: `gh issue edit -R pigcode/monorepo <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close -R pigcode/monorepo <number> --comment "..."`

Code changes land in the submodule repos, so PRs are opened on pigcode/pigcode or pigcode/docs. Reference the tracker issue from the PR body with the full form `pigcode/monorepo#<number>`; a bare `#<number>` would point at the submodule repo's own numbering.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`.
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue on pigcode/monorepo.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create -R pigcode/monorepo --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (see **Make an issue a sub-issue of a parent**). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/pigcode/monorepo/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/pigcode/monorepo/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list -R pigcode/monorepo --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit -R pigcode/monorepo <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment -R pigcode/monorepo <n> --body "<answer>"`, then `gh issue close -R pigcode/monorepo <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
