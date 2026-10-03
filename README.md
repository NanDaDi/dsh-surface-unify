# dsh-surface-unify

让 **所有插件面板的背景** 与 **壁纸引擎面板的背景** 用同一张玻璃配方。

解决的现象：装了 `dsh-plugin-wallpaper-engine` 之后，有些面板是玻璃（半透明 + 雾化 + 保底可读性），
有些面板却**整块透明**，看起来像"背景被改坏了"。

## 它到底改了什么

壁纸引擎不在每个面板上刷背景，它在**令牌源头**接管 —— 只改写四个 CSS 自定义属性
（`dsh-plugin-wallpaper-engine/lib/client.js` 的 `body[data-we-wallpaper]` 规则）：

```css
body[data-we-wallpaper] {
  --dsw-alias-bg-base: transparent;        /* ← 用这层的面 = 完全透 */
  --dsw-specific-sidebar-fill: transparent;/* ← 原生左栏那个"透明的洞" */
  --dsw-alias-bg-layer-1: color-mix(…玻璃色 @ 玻璃透明度 × 0.9…);
  --dsw-alias-bg-layer-2: …              × 1.0 …;
  --dsw-alias-bg-layer-3: …              × 1.1 …;
}
```

所以"某个面有多透"完全取决于**它读了哪一层**。这个插件把 `layer-1` 当母版，
用 `var()` 间接引用接管另外三层：

```js
document.body.style.setProperty('--dsw-alias-bg-base', 'var(--dsw-alias-bg-layer-1, transparent)')
```

三个直接后果：

1. **所有面板变一致** —— 读 base / layer-2 / layer-3 的面，拿到的都是 layer-1 那张配方；
2. **永远跟随壁纸引擎的设置** —— `var()` 是延迟替换的，你拖动「玻璃透明度」滑杆、
   切换浅色/深色主题，被接管的面自动跟着变，本插件不需要重算；
3. **零侵入** —— 不碰 DOM 结构、不改壁纸引擎任何数据、不注册服务、不写文件；
   一旦壁纸关闭（`data-we-wallpaper` 消失）或卸载插件，行内声明立刻摘掉，恢复 DSH 原生外观。

## 安装

在 DSH 应用内的**插件市场**里输入：

```
github:NanDaDi/dsh-surface-unify
```

装完**完全退出应用**（含托盘）再打开。桌面 profile 由 Electron 应用托管，命令行
`dsh plugin --profile desktop …` 会被拒绝，这是预期行为。

## 卸载

应用内插件市场禁用 / 卸载，然后完全重启应用。

## 调浓淡

它自己不提供滑杆 —— 浓淡由壁纸引擎的 **设置 → 壁纸引擎 → 外观 → 玻璃透明度** 统一决定：

- 想更实（壁纸更淡、文字更清楚）：把「玻璃透明度」调小（0 = 最实）；
- 想更透（壁纸更明显）：调大（上限 60）。

## 已知边界（说在前面）

- **对话主区也会拿到这层底**，因此壁纸会比之前淡一点 —— 这是"所有面板一致"的代价；
- 对**自己把背景写死成 `transparent`、根本不读 DSH 令牌**的面板无效
  （例如 `dsh-agency-agents` 里有 108 处、`dsh-skills-manager` 里有 119 处字面量）；
- 依赖壁纸引擎的令牌名（`--dsw-alias-bg-layer-1` 与 `--we-*`）。壁纸引擎若改版重命名，
  本插件会静默失效（表现为"什么都没发生"，不会报错、不会破坏外观）；
- 故意不动原生左栏（`--dsw-specific-sidebar-fill`）：那是壁纸引擎「左侧栏覆盖」开关的职责。

## 兼容性

- DSH `0.2.0-rc.x`（web / desktop profile）；
- 检测不到壁纸引擎时完全是空操作：`layer-1` 不存在就不落值。

## License

MIT
