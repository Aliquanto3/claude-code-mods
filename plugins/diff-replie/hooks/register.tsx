import type { Register } from 'claude-code'

import type { Expanded, LeaderOf, Runs, Summaries } from '../types'

// État du mod, en mémoire pour le process (repart à zéro à chaque session, comme l'affichage
// replié/déplié lui-même). `claude-code` n'exporte plus d'atome réactif : un changement qui doit
// se voir hors du rendu qui l'a causé (le bouton pressé) passe par `$.ui.invalidate('ui.render')`.
let expanded: Expanded = []
let runs: Runs = {}
let leaderOf: LeaderOf = {}
let summaries: Summaries = {}
// Tout déplier d'un coup (commande /details) : le seul geste possible hors du plein écran,
// où le terminal ne transmet pas les clics.
let showAll = false

const COMMAND = 'details'
const HINT = ' · /details pour déplier'
// Les boutons ne répondent qu'où la surface transmet les clics : terminal plein écran, desktop, IDE.
const canPress = (e: { surface: string; viewport?: { isFullscreen?: boolean } }) =>
  e.surface !== 'terminal' || e.viewport?.isFullscreen === true

type Kind = 'edit' | 'shell'
const kindOf = (tool: string): Kind | null =>
  tool === 'Edit' || tool === 'Write' ? 'edit' : tool === 'Bash' || tool === 'PowerShell' ? 'shell' : null

type Patch = { lines: string[] }[]
type EditOutput = { filePath?: string; structuredPatch?: Patch; type?: 'create' | 'update'; content?: string; staged?: boolean }
type ShellOutput = { stdout?: string; stderr?: string; interrupted?: boolean }
type ShellInput = { command?: string; description?: string }

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path
const lineCount = (text = '') => (text.trim() === '' ? 0 : text.trimEnd().split('\n').length)
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

const isCreate = (tool: string, output: EditOutput) => tool === 'Write' && output.type === 'create'

export const editStats = (tool: string, output: EditOutput) => {
  const name = baseName(output.filePath ?? 'fichier')
  if (isCreate(tool, output)) return `${name} (créé, ${plural(lineCount(output.content), 'ligne')})`
  let added = 0
  let removed = 0
  for (const hunk of output.structuredPatch ?? []) {
    for (const line of hunk.lines) {
      if (line.startsWith('+')) added += 1
      else if (line.startsWith('-')) removed += 1
    }
  }
  return `${name} (+${added} −${removed})`
}

export const summarizeEdit = (tool: string, output: EditOutput) =>
  isCreate(tool, output)
    ? `Créé ${baseName(output.filePath ?? 'fichier')} (${plural(lineCount(output.content), 'ligne')})`
    : `Modifié ${editStats(tool, output)}`

export const summarizeShell = (output: ShellOutput) => {
  const out = lineCount(output.stdout)
  const err = lineCount(output.stderr)
  const parts = [out === 0 ? 'aucune sortie' : `${plural(out, 'ligne')} de sortie`]
  if (err > 0) parts.push(`${plural(err, 'ligne')} d'erreur`)
  if (output.interrupted) parts.push('interrompue')
  return `Sortie repliée : ${parts.join(', ')}`
}

export const groupTitle = (kind: Kind, count: number) =>
  kind === 'shell' ? `${count} commandes shell` : `${count} modifications de fichiers`

const groupOf = (id: string) => {
  const leader = leaderOf[id]
  const ids = leader ? (runs[leader] ?? []) : []
  return { leader, ids, isGrouped: ids.length > 1 }
}

// Retire des groupes du mod les appels que Claude Code a rangés dans ses propres lignes ;
// rend, pour chaque groupe touché, le nouvel appel de tête (null si le groupe est vide).
function detach(gone: string[]): Record<string, string | null> {
  const owners = leaderOf
  const moved: Record<string, string | null> = {}
  const keptRuns = { ...runs }
  for (const leader of new Set(gone.map(id => owners[id]).filter(Boolean))) {
    const members = (keptRuns[leader] ?? []).filter(x => !gone.includes(x))
    delete keptRuns[leader]
    moved[leader] = members[0] ?? null
    if (members.length > 0) keptRuns[members[0]] = members
  }
  runs = keptRuns
  const keptLeaderOf = { ...leaderOf }
  for (const id of gone) delete keptLeaderOf[id]
  for (const [id, leader] of Object.entries(keptLeaderOf)) {
    if (leader in moved) {
      const newLeader = moved[leader]
      if (newLeader) keptLeaderOf[id] = newLeader
      else delete keptLeaderOf[id]
    }
  }
  leaderOf = keptLeaderOf
  return moved
}

export const register: Register = on => {
  // Suivi des appels consécutifs : même type, sans texte du modèle entre eux.
  let current: { leader: string; kind: Kind } | null = null
  let textSinceLastCall = false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: COMMAND, description: 'Déplie ou replie les diffs et les sorties de commandes' })
    return next(e)
  })

  on('command.run', { command: COMMAND }, $ => {
    const isShown = !showAll
    showAll = isShown
    $.ui.invalidate('ui.render')
    return { text: isShown ? 'Diffs et sorties dépliés.' : 'Diffs et sorties repliés.' }
  })

  on('turn.start', ($, e, next) => {
    current = null
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (result.answer.trim() !== '') textSinceLastCall = true
    return result
  })

  on('tool.call', async ($, e, next) => {
    const id = e.tool_use_id
    const kind = kindOf(e.tool)
    const isSubagent = 'agentId' in e && Boolean(e.agentId)
    if (!id || isSubagent) return next(e)
    if (!kind) {
      current = null
      return next(e)
    }

    if (!current || current.kind !== kind || textSinceLastCall) current = { leader: id, kind }
    textSinceLastCall = false
    const leader = current.leader
    // Les arguments de l'appel sont à plat sur l'événement (e.command, e.file_path).
    const input = e as unknown as ShellInput & { file_path?: string }
    const pending = kind === 'shell' ? (input.description ?? input.command ?? 'commande') : baseName(input.file_path ?? 'fichier')

    leaderOf = { ...leaderOf, [id]: leader }
    runs = { ...runs, [leader]: [...(runs[leader] ?? []), id] }
    summaries = { ...summaries, [id]: { label: `${pending} (en cours)`, isError: false } }

    const answer = await next(e)
    const isError = Boolean((answer as { isError?: boolean }).isError)
    const output = (answer as { result?: unknown }).result as EditOutput | undefined
    const label = kind === 'edit' && output && !isError ? editStats(e.tool, output) : pending
    summaries = { ...summaries, [id]: { label: isError ? `${label} (échec)` : label, isError } }
    return answer
  })

  // Claude Code range déjà certains appels dans ses propres lignes repliées (lectures, `wc`,
  // éditions du dossier temporaire) : on les retire des groupes du mod, sinon un groupe
  // pourrait dépendre d'une ligne invisible. L'écriture part hors du dessin (refusée pendant).
  const engineFolded = new Set<string>()

  on('ui.render', { component: 'ToolGroup' }, ($, e, next) => {
    const fresh = e.props.calls.map(c => c.tool_use_id).filter((id): id is string => Boolean(id) && !engineFolded.has(id!))
    if (fresh.length > 0) {
      fresh.forEach(id => engineFolded.add(id))
      $.clock.after(0, () => {
        const moved = detach(fresh)
        if (current && current.leader in moved) {
          const newLeader = moved[current.leader]
          current = newLeader ? { ...current, leader: newLeader } : null
        }
        $.ui.invalidate('ui.render')
      })
    }
    return next(e)
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const kind = kindOf(e.props.tool)
    if (!kind || showAll) return next(e)
    const id = e.props.tool_use_id
    const { leader, ids, isGrouped } = groupOf(id)
    const { Box, Button, Text } = $.ui.resolve(e)

    if (isGrouped && leader) {
      const isOpen = expanded.includes(leader)
      if (id !== leader) return isOpen ? next(e) : <Box />
      const toggle = () => {
        expanded = isOpen ? expanded.filter(x => x !== leader) : [...expanded, leader]
        $.ui.invalidate('ui.render')
      }
      if (isOpen) {
        const engineTree = await next(e)
        return (
          <Box flexDirection="column">
            <Button key="replier-groupe" label={`Replier les ${groupTitle(kind, ids.length)}`} onPress={toggle} />
            {engineTree ?? null}
          </Box>
        )
      }
      const labels = ids.map(x => summaries[x]?.label ?? '…')
      const errors = ids.filter(x => summaries[x]?.isError).length
      return (
        <Box marginTop={1}>
          <Text>
            {'● '}
            {groupTitle(kind, ids.length)}
            {errors > 0 ? ` dont ${errors} en échec` : ''}
            <Text dimColor> : {labels.join(' · ')}{canPress(e) ? ' ' : HINT}</Text>
          </Text>
          {canPress(e) ? <Button key="voir-groupe" label="Voir le détail" onPress={toggle} /> : null}
        </Box>
      )
    }

    // Appel seul : la description de la commande à la place de son texte.
    const input = e.props.input as ShellInput | undefined
    if (kind !== 'shell' || !input?.description || !input.command || expanded.includes(id)) return next(e)
    return next({ ...e, props: { ...e.props, input: { ...input, command: input.description } } })
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const { tool, tool_use_id: id, isErrored } = e.props
    const kind = kindOf(tool)
    const output = e.props.output as (EditOutput & ShellOutput) | undefined
    if (!kind || isErrored || !output || output.staged || showAll) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const { leader, isGrouped } = groupOf(id)
    if (isGrouped && leader) return expanded.includes(leader) ? next(e) : <Box />

    const noun = kind === 'edit' ? 'le diff' : 'la sortie'
    if (expanded.includes(id)) {
      const engineTree = await next(e)
      return (
        <Box flexDirection="column">
          {engineTree ?? null}
          <Button
            key="masquer"
            label={`Masquer ${noun}`}
            onPress={() => {
              expanded = expanded.filter(x => x !== id)
              $.ui.invalidate('ui.render')
            }}
          />
        </Box>
      )
    }

    const summary = kind === 'edit' ? summarizeEdit(tool, output) : summarizeShell(output)
    return (
      <Box>
        <Text dimColor>
          {'  ⎿  '}
          {summary}
          {canPress(e) ? ' ' : HINT}
        </Text>
        {canPress(e) ? (
          <Button
            key="voir"
            label={`Voir ${noun}`}
            onPress={() => {
              expanded = [...expanded, id]
              $.ui.invalidate('ui.render')
            }}
          />
        ) : null}
      </Box>
    )
  })
}
