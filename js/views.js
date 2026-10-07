'use strict';
/* Telas e roteamento. */

const TABS = [['', 'home', 'Início'], ['lancamentos', 'list', 'Lançamentos'], ['+', 'plus', ''], ['cartoes', 'card', 'Cartões'], ['mais', 'grid', 'Mais']];
const MORE_PAGES = ['mais', 'investimentos', 'orcamento', 'recorrentes', 'fluxo', 'metas', 'patrimonio', 'categorias', 'ajustes'];
const ROUTES = {
  '': renderHome, lancamentos: renderEntries, cartoes: renderCards, mais: renderMore, investimentos: renderInvest,
  orcamento: renderBudget, recorrentes: renderRecurring, fluxo: renderCashFlow, metas: renderGoals,
  patrimonio: renderWealth, categorias: renderCategories, ajustes: renderSettings, novo: () => renderHome(),
};
const STATE = { q: '', invMonth: {} };
let _lastRoute = null;

function parseHash() {
  const [name = '', arg = ''] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: ROUTES[name] ? name : '', arg: decodeURIComponent(arg) };
}
function route() {
  const { name, arg } = parseHash();
  const key = `${name}/${arg}`;
  const y = window.scrollY;
  $('#view').innerHTML = ROUTES[name](arg) || '';
  $('#view').dataset.route = name;
  const tab = MORE_PAGES.includes(name) ? 'mais' : name === 'novo' ? '' : name;
  $('#tabbar').innerHTML = TABS.map(([r, icon, label]) => r === '+'
    ? `<button class="fab" data-act="quickAdd" aria-label="Novo lançamento">${ic('plus')}</button>`
    : `<a href="#/${r}" class="${r === tab ? 'on' : ''}">${ic(icon)}<span>${label}</span></a>`).join('');
  window.scrollTo(0, key === _lastRoute ? y : 0);
  _lastRoute = key;
  if (name === 'novo') { history.replaceState(null, '', '#/'); openQuickAdd(arg || 'despesa'); }
}
const rerender = () => route();
const go = h => { if (location.hash === h) route(); else location.hash = h; };

const pageHead = (title, right = '', sub = '', back = '') => `<header class="page-head">${back ? `<a class="icon-btn back" href="${back}" aria-label="Voltar">${ic('left')}</a>` : ''}<div class="grow"><h1>${title}</h1>${sub ? `<p class="page-sub">${sub}</p>` : ''}</div><div class="head-actions">${right}</div></header>`;
const section = (title, body, action = '') => `<section class="section"><div class="section-head"><h2>${title}</h2>${action}</div>${body}</section>`;
const kpi = (label, value, extra = '', cls = '') => `<div class="kpi ${cls}"><small>${label}</small><b>${value}</b>${extra ? `<span>${extra}</span>` : ''}</div>`;
const monthSwitch = (act, ym) => `<div class="month-switch"><button class="icon-btn" data-act="${act}" data-v="-1" aria-label="Mês anterior">${ic('left')}</button><b>${monthName(ym)}</b><button class="icon-btn" data-act="${act}" data-v="1" aria-label="Próximo mês">${ic('right')}</button></div>`;

function entryRow(x) {
  const sign = x.type === 'income' ? '+' : '−';
  return `<button class="row" data-act="openEntry" data-type="${x.type}" data-id="${x.id}">
    ${catDot(x.category)}
    <span class="row-main"><b>${esc(x.description)}</b><small>${esc(catLabel(x.category))}${x.sub ? ` · ${esc(x.sub)}` : ''}</small></span>
    <span class="row-amount ${x.type === 'income' ? 'pos' : ''}">${sign} ${brl(x.amount)}</span>
  </button>`;
}

/* ================= INÍCIO ================= */
function renderHome() {
  const ym = curMonth(), s = monthSummary(ym), nw = netWorth(), inv = assetTotals();
  const hour = new Date().getHours();
  let html = pageHead(hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite', `<a class="icon-btn" href="#/ajustes" aria-label="Ajustes">${ic('settings')}</a>`, monthName(ym));

  if (!hasData()) {
    html += `<section class="card welcome">
      <h2>Bem-vinda ao FinFlow</h2>
      <p>Traga seus dados do FinFlow do computador ou comece lançando seus gastos por aqui.</p>
      <a class="btn btn-primary" href="#/ajustes">${ic('upload')}Importar do FinFlow do PC</a>
      <button class="btn btn-soft" data-act="quickAdd">${ic('plus')}Lançar primeira despesa</button>
    </section>`;
  }

  html += `<section class="card hero">
    <small>Saldo de ${MONTHS[+ym.slice(5) - 1]}</small>
    <div class="hero-value ${moneyClass(s.balance)}">${brl(s.balance)}</div>
    <div class="hero-split">
      <a href="#/lancamentos" class="split-item">${ic('up', 'pos')}<span><small>Entradas</small><b>${brl(s.income)}</b></span></a>
      <a href="#/lancamentos" class="split-item">${ic('down', 'neg')}<span><small>Saídas</small><b>${brl(s.expense)}</b></span></a>
    </div>
    ${s.card ? `<p class="hero-note">Inclui ${brl(s.card)} em faturas de cartão${s.income ? ` · poupança de ${pct(s.savingsRate, 0)}` : ''}</p>` : ''}
  </section>`;

  const alerts = budgetStatus(ym).filter(b => b.status !== 'ok').slice(0, 3);
  if (alerts.length) {
    html += `<section class="alerts">${alerts.map(b => `<a class="alert ${b.status}" href="#/orcamento">${ic('alert')}<span><b>${esc(catLabel(b.category))}</b> ${b.status === 'over' ? `passou ${brl(-b.remaining)} do limite` : `${num(b.pct, 0)}% do orçamento`}</span>${ic('right')}</a>`).join('')}</section>`;
  }

  const nextByCard = DB.cards.map(c => ({ card: c, inv: openInvoices().find(x => x.cardId === c.id) })).filter(x => x.inv);
  if (nextByCard.length) {
    html += section('Próximas faturas', `<div class="list">${nextByCard.map(({ card, inv: i }) => {
      const due = dayInMonth(i.month, card.dueDay), days = daysBetween(today(), due);
      return `<div class="row static">
        <span class="dot card-dot">${ic('card')}</span>
        <a class="row-main" href="#/cartoes" data-act="pickCard" data-id="${card.id}" data-month="${i.month}"><b>${esc(card.name)}</b><small>vence ${fmtDay(due)}${days >= 0 && days <= 7 ? ` · <span class="warn-text">em ${days} dia${days === 1 ? '' : 's'}</span>` : days < 0 ? ' · <span class="neg">vencida</span>' : ''}</small></a>
        <span class="row-amount">${brl(i.amount)}</span>
        <button class="mini-btn" data-act="togglePaid" data-card="${card.id}" data-month="${i.month}">Paga</button>
      </div>`;
    }).join('')}</div>`, `<a class="link" href="#/cartoes">Ver cartões</a>`);
  }

  const pending = pendingRecurring(ym);
  if (pending.length) {
    html += section('Ainda vão acontecer este mês', `<div class="list">${pending.slice(0, 5).map(r => `<button class="row" data-act="editRecurring" data-id="${r.id}">
      ${catDot(r.category)}<span class="row-main"><b>${esc(r.description)}</b><small>dia ${fmtDay(r.date)} · ${r.kind}</small></span>
      <span class="row-amount ${r.kind === 'Receita' ? 'pos' : ''}">${r.kind === 'Receita' ? '+' : '−'} ${brl(r.amount)}</span></button>`).join('')}</div>`, `<a class="link" href="#/recorrentes">Recorrentes</a>`);
  }

  const cats = byCategory(s.expenses).slice(0, 5);
  if (cats.length) {
    const max = cats[0].amount;
    html += section('Onde foi o dinheiro', `<div class="card cat-bars">${cats.map(c => {
      const limit = DB.budgets[c.category];
      return `<div class="cat-bar"><div class="cat-bar-top">${catDot(c.category)}<span>${esc(catLabel(c.category))}</span><b>${brl(c.amount)}</b></div>${bar(limit ? c.amount / limit * 100 : c.amount / max * 100, limit && c.amount > limit ? 'over' : '')}${limit ? `<small>de ${brl(limit)}</small>` : ''}</div>`;
    }).join('')}</div>`, `<a class="link" href="#/orcamento">Orçamento</a>`);
  }

  if (hasData()) {
    html += section('Patrimônio', `<a class="card wealth-card" href="#/investimentos">
      <div>${kpi('Patrimônio líquido', brl(nw.net))}</div>
      <div class="wealth-split">${kpi('Investido', brl(inv.current), `<span class="${moneyClass(inv.profit)}">${pct(inv.profitPct, 1, true)}</span> no total`)}${kpi('No mês', brl(inv.monthProfit), 'rendimento', moneyClass(inv.monthProfit))}</div>
    </a>`);
    const lb = DB.settings.lastBackup ? daysBetween(DB.settings.lastBackup.slice(0, 10), today()) : null;
    if (lb === null || lb > 14) html += `<button class="nudge" data-act="exportBackup">${ic('download')}<span>${lb === null ? 'Você ainda não fez backup dos dados deste celular.' : `Último backup há ${lb} dias.`} <b>Fazer agora</b></span></button>`;
  }
  return html;
}
ACT.pickCard = el => { DB.ui.card = el.dataset.id; if (el.dataset.month) STATE.invMonth[el.dataset.id] = el.dataset.month; save(); };

/* ================= LANÇAMENTOS ================= */
function renderEntries() {
  const ym = DB.ui.month || curMonth(), filter = DB.ui.filter || 'all', s = monthSummary(ym);
  let html = pageHead('Lançamentos', `<button class="icon-btn" data-act="quickAdd" aria-label="Novo">${ic('plus')}</button>`);
  html += monthSwitch('entriesMonth', ym);
  html += `<div class="summary-row">${kpi('Entradas', brl(s.income), '', 'pos')}${kpi('Saídas', brl(s.expense), '', 'neg')}${kpi('Saldo', brl(s.balance), '', moneyClass(s.balance))}</div>`;
  html += seg('entriesFilter', [['all', 'Tudo'], ['despesas', 'Despesas'], ['receitas', 'Receitas']], filter);
  html += `<div class="search">${ic('search')}<input type="search" placeholder="Buscar descrição ou categoria" value="${esc(STATE.q)}" data-live="entriesSearch"></div>`;
  html += `<div id="entries-list">${entriesListHtml(ym, filter, s)}</div>`;
  if (filter !== 'receitas') {
    const cats = byCategory(s.expenses);
    if (cats.length) html += section('Por categoria', `<div class="card cat-bars">${cats.map(c => {
      const limit = DB.budgets[c.category];
      return `<div class="cat-bar"><div class="cat-bar-top">${catDot(c.category)}<span>${esc(catLabel(c.category))}</span><b>${brl(c.amount)}</b></div>${bar(limit ? c.amount / limit * 100 : c.amount / cats[0].amount * 100, limit && c.amount > limit ? 'over' : '')}${limit ? `<small>limite ${brl(limit)}</small>` : ''}</div>`;
    }).join('')}</div>`);
  }
  return html;
}
function entriesListHtml(ym, filter, s) {
  const q = plain(STATE.q);
  let items = [];
  if (filter !== 'receitas') items.push(...s.expenses);
  if (filter !== 'despesas') items.push(...s.incomes);
  if (q) items = items.filter(x => plain(`${x.description} ${x.category} ${x.sub} ${num(x.amount)}`).includes(q));
  else {
    // Sem busca, cada fatura aparece como uma linha só.
    const invoices = {};
    items = items.filter(x => {
      if (x.type !== 'card') return true;
      const k = x.card.id;
      invoices[k] = invoices[k] || { type: 'invoice', id: k, date: x.date, description: `Fatura ${x.card.name}`, category: 'Cartão', amount: 0, count: 0, card: x.card };
      invoices[k].amount += x.amount; invoices[k].count++;
      return false;
    });
    items.push(...Object.values(invoices));
  }
  if (!items.length) return emptyState('list', q ? 'Nada encontrado' : 'Nenhum lançamento', q ? 'Tente outra busca.' : `Sem lançamentos em ${monthName(ym)}.`, q ? '' : `<button class="btn btn-primary" data-act="quickAdd">${ic('plus')}Novo lançamento</button>`);
  const groups = {};
  items.sort((a, b) => b.date.localeCompare(a.date)).forEach(x => (groups[x.date] = groups[x.date] || []).push(x));
  return Object.entries(groups).map(([date, list]) => `<div class="day-group"><div class="day-head"><span>${dayHeader(date)}</span><span>${brl(sum(list, x => x.type === 'income' ? x.amount : -x.amount))}</span></div>
    <div class="list">${list.map(x => x.type === 'invoice'
      ? `<a class="row" href="#/cartoes" data-act="pickCard" data-id="${x.card.id}" data-month="${ym}"><span class="dot card-dot">${ic('card')}</span><span class="row-main"><b>${esc(x.description)}</b><small>${x.count} compra${x.count > 1 ? 's' : ''} · ${isInvoicePaid(x.card.id, ym) ? 'paga' : 'em aberto'}</small></span><span class="row-amount">− ${brl(x.amount)}</span></a>`
      : entryRow(x)).join('')}</div></div>`).join('');
}
ACT.entriesMonth = el => { DB.ui.month = addMonths(DB.ui.month || curMonth(), +el.dataset.v); save(); rerender(); };
ACT.entriesFilter = el => { DB.ui.filter = el.dataset.v; save(); rerender(); };
LIVE.entriesSearch = el => {
  STATE.q = el.value;
  const ym = DB.ui.month || curMonth();
  $('#entries-list').innerHTML = entriesListHtml(ym, DB.ui.filter || 'all', monthSummary(ym));
};

/* ================= CARTÕES ================= */
function renderCards() {
  let html = pageHead('Cartões', `<button class="icon-btn" data-act="newCard" aria-label="Novo cartão">${ic('plus')}</button>`);
  if (!DB.cards.length) return html + emptyState('card', 'Nenhum cartão', 'Cadastre seus cartões para acompanhar faturas e parcelas.', `<button class="btn btn-primary" data-act="newCard">${ic('plus')}Cadastrar cartão</button>`);
  const card = cardById(DB.ui.card) || DB.cards[0];
  const firstOpen = openInvoices().find(x => x.cardId === card.id);
  const ym = STATE.invMonth[card.id] || firstOpen?.month || curMonth();
  html += `<div class="chips scroll">${DB.cards.map(c => `<button class="chip ${c.id === card.id ? 'on' : ''}" data-act="selectCard" data-id="${c.id}">${esc(c.name)}</button>`).join('')}</div>`;

  const used = cardCommitted(card.id), items = invoiceItems(card.id, ym), total = round2(sum(items, x => x.amount));
  const paid = isInvoicePaid(card.id, ym), due = dayInMonth(ym, card.dueDay);
  html += `<section class="card credit">
    <div class="credit-top"><b>${esc(card.name)}</b><button class="icon-btn small" data-act="editCard" data-id="${card.id}" aria-label="Editar cartão">${ic('edit')}</button></div>
    <small>Limite usado</small>
    <div class="credit-used"><b>${brl(used)}</b><span>de ${brl(card.limit)}</span></div>
    ${bar(card.limit ? used / card.limit * 100 : 0, card.limit && used > card.limit * 0.9 ? 'over' : '')}
    <small>Disponível ${brl(Math.max(card.limit - used, 0))} · fecha dia ${card.closingDay} · vence dia ${card.dueDay}</small>
  </section>`;

  html += monthSwitch('invoiceMonth', ym);
  html += `<section class="card invoice ${paid ? 'paid' : ''}">
    <div><small>Fatura de ${monthName(ym)}</small><div class="invoice-total">${brl(total)}</div><small>vence ${fmtDate(due)} · ${items.length} lançamento${items.length === 1 ? '' : 's'}</small></div>
    ${total > 0 ? `<button class="btn ${paid ? 'btn-ghost' : 'btn-primary'}" data-act="togglePaid" data-card="${card.id}" data-month="${ym}">${paid ? `${ic('check')}Paga · reabrir` : 'Marcar como paga'}</button>` : ''}
  </section>`;

  const upcoming = Array.from({ length: 6 }, (_, i) => addMonths(curMonth(), i)).map(m => ({ m, v: invoiceTotal(card.id, m) }));
  const max = Math.max(...upcoming.map(x => x.v), 1);
  html += `<div class="mini-chart">${upcoming.map(x => `<button class="${x.m === ym ? 'on' : ''}" data-act="invoiceGo" data-v="${x.m}"><span class="mini-bar" style="height:${Math.max(4, x.v / max * 64)}px"></span><small>${monthShort(x.m)}</small></button>`).join('')}</div>`;

  html += section('Compras da fatura', items.length ? `<div class="list">${items.map(it => entryRow({ type: 'card', id: it.purchase.id, date: it.purchase.date, description: it.purchase.description, category: it.purchase.category, amount: it.amount, sub: `${fmtDay(it.purchase.date)}${it.purchase.count > 1 ? ` · ${it.n}/${it.purchase.count}` : ''}` })).join('')}</div>`
    : emptyState('receipt', 'Fatura vazia', 'Nenhuma compra nesta fatura.'), `<button class="link" data-act="cardPurchase" data-id="${card.id}">${ic('plus')}Compra</button>`);
  return html;
}
ACT.selectCard = el => { DB.ui.card = el.dataset.id; save(); rerender(); };
ACT.invoiceMonth = el => {
  const card = cardById(DB.ui.card) || DB.cards[0];
  const cur = STATE.invMonth[card.id] || openInvoices().find(x => x.cardId === card.id)?.month || curMonth();
  STATE.invMonth[card.id] = addMonths(cur, +el.dataset.v); rerender();
};
ACT.invoiceGo = el => { const card = cardById(DB.ui.card) || DB.cards[0]; STATE.invMonth[card.id] = el.dataset.v; rerender(); };
ACT.cardPurchase = el => openQuickAdd('cartao', { cardId: el.dataset.id });

/* ================= MAIS ================= */
function renderMore() {
  const tiles = [
    ['investimentos', 'trend', 'Investimentos', brl(assetTotals().current)],
    ['orcamento', 'donut', 'Orçamento', `${Object.keys(DB.budgets).length} categorias`],
    ['recorrentes', 'repeat', 'Recorrentes', `${DB.recurring.filter(r => r.active).length} ativas`],
    ['fluxo', 'flow', 'Fluxo de caixa', 'próximos meses'],
    ['metas', 'flag', 'Metas', `${DB.goals.length} metas`],
    ['patrimonio', 'house', 'Bens e dívidas', brl(netWorth().net)],
    ['categorias', 'tag', 'Categorias', `${DB.categories.despesa.length + DB.categories.receita.length}`],
    ['ajustes', 'settings', 'Ajustes e backup', ''],
  ];
  return pageHead('Mais') + `<div class="tiles">${tiles.map(([r, icon, title, sub]) => `<a class="tile" href="#/${r}">${ic(icon)}<b>${title}</b><small>${sub}</small></a>`).join('')}</div>`;
}

/* ================= INVESTIMENTOS ================= */
function renderInvest() {
  const t = assetTotals(), rows = assetRows();
  let html = pageHead('Investimentos', `<button class="icon-btn" data-act="newAsset" aria-label="Novo investimento">${ic('plus')}</button>`, '', '#/mais');
  html += `<section class="card hero">
    <small>Total investido</small><div class="hero-value">${brl(t.current)}</div>
    <div class="hero-split">
      <div class="split-item"><span><small>Ganho acumulado</small><b class="${moneyClass(t.profit)}">${brl(t.profit)} · ${pct(t.profitPct, 1, true)}</b></span></div>
      <div class="split-item"><span><small>Rendimento no mês</small><b class="${moneyClass(t.monthProfit)}">${brl(t.monthProfit)}</b></span></div>
    </div>
    <p class="hero-note">Aportes do mês: ${brl(t.contributions)} · o rendimento não conta aportes.</p>
  </section>`;
  if (!rows.length) return html + emptyState('trend', 'Nenhum investimento', 'Cadastre seus investimentos para acompanhar saldo e rendimento.', `<button class="btn btn-primary" data-act="newAsset">${ic('plus')}Novo investimento</button>`);
  const classes = {};
  rows.forEach(r => { classes[r.cls] = (classes[r.cls] || 0) + r.current; });
  const total = t.current || 1;
  html += section('Alocação', `<div class="card"><div class="stack">${Object.entries(classes).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<span style="width:${v / total * 100}%;background:${catColor(c)}" title="${esc(c)}"></span>`).join('')}</div>
    <div class="legend">${Object.entries(classes).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<span><i style="background:${catColor(c)}"></i>${esc(c)} <b>${pct(v / total * 100, 0)}</b></span>`).join('')}</div></div>`);
  html += section('Carteira', `<div class="list">${rows.map(r => `<button class="row" data-act="openAsset" data-id="${r.id}">
    <span class="dot" style="background:${catColor(r.cls)}">${esc(r.cls).slice(0, 1)}</span>
    <span class="row-main"><b>${esc(r.name)}</b><small>${esc(r.cls)} · ${pct(r.weight, 0)} da carteira</small></span>
    <span class="row-amount"><span>${brl(r.current)}</span><small class="${moneyClass(r.profit)}">${pct(r.profitPct, 1, true)}</small></span>
  </button>`).join('')}</div>`, `<button class="link" data-act="newAsset">${ic('plus')}Novo</button>`);
  return html;
}

/* ================= ORÇAMENTO ================= */
function renderBudget() {
  const ym = curMonth(), status = budgetStatus(ym);
  let html = pageHead('Orçamento', `<button class="icon-btn" data-act="editBudget" aria-label="Editar limites">${ic('edit')}</button>`, monthName(ym), '#/mais');
  if (!status.length) return html + emptyState('donut', 'Sem orçamento', 'Defina um limite mensal por categoria. Os gastos no cartão contam pelo mês da fatura.', `<button class="btn btn-primary" data-act="editBudget">${ic('edit')}Definir limites</button>`);
  const limit = sum(status, b => b.limit), spent = sum(status, b => b.spent);
  html += `<section class="card hero"><small>Usado do orçamento</small><div class="hero-value">${brl(spent)}</div>${bar(spent / limit * 100, spent > limit ? 'over' : '')}<p class="hero-note">de ${brl(limit)} · ${spent <= limit ? `restam ${brl(limit - spent)}` : `passou ${brl(spent - limit)}`}</p></section>`;
  html += `<div class="list budget-list">${status.map(b => `<div class="row static column">
    <div class="budget-top">${catDot(b.category)}<b>${esc(catLabel(b.category))}</b><span class="budget-val ${b.status}">${brl(b.spent)} <small>de ${brl(b.limit)}</small></span></div>
    ${bar(b.pct, b.status)}
    <small class="${b.status === 'over' ? 'neg' : b.status === 'warn' ? 'warn-text' : 'muted'}">${b.status === 'over' ? `Passou ${brl(-b.remaining)}` : `Restam ${brl(b.remaining)} · ${num(b.pct, 0)}%`}</small>
  </div>`).join('')}</div>`;
  return html;
}

/* ================= RECORRENTES ================= */
function renderRecurring() {
  const ym = curMonth(), active = DB.recurring.filter(r => recurringActiveIn(r, ym));
  const inc = sum(active.filter(r => r.kind === 'Receita'), r => r.amount), exp = sum(active.filter(r => r.kind === 'Despesa'), r => r.amount);
  let html = pageHead('Recorrentes', `<button class="icon-btn" data-act="newRecurring" aria-label="Nova recorrência">${ic('plus')}</button>`, 'Lançadas sozinhas no dia marcado', '#/mais');
  html += `<div class="summary-row">${kpi('Receitas fixas', brl(inc), '', 'pos')}${kpi('Despesas fixas', brl(exp), '', 'neg')}${kpi('Saldo fixo', brl(inc - exp), '', moneyClass(inc - exp))}</div>`;
  if (!DB.recurring.length) return html + emptyState('repeat', 'Nenhuma recorrência', 'Cadastre salário, contas fixas e assinaturas para entrarem sozinhos todo mês.', `<button class="btn btn-primary" data-act="newRecurring">${ic('plus')}Nova recorrência</button>`);
  for (const kind of ['Receita', 'Despesa']) {
    const list = DB.recurring.filter(r => r.kind === kind).sort((a, b) => a.day - b.day);
    if (!list.length) continue;
    html += section(kind === 'Receita' ? 'Receitas' : 'Despesas', `<div class="list">${list.map(r => `<div class="row static ${r.active ? '' : 'paused'}">
      ${catDot(r.category)}
      <button class="row-main" data-act="editRecurring" data-id="${r.id}"><b>${esc(r.description)}</b><small>dia ${r.day} · ${esc(catLabel(r.category))}${r.end ? ` · até ${fmtMonth(r.end)}` : ''}${r.active ? '' : ' · pausada'}</small></button>
      <span class="row-amount ${kind === 'Receita' ? 'pos' : ''}">${brl(r.amount)}</span>
      <button class="icon-btn small" data-act="recToggle" data-id="${r.id}" aria-label="${r.active ? 'Pausar' : 'Reativar'}">${ic(r.active ? 'pause' : 'play')}</button>
    </div>`).join('')}</div>`);
  }
  return html;
}

/* ================= FLUXO DE CAIXA ================= */
function renderCashFlow() {
  const cf = DB.ui.cf || {};
  const opening = cf.opening ?? 0, varIncome = cf.varIncome ?? averageVariable('Receita'), varExpense = cf.varExpense ?? averageVariable('Despesa'), months = cf.months || 12;
  const rows = projectCashFlow(months, opening, varIncome, varExpense);
  const lowest = rows.reduce((a, b) => (b.balance < a.balance ? b : a), rows[0]);
  let html = pageHead('Fluxo de caixa', '', 'Quanto deve sobrar nos próximos meses', '#/mais');
  if (!DB.recurring.length) html += `<p class="info">${ic('info')}Cadastre salário e contas fixas em <a href="#/recorrentes">Recorrentes</a> para a projeção ficar completa.</p>`;
  html += `<section class="card form cf-inputs">
    <div class="row2">${moneyField('opening', opening, 'Saldo em conta hoje', 'data-bind="cfInput"')}${moneyField('varIncome', varIncome, 'Outras receitas/mês', 'data-bind="cfInput"')}</div>
    ${moneyField('varExpense', varExpense, 'Gastos variáveis/mês (fora do cartão)', 'data-bind="cfInput"')}
    ${seg('cfMonths', [[6, '6 meses'], [12, '12 meses'], [24, '24 meses']], months)}
  </section>`;
  html += `<div class="summary-row">${kpi('Em 3 meses', brl(rows[Math.min(2, rows.length - 1)].balance), '', moneyClass(rows[Math.min(2, rows.length - 1)].balance))}${kpi(`Em ${months} meses`, brl(rows[rows.length - 1].balance), '', moneyClass(rows[rows.length - 1].balance))}${kpi('Mês mais apertado', monthShort(lowest.month), brl(lowest.balance), moneyClass(lowest.balance))}</div>`;
  const maxAbs = Math.max(...rows.map(r => Math.max(r.income, r.outflow)), 1);
  html += `<div class="list cf-list">${rows.map(r => `<div class="row static column">
    <div class="budget-top"><b>${monthName(r.month)}</b><span class="budget-val ${r.result < 0 ? 'over' : ''}">${r.result >= 0 ? '+' : '−'} ${brl(Math.abs(r.result))}</span></div>
    <div class="cf-bars"><span class="in" style="width:${r.income / maxAbs * 100}%"></span><span class="out" style="width:${r.outflow / maxAbs * 100}%"></span></div>
    <small class="muted">Entra ${brl(r.income)} · sai ${brl(r.outflow)} (fixas ${brl(r.expFixed)}, cartão ${brl(r.card)}, variáveis ${brl(r.expVar)}) · saldo <b class="${moneyClass(r.balance)}">${brl(r.balance)}</b></small>
  </div>`).join('')}</div>`;
  return html;
}
BIND.cfInput = el => { DB.ui.cf = { ...(DB.ui.cf || {}), [el.name]: parseMoney(el.value) }; save(); rerender(); };
ACT.cfMonths = el => { DB.ui.cf = { ...(DB.ui.cf || {}), months: +el.dataset.v }; save(); rerender(); };

/* ================= METAS ================= */
function renderGoals() {
  let html = pageHead('Metas', `<button class="icon-btn" data-act="newGoal" aria-label="Nova meta">${ic('plus')}</button>`, '', '#/mais');
  if (!DB.goals.length) return html + emptyState('flag', 'Nenhuma meta', 'Defina objetivos e acompanhe quanto falta.', `<button class="btn btn-primary" data-act="newGoal">${ic('plus')}Nova meta</button>`);
  return html + `<div class="list">${DB.goals.map(g => {
    const p = g.target ? g.current / g.target * 100 : 0, months = goalMonths(g.current, g.target, g.monthly);
    const left = monthDiff(curMonth(), monthOf(g.deadline));
    const status = months === 0 ? 'Meta atingida' : months == null ? 'Defina um aporte mensal' : months <= left ? `No prazo · ~${months} meses` : `Atrasada · ~${months} meses (prazo ${fmtMonth(monthOf(g.deadline))})`;
    return `<button class="row column" data-act="editGoal" data-id="${g.id}">
      <div class="budget-top">${ic('flag')}<b>${esc(g.name)}</b><span class="budget-val">${pct(p, 0)}</span></div>
      ${bar(p, p >= 100 ? 'ok' : '')}
      <small class="muted">${brl(g.current)} de ${brl(g.target)} · ${status}</small>
    </button>`;
  }).join('')}</div><p class="hint">Estimativa considera rendimento de 10% ao ano sobre o aporte mensal.</p>`;
}

/* ================= BENS E DÍVIDAS ================= */
function renderWealth() {
  const nw = netWorth();
  let html = pageHead('Bens e dívidas', `<button class="icon-btn" data-act="newWealth" aria-label="Novo">${ic('plus')}</button>`, '', '#/mais');
  html += `<section class="card hero"><small>Patrimônio líquido</small><div class="hero-value ${moneyClass(nw.net)}">${brl(nw.net)}</div>
    <p class="hero-note">Investimentos ${brl(nw.financial)} + bens ${brl(nw.goods)} − dívidas ${brl(nw.debts)}</p></section>`;
  for (const [kind, title] of [['Ativo', 'Bens'], ['Passivo', 'Dívidas']]) {
    const list = DB.wealth.filter(w => w.kind === kind);
    if (list.length) html += section(title, `<div class="list">${list.map(w => `<button class="row" data-act="editWealth" data-id="${w.id}">${catDot(w.category)}<span class="row-main"><b>${esc(w.name)}</b><small>${esc(w.category)}</small></span><span class="row-amount ${kind === 'Passivo' ? 'neg' : ''}">${brl(w.value)}</span></button>`).join('')}</div>`);
  }
  if (!DB.wealth.length) html += emptyState('house', 'Nada cadastrado', 'Cadastre imóveis, veículos e financiamentos para ver seu patrimônio líquido.', `<button class="btn btn-primary" data-act="newWealth">${ic('plus')}Adicionar</button>`);
  return html;
}

/* ================= CATEGORIAS ================= */
function renderCategories() {
  let html = pageHead('Categorias', '', 'O app aprende a categoria de cada estabelecimento quando você corrige', '#/mais');
  for (const [kind, title] of [['despesa', 'Despesas'], ['receita', 'Receitas']]) {
    html += section(title, `<div class="card"><div class="chips wrap">${DB.categories[kind].map(c => `<span class="chip static">${catDot(c)}${esc(catLabel(c))}<button data-act="catRemove" data-kind="${kind}" data-v="${esc(c)}" aria-label="Remover">${ic('x')}</button></span>`).join('')}</div>
      <div class="add-line"><input id="newcat-${kind}" placeholder="Nova categoria"><button class="btn btn-soft" data-act="catAdd" data-kind="${kind}">${ic('plus')}Adicionar</button></div></div>`);
  }
  return html;
}
ACT.catAdd = el => {
  const input = $(`#newcat-${el.dataset.kind}`), name = input.value.trim(), list = DB.categories[el.dataset.kind];
  if (!name) return toast('Digite o nome da categoria.');
  if (list.some(c => plain(c) === plain(name))) return toast('Essa categoria já existe.');
  list.push(name); list.sort((a, b) => a.localeCompare(b, 'pt-BR')); save(); rerender(); toast('Categoria adicionada.');
};
ACT.catRemove = async el => {
  const { kind, v } = el.dataset;
  const used = (kind === 'receita' ? DB.incomes : [...DB.expenses, ...DB.purchases]).some(x => x.category === v);
  if (used) return toast('Essa categoria tem lançamentos e não pode ser removida.');
  if (!await confirmSheet({ title: `Remover "${catLabel(v)}"?`, ok: 'Remover', danger: true })) return;
  DB.categories[kind] = DB.categories[kind].filter(c => c !== v);
  delete DB.budgets[v];
  save(); rerender();
};

/* ================= AJUSTES ================= */
function renderSettings() {
  const size = new Blob([localStorage.getItem(STORE_KEY) || '']).size;
  let html = pageHead('Ajustes', '', '', '#/mais');
  html += section('Aparência', `<div class="card">${seg('setTheme', [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']], DB.settings.theme)}</div>`);
  html += section('Trazer dados do computador', `<div class="card stack-gap">
    <p class="muted">No FinFlow do PC, abra <b>Configurações → Levar dados para o app do celular</b>, envie o arquivo para você mesma e escolha-o aqui. Os dados deste celular são substituídos.</p>
    <label class="btn btn-primary file-btn">${ic('upload')}Importar arquivo do PC<input type="file" accept=".json,application/json" data-bind="importFile" hidden></label>
    ${DB.settings.importedAt ? `<small class="muted">Última importação: ${fmtDate(DB.settings.importedAt.slice(0, 10))}</small>` : ''}
  </div>`);
  html += section('Backup', `<div class="card stack-gap">
    <p class="muted">Seus dados ficam só neste aparelho. Faça backup com frequência e guarde o arquivo em local seguro.</p>
    <button class="btn btn-soft" data-act="exportBackup">${ic('download')}Exportar backup</button>
    <label class="btn btn-soft file-btn">${ic('upload')}Restaurar backup<input type="file" accept=".json,application/json" data-bind="importFile" hidden></label>
    <small class="muted">${DB.settings.lastBackup ? `Último backup: ${fmtDate(DB.settings.lastBackup.slice(0, 10))}` : 'Nenhum backup feito ainda.'} · ${num(size / 1024, 0)} KB usados</small>
  </div>`);
  html += section('Instalar no celular', `<div class="card"><p class="muted"><b>iPhone (Safari):</b> toque em Compartilhar → Adicionar à Tela de Início.<br><b>Android (Chrome):</b> menu ⋮ → Instalar app (ou Adicionar à tela inicial).</p></div>`);
  html += section('Zona de perigo', `<div class="card"><button class="btn btn-ghost danger-text" data-act="wipe">${ic('trash')}Apagar todos os dados deste aparelho</button></div>`);
  html += `<p class="hint center">FinFlow · app do celular · versão 1</p>`;
  return html;
}
ACT.setTheme = el => { DB.settings.theme = el.dataset.v; save(); applyTheme(); rerender(); };
ACT.exportBackup = () => { exportBackup(); toast('Backup exportado.'); rerender(); };
BIND.importFile = async el => {
  const file = el.files[0];
  el.value = '';
  if (!file) return;
  try {
    const parsed = await readBackupFile(file), d = parsed.data;
    const counts = `${(d.expenses || []).length} despesas, ${(d.incomes || []).length} receitas, ${(d.purchases || []).length} compras no cartão, ${(d.assets || []).length} investimentos`;
    const from = parsed.source === 'desktop' ? 'do FinFlow do PC' : 'de backup';
    const ok = await confirmSheet({ title: `Importar dados ${from}?`, text: `${counts}. Os dados atuais deste celular serão substituídos.`, ok: 'Importar' });
    if (!ok) return;
    applyImport(parsed);
    generateRecurring();
    toast('Dados importados.');
    go('#/');
  } catch (e) {
    toast(e.message || 'Não consegui ler o arquivo.');
  }
};
ACT.wipe = async () => {
  if (!await confirmSheet({ title: 'Apagar todos os dados?', text: 'Tudo o que está neste celular será apagado. Faça um backup antes.', ok: 'Apagar tudo', danger: true })) return;
  const theme = DB.settings.theme;
  DB = defaultDB(); DB.settings.theme = theme; save(); go('#/'); toast('Dados apagados.');
};
