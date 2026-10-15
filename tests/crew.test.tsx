import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { prettyModel, targetOf } from '../hooks/register'

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

// The engine beneath the plugin: a clock, nothing drawn above the prompt, and the subagent on Haiku.
function engine(on: On) {
  const clock = mock.clock(on, { now: 1_000_000 })
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('agent.list', () => ({ value: [] }))
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

test('model ids read as names', () => {
  expect(prettyModel('claude-opus-5-5')).toBe('Opus 5.5')
  expect(prettyModel('claude-haiku-5-5-20261001')).toBe('Haiku 5.5')
  expect(prettyModel('haiku')).toBe('Haiku')
  expect(prettyModel('claude-fable-5-1')).toBe('Fable 5.1')
})

test('a tool call reads as what it points at', () => {
  expect(targetOf('Read', { file_path: 'C:\\a\\b\\c\\d\\e.ts' })).toBe('…/c/d/e.ts')
  expect(targetOf('Bash', { command: 'ls -la', description: 'List files' })).toBe('List files')
  expect(targetOf('Grep', { pattern: 'TODO', path: 'src' })).toBe('"TODO" em src')
  expect(targetOf('WebFetch', { url: 'https://example.com/x' })).toBe('example.com')
})

test('with no subagent, the band holds the Rei Clawd alone, and the terminal nothing', async ($, on) => {
  engine(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /Subagentes/ })).toBeUndefined()
    if (surface === 'terminal') expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    else expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('Rei Clawd à toa')
    await ui.unmount()
  }
})

test('the Rei Clawd follows the main session, not its subagents', async ($, on) => {
  engine(on)
  on('turn.complete', () => ({ text: '' }))
  // The king's look, read from its drawing's alt text.
  const king = async (alt: RegExp) => {
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const found = await ui.find({ type: 'Svg' })
    await ui.unmount()
    return alt.test(String(found?.props.alt)) ? found : undefined
  }

  // A question holds the main session's tool open: the king asks while it waits.
  let answer: (() => void) | undefined
  on('tool.call', { tool: 'AskUserQuestion' }, () => new Promise(done => (answer = () => done({ result: 'ok' }))))
  on('tool.call', () => ({ result: 'ok' }))
  const asked = $.tool.call({ tool: 'AskUserQuestion', tool_use_id: 'q1', questions: [] } as never)
  // Wait until the question reaches the engine beneath: the plugin's hook has run by then.
  while (answer === undefined) await new Promise(r => setTimeout(r, 5))
  expect(await king(/^Rei Clawd esperando sua resposta$/)).toBeDefined()
  answer!()
  await asked
  expect(await king(/^Rei Clawd trabalhando$/)).toBeDefined()

  // A subagent's tool and its turn's end leave the king alone.
  await spawnExplore($)
  await $.tool.call(inAgent({ tool: 'Read', tool_use_id: 'r1', file_path: 'x.ts' } as const, 'a1'))
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false, turnId: 's1' })
  expect(await king(/^Rei Clawd trabalhando$/)).toBeDefined()

  await $.turn.complete({ reason: 'answer', answer: 'pronto', durationMs: 1, isAborted: false, turnId: 'u1' })
  expect(await king(/^Rei Clawd concluído$/)).toBeDefined()
  expect(await king(/^Rei Clawd trabalhando$/)).toBeUndefined()
})

test('an Explore subagent joins as Lupa, with its model, in the band', async ($, on) => {
  engine(on)
  await spawnExplore($)

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    expect(await band.find({ type: 'Text', text: /^Lupa$/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /^Haiku 5\.5$/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /1 ativo ·/ })).toBeDefined()
    await band.unmount()
  }
})

test('a tool call marks the subagent working, and its answer marks it done', async ($, on) => {
  const clock = engine(on)
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.complete', () => ({ text: '' }))
  await spawnExplore($)

  await $.tool.call(inAgent({ tool: 'Grep', tool_use_id: 'g1', pattern: 'checkout', path: 'src' } as const, 'a1'))
  let band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Text', text: /Grep "checkout" em src/ })).toBeDefined()
  expect(await band.find({ type: 'Button', key: 'stop:a1' })).toBeDefined()
  await band.unmount()

  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'Mapa pronto', durationMs: 900, isAborted: false, turnId: 'u1' })
  band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Text', text: /Devolveu o resultado/ })).toBeDefined()
  // A finished subagent has nothing to stop.
  expect(await band.find({ type: 'Button', key: 'stop:a1' })).toBeUndefined()
  await band.unmount()

  // Once its linger is over, a finished subagent leaves the band.
  await clock.advance(20_000)
  band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Text', text: /^Lupa$/ })).toBeUndefined()
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

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await band.press({ key: 'stop:a1' })
  expect(stopped).toEqual(['a1'])
  expect(await band.find({ type: 'Text', text: /Interrompido/ })).toBeDefined()
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
