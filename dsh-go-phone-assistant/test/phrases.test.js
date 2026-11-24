import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'fishy-text-'))
process.env.FISHY_HOME = dir

const { DEFAULTS, ensurePhrasesFile, fmt, list, loadPhrases, phrasesFile, savePhrases, t, words } = await import('../lib/phrases.js')

test('首次自动生成 phrases.json，默认值可用', () => {
  const file = ensurePhrasesFile()
  assert.equal(file, phrasesFile())
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  assert.ok(Array.isArray(raw.zh.hello))
  assert.equal(loadPhrases().exists, true)
})

test('用户覆盖只改写的键，没写的保持默认', () => {
  savePhrases({ zh: { hello: ['来啦', '在'], island_offline: '不在线' } })
  assert.deepEqual(list('hello', 'zh-CN'), ['来啦', '在'])
  assert.equal(t('island_offline', 'zh-CN'), '不在线')
  assert.equal(t('island_mode_idle', 'zh-CN'), DEFAULTS.zh.island_mode_idle)
  assert.equal(t('reply_done', 'zh-CN'), DEFAULTS.zh.reply_done)
})

test('占位符替换与语言回退', () => {
  assert.equal(fmt('共 {n} 条', { n: 3 }), '共 3 条')
  assert.ok(t('island_online', 'en-US').includes('{mode}'))
  assert.ok(!t('island_online', 'en-US', { mode: 'idle' }).includes('{mode}'))
  assert.equal(t('turnnote', 'zh-CN', { n: 2 }), '手机动作 2 次')
  assert.equal(t('not_a_key', 'zh-CN'), 'not_a_key')
})

test('文件写坏时回退默认文案', () => {
  writeFileSync(phrasesFile(), '{oops', 'utf8')
  assert.equal(loadPhrases().zh.reply_fail, DEFAULTS.zh.reply_fail)
  assert.equal(words('en-US').reply_fail, DEFAULTS.en.reply_fail)
})

test('清理', () => {
  rmSync(dir, { recursive: true, force: true })
})
