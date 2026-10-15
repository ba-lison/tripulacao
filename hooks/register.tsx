import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CrewMember, CrewStatus } from '../types'
import { BOSS, charOf, crab, pickChar } from './crab'
import type { Eyes } from './crab'

const PANE = 'tripulacao'
const TICK_MS = 4000
const BAND_LINGER_MS = 6000 // a finished subagent stays in the band this long
const KEEP = 30 // members the pane remembers
// The band as an SVG came out too small in the app, so it draws as text rows at the app's size.
const BAND_AS_SVG = false
const LOG_SIZE = 8

const crew = atom({ plugin: 'tripulacao', key: 'crew' } as const, [] as CrewMember[])
const nowAt = atom({ plugin: 'tripulacao', key: 'now' } as const, 0)
const unfolded = atom({ plugin: 'tripulacao', key: 'unfolded' } as const, [] as string[])
const paneFolded = atom({ plugin: 'tripulacao', key: 'paneFolded' } as const, false)
const bandFolded = atom({ plugin: 'tripulacao', key: 'bandFolded' } as const, false)

// The usage-hud card's palette, so the two read as one family.
const INK = {
  card: '#151517',
  tile: '#1c1c1f',
  border: '#2a2a2d',
  hair: 'rgba(255,255,255,.07)',
  label: '#7c7c82',
  figure: '#f2f2f5',
  detail: '#85858b',
  faded: '#6e6e73',
  sep: '#3f3f44',
  name: '#a1a1a6',
  coral: '#e07a5f',
} as const

const STATUS: Record<CrewStatus, { label: string; color: string; eyes: Eyes }> = {
  working: { label: 'Trabalhando', color: '#e07a5f', eyes: 'normal' },
  thinking: { label: 'Pensando', color: '#5aa7e8', eyes: 'closed' },
  waiting: { label: 'Aguardando', color: '#e0b04a', eyes: 'closed' },
  done:{ label: 'Concluído', color: '#a3e635', eyes: 'happy' },
  error: { label: 'Erro', color: '#e5484d', eyes: 'x' },
}

const MODEL_COLOR: Record<string, string> = {
  Opus: '#c4a1ff',
  Sonnet: '#5aa7e8',
  Haiku: '#a3e635',
  Fable: '#f0b35a',
}

const SHORT_TYPE: Record<string, string> = {
  'general-purpose': 'general',
  'security-review': 'security',
  'code-review': 'review',
  'claude-code-guide': 'guide',
  'statusline-setup': 'statusline',
}

const SANS = `Inter, -apple-system, 'Segoe UI', system-ui, sans-serif`
const MONO = `'JetBrains Mono', 'Cascadia Mono', Consolas, ui-monospace, monospace`

/* ---------------- figures ---------------- */

// `claude-opus-5-5` → `Opus 5.5`; an alias (`haiku`) → `Haiku`.
export function prettyModel(id: string): string {
  const m = /(opus|sonnet|haiku|fable)(?:[-_ ]?(\d+)(?:[-.](\d{1,2})(?!\d))?)?/i.exec(id)
  if (m === null) return id.replace(/^claude-/, '')
  const family = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1).toLowerCase()
  if (m[2] === undefined) return family
  return m[3] === undefined ? `${family} ${m[2]}` : `${family} ${m[2]}.${m[3]}`
}

function windowOf(model: string): number {
  return /\[1m\]|-1m\b/i.test(model) ? 1_000_000 : 200_000
}

function modelColor(model: string): string {
  return MODEL_COLOR[model.split(' ')[0] ?? ''] ?? INK.name
}

function shortType(type: string): string {
  return SHORT_TYPE[type] ?? type.split(':').pop() ?? type
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return `${Math.round(n)}`
}

function formatTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const hh = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`
}

function clock(at: number): string {
  const d = new Date(at)
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(v => String(v).padStart(2, '0')).join(':')
}

function pctOf(m: CrewMember): number {
  return Math.min(100, Math.round((m.tokens / m.window) * 100))
}

function elapsed(m: CrewMember, now: number): number {
  return (m.endedAt ?? Math.max(now, m.startedAt)) - m.startedAt
}

function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text
}

function shortPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.length > 3 ? `…/${parts.slice(-3).join('/')}` : parts.join('/')
}

// What a tool call points at, in a few words: the file, the command, the pattern.
export function targetOf(tool: string, input: Readonly<Record<string, unknown>>): string {
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  switch (tool) {
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return shortPath(s('file_path') || s('notebook_path'))
    case 'Bash':
    case 'PowerShell':
      return (s('description') || s('command')).split('\n')[0] ?? ''
    case 'Grep':
      return `"${s('pattern')}"${s('path') ? ` em ${shortPath(s('path'))}` : ''}`
    case 'Glob':
      return s('pattern')
    case 'WebFetch':
      try {
        return new URL(s('url')).host
      } catch {
        return s('url')
      }
    case 'WebSearch':
      return s('query')
    default:
      return s('description') || s('query') || s('pattern') || s('file_path')
  }
}

// What the band and the pane say a member is doing now.
function activity(m: CrewMember): string {
  return m.tool === null ? m.target : `${m.tool} ${m.target}`.trim()
}

/* ---------------- state ---------------- */

async function stamp($: EngineInterface) {
  const at = await $.clock.now()
  await update($, nowAt, () => at)
}

// Changes one member, if the crew has it; writes nothing otherwise.
async function patch($: EngineInterface, id: string, fn: (m: CrewMember) => CrewMember) {
  const list = await read($, crew)
  if (!list.some(m => m.id === id)) return
  await update($, crew, all => all.map(m => (m.id === id ? fn(m) : m)))
}

async function openPane($: EngineInterface) {
  const panes = await $.ui.panes()
  if (!panes.some(p => p.id === PANE)) await $.ui.open({ id: PANE, title: 'Tripulação' })
}

/* ---------------- SVG pieces ---------------- */

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Text widths, near enough to place chips beside a name.
const sansW = (t: string, px: number) => t.length * px * 0.56
const monoW = (t: string, px: number) => t.length * px * 0.6

function svgDoc(width: number, height: number, inner: string): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"`,
    ` font-family="${SANS}" font-size="13" style="font-variant-numeric:tabular-nums">`,
    inner,
    '</svg>',
  ].join('')
}

function modelChip(model: string, x: number, cy: number): { svg: string; width: number } {
  const color = modelColor(model)
  const width = monoW(model, 10.5) + 20
  const svg = [
    `<rect x="${x}" y="${cy - 8}" width="${width}" height="16" rx="5" fill="${color}" fill-opacity=".13"/>`,
    `<circle cx="${x + 8}" cy="${cy}" r="2.5" fill="${color}"/>`,
    `<text x="${x + 14}" y="${cy}" dominant-baseline="central" font-family="${MONO}" font-size="10.5" font-weight="500" fill="${color}">${esc(model)}</text>`,
  ].join('')
  return { svg, width }
}

function chip(text: string, x: number, cy: number): { svg: string; width: number } {
  const width = monoW(text, 10.5) + 12
  const svg = [
    `<rect x="${x}" y="${cy - 8}" width="${width}" height="16" rx="5" fill="#ffffff" fill-opacity=".06"/>`,
    `<text x="${x + 6}" y="${cy}" dominant-baseline="central" font-family="${MONO}" font-size="10.5" font-weight="500" fill="${INK.detail}">${esc(text)}</text>`,
  ].join('')
  return { svg, width }
}

// The status pill, always the same width so a change of state moves nothing.
const PILL_W = 92
function pill(status: CrewStatus, x: number, cy: number): string {
  const { label, color } = STATUS[status]
  const isLive = status === 'working' || status === 'thinking'
  const halo = isLive
    ? `<circle cx="${x + 12}" cy="${cy}" r="3" fill="none" stroke="${color}"><animate attributeName="r" values="3;7" dur="1.2s" repeatCount="indefinite"/><animate attributeName="opacity" values=".8;0" dur="1.2s" repeatCount="indefinite"/></circle>`
    : ''
  return [
    `<rect x="${x}" y="${cy - 10}" width="${PILL_W}" height="20" rx="10" fill="#ffffff" fill-opacity=".05"/>`,
    halo,
    `<circle cx="${x + 12}" cy="${cy}" r="3" fill="${color}"/>`,
    `<text x="${x + 21}" y="${cy}" dominant-baseline="central" font-size="11" font-weight="500" fill="${color}">${label}</text>`,
  ].join('')
}

// A hairline bar with a glowing dot at its tip, as the usage-hud draws its gauges.
function hairline(id: string, x: number, cy: number, width: number, pct: number, color: string): string {
  const w = (Math.min(Math.max(pct, 0), 100) / 100) * width
  const tip = w > 0
    ? `<circle cx="${x + w}" cy="${cy}" r="5" fill="${color}" opacity=".5" filter="url(#${id}-glow)"/><circle cx="${x + w}" cy="${cy}" r="2.5" fill="${color}"/>`
    : ''
  return [
    `<linearGradient id="${id}-fill" x1="0" x2="1"><stop offset="0" stop-color="${color}" stop-opacity=".4"/><stop offset="1" stop-color="${color}"/></linearGradient>`,
    `<filter id="${id}-glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="3"/></filter>`,
    `<rect x="${x}" y="${cy - 1}" width="${width}" height="2" rx="1" fill="${INK.hair}"/>`,
    `<rect x="${x}" y="${cy - 1}" width="${w}" height="2" rx="1" fill="url(#${id}-fill)"/>`,
    tip,
  ].join('')
}

// The bar is the share of the context window in use, so it grows as the subagent's context grows.
const barPct = (m: CrewMember) => Math.min(100, (m.tokens / m.window) * 100)

/* ---------------- pane: one card per member ---------------- */

const CARD_W = 380
const CARD_H = 138

function cardSvg(m: CrewMember, now: number, isOpen: boolean): string {
  const c = charOf(m.charId)
  const st = STATUS[m.status]
  const sid = `c${m.id.replace(/[^a-zA-Z0-9]/g, '').slice(-10)}`
  const isLive = m.status === 'working' || m.status === 'thinking'
  const logLines = isOpen ? Math.max(1, m.log.length) : 0
  const H = CARD_H + (isOpen ? 14 + logLines * 17 : 0)
  const parts: string[] = []

  parts.push(`<rect x=".5" y=".5" width="${CARD_W - 1}" height="${H - 1}" rx="12" fill="${INK.card}" stroke="${isLive ? c.color : INK.border}" stroke-opacity="${isLive ? 0.45 : 1}"/>`)
  // avatar
  parts.push(`<rect x="12" y="12" width="44" height="44" rx="10" fill="${INK.tile}" stroke="${INK.border}"/>`)
  parts.push(`<circle cx="34" cy="40" r="18" fill="${c.color}" fill-opacity=".16"/>`)
  // The crab's body is centred on the circle (34, 40): its top row sits inside it, not above.
  parts.push(crab(c, 17, 24, 2, m.status === 'working', st.eyes))
  // name · type · model ................ status
  const nameW = sansW(c.name, 13.5) + 4
  parts.push(`<text x="66" y="26" dominant-baseline="central" font-size="13.5" font-weight="600" fill="${INK.figure}">${esc(c.name)}</text>`)
  const type = chip(shortType(m.type), 66 + nameW + 4, 26)
  parts.push(type.svg)
  parts.push(modelChip(m.model, 66 + nameW + 4 + type.width + 5, 26).svg)
  parts.push(pill(m.status, CARD_W - 12 - PILL_W, 26))
  // what it was asked
  parts.push(`<text x="66" y="46" dominant-baseline="central" font-size="12" fill="${INK.detail}">${esc(cut(m.description, 44))}</text>`)
  // what it is doing now
  const toolLabel = m.tool ?? (m.status === 'thinking' ? '···' : m.status === 'done' ? '✓' : m.status === 'error' ? '✗' : '···')
  const toolColor = m.tool !== null ? c.color : st.color
  const toolW = monoW(toolLabel, 11) + 12
  parts.push(`<rect x="12" y="70" width="${toolW}" height="18" rx="5" fill="${toolColor}" fill-opacity=".14"/>`)
  parts.push(`<text x="18" y="79" dominant-baseline="central" font-family="${MONO}" font-size="11" font-weight="500" fill="${toolColor}">${esc(toolLabel)}</text>`)
  const target = cut(m.tool === null && m.status === 'thinking' && m.target === '' ? 'Pensando…' : m.target, Math.floor((CARD_W - 30 - toolW) / 7.2))
  parts.push(`<text x="${18 + toolW}" y="79" dominant-baseline="central" font-family="${MONO}" font-size="12" fill="${INK.detail}">${esc(target)}</text>`)
  // metrics
  const label = (x: number, t: string) => `<text x="${x}" y="104" font-size="10.5" fill="${INK.label}">${t}</text>`
  const figure = (x: number, t: string) => `<text x="${x}" y="122" font-size="14" font-weight="600" fill="${INK.figure}">${t}</text>`
  parts.push(label(12, 'Tokens'), figure(12, formatTokens(m.tokens)))
  parts.push(`<text x="${12 + sansW(formatTokens(m.tokens), 14) + 8}" y="122" font-size="11" fill="${INK.faded}">${pctOf(m)}% ctx</text>`)
  parts.push(hairline(sid, 12, 130, 160, barPct(m), c.color))
  parts.push(label(200, 'Tempo'), figure(200, formatTime(elapsed(m, now))))
  parts.push(label(290, 'Ferramentas'), figure(290, String(m.tools)))
  // the tool history, unfolded
  if (isOpen) {
    parts.push(`<line x1="12" x2="${CARD_W - 12}" y1="${CARD_H + 2}" y2="${CARD_H + 2}" stroke="${INK.border}"/>`)
    const lines = m.log.length === 0 ? [{ at: 0, tool: '', target: 'Ainda sem ferramentas' }] : m.log
    lines.forEach((l, i) => {
      const y = CARD_H + 20 + i * 17
      const time = l.at === 0 ? '' : clock(l.at)
      parts.push(
        `<text x="12" y="${y}" font-family="${MONO}" font-size="11.5"><tspan fill="${INK.sep}">${time}</tspan>` +
          `<tspan fill="${INK.detail}" dx="8">${esc(l.tool)}</tspan><tspan fill="${INK.faded}" dx="8">${esc(cut(l.target, 34))}</tspan></text>`,
      )
    })
  }
  return svgDoc(CARD_W, H, parts.join(''))
}

function headSvg(list: readonly CrewMember[], now: number): string {
  const active = list.filter(m => m.endedAt === null)
  const tokens = list.reduce((s, m) => s + m.tokens, 0)
  const longest = active.length > 0 ? Math.max(...active.map(m => elapsed(m, now))) : 0
  const parts: string[] = []
  parts.push(crab(BOSS, 0, 0, 1.4, false, 'normal'))
  parts.push(`<text x="32" y="12" dominant-baseline="central" font-size="15" font-weight="600" fill="${INK.figure}">Tripulação</text>`)
  const badgeX = 32 + sansW('Tripulação', 15) + 8
  const n = String(active.length)
  parts.push(`<rect x="${badgeX}" y="3" width="${monoW(n, 11) + 12}" height="18" rx="5" fill="${INK.coral}"/>`)
  parts.push(`<text x="${badgeX + 6}" y="12" dominant-baseline="central" font-family="${MONO}" font-size="11" font-weight="600" fill="#0c0c0e">${n}</text>`)
  const tiles: [string, string][] = [
    ['ATIVOS', String(active.length)],
    ['TOKENS', formatTokens(tokens)],
    ['TEMPO', formatTime(longest)],
  ]
  const tw = (CARD_W - 16) / 3
  tiles.forEach(([k, v], i) => {
    const x = i * (tw + 8)
    parts.push(`<rect x="${x + 0.5}" y="32.5" width="${tw - 1}" height="49" rx="10" fill="${INK.card}" stroke="${INK.border}"/>`)
    parts.push(`<text x="${x + 10}" y="50" font-size="10" letter-spacing=".6" fill="${INK.label}">${k}</text>`)
    parts.push(`<text x="${x + 10}" y="71" font-size="16" font-weight="600" fill="${INK.figure}">${v}</text>`)
  })
  return svgDoc(CARD_W, 84, parts.join(''))
}

/* ---------------- band: one row per member ---------------- */

const BAND = { width: 640, head: 22, row: 30, name: 26, model: 124, bar: 214, barW: 140, fig: 366, detail: 414 } as const

function bandSvg(rows: readonly CrewMember[], all: readonly CrewMember[], now: number): string {
  const height = BAND.head + rows.length * BAND.row
  const active = all.filter(m => m.endedAt === null).length
  const tokens = all.reduce((s, m) => s + m.tokens, 0)
  const parts: string[] = []
  parts.push(`<text x="0" y="10" dominant-baseline="central" font-size="12" letter-spacing=".8" fill="${INK.label}">SUBAGENTES</text>`)
  parts.push(`<text x="${BAND.width}" y="10" text-anchor="end" dominant-baseline="central" font-family="${MONO}" font-size="12.5" fill="${INK.faded}">${active} ${active === 1 ? 'ativo' : 'ativos'} · ${formatTokens(tokens)} tokens</text>`)
  rows.forEach((m, i) => {
    const cy = BAND.head + i * BAND.row + BAND.row / 2
    const c = charOf(m.charId)
    const st = STATUS[m.status]
    parts.push(crab(c, 0, cy - 12, 1.4, m.status === 'working', st.eyes))
    parts.push(`<text x="${BAND.name}" y="${cy}" dominant-baseline="central" font-size="14" fill="${INK.name}">${esc(cut(c.name, 13))}</text>`)
    parts.push(modelChip(m.model, BAND.model, cy).svg)
    parts.push(hairline(`b${i}`, BAND.bar, cy, BAND.barW, barPct(m), c.color))
    parts.push(`<text x="${BAND.fig}" y="${cy}" dominant-baseline="central" font-weight="500" fill="${INK.figure}">${formatTokens(m.tokens)}</text>`)
    const what = cut(activity(m) || st.label, 30)
    parts.push(
      `<text x="${BAND.detail}" y="${cy}" dominant-baseline="central">` +
        `<tspan fill="${INK.figure}">${pctOf(m)}%</tspan><tspan fill="${INK.detail}"> ctx</tspan>` +
        `<tspan fill="${INK.sep}" dx="8">·</tspan><tspan fill="${INK.detail}" dx="8">${formatTime(elapsed(m, now))}</tspan>` +
        `<tspan fill="${INK.sep}" dx="8">·</tspan><tspan fill="${m.status === 'working' ? INK.detail : st.color}" dx="8">${esc(what)}</tspan></text>`,
    )
  })
  return svgDoc(BAND.width, height, parts.join(''))
}

function bandRows(list: readonly CrewMember[], now: number): CrewMember[] {
  return list.filter(m => m.endedAt === null || now - m.endedAt < BAND_LINGER_MS)
}

// A row's crab and its context bar, each its own small SVG, so the animations survive the text band.
const crabIcon = (m: CrewMember): string =>
  svgDoc(26, 22, crab(charOf(m.charId), 0, 0, 1.4, m.status === 'working', STATUS[m.status].eyes))
const barIcon = (m: CrewMember, i: number): string => svgDoc(140, 12, hairline(`r${i}`, 0, 6, 140, barPct(m), charOf(m.charId).color))

// The band folded: one line, its title, a crab per member and the totals.
function foldedBandSvg(rows: readonly CrewMember[], all: readonly CrewMember[]): string {
  const active = all.filter(m => m.endedAt === null).length
  const tokens = all.reduce((s, m) => s + m.tokens, 0)
  const parts: string[] = []
  parts.push(`<text x="0" y="10" dominant-baseline="central" font-size="10.5" letter-spacing=".8" fill="${INK.label}">SUBAGENTES</text>`)
  rows.slice(0, 12).forEach((m, i) => {
    parts.push(crab(charOf(m.charId), 84 + i * 22, 1, 1.1, m.status === 'working', STATUS[m.status].eyes))
  })
  parts.push(`<text x="${BAND.width}" y="10" text-anchor="end" dominant-baseline="central" font-family="${MONO}" font-size="11" fill="${INK.faded}">${active} ${active === 1 ? 'ativo' : 'ativos'} · ${formatTokens(tokens)} tokens</text>`)
  return svgDoc(BAND.width, 20, parts.join(''))
}

// The pane folded: one short row per member, under the head.
const ROW_H = 26
function compactSvg(list: readonly CrewMember[], now: number): string {
  const parts: string[] = []
  list.forEach((m, i) => {
    const cy = i * ROW_H + ROW_H / 2
    const c = charOf(m.charId)
    const st = STATUS[m.status]
    if (i > 0) parts.push(`<line x1="0" x2="${CARD_W}" y1="${i * ROW_H}" y2="${i * ROW_H}" stroke="${INK.border}" stroke-opacity=".6"/>`)
    parts.push(crab(c, 2, cy - 9, 1.15, m.status === 'working', st.eyes))
    parts.push(`<text x="28" y="${cy}" dominant-baseline="central" font-size="12.5" font-weight="600" fill="${INK.figure}">${esc(cut(c.name, 14))}</text>`)
    parts.push(modelChip(m.model, 132, cy).svg)
    parts.push(`<circle cx="230" cy="${cy}" r="3" fill="${st.color}"/>`)
    parts.push(`<text x="238" y="${cy}" dominant-baseline="central" font-size="11" fill="${st.color}">${st.label}</text>`)
    parts.push(`<text x="${CARD_W - 2}" y="${cy}" text-anchor="end" dominant-baseline="central" font-family="${MONO}" font-size="11" fill="${INK.detail}">${formatTime(elapsed(m, now))}</text>`)
  })
  return svgDoc(CARD_W, Math.max(ROW_H, list.length * ROW_H), parts.join(''))
}

/* ---------------- the hooks ---------------- */

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'tripulacao', description: 'Abre o painel da Tripulação, com os subagentes da sessão' })
    await stamp($)
    // The clock only moves while someone is working or has just finished,
    // so an idle session redraws nothing.
    $.clock.every(TICK_MS, () => {
      void (async () => {
        const list = await read($, crew)
        const at = await $.clock.now()
        if (list.some(m => m.endedAt === null || at - m.endedAt < BAND_LINGER_MS + TICK_MS)) await update($, nowAt, () => at)
      })()
    })
    return next(e)
  })

  on('command.run', { command: 'tripulacao' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Tripulação' })
    return { text: 'Painel da Tripulação aberto.' }
  })

  // A subagent starts: it joins the crew with a character of its own, and the pane opens.
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny !== undefined || started.agentId === undefined || e.isTeammate) return started
    const id = started.agentId
    const at = await $.clock.now()
    const model = prettyModel(started.model || e.model || e.parentModel)
    await update($, crew, list => {
      const busy = new Set(list.filter(m => m.endedAt === null).map(m => m.charId))
      const member: CrewMember = {
        id,
        charId: pickChar(e.subagentType, busy),
        type: e.subagentType,
        description: e.description,
        model,
        window: windowOf(started.model || e.parentModel),
        startedAt: at,
        endedAt: null,
        status: 'thinking',
        tool: null,
        target: 'Lendo a tarefa…',
        tools: 0,
        tokens: 0,
        log: [],
      }
      return [...list.filter(m => m.id !== id), member].slice(-KEEP)
    })
    await update($, nowAt, () => at)
    await openPane($)
    return started
  })

  // Each model request of a subagent: thinking while it runs, its context size once answered.
  on('turn.step', async function* ($, e, next) {
    const id = e.agentId
    if (id === undefined) return yield* next(e)
    await patch($, id, m => (m.endedAt === null ? { ...m, status: 'thinking', tool: null, target: 'Pensando…' } : m))
    const answered = yield* next(e)
    const usage = answered.usage
    if (usage !== null) {
      const tokens = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens + usage.output_tokens
      await patch($, id, m => ({ ...m, tokens, model: prettyModel(usage.model) || m.model }))
    }
    return answered
  })

  // Each tool a subagent runs: what it is doing now, and its history.
  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    if (id !== undefined) {
      const at = await $.clock.now()
      const tool = String(e.tool)
      const target = targetOf(tool, e as unknown as Record<string, unknown>)
      await patch($, id, m =>
        m.endedAt !== null
          ? m
          : { ...m, status: 'working', tool, target, tools: m.tools + 1, log: [{ at, tool, target }, ...m.log].slice(0, LOG_SIZE) },
      )
    }
    return next(e)
  })

  // A subagent's turn ends: done when it answered, an error otherwise. A background
  // subagent ends its turn while it holds on work it started, and resumes under the
  // same id: then it is waiting, not done, and its next turn picks it up again.
  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (id !== undefined) {
      const at = await $.clock.now()
      const info = (await $.agent.list()).find(a => a.id === id)
      if (info?.status === 'waiting' && e.reason === 'answer') {
        await patch($, id, m =>
          m.endedAt === null ? { ...m, status: 'waiting', tool: null, target: 'Aguardando trabalho em segundo plano' } : m,
        )
      } else {
        const isDone = e.reason === 'answer'
        const note = isDone ? 'Devolveu o resultado' : e.reason === 'aborted' ? 'Interrompido' : 'Falhou'
        await patch($, id, m => ({ ...m, status: isDone ? 'done' : 'error', endedAt: at, tool: null, target: note }))
      }
      await update($, nowAt, () => at)
    }
    return next(e)
  })

  /* ----- the pane ----- */
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    const Svg = e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : undefined
    const list = await read($, crew)
    const now = await read($, nowAt)
    const open = await read($, unfolded)

    const active = list.filter(m => m.endedAt === null)
    const done = list.filter(m => m.endedAt !== null).reverse()

    if (list.length === 0) {
      return (
        <Box flexDirection="column" paddingX={1}>
          <Text color={INK.detail}>Nenhum subagente ainda.</Text>
          <Text color={INK.faded}>O painel se enche sozinho quando um subagente é invocado.</Text>
        </Box>
      )
    }

    const toggle = (id: string) => () => void update($, unfolded, ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]))
    const clear = () => void update($, crew, all => all.filter(m => m.endedAt === null))

    const card = (m: CrewMember) => {
      const isOpen = open.includes(m.id)
      const c = charOf(m.charId)
      const st = STATUS[m.status]
      const fold = (
        <Button key={`log:${m.id}`} plain label={isOpen ? 'Ocultar histórico' : `Histórico (${m.log.length})`} onPress={toggle(m.id)} />
      )
      if (Svg) {
        return (
          <Box key={`card:${m.id}`} flexDirection="column">
            <Svg source={cardSvg(m, now, isOpen)} alt={`${c.name}, ${m.model}: ${st.label}. ${activity(m)}`} isInteractive />
            <Box flexDirection="row" justifyContent="flex-end">{fold}</Box>
          </Box>
        )
      }
      return (
        <Box key={`card:${m.id}`} flexDirection="column" marginBottom={1}>
          <Box flexDirection="row" gap={1}>
            <Text color={c.color} bold>{c.name}</Text>
            <Text color={INK.detail}>{shortType(m.type)}</Text>
            <Text color={modelColor(m.model)}>{m.model}</Text>
            <Box flexGrow={1} />
            <Text color={st.color}>● {st.label}</Text>
          </Box>
          <Text color={INK.faded} wrap="truncate-end">{m.description}</Text>
          <Text color={INK.detail} wrap="truncate-end">▸ {activity(m)}</Text>
          <Text color={INK.faded}>
            {formatTokens(m.tokens)} tokens ({pctOf(m)}% ctx) · {formatTime(elapsed(m, now))} · {m.tools} ferramentas
          </Text>
          {isOpen && m.log.map(l => (
            <Text color={INK.faded} wrap="truncate-end">  {clock(l.at)}  {l.tool} {l.target}</Text>
          ))}
          {fold}
        </Box>
      )
    }

    const isFolded = await read($, paneFolded)
    const foldPane = (
      <Button
        key="fold-pane"
        label={isFolded ? '▸ Expandir' : '▾ Recolher'}
        variant="secondary"
        onPress={() => void update($, paneFolded, v => !v)}
      />
    )
    const head = Svg ? (
      <Svg source={headSvg(list, now)} alt={`Tripulação: ${active.length} ativos`} />
    ) : (
      <Text color={INK.label}>
        {active.length} ativos · {formatTokens(list.reduce((s, m) => s + m.tokens, 0))} tokens
      </Text>
    )

    // Folded: the head and one short row per member, active first.
    if (isFolded) {
      const ordered = [...active, ...done]
      return (
        <Box flexDirection="column" gap={1}>
          {head}
          <Box flexDirection="row" justifyContent="flex-end">{foldPane}</Box>
          {Svg ? (
            <Svg source={compactSvg(ordered, now)} alt={ordered.map(m => `${charOf(m.charId).name}: ${STATUS[m.status].label}`).join('; ')} isInteractive />
          ) : (
            ordered.map(m => (
              <Box key={`row:${m.id}`} flexDirection="row" gap={1}>
                <Text color={charOf(m.charId).color}>{charOf(m.charId).name}</Text>
                <Text color={modelColor(m.model)}>{m.model}</Text>
                <Text color={STATUS[m.status].color}>● {STATUS[m.status].label}</Text>
                <Text color={INK.faded}>{formatTime(elapsed(m, now))}</Text>
              </Box>
            ))
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        {head}
        <Box flexDirection="row" justifyContent="flex-end">{foldPane}</Box>
        {active.map(card)}
        {done.length > 0 && (
          <Box flexDirection="row" justifyContent="space-between">
            <Text color={INK.faded}>CONCLUÍDOS · {done.length}</Text>
            <Button key="clear" plain label="Limpar" onPress={clear} />
          </Box>
        )}
        {done.map(card)}
      </Box>
    )
  })

  /* ----- the band: rows under the usage-hud card ----- */
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const list = await read($, crew)
    const now = await read($, nowAt)
    const rows = bandRows(list, now)
    if (rows.length === 0) return next(e)

    // What the plugins beneath draw (the usage-hud's card) stays on top.
    const below = await next(e)
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    const Svg = BAND_AS_SVG && e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : undefined
    // In the text rows, each crab and bar is a small SVG of its own: they keep their animation at their own size.
    const Icon = e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : undefined
    const isFolded = await read($, bandFolded)
    const foldBand = (
      <Button
        key="fold-band"
        label={isFolded ? '▸ Mostrar' : '▾ Ocultar'}
        variant="secondary"
        plain={Svg ? undefined : true}
        dimColor={Svg ? undefined : true}
        onPress={() => void update($, bandFolded, v => !v)}
      />
    )

    if (Svg) {
      const alt = rows.map(m => `${charOf(m.charId).name} (${m.model}): ${STATUS[m.status].label}`).join('; ')
      return (
        <Box flexDirection="column">
          {below}
          <Box
            marginTop={1}
            flexDirection="row"
            alignItems={isFolded ? 'center' : 'flex-start'}
            justifyContent="space-between"
            backgroundColor={INK.card}
            borderStyle="round"
            borderColor={INK.border}
            paddingX={1}
          >
            <Svg source={isFolded ? foldedBandSvg(rows, list) : bandSvg(rows, list, now)} alt={alt} isInteractive />
            <Box flexGrow={1} flexShrink={0} marginLeft={1} flexDirection="row" justifyContent="flex-end">
              {foldBand}
            </Box>
          </Box>
        </Box>
      )
    }

    const cells = 14
    const active = list.filter(m => m.endedAt === null).length
    return (
      <Box flexDirection="column">
        {below}
        <Box flexDirection="column" paddingX={1}>
          <Box flexDirection="row">
            <Box flexGrow={1}>
              <Text color="subtle">
                Subagentes · {active} {active === 1 ? 'ativo' : 'ativos'} · {formatTokens(list.reduce((s, m) => s + m.tokens, 0))} tokens
              </Text>
            </Box>
            {foldBand}
          </Box>
          {!isFolded && rows.map((m, i) => {
            const c = charOf(m.charId)
            const st = STATUS[m.status]
            const n = Math.round((barPct(m) / 100) * cells)
            return (
              <Box flexDirection="row" alignItems="center">
                {Icon ? (
                  <Box flexShrink={0}><Icon source={crabIcon(m)} alt={c.name} /></Box>
                ) : (
                  <Box width={2} flexShrink={0}><Text color={c.color}>■</Text></Box>
                )}
                <Box width={14} flexShrink={0}><Text color="subtle" wrap="truncate-end">{c.name}</Text></Box>
                <Box width={12} flexShrink={0}><Text color={modelColor(m.model)}>{m.model}</Text></Box>
                {Icon ? (
                  <Box flexShrink={0}><Icon source={barIcon(m, i)} alt={`${pctOf(m)}% do contexto`} /></Box>
                ) : (
                  <Box flexShrink={0}>
                    <Text color={c.color}>{'━'.repeat(n)}</Text>
                    <Text color="inactive">{'─'.repeat(cells - n)}</Text>
                  </Box>
                )}
                <Box width={7} flexShrink={0} justifyContent="flex-end"><Text>{formatTokens(m.tokens)}</Text></Box>
                <Box flexGrow={1} flexShrink={1} marginLeft={2}>
                  <Text color="subtle" wrap="truncate-end">
                    {pctOf(m)}% ctx · {formatTime(elapsed(m, now))} · <Text color={m.status === 'working' ? 'subtle' : st.color}>{activity(m) || st.label}</Text>
                  </Text>
                </Box>
              </Box>
            )
          })}
        </Box>
      </Box>
    )
  })
}
