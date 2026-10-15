// The Tripulação state contract: the crew the band draws from.
// Held by the session in $.state; each session keeps its own crew.

// `waiting`: its turn ended, but it holds on background work and resumes under the same id.
export type CrewStatus = 'working' | 'thinking' | 'waiting' | 'done' | 'error'

// One tool call a subagent made, newest first in its member's log.
export type CrewLog = {
  at: number
  tool: string
  target: string
}

// One subagent, from its spawn to its turn's end.
export type CrewMember = {
  // The subagent's id, as its loop's events carry it as `agentId`.
  id: string
  // Which character draws it (an id from crab.ts).
  charId: string
  // The agent type it was spawned as (`Explore`, `general-purpose`, ...).
  type: string
  description: string
  // The model, pretty-printed (`Opus 5.5`), and the context window it runs in.
  model: string
  window: number
  startedAt: number
  endedAt: number | null
  status: CrewStatus
  // What it is doing now: the tool's name and what it points at; or a note.
  tool: string | null
  target: string
  tools: number
  // Tokens in its context after its latest model request.
  tokens: number
  log: CrewLog[]
}

// The main session, drawn as the Rei Clawd beside the HUD: the crew's statuses, plus
// `idle` before its first turn and `asking` while a question or a plan waits on the person.
export type BossStatus = CrewStatus | 'idle' | 'asking'

declare module 'claude-code' {
  interface PluginState {
    tripulacao: {
      crew: CrewMember[]
      now: number
      // The band folded to its header line, or open with a row per subagent.
      bandFolded: boolean
      boss: BossStatus
    }
  }
}
