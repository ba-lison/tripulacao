// Gera as imagens do README a partir do próprio código do mod (hooks/clawd.ts),
// para o README mostrar exatamente os Clawds, a barra e o mini Clawd que aparecem no app.
// O layout de cada linha copia o de hooks/register.tsx: se ele mudar, ajuste aqui também.
// Rodar na raiz do repositório: node docs/gerar-imagens.mjs  (Node 22.18+)
import fs from 'node:fs'

import { CLAUDE, CLAUDE_ORANGE, CLAWD_LABEL, baseColor, clawdSvg, miniClawd } from '../hooks/clawd.ts'

const SANS = "Inter, -apple-system, 'Segoe UI', system-ui, sans-serif"
const MONO = "'JetBrains Mono','Cascadia Code',Consolas,Menlo,monospace"
const INK = { subtle: '#8a8a90', inactive: '#4d4d52', detail: '#85858b', faded: '#6e6e73', text: '#f2f2f5', lime: '#a3e635', sep: '#3f3f44' }
// As cores de status de hooks/register.tsx (STATUS).
const STATUS = { thinking: '#5aa7e8', waiting: '#e0b04a', done: '#a3e635', error: '#e5484d' }
const BAR = 140

const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// O Clawd de uma pose, como o mod desenha, em (x, y) com largura w.
function clawd(kind, x, y, w = 34) {
  const h = (w * 33) / 34
  return clawdSvg(kind).replace(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="34" height="33"/, `<svg x="${x}" y="${y}" width="${w}" height="${h}"`)
}

function frame(width, height, inner, { title = '', defs = '' } = {}) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${SANS}" style="font-variant-numeric:tabular-nums">`,
    title ? `<title>${esc(title)}</title>` : '',
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121214"/><stop offset="1" stop-color="#0a0a0b"/></linearGradient>${defs}</defs>`,
    `<rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="16" fill="url(#bg)" stroke="#232326"/>`,
    inner,
    '</svg>',
  ].join('\n')
}

function button(x, y, label, { primary = false, w, h = 24, dim = false } = {}) {
  const width = w ?? 16 + label.length * 7
  return [
    `<rect x="${x + 0.5}" y="${y + 0.5}" width="${width}" height="${h}" rx="6" fill="${primary ? CLAUDE : '#2a2a2d'}"/>`,
    `<text x="${x + width / 2}" y="${y + h / 2 + 0.5}" text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="500" fill="${primary ? '#fff' : dim ? INK.detail : INK.text}">${esc(label)}</text>`,
  ].join('')
}

// A barra de tarefa, como taskBar() em register.tsx: o fio laranja e o mini Clawd na ponta.
function taskBar(id, x, cy, pct, isHopping, width = BAR) {
  const w = (Math.min(Math.max(pct, 0), 100) / 100) * width
  return [
    `<linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="${baseColor(CLAUDE_ORANGE, 0.45)}"/><stop offset="1" stop-color="${CLAUDE}"/></linearGradient>`,
    `<rect x="${x}" y="${cy - 1}" width="${width}" height="2" rx="1" fill="#fff" fill-opacity=".07"/>`,
    `<rect x="${x}" y="${cy - 1}" width="${w}" height="2" rx="1" fill="url(#${id})"/>`,
    `<g transform="translate(${x + Math.max(w, 8)} ${cy + 1})">${miniClawd(CLAUDE, isHopping)}</g>`,
  ].join('')
}

// O cabeçalho da faixa: a contagem à esquerda e o botão de ocultar, separado, à direita.
function header(x, y, right, text, isFolded) {
  const label = isFolded ? '▸ Mostrar' : '▾ Ocultar'
  return [
    `<text x="${x}" y="${y}" dominant-baseline="central" font-size="13" fill="${INK.subtle}">${esc(text)}</text>`,
    button(right - 86, y - 12, label, { w: 86 }),
  ].join('')
}

// Uma linha por subagente, nas colunas de register.tsx: Clawd, tipo, modelo, barra, %,
// tokens / janela, tempo, atividade e o botão Parar enquanto ele roda.
function row(i, x, cy, m) {
  const pctText = m.pct === null ? '—' : `${m.pct}%`
  const actColor = m.status === 'working' ? INK.subtle : STATUS[m.status]
  const at = `y="${cy}" dominant-baseline="central"`
  return [
    clawd(m.kind, x, cy - 19, 34),
    `<text x="${x + 46}" ${at} font-size="13" fill="${INK.subtle}">${esc(m.type)}</text>`,
    `<text x="${x + 126}" ${at} font-size="13" fill="${CLAUDE}">${esc(m.model)}</text>`,
    taskBar(`b${i}`, x + 204, cy, m.pct ?? 0, m.status === 'working'),
    `<text x="${x + 360}" ${at} font-size="13" fill="${m.pct === null ? INK.inactive : CLAUDE}">${pctText}</text>`,
    `<text x="${x + 498}" ${at} font-size="13" text-anchor="end" fill="${INK.subtle}">${esc(m.tokens)}</text>`,
    `<text x="${x + 508}" ${at} font-size="13" fill="${INK.subtle}">${esc(m.time)} ·</text>`,
    `<text x="${x + 566}" ${at} font-size="13" fill="${actColor}">${esc(m.activity)}</text>`,
    m.running ? button(x + 744, cy - 12, '■ Parar', { w: 66, dim: true }) : '',
  ].join('')
}

const CREW = [
  { kind: 'lendo', type: 'Explore', model: 'Haiku 5.5', pct: 63, tokens: '41k / 1M', time: '01:12', activity: 'Grep "checkout" em src', status: 'working', running: true },
  { kind: 'editando', type: 'general', model: 'Sonnet 5.5', pct: 38, tokens: '88k / 1M', time: '02:40', activity: 'Edit …/hooks/register.tsx', status: 'working', running: true },
  { kind: 'pensando', type: 'Plan', model: 'Opus 5.5', pct: null, tokens: '19k / 1M', time: '00:31', activity: 'Pensando…', status: 'thinking', running: true },
  { kind: 'concluido', type: 'review', model: 'Haiku 5.5', pct: 100, tokens: '23k / 1M', time: '01:05', activity: 'Devolveu o resultado', status: 'done', running: false },
]

// A janela do app: o cartão do usage-hud acima, a faixa da Tripulação e o campo de mensagem.
function appChrome(width, bandTop, bandBottom) {
  return [
    `<circle cx="26" cy="24" r="5.5" fill="#ff5f57"/><circle cx="44" cy="24" r="5.5" fill="#febc2e"/><circle cx="62" cy="24" r="5.5" fill="#28c840"/>`,
    `<text x="${width / 2}" y="28" text-anchor="middle" font-size="12" fill="#4d4d52">Claude Code</text>`,
    // O usage-hud, resumido, para mostrar onde a faixa se encaixa.
    `<rect x="30.5" y="48.5" width="${width - 61}" height="42" rx="10" fill="#151517" stroke="#2a2a2d" opacity=".55"/>`,
    `<text x="52" y="69.5" dominant-baseline="central" font-size="12" fill="#4d4d52">usage-hud · Janela 5h · Contexto</text>`,
    button(width - 146, 57, 'Gerar handoff', { w: 104, dim: true }),
    `<rect x="30.5" y="${bandBottom + 14.5}" width="${width - 61}" height="44" rx="12" fill="#151517" stroke="#2a2a2d"/>`,
    `<text x="52" y="${bandBottom + 37}" dominant-baseline="central" font-size="13" fill="#4d4d52">Responda ao Claude…</text>`,
  ].join('')
}

/* ---------------- faixa: a Tripulação no app, com quatro subagentes ---------------- */

function band() {
  const W = 900
  const top = 112
  const inner = [
    appChrome(W, top, top + 236),
    header(40, top, W - 40, 'Subagentes · 3 ativos · 171k tokens', false),
    ...CREW.map((m, i) => row(i, 34, top + 48 + i * 52, m)),
  ].join('')
  return frame(W, top + 236 + 76, inner, { title: 'A faixa da Tripulação acima do campo de mensagem: quatro subagentes, cada um com o seu Clawd, a barra de tarefa e o botão Parar' })
}

/* ---------------- oculta: só o cabeçalho, com o botão Mostrar ---------------- */

function folded() {
  const W = 900
  const inner = [
    `<text x="40" y="26" dominant-baseline="central" font-size="11" fill="${INK.faded}">faixa aberta</text>`,
    header(40, 56, W - 40, 'Subagentes · 3 ativos · 171k tokens', false),
    row(9, 34, 100, CREW[0]),
    `<line x1="40" y1="138" x2="${W - 40}" y2="138" stroke="#232326"/>`,
    `<text x="40" y="160" dominant-baseline="central" font-size="11" fill="${INK.faded}">faixa oculta: só o cabeçalho, até você clicar em Mostrar</text>`,
    header(40, 190, W - 40, 'Subagentes · 3 ativos · 171k tokens', true),
  ].join('')
  return frame(W, 222, inner, { title: 'O botão Ocultar recolhe a faixa até o cabeçalho; o botão Mostrar abre de novo' })
}

/* ---------------- progresso: a barra segue a lista de tarefas do subagente ---------------- */

function progress() {
  const W = 900
  const steps = [
    { list: ['in_progress', 'pending', 'pending', 'pending'], pct: 13, note: 'criou a lista' },
    { list: ['completed', 'in_progress', 'pending', 'pending'], pct: 38, note: 'item 1 feito' },
    { list: ['completed', 'completed', 'in_progress', 'pending'], pct: 63, note: 'item 2 feito' },
    { list: ['completed', 'completed', 'completed', 'in_progress'], pct: 88, note: 'item 3 feito' },
    { list: ['completed', 'completed', 'completed', 'completed'], pct: 100, note: 'respondeu' },
  ]
  const mark = { completed: ['✓', STATUS.done], in_progress: ['◐', CLAUDE], pending: ['○', INK.inactive] }
  const rows = steps
    .map((s, i) => {
      const cy = 56 + i * 40
      const marks = s.list.map((st, k) => `<tspan fill="${mark[st][1]}" dx="${k ? 6 : 0}">${mark[st][0]}</tspan>`).join('')
      return [
        `<text x="40" y="${cy}" dominant-baseline="central" font-size="15" font-family="${MONO}">${marks}</text>`,
        `<text x="150" y="${cy}" dominant-baseline="central" font-size="12.5" fill="${INK.detail}">${esc(s.note)}</text>`,
        taskBar(`p${i}`, 270, cy, s.pct, s.pct < 100),
        `<text x="428" y="${cy}" dominant-baseline="central" font-size="13" font-weight="600" fill="${CLAUDE}">${s.pct}%</text>`,
      ].join('')
    })
    .join('')
  const side = [
    `<rect x="508.5" y="34.5" width="352" height="196" rx="10" fill="#151517" stroke="#2a2a2d"/>`,
    `<text x="530" y="62" font-size="13" font-weight="600" fill="${INK.text}">Como a porcentagem é contada</text>`,
    ...[
      [`<tspan fill="${STATUS.done}">✓</tspan> item concluído conta 1`],
      [`<tspan fill="${CLAUDE}">◐</tspan> item em andamento conta meio`],
      [`<tspan fill="${INK.inactive}">○</tspan> item pendente conta 0`],
      ['fica em no máximo 99% até ele responder'],
      [`<tspan fill="${INK.inactive}">—</tspan> quando o subagente não tem lista`],
    ].map(([t], k) => `<text x="530" y="${92 + k * 26}" font-size="12.5" fill="${INK.detail}">${t}</text>`),
  ].join('')
  return frame(W, 262, rows + side, { title: 'A barra de tarefa segue a lista do subagente: 13, 38, 63, 88 e 100%' })
}

/* ---------------- poses: as 14 poses e o que liga cada uma ---------------- */

function poses() {
  const list = [
    ['pensando', 'esperando o modelo'],
    ['lendo', 'Read · Grep · Glob'],
    ['editando', 'Edit · Write'],
    ['terminal', 'Bash · PowerShell'],
    ['web', 'WebSearch · WebFetch'],
    ['orquestrando', 'Agent · SendMessage'],
    ['trabalhando', 'outra ferramenta'],
    ['esperando', 'AskUserQuestion'],
    ['aguardando', 'segundo plano'],
    ['concluido', 'devolveu o resultado'],
    ['interrompido', 'Parar ou Esc'],
    ['erro', 'falhou'],
  ]
  const SHORT = { lendo: 'lendo', orquestrando: 'orquestrando', esperando: 'esperando você', aguardando: 'aguardando', terminal: 'no terminal' }
  const cols = 6
  const cw = 143
  const ch = 150
  const cells = list
    .map(([kind, ev], i) => {
      const cx = 21 + (i % cols) * cw
      const cy = 20 + Math.floor(i / cols) * ch
      return [
        `<rect x="${cx + 4.5}" y="${cy + 4.5}" width="${cw - 9}" height="${ch - 9}" rx="10" fill="#1a1a1d" stroke="#2a2a2d"/>`,
        clawd(kind, cx + cw / 2 - 32, cy + 26, 64),
        `<text x="${cx + cw / 2}" y="${cy + 108}" text-anchor="middle" font-size="12" font-weight="600" fill="${INK.text}">${esc(SHORT[kind] ?? CLAWD_LABEL[kind])}</text>`,
        `<text x="${cx + cw / 2}" y="${cy + 126}" text-anchor="middle" font-size="9.5" font-family="${MONO}" fill="${INK.lime}">${esc(ev)}</text>`,
      ].join('')
    })
    .join('')
  return frame(900, 340, cells, { title: 'As poses do Clawd de cada subagente e o que liga cada uma' })
}

/* ---------------- terminal: a mesma faixa em texto ---------------- */

function terminal() {
  const cells = 14
  const line = (y, m) => {
    const n = Math.round(((m.pct ?? 0) / 100) * cells)
    const act = m.status === 'working' ? '#8a8a90' : STATUS[m.status]
    return [
      `<text x="32" y="${y}" fill="${CLAUDE}">■</text>`,
      `<text x="56" y="${y}" fill="#8a8a90">${esc(m.type)}</text>`,
      `<text x="150" y="${y}" fill="${CLAUDE}">${esc(m.model)}</text>`,
      `<text x="250" y="${y}"><tspan fill="${CLAUDE}">${'━'.repeat(n)}</tspan><tspan fill="#3a3a3f">${'─'.repeat(cells - n)}</tspan></text>`,
      `<text x="384" y="${y}" fill="${m.pct === null ? '#4d4d52' : CLAUDE}">${m.pct === null ? '—' : `${m.pct}%`}</text>`,
      `<text x="530" y="${y}" text-anchor="end" fill="#8a8a90">${esc(m.tokens)}</text>`,
      `<text x="544" y="${y}" fill="#8a8a90">${esc(m.time)} ·</text>`,
      `<text x="620" y="${y}" fill="${act}">${esc(m.activity.length > 17 ? `${m.activity.slice(0, 16)}…` : m.activity)}</text>`,
      m.running ? `<text x="${880 - 32}" y="${y}" text-anchor="end" fill="#e6e6ea">■ Parar</text>` : '',
    ].join('')
  }
  const inner = [
    `<circle cx="24" cy="22" r="5" fill="#3a3a3f"/><circle cx="40" cy="22" r="5" fill="#3a3a3f"/><circle cx="56" cy="22" r="5" fill="#3a3a3f"/>`,
    `<text x="440" y="26" text-anchor="middle" font-size="11.5" fill="#4d4d52">terminal</text>`,
    `<text x="32" y="62" fill="#8a8a90">Subagentes · 3 ativos · 171k tokens</text>`,
    `<text x="${880 - 32}" y="62" text-anchor="end" fill="#e6e6ea">[ ▾ Ocultar ]</text>`,
    ...CREW.map((m, i) => line(94 + i * 28, m)),
    `<text x="32" y="${94 + 4 * 28 + 6}" fill="#4d4d52">&gt;</text>`,
    `<rect x="48" y="${94 + 4 * 28 - 6}" width="8" height="15" fill="${INK.lime}"><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.5;.5;1" dur="1.1s" repeatCount="indefinite"/></rect>`,
  ].join('')
  const H = 94 + 4 * 28 + 32
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="880" height="${H}" viewBox="0 0 880 ${H}" font-family="${MONO}" font-size="13.5">`,
    '<title>A Tripulação no terminal: a mesma faixa em texto, com a barra em traços</title>',
    `<rect x=".5" y=".5" width="879" height="${H - 1}" rx="14" fill="#0c0c0d" stroke="#232326"/>`,
    inner,
    '</svg>',
  ].join('\n')
}

/* ---------------- sessões: as outras sessões abertas, abaixo dos subagentes ---------------- */

// Uma linha por sessão paralela, como em register.tsx: Rei Clawd de coroa, o título que o app
// deu à sessão, modelo, a barra da lista dela (mini Clawd de coroa), %, tokens / janela, tempo,
// atividade, "N sub" e o Parar, que fica em toda linha.
const PEER_COLOR = { working: INK.subtle, asking: '#e0b04a', idle: INK.inactive }
function peerRow(i, x, cy, p) {
  const at = `y="${cy}" dominant-baseline="central"`
  const king = clawdSvg(p.kind, true).replace(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="34" height="(\d+)"/, (_m, h) => `<svg x="${x}" y="${cy - 19}" width="34" height="${h}"`)
  const w = (p.pct / 100) * BAR
  return [
    king,
    `<text x="${x + 46}" ${at} font-size="13" fill="${INK.text}">${esc(p.name)}</text>`,
    `<text x="${x + 230}" ${at} font-size="13" fill="${CLAUDE}">${esc(p.model)}</text>`,
    `<linearGradient id="p${i}" x1="0" x2="1"><stop offset="0" stop-color="${baseColor(CLAUDE_ORANGE, 0.45)}"/><stop offset="1" stop-color="${CLAUDE}"/></linearGradient>`,
    `<rect x="${x + 304}" y="${cy - 1}" width="${BAR}" height="2" rx="1" fill="#fff" fill-opacity=".07"/>`,
    `<rect x="${x + 304}" y="${cy - 1}" width="${w}" height="2" rx="1" fill="url(#p${i})"/>`,
    `<g transform="translate(${x + 304 + Math.max(w, 8)} ${cy + 1})">${miniClawd(CLAUDE, p.status === 'working', true)}</g>`,
    `<text x="${x + 460}" ${at} font-size="13" fill="${CLAUDE}">${p.pct}%</text>`,
    `<text x="${x + 590}" ${at} font-size="13" text-anchor="end" fill="${INK.subtle}">${esc(p.tokens)}</text>`,
    `<text x="${x + 600}" ${at} font-size="13" fill="${INK.subtle}">${esc(p.time)} ·</text>`,
    `<text x="${x + 658}" ${at} font-size="13" fill="${PEER_COLOR[p.status]}">${esc(p.activity)}</text>`,
    p.subs ? `<text x="${x + 802}" ${at} font-size="13" text-anchor="end" fill="${INK.subtle}">${p.subs} sub</text>` : '',
    button(x + 812, cy - 12, '■ Parar', { w: 66, dim: true }),
  ].join('')
}

const PEERS = [
  { kind: 'editando', name: 'Ajustar o card do usage-hud', model: 'Opus 5.5', pct: 63, tokens: '340k / 1M', time: '12:05', activity: 'Edit hooks/card.ts', status: 'working', subs: 2 },
  { kind: 'parado', name: 'Revisar o README', model: 'Sonnet 5.5', pct: 75, tokens: '80k / 1M', time: '04:12', activity: 'Respondeu há 4min', status: 'idle', subs: 0 },
]

function sessions() {
  const W = 960
  const top = 112
  const bottom = top + 236
  const inner = [
    appChrome(W, top, bottom),
    header(40, top, W - 40, 'Subagentes · 1 ativo · 41k tokens', false),
    row(0, 34, top + 48, CREW[0]),
    `<text x="40" y="${top + 98}" dominant-baseline="central" font-size="13" fill="${INK.subtle}">Sessões em paralelo · 2 abertas · esta é Leitura do handoff anterior</text>`,
    ...PEERS.map((p, i) => peerRow(i, 34, top + 140 + i * 52, p)),
  ].join('')
  return frame(W, bottom + 76, inner, { title: 'A faixa com um subagente e, abaixo, as outras duas sessões abertas, cada uma com o Rei Clawd de coroa, o título da sessão e o botão Parar' })
}

const out = {
  'assets/faixa-subagentes.svg': band(),
  'assets/faixa-oculta.svg': folded(),
  'assets/progresso-tarefa.svg': progress(),
  'assets/poses-subagente.svg': poses(),
  'assets/terminal-faixa.svg': terminal(),
  'assets/sessoes-paralelas.svg': sessions(),
}
fs.mkdirSync('assets', { recursive: true })
for (const [path, svg] of Object.entries(out)) {
  fs.writeFileSync(path, svg + '\n')
  console.log(`${path}  ${(svg.length / 1024).toFixed(1)} KB`)
}
