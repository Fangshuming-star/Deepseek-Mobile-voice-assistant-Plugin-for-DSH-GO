import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { isDangerous, guardTap } from '../lib/guard.js'
import { DEFAULTS, applyFlagValues, loadConfig, saveConfig, selectedFlags } from '../lib/config.js'

test('危险词：提交/支付/购买都拦，普通按钮不拦', () => {
  assert.equal(isDangerous('提交答卷'), '提交')
  assert.equal(isDangerous('立即支付 39 元'), '支付')
  assert.equal(isDangerous('确认购买'), '确认购买')  // 命中表里靠前的词
  assert.equal(isDangerous('下一题'), null)
  assert.equal(isDangerous(''), null)
})

test('没授权就不放行，授权了才放行；关掉拦截全放行', () => {
  assert.equal(guardTap('提交', false).allow, false)
  assert.equal(guardTap('提交', false).hit, '提交')
  assert.equal(guardTap('提交', true).allow, true)
  assert.equal(guardTap('提交', false, { guardDanger: false }).allow, true)
  assert.equal(guardTap('下一题', false).allow, true)
})

test('配置：默认全开、坏文件回默认、落盘再读回来一致', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fishy-cfg-'))
  try {
    const f = join(dir, 'config.json')
    assert.deepEqual(loadConfig(f), DEFAULTS)
    const cfg = { ...DEFAULTS, caption: false }
    assert.equal(saveConfig(cfg, f), true)
    assert.equal(loadConfig(f).caption, false)
    assert.deepEqual(selectedFlags(cfg).includes('caption'), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('多选回传：选了什么就是什么', () => {
  const cfg = { ...DEFAULTS, caption: false, turnNote: false, memoryAuto: false, guardDanger: false }
  applyFlagValues(cfg, ['caption', 'guardDanger'])
  assert.equal(cfg.caption, true)
  assert.equal(cfg.guardDanger, true)
  assert.equal(cfg.turnNote, false)
})
