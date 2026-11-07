# Pigcode

聚合仓库 `pigcode/monorepo`。代码在两个 submodule 里：

- `frontend/`：pigcode/pigcode，桌面端和插件平台（pnpm monorepo）
- `docs/`：pigcode/docs，架构设计和里程碑计划

直接在 `frontend/` 和 `docs/` 里开发：改动先在子仓库里提交并推送，再在聚合仓库里提交新的 submodule 指针（`git add frontend docs`）。顺序不能反，否则聚合仓库会指向 GitHub 上不存在的提交。

agent 配置、`GLOSSARY.md` 和 ADR 描述的是整个 Pigcode，所以放在聚合仓库根目录，不写进两个子仓库。

旧的 pigcode-origin 仓库已废弃。它的完整提交历史保存在 pigcode/pigcode 的 `archive/origin-main` 分支；frontend 的 `a36fc83` 把这 99 个提交压成了一个，要查这段时间的 `git log` 或 `git blame` 就去这个分支。`archive/ui-refinement-round-2` 是当时没合并的 PR #1。

`docs/superpowers/` 是切换到 Matt Pocock skills 之前的设计稿和计划，作为背景资料阅读，不再往里面加新文件。

# 偏好

与用户对话或者给用户所看文档必须使用中文

## Agent skills

### Issue tracker

Issue 统一放在聚合仓库 pigcode/pigcode 的 GitHub Issues；在 `frontend/` 或 `docs/` 里操作时也必须带 `-R pigcode/pigcode`。See `agents/issue-tracker.md`.

### Triage labels

使用默认的五个标签：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。See `agents/triage-labels.md`.

### Domain docs

单上下文：根目录一个 `GLOSSARY.md`，ADR 放在根目录的 `adr/`，不用默认的 `docs/adr/`。See `agents/domain.md`.
