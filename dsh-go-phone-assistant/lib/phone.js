/**
 * 手机操控通道：直接连 dsh-go 自带的手机操控（MCP），完全不需要肥鱼助手。
 *
 * 原理：dsh-go 的引擎里本来就有一个「手机操控」MCP 服务（stdio），由 App 提供。
 * 这里自己起一个 relay 子进程、按 MCP 协议说话，就能读屏、点按、输入、滑动、开应用。
 * 插件跑在引擎里，和 App 同机，所以这条通道不依赖任何第三方 App。
 *
 * 前置：dsh-go 的「设置 › 手机操控」要打开（App 侧按提示授权 Shizuku/ADB/无障碍）。
 */
import { spawn } from 'node:child_process'

const RELAY = process.env.PHONE_RELAY || '/opt/dsh-app/phone/relay.cjs'
const BRIDGE = process.env.PHONE_BRIDGE_FILE || '/var/lib/dsh-app/phone/bridge.json'

const ID_RE = /^\[(\d+)\]\s*(.*)$/
const SCREEN_RE = /屏幕\s*([sb]\d+)/

/** 解析 App 返回的屏幕文本：第一行带屏幕号，其余每行一个 [编号] 元素 */
export function parseScreen(text) {
  const raw = String(text || '')
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const first = lines[0] || ''
  const m = first.match(SCREEN_RE)
  const screen = m ? m[1] : ''
  const nodes = []
  for (const line of lines.slice(m ? 1 : 0)) {
    const hit = line.match(ID_RE)
    if (!hit) continue
    nodes.push({ id: Number(hit[1]), text: hit[2] || '' })
  }
  return { screen, nodes, text: raw }
}

/** 从屏幕上找输入框/按钮的编号（模型也可以直接给编号） */
export function findNodes(nodes, keyword) {
  const k = String(keyword || '').trim().toLowerCase()
  if (!k) return []
  return nodes.filter((n) => n.text.toLowerCase().includes(k))
}

export class PhoneChannel {
  constructor() {
    this.child = null
    this.buf = ''
    this.pending = new Map()
    this.seq = 0
    this.ready = false
    this.connecting = null
    this.lastScreen = ''
    this.lastText = ''
    this.lastAction = ''
    this.lastError = ''
    this.lastNodes = []
  }

  /** 起 relay 子进程并完成 MCP 握手（只做一次） */
  connect() {
    if (this.ready) return Promise.resolve(true)
    if (this.connecting) return this.connecting
    this.connecting = new Promise((resolve) => {
      let done = false
      const finish = (ok) => { if (done) return; done = true; resolve(ok) }
      try {
        this.child = spawn(process.execPath, [RELAY, BRIDGE], { stdio: ['pipe', 'pipe', 'pipe'] })
      } catch (e) {
        this.lastError = `启动手机通道失败：${e?.message || e}`
        finish(false)
        return
      }
      const child = this.child
      child.stdout.on('data', (d) => this.#onData(d))
      child.stderr.on('data', (d) => {
        const s = String(d)
        if (s.trim()) this.lastError = s.slice(0, 300)
      })
      child.on('exit', () => {
        this.ready = false
        this.child = null
        for (const p of this.pending.values()) p.reject(new Error('手机通道已断开'))
        this.pending.clear()
      })
      child.on('error', (e) => { this.lastError = String(e?.message || e) })
      this.#call('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'local-fishy-jarvis', version: '1.0' },
      }, 10000).then(() => {
        this.#send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })
        this.ready = true
        finish(true)
      }).catch((e) => {
        this.lastError = `连不上手机操控：${String(e?.message || e).slice(0, 200)}`
        try { child.kill() } catch { /* 忽略 */ }
        finish(false)
      })
    }).finally(() => { this.connecting = null })
    return this.connecting
  }

  #send(msg) {
    try { this.child?.stdin.write(JSON.stringify(msg) + '\n') } catch { /* 断线由 exit 处理 */ }
  }

  #onData(d) {
    this.buf += String(d)
    let idx
    while ((idx = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, idx).trim()
      this.buf = this.buf.slice(idx + 1)
      if (!line) continue
      let msg
      try { msg = JSON.parse(line) } catch { continue }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)))
        else p.resolve(msg.result)
      }
    }
  }

  #call(method, params, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const id = ++this.seq
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('手机通道超时'))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v) },
        reject: (e) => { clearTimeout(timer); reject(e) },
      })
      this.#send({ jsonrpc: '2.0', id, method, params })
    })
  }

  /** 调一个手机操控工具，返回 { ok, text } */
  async tool(name, args = {}, timeoutMs = 60000) {
    const ok = await this.connect()
    if (!ok) return { ok: false, text: this.lastError || '手机操控通道没连上（先打开 dsh-go 的手机操控）' }
    try {
      const r = await this.#call('tools/call', { name, arguments: args }, timeoutMs)
      const text = (r?.content || []).filter((c) => c?.type === 'text').map((c) => c.text).join('\n')
      if (r?.isError) this.lastError = text.slice(0, 300)
      return { ok: r?.isError !== true, text }
    } catch (e) {
      this.lastError = String(e?.message || e)
      return { ok: false, text: `手机操控失败：${this.lastError}` }
    }
  }

  /** 读一屏（记住屏幕号，后续点按/输入要用） */
  async screen() {
    const r = await this.tool('screen', {})
    const parsed = parseScreen(r.text)
    if (r.ok && parsed.screen) {
      this.lastScreen = parsed.screen
      this.lastText = parsed.text
      this.lastNodes = parsed.nodes
      this.lastAction = '读了一屏'
    }
    return { ...r, ...parsed }
  }

  async tap(id) {
    if (!this.lastScreen) {
      const s = await this.screen()
      if (!s.ok) return { ok: false, text: s.text }
    }
    const r = await this.tool('tap', { screen: this.lastScreen, id: Number(id) })
    if (r.ok) this.lastAction = `点了 [${id}]`
    return r
  }

  async type({ id, text }) {
    if (!this.lastScreen) {
      const s = await this.screen()
      if (!s.ok) return { ok: false, text: s.text }
    }
    const r = await this.tool('type', { screen: this.lastScreen, id: Number(id), text: String(text ?? ''), submit: false })
    if (r.ok) this.lastAction = '输入了文字'
    return r
  }

  async scroll(direction = 'down', id) {
    if (!this.lastScreen) {
      const s = await this.screen()
      if (!s.ok) return { ok: false, text: s.text }
    }
    const dir = ['up', 'down', 'left', 'right'].includes(direction) ? direction : 'down'
    const args = { screen: this.lastScreen, direction: dir }
    if (id !== undefined && id !== null) args.id = Number(id)
    const r = await this.tool('scroll', args)
    if (r.ok) this.lastAction = `滑了${dir}`
    return r
  }

  async key(name) {
    const map = { back: 'back', home: 'home', recents: 'recents', notifications: 'notifications' }
    const k = map[String(name)] || 'back'
    const args = { key: k }
    if (this.lastScreen) args.screen = this.lastScreen
    const r = await this.tool('key', args)
    if (r.ok) this.lastAction = `按了${k}`
    return r
  }

  async open(app) {
    const r = await this.tool('open', { app: String(app) })
    if (r.ok) this.lastAction = `打开${app}`
    return r
  }

  /** 等屏幕变化：一直读屏轮询，文本变了算成功 */
  async waitChange(limitMs = 5000) {
    const limit = Math.min(20000, Math.max(500, Number(limitMs) || 5000))
    const before = this.lastText
    const t0 = Date.now()
    while (Date.now() - t0 < limit) {
      await new Promise((r) => setTimeout(r, 400))
      const s = await this.screen()
      if (s.ok && s.text !== before) return { changed: true, waitedMs: Date.now() - t0, text: s.text }
    }
    return { changed: false, waitedMs: limit, text: this.lastText }
  }

  async online() {
    const ok = await this.connect()
    return { ok, error: ok ? '' : this.lastError }
  }
}
