import { expect, test } from 'claude-code/testing'

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

const PANE = {
  plugin: 'tripulacao',
  component: 'Pane' as const,
  requestId: 'tripulacao',
  props: { title: 'Tripulação', isFocused: false, bodyColumns: 60, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 30 }, view: {} },
}

test('the band stays empty with no subagent', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Lupa/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('an Explore subagent joins as Lupa, with its model, in the band and the pane', async ($, on) => {
  // Beneath the plugin, the engine starts the subagent on Haiku.
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))

  await $.agent.spawn({
    tool_use_id: 't1',
    prompt: 'Map the checkout',
    description: 'Mapear o checkout',
    subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
  })

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await terminal.find({ type: 'Text', text: /^Lupa$/ })).toBeDefined()
  expect(await terminal.find({ type: 'Text', text: /^Haiku 5\.5$/ })).toBeDefined()
  await terminal.unmount()

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await desktop.find({ type: 'Svg' })).toBeDefined()
  await desktop.unmount()

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await pane.find({ type: 'Text', text: /^Lupa$/ })).toBeDefined()
  expect(await pane.find({ type: 'Button', key: 'log:a1' })).toBeDefined()
  await pane.press({ key: 'log:a1' })
  expect(await pane.find({ type: 'Button', key: 'log:a1' })).toBeDefined()
  await pane.unmount()
})
