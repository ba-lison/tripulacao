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

// What a session's main loop is doing: a turn under way, a question it waits on the person
// to answer, or its turn over.
export type PeerStatus = 'working' | 'asking' | 'idle'

// One session as it writes itself to the shared folder, for the other sessions' bands.
export type PeerSession = {
  // The session's id (`$.session.id()`), also the file's name.
  id: string
  // The folder it runs in, by its last name, and its first prompt, cut short.
  project: string
  title: string
  // The session's title as the app shows it (the classic hooks' `session_title`); absent
  // while the app has given it none, and the band falls back to the folder's name.
  name?: string
  status: PeerStatus
  // Its Rei Clawd's pose (a ClawdKind of hooks/clawd.ts), from what its main loop does.
  pose: string
  // What its main loop is doing now: the tool and what it points at, or a note.
  activity: string
  // The main loop's model, pretty-printed (`Opus 5.5`).
  model: string
  // Its subagents running now, and its context: in percent, and in tokens against the window.
  subagents: number
  contextPct: number | null
  tokens: number | null
  window: number | null
  // Its own task list (update_plan or TodoWrite), one status per item; null before it keeps one.
  todos: TodoStatus[] | null
  // The current turn's start, and its end once it ended.
  turnStartedAt: number | null
  turnEndedAt: number | null
  startedAt: number
  // When `status` or `activity` last changed, and when the file was last written.
  changedAt: number
  updatedAt: number
  // True while another session's Parar holds it; the others' bands let its row go.
  halted?: boolean
  // Set as the session ends; a session that dies without it goes stale instead.
  endedAt: number | null
}

declare module 'claude-code' {
  interface PluginState {
    tripulacao: {
      crew: CrewMember[]
      // This session as it writes itself, and the other sessions alive now.
      self: PeerSession | null
      peers: PeerSession[]
      // Set when another session's band stopped this one: it stays stopped, every tool and
      // every wake refused, until the person sends a prompt of their own.
      halted: { at: number; from: string } | null
      now: number
      // The band folded to its header line, or open with a row per subagent.
      bandFolded: boolean
    }
  }
}
