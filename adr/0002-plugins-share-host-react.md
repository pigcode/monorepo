# UI 插件直接使用宿主的 React 和 ui-primitives

插件的界面代码不能 `import react`，只能用一套 `pg-*` DOM 工具包手写界面，样式照着宿主抄，一直对不齐。我们让渲染进程把自己的 React、ReactDOM、JSX runtime 和 `@pigcode/ui-primitives` 作为共享模块提供给插件：插件按包名 import，拿到的是宿主的同一个实例，打包时把它们标为 external。`pg-*` 工具包逐步淘汰。架构文档 §16 的风险表已经提出过这个做法。

## Considered Options

- 保留 DOM 工具包，让它输出宿主的样式类：宿主组件一改，工具包要跟着手工改，插件仍然落后。
- 插件自带 React：同一个页面出现多个 React 实例，hooks 和 context 跨不过去。

## Consequences

- `@pigcode/ui-primitives` 成为插件的公开 API，它的破坏性改动要按插件 apiVersion 处理。
- 插件绑定宿主的 React 大版本。
- 共享模块必须在插件加载前就位。以后启用严格 CSP 时，要给提供共享模块的方式留出口。
