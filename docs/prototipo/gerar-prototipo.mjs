// Gera tripulacao-prototype.html: a interface da Tripulação como está hoje e a proposta
// só com o Clawd, usando as poses do usage-hud.
//
// Os desenhos vêm do código dos mods, importados (nunca redesenhados aqui):
// - hooks/crab.ts deste repo: caranguejos e o Rei Clawd da Tripulação (visão "Hoje");
// - ../usage-hud/hooks/clawd.ts: as 14 poses do Clawd, o mini Clawd e as cores das barras.
// O layout da faixa copia hooks/register.tsx (colunas de 8 px, linhas de 20 px), como docs/gerar-imagens.mjs.
//
// Rodar na raiz do repositório: node docs/prototipo/gerar-prototipo.mjs  (Node 22.18+)
// Edite este gerador, não o HTML.

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')
const HUD = join(REPO, '..', 'usage-hud')

const { CHARS, crab, kingScene, SCENE } = await import(pathToFileURL(join(HERE, 'legado', 'crab.ts')).href)
const { clawdSvg, CLAWD_LABEL, CLAWD_SIZE, toolKind } = await import(pathToFileURL(join(HUD, 'hooks', 'clawd.ts')).href)

const KINDS = Object.keys(CLAWD_LABEL)

/* ---------------- desenhos pré-renderizados ---------------- */

// Caranguejo da faixa de hoje: 18 x 18, recorte igual ao crabIcon do register.tsx.
const crabIcon = (charId, eyes) => {
  const c = CHARS.find(x => x.id === charId)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 -2 18 18" overflow="hidden">${crab(c, 0, 0, 1, false, eyes)}</svg>`
}
const crabs = {}
for (const c of CHARS) for (const eyes of ['normal', 'happy', 'closed', 'x']) crabs[`${c.id}:${eyes}`] = crabIcon(c.id, eyes)

// O Rei Clawd da Tripulação (BOSS_LOOK do register.tsx), 50 x 50.
const BOSS_LOOK = {
  idle: ['à toa', 'normal', false, null],
  thinking: ['pensando', 'closed', false, 'thought'],
  working: ['trabalhando', 'normal', true, 'sparks'],
  asking: ['esperando sua resposta', 'normal', false, 'question'],
  waiting: ['aguardando', 'closed', false, null],
  done: ['concluído', 'happy', false, null],
  error: ['interrompido', 'x', false, null],
}
const kings = Object.fromEntries(Object.entries(BOSS_LOOK).map(([k, [, eyes, walk, aside]]) => [k, kingScene(walk, eyes, aside)]))

// As 14 poses do usage-hud, cada uma como o mod desenha (48 x 46); o HTML redimensiona.
const poses = Object.fromEntries(KINDS.map(k => [k, clawdSvg(k)]))
// Os subagentes usam o mesmo Clawd sem a coroa (linhas 0 a 2 do BODY), que fica só com o rei da sessão principal.
const CROWN = /<rect x="[3-8]" y="[012]" width="1" height="1" fill="#(?:ffd34d|d9a521|e5484d)"\/>/g
const plain = Object.fromEntries(KINDS.map(k => [k, poses[k].replace(CROWN, '')]))

// toolKind do usage-hud, para o protótipo escolher a pose pela ferramenta.
const TOOLS = ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash', 'PowerShell', 'WebSearch', 'WebFetch', 'Agent', 'AskUserQuestion', 'TodoWrite']
const toolKinds = Object.fromEntries(TOOLS.map(t => [t, toolKind(t)]))

const DATA = { crabs, kings, poses, plain, labels: CLAWD_LABEL, toolKinds, chars: CHARS.map(c => ({ id: c.id, name: c.name, color: c.color })), scene: SCENE, clawdSize: CLAWD_SIZE }

/* ---------------- página ---------------- */

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tripulação só com o Clawd</title>
<style>
:root{
  --page:#141416; --win:#0c0c0d; --win-edge:#232326; --card:#151517; --card-edge:#2a2a2d; --tile:#1c1c1f;
  --label:#7c7c82; --figure:#f2f2f5; --detail:#85858b; --faded:#6e6e73; --sep:#3f3f44; --name:#a1a1a6;
  --of100:#525257; --remaining:#a1a1a6; --lime:#a3e635; --coral:#e07a5f; --hint:#4d4d52;
}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--figure);font:13px/20px Inter,-apple-system,'Segoe UI',system-ui,sans-serif;font-variant-numeric:tabular-nums}
main{max-width:960px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:17px;margin:0 0 4px}
.sub{color:var(--detail);margin:0 0 20px}
h2{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--label);margin:28px 0 10px;font-weight:600}
.tabs{display:flex;gap:6px;margin-bottom:14px}
.chip{background:var(--tile);border:1px solid var(--card-edge);color:var(--figure);border-radius:999px;padding:5px 14px;font:inherit;cursor:pointer}
.chip[aria-pressed=true]{border-color:#d97757;color:#e8a48c;background:#2a1d18}

/* A janela do app */
.win{background:linear-gradient(#121214,#0a0a0b);border:1px solid var(--win-edge);border-radius:16px;padding:16px 24px 20px;overflow-x:auto}
.chrome{display:flex;align-items:center;gap:7px;margin:-2px 0 18px}
.chrome i{width:11px;height:11px;border-radius:50%;display:block}
.chrome span{flex:1;text-align:center;color:var(--hint);font-size:12px;margin-right:50px}
.above{min-width:820px}

/* usage-hud: rei + card (Box row, gap 1) */
.hud{display:flex;align-items:center;gap:8px}
.hud .king{flex-shrink:0;display:flex}
.card{flex:1;display:flex;align-items:flex-end;justify-content:space-between;background:var(--card);border:1px solid var(--card-edge);border-radius:10px;padding:6px 8px}
.card .btns{display:flex;justify-content:flex-end;gap:8px;margin-left:8px}
.btn{background:#2a2a2d;color:var(--figure);border:0;border-radius:6px;font:500 12px/26px inherit;font-family:inherit;padding:0 10px;cursor:pointer;white-space:nowrap}

/* Faixa da Tripulação */
.band{padding:0 8px;margin-top:20px}
.band-head{display:flex}
.band-head .t{flex:1;color:var(--detail)}
.plain{background:none;border:0;color:var(--faded);font:inherit;cursor:pointer;padding:0;white-space:nowrap}
.plain:hover{color:var(--figure)}
.row{display:flex;align-items:center;margin-top:20px;min-height:20px;white-space:nowrap}
.row>*{flex-shrink:0}
.c-icon{width:24px;display:flex;justify-content:center}
.c-name{width:80px;color:var(--detail);overflow:hidden;text-overflow:ellipsis}
.c-model{width:72px}
.c-bar{display:flex}
.c-tok{width:56px;text-align:right}
.c-tok.wide{width:96px;color:var(--detail)}
.c-pct{width:40px;margin-left:16px;color:#d97757;font-weight:500}
.c-pct + .c-tok.wide{width:88px}
.c-meta{margin-left:8px;color:var(--detail)}
.c-act{flex:1 1 auto!important;margin-left:8px;overflow:hidden;text-overflow:ellipsis;min-width:0}
.c-stop{margin-left:8px}
/* Proposta: o Clawd do usage-hud no lugar do caranguejo */
.v-new .c-icon{width:40px}
.v-new .row{margin-top:12px}
.v-new .band-head + .row{margin-top:14px}

.prompt{margin-top:18px;border:1px solid var(--card-edge);background:var(--card);border-radius:12px;padding:11px 16px;color:var(--hint)}

/* Controles */
.panel{background:var(--card);border:1px solid var(--card-edge);border-radius:12px;padding:14px 16px}
.ctl{display:grid;grid-template-columns:90px repeat(5,1fr) auto;gap:8px;align-items:center;margin-top:8px}
.ctl:first-child{margin-top:0}
select,input{background:var(--tile);color:var(--figure);border:1px solid var(--card-edge);border-radius:6px;font:inherit;padding:4px 6px;min-width:0}
.ctl b{font-weight:500;color:var(--name)}
.row-actions{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px}
.pose{background:#1a1a1d;border:1px solid var(--card-edge);border-radius:10px;padding:10px 6px 8px;text-align:center}
.pose svg{display:block;margin:0 auto 4px}
.pose small{display:block;color:var(--lime);font:10px/14px 'JetBrains Mono','Cascadia Code',Consolas,monospace}
.note{color:var(--detail);margin:8px 0 0}
.note code{color:var(--lime)}
@media (max-width:640px){.ctl{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>
<main>
<h1>Protótipo: Tripulação só com o Clawd</h1>
<p class="sub">Recriação da faixa da Tripulação e do card do usage-hud, desenhada a partir do código dos dois mods. Em “Proposta”, os personagens saem e cada subagente vira o Clawd com as poses do usage-hud.</p>

<div class="tabs" role="group" aria-label="Versão">
  <button class="chip" data-view="new" aria-pressed="true">Proposta</button>
  <button class="chip" data-view="old" aria-pressed="false">Hoje</button>
</div>

<div class="win">
  <div class="chrome"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><span>Claude Code</span></div>
  <div class="above" id="above"></div>
  <div class="prompt">Responda ao Claude…</div>
</div>

<h2>Subagentes na faixa</h2>
<div class="panel">
  <div id="ctls"></div>
  <div class="row-actions">
    <button class="btn" id="add">+ Subagente</button>
    <button class="btn" id="crown">Coroa nos subagentes: <span id="crownLbl"></span></button>
    <button class="btn" id="mainState">Sessão principal: <span id="mainLbl"></span></button>
  </div>
  <p class="note">Mude o status e a ferramenta de cada linha para ver a pose. Na proposta a pose sai do mesmo <code>toolKind</code> do usage-hud. A barra é o progresso da tarefa em degraus de 25% (no mod: tarefas concluídas da lista do subagente), e os tokens aparecem contra a janela do modelo.</p>
</div>

<h2>As 14 poses do usage-hud, no tamanho da faixa</h2>
<div class="grid" id="poses"></div>

</main>
<script>
const D = ${JSON.stringify(DATA)};

/* ---- cópias de hooks/register.tsx (tripulacao) ---- */
const STATUS = {
  working: { label: 'Trabalhando', color: '#e07a5f', eyes: 'normal' },
  thinking: { label: 'Pensando', color: '#5aa7e8', eyes: 'closed' },
  waiting: { label: 'Aguardando', color: '#e0b04a', eyes: 'closed' },
  done: { label: 'Concluído', color: '#a3e635', eyes: 'happy' },
  error: { label: 'Erro', color: '#e5484d', eyes: 'x' },
}
// Janela de contexto de cada modelo (a confirmar; no mod deve vir do engine, como no usage-hud).
const MODEL_WINDOW = { 'Opus 5.5': 1000000, 'Sonnet 5.5': 1000000, 'Haiku 5.5': 500000, 'Fable 5.1': 1000000 }
const CLAUDE = '#d97757'
// Progresso da tarefa em degraus de 25%: no mod, vem da lista de tarefas (TodoWrite) do subagente.
const STEPS = [0, 25, 50, 75, 100]
const stepOf = (done, total) => (total === 0 ? 0 : STEPS[Math.floor((done / total) * 4)])
const progressOf = m => (m.status === 'done' ? 100 : m.progress)
const tokensOf = m => formatTokens(m.tokens) + ' / ' + formatTokens(MODEL_WINDOW[m.model] ?? 200000).replace('.0M', 'M')
const MODEL_COLOR = { Opus: '#c4a1ff', Sonnet: '#5aa7e8', Haiku: '#a3e635', Fable: '#f0b35a' }
const SHORT_TYPE = { 'general-purpose': 'general', 'security-review': 'security', 'code-review': 'review', 'claude-code-guide': 'guide', 'statusline-setup': 'statusline' }
const modelColor = m => MODEL_COLOR[m.split(' ')[0]] ?? '#a1a1a6'
const shortType = t => SHORT_TYPE[t] ?? t.split(':').pop() ?? t
function formatTokens(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e4) return Math.round(n / 1000) + 'k'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(Math.round(n))
}
function formatTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), hh = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0'), ss = String(s % 60).padStart(2, '0')
  return hh > 0 ? hh + ':' + mm + ':' + ss : mm + ':' + ss
}
const pctOf = m => Math.min(100, Math.round((m.tokens / m.window) * 100))
const barPct = m => Math.min(100, (m.tokens / m.window) * 100)
const cut = (t, max) => (t.length > max ? t.slice(0, Math.max(1, max - 1)) + '…' : t)
const activity = m => (m.tool === null ? m.target : (m.tool + ' ' + m.target).trim())
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Barra fina com o ponto brilhante (hairline do tripulacao).
function hairline(id, pct, color) {
  const w = (Math.min(Math.max(pct, 0), 100) / 100) * 140
  const tip = w > 0 ? '<circle cx="' + w + '" cy="6" r="5" fill="' + color + '" opacity=".5" filter="url(#' + id + '-g)"/><circle cx="' + w + '" cy="6" r="2.5" fill="' + color + '"/>' : ''
  return '<svg width="140" height="12" viewBox="0 0 140 12" overflow="visible"><linearGradient id="' + id + '-f" x1="0" x2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".4"/><stop offset="1" stop-color="' + color + '"/></linearGradient>' +
    '<filter id="' + id + '-g" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="3"/></filter>' +
    '<rect y="5" width="140" height="2" rx="1" fill="rgba(255,255,255,.07)"/><rect y="5" width="' + w + '" height="2" rx="1" fill="url(#' + id + '-f)"/>' + tip + '</svg>'
}

/* ---- cópias de hooks/clawd.ts (usage-hud) ---- */
const CLAUDE_ORANGE = [217, 119, 87], CONTEXT_BLUE = [42, 120, 214], HOT = [229, 72, 77], HOT_FROM = 75
const hex = rgb => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
function rampColor(base, pct) {
  const p = Math.min(Math.max(pct ?? 0, 0), 100)
  if (p <= HOT_FROM) return hex(base)
  const t = (p - HOT_FROM) / (100 - HOT_FROM)
  return hex([0, 1, 2].map(i => base[i] + (HOT[i] - base[i]) * t))
}
const baseColor = (base, a) => 'rgba(' + base.join(',') + ',' + a + ')'
function miniClawd(color, isHopping) {
  const rows = [' cccccc ', ' ckcckc ', 'cccccccc', ' cccccc ']
  let cells = ''
  rows.forEach((line, y) => [...line].forEach((ch, x) => { if (ch !== ' ') cells += '<rect x="' + (x * 2 - 8) + '" y="' + (y * 2 - 10) + '" width="2" height="2" fill="' + (ch === 'k' ? '#141416' : color) + '"/>' }))
  const legs = xs => xs.map(x => '<rect x="' + (x * 2 - 8) + '" y="-2" width="2" height="2" fill="' + color + '"/>').join('')
  const step = 'dur=".5s" repeatCount="indefinite" calcMode="discrete"'
  const hop = '<animateTransform attributeName="transform" type="translate" values="0 0;0 ' + (isHopping ? '-1.5' : '-.6') + '" ' + step + '/>'
  return '<g shape-rendering="crispEdges"><g>' + hop + cells + '<g>' + legs([1, 3, 5, 7]) + '<animate attributeName="opacity" values="1;0" ' + step + '/></g>' +
    '<g opacity="0">' + legs([0, 2, 4, 6]) + '<animate attributeName="opacity" values="0;1" ' + step + '/></g></g></g>'
}
// Barra no estilo do usage-hud, agora com o progresso da tarefa: laranja do Claude, mini Clawd andando na ponta.
function hudBar(id, pct, width, hopping) {
  const color = '#d97757', w = (Math.min(Math.max(pct, 0), 100) / 100) * width
  return '<svg width="' + width + '" height="14" viewBox="0 -10 ' + width + ' 14" overflow="visible"><linearGradient id="' + id + '" x1="0" x2="1"><stop offset="0" stop-color="' + baseColor(CLAUDE_ORANGE, .45) + '"/><stop offset="1" stop-color="' + color + '"/></linearGradient>' +
    '<rect y="-1" width="' + width + '" height="2" rx="1" fill="#fff" fill-opacity=".07"/><rect y="-1" width="' + w + '" height="2" rx="1" fill="url(#' + id + ')"/>' +
    '<g transform="translate(' + w + ' 0)">' + miniClawd(color, hopping) + '</g></svg>'
}
// Uma pose do usage-hud num tamanho qualquer (o SVG original tem 48 x 46).
const pose = (kind, w, crown = true) => (crown ? D.poses : D.plain)[kind].replace('width="48" height="46"', 'width="' + w + '" height="' + (w * 46 / 48).toFixed(2) + '"')

/* ---- o card do usage-hud (svgCard do register.tsx), com valores fixos ---- */
function hudCard() {
  const W = 640, H = 52, row = (id, cy, label, pct, base, of100, lead, tail) => {
    const color = rampColor(base, pct), w = (pct / 100) * 180
    return '<linearGradient id="' + id + '" x1="0" x2="1"><stop offset="0" stop-color="' + baseColor(base, .45) + '"/><stop offset="1" stop-color="' + color + '"/></linearGradient>' +
      '<rect x="88" y="' + (cy - 1) + '" width="180" height="2" rx="1" fill="#fff" fill-opacity=".07"/><rect x="88" y="' + (cy - 1) + '" width="' + w + '" height="2" rx="1" fill="url(#' + id + ')"/>' +
      '<g transform="translate(' + (88 + w) + ' ' + (cy - 1) + ')">' + miniClawd(color, false) + '</g>' +
      '<text x="0" y="' + cy + '" dominant-baseline="central" fill="#7c7c82">' + label + '</text>' +
      '<text x="288" y="' + cy + '" dominant-baseline="central"><tspan fill="' + color + '" font-weight="500">' + pct + '%</tspan>' + (of100 ? '<tspan fill="#525257" font-size="11" dx="2">/100%</tspan>' : '') + '</text>' +
      '<text x="352" y="' + cy + '" dominant-baseline="central" fill="#85858b">' + lead + '</text>' +
      '<text x="452" y="' + cy + '" dominant-baseline="central" fill="#3f3f44">·</text><text x="466" y="' + cy + '" dominant-baseline="central">' + tail + '</text>'
  }
  return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="Inter, -apple-system, \\'Segoe UI\\', system-ui, sans-serif" font-size="13" style="font-variant-numeric:tabular-nums">' +
    row('hw', 16, 'Janela 5h', 42, CLAUDE_ORANGE, true, 'renova às 13:10', '<tspan fill="#85858b">faltam 2h 55min</tspan>') +
    row('hc', 40, 'Contexto', 61, CONTEXT_BLUE, false, '610k de 1.0M', '<tspan fill="#6e6e73">faltam </tspan><tspan fill="#a1a1a6">390k</tspan>') + '</svg>'
}

/* ---- estado do protótipo ---- */
const NOW = 100000
let view = 'new', folded = false, crownRows = false, mainKind = 'orquestrando'
const MAIN_TO_BOSS = { parado: 'idle', pensando: 'thinking', esperando: 'asking', aguardando: 'waiting', concluido: 'done', interrompido: 'error', erro: 'error' }
const crew = [
  { id: 'a1', charId: 'lupa', type: 'Explore', model: 'Haiku 5.5', window: 200000, startedAt: 28000, endedAt: null, status: 'working', tool: 'Grep', target: '"BOSS_LOOK" em hooks', tokens: 62300, reason: null, progress: 25 },
  { id: 'a2', charId: 'clawd', type: 'general-purpose', model: 'Opus 5.5', window: 200000, startedAt: 0, endedAt: null, status: 'thinking', tool: null, target: 'Pensando…', tokens: 86600, reason: null, progress: 50 },
  { id: 'a3', charId: 'ninja', type: 'code-review', model: 'Sonnet 5.5', window: 200000, startedAt: 61000, endedAt: 97000, status: 'done', tool: null, target: 'Devolveu o resultado', tokens: 26200, reason: 'answer', progress: 100 },
]
const TARGET = { Read: 'hooks/register.tsx', Grep: '"BOSS_LOOK" em hooks', Glob: '**/*.ts', Edit: 'hooks/crab.ts', Write: 'docs/rei.svg', Bash: 'Roda os testes', PowerShell: 'Lista a pasta', WebSearch: 'svg smil animate', WebFetch: 'github.com', Agent: 'Revisar o diff', AskUserQuestion: 'Qual versão?', TodoWrite: 'Atualiza a lista' }

// A pose de um subagente: o mesmo mapa do usage-hud para a sessão principal.
function kindOf(m) {
  if (m.status === 'working') return D.toolKinds[m.tool] ?? 'trabalhando'
  if (m.status === 'thinking') return 'pensando'
  if (m.status === 'waiting') return 'aguardando'
  if (m.status === 'done') return 'concluido'
  return m.reason === 'aborted' ? 'interrompido' : 'erro'
}

function renderAbove() {
  const rows = crew.filter(m => m.endedAt === null || NOW - m.endedAt < 6000)
  const active = crew.filter(m => m.endedAt === null).length
  const total = crew.reduce((s, m) => s + m.tokens, 0)
  const hudKing = '<div class="king" title="Rei Clawd do usage-hud">' + pose(mainKind, 48) + '</div>'
  const tripKing = view === 'old' ? '<div class="king" title="Rei Clawd da Tripulação" style="margin-right:0">' + D.kings[MAIN_TO_BOSS[mainKind] ?? 'working'] + '</div>' : ''
  let h = '<div class="hud">' + tripKing + hudKing + '<div class="card">' + hudCard() + '<div class="btns"><button class="btn">Gerar handoff</button></div></div></div>'
  if (rows.length) {
    h += '<div class="band ' + (view === 'new' ? 'v-new' : 'v-old') + '"><div class="band-head"><span class="t">Subagentes · ' + active + ' ' + (active === 1 ? 'ativo' : 'ativos') + ' · ' + formatTokens(total) + ' tokens</span>' +
      '<button class="plain" id="fold">' + (folded ? '▸ Mostrar' : '▾ Ocultar') + '</button></div>'
    if (!folded) rows.forEach((m, i) => {
      const st = STATUS[m.status]
      const isNew = view === 'new'
      const c = D.chars.find(x => x.id === m.charId)
      const icon = isNew ? pose(kindOf(m), 34, crownRows) : D.crabs[m.charId + ':' + st.eyes]
      const name = isNew ? shortType(m.type) : c.name
      const bar = isNew ? hudBar('b' + i, progressOf(m), 140, m.status === 'working') : hairline('r' + i, barPct(m), c.color)
      const act = cut(activity(m) || st.label, 32)
      h += '<div class="row"><span class="c-icon" title="' + esc(isNew ? 'Clawd: ' + D.labels[kindOf(m)] : c.name) + '">' + icon + '</span>' +
        '<span class="c-name">' + esc(name) + '</span><span class="c-model" style="color:' + (isNew ? CLAUDE : modelColor(m.model)) + '">' + esc(m.model) + '</span>' +
        '<span class="c-bar" title="' + (isNew ? progressOf(m) + '% da tarefa' : pctOf(m) + '% do contexto') + '">' + bar + '</span>' +
        (isNew ? '<span class="c-pct">' + progressOf(m) + '%</span><span class="c-tok wide">' + tokensOf(m) + '</span>' +
          '<span class="c-meta">' + formatTime((m.endedAt ?? NOW) - m.startedAt) + ' ·</span>'
        : '<span class="c-tok">' + formatTokens(m.tokens) + '</span><span class="c-meta">' + pctOf(m) + '% · ' + formatTime((m.endedAt ?? NOW) - m.startedAt) + ' ·</span>') +
        '<span class="c-act" style="color:' + (m.status === 'working' ? 'var(--detail)' : st.color) + '">' + esc(act) + '</span>' +
        (m.endedAt === null ? '<span class="c-stop"><button class="plain" data-stop="' + m.id + '">■ Parar</button></span>' : '') + '</div>'
    })
    h += '</div>'
  }
  document.getElementById('above').innerHTML = h
  document.getElementById('mainLbl').textContent = D.labels[mainKind]
  document.getElementById('crownLbl').textContent = crownRows ? 'sim' : 'não'
}

function setStatus(m, status) {
  m.status = status
  m.reason = status === 'done' ? 'answer' : status === 'error' ? (m.reason === 'aborted' ? 'aborted' : 'error') : null
  m.endedAt = status === 'done' || status === 'error' ? NOW - 2000 : null
  if (status === 'working') { m.tool = m.tool ?? 'Read'; m.target = TARGET[m.tool] }
  else { m.tool = null; m.target = { thinking: 'Pensando…', waiting: 'Aguardando trabalho em segundo plano', done: 'Devolveu o resultado', error: m.reason === 'aborted' ? 'Interrompido' : 'Falhou' }[status] }
}

function renderCtls() {
  const opt = (list, cur) => list.map(([v, t]) => '<option value="' + v + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + t + '</option>').join('')
  document.getElementById('ctls').innerHTML = crew.map((m, i) => '<div class="ctl" data-i="' + i + '"><b>' + esc(shortType(m.type)) + '</b>' +
    '<select data-k="status">' + opt([['working', 'Trabalhando'], ['thinking', 'Pensando'], ['waiting', 'Aguardando'], ['done', 'Concluído'], ['error', 'Erro'], ['aborted', 'Interrompido']], m.status === 'error' && m.reason === 'aborted' ? 'aborted' : m.status) + '</select>' +
    '<select data-k="tool"' + (m.status === 'working' ? '' : ' disabled') + '>' + opt(Object.keys(TARGET).map(t => [t, t]), m.tool ?? '') + '</select>' +
    '<select data-k="model">' + opt(Object.keys(MODEL_WINDOW).map(k => [k, k]), m.model) + '</select>' +
    '<select data-k="progress" title="Progresso da tarefa">' + opt(STEPS.map(v => [v, v + '% da tarefa']), m.progress) + '</select>' +
    '<input data-k="tokens" type="range" min="0" max="' + (MODEL_WINDOW[m.model] ?? 200000) + '" step="1000" value="' + m.tokens + '" title="Tokens do contexto">' +
    '<button class="plain" data-k="remove">remover</button></div>').join('')
}

document.addEventListener('click', e => {
  const t = e.target.closest('button')
  if (!t) return
  if (t.dataset.view) {
    view = t.dataset.view
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b === t)))
  } else if (t.id === 'fold') folded = !folded
  else if (t.dataset.stop) { const m = crew.find(x => x.id === t.dataset.stop); m.reason = 'aborted'; setStatus(m, 'error'); renderCtls() }
  else if (t.id === 'crown') crownRows = !crownRows
  else if (t.id === 'add') {
    const types = ['Plan', 'security-review', 'claude-code-guide', 'statusline-setup', 'nimble:nimble-researcher']
    const charIds = ['mestre', 'pirata', 'merlin', 'bip', 'dj']
    const n = crew.length % types.length
    crew.push({ id: 'a' + Date.now(), charId: charIds[n], type: types[n], model: 'Sonnet 5.5', window: 200000, startedAt: 70000, endedAt: null, status: 'working', tool: 'Edit', target: TARGET.Edit, tokens: 40000, reason: null, progress: 0 })
    renderCtls()
  } else if (t.id === 'mainState') { const k = Object.keys(D.labels); mainKind = k[(k.indexOf(mainKind) + 1) % k.length] }
  else if (t.dataset.k === 'remove') { crew.splice(+t.closest('.ctl').dataset.i, 1); renderCtls() }
  renderAbove()
})
document.addEventListener('input', e => {
  const el = e.target, box = el.closest('.ctl')
  if (!box) return
  const m = crew[+box.dataset.i]
  if (el.dataset.k === 'status') { if (el.value === 'aborted') { m.reason = 'aborted'; setStatus(m, 'error') } else { m.reason = null; setStatus(m, el.value) } renderCtls() }
  if (el.dataset.k === 'tool') { m.tool = el.value; m.target = TARGET[m.tool] }
  if (el.dataset.k === 'tokens') m.tokens = +el.value
  if (el.dataset.k === 'model') { m.model = el.value; renderCtls() }
  if (el.dataset.k === 'progress') m.progress = +el.value
  renderAbove()
})

document.getElementById('poses').innerHTML = Object.keys(D.labels).map(k => '<div class="pose">' + pose(k, 34, false) + D.labels[k] + '<small>' + k + '</small></div>').join('')
renderCtls()
renderAbove()
</script>
</body>
</html>
`

const out = join(HERE, 'tripulacao-prototype.html')
writeFileSync(out, html, 'utf8')
console.log(`ok  ${out}  ${html.length} caracteres`)
