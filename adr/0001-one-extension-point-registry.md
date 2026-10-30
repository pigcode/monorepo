# 内置功能和插件通过同一个扩展点注册表登记界面

界面原来有五条登记途径：slot、`registerPanel`、`registerSurface`、shell 的 props，以及两个没有调用方的注册函数。真正挂载的 slot 只有 `chat.view` 和 `settings.section`，而且都被内置功能整页占用。设置分区、Workbench 的 Surface、Command、工具渲染器都写死在代码里，插件扩展不了。我们改成一个扩展点注册表，只设五个扩展点：Panel、Surface、设置页、Command、工具渲染器。内置功能和插件都通过它登记，遵守同一套归属、冲突和清理规则。

## Considered Options

- 补齐架构文档 §7.6 列出的 16 个 slot：大部分在界面上没有挂载位置，补了也只是空名字。
- 保留现有途径，只给插件补缺口：内置功能继续走私有路径，插件能做的事永远比内置功能少。

## Consequences

- 和架构文档 §7.6 的 slot 列表不一致。以后新增扩展点，必须同时在界面上有挂载位置。
- 插件 manifest 里没有被读取的 `contributes.settings`、`contributes.commands`、`contributes.slots` 要么接到注册表上，要么删掉。
