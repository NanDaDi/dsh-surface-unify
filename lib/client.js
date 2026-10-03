/**
 * dsh-surface-unify — client half (browser).
 *
 * 给**插件自己开出来的页面**套上壁纸引擎那套毛玻璃，让它们和「设置」窗口一个观感。
 *
 * ── 参照物：壁纸引擎怎么给设置窗口上玻璃 ────────────────────────────────────
 * `dsh-plugin-wallpaper-engine/lib/client.js:1785`（深色版 :1834）把一整包属性下在
 * 设置对话框那张卡片上：
 *
 *   -webkit-backdrop-filter / backdrop-filter：
 *     blur(var(--we-blur, 16px)) saturate(var(--we-saturate, 1.8))
 *     brightness(var(--we-glass-brightness, 1.04)) contrast(1.01)
 *   background-image：linear-gradient(180deg, …)  ← 镜面高光（specular sheen）
 *
 * 关键是「模糊画在承载面板的元素自己身上」。只把颜色令牌指过去（v0.1 的做法）
 * 拿不到 blur 与 sheen，看着就是一坨平的半透明色；而且 v0.1 改的是 body 上的
 * 公共令牌，顺手把对话主区也染了 —— 用户明确不要这个（m01066）。
 *
 * ── 只接管什么（用户 m01122 定稿的范围）────────────────────────────────────
 * 只碰**插件打开的页面 / 窗口**，DSH 自带的界面一律不动：
 *
 *   1. `[data-slot="shell.overlay"] > *` —— 插件注册到全屏出口的页面（工程流程
 *      工作台、插件市场…）。座位出口是 slot 渲染器盖的章，是个
 *      `display:contents` 的包裹 div，插件注册的元素就是它的直接子元素。
 *   2. `[data-slot="main"] > *`             —— 插件注册到主区的页面。
 *   3. `[role="dialog"]`                    —— 宿主 Modal 的对话框卡片（归档管理
 *      这类用宿主 Dialog 的插件窗口都走它；宿主把 mask 标成 `role="presentation"`，
 *      卡片才是 `role="dialog"`，所以遮罩不会被误伤）。
 *
 * 三层过滤把这些收窄成「一个页面」：
 *   · **原生锚**：元素自己或子树里出现 conversation / settings / sidebar 锚
 *     （`[data-slot*="conversation"]`、`[data-slot*="settings"]`、
 *     `[data-slot*="sidebar"]`、`[data-dsh-center-col]`）就整棵不碰 —— 对话主区、
 *     设置窗口、侧栏都在这里被挡掉，v0.1 那个"把对话区染色"的事故不可能重演。
 *   · **尺寸下限**：宽和高都要占到视口的 35% 以上。横幅（42px）、提示条、页签、
 *     小浮窗都够不着，只有真正打开的面板够得着。
 *   · **自己画了面**：只认元素自己的 background。全屏透明包裹层（只负责居中/遮罩）
 *     不上霜，否则 backdrop-filter 会把整个视口后面的东西一起糊掉；遇到这种包裹层
 *     往下钻一层，找它真正画面的那层。
 *
 * ── 做法 ──────────────────────────────────────────────────────────────────
 * 注入一张只带 `[data-dsu-frost]` 标记的样式表，然后给命中的元素盖标记：
 * background-color 指向引擎已经摆好的 `--dsw-alias-bg-layer-1`（玻璃底色），
 * 加上与设置窗口逐字一致的 backdrop-filter 与镜面高光。**一个 CSS 令牌都不写**
 * —— 行内样式只出现在被标记的元素自己的 `data-dsu-*` 属性上。
 *
 * ── 不做的事 ──────────────────────────────────────────────────────────────
 * 不碰 DOM 结构、不改任何插件的数据、不写令牌、不注册服务、不声明 inject。
 * 声明了 inject 却没有服务可用会让客户端条目停在 pending，而客户端加载器把任何
 * 非 active 条目当致命错误 ⇒ `web boot: N entry did not activate`，整个 GUI 打不开。
 *
 * 本文件必须是浏览器 ModuleLoader 格式（不是 ESM）：它由客户端加载器直接 eval，
 * `require` 由宿主注入（本插件不需要任何模块）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-surface-unify',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    /** 壁纸激活标记（壁纸引擎打）。没有它，本插件什么也不做。 */
    const WALLPAPER_ATTR = 'data-we-wallpaper'
    /** 壁纸引擎判定为软件渲染时的标记：那边会退化成近不透明，我们也不再上霜。 */
    const FALLBACK_ATTR = 'data-we-glass-fallback'

    const MARK = 'data-dsu-frost'
    const SHEEN = 'data-dsu-sheen'
    const STYLE_ID = 'dsh-surface-unify-style'

    /** 插件的页面出口：座椅锚由 DSH 的 slot 渲染器盖章（`dsh-client-ui-renderer`）。 */
    const OUTLETS = ['[data-slot="shell.overlay"]', '[data-slot="main"]']
    /** 宿主 Modal 的对话框卡片。遮罩是 `role="presentation"`，不会命中。 */
    const DIALOGS = '[role="dialog"]'
    /** DSH 自带界面的锚：元素自己或子树里出现就整棵不碰。 */
    const NATIVE = [
      '[data-slot*="conversation"]',
      '[data-slot*="settings"]',
      '[data-slot*="sidebar"]',
      '[data-dsh-center-col]',
    ].join(', ')
    /** 「页面」的尺寸下限（宽、高各占视口的比例）。 */
    const MIN_RATIO = 0.35

    /** 玻璃底色：引擎已经在 body 上算好，这里只是取用；取不到时给个中性兜底。 */
    const TINT = 'var(--dsw-alias-bg-layer-1, rgba(24, 32, 48, 0.55))'
    /** 与壁纸引擎设置窗口逐字一致的配方（含默认值，引擎缺省项也不跑偏）。 */
    const FROST =
      'blur(var(--we-blur, 16px)) saturate(var(--we-saturate, 1.8)) ' +
      'brightness(var(--we-glass-brightness, 1.04)) contrast(1.01)'
    const SHEEN_LIGHT =
      'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.03) 38%, rgba(255,255,255,0.05) 100%)'
    const SHEEN_DARK =
      'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 38%, rgba(255,255,255,0.03) 100%)'

    const CSS = [
      `body[${WALLPAPER_ATTR}] [${MARK}] {`,
      `  background-color: ${TINT};`,
      `  -webkit-backdrop-filter: ${FROST};`,
      `  backdrop-filter: ${FROST};`,
      `}`,
      `body[${WALLPAPER_ATTR}] [${MARK}][${SHEEN}] { background-image: ${SHEEN_LIGHT}; }`,
      `body[data-ds-dark-theme][${WALLPAPER_ATTR}] [${MARK}][${SHEEN}] { background-image: ${SHEEN_DARK}; }`,
      // 引擎判定软件渲染时不带模糊 —— 半透明 + 无霜会让文字直接落在壁纸上，宁可不上霜。
      `body[${FALLBACK_ATTR}][${WALLPAPER_ATTR}] [${MARK}] {`,
      `  -webkit-backdrop-filter: none;`,
      `  backdrop-filter: none;`,
      `}`,
    ].join('\n')

    const marked = new Set()
    let observer = null
    let styleEl = null
    let timer = null
    let busy = false

    function viewport() {
      try {
        const w = window.innerWidth || (document.documentElement && document.documentElement.clientWidth) || 0
        const h = window.innerHeight || (document.documentElement && document.documentElement.clientHeight) || 0
        return { w, h }
      } catch {
        return { w: 0, h: 0 }
      }
    }

    /**
     * 这个元素自己画了面吗？
     *
     * 只认元素自己的 background —— 给一个"什么都没有"的透明包裹层加 backdrop-filter
     * 会把整个视口后面糊掉。没画面的元素由 collect() 继续往下钻。
     */
    function paints(el) {
      let cs = null
      try {
        cs = getComputedStyle(el)
      } catch {
        return false
      }
      if (!cs) return false
      const image = cs.backgroundImage
      if (typeof image === 'string' && image && image !== 'none') return true
      const bg = typeof cs.backgroundColor === 'string' ? cs.backgroundColor.trim() : ''
      if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') return false
      const match = /rgba?\(([^)]*)\)/i.exec(bg)
      if (match) {
        const parts = match[1].split(/[,/]/).map((part) => part.trim())
        const alpha = parts.length > 3 ? Number(parts[3]) : 1
        if (!(alpha > 0.02)) return false
      }
      return true
    }

    /** 「像个页面」：宽和高都要占到视口的 MIN_RATIO 以上。 */
    function pageSized(el) {
      try {
        if (typeof el.getBoundingClientRect !== 'function') return false
        const rect = el.getBoundingClientRect()
        if (!rect) return false
        const { w, h } = viewport()
        if (!(w > 0) || !(h > 0)) return false
        return rect.width >= w * MIN_RATIO && rect.height >= h * MIN_RATIO
      } catch {
        return false
      }
    }

    /** 元素自己或子树里有没有 DSH 自带的界面锚（对话主区 / 设置 / 侧栏）。 */
    function isNative(el) {
      try {
        if (el.matches && el.matches(NATIVE)) return true
        return !!(el.querySelector && el.querySelector(NATIVE))
      } catch {
        return false
      }
    }

    function ensureStyle() {
      try {
        const doc = document
        const head = doc.head || doc.documentElement
        if (!head) return
        if (styleEl && styleEl.isConnected !== false) return
        styleEl = doc.getElementById ? doc.getElementById(STYLE_ID) : null
        if (!styleEl) {
          styleEl = doc.createElement('style')
          styleEl.id = STYLE_ID
          head.appendChild(styleEl)
        }
        styleEl.textContent = CSS
      } catch {
        /* 注入不了就退化成"什么都没发生"。 */
      }
    }

    function mark(el) {
      try {
        el.setAttribute(MARK, '')
        let image = 'none'
        try {
          image = getComputedStyle(el).backgroundImage
        } catch {}
        // 面板自带 background-image（渐变色卡之类）时不抢它的镜面高光。
        if (typeof image !== 'string' || !image || image === 'none') el.setAttribute(SHEEN, '')
        marked.add(el)
      } catch {}
    }

    function unmark(el) {
      try {
        el.removeAttribute(MARK)
        el.removeAttribute(SHEEN)
      } catch {}
      marked.delete(el)
    }

    function unmarkAll() {
      for (const el of [...marked]) unmark(el)
    }

    /**
     * 从一个候选元素往下找"真正画面的那一层"：
     * 原生界面 / 尺寸不够 → 整棵放弃；透明包裹层 → 往下钻；画了面 → 收下。
     */
    function collect(el, out) {
      try {
        if (!el || el.nodeType !== 1) return
        if (isNative(el)) return
        if (!pageSized(el)) return
        if (paints(el)) {
          out.add(el)
          return
        }
        const kids = el.children
        if (!kids) return
        for (const kid of kids) collect(kid, out)
      } catch {}
    }

    /** 扫一遍候选元素：该上霜的上，已经不该上的摘掉。 */
    function scan() {
      if (busy) return
      busy = true
      try {
        const body = document.body
        if (!body) return
        if (!body.hasAttribute(WALLPAPER_ATTR)) return unmarkAll()

        const targets = new Set()

        for (const selector of OUTLETS) {
          let hosts = []
          try {
            hosts = body.querySelectorAll ? [...body.querySelectorAll(selector)] : []
          } catch {
            hosts = []
          }
          for (const host of hosts) {
            const kids = host.children
            if (!kids) continue
            for (const kid of kids) collect(kid, targets)
          }
        }

        let dialogs = []
        try {
          dialogs = body.querySelectorAll ? [...body.querySelectorAll(DIALOGS)] : []
        } catch {
          dialogs = []
        }
        for (const dialog of dialogs) collect(dialog, targets)

        // 套在已经上霜的面板里的元素不再单独上霜（两层 backdrop-filter 会糊成一片）。
        for (const el of [...targets]) {
          let parent = el.parentElement
          while (parent) {
            if (targets.has(parent)) {
              targets.delete(el)
              break
            }
            parent = parent.parentElement
          }
        }

        for (const el of targets) {
          if (!marked.has(el)) mark(el)
        }

        // 已经离开候选集合（或被卸载）的元素：把标记收回，别留孤立的霜。
        for (const el of [...marked]) {
          if (targets.has(el)) continue
          unmark(el)
        }
      } catch {
        /* 永远不把加载器拖进失败态：上不了霜就当没有这个插件。 */
      } finally {
        busy = false
      }
    }

    /** 合并连续变化（聊天流式输出会疯狂触发 mutation），下一帧只扫一次。 */
    function schedule() {
      if (timer !== null) return
      try {
        if (typeof requestAnimationFrame === 'function') {
          timer = requestAnimationFrame(() => {
            timer = null
            scan()
          })
          return
        }
      } catch {}
      try {
        timer = setTimeout(() => {
          timer = null
          scan()
        }, 50)
      } catch {
        timer = null
        scan()
      }
    }

    function start() {
      try {
        if (!document.body) return
        ensureStyle()
        scan()
        // 幂等：热重载时重复 apply 不重复挂监听。
        if (observer) return
        observer = new MutationObserver(schedule)
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          // 只盯会影响"哪些面板存在 / 壁纸开没开 / 尺寸算不算页面"的属性。
          // 绝不能盯我们自己的 data-dsu-*，否则打标记会自激成死循环。
          attributeFilter: [WALLPAPER_ATTR, FALLBACK_ATTR, 'class', 'role', 'style', 'data-ds-dark-theme'],
        })
        // 视口变化会影响"算不算一个页面"，跟着重扫（合并进同一帧）。
        if (typeof window.addEventListener === 'function') window.addEventListener('resize', schedule)
      } catch {
        /* 观察不到就退化成"挂载时扫一次"。 */
      }
    }

    function stop() {
      try {
        if (observer) observer.disconnect()
      } catch {}
      observer = null
      try {
        if (timer !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(timer)
      } catch {}
      try {
        if (timer !== null && typeof clearTimeout === 'function') clearTimeout(timer)
      } catch {}
      timer = null
      unmarkAll()
      try {
        if (typeof window.removeEventListener === 'function') window.removeEventListener('resize', schedule)
      } catch {}
      try {
        if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl)
      } catch {}
      styleEl = null
    }

    /** 空 inject：本插件不等待任何服务，条目立即 active。 */
    exports.inject = []

    exports.apply = function apply(ctx) {
      try {
        if (document.body) start()
        else document.addEventListener('DOMContentLoaded', start, { once: true })

        // 卸载（热重载 / 禁用）：收回标记、移除样式表，回到 DSH 原生外观。
        if (ctx && typeof ctx.on === 'function') ctx.on('dispose', stop)
      } catch {
        /* 同上：永不抛出。 */
      }
    }

    return module.exports
  },
})
