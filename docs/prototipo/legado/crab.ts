// The crew's pixel-art crabs, drawn as SVG markup on an 18 x 15 grid.
// The body is Clawd's; each character adds a color and an accessory.

export type Char = {
  id: string
  name: string
  color: string
  acc: string | null
}

export const CHARS: readonly Char[] = [
  { id: 'clawd', name: 'Clawd', color: '#d97757', acc: null },
  { id: 'lupa', name: 'Lupa', color: '#4fb3a9', acc: 'lupa' },
  { id: 'mestre', name: 'Mestre de Obra', color: '#e8873a', acc: 'capacete' },
  { id: 'merlin', name: 'Merlin', color: '#9b7bea', acc: 'mago' },
  { id: 'ninja', name: 'Ninja', color: '#8a93a3', acc: 'ninja' },
  { id: 'pirata', name: 'Barba Rubra', color: '#d9534f', acc: 'pirata' },
  { id: 'dj', name: 'DJ Bit', color: '#5aa7e8', acc: 'fone' },
  { id: 'chef', name: 'Chef', color: '#e57f9b', acc: 'chef' },
  { id: 'bip', name: 'Bip', color: '#6fcf97', acc: 'antena' },
  { id: 'brisa', name: 'Brisa', color: '#e0b04a', acc: 'oculos' },
]

// The main session, at the head of the pane.
export const BOSS: Char = { id: 'rei', name: 'Rei Clawd', color: '#d97757', acc: 'coroa' }

// The character each agent type prefers; a type not listed takes a free one.
const TYPE_CHAR: Record<string, string> = {
  'general-purpose': 'clawd',
  Explore: 'lupa',
  Plan: 'mestre',
  'claude-code-guide': 'merlin',
  'code-review': 'ninja',
  'security-review': 'pirata',
  'nimble:nimble-researcher': 'dj',
  'nimble:nimble-analyst': 'dj',
  'brand-voice:content-generation': 'chef',
  'statusline-setup': 'bip',
}

const PREFERRED = new Set(Object.values(TYPE_CHAR))

// The type's own character when it is free, else one no type prefers, else any free one.
export function pickChar(type: string, busy: ReadonlySet<string>): string {
  const own = TYPE_CHAR[type] ?? TYPE_CHAR[type.split(':').pop() ?? '']
  if (own !== undefined && !busy.has(own)) return own
  const spare = CHARS.find(c => !busy.has(c.id) && !PREFERRED.has(c.id)) ?? CHARS.find(c => !busy.has(c.id))
  return (spare ?? CHARS[busy.size % CHARS.length]!).id
}

export function charOf(id: string): Char {
  return CHARS.find(c => c.id === id) ?? CHARS[0]!
}

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(v => f(v).toString(16).padStart(2, '0')).join('')
}

const R = (x: number, y: number, c: string) => `<rect x="${x}" y="${y}" width="1.04" height="1.04" fill="${c}"/>`
const row = (y: number, x1: number, x2: number, c: string) => {
  let s = ''
  for (let x = x1; x <= x2; x++) s += R(x, y, c)
  return s
}
const pts = (l: readonly (readonly [number, number])[], c: string) => l.map(([x, y]) => R(x, y, c)).join('')

// `shine` lights its top-left corner; the king goes without, since at 3px a cell it reads as a raised brow.
function body(C: string, shine = true): string {
  const D = shade(C, -0.3)
  const L = shade(C, 0.28)
  let s = ''
  for (let y = 5; y <= 7; y++) s += row(y, 5, 12, C)
  for (let y = 8; y <= 9; y++) s += row(y, 3, 14, C)
  s += row(10, 5, 12, C) + row(11, 5, 12, D)
  return s + (shine ? R(5, 5, L) + R(6, 5, L) : '') + R(3, 8, L) + R(3, 9, D) + R(14, 9, D)
}

export type Eyes = 'normal' | 'happy' | 'closed' | 'x'

const EYE = '#141416'
const EYES: Record<Eyes, readonly (readonly [number, number])[]> = {
  normal: [[6, 6], [6, 7], [11, 6], [11, 7]],
  happy: [[7, 6], [6, 7], [8, 7], [10, 6], [9, 7], [11, 7]],
  closed: [[5, 7], [6, 7], [7, 7], [10, 7], [11, 7], [12, 7]],
  x: [[5, 6], [7, 6], [6, 7], [10, 6], [12, 6], [11, 7]],
}
const LEG_A = [[5, 12], [5, 13], [7, 12], [7, 13], [10, 12], [10, 13], [12, 12], [12, 13]] as const
const LEG_B = [[5, 12], [4, 13], [7, 12], [6, 13], [10, 12], [11, 13], [12, 12], [13, 13]] as const

const STEP = 'dur=".32s" calcMode="discrete" repeatCount="indefinite"'

function acc(a: string | null): string {
  switch (a) {
    case 'capacete': {
      const Y = '#f5c542', Yd = '#c99a1e', Yl = '#ffe08a'
      return row(2, 7, 10, Y) + row(3, 6, 11, Y) + R(8, 2, Yl) + R(8, 3, Yl) + row(4, 4, 13, Yd)
    }
    case 'mago': {
      const P = '#6b4bc4', Pd = '#4a3290', S = '#ffe066'
      return R(10, 0, P) + row(1, 8, 9, P) + row(2, 7, 10, P) + row(3, 6, 11, P) + R(8, 2, S) + R(10, 3, S) + row(4, 4, 13, Pd)
    }
    case 'chef': {
      const W = '#f4f4f6', G = '#c9c9cf'
      return row(0, 7, 10, W) + row(1, 5, 12, W) + row(2, 5, 12, W) + row(3, 6, 11, W) + row(4, 6, 11, G) + R(6, 1, '#ffffff')
    }
    case 'fone': {
      const K = '#2b2d33', H = '#ff5d8f'
      return row(3, 6, 11, K) + R(5, 4, K) + R(12, 4, K) + R(4, 5, K) + R(13, 5, K) + R(3, 5, H) + row(6, 3, 4, H) + row(7, 3, 4, H) +
        R(14, 5, H) + R(13, 6, H) + R(14, 6, H) + R(13, 7, H) + R(14, 7, H) + R(4, 6, shade(H, 0.3))
    }
    case 'ninja': {
      const B = '#23262e', T = '#e5484d'
      return row(5, 5, 12, B) + R(13, 5, T) + R(14, 4, T) + R(14, 6, T) + R(15, 5, T)
    }
    case 'pirata': {
      const Rd = '#c0392b', W = '#f4f4f6', K = '#0d0d0f'
      return row(3, 6, 11, Rd) + row(4, 5, 12, Rd) + R(7, 3, W) + R(10, 4, W) + R(13, 4, Rd) + R(14, 5, Rd) + R(14, 3, Rd) + row(6, 5, 7, K) + row(7, 5, 7, K) + R(8, 5, K)
    }
    case 'antena': {
      const K = '#3c3f47', G = '#a3e635'
      const glow = `<g>${R(6, 2, G)}${R(11, 2, G)}<animate attributeName="opacity" values="1;.35" dur="1.2s" calcMode="discrete" repeatCount="indefinite"/></g>`
      return R(6, 3, K) + R(6, 4, K) + R(11, 3, K) + R(11, 4, K) + glow
    }
    case 'oculos': {
      const K = '#121214', Gl = '#55555e'
      return row(6, 5, 12, K) + row(7, 5, 7, K) + row(7, 10, 12, K) + R(5, 6, Gl) + R(10, 6, Gl)
    }
    case 'lupa': {
      const Kh = '#c8a96a', Kd = '#9c7f45', Ring = '#d9dde5', Lens = '#7fd3ff', Hd = '#6b4f2a'
      return row(3, 6, 11, Kh) + row(4, 4, 13, Kd) + R(15, 4, Ring) + R(14, 5, Ring) + R(16, 5, Ring) + R(15, 6, Ring) + R(15, 5, Lens) + R(14, 7, Hd)
    }
    case 'coroa': {
      const G = '#ffd34d', Gd = '#d9a521', Rb = '#e5484d'
      return R(6, 2, G) + R(8, 2, G) + R(9, 2, G) + R(11, 2, G) + row(3, 6, 11, G) + row(4, 6, 11, Gd) + R(8, 3, Rb) + R(9, 3, Rb)
    }
    default:
      return ''
  }
}

// One crab as a <g>, its top-left at (x, y), each grid cell `scale` pixels.
// Walking alternates its legs and bobs it; normal eyes blink now and then.
export function crab(c: Char, x: number, y: number, scale: number, isWalking: boolean, eyes: Eyes): string {
  const legColor = shade(c.color, -0.3)
  const legsA = isWalking ? `<g>${pts(LEG_A, legColor)}<animate attributeName="opacity" values="1;0" ${STEP}/></g>` : pts(LEG_A, legColor)
  const legsB = isWalking ? `<g opacity="0">${pts(LEG_B, legColor)}<animate attributeName="opacity" values="0;1" ${STEP}/></g>` : ''
  const blink = eyes === 'normal' ? '<animate attributeName="opacity" values="1;0;1" keyTimes="0;.95;.98" dur="4.2s" calcMode="discrete" repeatCount="indefinite"/>' : ''
  const bob = isWalking ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -.5" ${STEP}/>` : ''
  return [
    `<g transform="translate(${x} ${y}) scale(${scale})" shape-rendering="crispEdges"><g>`,
    body(c.color, c.acc !== 'coroa'),
    `<g>${pts(EYES[eyes], EYE)}${blink}</g>`,
    legsA,
    legsB,
    acc(c.acc),
    bob,
    '</g></g>',
  ].join('')
}

/* ---------------- the king beside the HUD card ---------------- */

// What hovers by the Rei Clawd: a thought cloud, a question balloon, or work sparks.
export type Aside = 'thought' | 'question' | 'sparks' | null

// 3px a cell: the crab fills x 2..38, y 12..48; the corner above its right shoulder holds the aside.
export const SCENE = { width: 50, height: 50 } as const

const BUBBLE = '#26262a'
const BUBBLE_EDGE = '#4a4a50'

function thought(): string {
  const dot = (cx: number, begin: string) =>
    `<circle cx="${cx}" cy="8" r="1.2" fill="#c9c9cf" opacity=".25"><animate attributeName="opacity" values=".25;1;.25" dur="1.2s" begin="${begin}" repeatCount="indefinite"/></circle>`
  const puff = (cx: number, cy: number, r: number, begin: string) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${BUBBLE}" stroke="${BUBBLE_EDGE}"><animate attributeName="opacity" values=".4;1;.4" dur="1.8s" begin="${begin}" repeatCount="indefinite"/></circle>`
  return [
    puff(33.5, 19.5, 1.3, '0s'),
    puff(35.5, 15.5, 1.8, '.3s'),
    `<g><ellipse cx="42" cy="8" rx="7.5" ry="6" fill="${BUBBLE}" stroke="${BUBBLE_EDGE}"/>`,
    dot(39, '0s'),
    dot(42, '.2s'),
    dot(45, '.4s'),
    '<animateTransform attributeName="transform" type="translate" values="0 0;0 -1;0 0" dur="2.4s" repeatCount="indefinite"/></g>',
  ].join('')
}

function question(): string {
  const A = '#e0b04a'
  return [
    `<rect x="34" y="0" width="16" height="14" rx="4" fill="${A}"/>`,
    `<path d="M36 13 L32 18 L41 13 Z" fill="${A}"/>`,
    `<text x="42" y="7" text-anchor="middle" dominant-baseline="central" font-family="Inter, 'Segoe UI', system-ui, sans-serif" font-size="11" font-weight="700" fill="#151517">?`,
    '<animateTransform attributeName="transform" type="translate" values="0 0;0 -1.5;0 0" dur=".9s" repeatCount="indefinite"/></text>',
  ].join('')
}

function sparks(): string {
  const spark = (x: number, y: number, dx: number, begin: string) =>
    `<rect x="${x}" y="${y}" width="2" height="2" fill="#ffd34d" opacity="0">` +
    `<animate attributeName="opacity" values="0;1;0" dur=".9s" begin="${begin}" repeatCount="indefinite"/>` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;${dx} -8" dur=".9s" begin="${begin}" repeatCount="indefinite"/></rect>`
  return spark(40, 36, 5, '0s') + spark(38, 40, 6, '.3s') + spark(0, 38, -2, '.6s') + spark(41, 30, 3, '.45s')
}

// The Rei Clawd in place, 3px a cell: walking it shuffles side to side, otherwise it breathes.
// SVG the app plays by itself: no animation here costs a token.
export function kingScene(isWalking: boolean, eyes: Eyes, aside: Aside): string {
  const sway = isWalking
    ? '<animateTransform attributeName="transform" type="translate" values="0 0;1.5 0;0 0;-1.5 0;0 0" dur=".64s" repeatCount="indefinite"/>'
    : '<animateTransform attributeName="transform" type="translate" values="0 0;0 -.8;0 0" dur="2.6s" repeatCount="indefinite"/>'
  const extra = aside === 'thought' ? thought() : aside === 'question' ? question() : aside === 'sparks' ? sparks() : ''
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SCENE.width}" height="${SCENE.height}" viewBox="0 0 ${SCENE.width} ${SCENE.height}" overflow="hidden">`,
    `<g>${crab(BOSS, -7, 6, 3, isWalking, eyes)}${sway}</g>`,
    extra,
    '</svg>',
  ].join('')
}
