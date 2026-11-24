/**
 * 人格层：唤醒后说什么、办完说什么、没办成说什么。
 *
 * 文案不写死在这里：默认值在 phrases.js，用户可以在 phrases.json 里覆盖
 * （默认 /sdcard/Download/DSH-Go/fishy/phrases.json，App 的「助手设置」面板也能改）。
 *
 * 原则（照市面上成熟助手的共同点来的）：
 *  - 先给"我在"这种一秒能听到的应答，别让用户猜有没有听到；
 *  - 句子短，不超过 12 字，TTS 一开口就到位；
 *  - 失败了说人话 + 给下一步，不甩英文异常。
 */
import { list, t } from './phrases.js'

export const isZh = (locale) => !String(locale || 'zh').startsWith('en')

/** 随机挑一句，避免每次唤醒都同一句（同一毫秒可复现，方便测试） */
export function greeting(kind, locale, seed = 0) {
  if (kind === 'hello') {
    const all = list('hello', locale)
    return all[Math.abs(seed) % all.length]
  }
  return t(`reply_${kind}`, locale)
}

/** 记忆分类标签（面板和提示词共用），可在 phrases.json 里改 */
export const kindLabel = (kind, locale = 'zh-CN') => t(`kind_${kind}`, locale)

export const KIND_LABEL = { pref: '偏好', goal: '常做', fact: '事实', fail: '注意', name: '称呼', skill: '技能' }
