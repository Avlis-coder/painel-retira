import {COMPLETE, WAITING, ageDays, filterRows, sortRows, summarize, groupRows, formatAge, makeCsv, parseSourceDate, listManagers, managersForStore, storeForManager, makeOwnerGroups} from './model.mjs?v=2';

const $ = id => document.getElementById(id);
const number = value => new Intl.NumberFormat('pt-BR').format(value);
const dateTime = value => {
  const date = parseSourceDate(value);
  return date ? new Intl.DateTimeFormat('pt-BR', {timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'}).format(date) : 'Não informado';
};
let rows = [], filtered = [], config, page = 1, now = new Date();
const PAGE_SIZE = 30;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const emptyChart = '<p class="chart-empty">Nenhuma nota para os filtros selecionados.</p>';
const managerNames = store => managersForStore(store,config).join(' · ') || 'Responsável não informado';

function options(id, values, label) {
  const select = $(id);
  select.replaceChildren(new Option(label, ''));
  for (const value of values) select.add(new Option(id.includes('store') ? `Loja ${value}` : value, value));
}
function getFilters() {
  return {manager:$('manager').value,currentStore:$('current-store').value,originStore:$('origin-store').value,seller:$('seller').value,status:$('status').value,search:$('search').value};
}
function renderManagers() {
  const selected=$('manager').value,origin=$('origin-store').value;
  const context=selected?`${selected} acompanha as notas da loja de origem ${storeForManager(selected,config)}.`:origin?`Indicadores da loja de origem ${origin}.`:'Indicadores atribuídos à loja de origem da venda.';
  $('responsibility-context').textContent=`${context} A loja atual aciona a loja de origem para o acompanhamento.`;
  const banner=$('active-manager-banner');
  banner.hidden=!selected;
  banner.textContent=selected?`${selected} · Loja de origem ${storeForManager(selected,config)}. Os indicadores são compartilhados com os demais responsáveis da unidade.`:'';
  const owners=makeOwnerGroups(filtered,config).sort((a,b)=>Number(a.store)-Number(b.store));
  $('manager-cards').innerHTML=owners.map(owner=>`<article class="manager-card"><header><div><span class="small-label">LOJA DE ORIGEM</span><h3>Loja ${escapeHtml(owner.store)}</h3></div><button type="button" data-manager-store="${escapeHtml(owner.store)}" aria-label="Ver notas da loja de origem ${escapeHtml(owner.store)}">Ver notas</button></header><p class="manager-names">${escapeHtml(managerNames(owner.store))}</p><div class="manager-stats"><span class="manager-stat"><strong>${number(owner.notes)}</strong> notas</span><span class="manager-stat"><strong>${number(owner.items)}</strong> itens</span><span class="manager-stat completed"><strong>${number(owner.completed)}</strong> conferidas</span><span class="manager-stat waiting"><strong>${number(owner.waiting)}</strong> aguardando</span></div></article>`).join('')||'<p class="chart-empty">Nenhuma nota atribuída aos responsáveis com esses filtros.</p>';
}
function simpleBars(groups,key,actionAttribute,labelPrefix='') {
  if(!groups.length)return emptyChart;
  const maximum=Math.max(1,...groups.map(group=>group[key]));
  return groups.map(group=>`<button type="button" class="chart-row" ${actionAttribute}="${escapeHtml(group.label)}" title="${escapeHtml(labelPrefix+group.label)}: ${number(group[key])} ${key==='items'?'itens':'notas'}"><span class="chart-label">${escapeHtml(labelPrefix+group.label)}</span><span class="chart-track"><span class="chart-fill blue" style="width:${group[key]/maximum*100}%"></span></span><strong class="chart-count">${number(group[key])}</strong></button>`).join('');
}
function renderCharts() {
  const stores=groupRows(filtered,'currentStore');
  const maximum=Math.max(1,...stores.map(store=>store.notes));
  $('store-bars').innerHTML=stores.map(store=>`<button type="button" class="chart-row stack-row" data-chart-store="${escapeHtml(store.label)}" title="Loja ${escapeHtml(store.label)}: ${number(store.completed)} conferidas e ${number(store.waiting)} aguardando conferente"><span class="chart-label">Loja ${escapeHtml(store.label)}</span><span class="chart-track"><span class="stack-segments" style="width:${store.notes/maximum*100}%"><span class="chart-fill completed" style="width:${store.completed/store.notes*100}%"></span><span class="chart-fill waiting" style="width:${store.waiting/store.notes*100}%"></span></span></span><strong class="chart-count">${number(store.notes)}</strong></button>`).join('')||emptyChart;
  $('item-bars').innerHTML=simpleBars([...stores].sort((a,b)=>b.items-a.items),'items','data-chart-store','Loja ');
  const sellers=groupRows(filtered,'seller');
  $('seller-bars').innerHTML=simpleBars(sellers.slice(0,10),'notes','data-chart-seller');
  $('seller-chart-note').textContent=sellers.length>10?`Exibindo 10 de ${number(sellers.length)} vendedores. Todos estão disponíveis no filtro e na lista de notas.`:`${number(sellers.length)} ${sellers.length===1?'vendedor':'vendedores'} nos filtros selecionados.`;
  const aged=sortRows(filtered,'age-desc',now).filter(row=>ageDays(row,now)!==null).slice(0,10);
  const maxAge=Math.max(1/1440,...aged.map(row=>ageDays(row,now)));
  $('age-bars').innerHTML=aged.map(row=>{
    const days=ageDays(row,now),completed=row.status===COMPLETE;
    const compact=days>=1?`${Math.floor(days)} d`:days>=1/24?`${Math.floor(days*24)} h`:`${Math.floor(days*1440)} min`;
    return `<button type="button" class="chart-row age-row" data-chart-note="${escapeHtml(row.note)}" title="Nota ${escapeHtml(row.note)}: ${escapeHtml(formatAge(days))}, desde ${completed?'o fim da conferência':'o início da separação'}"><span class="chart-label">Nota ${escapeHtml(row.note)}<span class="chart-secondary">${completed?'Conferida':'Aguardando conferente'}</span></span><span class="chart-track"><span class="chart-fill ${completed?'completed':'waiting'}" style="width:${days/maxAge*100}%"></span></span><strong class="chart-count">${escapeHtml(compact)}</strong></button>`;
  }).join('')||emptyChart;
  $('age-chart-note').textContent='Até 10 notas com maior tempo de espera. Conferidas: desde o fim da conferência. Aguardando: desde o início da separação. Clique em uma barra para consultar a nota.';
}
function renderSummaries() {
  const totals=summarize(filtered);
  for(const [id,value] of [['total-notes',totals.notes],['total-items',totals.items],['total-completed',totals.completed],['total-waiting',totals.waiting]])$(id).textContent=number(value);
  renderManagers();renderCharts();
}
function renderTable() {
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  page=Math.max(1,Math.min(page,pages));
  const ordered=sortRows(filtered,$('sort-by').value,now);
  const start=(page-1)*PAGE_SIZE;
  const pageRows=ordered.slice(start,start+PAGE_SIZE);
  $('notes-body').innerHTML=pageRows.map(row=>{
    const completed=row.status===COMPLETE;
    return `<tr><td><strong>${escapeHtml(row.note)}</strong><span class="cell-sub">DAV ${escapeHtml(row.dav)}</span></td><td class="client-cell">${escapeHtml(row.client)}</td><td>${escapeHtml(row.seller)}</td><td><strong>Loja ${escapeHtml(row.currentStore)}</strong></td><td><strong>Loja ${escapeHtml(row.originStore)}</strong><span class="cell-sub origin-managers">${escapeHtml(managerNames(row.originStore))}</span></td><td><span class="badge ${completed?'completed':'waiting'}">${escapeHtml(row.status)}</span></td><td><strong class="age-value">${escapeHtml(formatAge(ageDays(row,now)))}</strong><span class="cell-sub">${completed?'Conferida':'Separação'}: ${dateTime(completed?row.conferenceEnd:row.separationStart)}</span></td><td class="numeric">${number(row.items)}</td></tr>`;
  }).join('');
  $('results-count').textContent=`${number(filtered.length)} de ${number(rows.length)} notas`;
  $('page-info').textContent=filtered.length?`${number(start+1)}–${number(start+pageRows.length)} de ${number(filtered.length)}`:'0 notas';
  $('prev-page').disabled=page===1;
  $('next-page').disabled=page>=pages;
  $('empty-state').hidden=filtered.length>0;
  $('export-csv').disabled=filtered.length===0;
}
function refresh(resetPage=false) {
  now=new Date();if(resetPage)page=1;
  filtered=filterRows(rows,getFilters(),config);renderSummaries();renderTable();
  $('elapsed-reference').textContent=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'}).format(now);
}
async function init() {
  const responses=await Promise.all([fetch('./data.json'),fetch('./responsaveis.json')]);
  if(responses.some(response=>!response.ok))throw new Error('Não foi possível carregar as notas ou os responsáveis.');
  const [source,owners]=await Promise.all(responses.map(response=>response.json()));config=owners;
  if(config.basis!=='originStore'||!config.stores)throw new Error('Os responsáveis devem estar vinculados à loja de origem.');
  rows=source.records.map(row=>({...row,seller:row.seller.trim()}));
  if(!rows.length||rows.some(row=>row.deliveryType!=='RETIRA'))throw new Error('A base deve conter somente notas do tipo RETIRA.');
  const storeSort=(a,b)=>Number(a)-Number(b);
  options('current-store',[...new Set(rows.map(row=>row.currentStore))].sort(storeSort),'Todas as lojas');
  options('origin-store',[...new Set(rows.map(row=>row.originStore))].sort(storeSort),'Todas as lojas');
  options('seller',[...new Set(rows.map(row=>row.seller))].sort((a,b)=>a.localeCompare(b,'pt-BR')),'Todos os vendedores');
  options('status',[COMPLETE,WAITING],'Todas as situações');
  const managerSelect=$('manager');managerSelect.replaceChildren(new Option('Todos os responsáveis',''));
  for(const owner of listManagers(config))managerSelect.add(new Option(`${owner.name} — Loja ${owner.store}`,owner.name));
  $('source-info').textContent=`Fonte: ${source.filename}. Pendências na extração de ${dateTime(source.asOf)}. A lista não é atualizada automaticamente.`;
  $('age-method-note').textContent='Conferidas: tempo desde o fim da conferência. Aguardando conferente: tempo desde o início da separação. Cálculo em dias corridos até o momento da consulta, no horário de Fortaleza.';
  $('manager').addEventListener('change',()=>{
    const store=storeForManager(managerSelect.value,config);$('origin-store').value=store||'';refresh(true);
  });
  $('origin-store').addEventListener('change',()=>{
    if(managerSelect.value&&storeForManager(managerSelect.value,config)!==$('origin-store').value)managerSelect.value='';refresh(true);
  });
  for(const id of ['current-store','seller','status'])$(id).addEventListener('change',()=>refresh(true));
  $('search').addEventListener('input',()=>refresh(true));
  $('sort-by').addEventListener('change',()=>renderTable());
  $('reset-filters').addEventListener('click',()=>{
    for(const id of ['manager','current-store','origin-store','seller','status','search'])$(id).value='';$('sort-by').value='age-desc';refresh(true);
  });
  $('prev-page').addEventListener('click',()=>{page--;renderTable();});
  $('next-page').addEventListener('click',()=>{page++;renderTable();});
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-manager-store')){
      $('origin-store').value=button.dataset.managerStore;managerSelect.value='';refresh(true);
    }else if(button.hasAttribute('data-chart-store')){
      $('current-store').value=button.dataset.chartStore;refresh(true);
    }else if(button.hasAttribute('data-chart-seller')){
      $('seller').value=button.dataset.chartSeller;refresh(true);
    }else if(button.hasAttribute('data-chart-note')){
      $('search').value=button.dataset.chartNote;refresh(true);
    }
  });
  $('export-csv').addEventListener('click',()=>{
    const timestamp=new Date();const csv=makeCsv(sortRows(filtered,$('sort-by').value,timestamp),timestamp,config);
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    const link=document.createElement('a');link.href=url;link.download='retira-pendente-lista-filtrada.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  refresh();setInterval(()=>refresh(),60000);
}
init().catch(error=>{
  $('data-error').hidden=false;$('data-error').textContent=`Não foi possível exibir o painel. ${error.message} Recarregue a página para tentar novamente.`;
  for(const id of ['export-csv','prev-page','next-page'])$(id).disabled=true;console.error(error);
});
