import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { applyPlan, formatWindow, prettyModel, targetOf, windowOf } from '../hooks/register'

const BAND = {
  plugin: 'tripulacao',
  component: 'AbovePrompt' as const,
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 12,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
}

// A tool call as a subagent's loop raises it: the kit's typings leave `agentId` to the engine.
const inAgent = <T,>(input: T, agentId: string): T => ({ ...input, agentId })

// The engine beneath the plugin: a clock, nothing drawn above the prompt, a session on Opus
// with a window of a million, and the subagent on `model`.
function engine(on: On, model = 'claude-haiku-5-5') {
  const clock = mock.clock(on, { now: 1_000_000 })
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('agent.spawn', () => ({ model, agentId: 'a1' }))
  on('agent.list', () => ({ value: [] }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits: [] } }))
  return clock
}

const spawnExplore = ($: Engine) =>
  $.agent.spawn({
    tool_use_id: 't1',
    prompt: 'Map the checkout',
    description: 'Mapear o checkout',
    subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
  })

// Whether the band draws a Text matching `text` on `surface`.
async function shows($: Engine, text: RegExp, surface: 'terminal' | 'desktop' = 'terminal'): Promise<boolean> {
  const ui = await $.ui.mount({ ...BAND, surface })
  const found = await ui.find({ type: 'Text', text })
  await ui.unmount()
  return found !== undefined
}

test('model ids read as names', () => {
  expect(prettyModel('claude-opus-5-5')).toBe('Opus 5.5')
  expect(prettyModel('claude-haiku-5-5-20261001')).toBe('Haiku 5.5')
  expect(prettyModel('haiku')).toBe('Haiku')
  expect(prettyModel('claude-fable-5-1')).toBe('Fable 5.1')
})

test('a subagent on the session model runs in the window the engine reports', () => {
  expect(windowOf('claude-opus-5-5', 'claude-opus-5-5', 1_000_000)).toBe(1_000_000)
  expect(windowOf('claude-opus-5-5', 'claude-opus-5-5', 200_000)).toBe(200_000)
  expect(windowOf('claude-sonnet-5-5[1m]', 'claude-opus-5-5', 200_000)).toBe(1_000_000)
  // Haiku 5.5 runs in a million, as every current model; Haiku 4.5 in 200k.
  expect(windowOf('claude-haiku-5-5', 'claude-opus-5-5', 1_000_000)).toBe(1_000_000)
  expect(windowOf('haiku', 'claude-opus-5-5', 1_000_000)).toBe(1_000_000)
  expect(windowOf('claude-haiku-4-5', 'claude-opus-5-5', 1_000_000)).toBe(200_000)
  expect(formatWindow(1_000_000)).toBe('1M')
  expect(formatWindow(500_000)).toBe('500k')
})

test('a tool call reads as what it points at', () => {
  expect(targetOf('Read', { file_path: 'C:\\a\\b\\c\\d\\e.ts' })).toBe('…/c/d/e.ts')
  expect(targetOf('Bash', { command: 'ls -la', description: 'List files' })).toBe('List files')
  expect(targetOf('Grep', { pattern: 'TODO', path: 'src' })).toBe('"TODO" em src')
  expect(targetOf('WebFetch', { url: 'https://example.com/x' })).toBe('example.com')
})

test('with no subagent, the band draws nothing of its own', async ($, on) => {
  engine(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /Subagentes/ })).toBeUndefined()
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    await ui.unmount()
  }
})

test('an Explore subagent joins by its type, with its model and its window', async ($, on) => {
  engine(on)
  await spawnExplore($)

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    expect(await band.find({ type: 'Text', text: /^Explore$/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /^Haiku 5\.5$/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /^0 \/ 1M$/ })).toBeDefined()
    // No list yet: nothing says how far it is.
    expect(await band.find({ type: 'Text', text: /^—$/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /1 ativo ·/ })).toBeDefined()
    if (surface === 'desktop') expect((await band.find({ type: 'Svg' }))?.props.alt).toBe('Clawd pensando')
    await band.unmount()
  }
})

test('a subagent on the session model counts its tokens against the session window', async ($, on) => {
  engine(on, 'claude-opus-5-5')
  on('turn.step', async function* () {
    return {
    turnId: 's1',
    index: 0,
    answer: '',
    toolUses: [],
    stopReason: 'end_turn' as const,
      usage: { input_tokens: 2_000, cache_read_input_tokens: 58_000, cache_creation_input_tokens: 1_500, output_tokens: 800, model: 'claude-opus-5-5' },
    }
  })
  await spawnExplore($)
  for await (const _ of $.turn.step({ turnId: 's1', index: 0, model: 'claude-opus-5-5', messageCount: 1, agentId: 'a1' } as never)) void _

  expect(await shows($, /^62k \/ 1M$/, 'desktop')).toBe(true)
})

test('the task bar follows its todo list, an item under way counting half', async ($, on) => {
  engine(on)
  on('tool.call', () => ({ result: 'ok' }))
  await spawnExplore($)
  const todos = (done: number, total: number, active = 0) =>
    Array.from({ length: total }, (_, i) => ({
      content: `t${i}`,
      activeForm: `t${i}`,
      status: i < done ? 'completed' : i < done + active ? 'in_progress' : 'pending',
    }))

  await $.tool.call(inAgent({ tool: 'TodoWrite', tool_use_id: 'w1', todos: todos(1, 4) } as never, 'a1'))
  expect(await shows($, /^25%$/)).toBe(true)
  await $.tool.call(inAgent({ tool: 'TodoWrite', tool_use_id: 'w2', todos: todos(1, 4, 1) } as never, 'a1'))
  expect(await shows($, /^38%$/)).toBe(true)
  // Every item done still waits on its answer.
  await $.tool.call(inAgent({ tool: 'TodoWrite', tool_use_id: 'w3', todos: todos(4, 4) } as never, 'a1'))
  expect(await shows($, /^99%$/)).toBe(true)
})

test('update_plan moves the list as the desktop app does', () => {
  const items = (n: number) => ({ items: Array.from({ length: n }, (_, i) => ({ content: `i${i}`, status: i === 0 ? 'in_progress' : 'pending' })) })
  let plan = applyPlan(null, items(4))
  expect(plan).toEqual(['in_progress', 'pending', 'pending', 'pending'])
  plan = applyPlan(plan, { advance: true })
  expect(plan).toEqual(['completed', 'in_progress', 'pending', 'pending'])
  plan = applyPlan(plan, { done: [2], start: 4 })
  expect(plan).toEqual(['completed', 'completed', 'pending', 'in_progress'])
  // An advance before any list says nothing.
  expect(applyPlan(null, { advance: true })).toBeNull()
})

test("the task bar follows a subagent's update_plan calls", async ($, on) => {
  engine(on)
  // The desktop app refuses update_plan in a subagent: the mod answers before it gets there.
  on('tool.call', e => (String(e.tool).endsWith('update_plan') ? { deny: 'Not shown: you are a subagent' } : { result: 'ok' }))
  await spawnExplore($)
  const plan = (input: object, id: string) =>
    $.tool.call(inAgent({ tool: 'mcp__ccd_turn__update_plan', tool_use_id: id, ...input } as never, 'a1'))
  const first = await plan({ items: [1, 2, 3, 4].map(i => ({ content: `Item ${i}`, status: i === 1 ? 'in_progress' : 'pending' })) }, 'p1')
  expect(first.deny).toBeUndefined()
  expect(await shows($, /^13%$/)).toBe(true)
  await plan({ advance: true }, 'p2')
  expect(await shows($, /^38%$/)).toBe(true)
  await plan({ advance: true }, 'p3')
  expect(await shows($, /^63%$/)).toBe(true)
})

test('a separate button folds and unfolds the band', async ($, on) => {
  engine(on)
  await spawnExplore($)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const fold = await band.find({ type: 'Button', key: 'fold-band' })
  expect(fold).toBeDefined()
  // A button of its own, apart from the header's text.
  expect(fold?.props.label).toBe('▾ Ocultar')
  expect(await band.find({ type: 'Text', text: /Subagentes · 1 ativo/ })).toBeDefined()
  await band.press({ key: 'fold-band' })
  expect((await band.find({ type: 'Button', key: 'fold-band' }))?.props.label).toBe('▸ Mostrar')
  expect(await band.find({ type: 'Text', text: /^Explore$/ })).toBeUndefined()
  await band.press({ key: 'fold-band' })
  expect(await band.find({ type: 'Text', text: /^Explore$/ })).toBeDefined()
  await band.unmount()
})

test('the task bar follows its TaskCreate and TaskUpdate tasks', async ($, on) => {
  engine(on)
  let next = 0
  on('tool.call', { tool: 'TaskCreate' }, () => ({ result: { task: { id: `k${++next}`, subject: 'x' } } }))
  on('tool.call', () => ({ result: 'ok' }))
  await spawnExplore($)
  for (let i = 0; i < 2; i++) await $.tool.call(inAgent({ tool: 'TaskCreate', tool_use_id: `c${i}`, subject: 'x', description: 'x' } as never, 'a1'))
  await $.tool.call(inAgent({ tool: 'TaskUpdate', tool_use_id: 'u1', taskId: 'k1', status: 'completed' } as never, 'a1'))
  expect(await shows($, /^50%$/)).toBe(true)
})

test('a tool call marks the subagent working, and its answer marks it done', async ($, on) => {
  const clock = engine(on)
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.complete', () => ({ text: '' }))
  await spawnExplore($)

  await $.tool.call(inAgent({ tool: 'Grep', tool_use_id: 'g1', pattern: 'checkout', path: 'src' } as const, 'a1'))
  let band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ type: 'Text', text: /Grep "checkout" em src/ })).toBeDefined()
  expect((await band.find({ type: 'Svg' }))?.props.alt).toBe('Clawd lendo arquivos')
  expect(await band.find({ type: 'Button', key: 'stop:a1' })).toBeDefined()
  await band.unmount()

  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'Mapa pronto', durationMs: 900, isAborted: false, turnId: 'u1' })
  band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ type: 'Text', text: /Devolveu o resultado/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /^100%$/ })).toBeDefined()
  expect((await band.find({ type: 'Svg' }))?.props.alt).toBe('Clawd concluído')
  // A finished subagent has nothing to stop.
  expect(await band.find({ type: 'Button', key: 'stop:a1' })).toBeUndefined()
  await band.unmount()

  // Once its linger is over, a finished subagent leaves the band.
  await clock.advance(20_000)
  band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Text', text: /^Explore$/ })).toBeUndefined()
  await band.unmount()
})

test('the stop button calls TaskStop with the subagent id and ends it', async ($, on) => {
  engine(on)
  const stopped: string[] = []
  on('tool.call', { tool: 'TaskStop' }, (_$, e) => {
    stopped.push(String((e as unknown as { task_id: string }).task_id))
    return { result: 'ok' }
  })
  await spawnExplore($)

  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'stop:a1' })
  expect(stopped).toEqual(['a1'])
  expect(await band.find({ type: 'Text', text: /Interrompido/ })).toBeDefined()
  expect((await band.find({ type: 'Svg' }))?.props.alt).toBe('Clawd interrompido')
  expect(await band.find({ type: 'Button', key: 'stop:a1' })).toBeUndefined()
  await band.unmount()
})

test('a failure in the bookkeeping never holds up the tool', async ($, on) => {
  engine(on)
  on('tool.call', () => ({ result: 'ok' }))
  // No subagent with this id: the hook has nothing to patch, and the call still goes through.
  const result = await $.tool.call(inAgent({ tool: 'Read', tool_use_id: 'r1', file_path: 'x.ts' } as const, 'ghost'))
  expect(result.result).toBe('ok')
})
