// Each subagent's Clawd: its pose says what that subagent is doing, from the engine's
// own events. A copy of the usage-hud's Rei Clawd (hooks/clawd.ts there), without the
// crown, which stays with the main session's king; the two mods share no code.

export type ClawdKind =
  | 'parado'
  | 'pensando'
  | 'lendo'
  | 'editando'
  | 'terminal'
  | 'web'
  | 'orquestrando'
  | 'trabalhando'
  | 'esperando'
  | 'aguardando'
  | 'compactando'
  | 'concluido'
  | 'interrompido'
  | 'erro'

export const CLAWD_LABEL: Record<ClawdKind, string> = {
  parado: 'parado',
  pensando: 'pensando',
  lendo: 'lendo arquivos',
  editando: 'editando',
  terminal: 'no terminal',
  web: 'na web',
  orquestrando: 'orquestrando subagents',
  trabalhando: 'trabalhando',
  esperando: 'esperando você',
  aguardando: 'aguardando segundo plano',
  compactando: 'compactando',
  concluido: 'concluído',
  interrompido: 'interrompido',
  erro: 'erro',
}

const READ = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead'])
const EDIT = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const SHELL = new Set(['Bash', 'PowerShell', 'BashOutput', 'KillShell', 'Monitor'])
const WEB = new Set(['WebSearch', 'WebFetch'])
const AGENTS = new Set(['Agent', 'Task', 'Workflow', 'SendMessage'])
export const ASKS = new Set(['AskUserQuestion', 'ExitPlanMode'])

// The pose a main-loop tool call puts him in.
export function toolKind(tool: string): ClawdKind {
  if (READ.has(tool)) return 'lendo'
  if (EDIT.has(tool)) return 'editando'
  if (SHELL.has(tool)) return 'terminal'
  if (WEB.has(tool) || /browser|chrome|navigate|web_?fetch|web_?search/i.test(tool)) return 'web'
  if (AGENTS.has(tool)) return 'orquestrando'
  if (ASKS.has(tool)) return 'esperando'
  return 'trabalhando'
}

/* ---------------- pixels ---------------- */

const C: Record<string, string> = {
  y: '#ffd34d', Y: '#d9a521', r: '#e5484d', d: '#d97757', s: '#98533d', e: '#e49d86', k: '#141416',
  w: '#f2f2f5', g: '#a1a1a6', c: '#c9c9cf', l: '#a3e635', p: '#e49d86',
}

const BODY = [
  '            ', '            ', '            ', '  dddddddd  ', '  dkddddkd  ', '  dkddddkd  ',
  'eddddddddddd', 'sdddddddddds', '  dddddddd  ', '  ssssssss  ', '  s s  s s  ', '  s s  s s  ',
]

type Eyes = 'open' | 'up' | 'down' | 'half' | 'happy' | 'angry' | 'dizzy' | 'squint'
const EYES: Record<Eyes, readonly [string, string]> = {
  open: ['  dkddddkd  ', '  dkddddkd  '],
  up: ['  ddkdddkd  ', '  dddddddd  '],
  down: ['  dddddddd  ', '  ddkdddkd  '],
  half: ['  dddddddd  ', '  kkkddkkk  '],
  happy: ['  ddkddkdd  ', '  dkdkkdkd  '],
  angry: ['  kdkddkdk  ', '  dkddddkd  '],
  dizzy: ['  dddddddd  ', '  kdkddkdk  '],
  squint: ['  dkddddkd  ', '  ddkddkdd  '],
}

const num = (n: number) => String(+n.toFixed(2))

function px(rows: readonly string[], dx = 0, dy = 0, sz = 1): string {
  let out = ''
  rows.forEach((line, y) => {
    for (let x = 0; x < line.length; x++) {
      const ch = line[x]
      if (ch === ' ' || ch === undefined) continue
      out += `<rect x="${num(dx + x * sz)}" y="${num(dy + y * sz)}" width="${sz}" height="${sz}" fill="${C[ch]}"/>`
    }
  })
  return out
}

function body(eyes: Eyes): string {
  const rows = [...BODY]
  rows[4] = EYES[eyes][0]
  rows[5] = EYES[eyes][1]
  return px(rows)
}

const BLINK = '<rect class="blink" x="2" y="4" width="8" height="2" fill="#d97757"/>'
const PAGE = '<rect x="13" y="1.5" width="5" height="7" rx=".3" fill="#f2f2f5"/>'

const ART: Record<ClawdKind, () => string> = {
  parado: () => `<g class="bob-slow">${body('open')}${BLINK}</g>`,
  pensando: () =>
    `<g class="tilt">${body('up')}</g>` +
    '<rect x="10.5" y="-5.4" width="7" height="3.6" rx="1.2" fill="#2a2a2d"/><path d="M11.4 -1.9 L10.8 -.5 L12.8 -1.9 Z" fill="#2a2a2d"/>' +
    '<circle class="tdot" cx="12.3" cy="-3.6" r=".55" fill="#c9c9cf"/><circle class="tdot d2" cx="14" cy="-3.6" r=".55" fill="#c9c9cf"/><circle class="tdot d3" cx="15.7" cy="-3.6" r=".55" fill="#c9c9cf"/>',
  lendo: () =>
    `<g class="bob-slow">${body('down')}${BLINK}</g>${PAGE}` +
    '<rect x="13.7" y="2.6" width="3.4" height=".45" fill="#a1a1a6"/><rect x="13.7" y="3.9" width="2.6" height=".45" fill="#a1a1a6"/>' +
    '<rect x="13.7" y="5.2" width="3.4" height=".45" fill="#a1a1a6"/><rect x="13.7" y="6.5" width="2" height=".45" fill="#a1a1a6"/>' +
    '<g class="scan"><circle cx="14.4" cy="3.4" r="1.25" fill="rgba(96,165,250,.25)" stroke="#c9c9cf" stroke-width=".45"/>' +
    '<path d="M15.3 4.3 L16.8 5.8" stroke="#98533d" stroke-width=".7" stroke-linecap="round"/></g>',
  editando: () =>
    `<g class="bob-slow">${body('down')}</g>${PAGE}` +
    '<rect class="write" x="13.7" y="2.8" width="3.4" height=".45" fill="#a3e635"/>' +
    '<rect class="write w2" x="13.7" y="4.3" width="2.8" height=".45" fill="#a3e635"/>' +
    '<rect x="13.7" y="5.8" width="3" height=".45" fill="#a1a1a6"/>' +
    `<g class="pen">${px(['    p', '   y ', '  y  ', ' Y   ', 'k    '], 13.4, -1.3, 0.8)}</g>`,
  terminal: () =>
    `<g class="bob-fast">${body('open')}</g>` +
    '<rect x="12" y="1" width="7" height="6.2" rx=".5" fill="#2a2a2d"/>' +
    '<circle cx="12.6" cy="1.5" r=".2" fill="#e5484d"/><circle cx="13.2" cy="1.5" r=".2" fill="#ffd34d"/><circle cx="13.8" cy="1.5" r=".2" fill="#a3e635"/>' +
    '<rect x="12.4" y="2" width="6.2" height="4.8" fill="#141416"/>' +
    px(['l ', ' l', 'l '], 12.8, 2.5, 0.4) +
    '<rect class="type" x="14" y="2.8" width="3.6" height=".45" fill="#a3e635"/>' +
    '<rect x="12.8" y="4.2" width="4.2" height=".45" fill="#85858b"/>' +
    '<rect class="key-on" x="12.8" y="5.5" width=".6" height=".8" fill="#a3e635"/>',
  web: () =>
    `<g class="bob-slow">${body('up')}${BLINK}</g>` +
    '<circle cx="15.5" cy="3.5" r="3" fill="#1d4ed8" stroke="#93c5fd" stroke-width=".35"/>' +
    '<ellipse class="spin" cx="15.5" cy="3.5" rx="1.4" ry="3" fill="none" stroke="#93c5fd" stroke-width=".3"/>' +
    '<path d="M12.5 3.5 H18.5 M13 2 H18 M13 5 H18" stroke="#93c5fd" stroke-width=".25"/>',
  orquestrando: () =>
    `<g class="bob-slow">${body('up')}</g>` +
    '<path class="link" d="M15.5 1.6 L12.9 -2.6 M15.5 1.6 L15.5 -2.6 M15.5 1.6 L18.1 -2.6" stroke="#525257" stroke-width=".3" fill="none"/>' +
    '<rect class="agent" x="12.2" y="-4.2" width="1.4" height="1.4" fill="#d97757"/>' +
    '<rect class="agent a2" x="14.8" y="-4.2" width="1.4" height="1.4" fill="#d97757"/>' +
    '<rect class="agent a3" x="17.4" y="-4.2" width="1.4" height="1.4" fill="#d97757"/>' +
    '<rect x="12" y="1.6" width="7" height="5" rx=".4" fill="#2a2a2d"/><rect x="12.6" y="2.2" width="5.8" height="3.6" fill="#141416"/>' +
    '<rect class="screen-line" x="13.1" y="2.7" width="3.4" height=".5" fill="#a3e635"/>' +
    '<rect class="screen-line l2" x="13.1" y="3.8" width="4.4" height=".5" fill="#a3e635"/>' +
    '<rect class="screen-line" x="13.1" y="4.9" width="2.4" height=".5" fill="#a3e635"/>' +
    '<rect x="15" y="6.6" width="1" height=".9" fill="#2a2a2d"/><rect x="13.8" y="7.5" width="3.4" height=".5" rx=".2" fill="#2a2a2d"/>',
  trabalhando: () =>
    `<g class="bob-fast">${body('open')}</g>` +
    '<rect x="12" y="8" width="7" height="1.4" rx=".4" fill="#2a2a2d"/>' +
    '<rect class="key-on" x="12.8" y="8.3" width=".8" height=".7" fill="#a1a1a6"/>' +
    '<rect class="key-on k2" x="14.6" y="8.3" width=".8" height=".7" fill="#a3e635"/>' +
    '<rect class="key-on k3" x="16.4" y="8.3" width=".8" height=".7" fill="#a1a1a6"/>',
  esperando: () =>
    `<g class="bob-slow">${body('open')}${BLINK}</g>` +
    '<g class="pop"><rect x="11" y="-5.6" width="6" height="5" rx="1.2" fill="#2a2a2d"/><path d="M12 -.8 L11.4 .6 L13.6 -.8 Z" fill="#2a2a2d"/>' +
    `${px(['yyy', '  y', ' yy', '   ', ' y '], 12.75, -5.1, 0.85)}</g>`,
  aguardando: () =>
    `<g class="bob-slow">${body('half')}</g>` +
    `<g class="hourglass">${px(['ggggg', ' yyy ', '  y  ', ' y y ', 'ggggg'], 13, 1.5, 0.8)}</g>`,
  compactando: () =>
    `<g class="squeeze">${body('squint')}</g>` +
    '<path class="arrow" d="M14.2 -3.4 L15.5 -2 L16.8 -3.4 Z" fill="#a3e635"/>' +
    '<rect x="12.6" y="-1.4" width="5.8" height=".8" rx=".2" fill="#a1a1a6"/>' +
    '<g class="squish"><rect x="13" y="0" width="5" height="1.6" fill="#f2f2f5"/><rect x="13" y="2" width="5" height="1.6" fill="#c9c9cf"/>' +
    '<rect x="13" y="4" width="5" height="1.6" fill="#f2f2f5"/><rect x="13" y="6" width="5" height="1.6" fill="#c9c9cf"/></g>',
  concluido: () =>
    `<g class="bounce">${body('happy')}</g>` +
    `<g class="pop">${px(['    l', '   l ', 'l l  ', ' l   '], 13, -3.6, 0.9)}</g>` +
    '<path class="spark" d="M-.6 0 L0 .8 L.6 0 L0 -.8 Z" fill="#ffd34d"/>' +
    '<path class="spark s2" d="M12 5 L12.4 5.6 L12.8 5 L12.4 4.4 Z" fill="#ffd34d"/>',
  interrompido: () =>
    `<g class="shake">${body('angry')}</g>` +
    '<path class="drop" d="M13.5 1 Q14.3 2.1 14.3 2.6 A.8 .8 0 0 1 12.7 2.6 Q12.7 2.1 13.5 1 Z" fill="#7dd3fc"/>',
  erro: () =>
    `<g transform="translate(0 .5)">${body('dizzy')}</g>` +
    `<g class="alarm">${px(['r', 'r', 'r', ' ', 'r'], 13.5, -4.5, 0.9)}</g>`,
}

const STYLE = `
svg *{transform-box:fill-box}
.bob-slow{animation:bob 2.6s ease-in-out infinite}
.bob-fast{animation:bobFast .32s steps(1) infinite}
.bounce{animation:bounce .6s ease-in-out infinite}
.shake{animation:shake .24s steps(2) infinite}
.tilt{transform-origin:50% 100%;animation:tilt 3s ease-in-out infinite}
.squeeze{transform-origin:50% 100%;animation:squeeze 1.6s ease-in-out infinite}
.blink{animation:blink 4.2s linear infinite;opacity:0}
.key-on{animation:keyOn .9s steps(1) infinite}.k2{animation-delay:.3s}.k3{animation-delay:.6s}
.tdot{animation:tdot 1.2s ease-in-out infinite;opacity:.3}.d2{animation-delay:.2s}.d3{animation-delay:.4s}
.scan{animation:scan 2.4s ease-in-out infinite}
.write{transform-origin:0 50%;animation:write 2.4s steps(6) infinite}.w2{animation-delay:1.2s}
.pen{animation:pen 2.4s linear infinite}
.type{transform-origin:0 50%;animation:write 1.2s steps(5) infinite}
.spin{transform-origin:50% 50%;animation:spin 1.6s linear infinite}
.agent{animation:agent 1.8s steps(1) infinite}.a2{animation-delay:.6s}.a3{animation-delay:1.2s}
.screen-line{animation:flick .5s steps(1) infinite}.l2{animation-delay:.25s}
.link{stroke-dasharray:.6 .6;animation:dash .8s linear infinite}
.pop{transform-origin:30% 100%;animation:pop 1.6s ease-in-out infinite}
.hourglass{transform-origin:50% 50%;animation:flip 2.4s ease-in-out infinite}
.squish{transform-origin:50% 100%;animation:squish 1.6s ease-in-out infinite}
.arrow,.alarm{animation:keyOn .8s steps(1) infinite}
.spark{transform-origin:50% 50%;animation:twinkle 1.4s ease-in-out infinite;opacity:0}.s2{animation-delay:.5s}
.drop{animation:drop 1.6s ease-in infinite;opacity:0}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-.8px)}}
@keyframes bobFast{0%{transform:translateY(0)}50%{transform:translateY(-.5px)}}
@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}
@keyframes shake{0%{transform:translateX(-.4px)}50%{transform:translateX(.4px)}}
@keyframes tilt{0%,100%{transform:rotate(0)}30%,60%{transform:rotate(-5deg)}}
@keyframes squeeze{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.92)}}
@keyframes blink{0%,93%{opacity:0}95%,97%{opacity:1}99%,100%{opacity:0}}
@keyframes keyOn{0%{opacity:1}50%{opacity:0}}
@keyframes tdot{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-.4px)}}
@keyframes scan{0%,100%{transform:translate(0,0)}25%{transform:translate(1.6px,0)}50%{transform:translate(1.6px,2.6px)}75%{transform:translate(0,2.6px)}}
@keyframes write{0%{transform:scaleX(0)}100%{transform:scaleX(1)}}
@keyframes pen{0%{transform:translate(0,0)}45%{transform:translate(3px,0)}50%{transform:translate(0,1.5px)}95%{transform:translate(2.6px,1.5px)}100%{transform:translate(0,0)}}
@keyframes spin{0%{transform:scaleX(1)}50%{transform:scaleX(.1)}100%{transform:scaleX(1)}}
@keyframes agent{0%{opacity:.25}33%{opacity:1}66%,100%{opacity:.25}}
@keyframes flick{0%{opacity:1}50%{opacity:.2}}
@keyframes dash{to{stroke-dashoffset:-1.2}}
@keyframes pop{0%,100%{transform:scale(1)}10%{transform:scale(1.15)}20%{transform:scale(1)}}
@keyframes flip{0%,70%{transform:rotate(0)}85%,100%{transform:rotate(180deg)}}
@keyframes squish{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.45)}}
@keyframes twinkle{0%,100%{opacity:0;transform:scale(.6)}50%{opacity:1;transform:scale(1)}}
@keyframes drop{0%{opacity:0;transform:translateY(0)}20%{opacity:1}100%{opacity:0;transform:translateY(5px)}}
@media (prefers-reduced-motion:reduce){*{animation-play-state:paused!important}}`

// The size in the band's rows: the usage-hud draws the same viewBox at 48 x 46.
export const CLAWD_SIZE = { width: 34, height: 33 } as const

// The whole drawing for one pose, with its title as the tooltip.
export function clawdSvg(kind: ClawdKind): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CLAWD_SIZE.width}" height="${CLAWD_SIZE.height}" viewBox="-1 -6 20 19" shape-rendering="crispEdges" overflow="visible">`,
    `<title>Clawd: ${CLAWD_LABEL[kind]}</title>`,
    `<style>${STYLE}</style>`,
    ART[kind](),
    '</svg>',
  ].join('')
}

/* ---------------- the bar ---------------- */

type Rgb = readonly [number, number, number]
export const CLAUDE_ORANGE: Rgb = [217, 119, 87]
export const CLAUDE = '#d97757'

export const baseColor = (base: Rgb, alpha: number) => `rgba(${base.join(',')},${alpha})`

// A walking mini Clawd, 16x10, its feet on y=0 and centred on x=0, painted `color`.
export function miniClawd(color: string, isHopping: boolean): string {
  const rows = [' cccccc ', ' ckcckc ', 'cccccccc', ' cccccc ']
  let cells = ''
  rows.forEach((line, y) =>
    [...line].forEach((ch, x) => {
      if (ch !== ' ') cells += `<rect x="${x * 2 - 8}" y="${y * 2 - 10}" width="2" height="2" fill="${ch === 'k' ? '#141416' : color}"/>`
    }),
  )
  const legs = (xs: number[]) => xs.map(x => `<rect x="${x * 2 - 8}" y="-2" width="2" height="2" fill="${color}"/>`).join('')
  const step = 'dur=".5s" repeatCount="indefinite" calcMode="discrete"'
  const hop = isHopping
    ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -1.5" ${step}/>`
    : `<animateTransform attributeName="transform" type="translate" values="0 0;0 -.6" ${step}/>`
  return [
    `<g shape-rendering="crispEdges"><g>${hop}${cells}`,
    `<g>${legs([1, 3, 5, 7])}<animate attributeName="opacity" values="1;0" ${step}/></g>`,
    `<g opacity="0">${legs([0, 2, 4, 6])}<animate attributeName="opacity" values="0;1" ${step}/></g>`,
    '</g></g>',
  ].join('')
}
