/**
 * 补充手机工具：滑动、按键、打开应用。
 * 全部走 dsh-go 自带的手机操控（MCP），不依赖任何第三方 App。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { t } from './phrases.js'

export function registerOpsTools(ctx, phone, hooks = {}) {
  const touch = () => { try { hooks.onPhoneAction?.() } catch { /* 计数器坏了不影响主流程 */ } }

  ctx.tools.register(defineTool({
    name: 'fishy_swipe',
    description:
      '在手机上滑动（列表翻页、下拉刷新、拖动）。给方向 up/down/left/right；' +
      '要滑某个列表时，先 fishy_screen 拿到列表编号再传 id。',
    parameters: {
      direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], required: true, description: '滑动方向。' },
      id: { type: 'integer', description: '列表编号，可省略（默认滑整屏）。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true }, detail: { type: 'string', required: true } } },
      render: (_a, v) => [{ type: 'text', text: v.detail }],
    },
    timeoutMs: 20000,
    isConcurrencySafe: () => false,
    execute: async (a) => {
      const r = await phone.scroll(a.direction, a.id)
      touch()
      return { ok: r.ok === true, detail: r.ok ? `已向${a.direction}滑动。` : String(r.text || '滑动失败') }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'fishy_key',
    description: '按系统键：back（返回）/ home（回桌面）/ recents（最近任务）/ notifications（通知栏）。返回键最常用。',
    parameters: { key: { type: 'string', enum: ['back', 'home', 'recents', 'notifications'], required: true, description: '键名。' } },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true }, detail: { type: 'string', required: true } } },
      render: (_a, v) => [{ type: 'text', text: v.detail }],
    },
    timeoutMs: 15000,
    isConcurrencySafe: () => false,
    execute: async (a) => {
      const r = await phone.key(String(a.key))
      touch()
      const name = t(`ops_key_${a.key}`, 'zh-CN')
      return { ok: r.ok === true, detail: r.ok ? t('ops_key_done', 'zh-CN', { k: name }) : String(r.text || '按键失败') }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'fishy_open',
    description: '按名字打开手机上装的应用（例如"微信""设置""计算器"）。用户说"打开某某"时用它。',
    parameters: { app: { type: 'string', required: true, description: '应用名，跟桌面图标上写的一致。' } },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true }, detail: { type: 'string', required: true } } },
      render: (_a, v) => [{ type: 'text', text: v.detail }],
    },
    timeoutMs: 20000,
    isConcurrencySafe: () => false,
    execute: async (a) => {
      const r = await phone.open(String(a.app))
      touch()
      return { ok: r.ok === true, detail: r.ok ? t('ops_open_ok', 'zh-CN') : String(r.text || t('ops_open_fail', 'zh-CN')) }
    },
  }))
}
