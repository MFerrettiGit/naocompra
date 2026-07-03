'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const BASE = window.BASE, MAN = window.MANIFEST;
const PRODS = BASE.produtos;
const COD_ORDEM = Object.keys(PRODS);
const REF = parseData(BASE.ref);
let ADMIN = false;
let SETOR = null;
let ACC = null;

/* ===== UTILS ===== */
function parseData(s){ if(!s) return null; const p=s.split('-'); return new Date(+p[0],+p[1]-1,+p[2]); }
function diasDesde(s){ const d=parseData(s); return d? Math.round((REF-d)/86400000) : Infinity; }
function fmtData(s){ if(!s) return '—'; const p=s.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
function fmtVal(v){ return 'R$ ' + v.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0}); }
function pill(c){ return `<span class="pill cv-${c}">${c}</span>`; }
function pillCli(c){ return `<span class="pill cv-${c}" title="Curva de compras ${c}">${c}</span>`; }
async function sha256(t){
  const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t.toLowerCase()));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function fkeyOf(pw){ return (await sha256('nc-arq:'+pw)).slice(0,16); }

/* ===== PERSISTÊNCIA (localStorage 30 dias) ===== */
const LS_FK  = 'nc_fk';
const LS_ACC = 'nc_acc';
const LS_TS  = 'nc_ts';
const LS_TTL = 30 * 24 * 60 * 60 * 1000; // 30 dias

function lsSave(fk, acc){
  try {
    localStorage.setItem(LS_FK,  fk);
    localStorage.setItem(LS_ACC, JSON.stringify(acc));
    localStorage.setItem(LS_TS,  Date.now().toString());
  } catch(e){}
}
function lsClear(){
  try { localStorage.removeItem(LS_FK); localStorage.removeItem(LS_ACC); localStorage.removeItem(LS_TS); } catch(e){}
}
function lsLoad(){
  try {
    const fk = localStorage.getItem(LS_FK);
    const raw = localStorage.getItem(LS_ACC);
    const ts  = parseInt(localStorage.getItem(LS_TS) || '0', 10);
    if(!fk || !raw) return null;
    if(Date.now() - ts > LS_TTL){ lsClear(); return null; }
    return { fk, acc: JSON.parse(raw) };
  } catch(e){ return null; }
}

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
  lsSave(fk, acc);
  $('#gate').style.display = 'none';
  iniciar(fk, acc);
}

/* ===== INICIAR ===== */
function carregarArquivo(fk, cb){
  const sc = document.createElement('script');
  sc.src = 'dados/d/' + fk + '.js';
  sc.onload = cb;
  sc.onerror = () => {
    lsClear();
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
      lsClear();
      $('#gate').style.display = 'flex';
      document.getElementById('headerEl').style.display = 'none';
      $('#gateErr').textContent = 'Sem setores liberados para este acesso.';
      return;
    }
    ADMIN = ordered.length > 1;
    document.getElementById('acessoBar').style.display = '';
    document.getElementById('rodapeAtual').textContent =
      'Base: ' + MAN.baseTotal + ' produtos · atualizado ' + MAN.atualizadoEm + ' · ref. ' + fmtData(BASE.ref);
    if(ADMIN) mostrarPicker(ordered);
    else mostrarDashboard(ordered[0]);
  });
}

/* ===== SECTOR PICKER ===== */
function mostrarPicker(slugs){
  document.getElementById('headerMeta').style.display = 'none';
  document.getElementById('headerPickerMeta').style.display = '';
  document.getElementById('hAccLabel').textContent = 'Acesso: ' + ACC.label + ' · ' + slugs.length + ' setores';
  document.getElementById('voltarBtn').style.display = 'none';
  document.getElementById('acessoLabel').textContent = 'Acesso: ' + ACC.label;
  document.getElementById('trocarBtn').style.display = 'none';
  document.getElementById('pickerSection').style.display = '';
  document.getElementById('dashSection').style.display = 'none';
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
  document.getElementById('headerMeta').style.display = '';
  document.getElementById('headerPickerMeta').style.display = 'none';
  document.getElementById('hSetor').textContent = SETOR.setor;
  document.getElementById('hSub').textContent = info.clientes + ' clientes · Acesso: ' + ACC.label;
  const voltarBtn = document.getElementById('voltarBtn');
  voltarBtn.style.display = ADMIN ? '' : 'none';
  document.getElementById('acessoLabel').textContent = SETOR.setor + ' · ' + ACC.label;
  document.getElementById('trocarBtn').style.display = ADMIN ? '' : 'none';
  document.getElementById('pickerSection').style.display = 'none';
  document.getElementById('dashSection').style.display = '';
  $$('.tab').forEach(t => t.classList.remove('on'));
  $$('.painel').forEach(p => p.classList.add('hidden'));
  $('[data-tab="resumo"]').classList.add('on');
  $('#tab-resumo').classList.remove('hidden');
  popularClientes();
  popularMarcas();
  renderTudo();
}

/* ===== NAVEGAÇÃO ===== */
document.getElementById('voltarBtn').onclick = () => {
  const slugs = MAN.setores.filter(s => Object.keys(window.SETORES||{}).includes(s.slug)).map(s => s.slug);
  mostrarPicker(slugs);
};
document.getElementById('trocarBtn').onclick = () => {
  const slugs = MAN.setores.filter(s => Object.keys(window.SETORES||{}).includes(s.slug)).map(s => s.slug);
  mostrarPicker(slugs);
};
document.getElementById('sairBtn').onclick = () => { lsClear(); location.reload(); };
document.getElementById('trocarAccBtn').onclick = () => { lsClear(); location.reload(); };

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
  if(tabId === 'setor' && filtro !== undefined){ $('#fSetorStatus').value = filtro; renderSetor(); }
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
  const ref = BASE.ref;
  const [ry,rm,rd] = ref.split('-').map(Number);
  // Início = 1º dia do mês, 18 meses atrás (mês completo)
  const ini = new Date(ry, rm-1, 1); ini.setMonth(ini.getMonth()-18);
  const iniStr = '01/'+String(ini.getMonth()+1).padStart(2,'0')+'/'+ini.getFullYear();
  // Fim = último dia do mês de referência
  const fimMes = new Date(ry, rm, 0);
  const fimStr = String(fimMes.getDate()).padStart(2,'0')+'/'+String(rm).padStart(2,'0')+'/'+ry;
  $('#periodoInfo').textContent = `Análise: ${iniStr} a ${fimStr} (18 meses completos)`;
  $('#cardCobertura').onclick = () => switchTab('setor', 'vende');
  $('#cardNaoVende').onclick  = () => switchTab('setor', 'nunca');
  $('#cardCurvaA').onclick    = () => { if(aNao.length) document.getElementById('tblResumoA').scrollIntoView({behavior:'smooth', block:'start'}); };
  $('#cardClientes').onclick  = () => switchTab('cliente');
  const tb = $('#tblResumoA tbody');
  if(aNao.length===0){
    $('#resumoCurvaAvazio').style.display = 'block'; tb.innerHTML = '';
  } else {
    $('#resumoCurvaAvazio').style.display = 'none';
    tb.innerHTML = aNao.map(c => `<tr style="cursor:pointer" data-cod="${c}" title="Ver clientes"><td class="cod">${c}</td><td>${PRODS[c].d}</td><td>${PRODS[c].m}</td><td>${pill('A')}</td></tr>`).join('');
  }
  // Parou de vender (status = parou no janela atual de 180 dias)
  const jan = janela();
  $('#resumoParouSub').textContent = `— sem venda nos últimos ${jan} dias`;
  const parou = COD_ORDEM.map(c => ({c, st:statusSetor(c)})).filter(x => x.st.s==='parou')
    .sort((a,b) => (b.st.dias||0)-(a.st.dias||0));
  if(parou.length===0){
    $('#resumoParouVazio').style.display = 'block';
    $('#tblResumoParou tbody').innerHTML = '';
  } else {
    $('#resumoParouVazio').style.display = 'none';
    $('#tblResumoParou tbody').innerHTML = parou.map(({c,st}) =>
      `<tr style="cursor:pointer" data-cod="${c}" title="Ver clientes"><td class="cod">${c}</td><td>${PRODS[c].d}</td><td>${PRODS[c].m}</td><td>${pill(PRODS[c].c)}</td><td>${fmtData(st.ult)}</td><td style="font-weight:700;color:var(--ambar)">${st.dias} dias</td></tr>`
    ).join('');
  }

  const op = COD_ORDEM.filter(c => SETOR.setorProds[c] && (PRODS[c].c==='A'||PRODS[c].c==='B'))
    .map(c => ({c, n:SETOR.setorProds[c][2]})).sort((a,b) => a.n-b.n).slice(0,25);
  $('#tblOportSetor tbody').innerHTML = op.map(o => `<tr style="cursor:pointer" data-cod="${o.c}" title="Ver clientes"><td class="cod">${o.c}</td><td>${PRODS[o.c].d}</td><td>${PRODS[o.c].m}</td><td>${pill(PRODS[o.c].c)}</td><td>${o.n}</td></tr>`).join('');

  // Clique em qualquer produto do resumo → abre modal de clientes
  $$('#tab-resumo tbody tr[data-cod]').forEach(tr => {
    tr.onclick = () => abrirModalProduto(tr.dataset.cod);
  });
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
    ? rows.map(r => `<tr style="cursor:pointer" data-cod="${r.c}" title="Ver clientes">
        <td class="cod">${r.c}</td><td>${r.p.d}</td><td>${r.p.m}</td><td>${pill(r.p.c)}</td>
        <td class="st st-${r.st.s}">${lbl[r.st.s]}</td>
        <td>${fmtData(r.st.ult)}</td><td>${r.st.nCli||'—'}</td></tr>`).join('')
    : '<tr><td colspan="7" class="vazio">Nenhum produto neste filtro.</td></tr>';
  $$('#tblSetor tbody tr[data-cod]').forEach(tr => {
    tr.onclick = () => abrirModalProduto(tr.dataset.cod);
  });
}

/* ===== CURVA ABC DE CLIENTES (Pareto 80/95) ===== */
function calcularCurvaClientes(clientes){
  clientes.forEach(c => {
    c._totalV = Object.values(c.p).reduce((s, arr) => s + (arr[0] || 0), 0);
    c._nProds  = Object.keys(c.p).length;
  });
  const sorted = [...clientes].sort((a,b) => b._totalV - a._totalV);
  const totalGeral = sorted.reduce((s,c) => s + c._totalV, 0);
  if(totalGeral === 0){ clientes.forEach(c => c.curvaC = 'C'); return; }
  // Atribui a curva ANTES de somar ao acumulado: o cliente que "cruza" 80% pertence ao grupo A
  let acum = 0, fase = 'A';
  sorted.forEach(c => {
    c.curvaC = fase;
    acum += c._totalV;
    const pct = acum / totalGeral;
    if(fase === 'A' && pct >= 0.80) fase = 'B';
    else if(fase === 'B' && pct >= 0.95) fase = 'C';
  });
}

/* ===== CLIENTE (multi-seleção) ===== */
let CLIS = [];
let _allClis = [];

function popularClientes(){
  _allClis = [...SETOR.clientes];
  calcularCurvaClientes(_allClis);
  // ordenação padrão: curva A → B → C, depois nome
  const _ORD = {A:0,B:1,C:2};
  _allClis.sort((a,b) => {
    const oa = a.curvaC in _ORD ? _ORD[a.curvaC] : 3;
    const ob = b.curvaC in _ORD ? _ORD[b.curvaC] : 3;
    return oa - ob || a.n.localeCompare(b.n);
  });
  CLIS = [];
  const redes = [...new Set(_allClis.map(c => c.r || '').filter(Boolean))].sort();
  $('#fCliRede').innerHTML = '<option value="">Todas as redes</option>'
    + redes.map(r => `<option value="${r}">${r}</option>`).join('');
  $('#fCliSearch').value = '';
  renderChips();
  $('#cliResumo').classList.add('hidden');
  $('#tblCli tbody').innerHTML = '';
  $('#cliCount').textContent = '';
  $('#cliProdFiltros').style.display = 'none';
}

function renderChips(){
  const rede   = $('#fCliRede').value;
  const busca  = $('#fCliSearch').value.toLowerCase().trim();
  const ordem  = $('#fCliOrdem') ? $('#fCliOrdem').value : 'curva';
  const fcurva = $('#fCliCurvaFiltro') ? $('#fCliCurvaFiltro').value : '';

  let visivel = _allClis.filter(c =>
    (!rede   || (c.r || '') === rede) &&
    (!fcurva || c.curvaC === fcurva) &&
    (!busca  || c.n.toLowerCase().includes(busca) || c.c.toLowerCase().includes(busca))
  );

  if(ordem === 'nome'){
    visivel = [...visivel].sort((a,b) => a.n.localeCompare(b.n));
  }
  // ordem padrão (curva) já está em _allClis

  const selSet = new Set(CLIS.map(c => c.c));
  const curvaLbl = {A:'Curva A', B:'Curva B', C:'Curva C'};

  $('#cliChips').innerHTML = visivel.map(c => {
    const sel = selSet.has(c.c);
    const redeTag = c.r ? `<span class="chip-rede">${c.r}</span>` : '';
    const val = c._totalV > 0 ? ` · ${fmtVal(c._totalV)}` : '';
    return `<div class="chip${sel?' sel':''}" data-cod="${c.c}" title="${c.n} · ${curvaLbl[c.curvaC]}${val}">
      <span class="chip-curva cv-${c.curvaC}">${c.curvaC}</span>
      ${c.n}${redeTag}
    </div>`;
  }).join('');

  $$('#cliChips .chip').forEach(el => {
    el.onclick = () => {
      const cod = el.dataset.cod;
      const obj = _allClis.find(c => c.c === cod);
      if(selSet.has(cod)) CLIS = CLIS.filter(c => c.c !== cod);
      else CLIS.push(obj);
      renderChips();
      renderCliente();
    };
  });

  const nSel = visivel.filter(c => selSet.has(c.c)).length;
  const txt = nSel === 0
    ? (visivel.length < _allClis.length ? `${visivel.length} cliente(s) filtrado(s) — nenhum selecionado` : 'Nenhum cliente selecionado')
    : `${nSel} de ${_allClis.length} cliente(s) selecionado(s)`;
  $('#cliSelCount').textContent = txt;
}

document.getElementById('btnSelectAll').onclick = () => {
  const rede   = $('#fCliRede').value;
  const busca  = $('#fCliSearch').value.toLowerCase().trim();
  const fcurva = $('#fCliCurvaFiltro') ? $('#fCliCurvaFiltro').value : '';
  const visivel = _allClis.filter(c =>
    (!rede   || (c.r || '') === rede) &&
    (!fcurva || c.curvaC === fcurva) &&
    (!busca  || c.n.toLowerCase().includes(busca) || c.c.toLowerCase().includes(busca))
  );
  const selSet = new Set(CLIS.map(c => c.c));
  visivel.forEach(c => { if(!selSet.has(c.c)) CLIS.push(c); });
  renderChips(); renderCliente();
};
document.getElementById('btnClearSel').onclick = () => { CLIS = []; renderChips(); renderCliente(); };

function renderCliente(){
  const N = CLIS.length;
  if(N === 0){
    $('#cliResumo').classList.add('hidden');
    $('#tblCli tbody').innerHTML = '';
    $('#cliCount').textContent = '';
    $('#cliProdFiltros').style.display = 'none';
    const thead = $('#tblCli thead tr');
    thead.innerHTML = '<th>Código</th><th>Produto</th><th>Marca</th><th>Curva</th><th>Situação</th><th>Setor vende?</th><th>Última compra</th>';
    return;
  }
  $('#cliProdFiltros').style.display = '';
  const busca = $('#fCliBusca').value.toLowerCase().trim();
  const fc = $('#fCliCurva').value, fs = $('#fCliStatus').value;
  const multi = N > 1;

  const thead = $('#tblCli thead tr');
  if(multi){
    thead.innerHTML = '<th>Código</th><th>Produto</th><th>Marca</th><th>Curva</th><th>Compradores</th><th>Setor vende?</th><th>Última compra</th>';
    $('#ccComprLbl').textContent = 'Todos compram';
    $('#ccNaoLbl').textContent = 'Nenhum compra';
  } else {
    thead.innerHTML = '<th>Código</th><th>Produto</th><th>Marca</th><th>Curva</th><th>Situação</th><th>Setor vende?</th><th>Última compra</th>';
    $('#ccComprLbl').textContent = 'Compra';
    $('#ccNaoLbl').textContent = 'Não compra';
  }

  let nTodos=0, nNenhum=0, nA=0;
  const rows = [];
  for(const c of COD_ORDEM){
    const p = PRODS[c];
    const sp = SETOR.setorProds[c];
    let compradores = 0, ultData = null;
    for(const cli of CLIS){
      const cp = cli.p[c];
      if(cp){ compradores++; if(!ultData || cp[1] > ultData) ultData = cp[1]; }
    }
    const oport = compradores === 0 && !!sp;
    if(compradores === N) nTodos++;
    if(compradores === 0){ nNenhum++; if(p.c==='A') nA++; }
    if(fc && p.c!==fc) continue;
    if(busca && !(c.toLowerCase().includes(busca)||p.d.toLowerCase().includes(busca))) continue;
    if(fs==='naocompra'   && compradores !== 0) continue;
    if(fs==='compra'      && compradores !== N) continue;
    if(fs==='oportunidade'&& !oport) continue;
    if(fs==='parcial'     && !(compradores>0 && compradores<N)) continue;
    rows.push({c,p,sp,compradores,ultData,oport});
  }
  rows.sort((a,b) => {
    const ao={A:0,B:1,C:2,D:3};
    if(a.compradores !== b.compradores) return a.compradores - b.compradores;
    return ao[a.p.c]-ao[b.p.c] || a.p.d.localeCompare(b.p.d);
  });
  $('#ccCompra').textContent = nTodos;
  $('#ccNao').textContent = nNenhum;
  $('#ccA').textContent = nA;
  $('#cliResumo').classList.remove('hidden');
  $('#cliCount').textContent = rows.length + ' produto(s)';
  $('#tblCli tbody').innerHTML = rows.length ? rows.map(r => {
    let sitCol;
    if(multi){
      const cls = r.compradores === N ? 'comp-all' : r.compradores === 0 ? 'comp-none' : 'comp-partial';
      const label = r.compradores === N ? 'Todos' : r.compradores === 0 ? 'Nenhum' : r.compradores + '/' + N;
      sitCol = `<span class="${cls}">${label}</span>${r.oport?'<span class="tag-op">OPORTUNIDADE</span>':''}`;
    } else {
      sitCol = r.compradores > 0 ? '<span class="st st-vende">Compra</span>'
        : `<span class="st st-nunca">Não compra</span>${r.oport?'<span class="tag-op">OPORTUNIDADE</span>':''}`;
    }
    const setorVende = r.sp ? `<span class="simn sim">Sim</span> <span class="muted">(${r.sp[2]} cli.)</span>` : '<span class="nao">Não</span>';
    return `<tr style="cursor:pointer" data-cod="${r.c}" title="Clique para ver quais clientes compram este produto"><td class="cod">${r.c}</td><td>${r.p.d}</td><td>${r.p.m}</td><td>${pill(r.p.c)}</td>
      <td>${sitCol}</td><td>${setorVende}</td><td>${fmtData(r.ultData)}</td></tr>`;
  }).join('') : '<tr><td colspan="7" class="vazio">Nenhum produto neste filtro.</td></tr>';

  $$('#tblCli tbody tr[data-cod]').forEach(tr => {
    tr.onclick = () => abrirModalProduto(tr.dataset.cod);
  });
}

/* ===== MODAL PRODUTO ===== */
function abrirModalProduto(cod){
  const p = PRODS[cod];
  if(!p) return;
  document.getElementById('modalProdNome').textContent = p.d;
  document.getElementById('modalProdSub').textContent = cod + ' · ' + p.m + ' · Curva ' + p.c;

  // Todos os clientes do setor que compram este produto
  const compradores = (_allClis || []).map(cli => {
    const cp = cli.p[cod];
    return cp ? { n: cli.n, curva: cli.curvaC, dt: cp[1], v: cp[0] } : null;
  }).filter(Boolean).sort((a,b) => (b.v||0)-(a.v||0));

  let html = '';
  if(compradores.length === 0){
    html = `<div class="prod-modal-none">Nenhum cliente do setor compra este produto.</div>`;
  } else {
    html += `<div class="prod-modal-stat"><span><b>${compradores.length}</b> cliente(s) do setor compram</span></div>`;
    html += compradores.map(r =>
      `<div class="prod-modal-row">
        <span class="pill cv-${r.curva}">${r.curva}</span>
        <span class="nm">${r.n}</span>
        <span class="dt">${fmtData(r.dt)}</span>
        <span class="vl">${fmtVal(r.v)}</span>
      </div>`
    ).join('');
  }
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('prodModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

document.getElementById('modalClose').onclick = fecharModal;
document.getElementById('prodModal').onclick = e => { if(e.target === document.getElementById('prodModal')) fecharModal(); };
document.addEventListener('keydown', e => { if(e.key === 'Escape') fecharModal(); });
function fecharModal(){ document.getElementById('prodModal').style.display = 'none'; document.body.style.overflow = ''; }

/* ===== LISTENERS FILTROS ===== */
['fSetorBusca','fSetorMarca','fSetorCurva','fSetorStatus','fJanela'].forEach(id => {
  $('#'+id).addEventListener('input', () => { renderSetor(); if(id==='fJanela') { renderResumo(); } });
});
['fCliBusca','fCliCurva','fCliStatus'].forEach(id => {
  const el = $('#'+id); if(el) el.addEventListener('input', renderCliente);
});
$('#fCliRede').addEventListener('change', () => renderChips());
$('#fCliSearch').addEventListener('input', () => renderChips());
const _fCliOrdem = $('#fCliOrdem');
if(_fCliOrdem) _fCliOrdem.addEventListener('change', () => renderChips());
const _fCliCurvaFiltro = $('#fCliCurvaFiltro');
if(_fCliCurvaFiltro) _fCliCurvaFiltro.addEventListener('change', () => { renderChips(); });

/* ===== EXPORTAR XLSX (ExcelJS) ===== */
const COR = { azul:'FF2B2FA8', azulClaro:'FFE8E9FF', verde:'FF198754', verdeClaro:'FFD4EDDA',
               ambar:'FFFF8800', ambarClaro:'FFFFF3CD', vermelho:'FFB02A37', vermelhoClaro:'FFFAD4D4',
               cinza:'FF6B6F8A', cinzaClaro:'FFF4F6FB', branco:'FFFFFFFF', preto:'FF16182E',
               amarelo:'FFFFFF00', roxo:'FF7C3AED', teal:'FF0E7490' };

function _styleCell(cell, opts={}){
  if(opts.bold||opts.bgColor||opts.color||opts.size||opts.align||opts.border||opts.wrap){
    cell.font = { bold:!!opts.bold, color:{argb: opts.color||COR.preto}, size:opts.size||11, name:'Calibri' };
    if(opts.bgColor) cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:opts.bgColor} };
    cell.alignment = { vertical:'middle', horizontal:opts.align||'left', wrapText:!!opts.wrap };
    if(opts.border) cell.border = {
      top:{style:'thin',color:{argb:'FFD0D3E8'}}, bottom:{style:'thin',color:{argb:'FFD0D3E8'}},
      left:{style:'thin',color:{argb:'FFD0D3E8'}}, right:{style:'thin',color:{argb:'FFD0D3E8'}}
    };
  }
}

function _titulo(ws, txt, ncols, row){
  ws.mergeCells(row,1,row,ncols);
  const c = ws.getCell(row,1);
  c.value = txt;
  _styleCell(c,{bold:true, bgColor:COR.azul, color:COR.branco, size:14, align:'center'});
  ws.getRow(row).height = 28;
}

function _meta(ws, label, val, ncols, row){
  ws.mergeCells(row,2,row,ncols);
  const cL = ws.getCell(row,1), cV = ws.getCell(row,2);
  cL.value = label; _styleCell(cL,{bold:true, bgColor:COR.cinzaClaro, color:COR.cinza});
  cV.value = val;   _styleCell(cV,{bgColor:COR.cinzaClaro});
  ws.getRow(row).height = 18;
}

function _header(ws, cols, row){
  cols.forEach((h,i)=>{
    const c = ws.getCell(row, i+1);
    c.value = h;
    _styleCell(c,{bold:true, bgColor:COR.azul, color:COR.branco, align:'center', border:true});
  });
  ws.getRow(row).height = 20;
}

function _periodoStr(){
  return ($('#periodoInfo')||{}).textContent
    ? $('#periodoInfo').textContent.replace('Análise: ','')
    : '18 meses';
}

async function exportarSetor(){
  if(typeof ExcelJS === 'undefined'){ alert('Biblioteca de exportação não carregada.'); return; }

  // Coletar dados direto do JS (não do DOM)
  const filtroStatus = $('#fSetorStatus').value; // todos/naoVende/vende/parou/nunca
  const filtroMarca  = $('#fMarca').value;
  const filtroCurva  = $('#fCurva').value;
  const jan = janela();
  const lbl = {vende:'Vende', parou:'Parou', nunca:'Nunca vendeu'};

  const dados = COD_ORDEM.map(c => {
    const p = PRODS[c]; if(!p) return null;
    if(filtroMarca !== 'todas' && p.m !== filtroMarca) return null;
    if(filtroCurva !== 'todas' && p.c !== filtroCurva) return null;
    const st = statusSetor(c);
    if(filtroStatus === 'naoVende' && st.s === 'vende') return null;
    if(filtroStatus === 'vende'    && st.s !== 'vende') return null;
    if(filtroStatus === 'parou'    && st.s !== 'parou') return null;
    if(filtroStatus === 'nunca'    && st.s !== 'nunca') return null;
    return { cod:c, nome:p.d, marca:p.m, curva:p.c, status:lbl[st.s], ult:fmtData(st.ult), nCli:st.nCli||0, dias:st.dias||null, s:st.s };
  }).filter(Boolean);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'M. Ferretti — NÃO COMPRA';
  const ws = wb.addWorksheet('Por Setor');
  const NC = 7;

  ws.columns = [
    {width:16},{width:46},{width:14},{width:13},{width:14},{width:14},{width:22}
  ];

  _titulo(ws, `NÃO COMPRA — ${SETOR.setor}`, NC, 1);
  _meta(ws, 'Data:', new Date().toLocaleDateString('pt-BR'), NC, 2);
  _meta(ws, 'Período:', _periodoStr(), NC, 3);
  _meta(ws, 'Janela "Vende":', `Compra nos últimos ${jan} dias`, NC, 4);
  _meta(ws, 'Filtro:', filtroStatus==='todos'?'Todos os produtos':
    filtroStatus==='naoVende'?'Só os que NÃO vende':
    filtroStatus==='vende'?'Vende':filtroStatus==='parou'?'Parou':'Nunca vendeu', NC, 5);
  ws.addRow([]);

  _header(ws, ['Código','Produto','Marca','Curva','Situação','Última venda','Nº clientes'], 7);

  dados.forEach((d,i) => {
    const r = ws.addRow([d.cod, d.nome, d.marca, d.curva, d.status, d.ult, d.nCli||'—']);
    r.height = 17;
    let bg = i%2===0 ? COR.branco : COR.cinzaClaro;
    let statusColor = COR.preto;
    if(d.s === 'nunca'){ bg = COR.vermelhoClaro; statusColor = COR.vermelho; }
    else if(d.s === 'parou'){ bg = COR.ambarClaro; statusColor = COR.ambar; }
    r.eachCell((cell,col)=>{
      cell.fill = {type:'pattern',pattern:'solid',fgColor:{argb:bg}};
      cell.font = { name:'Calibri', size:10,
        color:{argb: col===5 ? statusColor : COR.preto},
        bold: col===5 };
      cell.alignment = {vertical:'middle', horizontal: col<=2?'left':'center'};
      cell.border = {bottom:{style:'hair',color:{argb:'FFD0D3E8'}}};
    });
  });

  // Linha de totais
  ws.addRow([]);
  const rTot = ws.addRow(['','TOTAL','','',`${dados.length} produtos`,'','']);
  rTot.height = 18;
  rTot.eachCell(cell=>{
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:COR.azulClaro}};
    cell.font={bold:true,name:'Calibri',size:10};
    cell.alignment={vertical:'middle'};
  });

  // Legenda
  ws.addRow([]);
  ws.addRow(['LEGENDA:']);
  [['Nunca vendeu','Produto nunca foi vendido a nenhum cliente deste setor',COR.vermelhoClaro,COR.vermelho],
   ['Parou','Última venda há mais de '+jan+' dias',COR.ambarClaro,COR.ambar],
   ['Vende','Compra nos últimos '+jan+' dias — produto ativo',COR.branco,COR.verde]
  ].forEach(([st,desc,bg,cor])=>{
    const r = ws.addRow([st, desc]);
    r.getCell(1).font={bold:true,color:{argb:cor},name:'Calibri',size:10};
    r.getCell(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:bg}};
    r.getCell(2).font={name:'Calibri',size:10};
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `NaoCompra_${SETOR.setor}_${new Date().toISOString().slice(0,10)}.xlsx`;
  a.click();
}

async function exportarCliente(){
  if(typeof ExcelJS === 'undefined'){ alert('Biblioteca de exportação não carregada.'); return; }
  if(CLIS.length === 0){ alert('Selecione pelo menos um cliente.'); return; }

  const multi = CLIS.length > 1;
  const filtroMarca = $('#fMarcaCli').value;
  const filtroCurva = $('#fCurvaCli').value;
  const filtroStatus = $('#fCliStatus').value;
  const jan = janela();
  const lbl = {vende:'Vende', parou:'Parou', nunca:'Nunca vendeu'};

  const wb = new ExcelJS.Workbook();
  wb.creator = 'M. Ferretti — NÃO COMPRA';
  const NC = 7;

  for(const cli of CLIS){
    const nomePlan = (cli.n||'Cliente').slice(0,31).replace(/[\\/*?:\[\]]/g,'');
    const ws = wb.addWorksheet(nomePlan);
    ws.columns = [{width:16},{width:46},{width:14},{width:13},{width:20},{width:14},{width:14}];

    _titulo(ws, `NÃO COMPRA — ${SETOR.setor}`, NC, 1);
    _meta(ws, 'Cliente:', cli.n, NC, 2);
    _meta(ws, 'Curva:', `${cli.curvaC||'?'} · ${fmtVal(cli._totalV||0)} em compras (18 meses)`, NC, 3);
    _meta(ws, 'Data:', new Date().toLocaleDateString('pt-BR'), NC, 4);
    _meta(ws, 'Período:', _periodoStr(), NC, 5);
    ws.addRow([]);

    _header(ws, ['Código','Produto','Marca','Curva','Situação','Última compra (cliente)','Setor vende?'], 7);

    // Dados do cliente
    const dados = COD_ORDEM.map(c => {
      const p = PRODS[c]; if(!p) return null;
      if(filtroMarca !== 'todas' && p.m !== filtroMarca) return null;
      if(filtroCurva !== 'todas' && p.c !== filtroCurva) return null;
      const cp = cli.p[c];
      const stS = statusSetor(c);
      const compra = !!cp;
      if(filtroStatus === 'naoCompra' && compra) return null;
      if(filtroStatus === 'compra' && !compra) return null;
      const sit = compra ? 'Compra' : 'Não compra';
      return { cod:c, nome:p.d, marca:p.m, curva:p.c, sit, ultCli: cp ? fmtData(cp[1]) : '—',
               setorVende: lbl[stS.s], compra, s:stS.s };
    }).filter(Boolean);

    dados.forEach((d,i)=>{
      const r = ws.addRow([d.cod, d.nome, d.marca, d.curva, d.sit, d.ultCli, d.setorVende]);
      r.height = 17;
      const bg = d.compra ? (i%2===0?COR.branco:COR.cinzaClaro) : COR.vermelhoClaro;
      const sitColor = d.compra ? COR.verde : COR.vermelho;
      r.eachCell((cell,col)=>{
        cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:bg}};
        cell.font={name:'Calibri',size:10,
          color:{argb: col===5?sitColor:(col===7&&d.s==='parou'?COR.ambar:col===7&&d.s==='nunca'?COR.vermelho:COR.preto)},
          bold: col===5};
        cell.alignment={vertical:'middle', horizontal:col<=2?'left':'center'};
        cell.border={bottom:{style:'hair',color:{argb:'FFD0D3E8'}}};
      });
    });

    ws.addRow([]);
    const naoCompra = dados.filter(d=>!d.compra).length;
    const rTot = ws.addRow(['',`${dados.length} produtos listados · ${naoCompra} não compra · ${dados.length-naoCompra} compra`]);
    ws.mergeCells(rTot.number,2,rTot.number,NC);
    rTot.height=18;
    rTot.eachCell(cell=>{
      cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:COR.azulClaro}};
      cell.font={bold:true,name:'Calibri',size:10};
      cell.alignment={vertical:'middle'};
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const sufixo = multi ? `${CLIS.length}clientes` : CLIS[0].c;
  a.download = `NaoCompra_${SETOR.setor}_Cliente_${sufixo}_${new Date().toISOString().slice(0,10)}.xlsx`;
  a.click();
}

// Botões de exportar
document.getElementById('btnExportSetor').onclick = exportarSetor;
document.getElementById('btnExportCliente').onclick = exportarCliente;

/* ===== AUTO-LOGIN (localStorage 30 dias) ===== */
const saved = lsLoad();
if(saved){
  try {
    if(MAN.acessos.some(a => a.h === saved.acc.h)){
      $('#gate').style.display = 'none';
      iniciar(saved.fk, saved.acc);
    } else {
      lsClear();
    }
  } catch(e){ lsClear(); }
}
