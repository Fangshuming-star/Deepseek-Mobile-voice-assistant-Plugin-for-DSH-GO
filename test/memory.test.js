import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { MAX_ITEMS, brief, forget, load, recall, remember, save, stats } from '../lib/memory.js'
import { greeting } from '../lib/persona.js'

const tmp = () => mkdtempSync(join(tmpdir(), 'fishy-mem-'))

test('记账：同样的内容只加权重，不重复', () => {
  const s = { v: 1, items: [], updatedAt: 0 }
  remember(s, '用户喜欢全角标点', 'pref', 1000)
  remember(s, '用户喜欢全角标点', 'pref', 2000)
  assert.equal(s.items.length, 1)
  assert.equal(s.items[0].weight, 2)
  assert.equal(s.items[0].at, 2000)
})

test('上限：超了淘汰权重最低、最久没用的', () => {
  const s = { v: 1, items: [], updatedAt: 0 }
  for (let i = 0; i < MAX_ITEMS + 20; i++) remember(s, '事实' + i, 'fact', 1000 + i)
  remember(s, '事实0', 'fact', 99999)      // 老条目被再次命中 → 权重升高，应留下
  assert.equal(s.items.length, MAX_ITEMS)
  assert.ok(s.items.some((x) => x.text === '事实0'), '高频条目不该被淘汰')
})

test('检索：关键词命中优先，其次权重高的', () => {
  const s = { v: 1, items: [], updatedAt: 0 }
  remember(s, '每天九点看天气', 'goal', 1)
  remember(s, '不要自动付款', 'pref', 2)
  assert.equal(recall(s, '付款')[0].text, '不要自动付款')
  assert.equal(recall(s, '', 1)[0].text, '不要自动付款')
})

test('忘记与统计', () => {
  const s = { v: 1, items: [], updatedAt: 0 }
  remember(s, '喜欢吃辣', 'pref', 1)
  remember(s, '住在杭州', 'fact', 2)
  const r = forget(s, '吃辣')
  assert.equal(r.removed, 1)
  assert.deepEqual(stats(s).total, 1)
})

test('落盘再读回来一致；brief 只给最强的几条', () => {
  const dir = tmp()
  try {
    const f = join(dir, 'memory.json')
    const s = { v: 1, items: [], updatedAt: 0 }
    for (let i = 0; i < 10; i++) remember(s, '条目' + i, 'fact', 100 + i)
    save(s, f)
    const back = load(f)
    assert.equal(back.items.length, 10)
    assert.equal(brief(back, 3).split('\n').length, 3)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('问候语：中文说我在，英文说 Here', () => {
  assert.equal(greeting('hello', 'zh-CN'), '我在')
  assert.equal(greeting('hello', 'en-US'), 'Here')
  assert.equal(greeting('done', 'zh-CN'), '办好了')
})
