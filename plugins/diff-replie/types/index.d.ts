/** tool_use_id des résultats ou des groupes dépliés. */
export type Expanded = string[]
/** Groupes d'appels consécutifs du même type : id du premier appel → ids du groupe. */
export type Runs = Record<string, string[]>
/** Appel → id du premier appel de son groupe. */
export type LeaderOf = Record<string, string>
/** Appel → sa ligne de synthèse (« epics.md (+2 −1) », description de la commande). */
export type Summaries = Record<string, { label: string; isError: boolean }>

declare module 'claude-code' {
  interface PluginState {
    'diff-replie': { expanded: Expanded; runs: Runs; leaderOf: LeaderOf; summaries: Summaries; showAll: boolean }
  }
}
