'use strict';
/* Junção dos dados com o arquivo do Drive (a mesma regra de FinFlow/services/sync.py no PC).
   Cada aparelho guarda a "base" (o combinado na última sincronização). Ao sincronizar:
   1. o que mudou desde a base ganha a hora de agora; o que sumiu vira exclusão com data;
   2. com o arquivo, fica a versão mais recente de cada lançamento; exclusões só valem para
      versões mais antigas (lançamento que apenas falta de um lado não é apagado). */

const SYNC_BASE_KEY = 'finflow.syncbase';
const TOMBSTONE_DAYS = 180;
const SYNC_FIELDS = {
  incomes: ['id', 'date', 'category', 'description', 'amount', 'recurringId'],
  expenses: ['id', 'date', 'category', 'description', 'amount', 'payment', 'recurringId'],
  cards: ['id', 'name', 'limit', 'closingDay', 'dueDay'],
  purchases: ['id', 'cardId', 'date', 'description', 'category', 'total', 'count', 'startNumber', 'firstInvoice'],
  recurring: ['id', 'kind', 'description', 'category', 'amount', 'day', 'payment', 'start', 'end', 'active', 'lastGenerated'],
  assets: ['id', 'name', 'category', 'institution', 'ticker', 'quantity', 'invested', 'current', 'cdiPercent', 'startDate', 'lastUpdate', 'monthStart', 'monthStartDate'],
  assetTx: ['id', 'assetId', 'date', 'kind', 'amount', 'quantity', 'notes'],
  goals: ['id', 'name', 'target', 'current', 'deadline', 'monthly'],
  wealth: ['id', 'name', 'kind', 'category', 'value', 'date'],
};
const SYNC_COLLS = [...Object.keys(SYNC_FIELDS), 'history', 'budgets', 'rules', 'paidInvoices', 'categories'];

const pick = (rec, fields) => Object.fromEntries(fields.map(f => [f, rec[f] === undefined ? null : rec[f]]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function syncNormalize(data = {}) {
  const out = {};
  for (const [coll, fields] of Object.entries(SYNC_FIELDS)) {
    out[coll] = {};
    (data[coll] || []).forEach(r => { if (r && r.id) out[coll][r.id] = pick(r, fields); });
  }
  out.history = {};
  (data.history || []).forEach(h => { if (h && h.month) out.history[h.month] = pick(h, ['month', 'net', 'invested', 'contributions']); });
  out.budgets = Object.fromEntries(Object.entries(data.budgets || {}).map(([k, v]) => [k, { v }]));
  out.rules = Object.fromEntries(Object.entries(data.rules || {}).map(([k, v]) => [k, { v }]));
  out.paidInvoices = Object.fromEntries(Object.entries(data.paidInvoices || {}).filter(([, v]) => v).map(([k]) => [k, { v: true }]));
  out.categories = {};
  for (const kind of ['receita', 'despesa']) (data.categories?.[kind] || []).forEach(n => { out.categories[`${kind}:${n}`] = { v: true }; });
  return out;
}

function syncDenormalize(n) {
  const data = { schema: 1 };
  for (const coll of Object.keys(SYNC_FIELDS)) data[coll] = Object.values(n[coll] || {});
  data.history = Object.values(n.history || {}).sort((a, b) => a.month.localeCompare(b.month));
  data.budgets = Object.fromEntries(Object.entries(n.budgets || {}).map(([k, v]) => [k, v.v]));
  data.rules = Object.fromEntries(Object.entries(n.rules || {}).map(([k, v]) => [k, v.v]));
  data.paidInvoices = Object.fromEntries(Object.keys(n.paidInvoices || {}).map(k => [k, true]));
  data.categories = { receita: [], despesa: [] };
  Object.keys(n.categories || {}).forEach(k => { const i = k.indexOf(':'); (data.categories[k.slice(0, i)] = data.categories[k.slice(0, i)] || []).push(k.slice(i + 1)); });
  Object.values(data.categories).forEach(l => l.sort((a, b) => a.localeCompare(b, 'pt-BR')));
  return data;
}

function syncStamp(localN, base, now) {
  const baseN = syncNormalize(base?.data || {}), bs = base?.stamps || {};
  const stamps = {}, deleted = {};
  for (const coll of SYNC_COLLS) {
    stamps[coll] = {};
    deleted[coll] = { ...(base?.deleted?.[coll] || {}) };
    for (const [k, rec] of Object.entries(localN[coll])) stamps[coll][k] = k in baseN[coll] && same(baseN[coll][k], rec) ? (bs[coll]?.[k] || 0) : now;
    for (const k of Object.keys(baseN[coll])) if (!(k in localN[coll])) deleted[coll][k] = now;
  }
  return { stamps, deleted };
}

function syncMerge(localN, ls, ld, remoteN, rs, rd, now) {
  const merged = {}, stamps = {}, deleted = {}, horizon = now - TOMBSTONE_DAYS * 864e5;
  for (const coll of SYNC_COLLS) {
    deleted[coll] = {};
    const dl = ld[coll] || {}, dr = rd?.[coll] || {};
    for (const k of new Set([...Object.keys(dl), ...Object.keys(dr)])) {
      const t = Math.max(dl[k] || 0, dr[k] || 0);
      if (t >= horizon) deleted[coll][k] = t;
    }
    merged[coll] = {}; stamps[coll] = {};
    const L = localN[coll], R = remoteN[coll] || {};
    for (const k of new Set([...Object.keys(L), ...Object.keys(R)])) {
      const options = [];
      if (k in L) options.push([ls[coll]?.[k] || 0, 1, L[k]]);
      if (k in R) options.push([rs?.[coll]?.[k] || 0, 0, R[k]]);
      options.sort((a, b) => b[0] - a[0] || b[1] - a[1]); // mais recente; empate fica a deste aparelho
      const [stamp, , rec] = options[0];
      if ((deleted[coll][k] ?? -1) >= stamp) continue;
      merged[coll][k] = rec; stamps[coll][k] = stamp;
    }
  }
  return { merged, stamps, deleted };
}

function loadSyncBase() { try { return JSON.parse(localStorage.getItem(SYNC_BASE_KEY)) || null; } catch (e) { return null; } }
function saveSyncBase(base) { try { localStorage.setItem(SYNC_BASE_KEY, JSON.stringify(base)); } catch (e) { } }

/* Junta os dados deste celular com o arquivo do Drive. Retorna o arquivo novo e quantas mudanças vieram de fora. */
function syncWithRemote(remotePayload) {
  const now = Date.now();
  const localN = syncNormalize(DB);
  const { stamps, deleted } = syncStamp(localN, loadSyncBase(), now);
  const remoteN = syncNormalize(remotePayload?.data || {});
  const meta = remotePayload?.sync || {};
  const { merged, stamps: ms, deleted: md } = syncMerge(localN, stamps, deleted, remoteN, meta.stamps || {}, meta.deleted || {}, now);
  let incoming = 0;
  for (const coll of SYNC_COLLS) {
    for (const k of new Set([...Object.keys(localN[coll]), ...Object.keys(merged[coll])])) if (!same(localN[coll][k], merged[coll][k])) incoming++;
  }
  const data = syncDenormalize(merged);
  if (incoming) {
    const keep = { settings: DB.settings, ui: DB.ui };
    DB = migrate({ ...data, ...keep });
    rolloverAssets();
  }
  const payload = { app: 'finflow', source: 'sync', version: 2, exportedAt: new Date().toISOString(), data, sync: { stamps: ms, deleted: md, by: 'celular' } };
  // Só regrava o arquivo se algo mudou (compara registro a registro; a ordem das chaves não importa).
  let remoteChanged = !remotePayload?.data;
  for (const coll of SYNC_COLLS) {
    const R = remoteN[coll] || {}, M = merged[coll], D = meta.deleted?.[coll] || {};
    if (Object.keys(R).length !== Object.keys(M).length || Object.keys(M).some(k => !same(R[k], M[k]))) remoteChanged = true;
    if (Object.keys(D).length !== Object.keys(md[coll]).length || Object.keys(md[coll]).some(k => D[k] !== md[coll][k])) remoteChanged = true;
  }
  saveSyncBase({ data, stamps: ms, deleted: md });
  return { payload, incoming, remoteChanged };
}
