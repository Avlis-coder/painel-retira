export const COMPLETE = 'Conferência finalizada';
export const WAITING = 'Aguardando conferente';
export const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
export function parseSourceDate(value) {
  if (!value) return null;
  const date = new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}-03:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}
export function ageDays(row, now = new Date()) {
  const start = parseSourceDate(row.status === COMPLETE ? row.conferenceEnd : row.separationStart);
  if (!start || now < start) return null;
  return (now.getTime() - start.getTime()) / 86400000;
}
export function managersForStore(store, config) {
  const names = config?.stores?.[String(store)];
  return Array.isArray(names) ? [...new Set(names.filter(name => typeof name === 'string' && name.trim()).map(name => name.trim()))] : [];
}
export function listManagers(config) {
  const associations = [];
  for (const store of Object.keys(config?.stores ?? {})) {
    for (const name of managersForStore(store, config)) associations.push({name, store});
  }
  return associations.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.store.localeCompare(b.store, 'pt-BR', {numeric:true}));
}
export function storeForManager(name, config) {
  const target = normalize(name);
  if (!target) return null;
  const stores = [...new Set(listManagers(config).filter(manager => normalize(manager.name) === target).map(manager => manager.store))];
  return stores.length === 1 ? stores[0] : null;
}
export function filterRows(rows, filters = {}, config) {
  const terms = normalize(filters.search).split(' ').filter(Boolean);
  const managerStore = filters.manager ? storeForManager(filters.manager, config) : null;
  if (filters.manager && managerStore === null) return [];
  return rows.filter(row =>
    (!filters.currentStore || row.currentStore === filters.currentStore) &&
    (!filters.originStore || row.originStore === filters.originStore) &&
    (!filters.manager || row.originStore === managerStore) &&
    (!filters.seller || row.seller === filters.seller) &&
    (!filters.status || row.status === filters.status) &&
    (!terms.length || terms.every(term => normalize(`${row.note} ${row.client} ${row.dav}`).includes(term)))
  );
}
export function sortRows(rows, order = 'age-desc', now = new Date()) {
  return [...rows].sort((a, b) => {
    if (order === 'note-desc') return (parseSourceDate(b.noteDate) - parseSourceDate(a.noteDate)) || Number(b.note) - Number(a.note);
    const ageA = ageDays(a, now), ageB = ageDays(b, now);
    if (ageA === null) return ageB === null ? 0 : 1;
    if (ageB === null) return -1;
    const difference = order === 'age-asc' ? ageA - ageB : ageB - ageA;
    return difference || Number(a.note) - Number(b.note);
  });
}
export function summarize(rows) {
  return rows.reduce((out, row) => {
    out.notes++;
    out.items += Number(row.items);
    if (row.status === COMPLETE) out.completed++;
    if (row.status === WAITING) out.waiting++;
    return out;
  }, {notes: 0, items: 0, completed: 0, waiting: 0});
}
export function groupRows(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const label = row[key];
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(row);
  }
  return [...groups].map(([label, values]) => ({label, ...summarize(values)})).sort((a,b) => b.notes-a.notes || a.label.localeCompare(b.label, 'pt-BR', {numeric:true}));
}
export function makeOwnerGroups(rows, config) {
  return groupRows(rows, 'originStore').map(({label, ...totals}) => ({store:label, names:managersForStore(label, config), ...totals}))
    .sort((a, b) => a.store.localeCompare(b.store, 'pt-BR', {numeric:true}));
}
export function formatAge(days) {
  if (days === null) return 'Não disponível';
  const minutes = Math.floor(days * 1440);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60} min`;
  const fullDays = Math.floor(hours / 24);
  return `${fullDays} ${fullDays === 1 ? 'dia' : 'dias'} ${hours % 24} h`;
}
const csvCell = value => {
  let text = String(value ?? '');
  if (/^[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};
export function makeCsv(rows, now = new Date(), config) {
  const header = ['Nota', 'DAV', 'Cliente', 'Vendedor', 'Loja atual', 'Loja de origem', 'Situação', 'Itens', 'Data da nota', 'Início da separação', 'Fim da conferência', 'Tempo de espera (dias)', 'Marco do tempo', 'Consulta em (Fortaleza)'];
  if (config) header.push('Responsáveis da loja de origem');
  const consultation = new Intl.DateTimeFormat('pt-BR', {timeZone:'America/Fortaleza', dateStyle:'short', timeStyle:'medium'}).format(now);
  const lines = rows.map(row => {
    const line = [row.note, row.dav, row.client, row.seller, row.currentStore, row.originStore, row.status, row.items, row.noteDate, row.separationStart, row.conferenceEnd, ageDays(row,now)?.toFixed(4).replace('.',','), row.status === COMPLETE ? 'Fim da conferência' : 'Início da separação', consultation];
    if (config) line.push(managersForStore(row.originStore, config).join(' / '));
    return line;
  });
  return '\uFEFF' + [header, ...lines].map(line => line.map(csvCell).join(';')).join('\r\n');
}
