/**
 * 长期记忆：引擎侧的小 JSON 库，落在 $DSH_HOME/cache/local-fishy-jarvis/memory.json。
 *
 * 为什么放引擎侧：dsh-go 只画界面不跑插件代码，插件跑在引擎（Node）里，
 * 所以记忆天然属于引擎；换手机、换 App 版本都还在（只要 DSH_HOME 还在）。
 *
 * 设计取舍：
 *  - 只记"能帮下次做得更好"的东西：用户偏好、常用目标、失败过的路子、说过的自称；
 *  - 有上限（默认 400 条）和权重：命中一次 +1，超过上限先淘汰权重最低、最久没用的；
 *  - 绝不记屏幕原文、剪贴板、密码类内容：只在用户明确"记住…"时才落盘。
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { fishyDir, legacyDir } from './paths.js'

export const MAX_ITEMS = 400

/**
 * 记忆库路径：默认放在手机存储的助手目录里（用户可备份/查看）；
 * FISHY_MEMORY_DIR 可整体改目录（测试用），老位置仍可读。
 */
export function memoryFile() {
  const base = process.env.FISHY_MEMORY_DIR || fishyDir()
  if (process.env.FISHY_MEMORY_DIR === undefined && !existsSync(join(base, 'memory.json'))) {
    const old = join(legacyDir(), 'memory.json')
    if (existsSync(old)) return old
  }
  return join(base, 'memory.json')
}

function emptyStore() {
  return { v: 1, items: [], updatedAt: 0 }
}

export function load(file = memoryFile()) {
  try {
    if (!existsSync(file)) return emptyStore()
    const j = JSON.parse(readFileSync(file, 'utf8'))
    if (!j || !Array.isArray(j.items)) return emptyStore()
    return { v: 1, items: j.items.filter((x) => x && typeof x.text === 'string'), updatedAt: Number(j.updatedAt) || 0 }
  } catch {
    return emptyStore()
  }
}

export function save(store, file = memoryFile()) {
  try {
    mkdirSync(join(file, '..'), { recursive: true })
    store.updatedAt = Date.now()
    writeFileSync(file, JSON.stringify(store, null, 1), 'utf8')
    return true
  } catch {
    return false
  }
}

const keyOf = (text) => createHash('sha1').update(String(text).trim().toLowerCase()).digest('hex').slice(0, 12)

/**
 * 记一条。kind: pref(偏好) / goal(常用目标) / fact(事实) / fail(踩过的坑) / name(称呼)
 * 同样的内容不会重复记，只加权重和时间。
 */
export function remember(store, text, kind = 'fact', now = Date.now(), max = MAX_ITEMS) {
  const t = String(text || '').trim().slice(0, 200)
  if (t === '') return store
  const k = keyOf(t)
  const hit = store.items.find((x) => x.k === k)
  if (hit) {
    hit.weight = (Number(hit.weight) || 1) + 1
    hit.at = now
    return store
  }
  store.items.push({ k, text: t, kind, weight: 1, at: now })
  const limit = Number.isFinite(Number(max)) ? Math.max(20, Math.min(5000, Math.floor(Number(max)))) : MAX_ITEMS
  if (store.items.length > limit) {
    store.items.sort((a, b) => (a.weight - b.weight) || (a.at - b.at))
    store.items = store.items.slice(store.items.length - limit)
  }
  return store
}

/** 按关键词找（简单子串匹配，够用且可解释；不做向量那套黑箱） */
export function recall(store, query = '', limit = 8) {
  const q = String(query || '').trim().toLowerCase()
  const items = [...store.items]
  items.sort((a, b) => (b.weight || 1) - (a.weight || 1) || (b.at || 0) - (a.at || 0))
  if (q === '') return items.slice(0, limit)
  const hit = items.filter((x) => x.text.toLowerCase().includes(q))
  return (hit.length > 0 ? hit : items).slice(0, limit)
}

/** 拼成给模型看的一小段（省 token：只给最重要的几条） */
export function brief(store, limit = 6) {
  const top = recall(store, '', limit)
  if (top.length === 0) return ''
  const tag = { pref: '偏好', goal: '常做', fact: '事实', fail: '注意', name: '称呼' }
  return top.map((x) => `- [${tag[x.kind] || '事实'}] ${x.text}`).join('\n')
}

export function forget(store, query) {
  const q = String(query || '').trim().toLowerCase()
  if (q === '') return { removed: 0, store }
  const before = store.items.length
  store.items = store.items.filter((x) => !x.text.toLowerCase().includes(q))
  return { removed: before - store.items.length, store }
}

export function stats(store, max = MAX_ITEMS) {
  const by = {}
  for (const x of store.items) by[x.kind || 'fact'] = (by[x.kind || 'fact'] || 0) + 1
  return { total: store.items.length, by, max: Number.isFinite(Number(max)) ? Number(max) : MAX_ITEMS }
}
