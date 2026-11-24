/**
 * 危险按钮拦截。
 *
 * 为什么要有：助手的边界不能只写在提示词里——模型可能忘记，用户可能没注意。
 * 这里在**真点下去之前**看一眼按钮文字，命中「提交/支付/购买/转账」这类词就拦下来，
 * 要求调用方显式 confirmed: true 才放行。默认开，可在设置面板关掉。
 *
 * 这不是安全沙箱，只是「别手滑」的保险；真正的边界由 App 的权限与用户决定（做完不提交等）。
 */
export const DANGER_WORDS = [
  '提交', '确认提交', '提交答卷', '交卷',
  '支付', '确认支付', '立即支付', '付款', '确认付款',
  '立即购买', '确认购买', '下单', '结算', '去支付',
  '转账', '汇款', '充值', '提现',
  '删除账号', '注销账号', '注销', '解绑', '退出登录',
]

export function parseWords(value) {
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean)
  const text = String(value ?? '').trim()
  if (text === '') return DANGER_WORDS
  return text.split(/[,，、;；\s]+/).map((x) => x.trim()).filter(Boolean)
}

export function isDangerous(label, words = DANGER_WORDS) {
  const t = String(label || '').replace(/\s+/g, '')
  if (t === '') return null
  for (const w of words) {
    if (w && t.includes(w)) return w
  }
  return null
}

/**
 * 该不该放行。返回 { allow, hit, why }
 *  - allow=false 时调用方要如实告诉用户「我拦下了，因为这是『支付』」，
 *    并把 confirmed: true 的用法说清楚（而不是假装点过）。
 */
export function guardTap(label, confirmed, cfg = { guardDanger: true }) {
  if (cfg.guardDanger === false) return { allow: true, hit: null, why: '拦截已关闭' }
  const words = parseWords(cfg.guardWords)
  const hit = isDangerous(label, words)
  if (hit === null) return { allow: true, hit: null, why: '' }
  if (confirmed === true) return { allow: true, hit, why: '用户已确认' }
  return {
    allow: false,
    hit,
    why: '按钮是「' + hit + '」类操作，没被授权我不点。要真的点，请让用户明确同意后带 confirmed: true 再来。',
  }
}
