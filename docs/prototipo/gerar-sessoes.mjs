// Gera sessoes-prototype.html: como as sessões em paralelo aparecem na faixa hoje (2.1.0) e a
// proposta de mostrá-las como linhas de subagente, com o Rei Clawd de coroa no lugar do ponto.
//
// Os desenhos vêm do código dos mods, importados (nunca redesenhados aqui):
// - hooks/clawd.ts deste repo: o Clawd sem coroa dos subagentes e o mini Clawd da barra;
// - ../usage-hud/hooks/clawd.ts: o Rei Clawd, com coroa, que cada sessão paralela é.
//
// Rodar na raiz do repositório: node docs/prototipo/gerar-sessoes.mjs  (Node 22.18+)
// Edite este gerador, não o HTML.

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')
const HUD = join(REPO, '..', 'usage-hud')

const crew = await import(pathToFileURL(join(REPO, 'hooks', 'clawd.ts')).href)
const hud = await import(pathToFileURL(join(HUD, 'hooks', 'clawd.ts')).href)

const CLAUDE = crew.CLAUDE
const BAR_WIDTH = 140
const { width: W, height: H } = crew.CLAWD_SIZE

// O Rei Clawd do usage-hud no tamanho das linhas da faixa (o mesmo viewBox, 34 x 33).
const king = kind => hud.clawdSvg(kind).replace(/width="48" height="46"/, `width="${W}" height="${H}"`)
const plain = kind => crew.clawdSvg(kind)

// O mini Clawd da barra; o de uma sessão ganha uma coroa de 3 pixels.
function miniCrowned(color, isHopping) {
  const crown = `<g fill="#ffd34d"><rect x="-4" y="-14" width="2" height="2"/><rect x="-1" y="-15" width="2" height="3"/><rect x="2" y="-14" width="2" height="2"/><rect x="-4" y="-12" width="8" height="1"/></g>`
  return crew.miniClawd(color, isHopping).replace('<g shape-rendering="crispEdges"><g>', `<g shape-rendering="crispEdges"><g>${crown}`)
}

// A barra de tarefa como o register.tsx desenha (taskBar), com o mini Clawd de cada um.
function taskBar(id, pct, isHopping, isKing) {
  const w = (Math.min(Math.max(pct ?? 0, 0), 100) / 100) * BAR_WIDTH
  const mini = isKing ? miniCrowned(CLAUDE, isHopping) : crew.miniClawd(CLAUDE, isHopping)
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BAR_WIDTH + 8}" height="20" viewBox="0 -16 ${BAR_WIDTH + 8} 20">`,
    `<linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="${crew.baseColor(crew.CLAUDE_ORANGE, 0.45)}"/><stop offset="1" stop-color="${CLAUDE}"/></linearGradient>`,
    `<rect x="0" y="-1" width="${BAR_WIDTH}" height="2" rx="1" fill="#ffffff" fill-opacity=".07"/>`,
    `<rect x="0" y="-1" width="${w}" height="2" rx="1" fill="url(#${id})"/>`,
    pct === null ? '' : `<g transform="translate(${Math.max(w, 8)} 0)">${mini}</g>`,
    '</svg>',
  ].join('')
}

const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/* ---------------- os dados do exemplo ---------------- */

const SUBAGENTS = [
  { pose: 'lendo', type: 'Explore', model: 'Haiku 5.5', pct: 50, tokens: '18k / 1M', time: '00:42', act: 'Read hooks/register.tsx' },
]

// Cada sessão paralela, como o arquivo dela diria.
const PEERS = [
  {
    pose: 'editando', project: 'usage-hud', title: 'Ajustar o card que sobrepõe texto', model: 'Opus 5.5', pct: 60,
    tokens: '340k / 1M', time: '12:05', act: 'Edit hooks/card.ts', subs: 2, status: 'working',
  },
  {
    pose: 'esperando', project: 'CinePotato', title: 'Arrumar a faixa de sessões', model: 'Opus 5.5', pct: 75,
    tokens: '120k / 1M', time: '03:10', act: 'Esperando sua resposta', subs: 0, status: 'asking',
  },
  {
    pose: 'parado', project: 'tripulacao', title: 'Revisar o README', model: 'Sonnet 5.5', pct: null,
    tokens: '80k / 1M', time: '04:12', act: 'Respondeu há 4min', subs: 0, status: 'idle',
  },
]

const STATUS_COLOR = { working: 'var(--detail)', asking: '#e0b04a', idle: 'var(--faded)' }

/* ---------------- as linhas ---------------- */

function subRow(m, i) {
  return `<div class="row">
  <div class="c-icon">${plain(m.pose)}</div>
  <div class="c-name">${esc(m.type)}</div>
  <div class="c-model" style="color:${CLAUDE}">${esc(m.model)}</div>
  <div class="c-bar">${taskBar(`s${i}`, m.pct, true, false)}</div>
  <div class="c-pct">${m.pct}%</div>
  <div class="c-tok">${esc(m.tokens)}</div>
  <div class="c-meta">${m.time} ·</div>
  <div class="c-act">${esc(m.act)}</div>
  <button class="plain c-stop">■ Parar</button>
</div>`
}

function peerRow(p, i) {
  const pct = p.pct === null ? '<div class="c-pct none">—</div>' : `<div class="c-pct">${p.pct}%</div>`
  const subs = p.subs > 0 ? `<span class="subs">${p.subs} sub</span>` : ''
  return `<div class="row peer" title="${esc(p.title)}">
  <div class="c-icon">${king(p.pose)}</div>
  <div class="c-name peer-name">${esc(p.project)}</div>
  <div class="c-model" style="color:${CLAUDE}">${esc(p.model)}</div>
  <div class="c-bar">${taskBar(`p${i}`, p.pct, p.status === 'working', true)}</div>
  ${pct}
  <div class="c-tok">${esc(p.tokens)}</div>
  <div class="c-meta">${p.time} ·</div>
  <div class="c-act" style="color:${STATUS_COLOR[p.status]}">${esc(p.act)}<span class="title"> · ${esc(p.title)}</span></div>
  ${subs}
</div>`
}

// A faixa de hoje (2.1.0): ponto colorido, pasta, primeiro prompt, atividade e números.
function todayRow(p) {
  const dot = p.status === 'working' ? '#e07a5f' : '#7c7c82'
  const figures = [p.subs > 0 ? `${p.subs} sub` : '', 'ctx 34%', '15s'].filter(Boolean).join(' · ')
  return `<div class="row today">
  <div style="width:16px;color:${dot}">●</div>
  <div style="width:128px;color:${CLAUDE}">${esc(p.project)}</div>
  <div style="width:224px;color:var(--detail);overflow:hidden;text-overflow:ellipsis">${esc(p.title)}</div>
  <div class="c-act" style="color:var(--detail)">${esc(p.act)}</div>
  <div class="c-meta">${figures}</div>
</div>`
}

const band = (head, inner) => `<div class="band"><div class="band-head"><div class="t">${head}</div><button class="fold">▾ Ocultar</button></div>${inner}</div>`

const today = band('Sessões em paralelo · 3 abertas', PEERS.map(todayRow).join(''))

const proposal = band(
  'Subagentes · 1 ativo · 18k tokens',
  SUBAGENTS.map(subRow).join('') +
    `<div class="subhead">Sessões em paralelo · 3 abertas</div>` +
    PEERS.map(peerRow).join(''),
)

// As poses que uma sessão paralela pode ter: as mesmas do Rei Clawd da sessão principal.
const POSES = ['pensando', 'lendo', 'editando', 'terminal', 'web', 'orquestrando', 'esperando', 'aguardando', 'compactando', 'concluido', 'parado', 'erro']
const poseGrid = POSES.map(k => `<div class="pose">${hud.clawdSvg(k)}<small>${esc(hud.CLAWD_LABEL[k])}</small></div>`).join('')

/* ---------------- página ---------------- */

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sessões em paralelo</title>
<style>
:root{
  --page:#141416; --win-edge:#232326; --card:#151517; --card-edge:#2a2a2d; --tile:#1c1c1f;
  --label:#7c7c82; --figure:#f2f2f5; --detail:#85858b; --faded:#6e6e73; --name:#a1a1a6; --lime:#a3e635; --hint:#4d4d52;
}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--figure);font:13px/20px Inter,-apple-system,'Segoe UI',system-ui,sans-serif;font-variant-numeric:tabular-nums}
main{max-width:1000px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:17px;margin:0 0 4px}
.sub{color:var(--detail);margin:0 0 20px}
h2{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--label);margin:32px 0 10px;font-weight:600}
.win{background:linear-gradient(#121214,#0a0a0b);border:1px solid var(--win-edge);border-radius:16px;padding:14px 20px 18px;overflow-x:auto}
.band{min-width:900px;padding:0 8px}
.band-head{display:flex;align-items:center}
.band-head .t{flex:1;color:var(--detail)}
.fold{background:#2a2a2d;color:var(--figure);border:0;border-radius:6px;font:500 12px/24px inherit;font-family:inherit;padding:0 10px}
.subhead{color:var(--detail);margin-top:18px;padding-top:12px;border-top:1px solid #1f1f22}
.row{display:flex;align-items:center;margin-top:10px;min-height:33px;white-space:nowrap}
.row>*{flex-shrink:0}
.row.today{min-height:20px;margin-top:8px}
.c-icon{width:40px;display:flex;justify-content:center}
.c-name{width:80px;color:var(--detail);overflow:hidden;text-overflow:ellipsis}
.peer-name{color:var(--figure);font-weight:500}
.c-model{width:72px}
.c-bar{display:flex}
.c-pct{width:40px;margin-left:8px;color:#d97757;font-weight:500}
.c-pct.none{color:var(--hint)}
.c-tok{width:88px;text-align:right;color:var(--detail)}
.c-meta{margin-left:8px;color:var(--detail)}
.c-act{flex:1 1 auto!important;margin-left:8px;overflow:hidden;text-overflow:ellipsis;min-width:0}
.c-act .title{color:var(--hint)}
.c-stop{margin-left:8px}
.plain{background:none;border:0;color:var(--faded);font:inherit;padding:0}
.subs{margin-left:8px;color:var(--name);background:var(--tile);border:1px solid var(--card-edge);border-radius:999px;padding:0 8px;font-size:12px;line-height:18px}
.prompt{margin-top:16px;border:1px solid var(--card-edge);background:var(--card);border-radius:12px;padding:10px 16px;color:var(--hint)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px}
.pose{background:#1a1a1d;border:1px solid var(--card-edge);border-radius:10px;padding:10px 6px 8px;text-align:center}
.pose svg{display:block;margin:0 auto 4px}
.pose small{display:block;color:var(--lime);font:10px/14px 'JetBrains Mono','Cascadia Code',Consolas,monospace}
ul{margin:8px 0 0;padding-left:20px;color:var(--detail)}
li{margin:4px 0}
li b{color:var(--figure);font-weight:500}
ol{margin:8px 0 0;padding-left:20px;color:var(--detail)}
ol li b{color:#e0b04a}
</style>
</head>
<body>
<main>
<h1>Sessões em paralelo na faixa</h1>
<p class="sub">Proposta: cada sessão paralela é um Rei Clawd trabalhando, então ela ganha uma linha igual à dos subagentes, com a coroa.</p>

<h2>Hoje (2.1.0)</h2>
<div class="win">${today}<div class="prompt">Escreva aqui…</div></div>

<h2>Proposta</h2>
<div class="win">${proposal}<div class="prompt">Escreva aqui…</div></div>

<h2>O que muda em cada linha de sessão</h2>
<ul>
<li><b>Rei Clawd com coroa</b> no lugar do ponto, na pose do que a sessão está fazendo (as mesmas poses do rei do usage-hud).</li>
<li><b>Pasta</b> no lugar do tipo do subagente, em destaque, porque é o que diferencia uma sessão da outra.</li>
<li><b>Modelo</b> da sessão, em laranja, como nos subagentes.</li>
<li><b>Barra da lista de tarefas</b> da própria sessão (a lista que aparece embaixo da mensagem no app), com o mini Clawd de coroa na ponta. Sem lista: barra vazia e "—".</li>
<li><b>Contexto em tokens</b> ("340k / 1M") no lugar do "ctx 34%", no mesmo formato dos subagentes.</li>
<li><b>Tempo</b> desde que a sessão começou o pedido atual.</li>
<li><b>Atividade</b> e, depois dela em cinza, o primeiro pedido da sessão (passando o mouse aparece inteiro). Em amarelo quando ela está esperando você.</li>
<li><b>Subagentes da outra sessão</b> como um selo "2 sub" no fim da linha, no lugar do botão Parar (daqui não dá para parar outra sessão).</li>
</ul>

<h2>Para você decidir</h2>
<ol>
<li><b>Primeiro pedido:</b> fica depois da atividade (como está) ou numa coluna própria?</li>
<li><b>Mini Clawd de coroa na barra:</b> gosta, ou deixa igual ao dos subagentes?</li>
<li><b>Sessão parada há muito tempo:</b> continua aparecendo enquanto estiver aberta, ou some depois de uns minutos sem atividade?</li>
</ol>

<h2>Poses que uma sessão paralela pode ter</h2>
<div class="grid">${poseGrid}</div>
</main>
</body>
</html>
`

writeFileSync(join(HERE, 'sessoes-prototype.html'), html)
console.log('docs/prototipo/sessoes-prototype.html')
