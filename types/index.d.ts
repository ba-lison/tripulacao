// The Tripulação state contract: the crew the band draws from.
// Held by the session in $.state; each session keeps its own crew.

// `waiting`: its turn ended, but it holds on background work and resumes under the same id.
export type CrewStatus = 'working' | 'thinking' | 'waiting' | 'done' | 'error'

// How a finished subagent's turn ended: answered, interrupted, or failed.
export type CrewOutcome = 'answer' | 'aborted' | 'error'

// One tool call a subagent made, newest first in its member's log.
export type CrewLog = {
  at: number
  tool: string
  target: string
}

// Where one item of a subagent's list stands.
export type TodoStatus = 'pending' | 'in_progress' | 'completed'

// A task on the subagent's own list (TaskCreate / TaskUpdate), by its id.
export type CrewTask = {
  id: string
  isDone: boolean
  isActive: boolean
}

// One subagent, from its spawn to its turn's end.
export type CrewMember = {
  // The subagent's id, as its loop's events carry it as `agentId`.
  id: string
  // The agent type it was spawned as (`Explore`, `general-purpose`, ...).
  type: string
  description: string
  // The model, pretty-printed (`Opus 5.5`), and the context window it runs in, in tokens.
  model: string
  window: number
  startedAt: number
  endedAt: number | null
  status: CrewStatus
  outcome: CrewOutcome | null
  // What it is doing now: the tool's name and what it points at; or a note.
  tool: string | null
  target: string
  tools: number
  // Tokens in its context after its latest model request.
  tokens: number
  // Its list (TodoWrite, or the desktop app's update_plan), one status per item, in order;
  // null before it writes one.
  todos: TodoStatus[] | null
  // Its TaskCreate / TaskUpdate tasks.
  tasks: CrewTask[]
  log: CrewLog[]
}

declare module 'claude-code' {
  interface PluginState {
    tripulacao: {
      crew: CrewMember[]
      now: number
      // The band folded to its header line, or open with a row per subagent.
      bandFolded: boolean
    }
  }
}
