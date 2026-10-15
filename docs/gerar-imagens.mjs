// Gera docs/faixa.svg, docs/rei.svg e docs/tripulacao.svg do README da Tripulação.
//
// O desenho dos caranguejos vem de hooks/crab.ts (importado, nunca redesenhado aqui).
// As constantes de hooks/register.tsx (cores, textos, STATUS, BOSS_LOOK, INK) não são
// exportadas, então são lidas do próprio fonte. As funções de layout da faixa são cópias
// de register.tsx. TYPE_CHAR também é lido do fonte, porque crab.ts não o exporta.
//
// Regerar: node --experimental-strip-types --no-warnings <este arquivo>

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const DOCS = join(REPO, 'docs')
const PREVIEW = join(tmpdir(), 'tripulacao-preview.html')

const crabPath = join(REPO, 'hooks', 'crab.ts')
const regPath = join(REPO, 'hooks', 'register.tsx')
const crabSrc = readFileSync(crabPath, 'utf8')
const regSrc = readFileSync(regPath, 'utf8')

const { CHARS, crab, kingScene, charOf, SCENE } = await import(pathToFileURL(crabPath).href)

/* ---------------- constantes lidas do fonte ---------------- */

// Um bloco `const NAME ... }` do fonte, do `const` até a chave de fechamento na coluna 0.
function block(src, name) {
  const start = src.indexOf(`const ${name}`)
  const end = start < 0 ? -1 : src.indexOf('\n}', start)
  if (start < 0 || end < 0) throw new Error(`const ${name} não encontrada no fonte`)
  return src.slice(start, end)
}

// Quem prefere cada personagem: TYPE_CHAR, em crab.ts (não exportado).
// Chaves entre aspas ('general-purpose') ou nomes simples (Explore, Plan).
const TYPE_CHAR = Object.fromEntries(
  [...block(crabSrc, 'TYPE_CHAR').matchAll(/(?:'([^']+)'|([A-Za-z]\w*)):\s*'([^']+)'/g)].map(m => [m[1] ?? m[2], m[3]]),
)
const INK = Object.fromEntries([...block(regSrc, 'INK').matchAll(/(\w+):\s*'([^']*)'/g)].map(m => [m[1], m[2]]))
const MODEL_COLOR = Object.fromEntries([...block(regSrc, 'MODEL_COLOR').matchAll(/(\w+):\s*'(#[0-9a-fA-F]{6})'/g)].map(m => [m[1], m[2]]))
const STATUS = Object.fromEntries(
  [...block(regSrc, 'STATUS').matchAll(/(\w+):\s*\{\s*label:\s*'([^']*)',\s*color:\s*'(#[0-9a-fA-F]{6})',\s*eyes:\s*'(\w+)'/g)]
    .map(m => [m[1], { label: m[2], color: m[3], eyes: m[4] }]),
)
const BOSS_LOOK = Object.fromEntries(
  [...block(regSrc, 'BOSS_LOOK').matchAll(/(\w+):\s*\{\s*label:\s*'([^']*)',\s*eyes:\s*'(\w+)',\s*isWalking:\s*(true|false),\s*aside:\s*(null|'\w+')/g)]
    .map(m => [m[1], { label: m[2], eyes: m[3], isWalking: m[4] === 'true', aside: m[5] === 'null' ? null : m[5].slice(1, -1) }]),
)

const expectCount = (n, got, what) => {
  if (n !== got) throw new Error(`leitura de ${what}: achei ${got} entradas, esperava ${n}`)
}
expectCount(10, Object.keys(TYPE_CHAR).length, 'TYPE_CHAR')
expectCount(11, Object.keys(INK).length, 'INK')
expectCount(4, Object.keys(MODEL_COLOR).length, 'MODEL_COLOR')
expectCount(5, Object.keys(STATUS).length, 'STATUS')
expectCount(7, Object.keys(BOSS_LOOK).length, 'BOSS_LOOK')

// Cores que o mod não define por nome (vêm do tema do app): escolhas minhas, mais próximas da paleta INK.
const SUBTLE = INK.detail // "subtle" do tema do host
const DIM = INK.faded // botões com dimColor
const BAND_LINGER_MS = 6000 // register.tsx
const FONT = "Inter, 'Segoe UI', system-ui, sans-serif"
const PAGE_BG = '#1f1f22'

/* ---------------- cópias de register.tsx (layout e textos) ---------------- */

function prettyModel(id) {
  const m = /(opus|sonnet|haiku|fable)(?:[-_ ]?(\d+)(?:[-.](\d{1,2})(?!\d))?)?/i.exec(id)
  if (m === null) return id.replace(/^claude-/, '')
  const family = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()
  if (m[2] === undefined) return family
  return m[3] === undefined ? `${family} ${m[2]}` : `${family} ${m[2]}.${m[3]}`
}

function windowOf(model) {
  return /\[1m\]|-1m\b/i.test(model) ? 1_000_000 : 200_000
}

function modelColor(model) {
  return MODEL_COLOR[model.split(' ')[0]] ?? INK.name
}

function formatTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return `${Math.round(n)}`
}

function formatTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const hh = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`
}

const pctOf = m => Math.min(100, Math.round((m.tokens / m.window) * 100))
const barPct = m => Math.min(100, (m.tokens / m.window) * 100)
const elapsed = (m, now) => (m.endedAt ?? Math.max(now, m.startedAt)) - m.startedAt
const ativos = n => `${n} ${n === 1 ? 'ativo' : 'ativos'}`
const cut = (text, max) => (text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text)
const activity = m => (m.tool === null ? m.target : `${m.tool} ${m.target}`.trim())

function shortPath(p) {
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.length > 3 ? `…/${parts.slice(-3).join('/')}` : parts.join('/')
}

function targetOf(tool, input) {
  const s = k => (typeof input[k] === 'string' ? input[k] : '')
  switch (tool) {
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return shortPath(s('file_path') || s('notebook_path'))
    case 'Bash':
    case 'PowerShell':
      return (s('description') || s('command')).split('\n')[0] ?? ''
    case 'Grep':
      return `"${s('pattern')}"${s('path') ? ` em ${shortPath(s('path'))}` : ''}`
    case 'Glob':
      return s('pattern')
    case 'WebFetch':
      try {
        return new URL(s('url')).host
      } catch {
        return s('url')
      }
    case 'WebSearch':
      return s('query')
    default:
      return s('description') || s('query') || s('pattern') || s('file_path')
  }
}

// A barra fina com o ponto brilhante na ponta (hairline do register.tsx).
function hairline(id, x, cy, width, pct, color) {
  const w = (Math.min(Math.max(pct, 0), 100) / 100) * width
  const tip = w > 0
    ? `<circle cx="${x + w}" cy="${cy}" r="5" fill="${color}" opacity=".5" filter="url(#${id}-glow)"/><circle cx="${x + w}" cy="${cy}" r="2.5" fill="${color}"/>`
    : ''
  return [
    `<linearGradient id="${id}-fill" x1="0" x2="1"><stop offset="0" stop-color="${color}" stop-opacity=".4"/><stop offset="1" stop-color="${color}"/></linearGradient>`,
    `<filter id="${id}-glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="3"/></filter>`,
    `<rect x="${x}" y="${cy - 1}" width="${width}" height="2" rx="1" fill="${INK.hair}"/>`,
    `<rect x="${x}" y="${cy - 1}" width="${w}" height="2" rx="1" fill="url(#${id}-fill)"/>`,
    tip,
  ].join('')
}

/* ---------------- helpers de SVG ---------------- */

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Texto alinhado verticalmente pelo centro (dominant-baseline), como as linhas da faixa.
function text(x, y, s, o = {}) {
  const anchor = o.anchor ? ` text-anchor="${o.anchor}"` : ''
  const size = o.size ? ` font-size="${o.size}"` : ''
  return `<text x="${x}" y="${y}" dominant-baseline="central"${anchor}${size} fill="${o.fill ?? INK.figure}">${esc(s)}</text>`
}

function root(w, h, title, inner) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"`,
    ` font-family="${FONT}" font-size="13" style="font-variant-numeric:tabular-nums">`,
    `<title>${esc(title)}</title>`,
    inner,
    '</svg>\n',
  ].join('')
}

/* ---------------- faixa: a band above the prompt ---------------- */

// Três subagentes: o Lupa trabalhando com o Grep, o Clawd pensando e o Ninja concluído.
// Os valores de tokens somam 175.100 (cabeçalho "175k"), e só os dois sem endedAt contam como ativos.
function faixa() {
  const now = 100_000
  const crew = [
    {
      id: 'a1', charId: 'lupa', type: 'Explore', description: 'Mapear os estados do Rei',
      model: prettyModel('claude-haiku-5-5'), window: windowOf('claude-haiku-5-5'),
      startedAt: 28_000, endedAt: null, status: 'working',
      tool: 'Grep', target: targetOf('Grep', { pattern: 'BOSS_LOOK', path: 'hooks' }),
      tools: 4, tokens: 62_300, log: [],
    },
    {
      id: 'a2', charId: 'clawd', type: 'general-purpose', description: 'Revisar o módulo',
      model: prettyModel('claude-opus-5-5'), window: windowOf('claude-opus-5-5'),
      startedAt: 0, endedAt: null, status: 'thinking',
      tool: null, target: 'Pensando…',
      tools: 9, tokens: 86_600, log: [],
    },
    {
      id: 'a3', charId: 'ninja', type: 'code-review', description: 'Revisar o diff',
      model: prettyModel('claude-sonnet-5-5'), window: windowOf('claude-sonnet-5-5'),
      startedAt: 61_000, endedAt: 97_000, status: 'done',
      tool: null, target: 'Devolveu o resultado',
      tools: 6, tokens: 26_200, log: [],
    },
  ]

  // Colunas do Box: 8 px por coluna (suposição: o mod define larguras em colunas, não em px).
  const W = 900, H = 220
  const CARD = { x: 24, y: 24, w: 852, h: 172, r: 12 }
  const L = 48 // início do conteúdo: 16 px do cartão + paddingX 1 (8 px)
  const R = 852 // fim do conteúdo, onde ficam "▾ Ocultar" e "■ Parar"
  const COL = 8
  const ICON_X = L + (3 * COL - 18) / 2 // Box de 3 colunas, ícone de 18 px centrado
  const NAME_X = L + 3 * COL
  const MODEL_X = NAME_X + 10 * COL
  const BAR_X = MODEL_X + 9 * COL
  const TOK_END = BAR_X + 140 + 7 * COL // Box de 7 colunas, texto alinhado à direita
  const PCT_X = TOK_END + COL // marginLeft 1

  const band = crew.filter(m => m.endedAt === null || now - m.endedAt < BAND_LINGER_MS)
  const active = crew.filter(m => m.endedAt === null).length
  const total = crew.reduce((s, m) => s + m.tokens, 0)

  const out = [
    `<rect width="${W}" height="${H}" rx="16" fill="${PAGE_BG}"/>`,
    `<rect x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="${CARD.r}" fill="${INK.card}" stroke="${INK.border}"/>`,
    text(L, 50, `Subagentes · ${ativos(active)} · ${formatTokens(total)} tokens`, { fill: SUBTLE }),
    text(R, 50, '▾ Ocultar', { anchor: 'end', fill: DIM }),
  ]

  band.forEach((m, i) => {
    const cy = 90 + 40 * i // linha de 20 px com marginTop de 20 px
    const c = charOf(m.charId)
    const st = STATUS[m.status]
    const act = cut(activity(m) || st.label, 32)
    out.push(
      `<svg x="${ICON_X}" y="${cy - 9}" width="18" height="18" viewBox="0 -2 18 18" overflow="hidden">${crab(c, 0, 0, 1, false, st.eyes)}</svg>`,
      text(NAME_X, cy, c.name, { fill: SUBTLE }),
      text(MODEL_X, cy, m.model, { fill: modelColor(m.model) }),
      `<svg x="${BAR_X}" y="${cy - 6}" width="140" height="12" viewBox="0 0 140 12">${hairline(`r${i}`, 0, 6, 140, barPct(m), c.color)}</svg>`,
      text(TOK_END, cy, formatTokens(m.tokens), { anchor: 'end', fill: INK.figure }),
      `<text x="${PCT_X}" y="${cy}" dominant-baseline="central">` +
        `<tspan fill="${SUBTLE}">${esc(`${pctOf(m)}% · ${formatTime(elapsed(m, now))} ·`)}</tspan>` +
        `<tspan dx="8" fill="${m.status === 'working' ? SUBTLE : st.color}">${esc(act)}</tspan></text>`,
    )
    if (m.endedAt === null) out.push(text(R, cy, '■ Parar', { anchor: 'end', fill: DIM }))
  })

  return root(W, H, 'Faixa da Tripulação com três subagentes', out.join(''))
}

/* ---------------- rei: os sete estados do Rei Clawd ---------------- */

const splitLabel = s => {
  if (s.length <= 16) return [s]
  const i = s.indexOf(' ')
  return [s.slice(0, i), s.slice(i + 1)]
}

function rei() {
  const order = ['idle', 'working', 'thinking', 'asking', 'waiting', 'done', 'error']
  const W = 960, H = 190, CELL = 132, TOP = 24, SCALE = 2
  const out = [`<rect width="${W}" height="${H}" rx="16" fill="${PAGE_BG}"/>`]
  order.forEach((key, i) => {
    const look = BOSS_LOOK[key]
    const cx = 84 + i * CELL
    out.push(`<g transform="translate(${cx - (SCENE.width * SCALE) / 2} ${TOP}) scale(${SCALE})">${kingScene(look.isWalking, look.eyes, look.aside)}</g>`)
    const caption = look.label.charAt(0).toUpperCase() + look.label.slice(1)
    splitLabel(caption).forEach((line, j) => {
      out.push(text(cx, TOP + SCENE.height * SCALE + 22 + j * 17, line, { anchor: 'middle', fill: INK.name }))
    })
  })
  return root(W, H, 'Rei Clawd nos sete estados', out.join(''))
}

/* ---------------- tripulação: os dez personagens ---------------- */

// Cada tipo preferido vira uma linha; "prefixo:nome" quebra em duas linhas para caber na coluna.
function typeLines(charId) {
  return Object.keys(TYPE_CHAR)
    .filter(t => TYPE_CHAR[t] === charId)
    .flatMap(t => {
      const i = t.indexOf(':')
      return i < 0 ? [t] : [t.slice(0, i + 1), t.slice(i + 1)]
    })
}

function tripulacao() {
  const W = 1088, H = 210, PITCH = 104, TOP = 24, SCALE = 4
  const CRAB_W = 18 * SCALE // grade de 18 colunas
  const CRAB_H = 15 * SCALE // grade de 15 linhas
  const out = [`<rect width="${W}" height="${H}" rx="16" fill="${PAGE_BG}"/>`]
  CHARS.forEach((c, i) => {
    const cx = 24 + PITCH / 2 + i * PITCH
    out.push(crab(c, cx - CRAB_W / 2, TOP, SCALE, false, 'normal'))
    out.push(text(cx, TOP + CRAB_H + 22, c.name, { anchor: 'middle', fill: INK.figure }))
    typeLines(c.id).forEach((line, j) => {
      out.push(text(cx, TOP + CRAB_H + 40 + j * 15, line, { anchor: 'middle', size: 11, fill: SUBTLE }))
    })
  })
  return root(W, H, 'Os dez personagens da Tripulação', out.join(''))
}

/* ---------------- validação: XML bem formado ---------------- */

// Parser mínimo: confere tags abertas e fechadas, um único elemento raiz e '&' escapado.
function wellFormed(xml) {
  const tag = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([A-Za-z][\w.:-]*)\s*>|<([A-Za-z][\w.:-]*)((?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)|(<)/g
  const badAmp = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/
  const stack = []
  let roots = 0
  let m
  while ((m = tag.exec(xml)) !== null) {
    if (m[6] !== undefined) throw new Error(`'<' sem fechamento na posição ${m.index}`)
    if (m[5] !== undefined) {
      if (badAmp.test(m[5])) throw new Error(`'&' sem escape perto da posição ${m.index}`)
      continue
    }
    if (m[1] !== undefined) {
      const open = stack.pop()
      if (open !== m[1]) throw new Error(`</${m[1]}> não bate com <${open}> na posição ${m.index}`)
      continue
    }
    if (m[2] !== undefined) {
      if (badAmp.test(m[3])) throw new Error(`'&' sem escape nos atributos da posição ${m.index}`)
      if (stack.length === 0) roots++
      if (m[4] !== '/') stack.push(m[2])
    }
  }
  if (stack.length) throw new Error(`tags sem fechamento: ${stack.join(', ')}`)
  if (roots !== 1) throw new Error(`esperava um elemento raiz, achei ${roots}`)
}

/* ---------------- escrita ---------------- */

const outputs = {
  'faixa.svg': faixa(),
  'rei.svg': rei(),
  'tripulacao.svg': tripulacao(),
}

for (const [name, svg] of Object.entries(outputs)) {
  writeFileSync(join(DOCS, name), svg, 'utf8')
  wellFormed(readFileSync(join(DOCS, name), 'utf8'))
  console.log(`ok  docs/${name}  ${svg.length} caracteres  XML bem formado`)
}

// Preview local com as três imagens, em fundo escuro (como o GitHub no tema escuro) e claro.
const fileUrl = name => `file:///${join(DOCS, name).replace(/\\/g, '/')}`
const section = (title, name, alt) => `<h2>${title}</h2><img src="${fileUrl(name)}" alt="${alt}">`
const page = bg => `<section style="background:${bg};padding:16px;border-radius:8px;margin-bottom:24px">
${section('docs/faixa.svg', 'faixa.svg', 'Faixa')}
${section('docs/rei.svg', 'rei.svg', 'Rei Clawd')}
${section('docs/tripulacao.svg', 'tripulacao.svg', 'Tripulação')}
</section>`
const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Preview README Tripulação</title>
<style>
  body { margin: 24px; font-family: system-ui, sans-serif; background: #f6f8fa; color: #1f2328; }
  h2 { font: 600 14px system-ui, sans-serif; color: #888; margin: 18px 0 6px; }
  img { display: block; max-width: 100%; height: auto; }
  section { overflow-x: auto; }
</style>
</head>
<body>
<h1 style="font-size:18px">Preview das imagens do README (escuro e claro)</h1>
${page('#0d1117')}
${page('#ffffff')}
</body>
</html>
`
writeFileSync(PREVIEW, html, 'utf8')
console.log(`ok  preview ${PREVIEW}`)

// Resumo do que foi lido do fonte, para conferir.
console.log('TYPE_CHAR:', JSON.stringify(TYPE_CHAR))
console.log('BOSS_LOOK:', Object.entries(BOSS_LOOK).map(([k, v]) => `${k}=${v.label}(${v.eyes},${v.isWalking},${v.aside})`).join(' | '))
