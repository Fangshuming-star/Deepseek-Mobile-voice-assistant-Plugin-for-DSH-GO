/**
 * 文案层：插件里所有"用户看得见的话"都放这里，默认值随包附带；
 * 用户自己的覆盖值写在 phrases.json（默认 /sdcard/Download/DSH-Go/fishy/phrases.json）。
 *
 * 三个约定：
 *  - 文件里只写要改的键；没写的用默认值（不会因为漏键而变成空话）。
 *  - 值里的 {name} 是占位符，由代码填入；数组（hello）可以写多句随机挑。
 *  - 改完保存即可：面板/状态条下一次刷新就会读到新文案（按 mtime 缓存 1 秒）。
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fishyFile } from './paths.js'

export const DEFAULTS = {
  zh: {
    hello: ['我在', '我在，你说', '听着呢', '嗯，我在'],
    reply_done: '办好了',
    reply_fail: '没办成',
    reply_thinking: '我想想',
    reply_listening: '你说',
    reply_bye: '那我待着',
    kind_pref: '偏好',
    kind_goal: '常做',
    kind_fact: '事实',
    kind_fail: '注意',
    kind_name: '称呼',
    kind_skill: '技能',

    island_online: '助手在·{mode}{run}{tail}',
    island_offline: '手机通道没开·点我',
    island_mode_idle: '待命',
    island_busy: '·干活中',

    caption_offline: '手机操控没开',
    caption_working: '正在干活',
    caption_idle: '待命中',

    jarvis_title: '手机助手',
    jarvis_connected: '已连接 · {last}',
    jarvis_unreachable: '连不上手机操控：设置 › 手机操控 里打开后再点刷新。',
    jarvis_none: '—',
    jarvis_key_channel: '通道',
    jarvis_key_screen: '屏幕',
    jarvis_key_last: '最近一步',
    jarvis_key_memory: '记忆',
    jarvis_act_screen: '读屏幕',
    jarvis_act_refresh: '刷新',
    jarvis_callout: '直接说要做的事：读屏、点按、输入、打开应用；需要选的时候我会念出来，不用看屏幕。',

    toast_screen_ok: '读到了，已放进输入框',
    toast_screen_fail: '读不到屏幕：先打开 dsh-go 的手机操控',
    pending_reading: '正在读屏',
    insert_screen: '当前屏幕：',

    memory_title: '记忆',
    memory_head: '共 {n} 条（上限 {max}）',
    memory_hint: '说“记住…”会加一条；说“忘了…”会删一条。',
    memory_wipe_confirm: '确认清空',
    memory_wipe_cancel: '算了',
    memory_sub: '{kind} · 命中 {n} 次',

    skills_title: '快捷指令',
    skills_head_none: '还没有快捷指令',
    skills_head: '点一条就开跑：',
    skills_hint: '跟助手说“把这句话存成快捷指令”就能加。',
    skills_tag_skill: '技能',
    skills_tag_goal: '跑过的目标',
    skills_act_run: '跑第一条',
    skills_act_refresh: '刷新',

    settings_title: '助手设置',
    settings_head: '这些东西都能在 App 里直接改：',
    settings_hint: '改动立即生效并落盘。文案/设置文件：',
    flag_caption: '面板字幕（显示最近在做什么）',
    flag_turnNote: '回合尾注（手机动作 N 次）',
    flag_memoryAuto: '自动记忆（目标自动进记忆）',
    flag_guardDanger: '危险拦截（提交/付款要确认）',
    flag_voiceFirst: '语音优先（免看屏：口头问选项、短句回答）',
    flag_voiceSteps: '步骤播报（每步 2–15 字念出来）',
    settings_field_wake: '唤醒词（消息以它开头就算叫醒）',
    settings_field_wakeRequired: '必须带唤醒词才响应',
    settings_field_answerSentences: '语音优先时一次最多说几句（1–5）',
    settings_field_stepsRange: '步骤播报字数范围（如 2-15）',
    settings_field_extra_panels: '更多文案 A：面板/记忆/快捷指令（每行 键=值）',
    settings_field_extra_tips: '更多文案 B：提示/插入/按钮（每行 键=值）',
    settings_field_hello: '唤醒应答（多句用 / 分隔）',
    settings_field_island_idle: '状态条·在线模板（可用 {mode}{run}{tail}）',
    settings_field_island_offline: '状态条·离线文案',
    settings_group_replies: '回复文案',
    settings_field_reply_done: '做成了说什么',
    settings_field_reply_fail: '没做成说什么',
    settings_field_reply_thinking: '要想一想说什么',
    settings_field_reply_listening: '让你继续说时说什么',
    settings_field_reply_bye: '待命时说什么',
    settings_group_island: '状态条模式',
    settings_field_mode_idle: '状态条·待命',
    settings_field_mode_busy: '状态条·干活中后缀',
    settings_group_captions: '面板字幕（micro 行）',
    settings_field_caption_offline: '字幕·没连上',
    settings_field_caption_working: '字幕·正在干活',
    settings_field_caption_idle: '字幕·待命',
    settings_field_turnnote: '回合尾注（可用 {n}）',
    settings_group_panels: '面板文案',
    settings_field_jarvis_title: '主面板标题',
    settings_field_callout: '面板里那句提示',
    settings_group_memory: '记忆',
    settings_field_memory_hint: '记忆面板提示语',
    settings_field_memory_max: '记忆上限（条，20–5000）',
    settings_group_guard: '安全',
    settings_field_guard_words: '危险按钮词表（逗号分隔，空=内置）',
    settings_save: '保存',
    settings_saved: '已保存',
    settings_act_copy_path: '复制文件路径',
    settings_act_refresh: '刷新',
    settings_act_debug: '调试：读一屏',

    turnnote: '手机动作 {n} 次',

    toast_memory_open: '记忆都在这儿',
    toast_kept: '没动你的记忆',
    toast_wiped: '记忆已清空',
    toast_memory_saved: '记住了',
    toast_doit_empty: '这条消息是空的',
    toast_doit_ok: '已转成目标，回车我就开跑',
    insert_doit: '照这条办：',
    insert_memory: '记住这条：',

    ops_key_back: '返回',
    ops_key_home: '回桌面',
    ops_key_recents: '最近任务',
    ops_key_notifications: '通知栏',
    ops_key_done: '已按「{k}」。',
    ops_open_ok: '已启动',
    ops_open_fail: '没找到这个应用',
  },
  en: {
    hello: ['Here', "I'm here", 'Listening'],
    reply_done: 'Done',
    reply_fail: 'That failed',
    reply_thinking: 'Let me think',
    reply_listening: 'Go ahead',
    reply_bye: 'Standing by',
    kind_pref: 'preference',
    kind_goal: 'frequent',
    kind_fact: 'fact',
    kind_fail: 'watch out',
    kind_name: 'name',
    kind_skill: 'skill',
    island_online: 'Assistant {mode}{run}{tail}',
    island_offline: 'Phone channel off',
    island_mode_idle: 'idle',
    island_busy: '·busy',
    caption_offline: 'Phone control off',
    caption_working: 'Working',
    caption_idle: 'Standing by',
    jarvis_title: 'Phone assistant',
    jarvis_connected: 'Connected · {last}',
    jarvis_unreachable: 'Cannot reach phone control. Open dsh settings and try refresh.',
    jarvis_none: '—',
    jarvis_key_channel: 'Channel',
    jarvis_key_screen: 'Screen',
    jarvis_key_last: 'Last step',
    jarvis_key_memory: 'Memory',
    jarvis_act_screen: 'Read screen',
    jarvis_act_refresh: 'Refresh',
    jarvis_callout: 'Say what to do: read, tap, type, open an app. I will read choices aloud.',
    toast_screen_ok: 'Screen read',
    toast_screen_fail: 'Cannot read the screen',
    pending_reading: 'Reading screen',
    insert_screen: 'Current screen:',
    memory_title: 'Memory',
    memory_head: '{n} items',
    memory_hint: 'Say "remember ..." to add.',
    memory_wipe_confirm: 'Wipe',
    memory_wipe_cancel: 'Cancel',
    memory_sub: '{kind} · hits {n}',
    skills_title: 'Skills',
    skills_head_none: 'No skills yet',
    skills_head: 'Tap to run:',
    skills_hint: 'Ask the assistant to save a goal as a skill.',
    skills_tag_skill: 'skill',
    skills_tag_goal: 'recent goal',
    skills_act_run: 'Run first',
    skills_act_refresh: 'Refresh',
    settings_title: 'Assistant settings',
    settings_head: 'Everything can be changed in the app:',
    settings_hint: 'Saved immediately. Text/settings file:',
    flag_caption: 'Caption',
    flag_turnNote: 'Turn note',
    flag_memoryAuto: 'Auto memory',
    flag_guardDanger: 'Danger guard',
    flag_voiceFirst: 'Voice first (hands-free)',
    flag_voiceSteps: 'Announce steps',
    settings_field_wake: 'Wake word',
    settings_field_wakeRequired: 'Require wake word',
    settings_field_answerSentences: 'Max sentences per answer (1-5)',
    settings_field_stepsRange: 'Step announce length (e.g. 2-15)',
    settings_field_extra_panels: 'More texts A: panels/memory/skills (key=value per line)',
    settings_field_extra_tips: 'More texts B: toasts/inserts/labels (key=value per line)',
    settings_field_hello: 'Wake reply (separate with /)',
    settings_field_island_idle: 'Island idle template',
    settings_field_island_offline: 'Island offline text',
    settings_group_replies: 'Replies',
    settings_field_reply_done: 'Done reply',
    settings_field_reply_fail: 'Failure reply',
    settings_field_reply_thinking: 'Thinking reply',
    settings_field_reply_listening: 'Listening reply',
    settings_field_reply_bye: 'Idle reply',
    settings_group_island: 'Island modes',
    settings_field_mode_idle: 'Idle mode',
    settings_field_mode_busy: 'Busy suffix',
    settings_group_captions: 'Captions',
    settings_field_caption_offline: 'Caption: offline',
    settings_field_caption_working: 'Caption: working',
    settings_field_caption_idle: 'Caption: idle',
    settings_field_turnnote: 'Turn note (uses {n})',
    settings_group_panels: 'Panel texts',
    settings_field_jarvis_title: 'Panel title',
    settings_field_callout: 'Panel callout',
    settings_group_memory: 'Memory',
    settings_field_memory_hint: 'Memory hint',
    settings_field_memory_max: 'Memory limit (20-5000)',
    settings_group_guard: 'Safety',
    settings_field_guard_words: 'Danger words (comma separated)',
    settings_save: 'Save',
    settings_saved: 'Saved',
    settings_act_copy_path: 'Copy path',
    settings_act_refresh: 'Refresh',
    settings_act_debug: 'Debug: read screen',
    turnnote: '{n} taps',
    toast_memory_open: 'Your memory',
    toast_kept: 'Kept',
    toast_wiped: 'Memory wiped',
    toast_memory_saved: 'Remembered',
    toast_doit_empty: 'Empty message',
    toast_doit_ok: 'Turned into a goal',
    insert_doit: 'Do this:',
    insert_memory: 'Remember this:',
    ops_key_back: 'back',
    ops_key_home: 'home',
    ops_key_recents: 'recents',
    ops_key_notifications: 'notifications',
    ops_key_done: 'Pressed {k}.',
    ops_open_ok: 'Launched',
    ops_open_fail: 'App not found',
  },
}

let cache = { at: 0, file: '', data: null }
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function merge(base, over) {
  const out = { ...base }
  for (const [k, v] of Object.entries(over || {})) {
    if (isObj(v) && isObj(out[k])) out[k] = merge(out[k], v)
    else if (v !== undefined) out[k] = v
  }
  return out
}

export function phrasesFile() { return fishyFile('phrases.json') }

export function loadPhrases() {
  const file = phrasesFile()
  let at = 0
  try { at = statSync(file).mtimeMs } catch { at = 0 }
  if (cache.data !== null && cache.file === file && cache.at === at) return cache.data
  let user = {}
  if (at > 0) { try { user = JSON.parse(readFileSync(file, 'utf8')) } catch { user = {} } }
  const data = {
    zh: merge(DEFAULTS.zh, isObj(user.zh) ? user.zh : user),
    en: merge(DEFAULTS.en, isObj(user.en) ? user.en : {}),
    path: file,
    exists: at > 0,
  }
  cache = { at, file, data }
  return data
}

export function ensurePhrasesFile() {
  const file = phrasesFile()
  if (existsSync(file)) return file
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ zh: DEFAULTS.zh, en: DEFAULTS.en }, null, 2), 'utf8')
  } catch { /* 没存储权限就只用默认值 */ }
  return file
}

export function savePhrases(patch = {}) {
  const file = phrasesFile()
  const cur = loadPhrases()
  const next = {
    zh: merge(cur.zh, isObj(patch.zh) ? patch.zh : {}),
    en: merge(cur.en, isObj(patch.en) ? patch.en : {}),
  }
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(next, null, 2), 'utf8')
    cache = { at: 0, file: '', data: null }
    return true
  } catch {
    return false
  }
}

export function words(locale) {
  const all = loadPhrases()
  return String(locale || 'zh').startsWith('en') ? all.en : all.zh
}

export function fmt(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k])))
}

export function t(key, locale, vars) {
  const table = words(locale)
  const raw = table[key] ?? DEFAULTS.zh[key] ?? key
  return Array.isArray(raw) ? fmt(raw[0], vars) : fmt(raw, vars)
}

export function list(key, locale) {
  const table = words(locale)
  const raw = table[key] ?? DEFAULTS.zh[key]
  return Array.isArray(raw) ? raw : [String(raw)]
}
