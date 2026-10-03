/**
 * dsh-surface-unify — 自检（node test/selftest.mjs，无外部依赖）。
 *
 * 客户端半边是浏览器 ModuleLoader 格式、跑在页面里，没法直接 import。这个脚本
 * 造一个最小 DOM 替身把它跑起来，验证四件事：
 *
 *   1. 壁纸没开时，一个令牌都不写（绝不偷偷改 DSH 原生外观）；
 *   2. 壁纸开了、母版令牌存在时，base / layer-2 / layer-3 被写成对 layer-1 的 var() 引用；
 *   3. 母版令牌不存在时（没装壁纸引擎），仍然什么都不写 —— 避免 IACVT 让底色消失；
 *   4. 壁纸关闭后，自己写下的声明被摘干净（可逆）。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const CLIENT = join(here, '..', 'lib', 'client.js')
const SOURCE = '--dsw-alias-bg-layer-1'
const TARGETS = [
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-layer-3',
]

// ── 最小 DOM 替身 ───────────────────────────────────────────────────────────
const inline = new Map() // body 的行内自定义属性
const attrs = new Set() // body 上的属性
let computed = {} // getComputedStyle(body) 看到的值

const body = {
  style: {
    setProperty: (key, value) => inline.set(key, value),
    removeProperty: (key) => inline.delete(key),
  },
  hasAttribute: (name) => attrs.has(name),
}

let captured = null
const observers = []

const sandbox = {
  document: {
    body,
    addEventListener: () => {},
  },
  getComputedStyle: () => ({
    getPropertyValue: (key) => computed[key] ?? '',
  }),
  MutationObserver: class {
    constructor(callback) {
      this.callback = callback
      observers.push(this)
    }
    observe() {}
    disconnect() {
      this.disconnected = true
    }
  },
  window: {
    __ModuleLoader__: {
      load: (definition) => {
        captured = definition
      },
    },
  },
}
sandbox.globalThis = sandbox

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
function snapshot() {
  return Object.fromEntries([...inline.entries()])
}

// ── 装载客户端半边 ──────────────────────────────────────────────────────────
vm.createContext(sandbox)
vm.runInContext(readFileSync(CLIENT, 'utf8'), sandbox, { filename: 'lib/client.js' })

console.log('dsh-surface-unify 自检')
check('__ModuleLoader__.load 被调用', captured !== null)
check("条目 id 正确", captured?.id === 'dsh-surface-unify')

const exports_ = captured.factory((id) => {
  throw new Error(`本插件不应 require 任何模块，却要了 ${id}`)
})
check('inject 为空数组（条目立即 active，不会 pending）', Array.isArray(exports_.inject) && exports_.inject.length === 0)
check('导出 apply 函数', typeof exports_.apply === 'function')

// apply 必须吞掉一切异常：ctx 为空、没有 on()，也不能抛。
let threw = null
try {
  exports_.apply(undefined)
} catch (error) {
  threw = error
}
check('apply(undefined) 不抛异常', threw === null, String(threw))

// ── 1. 壁纸未激活 ───────────────────────────────────────────────────────────
computed = { [SOURCE]: 'color-mix(in srgb, #fff 20%, transparent)' }
threw = null
try {
  exports_.apply({ on: () => {} })
} catch (error) {
  threw = error
}
check('apply(ctx) 不抛异常', threw === null, String(threw))
check('壁纸未激活时不写任何令牌', inline.size === 0, JSON.stringify(snapshot()))
check('注册了属性监听', observers.length === 1)

// ── 2. 壁纸激活 + 母版存在 ──────────────────────────────────────────────────
attrs.add('data-we-wallpaper')
observers[0].callback()
const written = snapshot()
check(
  '三个目标令牌都被接管',
  TARGETS.every((token) => typeof written[token] === 'string'),
  JSON.stringify(written),
)
check(
  '写的是对 layer-1 的 var() 引用（而非拷贝字面值 ⇒ 跟随滑杆）',
  TARGETS.every((token) => written[token] === `var(${SOURCE}, transparent)`),
  JSON.stringify(written),
)
check('没有写源令牌自己（否则自引用成环）', !(SOURCE in written))

// ── 3. 壁纸激活但母版缺失（没装壁纸引擎 / 改版改名）────────────────────────
inline.clear()
computed = {}
observers[0].callback()
check('母版缺失时不接管（避免 IACVT 让底色消失）', inline.size === 0, JSON.stringify(snapshot()))

// ── 4. 壁纸关闭 ⇒ 可逆 ─────────────────────────────────────────────────────
computed = { [SOURCE]: 'color-mix(in srgb, #fff 20%, transparent)' }
observers[0].callback()
check('恢复母版后重新接管', inline.size === TARGETS.length)
attrs.delete('data-we-wallpaper')
observers[0].callback()
check('壁纸关闭后摘干净自己的声明', inline.size === 0, JSON.stringify(snapshot()))

// ── 结果 ────────────────────────────────────────────────────────────────────
if (failed > 0) {
  console.log(`\n${failed} 项失败`)
  process.exit(1)
}
console.log('\n全部通过')
