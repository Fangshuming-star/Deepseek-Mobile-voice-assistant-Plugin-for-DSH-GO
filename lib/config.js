/**
 * 用户可调的开关 + 桥接地址。放手机存储里的 config.json（默认 /sdcard/Download/DSH-Go/fishy/），
 * 手机文件管理器能直接打开改；App 的「助手设置」面板也能改。
 *
 * 为什么要有这个：助手最招人烦的是「自作主张」——字幕一直闪、每回合都插尾注、
 * 什么都往记忆里塞。这些都是能一键关掉的，默认开是因为大多数人想要全开。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fishyDir, fishyFile, legacyDir } from './paths.js'

export const DEFAULTS = {
  caption: true,      // 面板字幕行（micro 通道）：右下角一直显示最近一步在做什么
  turnNote: true,     // 每回合尾注：手机动作 N 次
  memoryAuto: true,   // 目标/读屏结果自动进记忆（关掉就只有你说「记住」才记）
  guardDanger: true,  // 危险按钮拦截（提交/支付/购买/转账…）默认要二次确认
  voiceFirst: true,    // 语音优先：口头问选项、短句回答、方便全程语音通话
  voiceSteps: true,    // 步骤播报：每完成一步用 2–15 字说一句
  wakeWord: '助手',     // 唤醒词：用户消息以它开头就当作"叫醒"，先应答再执行
  wakeRequired: false,  // 是否必须带唤醒词才算叫它（默认否：普通消息也处理）
  answerSentences: 2,   // 语音优先时一次最多说几句（1–5）
  stepMin: 2,           // 步骤播报最短字数
  stepMax: 15,          // 步骤播报最长字数
  memoryMax: 400,       // 记忆条数上限
  guardWords: '',       // 危险按钮词表（逗号分隔；空 = 用内置列表）
}

/** 设置文件路径（默认手机存储里，可被 FISHY_HOME 改） */
export function configFile() {
  return process.env.FISHY_CONFIG_FILE || fishyFile('config.json')
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function normalize(raw, base = { ...DEFAULTS }) {
  const out = { ...base }
  if (!isObj(raw)) return out
  for (const k of ['caption', 'turnNote', 'memoryAuto', 'guardDanger', 'voiceFirst', 'voiceSteps']) {
    if (typeof raw[k] === 'boolean') out[k] = raw[k]
  }
  if (typeof raw.wakeWord === 'string') out.wakeWord = raw.wakeWord.trim().slice(0, 20)
  if (Number.isFinite(Number(raw.memoryMax))) out.memoryMax = Math.max(20, Math.min(5000, Math.floor(Number(raw.memoryMax))))
  if (typeof raw.guardWords === 'string') out.guardWords = raw.guardWords.trim().slice(0, 500)
  if (typeof raw.wakeRequired === 'boolean') out.wakeRequired = raw.wakeRequired
  if (Number.isFinite(Number(raw.answerSentences))) out.answerSentences = Math.max(1, Math.min(5, Math.floor(Number(raw.answerSentences))))
  if (Number.isFinite(Number(raw.stepMin))) out.stepMin = Math.max(1, Math.min(30, Math.floor(Number(raw.stepMin))))
  if (Number.isFinite(Number(raw.stepMax))) out.stepMax = Math.max(out.stepMin, Math.min(40, Math.floor(Number(raw.stepMax))))
  return out
}

export function loadConfig(file = configFile()) {
  try {
    if (existsSync(file)) return normalize(JSON.parse(readFileSync(file, 'utf8')))
    // 从老位置迁移一次（之前存在引擎 cache 里，手机上看不到）
    const legacy = process.env.FISHY_MEMORY_DIR || legacyDir()
    const old = `${legacy}/config.json`
    if (process.env.FISHY_CONFIG_FILE === undefined && old !== file && existsSync(old)) {
      return normalize(JSON.parse(readFileSync(old, 'utf8')))
    }
  } catch {
    /* 坏了就用默认值，绝不让配置把插件拖死 */
  }
  return { ...DEFAULTS }
}

export function saveConfig(cfg, file = configFile()) {
  try {
    mkdirSync(dirname(file), { recursive: true })
    const out = normalize(cfg)
    writeFileSync(file, JSON.stringify(out, null, 2), 'utf8')
    return true
  } catch {
    return false
  }
}

/** options 组件多选回传：value.values 是「选中的值」数组 */
export function applyFlagValues(cfg, values) {
  if (!Array.isArray(values)) return cfg
  const on = new Set(values.map(String))
  for (const k of FLAG_KEYS) cfg[k] = on.has(k)
  return cfg
}

export const FLAG_KEYS = ['caption', 'turnNote', 'memoryAuto', 'guardDanger', 'voiceFirst', 'voiceSteps']

export function selectedFlags(cfg) {
  return FLAG_KEYS.filter((k) => cfg[k] === true)
}

/** 默认用户可编辑目录（面板里展示给用户看） */
export { fishyDir }
