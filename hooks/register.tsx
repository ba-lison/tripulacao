import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BossStatus, CrewMember, CrewStatus } from '../types'
import { SCENE, charOf, crab, kingScene, pickChar } from './crab'
import type { Aside, Eyes } from './crab'

const TICK_MS = 4000
const BAND_LINGER_MS = 6000 // a finished subagent stays in the band this long
const KEEP = 30 // members the crew remembers
const LOG_SIZE = 8

const crew = atom({ plugin: 'tripulacao', key: 'crew' } as const, [] as CrewMember[])
const nowAt = atom({ plugin: 'tripulacao', key: 'now' } as const, 0)
const bandFolded = atom({ plugin: 'tripulacao', key: 'bandFolded' } as const, false)
const boss = atom({ plugin: 'tripulacao', key: 'boss' } as const, 'idle' as BossStatus)

// Tools that wait on the person: a question to answer, a plan to approve.
const ASKS = new Set(['AskUserQuestion', 'ExitPlanMode'])

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

function pctOf(m: CrewMember): number {
  return Math.min(100, Math.round((m.tokens / m.window) * 100))
}

function elapsed(m: CrewMember, now: number): number {
  return (m.endedAt ?? Math.max(now, m.startedAt)) - m.startedAt
}

function ativos(n: number): string {
  return `${n} ${n === 1 ? 'ativo' : 'ativos'}`
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

// What the band says a member is doing now.
function activity(m: CrewMember): string {
  return m.tool === null ? m.target : `${m.tool} ${m.target}`.trim()
}

/* ---------------- state ---------------- */

// The time a drawing shows: the clock itself, so a redraw is never stale; reading the
// tick's atom subscribes the drawing to it, so the timers still move on their own.
async function drawnAt($: EngineInterface): Promise<number> {
  const [ticked, at] = await Promise.all([read($, nowAt), $.clock.now()])
  return Math.max(ticked, at)
}

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

// The band's stop button: TaskStop ends the subagent's task, as the model would.
async function stopMember($: EngineInterface, id: string) {
  await patch($, id, m => (m.endedAt === null ? { ...m, tool: null, target: 'Parando…' } : m))
  try {
    await $.tool.call({ tool: 'TaskStop', task_id: id })
  } catch (err) {
    await patch($, id, m => (m.endedAt === null ? { ...m, target: 'Não parou' } : m))
    await $.ui.toast(`Tripulação: não consegui parar o subagente (${err instanceof Error ? err.message : String(err)})`)
    return
  }
  const at = await $.clock.now()
  await patch($, id, m => (m.endedAt === null ? { ...m, status: 'error', endedAt: at, tool: null, target: 'Interrompido' } : m))
  await update($, nowAt, () => at)
}

// The main session's status, from the same events the crew's come from. Writes only on a
// change and never throws: the king is decoration, and must not touch the turn or its tools.
async function setBoss($: EngineInterface, fn: (s: BossStatus) => BossStatus) {
  try {
    const was = await read($, boss)
    const next = fn(was)
    if (next !== was) await update($, boss, () => next)
  } catch {
    // nothing to undo
  }
}

// How the Rei Clawd looks in each status: the crew's eyes, plus what hovers beside him.
const BOSS_LOOK: Record<BossStatus, { label: string; eyes: Eyes; isWalking: boolean; aside: Aside }> = {
  idle: { label: 'à toa', eyes: 'normal', isWalking: false, aside: null },
  thinking: { label: 'pensando', eyes: 'closed', isWalking: false, aside: 'thought' },
  working: { label: 'trabalhando', eyes: 'normal', isWalking: true, aside: 'sparks' },
  asking: { label: 'esperando sua resposta', eyes: 'normal', isWalking: false, aside: 'question' },
  waiting: { label: 'aguardando', eyes: 'closed', isWalking: false, aside: null },
  done: { label: 'concluído', eyes: 'happy', isWalking: false, aside: null },
  error: { label: 'interrompido', eyes: 'x', isWalking: false, aside: null },
}

/* ---------------- SVG pieces ---------------- */

function svgDoc(width: number, height: number, inner: string): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"`,
    ` font-family="${SANS}" font-size="13" style="font-variant-numeric:tabular-nums">`,
    inner,
    '</svg>',
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

/* ---------------- band: one row per member ---------------- */

function bandRows(list: readonly CrewMember[], now: number): CrewMember[] {
  return list.filter(m => m.endedAt === null || now - m.endedAt < BAND_LINGER_MS)
}

// A row's crab and its context bar, each its own small SVG, so the animations survive the text band.
// Recorte quadrado centrado no corpo do caranguejo (grade x 3–14, y 0–13), com folga para acessórios.
const crabIcon = (m: CrewMember): string =>
  [
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 -2 18 18" overflow="hidden">',
    // Parado na faixa: o pulinho do andar empurrava o desenho para fora do quadro.
    crab(charOf(m.charId), 0, 0, 1, false, STATUS[m.status].eyes),
    '</svg>',
  ].join('')
const barIcon = (m: CrewMember, i: number): string => svgDoc(140, 12, hairline(`r${i}`, 0, 6, 140, barPct(m), charOf(m.charId).color))

/* ---------------- the hooks ---------------- */

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
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

  // A subagent starts: it joins the crew with a character of its own.
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
    return started
  }).catch(($, e, next) => next(e))

  // Each model request of a subagent: thinking while it runs, its context size once answered.
  on('turn.step', async function* ($, e, next) {
    const id = e.agentId
    if (id === undefined) {
      // The main session: thinking while its request runs, unless a question still holds it.
      await setBoss($, s => (s === 'asking' ? s : 'thinking'))
      return yield* next(e)
    }
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
      return next(e)
    }
    // The main session: working, or asking while a question or a plan waits on the person.
    if (!ASKS.has(String(e.tool))) {
      await setBoss($, () => 'working')
      return next(e)
    }
    await setBoss($, () => 'asking')
    const answered = await next(e)
    await setBoss($, () => 'working')
    return answered
  }).catch(($, e, next) => next(e))

  // A subagent's turn ends: done when it answered, an error otherwise. A background
  // subagent ends its turn while it holds on work it started, and resumes under the
  // same id: then it is waiting, not done, and its next turn picks it up again.
  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (id !== undefined) {
      const at = await $.clock.now()
      const info = await $.agent.list().then(all => all.find(a => a.id === id), () => undefined)
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
    } else {
      await setBoss($, () => (e.reason === 'answer' ? 'done' : 'error'))
    }
    return next(e)
  })

  /* ----- the band: rows under the usage-hud card ----- */
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const list = await read($, crew)
    const now = await drawnAt($)
    const rows = bandRows(list, now)
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    // In the text rows, each crab and bar is a small SVG of its own: they keep their animation at their own size.
    const Icon = e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : undefined
    if (rows.length === 0 && !Icon) return next(e)

    // What the plugins beneath draw (the usage-hud's card) stays on top, the Rei Clawd at its left.
    const beneath = await next(e)
    const look = BOSS_LOOK[await read($, boss)]
    const below = Icon ? (
      <Box flexDirection="row" alignItems="center">
        <Box flexShrink={0} marginRight={1}>
          <Icon source={kingScene(look.isWalking, look.eyes, look.aside)} alt={`Rei Clawd ${look.label}`} width={SCENE.width} height={SCENE.height} />
        </Box>
        <Box flexGrow={1} flexShrink={1} flexDirection="column">{beneath}</Box>
      </Box>
    ) : beneath
    if (rows.length === 0) return below
    const isFolded = await read($, bandFolded)
    const foldBand = (
      <Button
        key="fold-band"
        label={isFolded ? '▸ Mostrar' : '▾ Ocultar'}
        variant="secondary"
        plain
        dimColor
        onPress={() => void update($, bandFolded, v => !v)}
      />
    )

    const cells = 14
    const active = list.filter(m => m.endedAt === null).length
    return (
      <Box flexDirection="column">
        {below}
        <Box flexDirection="column" paddingX={1}>
          <Box flexDirection="row">
            <Box flexGrow={1}>
              <Text color="subtle">
                Subagentes · {ativos(active)} · {formatTokens(list.reduce((s, m) => s + m.tokens, 0))} tokens
              </Text>
            </Box>
            {foldBand}
          </Box>
          {!isFolded && rows.map((m, i) => {
            const c = charOf(m.charId)
            const st = STATUS[m.status]
            const n = Math.round((barPct(m) / 100) * cells)
            return (
              <Box key={`band:${m.id}`} flexDirection="row" alignItems="center" marginTop={1}>
                {Icon ? (
                  <Box flexShrink={0} width={3} alignItems="center"><Icon source={crabIcon(m)} alt={c.name} width={18} height={18} /></Box>
                ) : (
                  <Box width={2} flexShrink={0}><Text color={c.color}>■</Text></Box>
                )}
                <Box width={10} flexShrink={0}><Text color="subtle" wrap="truncate-end">{c.name}</Text></Box>
                <Box width={9} flexShrink={0}><Text color={modelColor(m.model)}>{m.model}</Text></Box>
                {Icon ? (
                  <Box flexShrink={0}><Icon source={barIcon(m, i)} alt={`${pctOf(m)}% do contexto`} /></Box>
                ) : (
                  <Box flexShrink={0}>
                    <Text color={c.color}>{'━'.repeat(n)}</Text>
                    <Text color="inactive">{'─'.repeat(cells - n)}</Text>
                  </Box>
                )}
                <Box width={7} flexShrink={0} justifyContent="flex-end"><Text>{formatTokens(m.tokens)}</Text></Box>
                <Box flexShrink={0} marginLeft={1}>
                  <Text color="subtle">{`${pctOf(m)}% · ${formatTime(elapsed(m, now))} ·`}</Text>
                </Box>
                {/* Texto de um nível só e cortado: o Text aninhado quebrava a faixa em duas linhas. */}
                <Box flexGrow={1} flexShrink={1} marginLeft={1} overflow="hidden">
                  <Text color={m.status === 'working' ? 'subtle' : st.color} wrap="truncate-end">
                    {cut(activity(m) || st.label, 32)}
                  </Text>
                </Box>
                {m.endedAt === null && (
                  <Box flexShrink={0} marginLeft={1}>
                    <Button key={`stop:${m.id}`} label="■ Parar" plain dimColor onPress={() => void stopMember($, m.id)} />
                  </Box>
                )}
              </Box>
            )
          })}
        </Box>
      </Box>
    )
  })
}
