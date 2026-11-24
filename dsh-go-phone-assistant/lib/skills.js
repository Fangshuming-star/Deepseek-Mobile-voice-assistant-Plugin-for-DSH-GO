/**
 * 快捷指令：把常做的事存成"一键发车"。
 *
 * 存的还是 memory.json（kind = 'skill'），所以不额外维护一个文件，
 * 也不会跟"记忆"两套逻辑打架：命名、去重、权重淘汰都复用 memory.js。
 *
 * 一条技能 = 一句目标（可以带占位符 {今天} 之类，先不做模板引擎，保持可解释）。
 */
import { recall, remember } from './memory.js'

export const SKILL_KIND = 'skill'

export function addSkill(store, goal) {
  const g = String(goal || '').trim().slice(0, 120)
  if (g === '') return { ok: false, store, reason: '目标不能为空' }
  remember(store, g, SKILL_KIND)
  return { ok: true, store, goal: g }
}

export function listSkills(store, limit = 8) {
  return store.items
    .filter((x) => x.kind === SKILL_KIND)
    .sort((a, b) => (b.weight || 1) - (a.weight || 1) || (b.at || 0) - (a.at || 0))
    .slice(0, limit)
}

export function topSkills(store, limit = 4) {
  return listSkills(store, limit).map((x) => x.text)
}

/** 记忆里"常做"的目标也算候选技能（跑过一次就值得一键） */
export function suggestSkills(store, limit = 4) {
  const seen = new Set()
  const out = []
  for (const x of store.items) {
    if (x.kind !== 'goal' && x.kind !== SKILL_KIND) continue
    const k = x.text.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(x.text)
    if (out.length >= limit) break
  }
  return out
}
