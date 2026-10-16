import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CrewMember, CrewStatus, TodoStatus } from '../types'
import { CLAUDE, CLAUDE_ORANGE, CLAWD_LABEL, CLAWD_SIZE, baseColor, clawdSvg, miniClawd, toolKind } from './clawd'
import type { ClawdKind } from './clawd'

const TICK_MS = 4000
const BAND_LINGER_MS = 6000 // a finished subagent stays in the band this long
const KEEP = 30 // members the crew remembers
const LOG_SIZE = 8

const crew = atom({ plugin: 'tripulacao', key: 'crew' } as const, [] as CrewMember[])
const nowAt = atom({ plugin: 'tripulacao', key: 'now' } as const, 0)
const bandFolded = atom({ plugin: 'tripulacao', key: 'bandFolded' } as const, false)

const STATUS: Record<CrewStatus, { label: string; color: string }> = {
  working: { label: 'Trabalhando', color: '#e07a5f' },
  thinking: { label: 'Pensando', color: '#5aa7e8' },
  waiting: { label: 'Aguardando', color: '#e0b04a' },
  done: { label: 'Concluído', color: '#a3e635' },
  error: { label: 'Erro', color: '#e5484d' },
}

const SHORT_TYPE: Record<string, string> = {
  'general-purpose': 'general',
  'security-review': 'security',
  'code-review': 'review',
  'claude-code-guide': 'guide',
  'statusline-setup': 'statusline',
}

// Every current model runs in a million tokens, whatever its effort (Haiku 5.5 included);
// the older models below run in 200k. A model id marked `[1m]` runs in a million.
const CURRENT_WINDOW = 1_000_000
const OLD_WINDOW = 200_000
const OLD_MODEL = /haiku-[34]\b|haiku-4-5|sonnet-4-5|sonnet-4-\d{8}|sonnet-4$|-3-|claude-3/i
// The windows a subagent's context can outgrow a guess into.
const WINDOWS = [200_000, 500_000, 1_000_000, 2_000_000]

const BAR_WIDTH = 140

/* ---------------- figures ---------------- */

// `claude-opus-5-5` → `Opus 5.5`; an alias (`haiku`) → `Haiku`.
export function prettyModel(id: string): string {
  const m = /(opus|sonnet|haiku|fable)(?:[-_ ]?(\d+)(?:[-.](\d{1,2})(?!\d))?)?/i.exec(id)
  if (m === null) return id.replace(/^claude-/, '')
  const family = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1).toLowerCase()
  if (m[2] === undefined) return family
  return m[3] === undefined ? `${family} ${m[2]}` : `${family} ${m[2]}.${m[3]}`
}

// The context window a subagent runs in: `[1m]` says a million; the session's own model has the
// window the engine reports; another model a million, or 200k for an older one.
export function windowOf(model: string, parentModel: string, sessionWindow: number | undefined): number {
  if (/\[1m\]|-1m\b/i.test(model)) return 1_000_000
  if (sessionWindow !== undefined && prettyModel(model) === prettyModel(parentModel)) return sessionWindow
  return OLD_MODEL.test(model) ? OLD_WINDOW : CURRENT_WINDOW
}

// A context past the window it was given shows the guess was short: the next window up.
function grownWindow(window: number, tokens: number): number {
  return tokens <= window ? window : WINDOWS.find(w => w >= tokens) ?? tokens
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

// A window reads round: `1M`, `500k`, `200k`.
export function formatWindow(n: number): string {
  return n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`
}

function formatTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const hh = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`
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

// How far into its task a subagent is, in whole percent: from its task list (TaskCreate/TaskUpdate),
// else its todo list (TodoWrite or update_plan); an item under way counts half. 100 once it
// answered; null while it keeps no list, as nothing says how far it is.
export function progressOf(m: CrewMember): number | null {
  if (m.status === 'done') return 100
  const items: TodoStatus[] =
    m.tasks.length > 0 ? m.tasks.map(t => (t.isDone ? 'completed' : t.isActive ? 'in_progress' : 'pending')) : m.todos ?? []
  if (items.length === 0) return null
  const score = items.reduce((s, t) => s + (t === 'completed' ? 1 : t === 'in_progress' ? 0.5 : 0), 0)
  // Never 100 before it answers: the last item done still leaves its answer to write.
  return Math.min(99, Math.round((score / items.length) * 100))
}

function isTodoStatus(v: unknown): v is TodoStatus {
  return v === 'pending' || v === 'in_progress' || v === 'completed'
}

// The desktop app's list tool, as a subagent calls it: `mcp__ccd_turn__update_plan`.
export function isPlanTool(tool: string): boolean {
  return /^mcp__.*__update_plan$/.test(tool)
}

// A list after one update_plan call: `items` replaces it; `advance` completes the item under
// way and starts the next pending one; `done` (1-based) completes, `start` starts.
export function applyPlan(list: readonly TodoStatus[] | null, input: Readonly<Record<string, unknown>>): TodoStatus[] | null {
  let next: TodoStatus[] | null = list === null ? null : [...list]
  if (Array.isArray(input.items)) {
    next = (input.items as readonly { status?: unknown }[]).map(t => (isTodoStatus(t?.status) ? t.status : 'pending'))
  }
  if (next === null) return null
  if (input.advance === true) {
    const at = next.indexOf('in_progress')
    if (at >= 0) next[at] = 'completed'
    const after = next.indexOf('pending', Math.max(at, 0))
    if (after >= 0) next[after] = 'in_progress'
  }
  if (Array.isArray(input.done)) {
    for (const n of input.done) if (typeof n === 'number' && next[n - 1] !== undefined) next[n - 1] = 'completed'
  }
  if (typeof input.start === 'number' && next[input.start - 1] !== undefined) {
    next = next.map((s, i) => (i === (input.start as number) - 1 ? 'in_progress' : s === 'in_progress' ? 'pending' : s))
  }
  return next
}

// The Clawd's pose for a member: its tool's, as the usage-hud picks the king's.
export function kindOf(m: CrewMember): ClawdKind {
  switch (m.status) {
    case 'working':
      return m.tool === null ? 'trabalhando' : toolKind(m.tool)
    case 'thinking':
      return 'pensando'
    case 'waiting':
      return 'aguardando'
    case 'done':
      return 'concluido'
    case 'error':
      return m.outcome === 'aborted' ? 'interrompido' : 'erro'
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
  await patch($, id, m =>
    m.endedAt === null ? { ...m, status: 'error', outcome: 'aborted', endedAt: at, tool: null, target: 'Interrompido' } : m,
  )
  await update($, nowAt, () => at)
}

/* ---------------- SVG pieces ---------------- */

// The task bar, as the usage-hud draws its gauges: a hairline in Claude's orange with a mini
// Clawd walking at its tip, hopping while the subagent works.
function taskBar(id: string, pct: number, isHopping: boolean): string {
  const w = (Math.min(Math.max(pct, 0), 100) / 100) * BAR_WIDTH
  return [
    // 8 px past the bar's end and 10 above it: room for the mini Clawd at 100%.
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BAR_WIDTH + 8}" height="14" viewBox="0 -10 ${BAR_WIDTH + 8} 14">`,
    `<linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="${baseColor(CLAUDE_ORANGE, 0.45)}"/><stop offset="1" stop-color="${CLAUDE}"/></linearGradient>`,
    `<rect x="0" y="-1" width="${BAR_WIDTH}" height="2" rx="1" fill="#ffffff" fill-opacity=".07"/>`,
    `<rect x="0" y="-1" width="${w}" height="2" rx="1" fill="url(#${id})"/>`,
    `<g transform="translate(${Math.max(w, 8)} 0)">${miniClawd(CLAUDE, isHopping)}</g>`,
    '</svg>',
  ].join('')
}

/* ---------------- band: one row per member ---------------- */

function bandRows(list: readonly CrewMember[], now: number): CrewMember[] {
  return list.filter(m => m.endedAt === null || now - m.endedAt < BAND_LINGER_MS)
}

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

  // A subagent starts: it joins the crew, with its model's context window.
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny !== undefined || started.agentId === undefined || e.isTeammate) return started
    const id = started.agentId
    const at = await $.clock.now()
    const modelId = started.model || e.model || e.parentModel
    const sessionWindow = await $.session.usage().then(u => u.context.window, () => undefined)
    const member: CrewMember = {
      id,
      type: e.subagentType,
      description: e.description,
      model: prettyModel(modelId),
      window: windowOf(modelId, e.parentModel, sessionWindow),
      startedAt: at,
      endedAt: null,
      status: 'thinking',
      outcome: null,
      tool: null,
      target: 'Lendo a tarefa…',
      tools: 0,
      tokens: 0,
      todos: null,
      tasks: [],
      log: [],
    }
    await update($, crew, list => [...list.filter(m => m.id !== id), member].slice(-KEEP))
    await update($, nowAt, () => at)
    return started
  }).catch(($, e, next) => next(e))

  // Each model request of a subagent: thinking while it runs, its context size once answered.
  on('turn.step', async function* ($, e, next) {
    const id = e.agentId
    if (id === undefined) return yield* next(e)
    await patch($, id, m => (m.endedAt === null ? { ...m, status: 'thinking', tool: null, target: 'Pensando…' } : m))
    const answered = yield* next(e)
    const usage = answered.usage
    if (usage !== null) {
      const tokens = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens + usage.output_tokens
      await patch($, id, m => ({ ...m, tokens, window: grownWindow(m.window, tokens), model: prettyModel(usage.model) || m.model }))
    }
    return answered
  })

  // Each tool a subagent runs: what it is doing now, its history, and its task lists.
  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    if (id === undefined) return next(e)
    const at = await $.clock.now()
    const tool = String(e.tool)
    const input = e as unknown as Record<string, unknown>
    const target = targetOf(tool, input)
    await patch($, id, m =>
      m.endedAt !== null
        ? m
        : { ...m, status: 'working', tool, target, tools: m.tools + 1, log: [{ at, tool, target }, ...m.log].slice(0, LOG_SIZE) },
    )
    if (tool === 'TodoWrite' && Array.isArray(input.todos)) {
      const todos = input.todos as readonly { status?: unknown }[]
      await patch($, id, m => ({ ...m, todos: todos.map(t => (isTodoStatus(t?.status) ? t.status : 'pending')) }))
    }
    // The desktop app refuses update_plan in a subagent (it shows only the main list) and tells
    // it to stop calling it, so its progress would freeze at its first list. The band shows that
    // list, so the mod answers the call itself and the subagent keeps it up to date.
    if (isPlanTool(tool)) {
      await patch($, id, m => ({ ...m, todos: applyPlan(m.todos, input) }))
      return { result: 'Lista atualizada.' }
    }
    if (tool === 'TaskUpdate' && typeof input.taskId === 'string') {
      const taskId = input.taskId
      const status = input.status
      await patch($, id, m => ({
        ...m,
        tasks:
          status === 'deleted'
            ? m.tasks.filter(t => t.id !== taskId)
            : m.tasks.map(t =>
                t.id === taskId && typeof status === 'string' ? { ...t, isDone: status === 'completed', isActive: status === 'in_progress' } : t,
              ),
      }))
    }
    const done = await next(e)
    if (tool === 'TaskCreate') {
      const taskId = (done.result as { task?: { id?: unknown } } | undefined)?.task?.id
      if (typeof taskId === 'string') await patch($, id, m => ({ ...m, tasks: [...m.tasks, { id: taskId, isDone: false, isActive: false }] }))
    }
    return done
  }).catch(($, e, next) => next(e))

  // A subagent's turn ends: done when it answered, an error otherwise. A background
  // subagent ends its turn while it holds on work it started, and resumes under the
  // same id: then it is waiting, not done, and its next turn picks it up again.
  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (id === undefined) return next(e)
    const at = await $.clock.now()
    const info = await $.agent.list().then(all => all.find(a => a.id === id), () => undefined)
    if (info?.status === 'waiting' && e.reason === 'answer') {
      await patch($, id, m =>
        m.endedAt === null ? { ...m, status: 'waiting', tool: null, target: 'Aguardando trabalho em segundo plano' } : m,
      )
    } else {
      const outcome = e.reason === 'answer' ? 'answer' : e.reason === 'aborted' ? 'aborted' : 'error'
      const note = outcome === 'answer' ? 'Devolveu o resultado' : outcome === 'aborted' ? 'Interrompido' : 'Falhou'
      await patch($, id, m => ({ ...m, status: outcome === 'answer' ? 'done' : 'error', outcome, endedAt: at, tool: null, target: note }))
    }
    await update($, nowAt, () => at)
    return next(e)
  })

  /* ----- the band: rows under what the plugins beneath draw ----- */
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const list = await read($, crew)
    const now = await drawnAt($)
    const rows = bandRows(list, now)
    if (rows.length === 0) return next(e)
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    // In the text rows, each Clawd and bar is a small SVG of its own: they keep their animation at their own size.
    const Icon = e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : undefined

    const beneath = await next(e)
    const isFolded = await read($, bandFolded)
    const cells = 14
    const active = list.filter(m => m.endedAt === null).length
    // A button of its own at the right end of the header, apart from the header's text.
    const foldBand = (
      <Button
        key="fold-band"
        label={isFolded ? '▸ Mostrar' : '▾ Ocultar'}
        variant="secondary"
        onPress={() => void update($, bandFolded, v => !v)}
      />
    )

    return (
      <Box flexDirection="column">
        {beneath}
        {/* Uma linha de folga entre a faixa e o que vem acima (o usage-hud e seu botão). */}
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          <Box flexDirection="row" alignItems="center" justifyContent="space-between">
            <Box flexGrow={1} flexShrink={1}>
              <Text color="subtle" wrap="truncate-end">
                Subagentes · {ativos(active)} · {formatTokens(list.reduce((s, m) => s + m.tokens, 0))} tokens
              </Text>
            </Box>
            <Box flexShrink={0} marginLeft={1}>{foldBand}</Box>
          </Box>
          {!isFolded && rows.map((m, i) => {
            const st = STATUS[m.status]
            const kind = kindOf(m)
            const shown = progressOf(m)
            const pct = shown ?? 0
            const n = Math.round((pct / 100) * cells)
            return (
              <Box key={`band:${m.id}`} flexDirection="row" alignItems="center" marginTop={1}>
                {Icon ? (
                  <Box flexShrink={0} width={5} alignItems="center">
                    <Icon source={clawdSvg(kind)} alt={`Clawd ${CLAWD_LABEL[kind]}`} width={CLAWD_SIZE.width} height={CLAWD_SIZE.height} isInteractive />
                  </Box>
                ) : (
                  <Box width={2} flexShrink={0}><Text color={CLAUDE}>■</Text></Box>
                )}
                <Box width={10} flexShrink={0}><Text color="subtle" wrap="truncate-end">{shortType(m.type)}</Text></Box>
                <Box width={9} flexShrink={0}><Text color={CLAUDE}>{m.model}</Text></Box>
                {Icon ? (
                  <Box flexShrink={0}>
                    <Icon source={taskBar(`t${i}`, pct, m.status === 'working')} alt={shown === null ? 'Sem lista de tarefas' : `${pct}% da tarefa`} width={BAR_WIDTH + 8} height={14} isInteractive />
                  </Box>
                ) : (
                  <Box flexShrink={0}>
                    <Text color={CLAUDE}>{'━'.repeat(n)}</Text>
                    <Text color="inactive">{'─'.repeat(cells - n)}</Text>
                  </Box>
                )}
                <Box width={5} flexShrink={0} marginLeft={1}><Text color={shown === null ? 'inactive' : CLAUDE}>{shown === null ? '—' : `${pct}%`}</Text></Box>
                <Box width={11} flexShrink={0} justifyContent="flex-end">
                  <Text color="subtle">{`${formatTokens(m.tokens)} / ${formatWindow(m.window)}`}</Text>
                </Box>
                <Box flexShrink={0} marginLeft={1}>
                  <Text color="subtle">{`${formatTime(elapsed(m, now))} ·`}</Text>
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
