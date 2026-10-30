# Pigcode

聚合仓库。代码在两个 submodule 里：

- `frontend/`：pigcode/frontend，桌面端和插件平台（pnpm monorepo）
- `docs/`：pigcode/docs，架构设计和里程碑计划

`frontend/` 和 `docs/` 的内容由 `scripts/sync-from-origin.sh` 从 pigcode-origin 镜像过来，同步会删掉 origin 里没有的跟踪文件。所以 agent 配置、`GLOSSARY.md` 和 ADR 都放在聚合仓库根目录，不要写进这两个目录。同步完成后，在聚合仓库里提交新的 submodule 指针。

`docs/superpowers/` 是切换到 Matt Pocock skills 之前的设计稿和计划，作为背景资料阅读，不再往里面加新文件。

## Agent skills

### Issue tracker

Issue 统一放在聚合仓库 pigcode/pigcode 的 GitHub Issues；在 `frontend/` 或 `docs/` 里操作时也必须带 `-R pigcode/pigcode`。See `agents/issue-tracker.md`.

### Triage labels

使用默认的五个标签：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。See `agents/triage-labels.md`.

### Domain docs

单上下文：根目录一个 `GLOSSARY.md`，ADR 放在根目录的 `adr/`，不用默认的 `docs/adr/`。See `agents/domain.md`.
