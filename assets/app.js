'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const BASE = window.BASE, MAN = window.MANIFEST;
const PRODS = BASE.produtos;
const COD_ORDEM = Object.keys(PRODS);
const REF = parseData(BASE.ref);
let ADMIN = false;   // acesso a múltiplos setores
let SETOR = null;    // objeto do setor atual
let ACC = null;      // objeto do acesso atual

/* ===== UTILS ===== */
function parseData(s){ if(!s) return null; const p=s.split('-'); return new Date(+p[0],+p[1]-1,+p[2]); }
function diasDesde(s){ const d=parseData(s); return d? Math.round((REF-d)/86400000) : Infinity; }
function fmtData(s){ if(!s) return '—'; const p=s.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
function pill(c){ return `<span class="pill cv-${c}">${c}</span>`; }
async function sha256(t){
  const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t.toLowerCase()));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function fkeyOf(pw){ return (await sha256('nc-arq:'+pw)).slice(0,16); }

/* ===== GATE ===== */
$('#gateBtn').onclick = tentarSenha;
$('#gatePass').addEventListener('keydown', e=>{ if(e.key==='Enter') tentarSenha(); });

async function tentarSenha(){
  const pw = $('#gatePass').value.trim();
  if(!pw) return;
  const h = await sha256(pw);
  const acc = MAN.acessos.find(a => a.h === h);
  if(!acc){ $('#gateErr').textContent = 'Senha inválida.'; return; }
  const fk = await fkeyOf(pw);
  try { sessionStorage.setItem('nc_fk', fk); sessionStorage.setItem('nc_acc', JSON.stringify(acc)); } catch(e){}
  $('#gate').style.display = 'none';
  iniciar(fk, acc);
}

/* ===== INICIAR ===== */
function carregarArquivo(fk, cb){
  const sc = document.createElement('script');
  sc.src = 'dados/d/' + fk + '.js';
  sc.onload = cb;
  sc.onerror = () => {
    try { sessionStorage.clear(); } catch(e){}
    $('#gate').style.display = 'flex';
    $('#gateErr').textContent = 'Não foi possível carregar os dados.';
  };
  document.body.appendChild(sc);
}

function iniciar(fk, acc){
  ACC = acc;
  document.getElementById('headerEl').style.display = '';
  carregarArquivo(fk, () => {
    const loaded = Object.keys(window.SETORES || {});
    const ordered = MAN.setores.filter(s => loaded.includes(s.slug)).map(s => s.slug);
    if(ordered.length === 0){
      try { sessionStorage.clear(); } catch(e){}
      $('#gate').style.display = 'flex';
      document.getElementById('headerEl').style.display = 'none';
      $('#gateErr').textContent = 'Sem setores liberados para este acesso.';
      return;
    }
    ADMIN = ordered.length > 1;
    // acessobar
    document.getElementById('acessoBar').style.display = '';
    document.getElementById('rodapeAtual').textContent =
      'Base: ' + MAN.baseTotal + ' produtos · atualizado ' + MAN.atualizadoEm + ' · ref. ' + fmtData(BASE.ref);
    if(ADMIN){
      mostrarPicker(ordered);
    } else {
      mostrarDashboard(ordered[0]);
    }
  });
}

/* ===== SECTOR PICKER ===== */
function mostrarPicker(slugs){
  // header
  document.getElementById('headerMeta').style.display = 'none';
  document.getElementById('headerPickerMeta').style.display = '';
  document.getElementById('hAccLabel').textContent = 'Acesso: ' + ACC.label + ' · ' + slugs.length + ' setores';
  // voltar btn
  document.getElementById('voltarBtn').style.display = 'none';
  // acessobar
  document.getElementById('acessoLabel').textContent = 'Acesso: ' + ACC.label;
  document.getElementById('trocarBtn').style.display = 'none';
  // seções
  document.getElementById('pickerSection').style.display = '';
  document.getElementById('dashSection').style.display = 'none';
  // render cards
  const total = MAN.baseTotal;
  const setores = MAN.setores.filter(s => slugs.includes(s.slug));
  document.getElementById('pickerGrid').innerHTML = setores.map(s => {
    const pct = Math.round(s.vende / total * 100);
    const hasA = s.curvaAnaoVende > 0;
    return `<div class="scard ${hasA ? 'scard-alert' : ''}" data-slug="${s.slug}" role="button" tabindex="0">
      <div class="scard-nome">${s.nome}</div>
      <div class="scard-meta">${s.clientes} clientes</div>
      <div class="scard-cov">
        <div class="cov-bar"><div style="width:${pct}%"></div></div>
        <span>${s.vende}/${total} produtos vendidos (${pct}%)</span>
      </div>
      <div class="${hasA ? 'badge-alert' : 'badge-ok'}">
        ${hasA ? '⚠ ' + s.curvaAnaoVende + ' Curva A sem vender' : '✓ Curva A completa'}
      </div>
    </div>`;
  }).join('');
  $$('.scard').forEach(card => {
    const go = () => mostrarDashboard(card.dataset.slug);
    card.onclick = go;
    card.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' ') go(); });
  });
}

/* ===== DASHBOARD ===== */
function mostrarDashboard(slug){
  SETOR = window.SETORES[slug];
  const info = MAN.setores.find(s => s.slug === slug);
  // header
  document.getElementById('headerMeta').style.display = '';
  document.getElementById('headerPickerMeta').style.display = 'none';
  document.getElementById('hSetor').textContent = SETOR.setor;
  document.getElementById('hSub').textContent = info.clientes + ' clientes · Acesso: ' + ACC.label;
  // botão voltar (só se multi-setor)
  const voltarBtn = document.getElementById('voltarBtn');
  voltarBtn.style.display = ADMIN ? '' : 'none';
  // acessobar
  document.getElementById('acessoLabel').textContent = SETOR.setor + ' · ' + ACC.label;
  document.getElementById('trocarBtn').style.display = ADMIN ? '' : 'none';
  // seções
  document.getElementById('pickerSection').style.display = 'none';
  document.getElementById('dashSection').style.display = '';
  // reset tab
  $$('.tab').forEach(t => t.classList.remove('on'));
  $$('.painel').forEach(p => p.classList.add('hidden'));
  $('[data-tab="resumo"]').classList.add('on');
  $('#tab-resumo').classList.remove('hidden');
  // renderiza
  popularClientes();
  popularMarcas();
  renderTudo();
}

/* ===== NAVEGAÇÃO ===== */
document.getElementById('voltarBtn').onclick = () => {
  const loaded = Object.keys(window.SETORES || {});
  const slugs = MAN.setores.filter(s => loaded.includes(s.slug)).map(s => s.slug);
  mostrarPicker(slugs);
};
document.getElementById('trocarBtn').onclick = () => {
  const loaded = Object.keys(window.SETORES || {});
  const slugs = MAN.setores.filter(s => loaded.includes(s.slug)).map(s => s.slug);
  mostrarPicker(slugs);
};
document.getElementById('sairBtn').onclick = () => {
  try { sessionStorage.clear(); } catch(e){}
  location.reload();
};
document.getElementById('trocarAccBtn').onclick = () => {
  try { sessionStorage.clear(); } catch(e){}
  location.reload();
};

/* ===== JANELA / STATUS ===== */
function janela(){ return +$('#fJanela').value; }
function statusSetor(cod){
  const sp = SETOR.setorProds[cod];
  if(!sp) return {s:'nunca', ult:null, nCli:0, v:0};
  const d = diasDesde(sp[1]);
  return {s: d<=janela()?'vende':'parou', ult:sp[1], nCli:sp[2], v:sp[0], dias:d};
}

/* ===== TABS ===== */
$$('.tab').forEach(t => t.onclick = () => {
  $$('.tab').forEach(x => x.classList.remove('on')); t.classList.add('on');
  $$('.painel').forEach(p => p.classList.add('hidden'));
  $('#tab-' + t.dataset.tab).classList.remove('hidden');
});

/* ===== TEMA ===== */
function setTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('ferretti-theme', t); } catch(e){}
  const b = document.getElementById('themeBtn');
  if(b) b.textContent = t==='dark' ? '☀ Claro' : '🌙 Escuro';
}
document.getElementById('themeBtn').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  setTheme(cur === 'dark' ? 'light' : 'dark');
});
setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

/* ===== MARCAS (filtro) ===== */
function popularMarcas(){
  const ms = [...new Set(COD_ORDEM.map(c => PRODS[c].m))].sort();
  $('#fSetorMarca').innerHTML = '<option value="">Todas as marcas</option>' + ms.map(m => `<option>${m}</option>`).join('');
}

/* ===== TROCAR ABA ===== */
function switchTab(tabId, filtro){
  $$('.tab').forEach(t => t.classList.remove('on'));
  $$('.painel').forEach(p => p.classList.add('hidden'));
  $(`[data-tab="${tabId}"]`).classList.add('on');
  $(`#tab-${tabId}`).classList.remove('hidden');
  if(tabId === 'setor' && filtro !== undefined){
    $('#fSetorStatus').value = filtro;
    renderSetor();
  }
  window.scrollTo({top: document.getElementById('dashSection').offsetTop - 60, behavior:'smooth'});
}

/* ===== RENDER ===== */
function renderTudo(){ renderResumo(); renderSetor(); renderCliente(); }

function renderResumo(){
  const total = MAN.baseTotal;
  const vende = Object.keys(SETOR.setorProds).length;
  const info = MAN.setores.find(s => s.slug === SETOR.slug || s.nome === SETOR.setor);
  $('#cCobertura').textContent = vende + '/' + total;
  $('#barCob').style.width = Math.round(vende/total*100) + '%';
  $('#cNaoVende').textContent = total - vende;
  $('#cClientes').textContent = info ? info.clientes : '—';
  const aNao = COD_ORDEM.filter(c => PRODS[c].c==='A' && !SETOR.setorProds[c]);
  $('#cCurvaA').textContent = aNao.length;
  // Período de análise
  const ref = BASE.ref; // "YYYY-MM-DD"
  const [ry,rm,rd] = ref.split('-').map(Number);
  const ini = new Date(ry, rm-1, rd); ini.setMonth(ini.getMonth()-18);
  const iniStr = String(ini.getDate()).padStart(2,'0')+'/'+String(ini.getMonth()+1).padStart(2,'0')+'/'+ini.getFullYear();
  $('#periodoInfo').textContent = `Análise: ${iniStr} a ${fmtData(ref)} (18 meses)`;
  // Cards clicáveis
  $('#cardCobertura').onclick = () => switchTab('setor', 'vende');
  $('#cardNaoVende').onclick  = () => switchTab('setor', 'nunca');
  $('#cardCurvaA').onclick    = () => {
    if(aNao.length === 0){ return; }
    document.getElementById('tblResumoA').scrollIntoView({behavior:'smooth', block:'start'});
  };
  $('#cardClientes').onclick  = () => switchTab('cliente');
  const tb = $('#tblResumoA tbody');
  if(aNao.length===0){
    $('#resumoCurvaAvazio').style.display = 'block'; tb.innerHTML = '';
  } else {
    $('#resumoCurvaAvazio').style.display = 'none';
    tb.innerHTML = aNao.map(c => `<tr><td class="cod">${c}</td><td>${PRODS[c].d}</td><td>${PRODS[c].m}</td><td>${pill('A')}</td></tr>`).join('');
  }
  const op = COD_ORDEM.filter(c => SETOR.setorProds[c] && (PRODS[c].c==='A'||PRODS[c].c==='B'))
    .map(c => ({c, n:SETOR.setorProds[c][2]})).sort((a,b) => a.n-b.n).slice(0,25);
  $('#tblOportSetor tbody').innerHTML = op.map(o => `<tr><td class="cod">${o.c}</td><td>${PRODS[o.c].d}</td><td>${PRODS[o.c].m}</td><td>${pill(PRODS[o.c].c)}</td><td>${o.n}</td></tr>`).join('');
}

function renderSetor(){
  const busca = $('#fSetorBusca').value.toLowerCase().trim();
  const fm = $('#fSetorMarca').value, fc = $('#fSetorCurva').value, fs = $('#fSetorStatus').value;
  const rows = [];
  for(const c of COD_ORDEM){
    const p = PRODS[c];
    if(fm && p.m!==fm) continue;
    if(fc && p.c!==fc) continue;
    if(busca && !(c.toLowerCase().includes(busca)||p.d.toLowerCase().includes(busca))) continue;
    const st = statusSetor(c);
    if(fs==='naovende' && st.s==='vende') continue;
    if(fs==='nunca' && st.s!=='nunca') continue;
    if(fs==='parou' && st.s!=='parou') continue;
    if(fs==='vende' && st.s!=='vende') continue;
    rows.push({c,p,st});
  }
  rows.sort((a,b) => { const o={A:0,B:1,C:2,D:3}; return o[a.p.c]-o[b.p.c] || a.p.d.localeCompare(b.p.d); });
  $('#setorCount').textContent = rows.length + ' produto(s)';
  const lbl = {vende:'Vende', parou:'Parou', nunca:'Nunca vendeu'};
  $('#tblSetor tbody').innerHTML = rows.length
    ? rows.map(r => `<tr>
        <td class="cod">${r.c}</td><td>${r.p.d}</td><td>${r.p.m}</td><td>${pill(r.p.c)}</td>
        <td class="st st-${r.st.s}">${lbl[r.st.s]}</td>
        <td>${fmtData(r.st.ult)}</td><td>${r.st.nCli||'—'}</td></tr>`).join('')
    : '<tr><td colspan="7" class="vazio">Nenhum produto neste filtro.</td></tr>';
}

/* ===== CLIENTE ===== */
let CLI = null;
function popularClientes(){
  const sel = $('#selCliente');
  const cs = [...SETOR.clientes].sort((a,b) => a.n.localeCompare(b.n));
  sel.innerHTML = '<option value="">— escolha um cliente —</option>' + cs.map(c => `<option value="${c.c}">${c.n}</option>`).join('');
  CLI = null; $('#cliResumo').classList.add('hidden'); $('#tblCli tbody').innerHTML = ''; $('#cliCount').textContent = '';
}
function renderCliente(){
  if(!CLI) return;
  const busca = $('#fCliBusca').value.toLowerCase().trim();
  const fc = $('#fCliCurva').value, fs = $('#fCliStatus').value;
  let nCompra=0, nNao=0, nA=0;
  const rows = [];
  for(const c of COD_ORDEM){
    const p = PRODS[c];
    const cp = CLI.p[c];
    const sp = SETOR.setorProds[c];
    const compra = !!cp;
    if(compra) nCompra++; else { nNao++; if(p.c==='A') nA++; }
    if(fc && p.c!==fc) continue;
    if(busca && !(c.toLowerCase().includes(busca)||p.d.toLowerCase().includes(busca))) continue;
    const oport = !compra && !!sp;
    if(fs==='naocompra' && compra) continue;
    if(fs==='compra' && !compra) continue;
    if(fs==='oportunidade' && !oport) continue;
    rows.push({c,p,cp,sp,compra,oport});
  }
  rows.sort((a,b) => {
    if(a.compra!==b.compra) return a.compra?1:-1;
    const o={A:0,B:1,C:2,D:3}; return o[a.p.c]-o[b.p.c] || a.p.d.localeCompare(b.p.d);
  });
  $('#ccCompra').textContent = nCompra; $('#ccNao').textContent = nNao; $('#ccA').textContent = nA;
  $('#cliResumo').classList.remove('hidden');
  $('#cliCount').textContent = rows.length + ' produto(s)';
  $('#tblCli tbody').innerHTML = rows.length ? rows.map(r => {
    const sit = r.compra ? '<span class="st st-vende">Compra</span>'
      : `<span class="st st-nunca">Não compra</span>${r.oport?'<span class="tag-op">OPORTUNIDADE</span>':''}`;
    const setorVende = r.sp ? `<span class="simn sim">Sim</span> <span class="muted">(${r.sp[2]} cli.)</span>` : '<span class="nao">Não</span>';
    return `<tr><td class="cod">${r.c}</td><td>${r.p.d}</td><td>${r.p.m}</td><td>${pill(r.p.c)}</td>
      <td>${sit}</td><td>${setorVende}</td><td>${r.compra?fmtData(r.cp[1]):'—'}</td></tr>`;
  }).join('') : '<tr><td colspan="7" class="vazio">Nenhum produto neste filtro.</td></tr>';
}
$('#selCliente').onchange = function(){
  CLI = this.value ? SETOR.clientes.find(c => c.c===this.value) : null;
  if(!CLI){ $('#cliResumo').classList.add('hidden'); $('#tblCli tbody').innerHTML=''; $('#cliCount').textContent=''; return; }
  renderCliente();
};

/* ===== LISTENERS FILTROS ===== */
['fSetorBusca','fSetorMarca','fSetorCurva','fSetorStatus','fJanela'].forEach(id => {
  $('#'+id).addEventListener('input', () => { renderSetor(); if(id==='fJanela') renderResumo(); });
});
['fCliBusca','fCliCurva','fCliStatus'].forEach(id => $('#'+id).addEventListener('input', renderCliente));

/* ===== AUTO-LOGIN NA RECARGA ===== */
const savedFk = sessionStorage.getItem('nc_fk'), savedAccRaw = sessionStorage.getItem('nc_acc');
if(savedFk && savedAccRaw){
  try {
    const acc = JSON.parse(savedAccRaw);
    if(MAN.acessos.some(a => a.h===acc.h)){
      $('#gate').style.display = 'none';
      iniciar(savedFk, acc);
    }
  } catch(e){}
}
