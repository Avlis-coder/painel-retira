import {COMPLETE, WAITING, ageDays, filterRows, sortRows, summarize, groupRows, formatAge, makeCsv, parseSourceDate} from './model.mjs';

const $ = id => document.getElementById(id);
const number = value => new Intl.NumberFormat('pt-BR').format(value);
const dateTime = value => {
  const date = parseSourceDate(value);
  return date ? new Intl.DateTimeFormat('pt-BR', {timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'}).format(date) : 'Não informado';
};
let source, rows = [], filtered = [], page = 1, now = new Date();
const PAGE_SIZE = 30;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

function options(id, values, label) {
  const select = $(id);
  select.replaceChildren(new Option(label, ''));
  for (const value of values) select.add(new Option(id.includes('store') ? `Loja ${value}` : value, value));
}
function getFilters() {
  return {currentStore:$('current-store').value,originStore:$('origin-store').value,seller:$('seller').value,status:$('status').value,search:$('search').value};
}
function renderSummaries() {
  const totals = summarize(filtered);
  for (const [id, value] of [['total-notes',totals.notes],['total-items',totals.items],['total-completed',totals.completed],['total-waiting',totals.waiting]]) $(id).textContent = number(value);
  const stores = groupRows(filtered, 'currentStore');
  const maximum = Math.max(1, ...stores.map(store => store.notes));
  $('store-bars').innerHTML = stores.length ? stores.map(store => `<div class="store-row"><span class="store-label">Loja ${escapeHtml(store.label)}</span><div class="bar-track"><div class="bar-fill" style="width:${store.notes / maximum * 100}%"></div></div><strong class="store-value">${number(store.notes)}</strong></div>`).join('') : '<p class="muted">Nenhuma nota neste filtro.</p>';
  const sellers = groupRows(filtered,'seller');
  $('seller-summary').innerHTML = sellers.map(seller => `<tr><td>${escapeHtml(seller.label)}</td><td class="numeric">${number(seller.notes)}</td><td class="numeric">${number(seller.items)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Nenhuma nota neste filtro.</td></tr>';
  const sellerInfo = $('seller-summary-info');
  if (sellerInfo) sellerInfo.textContent = `${number(sellers.length)} ${sellers.length === 1 ? 'vendedor' : 'vendedores'} neste filtro. Role a lista para consultar todos.`;
}
function renderTable() {
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  page = Math.max(1, Math.min(page,pages));
  const ordered = sortRows(filtered,$('sort-by').value,now);
  const start = (page-1)*PAGE_SIZE;
  const pageRows = ordered.slice(start,start+PAGE_SIZE);
  $('notes-body').innerHTML = pageRows.map(row => {
    const completed = row.status === COMPLETE;
    return `<tr><td><strong>${escapeHtml(row.note)}</strong><span class="cell-sub">DAV ${escapeHtml(row.dav)}</span></td><td class="client-cell">${escapeHtml(row.client)}</td><td>${escapeHtml(row.seller)}</td><td><strong>Loja ${escapeHtml(row.currentStore)}</strong></td><td>Loja ${escapeHtml(row.originStore)}</td><td><span class="badge ${completed?'completed':'waiting'}">${escapeHtml(row.status)}</span></td><td><strong class="age-value">${escapeHtml(formatAge(ageDays(row,now)))}</strong><span class="cell-sub">${completed?'Conferida':'Separação'}: ${dateTime(completed?row.conferenceEnd:row.separationStart)}</span></td><td class="numeric">${number(row.items)}</td></tr>`;
  }).join('');
  $('results-count').textContent = `${number(filtered.length)} de ${number(rows.length)} notas`;
  $('page-info').textContent = filtered.length ? `${number(start+1)}–${number(start+pageRows.length)} de ${number(filtered.length)}` : '0 notas';
  $('prev-page').disabled = page === 1;
  $('next-page').disabled = page >= pages;
  $('empty-state').hidden = filtered.length > 0;
  $('export-csv').disabled = filtered.length === 0;
}
function refresh(resetPage = false) {
  now = new Date();
  if (resetPage) page = 1;
  filtered = filterRows(rows,getFilters());
  renderSummaries();
  renderTable();
  $('elapsed-reference').textContent = new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'}).format(now);
}
async function init() {
  const response = await fetch('./data.json');
  if (!response.ok) throw new Error('A base de notas não pôde ser carregada.');
  source = await response.json();
  rows = source.records.map(row=>({...row,seller:row.seller.trim()}));
  if (!rows.length || rows.some(row=>row.deliveryType!=='RETIRA')) throw new Error('A base deve conter somente notas do tipo RETIRA.');
  const storeSort = (a,b)=>Number(a)-Number(b);
  options('current-store',[...new Set(rows.map(row=>row.currentStore))].sort(storeSort),'Todas as lojas');
  options('origin-store',[...new Set(rows.map(row=>row.originStore))].sort(storeSort),'Todas as lojas');
  options('seller',[...new Set(rows.map(row=>row.seller))].sort((a,b)=>a.localeCompare(b,'pt-BR')),'Todos os vendedores');
  options('status',[COMPLETE,WAITING],'Todas as situações');
  $('source-info').textContent = `Fonte: ${source.filename}. Pendências na extração de ${dateTime(source.asOf)}. A lista não é atualizada automaticamente.`;
  $('age-method-note').textContent = 'Conferidas: tempo desde o fim da conferência. Aguardando conferente: tempo desde o início da separação. Cálculo em dias corridos até o momento da consulta, no horário de Fortaleza.';
  for (const id of ['current-store','origin-store','seller','status']) $(id).addEventListener('change',()=>refresh(true));
  $('search').addEventListener('input',()=>refresh(true));
  $('sort-by').addEventListener('change',()=>renderTable());
  $('reset-filters').addEventListener('click',()=>{for(const id of ['current-store','origin-store','seller','status','search']) $(id).value='';$('sort-by').value='age-desc';refresh(true);});
  $('prev-page').addEventListener('click',()=>{page--;renderTable();});
  $('next-page').addEventListener('click',()=>{page++;renderTable();});
  $('export-csv').addEventListener('click',()=>{
    const timestamp = new Date();
    const csv = makeCsv(sortRows(filtered,$('sort-by').value,timestamp),timestamp);
    const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    const link=document.createElement('a');link.href=url;link.download='retira-pendente-lista-filtrada.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  refresh();
  setInterval(()=>refresh(),60000);
}
init().catch(error=>{
  $('data-error').hidden=false;
  $('data-error').textContent=`Não foi possível exibir o painel. ${error.message} Recarregue a página para tentar novamente.`;
  for(const id of ['export-csv','prev-page','next-page']) $(id).disabled=true;
  console.error(error);
});
