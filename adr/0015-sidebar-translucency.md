# 侧栏透明度接通系统磨砂材质，整套磨砂模式仍不开

ADR 0004 让磨砂一直关着。现在外观设置里加了「侧栏透明度」（0–100，默认 0）：大于 0 时，页面把窗口底色 `--window` 按比例换成半透明（100 时页面完全不画底色），主进程把 BrowserWindow 的底色设成透明，并换成更透的系统材质：macOS 从创建时的 `sidebar` 换成 `fullscreen-ui`，Windows 从 mica 换成 acrylic。关掉时两样都换回去。侧栏和窗口边框透明，对话、卡片、输入框仍是不透明的，所以文字的可读性不受影响。Linux 没有系统材质，控件禁用并说明原因。

## Considered Options

- 直接接通整套磨砂（`data-glass` 和 `glass.css`）：所有表面都变半透明，要给每一层重新定可读性，还要为它生成一整套视觉基线，代价远大于这次的需求。
- 只在页面里把侧栏做成半透明：窗口底色是不透明的，透过去看到的还是窗口色，看不出任何变化。
- 用 `transparent: true` 创建窗口：macOS 上会丢掉窗口阴影和圆角，也不能在运行时切换，只能重启窗口；没有模糊，背后的文字会直接压在侧栏文字底下。
- 沿用 `sidebar` 材质：实测它是最灰的一种，背后是白色窗口时侧栏只是变成一块灰，调高透明度反而更灰，看起来像没生效。在同一张渐变背景上对比了 sidebar、under-window、window、header、menu、popover、hud、fullscreen-ui，`fullscreen-ui` 在浅色、深色下都最能透出颜色。

## Consequences

- 透明的窗口底色必须写成 `#00000000`：Electron 把 `"transparent"` 解析成白色，窗口会变成不透明的白底。`e2e/theme-colors.spec.ts` 在真实窗口上检查 `getBackgroundColor()`，写回 `"transparent"` 会让它失败。
- 磨砂材质只透颜色、不透文字；背后是白色窗口时效果很淡，背后是彩色壁纸或窗口时最明显。

- 开关在运行时生效：页面推导出 `data-translucent` 后经 `pigcode:set-translucent` 通知主进程，关掉时换回默认主题的窗口色，避免缩放窗口时露出透明的边。
- `--window` 只被 body、Windows/Linux 的标题栏和窄窗口下的侧栏抽屉使用；抽屉盖在内容上，透明时改用 `--popover`。
- 半透明的 `--window` 读不成 6 位颜色，Windows 原生标题栏按钮会沿用上一次的颜色。
- `glass` 设置项和 `glass.css` 仍然没人用，ADR 0004 对整套磨砂的决定不变。
