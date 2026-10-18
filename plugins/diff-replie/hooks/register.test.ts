import { expect, mock, test } from 'claude-code/testing'

import { summarizeEdit, summarizeShell } from './register'

const editOutput = {
  filePath: 'C:/depot/docs/epics.md',
  structuredPatch: [{ oldStart: 1, oldLines: 2, newStart: 1, newLines: 3, lines: [' a', '-b', '+c', '+d'] }],
}

test('résume une édition et une commande en une ligne', () => {
  expect(summarizeEdit('Edit', editOutput)).toBe('Modifié epics.md (+2 −1)')
  expect(summarizeEdit('Write', { filePath: '/x/nouveau.md', type: 'create', content: 'l1\nl2\nl3' })).toBe('Créé nouveau.md (3 lignes)')
  expect(summarizeShell({ stdout: 'a\nb\n', stderr: '' })).toBe('Sortie repliée : 2 lignes de sortie')
  expect(summarizeShell({ stdout: '', stderr: 'x', interrupted: true })).toBe("Sortie repliée : aucune sortie, 1 ligne d'erreur, interrompue")
})

// Terminal plein écran : les clics y sont transmis, comme sur desktop.
const viewport = { columns: 120, rows: 40, isFullscreen: true }

test('hors plein écran, une indication remplace le bouton et /details déplie tout', async ($, on) => {
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'diff du moteur' }))
  const ui = await $.ui.mount({
    plugin: 'diff-replie',
    surface: 'terminal',
    viewport: { columns: 120, rows: 40, isFullscreen: false },
    component: 'ToolResult',
    props: { tool_use_id: 'toolu_9', tool: 'Edit', output: editOutput, isErrored: false },
  })
  expect(await ui.find({ key: 'voir' })).toBeUndefined()
  expect(await ui.find({ text: '/details pour déplier' })).toBeDefined()
  await $.command.run({ command: 'details', args: '' })
  expect(await ui.find({ text: 'diff du moteur' })).toBeDefined()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`replie puis déplie un diff (${surface})`, async ($, on) => {
    on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'diff du moteur' }))
    const ui = await $.ui.mount({
      plugin: 'diff-replie',
      surface,
      viewport,
      component: 'ToolResult',
      requestId: 'toolu_1',
      props: { tool_use_id: 'toolu_1', tool: 'Edit', output: editOutput, isErrored: false },
    })
    expect(await ui.find({ key: 'voir' })).toBeDefined()
    await ui.press({ key: 'voir' })
    expect(await ui.find({ key: 'masquer' })).toBeDefined()
    expect(await ui.find({ text: 'diff du moteur' })).toBeDefined()
    expect(await ui.find({ key: 'voir' })).toBeUndefined()
    await ui.press({ key: 'masquer' })
    expect(await ui.find({ key: 'voir' })).toBeDefined()
  })

  test(`replie la sortie d'une commande (${surface})`, async ($, on) => {
    on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'diff du moteur' }))
    const ui = await $.ui.mount({
      plugin: 'diff-replie',
      surface,
      viewport,
      component: 'ToolResult',
      props: { tool_use_id: 'toolu_3', tool: 'Bash', output: { stdout: 'a\nb', stderr: '', interrupted: false }, isErrored: false },
    })
    expect((await ui.find({ key: 'voir' }))?.text).toContain('Voir la sortie')
  })

  test(`laisse les erreurs et les autres outils tels quels (${surface})`, async ($, on) => {
    on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'diff du moteur' }))
    const errored = await $.ui.mount({
      plugin: 'diff-replie',
      surface,
      component: 'ToolResult',
      props: { tool_use_id: 'toolu_2', tool: 'Edit', output: editOutput, isErrored: true },
    })
    expect(await errored.find({ key: 'voir' })).toBeUndefined()
  })

  test(`regroupe des commandes consécutives en une ligne (${surface})`, async ($, on) => {
    on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'ligne du moteur' }))
    on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false }, isError: false }))
    for (const [id, description] of [['toolu_a', 'Lister'], ['toolu_b', 'Compter'], ['toolu_c', 'Nettoyer']]) {
      await $.tool.call({ tool: 'Bash', tool_use_id: id, command: `echo ${id}`, description })
    }
    const mountUse = (id: string) =>
      $.ui.mount({
        plugin: 'diff-replie',
        surface,
        viewport,
        component: 'ToolUse',
        requestId: id,
        props: { tool_use_id: id, tool: 'Bash', input: { command: `echo ${id}` }, isRunning: false, isErrored: false, isInterrupted: false },
      })
    const leader = await mountUse('toolu_a')
    const follower = await mountUse('toolu_b')
    expect((await leader.find({ text: '3 commandes shell' }))).toBeDefined()
    expect((await leader.find({ text: 'Lister · Compter · Nettoyer' }))).toBeDefined()
    expect(await follower.find({ text: 'ligne du moteur' })).toBeUndefined()
    await leader.press({ key: 'voir-groupe' })
    expect(await leader.find({ key: 'replier-groupe' })).toBeDefined()
    expect(await follower.find({ text: 'ligne du moteur' })).toBeDefined()
  })

  test(`un appel replié par Claude Code sort du groupe, le suivant le mène (${surface})`, async ($, on) => {
    const clock = mock.clock(on)
    on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'ligne du moteur' }))
    on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false }, isError: false }))
    for (const [id, description] of [['toolu_x', 'Compter'], ['toolu_y', 'Lister'], ['toolu_z', 'Dater']]) {
      await $.tool.call({ tool: 'Bash', tool_use_id: id, command: `echo ${id}`, description })
    }
    await $.ui.mount({
      plugin: 'diff-replie',
      surface,
      viewport,
      component: 'ToolGroup',
      props: { calls: [{ tool_use_id: 'toolu_x', tool: 'Bash', input: { command: 'wc' }, isRunning: false, isErrored: false, isInterrupted: false }], isActive: false, isExpanded: false },
    })
    await clock.settle()
    const promoted = await $.ui.mount({
      plugin: 'diff-replie',
      surface,
      viewport,
      component: 'ToolUse',
      requestId: 'toolu_y',
      props: { tool_use_id: 'toolu_y', tool: 'Bash', input: { command: 'echo toolu_y' }, isRunning: false, isErrored: false, isInterrupted: false },
    })
    expect(await promoted.find({ text: '2 commandes shell' })).toBeDefined()
    expect(await promoted.find({ text: 'Lister · Dater' })).toBeDefined()
  })
}
