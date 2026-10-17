import type { EngineInterface } from 'claude-code'

import type { PeerSession } from '../types'

// Sessions run as separate processes and no API lists them, so each session writes its own
// status to a small file in a folder they share, and reads the others' from there.
export const PEER_MS = 3000 // how often a session reads the others
export const HEARTBEAT_MS = 10_000 // how often it rewrites its own file with nothing new
export const PEER_STALE_MS = 35_000 // a file not rewritten for this long is a session that is gone

const DIR = 'tripulacao/sessoes'

// `<config dir>/tripulacao/sessoes`: CLAUDE_CONFIG_DIR when set, else `~/.claude`.
export async function peersDir($: EngineInterface): Promise<string | null> {
  const config = await $.env.get('CLAUDE_CONFIG_DIR')
  const home = (await $.env.get('USERPROFILE')) || (await $.env.get('HOME'))
  const base = config || (home ? `${home}/.claude` : null)
  return base === null ? null : `${base.replace(/\\/g, '/').replace(/\/$/, '')}/${DIR}`
}

// The folder's last name: what tells two sessions apart at a glance.
export function projectOf(cwd: string): string {
  return cwd.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? cwd
}

// A peer shows while its file is fresh and it has not said it ended.
export function isLive(peer: PeerSession, now: number): boolean {
  return peer.endedAt === null && now - peer.updatedAt < PEER_STALE_MS
}

function isPeer(v: unknown): v is PeerSession {
  const p = v as PeerSession
  return typeof p === 'object' && p !== null && typeof p.id === 'string' && typeof p.updatedAt === 'number'
}

// The other sessions alive now, oldest first. A file that is half written or unreadable is skipped:
// the next read finds it whole.
export async function readPeers($: EngineInterface, dir: string, selfId: string, now: number): Promise<PeerSession[]> {
  const entries = await $.fs.list(dir).catch(() => [])
  const fresh = entries.filter(
    f => f.kind === 'file' && f.name.endsWith('.json') && f.name !== `${selfId}.json` && now - f.mtimeMs < PEER_STALE_MS,
  )
  const peers = await Promise.all(
    fresh.map(f =>
      $.fs
        .read(`${dir}/${f.name}`)
        .then(text => JSON.parse(text) as unknown)
        .catch(() => null),
    ),
  )
  return peers.filter(isPeer).filter(p => p.id !== selfId && isLive(p, now)).sort((a, b) => a.startedAt - b.startedAt)
}

export async function writePeer($: EngineInterface, dir: string, peer: PeerSession): Promise<void> {
  await $.fs.write(`${dir}/${peer.id}.json`, JSON.stringify(peer))
}

// "agora", "12s", "3min": how long ago a peer last changed what it is doing (`changedAt`).
export function since(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 5) return 'agora'
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  return m < 60 ? `${m}min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

// A stop asked from another session's band: `<id>.parar` beside the session's own file, with
// when it was asked. The session that owns the id reads it at its next sync and ends its turn.
export type StopRequest = { at: number; from: string }

const stopPath = (dir: string, id: string) => `${dir}/${id}.parar`

export async function requestStop($: EngineInterface, dir: string, id: string, request: StopRequest): Promise<void> {
  await $.fs.write(stopPath(dir, id), JSON.stringify(request))
}

// The latest stop asked of this session, or null when none was.
export async function readStop($: EngineInterface, dir: string, id: string): Promise<StopRequest | null> {
  const path = stopPath(dir, id)
  if (!(await $.fs.exists(path).catch(() => false))) return null
  const v = await $.fs
    .read(path)
    .then(text => JSON.parse(text) as unknown)
    .catch(() => null)
  const r = v as StopRequest | null
  return r !== null && typeof r === 'object' && typeof r.at === 'number' ? r : null
}

// How often a session looks for a stop asked of it: half a second, so Parar lands at once.
export const STOP_MS = 500

// A session's name from its first prompt: no reminder blocks the engine adds, and for a session
// another one started, only its task (the desktop app sends "Background (…): …\n\nTask:\n…").
export function titleFrom(prompt: string): string {
  let text = prompt.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
  const task = /(?:^|\n)Task:\s*\n([\s\S]*?)(?:\n\s*\n(?:Shared note|Background)\b|$)/.exec(text)
  if (task !== null) text = task[1]!
  else text = text.replace(/^\s*Background \(from the session that started this one\):\s*/, '')
  return text.replace(/\s+/g, ' ').trim()
}

// What tells sessions of one folder apart: its folder alone, or with its place among that folder's
// sessions by start ("CinePotato 2"), counted over every live session, this one included, so a
// number names the same session in every band.
export function sessionNames(all: readonly { id: string; project: string; startedAt: number }[]): Map<string, string> {
  const names = new Map<string, string>()
  const byProject = new Map<string, { id: string; startedAt: number }[]>()
  for (const s of all) byProject.set(s.project, [...(byProject.get(s.project) ?? []), s])
  for (const [project, group] of byProject) {
    const sorted = [...group].sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id))
    sorted.forEach((s, i) => names.set(s.id, sorted.length > 1 ? `${project} ${i + 1}` : project))
  }
  return names
}
