# dsh-surface-unify

让**插件自己开出来的页面**（工程流程工作台、全屏弹窗、归档 / 技能管理窗口…）
拿到 **壁纸引擎那套毛玻璃**（模糊 + 镜面高光 + 内描边），而不是一层平的半透明色。

## 现象 / 为什么需要它

`dsh-plugin-wallpaper-engine` 只在**令牌源头**接管颜色（`body[data-we-wallpaper]`
改写 `--dsw-alias-bg-base` 与 `--dsw-alias-bg-layer-1/2/3`），毛玻璃的**模糊**则是
逐个面刷出来的 —— 它只给自己的面刷：

| 面 | 引擎给不给模糊 |
| --- | --- |
| 设置窗口（`[role="dialog"]:has([data-slot="settings.section"])`） | 给 |
| 侧栏、输入栏、气泡、自定义侧栏（`[data-dsh-better-sidebar]`） | 给 |
| **插件打开的页面**（座位出口里的整页、插件弹的对话框） | **不给** |

于是插件的页面只有"颜色的半透明"，没有霜 —— 和设置窗口一比就是"没加载毛玻璃"。

## 它做什么

1. **一个令牌都不写**。颜色仍然由壁纸引擎供给，所以对话主区保持引擎给的
   `--dsw-alias-bg-base: transparent`（壁纸直接透出来），不会被本插件染色。
2. 注入一张只带 `[data-dsu-frost]` 标记的样式表，然后**只给"插件打开的页面"**
   打上标记（v0.3 把接管面收窄到这里；DSH 自带的界面一律不碰）：

   | 候选 | 说明 |
   | --- | --- |
   | `[data-slot="shell.overlay"] > *` | 全屏出口里插件注册的整页 / 全屏弹窗 |
   | `[data-slot="main"] > *` | 主区出口里插件注册的整页 |
   | `[role="dialog"]` | 宿主 Modal 的卡片（插件弹窗走的就是它） |

   三条判据**同时满足**才算一个要上霜的页面：

   - **真的画了面**：算出来的 `background-color` 有 alpha，或自带 `background-image`。
     全屏透明包裹层不算 —— 但它会被**往下钻一层**，找到真正画面的那层；
   - **够大**：宽和高都要 ≥ 视口的 35%。横幅、提示条、小浮窗、气泡不碰；
   - **不是 DSH 自带的界面**：元素自己**或子树里**出现 `conversation` / `settings` /
     `sidebar` 锚，或带 `[data-dsh-center-col]` 的，整棵跳过（对话主区、设置窗口、
     侧栏都不会被误伤）。

   另外两条：套在已上霜面板里的对话框不叠第二层霜；`role="presentation"` 的
   Modal 遮罩不碰（它自己就带 `backdrop-filter`）。
3. 配方与壁纸引擎设置窗口**逐字一致**（取自 `dsh-plugin-wallpaper-engine/lib/client.js:1819-1830`）：

```css
backdrop-filter: blur(var(--we-blur, 16px)) saturate(var(--we-saturate, 1.8))
                 brightness(var(--we-glass-brightness, 1.04)) contrast(1.01);
background-color: var(--dsw-alias-bg-layer-1, rgba(24, 32, 48, 0.55));
background-image: linear-gradient(180deg, rgba(255,255,255,0.1), …);   /* 浅色 */
box-shadow: inset 0 1px 0 rgba(255,255,255,0.22), inset 0 0 0 1px rgba(255,255,255,0.06);
```

因为模糊半径读的是 `--we-blur`、底色读的是引擎算好的 `--dsw-alias-bg-layer-1`，
你拖动壁纸引擎的「模糊」和「玻璃透明度」滑杆时，插件页面会跟着一起变。

## 几条刻意的取舍

- **只给"自己画了面"的元素上霜**：判据是算出来的 `background-color` 末位 alpha > 0.02，
  或 `background-image ≠ none`。包裹层上霜会让 `backdrop-filter` 把整屏后面的东西一起糊掉。
- **自带背景图的元素不抢高光**：`background-image ≠ none` 时只加模糊与内描边，
  不覆盖它自己的渐变（否则等于替它换了皮肤）。
- **跳过设置窗口**（子树含 `[data-slot="settings.section"]` 的 dialog）：它已经有引擎的
  那条规则，两层玻璃叠起来会糊成一团。
- **尺寸门槛替代插件白名单**：DOM 里**没有**"这条出口属于哪个插件"的标记 —— 座位渲染器
  只盖 `data-slot="<slotKey>"`（`@deepseek-ai/dsh-client-ui-renderer/lib/client.js:1094-1104`），
  不盖插件名，所以"只接管插件打开的页面"只能用"够大 + 不含原生锚"来近似。
- **软件渲染时不上霜**：`body[data-we-glass-fallback]` 下引擎会退化成近不透明，
  本插件同步禁用模糊，避免"半透明 + 无霜"让文字直接落在壁纸上。

## 安装

应用内**插件市场**输入：

```
github:NanDaDi/dsh-surface-unify
```

装完**完全退出应用**（含托盘）再打开。桌面 profile 由 Electron 应用托管，命令行
`dsh plugin --profile desktop …` 会被拒绝，这是预期行为。

> 从旧版本升级：市场里对该插件点「更新」；若没有更新入口，就卸载后按上面的地址重装一次，
> 然后重启应用 + 在新窗口按 `Ctrl+Shift+R` 硬刷新。

## 卸载 / 关闭

应用内插件市场禁用或卸载，然后完全重启应用。插件不写文件、不改别的插件的数据、
不动 DOM 结构，禁用它 DSH 就回到原生外观。

## 调浓淡

本插件没有自己的滑杆 —— 一切都由壁纸引擎的设置决定：

- **模糊程度**：设置 → 壁纸引擎 → 外观 →「模糊」；
- **玻璃浓淡**：同上 →「玻璃透明度」（越小越实，0 = 最实；越大越透）；
- **配色**：同上 →「玻璃颜色」（浅色/深色主题各按主题底色走）。

## 已知边界（说在前面）

- 页面把底色画在**更深的子元素**上、自己完全透明的，只往下钻一层；再深就交给原生观感了；
- 页面把背景**写死成 `transparent` 字面量、不读 DSH 令牌**的，颜色层面无解
  （例如 `dsh-agency-agents` 108 处、`dsh-skills-manager` 119 处字面量）；
- 依赖壁纸引擎的变量名（`--we-blur` / `--we-saturate` / `--we-glass-brightness`）
  与座位出口名（`data-slot="shell.overlay"` / `"main"`）。引擎或内核改版重命名后会静默
  失效（表现为"什么都没发生"，不报错、不破坏外观）；
- 尺寸门槛是启发式的：一个够大、又不含原生锚的 DSH 自带面板理论上会被误上霜
  （0.3.0 实测的对照集里没有这样的面板）；
- 插件**看不到壁纸引擎的设置值**，只读它写进 DOM 的变量；壁纸关掉时是空操作。

## 兼容性

- DSH `0.2.0-rc.x`（web / desktop profile）；
- 没装壁纸引擎、或壁纸没开时是**空操作**：不为任何元素打标记，也不改变任何东西。

## 开发

```
node test/selftest.mjs     # 无需依赖，跑浏览器半边的行为自检
```

自检用一个最小 DOM 替身把客户端半边跑起来，覆盖：范围判定（出口页面 / 出口里的包裹层 /
横幅 / 小对话框 / 原生对话区 / 设置窗口 / 嵌套对话框 / Modal 遮罩）、"绝不写任何 CSS 令牌"、
不再画面时收标记、幂等、壁纸关闭全撤、卸载后标记 / 样式表 / 监听全清。

## License

MIT
