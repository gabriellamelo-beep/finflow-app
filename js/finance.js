'use strict';
/* Regras financeiras (mesma lógica do FinFlow do PC). */

/* ================= CATEGORIAS ================= */
const CATEGORY_RULES = [
  ['alimentacao', ['supermerc', 'mercado', 'ifood', 'ifd*', 'restaurante', 'lanchonete', 'padaria', 'paes', 'panific', 'acougue', 'hortifruti', 'atacad', 'assai', 'carrefour', 'pao de acucar', 'burger', 'pizza', 'cafe', 'rappi', 'outback', 'mcdonald', 'bar ']],
  ['transporte', ['uber', '99app', '99 pop', '99*', 'posto', 'combust', 'shell', 'ipiranga', 'estacion', 'pedagio', 'sem parar', 'veloe', 'conectcar', 'transporte', 'auto ']],
  ['saude', ['farmac', 'drogaria', 'droga raia', 'drogasil', 'hospital', 'clinica', 'laborat', 'saude', 'medic', 'odonto', 'dentist', 'pacheco']],
  ['assinaturas', ['netflix', 'spotify', 'disney', 'hbo', 'max.com', 'prime video', 'amazonprime', 'apple.com', 'google', 'youtube', 'icloud', 'deezer', 'globoplay', 'chatgpt', 'openai', 'adapta', 'assinatura']],
  ['academia', ['smart fit', 'smartfit', 'academia', 'bodytech', 'gympass', 'wellhub', 'crossfit']],
  ['viagens', ['hotel', 'hoteis', 'airbnb', 'booking', 'latam', 'gol linhas', 'azul linhas', 'decolar', 'cruzeiro', 'cia aerea', 'companhia aerea', 'companhias aereas', 'turismo', 'passagem', 'hostel']],
  ['pets', ['petz', 'cobasi', 'petshop', 'pet shop', 'veterin']],
  ['educacao', ['escola', 'colegio', 'faculdade', 'universidade', 'curso', 'udemy', 'alura', 'livraria', 'pucrs', 'educacao', 'educacional']],
  ['lazer', ['cinema', 'ingresso', 'teatro', 'show', 'steam', 'playstation', 'xbox', 'nintendo', 'lazer', 'entretenimento']],
  ['impostos', ['iof', 'anuidade', 'tarifa', 'juros', 'multa', 'imposto', 'encargo']],
  ['moradia', ['condominio', 'aluguel', 'energia', 'enel', 'cemig', 'light ', 'sabesp', 'saneamento', 'internet', 'telecomunic', 'vivo', 'claro', 'tim ', 'leroy', 'construcao', 'moveis', 'eletro']],
];

const descKey = d => plain(String(d || '').replace(/[\s\-–]*(?:parc\w*\.?\s*)?\d{1,2}\s*(?:\/|de)\s*\d{1,2}\s*$/i, ''));

/* Categoria sugerida pela descrição: o que você já ensinou ao app, depois palavras-chave. */
function suggestCategory(description, kind = 'despesa') {
  const list = DB.categories[kind];
  const key = descKey(description);
  if (!key) return null;
  if (DB.rules[key] && list.includes(DB.rules[key])) return DB.rules[key];
  if (kind !== 'despesa') return null;
  let hay = ` ${key} `;
  if (/mercado\W*(mercado)?\W*(livre|li|l|pago|pag)\b|mercadoli|mercadopag|\bmp ?\*/.test(hay)) hay = hay.replace(/mercado/g, ' marketplace ');
  for (const [cat, words] of CATEGORY_RULES) {
    const target = list.find(c => plain(c) === cat);
    if (target && words.some(w => hay.includes(w))) return target;
  }
  return null;
}
function learnCategory(description, category) {
  const key = descKey(description);
  if (key && category) DB.rules[key] = category;
}

/* ================= CARTÕES ================= */
function firstInvoiceMonth(dateIso, card) {
  let closing = monthOf(dateIso);
  if (+dateIso.slice(8, 10) > card.closingDay) closing = addMonths(closing, 1);
  // Vencimento depois do fechamento cai no mesmo mês; senão, no mês seguinte.
  return card.dueDay > card.closingDay ? closing : addMonths(closing, 1);
}

function installmentsOf(p) {
  const base = round2(p.total / p.count);
  const last = round2(p.total - base * (p.count - 1));
  const out = [];
  for (let n = p.startNumber || 1; n <= p.count; n++) {
    out.push({ n, month: addMonths(p.firstInvoice, n - (p.startNumber || 1)), amount: n === p.count ? last : base });
  }
  return out;
}

const cardById = id => DB.cards.find(c => c.id === id);
const invoiceKey = (cardId, ym) => `${cardId}|${ym}`;
const isInvoicePaid = (cardId, ym) => !!DB.paidInvoices[invoiceKey(cardId, ym)];

/* Itens de uma fatura (cartão + mês). */
function invoiceItems(cardId, ym) {
  const items = [];
  for (const p of DB.purchases) {
    if (cardId && p.cardId !== cardId) continue;
    for (const i of installmentsOf(p)) if (i.month === ym) items.push({ purchase: p, n: i.n, amount: i.amount });
  }
  return items.sort((a, b) => (b.purchase.date || '').localeCompare(a.purchase.date || ''));
}
const invoiceTotal = (cardId, ym) => round2(sum(invoiceItems(cardId, ym), x => x.amount));

/* Total por mês de fatura de cada cartão: { 'cardId|AAAA-MM': valor }. */
function invoiceMap() {
  const map = {};
  for (const p of DB.purchases) for (const i of installmentsOf(p)) {
    const k = invoiceKey(p.cardId, i.month);
    map[k] = round2((map[k] || 0) + i.amount);
  }
  return map;
}

/* Faturas em aberto a partir de um mês: [{cardId, month, amount}]. */
function openInvoices(fromYm = curMonth()) {
  return Object.entries(invoiceMap())
    .map(([k, amount]) => { const [cardId, month] = k.split('|'); return { cardId, month, amount }; })
    .filter(x => x.month >= fromYm && !isInvoicePaid(x.cardId, x.month) && x.amount > 0)
    .sort((a, b) => a.month.localeCompare(b.month));
}
const cardCommitted = cardId => round2(sum(openInvoices().filter(x => x.cardId === cardId), x => x.amount));

function addPurchase({ cardId, date, description, category, total, count }) {
  const card = cardById(cardId);
  const p = { id: uid(), cardId, date, description, category, total: round2(total), count: +count || 1, startNumber: 1, firstInvoice: firstInvoiceMonth(date, card) };
  DB.purchases.push(p);
  return p;
}

/* ================= MÊS: RECEITAS E DESPESAS ================= */
const inMonth = (iso, ym) => monthOf(iso) === ym;

/* Despesas do mês: avulsas + parcelas das faturas que vencem no mês. */
function monthExpenseItems(ym) {
  const items = DB.expenses.filter(e => inMonth(e.date, ym)).map(e => ({ type: 'expense', id: e.id, date: e.date, description: e.description || e.category, category: e.category, amount: e.amount, sub: e.payment || '', ref: e }));
  for (const card of DB.cards) {
    for (const it of invoiceItems(card.id, ym)) {
      const p = it.purchase;
      items.push({ type: 'card', id: p.id, date: dayInMonth(ym, card.dueDay), description: p.description, category: p.category, amount: it.amount, sub: `${card.name}${p.count > 1 ? ` · ${it.n}/${p.count}` : ''}`, ref: p, card });
    }
  }
  return items;
}
const monthIncomeItems = ym => DB.incomes.filter(i => inMonth(i.date, ym)).map(i => ({ type: 'income', id: i.id, date: i.date, description: i.description || i.category, category: i.category, amount: i.amount, sub: '', ref: i }));

function monthSummary(ym) {
  const expenses = monthExpenseItems(ym), incomes = monthIncomeItems(ym);
  const income = round2(sum(incomes, x => x.amount));
  const expense = round2(sum(expenses, x => x.amount));
  const card = round2(sum(expenses.filter(x => x.type === 'card'), x => x.amount));
  return { income, expense, card, balance: round2(income - expense), savingsRate: income ? (income - expense) / income * 100 : 0, expenses, incomes };
}

function byCategory(items) {
  const map = {};
  items.forEach(x => { map[x.category] = (map[x.category] || 0) + x.amount; });
  return Object.entries(map).map(([category, amount]) => ({ category, amount: round2(amount) })).sort((a, b) => b.amount - a.amount);
}

/* ================= ORÇAMENTO ================= */
function budgetStatus(ym = curMonth()) {
  const spent = Object.fromEntries(byCategory(monthExpenseItems(ym)).map(x => [x.category, x.amount]));
  return Object.entries(DB.budgets).filter(([, limit]) => limit > 0).map(([category, limit]) => {
    const used = spent[category] || 0, p = used / limit * 100;
    return { category, limit, spent: used, remaining: round2(limit - used), pct: p, status: p > 100 ? 'over' : p >= 80 ? 'warn' : 'ok' };
  }).sort((a, b) => b.pct - a.pct);
}
function budgetAlert(category, ym = curMonth()) {
  const b = budgetStatus(ym).find(x => x.category === category);
  if (!b || b.status === 'ok') return '';
  return b.status === 'over' ? `${catLabel(category)}: orçamento estourado em ${brl(-b.remaining)}` : `${catLabel(category)}: ${num(b.pct, 0)}% do orçamento usado`;
}

/* ================= RECORRENTES ================= */
const recurringActiveIn = (r, ym) => r.active && r.start <= ym && (!r.end || ym <= r.end);
function matchesRecurring(entry, r) {
  if (entry.category !== r.category) return false;
  const sameDesc = descKey(entry.description || entry.category) === descKey(r.description);
  return sameDesc || (r.amount > 0 && Math.abs(entry.amount - r.amount) <= r.amount * 0.05);
}
function manualEntryExists(r, ym) {
  const list = r.kind === 'Receita' ? DB.incomes : DB.expenses;
  return list.some(x => !x.recurringId && inMonth(x.date, ym) && matchesRecurring(x, r));
}

/* Lança as recorrências que já venceram. Retorna quantas foram criadas. */
function generateRecurring() {
  const t = today(), cur = curMonth();
  let created = 0;
  for (const r of DB.recurring) {
    if (!r.active) continue;
    let ym = r.lastGenerated ? addMonths(r.lastGenerated, 1) : r.start;
    while (ym <= cur && recurringActiveIn(r, ym)) {
      const date = dayInMonth(ym, r.day);
      if (date > t) break;
      if (!manualEntryExists(r, ym)) {
        const entry = { id: uid(), date, category: r.category, description: r.description, amount: r.amount, recurringId: r.id };
        if (r.kind === 'Receita') DB.incomes.push(entry);
        else DB.expenses.push({ ...entry, payment: r.payment || 'PIX' });
        created++;
      }
      r.lastGenerated = ym;
      ym = addMonths(ym, 1);
    }
  }
  if (created) save();
  return created;
}
function pendingRecurring(ym = curMonth()) {
  return DB.recurring.filter(r => recurringActiveIn(r, ym) && !(r.lastGenerated && r.lastGenerated >= ym) && !manualEntryExists(r, ym))
    .map(r => ({ ...r, date: dayInMonth(ym, r.day) })).sort((a, b) => a.date.localeCompare(b.date));
}

/* ================= INVESTIMENTOS ================= */
const assetClass = a => ASSET_CLASSES[a.category] || a.category;
const isVariableIncome = a => ['Acoes', 'ETFs', 'FIIs', 'Criptomoedas'].includes(a.category);

/* Virada de mês: o valor atual vira a base da rentabilidade do novo mês. */
function rolloverAssets() {
  const cur = curMonth();
  const tracked = new Set(DB.assetTx.map(t => t.assetId));
  let changed = false;
  for (const a of DB.assets) {
    if (!a.monthStartDate || a.monthStartDate < cur || (!a.monthStart && !tracked.has(a.id))) {
      a.monthStart = a.current; a.monthStartDate = cur; changed = true;
    }
  }
  if (changed) save();
}

function assetFlows(ym = curMonth()) {
  const flows = {};
  DB.assetTx.filter(t => inMonth(t.date, ym)).forEach(t => { flows[t.assetId] = (flows[t.assetId] || 0) + (t.kind === 'Resgate' ? -t.amount : t.amount); });
  return flows;
}

function assetRows() {
  const flows = assetFlows();
  const total = sum(DB.assets, a => a.current);
  return DB.assets.map(a => {
    const profit = a.current - a.invested;
    const monthProfit = a.current - (a.monthStart || 0) - (flows[a.id] || 0);
    const base = (a.monthStart || 0) + Math.max(flows[a.id] || 0, 0);
    return { ...a, cls: assetClass(a), profit, profitPct: a.invested ? profit / a.invested * 100 : 0, monthProfit, monthPct: base ? monthProfit / base * 100 : 0, weight: total ? a.current / total * 100 : 0 };
  }).sort((a, b) => b.current - a.current);
}

function assetTotals() {
  const rows = assetRows();
  const invested = sum(rows, r => r.invested), current = sum(rows, r => r.current), monthProfit = sum(rows, r => r.monthProfit);
  const monthBase = sum(rows, r => (r.monthStart || 0)) + Math.max(sum(Object.values(assetFlows())), 0);
  const contributions = sum(Object.values(assetFlows()));
  return { invested, current, profit: current - invested, profitPct: invested ? (current - invested) / invested * 100 : 0, monthProfit, monthPct: monthBase ? monthProfit / monthBase * 100 : 0, contributions };
}

function recordMovement(asset, kind, date, amount, quantity = 0, notes = '') {
  if (!(amount > 0)) return 'Informe um valor maior que zero.';
  if (kind === 'Aporte') {
    asset.invested += amount; asset.current += amount;
    if (quantity > 0) asset.quantity = (asset.quantity || 0) + quantity;
  } else {
    if (amount > asset.current + 0.005) return `O resgate é maior que o saldo atual (${brl(asset.current)}).`;
    const ratio = quantity > 0 && asset.quantity ? Math.min(quantity / asset.quantity, 1) : (asset.current ? amount / asset.current : 1);
    if (quantity > 0 && asset.quantity) asset.quantity = Math.max(asset.quantity - quantity, 0);
    asset.invested *= (1 - ratio);
    asset.current = Math.max(asset.current - amount, 0);
  }
  asset.lastUpdate = date > (asset.lastUpdate || '') ? date : asset.lastUpdate;
  DB.assetTx.push({ id: uid(), assetId: asset.id, date, kind, amount, quantity, notes });
  return '';
}

/* ================= PATRIMÔNIO ================= */
function netWorth() {
  const financial = sum(DB.assets, a => a.current);
  const goods = sum(DB.wealth.filter(w => w.kind === 'Ativo'), w => w.value);
  const debts = sum(DB.wealth.filter(w => w.kind === 'Passivo'), w => w.value);
  return { financial, goods, debts, total: financial + goods, net: financial + goods - debts };
}

/* ================= METAS ================= */
function goalMonths(current, target, monthly, annual = 0.10) {
  if (current >= target) return 0;
  if (monthly <= 0 && annual <= 0) return null;
  const rate = Math.pow(1 + annual, 1 / 12) - 1;
  let v = current, m = 0;
  while (v < target && m < 1200) { v = v * (1 + rate) + monthly; m++; }
  return v >= target ? m : null;
}

/* ================= FLUXO DE CAIXA ================= */
function isVariableEntry(entry, kind) {
  if (entry.recurringId) return false;
  return !DB.recurring.some(r => r.kind === kind && matchesRecurring(entry, r));
}
/* Média mensal dos lançamentos variáveis nos últimos meses completos. */
function averageVariable(kind, months = 3) {
  const list = kind === 'Receita' ? DB.incomes : DB.expenses;
  const cur = curMonth(), start = addMonths(cur, -months);
  return round2(sum(list.filter(x => monthOf(x.date) >= start && monthOf(x.date) < cur && isVariableEntry(x, kind)), x => x.amount) / months);
}

function projectCashFlow(months, opening, varIncome, varExpense) {
  const cur = curMonth();
  const invoices = {};
  openInvoices(cur).forEach(x => { invoices[x.month] = (invoices[x.month] || 0) + x.amount; });
  const rows = [];
  let balance = opening;
  for (let i = 0; i < months; i++) {
    const ym = addMonths(cur, i);
    const card = invoices[ym] || 0;
    let incFixed, incVar, expFixed, expVar;
    if (i === 0) {
      const pend = pendingRecurring(ym);
      const inc = DB.incomes.filter(x => inMonth(x.date, ym)), exp = DB.expenses.filter(x => inMonth(x.date, ym));
      const incV = sum(inc.filter(x => isVariableEntry(x, 'Receita')), x => x.amount);
      const expV = sum(exp.filter(x => isVariableEntry(x, 'Despesa')), x => x.amount);
      incFixed = sum(inc, x => x.amount) - incV + sum(pend.filter(r => r.kind === 'Receita'), r => r.amount);
      expFixed = sum(exp, x => x.amount) - expV + sum(pend.filter(r => r.kind === 'Despesa'), r => r.amount);
      incVar = Math.max(incV, varIncome);
      expVar = Math.max(expV, varExpense);
    } else {
      const active = DB.recurring.filter(r => recurringActiveIn(r, ym));
      incFixed = sum(active.filter(r => r.kind === 'Receita'), r => r.amount);
      expFixed = sum(active.filter(r => r.kind === 'Despesa'), r => r.amount);
      incVar = varIncome; expVar = varExpense;
    }
    const income = incFixed + incVar, outflow = expFixed + expVar + card, result = income - outflow;
    balance += result;
    rows.push({ month: ym, incFixed, incVar, expFixed, expVar, card, income, outflow, result, balance });
  }
  return rows;
}
