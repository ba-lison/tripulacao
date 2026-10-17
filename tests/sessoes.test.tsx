import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { PeerSession } from '../types'
import { sessionNames, since, titleFrom } from '../hooks/sessoes'
import { listProgress } from '../hooks/register'

const BAND = {
  plugin: 'tripulacao',
  component: 'AbovePrompt' as const,
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
}

const NOW = 1_000_000
const DIR = 'C:/Users/eu/.claude/tripulacao/sessoes'

function peer(over: Partial<PeerSession>): PeerSession {
  return {
    id: 'outra',
    project: 'usage-hud',
    title: 'Ajustar o card',
    status: 'working',
    pose: 'editando',
    activity: 'Edit hooks/card.ts',
    model: 'Opus 5.5',
    subagents: 1,
    contextPct: 34,
    tokens: 340_000,
    window: 1_000_000,
    todos: ['completed', 'in_progress', 'pending', 'pending'],
    turnStartedAt: NOW - 125_000,
    turnEndedAt: null,
    startedAt: NOW - 600_000,
    changedAt: NOW - 20_000,
    updatedAt: NOW,
    endedAt: null,
    ...over,
  }
}

// The engine beneath the plugin: this session is `eu` in CinePotato, and the shared folder holds
// `files`, each with its mtime. Every write lands in `written`.
function engine(on: On, files: Record<string, { mtimeMs: number; peer: PeerSession }>, raw: Record<string, string> = {}) {
  const clock = mock.clock(on, { now: NOW })
  const written: Record<string, string> = {}
  const paths: string[] = []
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('env.get', ($, e) => ({ value: e.name === 'USERPROFILE' ? 'C:\\Users\\eu' : undefined }))
  on('session.id', () => ({ value: 'eu' }))
  on('session.cwd', () => ({ value: 'E:/Projetos/CinePotato' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000, percent: 10 }, rateLimits: [] } }))
  on('agent.list', () => ({ value: [] }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('fs.list', () => ({
    value: Object.entries(files).map(([name, f]) => ({ name, kind: 'file' as const, size: 100, mtimeMs: f.mtimeMs, isLink: false })),
  }))
  on('fs.exists', ($, e) => {
    const name = String(e.path).split(/[\\/]/).pop()!
    return { value: name in files || name in raw }
  })
  on('fs.read', ($, e) => {
    const name = String(e.path).split(/[\\/]/).pop()!
    if (name in raw) return { value: raw[name]! }
    const f = files[name]
    if (f === undefined) throw new Error('ENOENT')
    return { value: JSON.stringify(f.peer) }
  })
  on('fs.write', ($, e) => {
    written[String(e.path).split(/[\\/]/).pop()!] = String(e.text)
    paths.push(String(e.path))
    return { value: undefined }
  })
  return { clock, written, paths }
}

const start = ($: Engine) => $.session.start({ cwd: 'E:/Projetos/CinePotato', surface: null, isInteractive: true })

async function texts($: Engine, surface: 'terminal' | 'desktop'): Promise<string> {
  const ui = await $.ui.mount({ ...BAND, surface })
  const all = await ui.findAll({ type: 'Text' })
  await ui.unmount()
  return all.map(t => t.text).join(' | ')
}

test('another live session in the shared folder shows in the band, and this one never does', async ($, on) => {
  const { clock } = engine(on, {
    'outra.json': { mtimeMs: NOW, peer: peer({}) },
    'eu.json': { mtimeMs: NOW, peer: peer({ id: 'eu', project: 'CinePotato' }) },
  })
  await start($)
  await clock.advance(3000)
  for (const surface of ['terminal', 'desktop'] as const) {
    const shown = await texts($, surface)
    expect(shown).toContain('Sessões em paralelo · 1 aberta')
    expect(shown).toContain('usage-hud')
    expect(shown).toContain('Ajustar o card')
    expect(shown).toContain('Edit hooks/card.ts')
    expect(shown).toContain('Opus 5.5')
    expect(shown).toContain('340k / 1M')
    expect(shown).toContain('38%') // one item done and one under way, of four
    expect(shown).toContain('02:08 ·') // the turn so far: 125 s, plus the 3 s the test waited
    expect(shown).toContain('1 sub')
    expect(shown).not.toContain('CinePotato')
  }
  // On the desktop, the row's Clawd is the crowned Rei Clawd in its pose.
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svgs = await ui.findAll({ type: 'Svg' })
  await ui.unmount()
  const king = svgs.find(s => String(s.props.alt).startsWith('Rei Clawd'))
  expect(king?.props.alt).toBe('Rei Clawd editando')
  expect(String(king?.props.source)).toContain('#ffd34d')
})

test('a session waiting on a question, and a file from 2.1.0 with no pose, still draw', async ($, on) => {
  const old: Partial<PeerSession> = peer({ id: 'velha', project: 'antiga', status: 'idle', activity: 'Respondeu', changedAt: NOW - 180_000 })
  delete old.pose
  delete old.tokens
  delete old.todos
  const { clock } = engine(on, {
    'pergunta.json': {
      mtimeMs: NOW,
      peer: peer({ id: 'pergunta', project: 'perguntando', status: 'asking', pose: 'esperando', activity: 'Esperando sua resposta' }),
    },
    'velha.json': { mtimeMs: NOW, peer: old as PeerSession },
  })
  await start($)
  await clock.advance(3000)
  const shown = await texts($, 'terminal')
  expect(shown).toContain('Esperando sua resposta')
  expect(shown).toContain('Sessões em paralelo · 2 abertas')
  expect(shown).toContain('Respondeu há 3min')
  expect(shown).toContain('ctx 34%')
})

test("a session's own list reads as a subagent's, 100 only once all are done", () => {
  expect(listProgress(null)).toBeNull()
  expect(listProgress(['completed', 'in_progress', 'pending', 'pending'])).toBe(38)
  expect(listProgress(['completed', 'completed'])).toBe(100)
})

test('a session that ended, or whose file went stale, is not shown', async ($, on) => {
  const { clock } = engine(on, {
    'fim.json': { mtimeMs: NOW, peer: peer({ id: 'fim', project: 'acabou', endedAt: NOW - 1000 }) },
    'velha.json': { mtimeMs: NOW - 60_000, peer: peer({ id: 'velha', project: 'sumiu', updatedAt: NOW - 60_000 }) },
  })
  await start($)
  await clock.advance(3000)
  const shown = await texts($, 'terminal')
  expect(shown).not.toContain('acabou')
  expect(shown).not.toContain('sumiu')
  expect(shown).not.toContain('Sessões em paralelo')
})

test('this session writes its own file: its folder, its first prompt and what its main loop does', async ($, on) => {
  const { clock, written, paths } = engine(on, {})
  await start($)
  // The kit fills the rest of a submit (`wait`, `origin`); the typings ask for them whole.
  await $.prompt.submit({ text: 'Mexer   na tripulação\npara ver sessões' } as Parameters<Engine['prompt']['submit']>[0])
  await clock.advance(3000)
  expect(paths[0]!.replace(/\\/g, '/')).toBe(`${DIR}/eu.json`)
  const mine = JSON.parse(written['eu.json']!) as PeerSession
  expect(mine.project).toBe('CinePotato')
  expect(mine.title).toBe('Mexer na tripulação para ver sessões')
  expect(mine.contextPct).toBe(10)
  expect(mine.model).toBe('Opus 5.5')
  expect(mine.endedAt).toBeNull()
})

test('a session marks its file as ended when it ends', async ($, on) => {
  const { clock, written } = engine(on, {})
  await start($)
  await clock.advance(3000)
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'eu', resume: { id: 'eu' } })
  const mine = JSON.parse(written['eu.json']!) as PeerSession
  expect(mine.endedAt).not.toBeNull()
})

test('how long ago reads short', () => {
  expect(since(2000)).toBe('agora')
  expect(since(12_000)).toBe('12s')
  expect(since(180_000)).toBe('3min')
  expect(since(3_900_000)).toBe('1h05')
})

test("the Parar button on a working session's row writes it a stop request", async ($, on) => {
  const { clock, written } = engine(on, { 'outra.json': { mtimeMs: NOW, peer: peer({}) } })
  await start($)
  await clock.advance(3000)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'stop-peer:outra' })
  await ui.unmount()
  const stop = JSON.parse(written['outra.parar']!) as { at: number; from: string }
  expect(stop.from).toBe('CinePotato')
  expect(stop.at).toBeGreaterThan(NOW)
})

test('a session between turns keeps its Parar button: its background work could wake it', async ($, on) => {
  const { clock } = engine(on, { 'outra.json': { mtimeMs: NOW, peer: peer({ status: 'idle' }) } })
  await start($)
  await clock.advance(3000)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Button', key: 'stop-peer:outra' })).toBeDefined()
  await ui.unmount()
})

test('a stop asked after this session started ends its running turn, once', async ($, on) => {
  // The stop file this session reads: `raw` is the folder's text files, changed as the test goes.
  const raw: Record<string, string> = {}
  const { clock } = engine(on, {}, raw)
  const aborted: string[] = []
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.abort', ($, e) => {
    aborted.push(e.turnId)
    return { value: undefined }
  })
  await start($)
  await $.turn.start({ text: 'trabalhar', turnId: 'turno-1' })
  // A request older than the session is not for it.
  raw['eu.parar'] = JSON.stringify({ at: NOW - 1000, from: 'velha' })
  await clock.advance(3000)
  expect(aborted).toEqual([])
  raw['eu.parar'] = JSON.stringify({ at: NOW + 4000, from: 'usage-hud' })
  await clock.advance(3000)
  expect(aborted).toEqual(['turno-1'])
  await clock.advance(3000)
  expect(aborted).toEqual(['turno-1'])
})

test('a stopped session refuses every tool and every wake until the person writes', async ($, on) => {
  const raw: Record<string, string> = {}
  const { clock } = engine(on, {}, raw)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.abort', () => ({ value: undefined }))
  on('tool.call', () => ({ result: 'ran' }) as never)
  const submit = (kind: string) =>
    $.prompt.submit({ text: 'oi', origin: { kind } } as unknown as Parameters<Engine['prompt']['submit']>[0])
  await start($)
  await $.turn.start({ text: 'trabalhar', turnId: 'turno-1' })
  raw['eu.parar'] = JSON.stringify({ at: NOW + 200, from: 'usage-hud' })
  await clock.advance(500)
  // Within half a second: tools refused, a background task's notice dropped.
  const denied = await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  expect((denied as { deny?: string }).deny).toContain('Parado pela Tripulação')
  const notice = await submit('task-notification')
  expect((notice as { drop?: string }).drop).toContain('usage-hud')
  // The person's own prompt lifts it.
  const mine = await submit('composer')
  expect((mine as { drop?: string }).drop).toBeUndefined()
  const after = await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  expect((after as { deny?: string }).deny).toBeUndefined()
})

test("a session another one started is named by its task, not by the Background note", () => {
  const prompt = [
    '<system-reminder>\nLinked sessions now: teste = local_x (idle).\n</system-reminder>',
    '',
    'Background (from the session that started this one):',
    'Estamos testando o mod.',
    '',
    'Task:',
    'Esta sessão é só um teste:  fique ocupada.',
    '',
    'Shared note: nada.',
  ].join('\n')
  expect(titleFrom(prompt)).toBe('Esta sessão é só um teste: fique ocupada.')
  expect(titleFrom('Background (from the session that started this one): Estamos testando')).toBe('Estamos testando')
  expect(titleFrom('Ajustar o card\nque sobrepõe')).toBe('Ajustar o card que sobrepõe')
})

test('sessions of one folder get a number by start, the same in every band', () => {
  const names = sessionNames([
    { id: 'b', project: 'CinePotato', startedAt: 20 },
    { id: 'a', project: 'CinePotato', startedAt: 10 },
    { id: 'c', project: 'usage-hud', startedAt: 5 },
  ])
  expect(names.get('a')).toBe('CinePotato 1')
  expect(names.get('b')).toBe('CinePotato 2')
  expect(names.get('c')).toBe('usage-hud')
})

test('with another session in its folder, the band names both and says which one it is', async ($, on) => {
  const { clock } = engine(on, {
    'outra.json': { mtimeMs: NOW, peer: peer({ project: 'CinePotato', startedAt: NOW + 1000 }) },
  })
  await start($)
  await clock.advance(3000)
  const shown = await texts($, 'terminal')
  expect(shown).toContain('CinePotato 2')
  expect(shown).toContain('esta é CinePotato 1')
})

test('a session stopped from a band leaves it a few seconds after, and the numbers stay', async ($, on) => {
  const { clock } = engine(on, {
    'parada.json': { mtimeMs: NOW, peer: peer({ id: 'parada', project: 'CinePotato', startedAt: NOW - 5000, halted: true, status: 'idle', activity: 'Parada por CinePotato 1', changedAt: NOW - 1000 }) },
    'viva.json': { mtimeMs: NOW, peer: peer({ id: 'viva', project: 'CinePotato', startedAt: NOW + 2000 }) },
  })
  await start($)
  await clock.advance(3000)
  // Just stopped: still shown, for a moment.
  expect(await texts($, 'terminal')).toContain('Parada por CinePotato 1')
  await clock.advance(6000)
  const shown = await texts($, 'terminal')
  expect(shown).not.toContain('Parada por')
  expect(shown).toContain('Sessões em paralelo · 1 aberta')
  // The one still alive keeps its number: the stopped one, started first, still counts.
  expect(shown).toContain('CinePotato 3')
})

test('a session the app titled goes by that title, in its own file and in the others\' bands', async ($, on) => {
  on('classic.UserPromptSubmit', () => ({}))
  const { clock, written } = engine(on, {
    'outra.json': { mtimeMs: NOW, peer: peer({ project: 'CinePotato', startedAt: NOW - 5000, name: 'HD overlapping text adjustment' }) },
  })
  await start($)
  await $.classic.UserPromptSubmit({ prompt: 'Leia o handoff', session_title: 'Leitura handoff' })
  await clock.advance(3000)
  const shown = await texts($, 'terminal')
  expect(shown).toContain('HD overlapping text adjustment')
  expect(shown).toContain('esta é Leitura handoff')
  // The title stands for the first prompt, and no folder number is shown for it.
  expect(shown).not.toContain('Ajustar o card')
  expect(shown).not.toContain('CinePotato 1')
  expect((JSON.parse(written['eu.json']!) as PeerSession).name).toBe('Leitura handoff')
})
