'use strict';
/* Importação de fatura do cartão (CSV/TXT exportado pelo banco). Mesma lógica do FinFlow do PC. */

const CREDIT_WORDS = ['pagamento', 'pagto', 'estorno', 'inclusao de pagamento', 'credito de'];
const MONTHS_PT = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
let IMPORT = null; // estado da prévia aberta

async function decodeFile(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
  catch (e) { return new TextDecoder('windows-1252').decode(buf); }
}

/* Divide uma linha CSV respeitando aspas. */
function splitCsvLine(line, sep) {
  const out = []; let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function readStatement(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const sample = lines.slice(0, 40).join('\n');
  const sep = [';', ',', '\t', '|'].sort((a, b) => sample.split(b).length - sample.split(a).length)[0];
  const rows = lines.map(l => splitCsvLine(l, sep));
  // Cabeçalho: primeira linha que fala de data e de valor/descrição (pula títulos do banco).
  let headerAt = rows.findIndex((r, i) => {
    if (i > 40) return false;
    const j = r.map(plain).join(' | ');
    return r.filter(Boolean).length >= 2 && /data|date/.test(j) && /valor|amount|descri|lancamento|estabelecimento|title|historico/.test(j);
  });
  if (headerAt < 0) headerAt = 0;
  const seen = {};
  const header = rows[headerAt].map((h, i) => { let n = h || `Coluna ${i + 1}`; seen[n] = (seen[n] || 0) + 1; return seen[n] > 1 ? `${n} (${seen[n]})` : n; });
  const body = rows.slice(headerAt + 1).filter(r => r.some(Boolean)).map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
  return { header, body };
}

function guessColumns(header) {
  const score = (col, good, bad = []) => { const n = plain(col); return good.filter(w => n.includes(w)).length * 10 - bad.filter(w => n.includes(w)).length * 20; };
  const best = (good, bad = [], required = true) => {
    const ranked = [...header].sort((a, b) => score(b, good, bad) - score(a, good, bad));
    return ranked.length && score(ranked[0], good, bad) > 0 ? ranked[0] : (required ? header[0] : '');
  };
  return {
    date: best(['data', 'date'], ['vencimento']),
    description: best(['descri', 'estabelecimento', 'lancamento', 'historico', 'title', 'titulo', 'nome'], ['nome no cartao', 'categoria', 'tipo']),
    amount: best(['valor', 'amount', 'r$', 'brl', 'preco', 'total'], ['us$', 'usd', 'dolar', 'cotacao', 'iof', 'parcela']),
    category: best(['categoria', 'category'], [], false),
    installments: best(['parcela', 'installment', 'tipo'], ['valor'], false),
  };
}

/* Valores com sinal; o separador decimal é decidido olhando a coluna inteira. */
function parseAmounts(values) {
  const clean = values.map(v => String(v || '').replace(/[ \s]|R\$|BRL/g, ''));
  const commaDecimal = clean.some(t => /,\d{1,2}\)?-?$/.test(t));
  return clean.map(t => {
    const negative = /^-|-$|^\(.*\)$/.test(t);
    t = t.replace(/^[-+(]+|[-)]+$/g, '');
    t = commaDecimal ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    const n = parseFloat(t);
    return isNaN(n) ? null : (negative ? -n : n);
  });
}

function parseDateBR(value, refYm) {
  const t = plain(value);
  if (!t) return null;
  const refY = +refYm.slice(0, 4), refM = +refYm.slice(5, 7);
  const inferYear = m => (m > refM ? refY - 1 : refY);
  const mk = (y, m, d) => { const dt = new Date(y, m - 1, d); return dt.getMonth() === m - 1 ? isoDate(dt) : null; };
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return mk(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/);
  if (m) { const y = m[3] ? +m[3] + (m[3].length === 2 ? 2000 : 0) : inferYear(+m[2]); return mk(y, +m[2], +m[1]); }
  m = t.match(/^(\d{1,2})\s*(?:de\s*)?([a-z]{3})[a-z]*\.?(?:\s*(?:de\s*)?(\d{2,4}))?/);
  if (m && MONTHS_PT[m[2]]) { const mo = MONTHS_PT[m[2]]; const y = m[3] ? +m[3] + (m[3].length === 2 ? 2000 : 0) : inferYear(mo); return mk(y, mo, +m[1]); }
  return null;
}

/* "2/5", "2 de 5", "Parcela 03/12"; "Única"/"à vista" = 1/1. */
function parseInstallment(...texts) {
  for (const raw of texts) {
    const t = plain(raw);
    if (!t || t === '-' || t === 'nan') continue;
    const m = t.match(/(?:parc\w*\s*)?(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/);
    if (m && +m[1] >= 1 && +m[1] <= +m[2] && +m[2] <= 99) return [+m[1], +m[2]];
    if (/unica|a vista|avista/.test(t)) return [1, 1];
  }
  return null;
}
const stripInstallment = d => String(d).replace(/[\s\-–]*(?:parc\w*\.?\s*)?\d{1,2}\s*(?:\/|de)\s*\d{1,2}\s*$/i, '').trim() || String(d).trim();

function buildImportPreview({ body, map, card, mode, statementMonth, includeCurrent, defaultCategory }) {
  const amounts = parseAmounts(body.map(r => r[map.amount]));
  const nonzero = amounts.filter(v => v);
  const purchaseSign = nonzero.filter(v => v < 0).length > nonzero.filter(v => v > 0).length ? -1 : 1;
  const existing = DB.purchases.filter(p => p.cardId === card.id);
  const keyOf = (date, desc, count, total) => `${date}|${descKey(desc)}|${count}|${Math.round(total)}`;
  const keys = new Set(existing.map(p => keyOf(p.date, p.description, p.count, p.total)));
  return body.map((r, i) => {
    const descRaw = r[map.description] || '', bank = map.category ? r[map.category] : '';
    const date = parseDateBR(r[map.date], statementMonth);
    const value = amounts[i];
    const [current, total] = parseInstallment(map.installments ? r[map.installments] : '', descRaw) || [1, 1];
    const description = stripInstallment(descRaw), amount = Math.abs(value || 0);
    const isCredit = (value && value * purchaseSign < 0) || CREDIT_WORDS.some(w => plain(description).includes(w));
    let start = 1, count = total, first = null;
    if (mode === 'fatura') {
      if (total > 1 && includeCurrent) { start = current; count = total - current + 1; first = statementMonth; }
      else if (total > 1) { start = current + 1; count = total - current; first = addMonths(statementMonth, 1); }
      else { start = 1; count = 1; first = statementMonth; }
    } else if (date) first = firstInvoiceMonth(date, card);
    const purchaseTotal = round2(amount * total);
    let status = 'Nova';
    if (!date || !(amount > 0)) status = 'Inválida';
    else if (isCredit) status = 'Pagamento/estorno';
    else if (count <= 0) status = 'Sem parcelas futuras';
    else if (keys.has(keyOf(date, description, total, purchaseTotal))) status = 'Já importada';
    else if (existing.some(p => p.count === total && Math.abs(p.total - purchaseTotal) <= 1 && Math.abs(daysBetween(p.date, date)) <= (total > 1 ? 45 : 3))) status = 'Possível duplicata';
    // O que você já ensinou ao app vale mais; depois, palavras-chave da descrição e da categoria do banco.
    const learned = DB.rules[descKey(description)];
    const category = (learned && DB.categories.despesa.includes(learned) ? learned : null) || suggestCategory(`${description} ${bank}`) || defaultCategory;
    return { i, use: status === 'Nova', date, description, category, current, total, start, count: Math.max(count, 0), first, amount, purchaseTotal, status };
  });
}

/* ---------- tela ---------- */
function importOptionsHtml() {
  const s = IMPORT, cats = DB.categories.despesa;
  const opt = (name, value, required = true) => `<select data-bind="impMap" data-k="${name}">${required ? '' : `<option value="">— nenhuma —</option>`}${s.header.map(h => `<option ${h === value ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select>`;
  const rows = s.preview;
  const fresh = rows.filter(r => r.status === 'Nova'), dup = rows.filter(r => /importada|duplicata/.test(r.status)), credits = rows.filter(r => r.status === 'Pagamento/estorno');
  const selected = rows.filter(r => r.use && r.status !== 'Inválida' && r.count > 0);
  return `<h3 class="sheet-title">Importar fatura</h3>
    <p class="muted">${esc(s.fileName)} · ${s.body.length} linhas</p>
    <div class="form">
      <div class="row2">
        ${field('Cartão', `<select data-bind="impCard">${DB.cards.map(c => `<option value="${c.id}" ${c.id === s.card.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`)}
        ${field('Mês da fatura', `<input type="month" value="${s.statementMonth}" data-bind="impMonth">`)}
      </div>
      ${seg('impMode', [['fatura', 'Fatura do cartão'], ['compras', 'Compras avulsas']], s.mode)}
      ${s.mode === 'fatura' ? `<label class="check"><input type="checkbox" data-bind="impCurrent" ${s.includeCurrent ? 'checked' : ''}> Lançar também as parcelas que vencem nesta fatura</label>` : ''}
      <details class="cols"><summary>Colunas do arquivo · valor em <b>${esc(s.map.amount)}</b></summary>
        <div class="row2">${field('Data', opt('date', s.map.date))}${field('Descrição', opt('description', s.map.description))}</div>
        <div class="row2">${field('Valor (R$)', opt('amount', s.map.amount))}${field('Parcela', opt('installments', s.map.installments, false))}</div>
        ${field('Categoria do banco', opt('category', s.map.category, false))}
      </details>
    </div>
    <div class="kpi-row">
      <div><small>Novas</small><b>${fresh.length}</b></div>
      <div><small>Já lançadas</small><b>${dup.length}</b></div>
      <div><small>Pagamentos</small><b>${credits.length}</b></div>
    </div>
    <div class="list import-list">${rows.map(r => `<div class="row static imp-row ${r.use ? '' : 'off'}">
      <input type="checkbox" data-bind="impUse" data-i="${r.i}" ${r.use ? 'checked' : ''} ${r.status === 'Inválida' || r.count <= 0 ? 'disabled' : ''} aria-label="Importar">
      <span class="row-main"><b>${esc(r.description)}</b><small>${fmtDay(r.date || '')} · ${r.total > 1 ? `${r.current}/${r.total}` : 'à vista'} · ${r.status}</small>
        <select class="imp-cat" data-bind="impCat" data-i="${r.i}">${options(cats, r.category, catLabel)}</select></span>
      <span class="row-amount">${brl(r.amount)}</span>
    </div>`).join('')}</div>
    <button class="btn btn-primary btn-xl import-go" data-act="impGo" ${selected.length ? '' : 'disabled'}>${ic('download')}Importar ${selected.length} compra(s) · ${brl(sum(selected, r => r.amount))}</button>`;
}
function refreshImport(recompute = true) {
  const s = IMPORT;
  if (recompute) {
    const keep = s.preview ? Object.fromEntries(s.preview.map(r => [r.i, { use: r.use, category: r.category }])) : {};
    s.preview = buildImportPreview(s);
    if (s.keepEdits) s.preview.forEach(r => { if (keep[r.i] && r.status === s.prevStatus?.[r.i]) Object.assign(r, keep[r.i]); });
    s.prevStatus = Object.fromEntries(s.preview.map(r => [r.i, r.status]));
  }
  const body = $('.sheet-body', s.sheet), y = s.sheet.querySelector('.sheet').scrollTop;
  body.innerHTML = importOptionsHtml();
  s.sheet.querySelector('.sheet').scrollTop = y;
}

BIND.statementFile = async el => {
  const file = el.files[0]; el.value = '';
  if (!file) return;
  if (!DB.cards.length) return toast('Cadastre um cartão antes de importar.');
  try {
    const { header, body } = readStatement(await decodeFile(file));
    if (!body.length) return toast('Não encontrei lançamentos nesse arquivo.');
    const map = guessColumns(header);
    const card = cardById(DB.ui.card) || DB.cards[0];
    const dates = body.map(r => parseDateBR(r[map.date], curMonth())).filter(Boolean).sort();
    const statementMonth = dates.length ? firstInvoiceMonth(dates[dates.length - 1], card) : curMonth();
    const defaultCategory = DB.categories.despesa.includes('Outros') ? 'Outros' : DB.categories.despesa[0];
    IMPORT = { fileName: file.name, header, body, map, card, mode: 'fatura', statementMonth, includeCurrent: true, defaultCategory };
    IMPORT.sheet = openSheet('', { cls: 'sheet-form tall', onClose: () => { IMPORT = null; } });
    refreshImport();
  } catch (e) {
    console.error(e);
    toast('Não consegui ler esse arquivo. Exporte a fatura em CSV pelo app do banco.');
  }
};
BIND.impMap = el => { IMPORT.map[el.dataset.k] = el.value; refreshImport(); };
BIND.impCard = el => { IMPORT.card = cardById(el.value); refreshImport(); };
BIND.impMonth = el => { if (el.value) { IMPORT.statementMonth = el.value; refreshImport(); } };
BIND.impCurrent = el => { IMPORT.includeCurrent = el.checked; refreshImport(); };
ACT.impMode = el => { IMPORT.mode = el.dataset.v; refreshImport(); };
BIND.impUse = el => { const r = IMPORT.preview.find(x => x.i === +el.dataset.i); r.use = el.checked; IMPORT.keepEdits = true; refreshImport(false); };
BIND.impCat = el => { const r = IMPORT.preview.find(x => x.i === +el.dataset.i); r.category = el.value; r.categoryChanged = true; IMPORT.keepEdits = true; };
ACT.impGo = () => {
  const s = IMPORT, card = s.card;
  const chosen = s.preview.filter(r => r.use && r.status !== 'Inválida' && r.count > 0);
  chosen.forEach(r => {
    DB.purchases.push({ id: uid(), cardId: card.id, date: r.date, description: r.description, category: r.category, total: r.purchaseTotal, count: r.total, startNumber: r.start, firstInvoice: r.first });
    if (r.categoryChanged) learnCategory(r.description, r.category);
  });
  DB.ui.card = card.id;
  save();
  closeAllSheets();
  go('#/cartoes');
  rerender();
  toast(`${chosen.length} compras importadas no ${card.name}.`);
};
