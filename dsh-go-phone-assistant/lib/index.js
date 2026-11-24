// 手机助手 —— dsh-go 上的手机 AI 助手（完全基于 dsh-go 自带的手机操控，不依赖第三方 App）。
//
// 三件事：
//   1) 会应答：状态条就是"岛"，点开面板；唤醒词 + 语音优先，支持全程不看屏幕；
//   2) 会干活：模型工具直接通过 dsh-go 的手机操控（MCP）读屏、点按、输入、滑动、开应用；
//   3) 有记性：长期记忆落手机存储，偏好 / 常做 / 踩过的坑 / 称呼都能攒。
import { defineTool } from '@deepseek-ai/dsh-tools'

import { PhoneChannel, parseScreen } from './phone.js'
import { brief, forget, load, recall, remember, save, stats } from './memory.js'
import { greeting, isZh, kindLabel } from './persona.js'
import { registerOpsTools } from './ops-extra.js'
import { listSkills, suggestSkills } from './skills.js'
import { applyFlagValues, loadConfig, saveConfig, selectedFlags } from './config.js'
import { ensurePhrasesFile, list, phrasesFile, savePhrases, t, words } from './phrases.js'
import { fishyDir } from './paths.js'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { guardTap } from './guard.js'

export const name = 'local-fishy-jarvis'
export const inject = ['tools']

const CARD_MAX_BYTES = 8 * 1024

function toolCard(build) {
  return (args, value) => {
    try {
      const text = JSON.stringify(build(args, value))
      if (text === undefined || Buffer.byteLength(text, 'utf8') > CARD_MAX_BYTES) return {}
      return { 'dsh-go/view': JSON.parse(text) }
    } catch {
      return {}
    }
  }
}

export function apply(ctx) {
  ensurePhrasesFile()
  let cfg = loadConfig()
  const persistCfg = () => saveConfig(cfg)
  const phone = new PhoneChannel()
  let store = load()
  const persist = () => save(store)
  const counters = { phone: 0 }
  const bumpPhone = () => { counters.phone += 1 }

  /** 按编号找控件文字（危险词拦截用） */
  const labelOf = (id) => {
    const n = phone.lastNodes.find((x) => Number(x.id) === Number(id))
    return String(n?.text || '')
  }

  // ───────────────────── 模型工具：会干活 ─────────────────────
  ctx.tools.register(defineTool({
    name: 'fishy_screen',
    description:
      '看手机当前屏幕上有什么：返回带 [n] 编号的元素（来自 dsh-go 自带的手机操控）。' +
      '用户问"屏幕上是什么""能不能点某按钮"，或准备用 fishy_tap / fishy_type 之前，先调它。',
    parameters: { language: { type: 'string', enum: ['zh', 'en'], description: '用户消息语言，默认 zh。' } },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          count: { type: 'integer', required: true },
          text: { type: 'string', required: true },
          language: { type: 'string', enum: ['zh', 'en'], required: true },
        },
      },
      render: (_a, v) => [{ type: 'text', text: v.text }],
      presentationMeta: toolCard((_a, v) => ({
        type: 'stack',
        title: isZh(v.language) ? '当前屏幕' : 'Current screen',
        children: [
          { type: 'metric', label: isZh(v.language) ? '元素' : 'Nodes', value: String(v.count) },
          { type: 'text', text: String(v.text).slice(0, 1200) },
        ],
      })),
    },
    timeoutMs: 25000,
    isConcurrencySafe: () => false,
    execute: async (a) => {
      const s = await phone.screen()
      const zh = a.language !== 'en'
      const text = s.ok ? s.text : (zh ? '读不到屏幕：先确认 dsh-go 设置 › 手机操控 已打开，然后再试。' : 'Cannot read the screen.')
      return { count: s.nodes.length, text, language: zh ? 'zh' : 'en' }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'fishy_tap',
    description: '在手机上点一下：给 fishy_screen 返回的编号 id。点提交/支付/购买类按钮要 confirmed:true 才点。',
    parameters: {
      id: { type: 'integer', required: true, description: '元素编号（先 fishy_screen 拿）。' },
      confirmed: { type: 'boolean', description: '用户已明确同意点这个（提交/付款类）。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true }, detail: { type: 'string', required: true } } },
      render: (_a, v) => [{ type: 'text', text: v.detail }],
    },
    timeoutMs: 20000,
    isConcurrencySafe: () => false,
    execute: async (a) => {
      const g = guardTap(labelOf(a.id), a.confirmed === true, cfg)
      if (!g.allow) return { ok: false, detail: g.why }
      const r = await phone.tap(a.id)
      bumpPhone()
      return { ok: r.ok === true, detail: r.ok ? `已点击 [${a.id}]（${labelOf(a.id) || '控件'}）。` : String(r.text || '点击失败：屏幕可能变了，重新读一次。') }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'fishy_type',
    description: '往输入框里输入文字（不回车、不发送）。先 fishy_screen 找到输入框编号，再传 id。',
    parameters: {
      text: { type: 'string', required: true, description: '要输入的文字。' },
      id: { type: 'integer', description: '输入框编号（先 fishy_screen 找；不传则失败提示）。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true }, detail: { type: 'string', required: true } } },
      render: (_a, v) => [{ type: 'text', text: v.detail }],
    },
    timeoutMs: 20000,
    isConcurrencySafe: () => false,
    execute: async (a) => {
      if (a.id === undefined || a.id === null) {
        return { ok: false, detail: '先 fishy_screen，找到输入框的编号再传 id。' }
      }
      const r = await phone.type({ id: a.id, text: a.text })
      bumpPhone()
      return { ok: r.ok === true, detail: r.ok ? '文字已输入（没有回车、没有发送）。' : String(r.text || '输入失败') }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'fishy_memory',
    description:
      '这个助手的长期记忆。op=remember 记一条（用户说"记住…"、或你发现他明确偏好时用）；' +
      'op=recall 按关键词找；op=forget 删掉匹配的；op=stats 看有多少条。' +
      '只记真能帮下次做得更好的东西，别把屏幕原文、密码、验证码记进来。',
    parameters: {
      op: { type: 'string', enum: ['remember', 'recall', 'forget', 'stats'], required: true, description: '操作。' },
      text: { type: 'string', description: 'remember 时要记的内容；recall/forget 时的关键词。' },
      kind: { type: 'string', enum: ['pref', 'goal', 'fact', 'fail', 'name'], description: 'remember 时的分类，默认 fact。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          total: { type: 'integer', required: true },
          text: { type: 'string', required: true },
        },
      },
      render: (_a, v) => [{ type: 'text', text: v.text }],
    },
    timeoutMs: 8000,
    isConcurrencySafe: () => true,
    execute: async (args) => {
      const op = String(args.op || 'recall')
      if (op === 'remember') {
        const txt = String(args.text || '').trim()
        if (txt === '') throw new Error('要记什么？text 不能空。')
        remember(store, txt, String(args.kind || 'fact'), Date.now(), cfg.memoryMax)
        persist()
        const s = stats(store, cfg.memoryMax)
        return { ok: true, total: s.total, text: `记住了：${txt}（现在共 ${s.total} 条）` }
      }
      if (op === 'forget') {
        const r = forget(store, String(args.text || ''))
        store = r.store
        persist()
        return { ok: true, total: stats(store, cfg.memoryMax).total, text: r.removed > 0 ? `删掉 ${r.removed} 条。` : '没找到匹配的记忆。' }
      }
      if (op === 'stats') {
        const s = stats(store, cfg.memoryMax)
        const detail = Object.entries(s.by).map(([k, n]) => `${k} ${n}`).join(' · ') || '空'
        return { ok: true, total: s.total, text: `记忆 ${s.total} 条（上限 ${s.max}）：${detail}` }
      }
      const q = String(args.text || '')
      const items = recall(store, q, 10)
      return {
        ok: true,
        total: stats(store, cfg.memoryMax).total,
        text: items.length === 0 ? '还没有相关记忆。' : items.map((x) => `· [${x.kind}] ${x.text}`).join('\n'),
      }
    },
  }))

  // 滑动 / 按键 / 开应用
  registerOpsTools(ctx, phone, { onPhoneAction: bumpPhone })

  // 批量动作 + 等屏幕变化
  ctx.tools.register(defineTool({
    name: 'fishy_do',
    description:
      '一次做一串动作：steps 数组，每项 {kind:"tap",id}；{kind:"type",text,id}；{kind:"key",key}；' +
      '{kind:"scroll",direction,id?}；{kind:"open",app}；{kind:"wait",ms}。按顺序执行，遇到失败就停并报告第几步。',
    parameters: {
      steps: { type: 'array', required: true, description: '动作数组。', items: { type: 'object', additionalProperties: true } },
      confirmed: { type: 'boolean', description: '用户已明确同意本次里可能出现的提交/付款类点击。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          done: { type: 'integer', required: true },
          text: { type: 'string', required: true },
        },
      },
      render: (_a, v) => [{ type: 'text', text: v.text }],
    },
    timeoutMs: 90000,
    isConcurrencySafe: () => false,
    execute: async (args) => {
      const steps = Array.isArray(args.steps) ? args.steps.slice(0, 12) : []
      if (steps.length === 0) throw new Error('steps 至少给一个动作。')
      const lines = []
      let done = 0
      for (let i = 0; i < steps.length; i++) {
        const st = steps[i] || {}
        const kind = String(st.kind || 'tap')
        try {
          if (kind === 'tap') {
            const g = guardTap(labelOf(st.id), args.confirmed === true, cfg)
            if (!g.allow) { lines.push(`第 ${i + 1} 步拦下了：${g.why}`); return { ok: false, done, text: lines.join('\n') } }
            const r = await phone.tap(st.id)
            lines.push(`第 ${i + 1} 步：点 [${st.id}] ${labelOf(st.id) || ''}${r.ok ? ' ✓' : ' ✗'}`)
            if (!r.ok) return { ok: false, done, text: lines.join('\n') }
          } else if (kind === 'type') {
            const r = await phone.type({ id: st.id, text: st.text })
            lines.push(`第 ${i + 1} 步：输入 ${String(st.text || '').slice(0, 20)}${r.ok ? ' ✓' : ' ✗'}`)
            if (!r.ok) return { ok: false, done, text: lines.join('\n') }
          } else if (kind === 'key') {
            const r = await phone.key(String(st.key || 'back'))
            lines.push(`第 ${i + 1} 步：按键 ${st.key || 'back'}${r.ok ? ' ✓' : ' ✗'}`)
            if (!r.ok) return { ok: false, done, text: lines.join('\n') }
          } else if (kind === 'scroll') {
            const r = await phone.scroll(String(st.direction || 'down'), st.id)
            lines.push(`第 ${i + 1} 步：滑动 ${st.direction || 'down'}${r.ok ? ' ✓' : ' ✗'}`)
            if (!r.ok) return { ok: false, done, text: lines.join('\n') }
          } else if (kind === 'open') {
            const r = await phone.open(String(st.app || ''))
            lines.push(`第 ${i + 1} 步：打开 ${st.app}${r.ok ? ' ✓' : ' ✗'}`)
            if (!r.ok) return { ok: false, done, text: lines.join('\n') }
          } else if (kind === 'wait') {
            const ms = Math.min(5000, Math.max(50, Number(st.ms) || 800))
            await new Promise((r) => setTimeout(r, ms))
            lines.push(`第 ${i + 1} 步：等 ${ms}ms`)
          } else {
            lines.push(`第 ${i + 1} 步：不认识的 kind「${kind}」，停下`)
            return { ok: false, done, text: lines.join('\n') }
          }
          done += 1
          bumpPhone()
        } catch (e) {
          lines.push(`第 ${i + 1} 步出错：${String(e?.message || e)}`)
          return { ok: false, done, text: lines.join('\n') }
        }
      }
      return { ok: true, done, text: `做完 ${done} 步：\n${lines.join('\n')}` }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'fishy_wait',
    description: '等屏幕变化（点完按钮等刷新）：轮询读屏，文本变了算成功；超时返回 changed:false。等待期间不点任何东西。',
    parameters: { timeoutMs: { type: 'integer', description: '最多等多久，默认 5000，上限 20000。' } },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          changed: { type: 'boolean', required: true },
          waitedMs: { type: 'integer', required: true },
          text: { type: 'string', required: true },
        },
      },
      render: (_a, v) => [{ type: 'text', text: v.text }],
    },
    timeoutMs: 25000,
    isConcurrencySafe: () => false,
    execute: async (a) => {
      const r = await phone.waitChange(a.timeoutMs)
      return { changed: r.changed === true, waitedMs: Number(r.waitedMs) || 0, text: r.changed ? `屏幕变了（等了 ${r.waitedMs}ms）。` : `等了 ${r.waitedMs}ms 屏幕没变，可能没点中或本来就不用刷新。` }
    },
  }))

  // 语音模式开关：用户口头说"打开/关掉步骤播报"时用
  ctx.tools.register(defineTool({
    name: 'fishy_voice',
    description:
      '切换语音模式开关（免看屏用）：voiceFirst=语音优先（口头问选项、短句回答），' +
      'voiceSteps=步骤播报（每步 2–15 字念出来）。不传的字段保持不变。',
    parameters: {
      voiceFirst: { type: 'boolean', description: '语音优先模式，开/关。' },
      voiceSteps: { type: 'boolean', description: '步骤播报，开/关。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          voiceFirst: { type: 'boolean', required: true },
          voiceSteps: { type: 'boolean', required: true },
          detail: { type: 'string', required: true },
        },
      },
      render: (_a, v) => [{ type: 'text', text: v.detail }],
    },
    timeoutMs: 5000,
    isConcurrencySafe: () => true,
    execute: async (a) => {
      if (typeof a.voiceFirst === 'boolean') cfg.voiceFirst = a.voiceFirst
      if (typeof a.voiceSteps === 'boolean') cfg.voiceSteps = a.voiceSteps
      persistCfg()
      const detail = `语音优先：${cfg.voiceFirst ? '开' : '关'}；步骤播报：${cfg.voiceSteps ? '开' : '关'}。`
      return { voiceFirst: cfg.voiceFirst, voiceSteps: cfg.voiceSteps, detail }
    },
  }))

  // ───────────────────── 原生界面：会应答 ─────────────────────
  ctx.inject(['dshGo'], (ctx) => {
    // 状态条 = 那一行"岛"
    ctx.dshGo.strip('island', (scope, emit, caps) => {
      let alive = true
      const tick = async () => {
        cfg = loadConfig()
        const on = phone.ready
        if (!alive) return
        const loc = caps.locale
        if (!on) {
          emit({ text: t('island_offline', loc).slice(0, 24), tone: 'warn' })
          return
        }
        const last = String(phone.lastAction || '').trim()
        emit({
          text: t('island_online', loc, {
            mode: t('island_mode_idle', loc),
            run: t('island_busy', loc),
            tail: last ? `·${last.slice(0, 8)}` : '',
          }).slice(0, 24),
          tone: 'good',
        })
      }
      tick()
      const timer = setInterval(tick, 12000)
      return () => { alive = false; clearInterval(timer) }
    })

    // 字幕通道：把最近一步动作推给 App
    ctx.dshGo.micro('caption', {
      data: (scope, emit) => {
        let alive = true
        const tick = () => {
          if (!cfg.caption) { emit({ text: '' }); return }
          if (!alive) return
          if (!phone.ready) { emit({ text: t('caption_offline', 'zh-CN') }); return }
          emit({ text: String(phone.lastAction || t('caption_idle', 'zh-CN')).slice(0, 240) })
        }
        tick()
        const timer = setInterval(tick, 2000)
        return () => { alive = false; clearInterval(timer) }
      },
    })

    // 主面板
    ctx.dshGo.panel('jarvis', {
      view: (scope, caps) => {
        const loc = caps.locale
        return {
          type: 'stack',
          title: t('jarvis_title', loc),
          children: [
            { type: 'text', text: { $: 'data.state' }, tone: 'muted' },
            {
              type: 'keyValue',
              items: [
                [t('jarvis_key_channel', loc), { $: 'data.channel' }],
                [t('jarvis_key_screen', loc), { $: 'data.screen' }],
                [t('jarvis_key_last', loc), { $: 'data.last' }],
                [t('jarvis_key_memory', loc), { $: 'data.memory' }],
              ],
            },
            { type: 'list', items: { $: 'data.notes' } },
            {
              type: 'actions',
              items: [
                { label: t('jarvis_act_screen', loc), action: 'screen', style: 'primary' },
                { label: t('jarvis_act_refresh', loc), action: 'refresh' },
              ],
            },
            { type: 'callout', tone: 'info', text: t('jarvis_callout', loc) },
          ],
        }
      },
      data: (scope, emit, caps) => {
        let alive = true
        const push = async () => {
            const on = await phone.online()
          if (!alive) return
          const loc = caps.locale
          const mem = stats(store, cfg.memoryMax)
          const notes = recall(store, '', 5).map((x) => ({
            title: x.text.slice(0, 40),
            subtitle: kindLabel(x.kind, loc),
            icon: 'book',
          }))
          emit({
            state: on.ok ? t('jarvis_connected', loc, { last: phone.lastAction || t('jarvis_none', loc) }) : t('jarvis_unreachable', loc),
            channel: on.ok ? 'MCP' : '—',
            screen: phone.lastScreen || t('jarvis_none', loc),
            last: phone.lastAction || t('jarvis_none', loc),
            memory: `${mem.total}`,
            notes,
          })
        }
        push()
        const timer = setInterval(push, 10000)
        return () => { alive = false; clearInterval(timer) }
      },
      actions: {
        screen: async (scope, event) => {
          const loc = event?.locale
          const s = await phone.screen()
          if (!s.ok) return { toast: t('toast_screen_fail', loc) }
          return { insert: `${t('insert_screen', loc)}\n${s.text}\n\n`.slice(0, 2000), toast: t('toast_screen_ok', loc) }
        },
        refresh: () => ({ refresh: true }),
      },
    })

    // 胶囊「叫助手」：应答一句 + 直接把面板打开
    ctx.dshGo.on('hey-fishy', (scope, event) => ({
      toast: greeting('hello', event?.locale),
      open: 'panel:jarvis',
    }))

    // 加号工具「读屏」
    ctx.dshGo.on('screen-read', (scope, event) => {
      const loc = event?.locale
      return {
        pending: { label: t('pending_reading', loc), timeoutMs: 25000 },
        result: async () => {
          const s = await phone.screen()
          if (!s.ok) return { toast: t('toast_screen_fail', loc) }
          return { insert: `${t('insert_screen', loc)}\n${s.text}\n\n`.slice(0, 2000) }
        },
      }
    })

    // 记忆面板
    ctx.dshGo.panel('memory', {
      view: (scope, caps) => {
        const loc = caps.locale
        return {
          type: 'stack',
          title: t('memory_title', loc),
          children: [
            { type: 'text', text: { $: 'data.head' } },
            { type: 'list', items: { $: 'data.notes' } },
            { type: 'text', text: { $: 'data.hint' }, tone: 'muted' },
            { type: 'confirm', id: 'wipe-all', confirmLabel: t('memory_wipe_confirm', loc), cancelLabel: t('memory_wipe_cancel', loc) },
          ],
        }
      },
      data: (scope, emit, caps) => {
        let alive = true
        const push = () => {
          if (!alive) return
          const loc = caps.locale
          const s = stats(store, cfg.memoryMax)
          emit({
            head: t('memory_head', loc, { n: s.total, max: s.max }),
            hint: t('memory_hint', loc),
            notes: recall(store, '', 12).map((x) => ({
              title: x.text.slice(0, 40),
              subtitle: t('memory_sub', loc, { kind: kindLabel(x.kind, loc), n: x.weight || 1 }),
              icon: 'book',
            })),
          })
        }
        push()
        const timer = setInterval(push, 15000)
        return () => { alive = false; clearInterval(timer) }
      },
      actions: {
        'wipe-all': (scope, event) => {
          if (event?.value?.confirmed !== true) return { toast: t('toast_kept', event?.locale) }
          store = { v: 1, items: [], updatedAt: 0 }
          persist()
          return { toast: t('toast_wiped', event?.locale), refresh: true }
        },
      },
    })

    // 快捷指令面板（存在记忆里，不依赖任何外部 App）
    ctx.dshGo.panel('skills', {
      view: (scope, caps) => {
        const loc = caps.locale
        return {
          type: 'stack',
          title: t('skills_title', loc),
          children: [
            { type: 'text', text: { $: 'data.head' } },
            { type: 'list', items: { $: 'data.items' } },
            { type: 'text', text: { $: 'data.hint' }, tone: 'muted' },
            {
              type: 'actions',
              items: [
                { label: t('skills_act_run', loc), action: 'run-first', style: 'primary' },
                { label: t('skills_act_refresh', loc), action: 'refresh' },
              ],
            },
          ],
        }
      },
      data: (scope, emit, caps) => {
        let alive = true
        const push = () => {
          if (!alive) return
          const loc = caps.locale
          const mine = listSkills(store, 6)
          const sug = suggestSkills(store, 6)
          const items = mine.map((x) => ({ title: x.text.slice(0, 36), subtitle: t('skills_tag_skill', loc), icon: 'bolt', action: 'run-first' }))
          for (const g of sug) {
            if (items.length >= 8) break
            if (mine.some((m) => m.text === g)) continue
            items.push({ title: g.slice(0, 36), subtitle: t('skills_tag_goal', loc), icon: 'repeat', action: 'run-first' })
          }
          emit({
            head: items.length ? t('skills_head', loc) : t('skills_head_none', loc),
            hint: t('skills_hint', loc),
            items,
          })
        }
        push()
        const timer = setInterval(push, 20000)
        return () => { alive = false; clearInterval(timer) }
      },
      actions: {
        'run-first': (scope, event) => {
          const first = listSkills(store, 1)[0] || suggestSkills(store, 1)[0]
          if (!first) return { toast: t('skills_act_run', event?.locale) && t('skills_head_none', event?.locale) }
          return { insert: `${first}\n`, toast: t('skills_head', event?.locale) }
        },
        refresh: () => ({ refresh: true }),
      },
    })

    // 消息长按菜单：照这条办 / 记住这条
    ctx.dshGo.on('do-it', (scope, event) => {
      const text = String(scope.message || '').trim()
      if (text === '') return { toast: t('toast_doit_empty', event?.locale) }
      const goal = text.slice(0, 300).replace(/\n+/g, ' ')
      return { insert: `${t('insert_doit', event?.locale)}${goal}`.slice(0, 2000), toast: t('toast_doit_ok', event?.locale) }
    })

    ctx.dshGo.on('memory-save', (scope, event) => {
      const text = String(scope.message || '').trim().slice(0, 200)
      if (text === '') return { toast: t('toast_doit_empty', event?.locale) }
      remember(store, text, 'fact', Date.now(), cfg.memoryMax)
      persist()
      return { toast: t('toast_memory_saved', event?.locale) }
    })

    // 会话动作：读一屏 / 清空记忆
    ctx.dshGo.on('screen', (scope, event) => {
      const loc = event?.locale
      return {
        pending: { label: t('pending_reading', loc), timeoutMs: 25000 },
        result: async () => {
          const s = await phone.screen()
          if (!s.ok) return { toast: t('toast_screen_fail', loc) }
          return { insert: `${t('insert_screen', loc)}\n${s.text}\n\n`.slice(0, 2000) }
        },
      }
    })

    ctx.dshGo.on('wipe', (scope, event) => {
      store = { v: 1, items: [], updatedAt: 0 }
      persist()
      counters.phone = 0
      return { toast: t('toast_wiped', event?.locale) }
    })

    // 回合尾注：这一回合动了手机几次
    if (typeof ctx.dshGo.turnNote === 'function') {
      ctx.dshGo.turnNote('steps', (scope, emit, caps) => {
        if (!cfg.turnNote) return () => {}
        emit({ steps: { text: t('turnnote', caps?.locale, { n: counters.phone }).slice(0, 16), tone: counters.phone > 0 ? 'info' : 'muted' } })
        return () => {}
      })
    }

    // 助手设置：开关 + 唤醒词 + 应答 + 状态条文案，都能在 App 里改
    ctx.dshGo.panel('settings', {
      view: (scope, caps) => {
        const loc = caps.locale
        const w = words(loc)
        const comps = Array.isArray(caps.components) ? caps.components : []
        const canForm = comps.includes('form') && comps.includes('textField')
        if (!canForm) {
          return {
            type: 'stack',
            title: t('settings_title', loc),
            children: [
              { type: 'text', text: t('settings_head', loc) },
              {
                type: 'options',
                id: 'flags',
                multi: true,
                selected: { $: 'data.selected' },
                options: [
                  { label: t('flag_caption', loc), value: 'caption' },
                  { label: t('flag_turnNote', loc), value: 'turnNote' },
                  { label: t('flag_memoryAuto', loc), value: 'memoryAuto' },
                  { label: t('flag_guardDanger', loc), value: 'guardDanger' },
                  { label: t('flag_voiceFirst', loc), value: 'voiceFirst' },
                  { label: t('flag_voiceSteps', loc), value: 'voiceSteps' },
                ],
              },
              { type: 'text', text: `${t('settings_hint', loc)} ${phrasesFile()}`, tone: 'muted' },
              {
                type: 'actions',
                items: [
                  { label: t('settings_act_debug', loc), action: 'debug-screen' },
                  { label: t('settings_act_refresh', loc), action: 'refresh' },
                ],
              },
            ],
          }
        }
        return {
          v: 2,
          type: 'stack',
          title: t('settings_title', loc),
          children: [
            { type: 'text', text: t('settings_head', loc) },
            {
              type: 'form',
              submit: 'save',
              submitLabel: t('settings_save', loc),
              children: [
                { type: 'toggle', label: t('flag_caption', loc), bind: 'data.f_caption' },
                { type: 'toggle', label: t('flag_turnNote', loc), bind: 'data.f_turnNote' },
                { type: 'toggle', label: t('flag_memoryAuto', loc), bind: 'data.f_memoryAuto' },
                { type: 'toggle', label: t('flag_guardDanger', loc), bind: 'data.f_guardDanger' },
                { type: 'toggle', label: t('flag_voiceFirst', loc), bind: 'data.f_voiceFirst' },
                { type: 'toggle', label: t('flag_voiceSteps', loc), bind: 'data.f_voiceSteps' },
                { type: 'textField', label: t('settings_field_wake', loc), bind: 'data.p_wake', value: { $: 'data.p_wake' }, maxLength: 20 },
                { type: 'textField', label: t('settings_field_hello', loc), bind: 'data.p_hello', value: { $: 'data.p_hello' }, multiline: true, maxLines: 3, maxLength: 200 },
                { type: 'text', text: t('settings_group_replies', loc), tone: 'muted' },
                { type: 'textField', label: t('settings_field_reply_done', loc), bind: 'data.p_reply_done', value: { $: 'data.p_reply_done' }, maxLength: 60 },
                { type: 'textField', label: t('settings_field_reply_fail', loc), bind: 'data.p_reply_fail', value: { $: 'data.p_reply_fail' }, maxLength: 60 },
                { type: 'textField', label: t('settings_field_reply_thinking', loc), bind: 'data.p_reply_thinking', value: { $: 'data.p_reply_thinking' }, maxLength: 60 },
                { type: 'textField', label: t('settings_field_reply_listening', loc), bind: 'data.p_reply_listening', value: { $: 'data.p_reply_listening' }, maxLength: 60 },
                { type: 'textField', label: t('settings_field_reply_bye', loc), bind: 'data.p_reply_bye', value: { $: 'data.p_reply_bye' }, maxLength: 60 },
                { type: 'text', text: t('settings_group_island', loc), tone: 'muted' },
                { type: 'textField', label: t('settings_field_island_idle', loc), bind: 'data.p_islandIdle', value: { $: 'data.p_islandIdle' }, maxLength: 60 },
                { type: 'textField', label: t('settings_field_island_offline', loc), bind: 'data.p_islandOffline', value: { $: 'data.p_islandOffline' }, maxLength: 40 },
                { type: 'textField', label: t('settings_field_mode_idle', loc), bind: 'data.p_mode_idle', value: { $: 'data.p_mode_idle' }, maxLength: 20 },
                { type: 'textField', label: t('settings_field_mode_busy', loc), bind: 'data.p_mode_busy', value: { $: 'data.p_mode_busy' }, maxLength: 20 },
                { type: 'text', text: t('settings_group_captions', loc), tone: 'muted' },
                { type: 'textField', label: t('settings_field_caption_offline', loc), bind: 'data.p_caption_offline', value: { $: 'data.p_caption_offline' }, maxLength: 60 },
                { type: 'textField', label: t('settings_field_caption_working', loc), bind: 'data.p_caption_working', value: { $: 'data.p_caption_working' }, maxLength: 60 },
                { type: 'textField', label: t('settings_field_caption_idle', loc), bind: 'data.p_caption_idle', value: { $: 'data.p_caption_idle' }, maxLength: 60 },
                { type: 'textField', label: t('settings_field_turnnote', loc), bind: 'data.p_turnnote', value: { $: 'data.p_turnnote' }, maxLength: 40 },
                { type: 'text', text: t('settings_group_panels', loc), tone: 'muted' },
                { type: 'textField', label: t('settings_field_jarvis_title', loc), bind: 'data.p_jarvis_title', value: { $: 'data.p_jarvis_title' }, maxLength: 40 },
                { type: 'textField', label: t('settings_field_callout', loc), bind: 'data.p_callout', value: { $: 'data.p_callout' }, multiline: true, maxLines: 2, maxLength: 200 },
                { type: 'text', text: t('settings_group_memory', loc), tone: 'muted' },
                { type: 'textField', label: t('settings_field_memory_hint', loc), bind: 'data.p_memory_hint', value: { $: 'data.p_memory_hint' }, maxLength: 120 },
                { type: 'textField', label: t('settings_field_guard_words', loc), bind: 'data.p_guard_words', value: { $: 'data.p_guard_words' }, multiline: true, maxLines: 2, maxLength: 300 },
                { type: 'number', label: t('settings_field_memory_max', loc), bind: 'data.p_memoryMax', value: { $: 'data.p_memoryMax' }, min: 20, max: 5000, step: 20 },
                { type: 'toggle', label: t('settings_field_wakeRequired', loc), bind: 'data.f_wakeRequired' },
                { type: 'number', label: t('settings_field_answerSentences', loc), bind: 'data.p_answerSentences', value: { $: 'data.p_answerSentences' }, min: 1, max: 5, step: 1 },
                { type: 'textField', label: t('settings_field_stepsRange', loc), bind: 'data.p_stepsRange', value: { $: 'data.p_stepsRange' }, maxLength: 10 },
                { type: 'textField', label: t('settings_field_extra_panels', loc), bind: 'data.p_extra_panels', value: { $: 'data.p_extra_panels' }, multiline: true, maxLines: 4, maxLength: 1500 },
                { type: 'textField', label: t('settings_field_extra_tips', loc), bind: 'data.p_extra_tips', value: { $: 'data.p_extra_tips' }, multiline: true, maxLines: 4, maxLength: 1500 },
              ],
            },
            { type: 'text', text: `${t('settings_hint', loc)} ${phrasesFile()}`, tone: 'muted' },
            {
              type: 'actions',
              items: [
                { label: t('settings_act_debug', loc), action: 'debug-screen' },
                { label: t('settings_act_copy_path', loc), action: 'copy-path' },
                { label: t('settings_act_refresh', loc), action: 'refresh' },
              ],
            },
          ],
        }
      },
      data: (scope, emit, caps) => {
        let alive = true
        const push = () => {
            if (!alive) return
          const w = words(caps.locale)
          emit({
            selected: selectedFlags(cfg),
            f_caption: cfg.caption,
            f_turnNote: cfg.turnNote,
            f_memoryAuto: cfg.memoryAuto,
            f_guardDanger: cfg.guardDanger,
            f_voiceFirst: cfg.voiceFirst,
            f_voiceSteps: cfg.voiceSteps,
            p_wake: cfg.wakeWord || '',
            p_hello: list('hello', caps.locale).join(' / '),
            p_islandIdle: w.island_online,
            p_islandOffline: w.island_offline,
            p_reply_done: w.reply_done,
            p_reply_fail: w.reply_fail,
            p_reply_thinking: w.reply_thinking,
            p_reply_listening: w.reply_listening,
            p_reply_bye: w.reply_bye,
            p_mode_idle: w.island_mode_idle,
            p_mode_busy: w.island_busy,
            p_caption_offline: w.caption_offline,
            p_caption_working: w.caption_working,
            p_caption_idle: w.caption_idle,
            p_turnnote: w.turnnote,
            p_jarvis_title: w.jarvis_title,
            p_callout: w.jarvis_callout,
            p_memory_hint: w.memory_hint,
            p_guard_words: cfg.guardWords || '',
            p_memoryMax: cfg.memoryMax || 400,
            f_wakeRequired: cfg.wakeRequired === true,
            p_answerSentences: cfg.answerSentences || 2,
            p_stepsRange: `${cfg.stepMin || 2}-${cfg.stepMax || 15}`,
            p_extra_panels: '',
            p_extra_tips: '',
          })
        }
        push()
        const timer = setInterval(push, 8000)
        return () => { alive = false; clearInterval(timer) }
      },
      actions: {
        save: (scope, event) => {
          const loc = event?.locale
          const raw0 = event?.value
          const raw = (raw0 && typeof raw0 === 'object' && (raw0.values || raw0.fields || raw0.data)) || (raw0 && typeof raw0 === 'object' ? raw0 : {})
          const flat = {}
          for (const [k, v] of Object.entries(raw || {})) flat[String(k).replace(/^data\./, '')] = v
          try { writeFileSync(join(fishyDir(), 'last-edit.json'), JSON.stringify({ at: Date.now(), value: raw0, flat }, null, 2)) } catch { /* 没权限就算了 */ }
          const bool = (v) => v === true || v === 'true' || v === 1 || v === '1' || v === 'on'
          for (const k of ['caption', 'turnNote', 'memoryAuto', 'guardDanger', 'voiceFirst', 'voiceSteps']) {
            if (flat[`f_${k}`] !== undefined) cfg[k] = bool(flat[`f_${k}`])
          }
          if (typeof flat.p_wake === 'string' && flat.p_wake.trim() !== '') cfg.wakeWord = flat.p_wake.trim().slice(0, 20)
          if (typeof flat.p_guard_words === 'string') cfg.guardWords = flat.p_guard_words.trim().slice(0, 500)
          if (Number.isFinite(Number(flat.p_memoryMax))) cfg.memoryMax = Math.max(20, Math.min(5000, Math.floor(Number(flat.p_memoryMax))))
          if (typeof flat.f_wakeRequired === 'boolean') cfg.wakeRequired = flat.f_wakeRequired
          if (Number.isFinite(Number(flat.p_answerSentences))) cfg.answerSentences = Math.max(1, Math.min(5, Math.floor(Number(flat.p_answerSentences))))
          if (typeof flat.p_stepsRange === 'string') {
            const m = flat.p_stepsRange.match(/^(\d{1,2})\s*[-~到]\s*(\d{1,2})$/)
            if (m) {
              cfg.stepMin = Math.max(1, Math.min(30, Number(m[1])))
              cfg.stepMax = Math.max(cfg.stepMin, Math.min(40, Number(m[2])))
            }
          }
          persistCfg()
          const lang = String(loc || 'zh').startsWith('en') ? 'en' : 'zh'
          const patch = { zh: {}, en: {} }
          if (typeof flat.p_hello === 'string' && flat.p_hello.trim() !== '') {
            patch[lang].hello = flat.p_hello.split('/').map((x) => x.trim()).filter(Boolean).slice(0, 8)
          }
          const TEXTS = {
            p_islandIdle: 'island_online',
            p_islandOffline: 'island_offline',
            p_reply_done: 'reply_done',
            p_reply_fail: 'reply_fail',
            p_reply_thinking: 'reply_thinking',
            p_reply_listening: 'reply_listening',
            p_reply_bye: 'reply_bye',
            p_mode_idle: 'island_mode_idle',
            p_mode_busy: 'island_busy',
            p_caption_offline: 'caption_offline',
            p_caption_working: 'caption_working',
            p_caption_idle: 'caption_idle',
            p_turnnote: 'turnnote',
            p_jarvis_title: 'jarvis_title',
            p_callout: 'jarvis_callout',
            p_memory_hint: 'memory_hint',
          }
          for (const [field, key] of Object.entries(TEXTS)) {
            const v = flat[field]
            if (typeof v === 'string' && v.trim() !== '') patch[lang][key] = v.trim().slice(0, 300)
          }
          // 额外文案：每行 键=值，只认 phrases 里已有的键；留空的不改
          const ALL_KEYS = Object.keys(words('zh'))
          const parseExtra = (text) => {
            for (const line of String(text || '').split('\n')) {
              const hit = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$/)
              if (!hit) continue
              const [, key, value] = hit
              if (!ALL_KEYS.includes(key) || key === 'hello') continue
              patch[lang][key] = value.slice(0, 300)
            }
          }
          parseExtra(flat.p_extra_panels)
          parseExtra(flat.p_extra_tips)
          if (Object.keys(patch.zh).length > 0 || Object.keys(patch.en).length > 0) savePhrases(patch)
          return { toast: t('settings_saved', loc), refresh: true }
        },
        flags: (scope, event) => {
          applyFlagValues(cfg, event?.value?.values)
          persistCfg()
          return { toast: t('settings_saved', event?.locale), refresh: true }
        },
        'debug-screen': (scope, event) => ({
          pending: { label: t('pending_reading', event?.locale), timeoutMs: 25000 },
          result: async () => {
            const s = await phone.screen()
            if (!s.ok) return { toast: t('toast_screen_fail', event?.locale) }
            return { insert: `${t('insert_screen', event?.locale)}\n${s.text}\n\n`.slice(0, 2000) }
          },
        }),
        'copy-path': (scope, event) => ({ copy: phrasesFile(), toast: t('settings_act_copy_path', event?.locale) }),
        refresh: () => ({ refresh: true }),
      },
    })

    // 记忆胶囊
    ctx.dshGo.on('memory-open', (scope, event) => ({
      toast: t('toast_memory_open', event?.locale),
      open: 'panel:memory',
    }))

    // 给模型的提示：手机操作、唤醒词、语音优先、步骤播报、记忆
    try {
      ctx.inject(['systemPrompt'], (c) => {
        c.systemPrompt?.section?.({
          name: 'fishy-jarvis',
          order: 950,
          text: () => {
            const b = brief(store, 6)
            const wake = String(cfg.wakeWord || '').trim()
            const lines = [
              '你可以操作用户这台 Android 手机，走 dsh-go 自带的手机操控：fishy_screen 读屏、fishy_tap 按编号点、fishy_type 往输入框输入、fishy_swipe 滑动、fishy_key 按键、fishy_open 开应用、fishy_wait 等刷新。',
              '点按和输入前先 fishy_screen 拿编号；操作失败就如实说，不要假装点过。不要提交表单、不要付款，除非用户明确要求。',
              wake
              ? (cfg.wakeRequired === true
                ? `只有用户消息以「${wake}」开头时才算叫你：先应一句再处理后面的内容；不以它开头的消息先问一句"要带唤醒词吗"，不要直接执行。`
                : `用户消息以「${wake}」开头时当作叫醒：先用一句应答（见唤醒应答文案）回一句，再处理剩下的内容。`)
              : '',
              b ? `关于用户的长期记忆：\n${b}` : '目前还没有长期记忆；用户明确说"记住…"时用 fishy_memory 记下来。',
            ].filter(Boolean)
            if (cfg.voiceFirst !== false) {
              lines.push(
                '【语音优先模式】用户可能全程戴耳机、不看屏幕（语音通话）：',
                `- 回答口语化、短，一次一到${Math.max(1, Math.min(5, Number(cfg.answerSentences) || 2))}句；不要 Markdown、表格、代码块、表情符号，不要念链接和文件路径。`,
                '- 需要用户做选择时：不要用 ask_user_question 或选项卡片；直接在回答里把问题和每个选项念出来（「第一个…；第二个…」），然后停下等用户口头回答。',
                '- 用户说「再说一遍」「再播报一次」「没听清」时，把上一段内容原样再说一遍，不要重新执行任务。',
                '- 用户插话打断时，以用户新说的话为准，短句确认后再继续。',
                '- 用户说「打开/关掉语音模式」时，用 fishy_voice 切换 voiceFirst 并口头确认。',
              )
            }
            if (cfg.voiceSteps !== false) {
              lines.push(
                `【步骤播报】执行任务时，每完成一个关键步骤另起一行，用 ${Number(cfg.stepMin) || 2}–${Number(cfg.stepMax) || 15} 个字播报（如「打开微信」「点搜索框」「输入关键词」）：`,
                '- 只播报动作本身，不念内部思考、不念参数长文本；连续几步可以合成一句。',
                '- 用户说「别念步骤」「打开步骤播报」时，用 fishy_voice 切换 voiceSteps 并口头确认。',
              )
            }
            return lines.join('\n')
          },
        })
      })
    } catch {
      /* 引擎没有 systemPrompt 服务时忽略 */
    }
  })
}
