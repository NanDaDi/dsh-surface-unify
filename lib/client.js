/**
 * dsh-surface-unify — client half (browser).
 *
 * 让所有插件面板的背景与壁纸引擎（dsh-plugin-wallpaper-engine）面板用同一张
 * 玻璃配方。
 *
 * ── 为什么要这一层 ─────────────────────────────────────────────────────────
 * 壁纸引擎并不逐个面板刷背景，它在令牌源头接管：`lib/client.js` 里那条
 * `body[data-we-wallpaper]` 规则只改写四个自定义属性 ——
 *
 *   --dsw-alias-bg-base: transparent;          ← 完全透（对话主区，以及拿它做底的面板）
 *   --dsw-specific-sidebar-fill: transparent;  ← 原生左栏那个"透明的洞"
 *   --dsw-alias-bg-layer-1: <color-mix 配方，玻璃权重 0.9>
 *   --dsw-alias-bg-layer-2 / -3: 同一张配方，权重 1.0 / 1.1
 *
 * 于是"某个面有多透"完全取决于它读了哪一层：读 layer-1/2/3 的面拿到玻璃，
 * 读 base 的面拿到完全透明 ⇒ 观感撕裂，这就是"其他插件的背景被改成透明了"。
 *
 * ── 做法 ──────────────────────────────────────────────────────────────────
 * 把 layer-1 当作母版，用 `var()` 间接引用写给 base / layer-2 / layer-3：
 *
 *   body.style.setProperty('--dsw-alias-bg-base', 'var(--dsw-alias-bg-layer-1, transparent)')
 *
 *   - `var()` 在自定义属性里是**延迟替换**的 ⇒ 源值一变（动「玻璃透明度」滑杆、
 *     切浅色/深色主题），所有被接管的面自动跟着变，本插件不需要重算、不需要监听
 *     主题，也不需要读壁纸引擎的配置文件。
 *   - 写在 **body 的行内样式** 上：行内声明优先于样式表规则 ⇒ 稳定压住壁纸引擎
 *     那几条 `body[data-we-wallpaper]` / `body[data-ds-dark-theme][data-we-wallpaper]`
 *     规则，既不需要 `!important`，也不依赖选择器特异性（主题表改版也不会赢我们）。
 *   - 只在壁纸**确实激活**（body 有 `data-we-wallpaper`）且 layer-1 **确实存在**
 *     时落值；任一条件不成立就立刻摘掉自己的行内声明，恢复 DSH 原生外观。
 *
 * ── 不做的事 ──────────────────────────────────────────────────────────────
 * 不碰 DOM 结构、不注册任何服务、不声明 inject。声明了 inject 却没有服务可用
 * 会让客户端条目停在 pending，而客户端加载器把任何非 active 条目当致命错误
 * ⇒ `web boot: N entry did not activate`，整个 GUI 打不开。
 *
 * 本文件必须是浏览器 ModuleLoader 格式（不是 ESM）：它由客户端加载器直接
 * eval，`require` 由宿主注入（本插件不需要任何模块）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-surface-unify',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    /** 壁纸引擎写玻璃配方的那个令牌：本插件把它当母版。 */
    const SOURCE = '--dsw-alias-bg-layer-1'

    /**
     * 被接管的令牌。
     *
     * - `--dsw-alias-bg-base`：全局底，对话主区在用，也是"全透面板"的元凶；
     * - `--dsw-alias-bg-layer-2` / `-3`：各插件面板分散读这两层（比 layer-1 更透），
     *   压平成同一档，面板之间才真正一致。
     *
     * 故意不动 `--dsw-specific-sidebar-fill`（原生左栏）：壁纸引擎自己有
     * 「左侧栏覆盖」开关管它，两处一起改会互相打架。
     */
    const TARGETS = [
      '--dsw-alias-bg-base',
      '--dsw-alias-bg-layer-2',
      '--dsw-alias-bg-layer-3',
    ]

    /** 壁纸激活时壁纸引擎打在 body 上的标记属性。 */
    const WALLPAPER_ATTR = 'data-we-wallpaper'

    let observer = null
    let applied = false

    /** 摘掉本插件写下的行内声明（只摘自己写的那三个键）。 */
    function clear(el) {
      if (!applied) return
      for (const token of TARGETS) el.style.removeProperty(token)
      applied = false
    }

    /** 按当前状态落值或撤回。任何异常都不允许向外冒。 */
    function sync() {
      try {
        const el = document.body
        if (!el) return
        if (!el.hasAttribute(WALLPAPER_ATTR)) return clear(el)
        // 源令牌必须真实存在：`var()` 指向一个不存在的自定义属性且没有回退值时，
        // 整条声明会变成无效值（IACVT），面板底色会直接消失 —— 那比"透明"更糟。
        const source = getComputedStyle(el).getPropertyValue(SOURCE)
        if (!source || !source.trim()) return clear(el)
        for (const token of TARGETS) {
          el.style.setProperty(token, `var(${SOURCE}, transparent)`)
        }
        applied = true
      } catch {
        /* 客户端半边永远不把加载器拖进失败态：做不成就当没做。 */
      }
    }

    /** 挂载监听。壁纸引擎通常在客户端加载器之后才激活壁纸，故必须守着属性变化。 */
    function start() {
      try {
        if (!document.body) return
        sync()
        // 幂等：重复 apply（热重载）不重复挂监听，否则每次都会多一个观察者。
        if (observer) return
        observer = new MutationObserver(sync)
        observer.observe(document.body, {
          attributes: true,
          // 只盯壁纸开关：绝不能盯 style，否则自己写行内样式会自激成死循环。
          // 主题切换不需要重算 —— var() 间接引用会自己跟着变。
          attributeFilter: [WALLPAPER_ATTR],
        })
      } catch {
        /* 观察不到就退化成"只在挂载时同步一次"，不影响渲染。 */
      }
    }

    /** 空 inject：本插件不等待任何服务，条目立即 active。 */
    exports.inject = []

    exports.apply = function apply(ctx) {
      try {
        if (document.body) start()
        else document.addEventListener('DOMContentLoaded', start, { once: true })

        // 卸载（热重载 / 禁用）：断开监听并撤回行内声明，回到 DSH 原生外观。
        if (ctx && typeof ctx.on === 'function') {
          ctx.on('dispose', () => {
            try {
              if (observer) observer.disconnect()
              observer = null
            } catch {}
            try {
              if (document.body) clear(document.body)
            } catch {}
          })
        }
      } catch {
        /* 同上：永不抛出。 */
      }
    }

    return module.exports
  },
})
