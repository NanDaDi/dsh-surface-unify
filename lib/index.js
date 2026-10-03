/**
 * dsh-surface-unify — server half (entry point).
 *
 * 本插件的全部工作在浏览器半边（lib/client.js）完成：它把壁纸引擎写在
 * `body[data-we-wallpaper]` 上的 layer-1 玻璃配方用 `var()` 间接引用接管给
 * `--dsw-alias-bg-base` / `--dsw-alias-bg-layer-2` / `--dsw-alias-bg-layer-3`，
 * 于是所有读这三层的插件面板与壁纸引擎面板长得一样，并随「玻璃透明度」滑杆
 * 与浅/深主题自动变化。
 *
 * 服务半边故意什么都不做，它存在的唯一理由是给客户端半边一个宿主挂载点
 * （`dsh.bundle.patch` 插入的条目 + `dsh.client.platform: 'web'` 声明的客户端
 * 半边）。
 *
 * 两条硬性纪律（都是被 DSH 的 fail-loud 设计逼出来的）：
 *   1. **顶层不声明 inject**：cordis 解析顶层 inject 时若插件 ctx 已 inactive，
 *      会抛 `cannot get required service "..." in inactive context` 并让整个
 *      `dsh web` 启动失败，而该错误发生在 apply 之前 —— apply 内的 try/catch
 *      拦不住。这里用空数组，等于"没有任何依赖"。
 *   2. **apply 绝不抛异常**：任何异常都只降级（什么都不做），绝不拖垮启动。
 */

/** 插件名必须与 cordis.patch.yml 里的 name 一致。 */
export const name = 'dsh-surface-unify'

/** 无依赖：这是纯声明式、零服务插件。 */
export const inject = []

/**
 * 服务半边：无操作。
 *
 * 保留该函数是因为宿主需要一个可应用的插件形状；真正的注入逻辑在客户端半边
 * （浏览器侧），它由 `dsh.client` 声明、由客户端加载器独立激活。
 */
export function apply() {
  // 故意为空：本插件不需要服务、不注册路由、不写任何文件。
}
