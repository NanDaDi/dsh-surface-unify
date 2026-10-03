/**
 * dsh-surface-unify — 自检（node test/selftest.mjs，无外部依赖）。
 *
 * 客户端半边是浏览器 ModuleLoader 格式、跑在页面里，没法直接 import。这个脚本
 * 造一个最小 DOM 替身把它跑起来，验证 v0.4 的范围与行为：
 *
 *   1. 绝不写任何 CSS 令牌（v0.1 改坏对话主区的那件事，必须永远不再发生）；
 *   2. 壁纸没开时一个标记都不打；
 *   3. 只给「插件打开的页面」上霜：座位出口的页面、宿主 Modal 的对话框卡片；
 *      —— 但内核图片灯箱那张 backdrop（`role="dialog"` 打在整个遮罩自己身上）不算；
 *   4. DSH 自带的界面一律不碰：对话主区、设置窗口、侧栏锚（自己命中或子树里出现）；
 *   5. 横幅 / 提示条 / 小浮窗（尺寸不够）不上霜；
 *   6. 页面根节点被引擎算成透明（`--dsw-alias-bg-base` 被置成 transparent）时仍然接管；
 *      单纯只装着一个画面的透明包裹层，则让位给里面那层；含 video 的面不碰；
 *   7. 套在已上霜面板里的对话框不再单独上霜（不叠两层 backdrop-filter）；
 *   8. 元素不再画面 ⇒ 收标记；壁纸关闭 / 卸载插件 ⇒ 全部撤掉。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const CLIENT = join(here, '..', 'lib', 'client.js')

const MARK = 'data-dsu-frost'
const SHEEN = 'data-dsu-sheen'
const WALLPAPER_ATTR = 'data-we-wallpaper'
const STYLE_ID = 'dsh-surface-unify-style'

const VIEWPORT = { w: 1600, h: 900 }

// ── 最小 DOM 替身 ───────────────────────────────────────────────────────────
/** 记录 body 上有没有被写过行内令牌（setProperty / removeProperty）—— 必须永远是空的。 */
const bodyInlineWrites = []

function matchOne(el, selector) {
  const sel = selector.trim()
  let m = /^\[([A-Za-z0-9-]+)="([^"]*)"\]$/.exec(sel)
  if (m) return el.getAttribute(m[1]) === m[2]
  m = /^\[([A-Za-z0-9-]+)\*="([^"]*)"\]$/.exec(sel)
  if (m) {
    const value = el.getAttribute(m[1])
    return typeof value === 'string' && value.includes(m[2])
  }
  m = /^\[([A-Za-z0-9-]+)\]$/.exec(sel)
  if (m) return el.hasAttribute(m[1])
  if (/^[a-z][a-z0-9-]*$/.test(sel)) return el.tag === sel
  throw new Error(`DOM 替身不认识的选择器: ${sel}`)
}

function matchesSelector(el, selector) {
  return String(selector)
    .split(',')
    .some((part) => matchOne(el, part))
}

function descendants(el, out = []) {
  for (const child of el.children) {
    out.push(child)
    descendants(child, out)
  }
  return out
}

class El {
  constructor(options = {}) {
    this.nodeType = 1
    this.tag = options.tag ?? 'div'
    this.attrs = { ...(options.attrs ?? {}) }
    this.computed = {
      backgroundColor: options.bg ?? 'rgba(0, 0, 0, 0)',
      backgroundImage: options.image ?? 'none',
    }
    this.children = []
    this.parentNode = null
    this.connected = true
    this.rect = options.rect ?? { width: 0, height: 0 }
    this.style = {
      setProperty: (key, value) => bodyInlineWrites.push([key, value]),
      removeProperty: (key) => bodyInlineWrites.push([key, null]),
    }
    for (const child of options.children ?? []) this.appendChild(child)
  }
  appendChild(node) {
    node.parentNode = this
    node.connected = true
    this.children.push(node)
    return node
  }
  removeChild(node) {
    this.children = this.children.filter((child) => child !== node)
    node.parentNode = null
    node.connected = false
    return node
  }
  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null
  }
  get isConnected() {
    return this.connected
  }
  getBoundingClientRect() {
    return this.rect
  }
  setAttribute(name, value) {
    this.attrs[name] = value === undefined ? '' : String(value)
  }
  getAttribute(name) {
    return name in this.attrs ? this.attrs[name] : null
  }
  hasAttribute(name) {
    return name in this.attrs
  }
  removeAttribute(name) {
    delete this.attrs[name]
  }
  matches(selector) {
    return matchesSelector(this, selector)
  }
  querySelector(selector) {
    return descendants(this).find((el) => matchesSelector(el, selector)) ?? null
  }
}

const body = new El({ tag: 'body' })
const head = new El({ tag: 'head' })

// ── 场景 1：全屏出口里的插件页面 ────────────────────────────────────────────
const overlayHost = new El({ attrs: { 'data-slot': 'shell.overlay' } })
// 工程流程工作台的真实形态：根节点 `background: var(--dsw-alias-bg-base)`，而壁纸引擎把这个
// 令牌置成了 transparent ⇒ 算出来就是透明，但仍然必须接管（v0.4 的修正点）。
const workbench = new El({ bg: 'rgba(0, 0, 0, 0)', rect: { width: 1600, height: 900 } })
const workbenchHeader = new El({ rect: { width: 1600, height: 64 } })
const workbenchTabbar = new El({ rect: { width: 1600, height: 52 } })
const workbenchBody = new El({ rect: { width: 1600, height: 780 } })
const nestedDialog = new El({ attrs: { role: 'dialog' }, bg: 'rgba(30, 30, 30, 0.9)', rect: { width: 800, height: 600 } })
for (const child of [workbenchHeader, workbenchTabbar, workbenchBody, nestedDialog]) workbench.appendChild(child)
// 只装着一个画面的透明包裹层 ⇒ 让位给里面的画面层。
const wrapper = new El({ bg: 'rgba(0, 0, 0, 0)', rect: { width: 1600, height: 900 } })
const innerPanel = new El({ bg: 'rgba(20, 30, 50, 0.6)', rect: { width: 1000, height: 800 } })
wrapper.appendChild(innerPanel)
const banner = new El({ bg: 'rgba(0, 0, 0, 0.5)', rect: { width: 1600, height: 42 } })
const nativePage = new El({ bg: 'rgba(10, 10, 10, 0.8)', rect: { width: 1600, height: 900 } })
nativePage.appendChild(new El({ attrs: { 'data-slot': 'conversation' } }))
const gradientPanel = new El({ bg: 'rgba(0, 0, 0, 0)', image: 'linear-gradient(90deg, #000, #fff)', rect: { width: 1200, height: 700 } })
// 含 video 的面（壁纸 / 开机动画）不碰；内核开机卡片（data-dsh-boot）也不碰。
const videoPanel = new El({ bg: 'rgba(0, 0, 0, 0)', rect: { width: 1500, height: 700 } })
videoPanel.appendChild(new El({ tag: 'video', rect: { width: 1500, height: 700 } }))
const bootCard = new El({ attrs: { 'data-dsh-boot': '' }, bg: 'rgba(0, 0, 0, 0)', rect: { width: 1600, height: 900 } })
for (const child of [workbench, wrapper, banner, nativePage, gradientPanel, videoPanel, bootCard]) overlayHost.appendChild(child)

// ── 场景 2：主区出口里的插件页面 + 对话主区 ─────────────────────────────────
const mainHost = new El({ attrs: { 'data-slot': 'main' } })
const mainPage = new El({ bg: 'rgba(15, 25, 40, 0.7)', rect: { width: 1500, height: 860 } })
const conversation = new El({ attrs: { 'data-slot': 'main.conversation' }, bg: 'rgba(0, 0, 0, 0.5)', rect: { width: 1500, height: 860 } })
mainHost.appendChild(mainPage)
mainHost.appendChild(conversation)

// ── 场景 3：宿主 Modal（body 侧 portal）：遮罩 + 卡片 ───────────────────────
const modalRoot = new El({ attrs: { role: 'presentation' } })
const mask = new El({ attrs: { role: 'presentation', 'aria-hidden': 'true' }, bg: 'rgba(0, 0, 0, 0.4)', rect: { width: 1600, height: 900 } })
const modalCard = new El({ attrs: { role: 'dialog' }, bg: 'rgba(20, 20, 20, 0.9)', rect: { width: 680, height: 500 } })
const settingsCard = new El({ attrs: { role: 'dialog' }, bg: 'rgba(20, 20, 20, 0.9)', rect: { width: 700, height: 520 } })
settingsCard.appendChild(new El({ attrs: { 'data-slot': 'settings.section' } }))
const smallDialog = new El({ attrs: { role: 'dialog' }, bg: 'rgba(20, 20, 20, 0.9)', rect: { width: 400, height: 200 } })
for (const child of [mask, modalCard, settingsCard, smallDialog]) modalRoot.appendChild(child)

// ── 场景 3b：内核图片灯箱（`role="dialog"` 打在整个 backdrop 上）──────────────
// `@deepseek-ai/dsh-client-ui-attachment` 的 ImageLightbox 是 body portal，形态为
//   div.backdrop[role="dialog"][aria-modal] > (div.mask[aria-hidden] + img + button)
// 它是遮罩不是面板：上霜会把「图片外面那一圈」本来压暗的底换成玻璃色（用户报的正是这个）。
const lightbox = new El({ attrs: { role: 'dialog', 'aria-modal': 'true' }, bg: 'rgba(0, 0, 0, 0.85)', rect: { width: 1600, height: 900 } })
const lightboxMask = new El({ attrs: { 'aria-hidden': 'true' }, bg: 'rgba(0, 0, 0, 0.6)', rect: { width: 1600, height: 900 } })
const lightboxImage = new El({ tag: 'img', rect: { width: 900, height: 600 } })
const lightboxClose = new El({ tag: 'button', rect: { width: 32, height: 32 } })
for (const child of [lightboxMask, lightboxImage, lightboxClose]) lightbox.appendChild(child)
// 反例：真正的对话框卡片里有个 16×16 装饰性 aria-hidden，不能因此被当成遮罩放过。
const decorDialog = new El({ attrs: { role: 'dialog' }, bg: 'rgba(25, 25, 25, 0.9)', rect: { width: 800, height: 600 } })
decorDialog.appendChild(new El({ attrs: { 'aria-hidden': 'true' }, rect: { width: 16, height: 16 } }))
for (const child of [lightbox, decorDialog]) modalRoot.appendChild(child)

for (const child of [overlayHost, mainHost, modalRoot]) body.appendChild(child)

const allCandidates = [
  overlayHost,
  workbench,
  workbenchHeader,
  workbenchTabbar,
  workbenchBody,
  nestedDialog,
  wrapper,
  innerPanel,
  banner,
  nativePage,
  gradientPanel,
  videoPanel,
  bootCard,
  mainHost,
  mainPage,
  conversation,
  modalRoot,
  mask,
  modalCard,
  settingsCard,
  smallDialog,
  lightbox,
  lightboxMask,
  lightboxImage,
  lightboxClose,
  decorDialog,
]

body.querySelectorAll = (selector) => descendants(body).filter((el) => matchesSelector(el, selector))

const styleRegistry = new Map()
const documentStub = {
  body,
  head,
  documentElement: head,
  addEventListener: () => {},
  createElement: (tag) => new El({ tag }),
  getElementById: (id) => styleRegistry.get(id) ?? null,
}

// head.appendChild 要登记 style，getElementById 才找得到（幂等注入会走这条路）。
const originalAppend = head.appendChild.bind(head)
head.appendChild = (node) => {
  originalAppend(node)
  // 插件的 ensureStyle() 用 `styleEl.id = STYLE_ID`（普通属性），不走 setAttribute。
  const id = node.id ?? node.attrs.id
  if (node.tag === 'style' && id) styleRegistry.set(id, node)
  return node
}

const queued = []
const observers = []
const listeners = []
let captured = null

const sandbox = {
  document: documentStub,
  getComputedStyle: (el) => el.computed,
  MutationObserver: class {
    constructor(callback) {
      this.callback = callback
      this.disconnected = false
      observers.push(this)
    }
    observe() {}
    disconnect() {
      this.disconnected = true
    }
  },
  setTimeout: (fn) => {
    queued.push(fn)
    return queued.length
  },
  clearTimeout: () => {},
  requestAnimationFrame: undefined,
  window: {
    innerWidth: VIEWPORT.w,
    innerHeight: VIEWPORT.h,
    addEventListener: (event) => listeners.push(event),
    removeEventListener: (event) => {
      const at = listeners.indexOf(event)
      if (at >= 0) listeners.splice(at, 1)
    },
    __ModuleLoader__: {
      load: (definition) => {
        captured = definition
      },
    },
  },
}
sandbox.globalThis = sandbox

/** 把排队的一帧跑掉（生产里是 requestAnimationFrame / setTimeout）。 */
function flush() {
  while (queued.length > 0) queued.shift()()
}
function fire() {
  for (const observer of observers) if (!observer.disconnected) observer.callback()
  flush()
}

// ── 断言工具 ────────────────────────────────────────────────────────────────
let failed = 0
function check(label, condition, detail) {
  if (condition) {
    console.log(`  ok   ${label}`)
  } else {
    failed += 1
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}
const markedCount = () => allCandidates.filter((el) => el.hasAttribute(MARK)).length

// ── 装载客户端半边 ──────────────────────────────────────────────────────────
vm.createContext(sandbox)
vm.runInContext(readFileSync(CLIENT, 'utf8'), sandbox, { filename: 'lib/client.js' })

console.log('dsh-surface-unify 自检（v0.4：只接管插件打开的页面）')
check('__ModuleLoader__.load 被调用', captured !== null)
check('条目 id 正确', captured?.id === 'dsh-surface-unify')

const exports_ = captured.factory((id) => {
  throw new Error(`本插件不应 require 任何模块，却要了 ${id}`)
})
check('inject 为空数组（条目立即 active，不会 pending）', Array.isArray(exports_.inject) && exports_.inject.length === 0)
check('导出 apply 函数', typeof exports_.apply === 'function')

let threw = null
try {
  exports_.apply(undefined)
} catch (error) {
  threw = error
}
check('apply(undefined) 不抛异常', threw === null, String(threw))

// ── 1. 壁纸未激活：一片安静 ─────────────────────────────────────────────────
fire()
check('壁纸未激活时不打任何标记', markedCount() === 0, `marked=${markedCount()}`)
check('样式表已注入（规则在壁纸关闭时天然失效）', styleRegistry.get(STYLE_ID) !== undefined)
const css = styleRegistry.get(STYLE_ID)?.textContent ?? ''
check('配方与引擎一致：blur 读 --we-blur', css.includes('blur(var(--we-blur, 16px))'))
check(
  '配方含 saturate / brightness / contrast',
  css.includes('saturate(var(--we-saturate, 1.8))') &&
    css.includes('brightness(var(--we-glass-brightness, 1.04))') &&
    css.includes('contrast(1.01)'),
)
check('底色取引擎算好的 layer-1（带兜底）', css.includes('background-color: var(--dsw-alias-bg-layer-1,'))
check('底色带 !important（压过插件页面自己的行内 background）', css.includes('background-color: var(--dsw-alias-bg-layer-1,') && css.split('background-color: var(--dsw-alias-bg-layer-1,')[1].includes('!important'))
check('浅色/深色两套镜面高光都在', css.includes(`[${MARK}][${SHEEN}]`) && css.includes(`body[data-ds-dark-theme][${WALLPAPER_ATTR}] [${MARK}][${SHEEN}]`))
check('软件渲染时禁用模糊', css.includes(`body[data-we-glass-fallback][${WALLPAPER_ATTR}] [${MARK}]`) && css.includes('backdrop-filter: none'))
check('注册了监听', observers.length === 1)
check('注册了 resize 监听（视口变化会影响"算不算页面"）', listeners.includes('resize'))

// ── 2. 壁纸激活：插件页面 / 窗口上霜 ────────────────────────────────────────
body.setAttribute(WALLPAPER_ATTR, '')
fire()
check('全屏出口里的插件页面（工程流程工作台）上霜', workbench.hasAttribute(MARK))
check('页面根节点被引擎算成透明时照样接管（工程流程的真实形态）', workbench.hasAttribute(MARK))
check('页面内部的内容层不会被误认成页面', !workbenchBody.hasAttribute(MARK))
check('含 video 的面不接管（壁纸 / 开机动画）', !videoPanel.hasAttribute(MARK))
check('内核开机卡片（data-dsh-boot）不接管', !bootCard.hasAttribute(MARK))
check('主区出口里的插件页面上霜', mainPage.hasAttribute(MARK))
check('宿主 Modal 的对话框卡片上霜', modalCard.hasAttribute(MARK))
check('透明包裹层不上霜', !wrapper.hasAttribute(MARK))
check('包裹层里真正画面的那层上霜（往下钻一层）', innerPanel.hasAttribute(MARK))
check('自带渐变的面也算画了面 ⇒ 上霜', gradientPanel.hasAttribute(MARK))
check('自带 background-image 时不抢它的高光', !gradientPanel.hasAttribute(SHEEN))
check('横幅（1600×42）尺寸不够，不上霜', !banner.hasAttribute(MARK))
check('小对话框（400×200）尺寸不够，不上霜', !smallDialog.hasAttribute(MARK))
check('Modal 遮罩（role=presentation）不上霜', !mask.hasAttribute(MARK))
check('内核图片灯箱（role=dialog 打在 backdrop 自己身上）不上霜', !lightbox.hasAttribute(MARK))
check('灯箱自己的遮罩层不上霜（图片外面那一圈保持原样）', !lightboxMask.hasAttribute(MARK))
check('卡片里只有 16×16 装饰性 aria-hidden 时照常上霜（排除不过宽）', decorDialog.hasAttribute(MARK))

// ── 3. DSH 自带的界面一律不碰 ───────────────────────────────────────────────
check('对话主区（子树里有 conversation 锚）不上霜', !nativePage.hasAttribute(MARK))
check('主区里的对话出口（data-slot=main.conversation）不上霜', !conversation.hasAttribute(MARK))
check('设置窗口（子树里有 settings.section）不上霜', !settingsCard.hasAttribute(MARK))
check('套在已上霜页面里的对话框不叠第二层霜', !nestedDialog.hasAttribute(MARK))
check('标记数正确（6 个画面元素）', markedCount() === 6, `marked=${markedCount()}`)

// ── 4. 绝不写令牌 ───────────────────────────────────────────────────────────
check('body 上没有任何行内令牌写入（对话主区不再被染色）', bodyInlineWrites.length === 0, JSON.stringify(bodyInlineWrites))

// ── 5. 面板被复用、不再画面 ⇒ 收回标记 ──────────────────────────────────────
modalCard.computed.backgroundColor = 'rgba(0, 0, 0, 0)'
fire()
check('不再画面的对话框被摘掉标记', !modalCard.hasAttribute(MARK))
check('其它页面不受影响', workbench.hasAttribute(MARK))

// ── 6. 幂等：重复 apply 不重复挂监听 ────────────────────────────────────────
exports_.apply({ on: () => {} })
check('重复 apply 不新增观察者', observers.length === 1)

// ── 7. 壁纸关闭 ⇒ 全撤 ──────────────────────────────────────────────────────
body.removeAttribute(WALLPAPER_ATTR)
fire()
check('壁纸关闭后标记全部收回', markedCount() === 0, `marked=${markedCount()}`)

// ── 8. 卸载 ⇒ 标记 + 样式表 + 监听都没了 ────────────────────────────────────
body.setAttribute(WALLPAPER_ATTR, '')
fire()
check('重新激活后恢复上霜', markedCount() > 0)
let disposed = null
exports_.apply({ on: (event, handler) => { if (event === 'dispose') disposed = handler } })
check('注册了 dispose 钩子', typeof disposed === 'function')
disposed()
check('卸载后标记全部收回', markedCount() === 0, `marked=${markedCount()}`)
check('卸载后样式表被移除', head.children.every((child) => child.tag !== 'style'))
check('卸载后监听被断开', observers.every((observer) => observer.disconnected))
check('卸载后 resize 监听被摘掉', !listeners.includes('resize'))

// ── 结果 ────────────────────────────────────────────────────────────────────
if (failed > 0) {
  console.log(`\n${failed} 项失败`)
  process.exit(1)
}
console.log('\n全部通过')
