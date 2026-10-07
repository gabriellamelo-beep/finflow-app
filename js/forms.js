'use strict';
/* Folhas de cadastro e edição. */

const ACT = {};   // cliques: data-act
const BIND = {};  // mudanças confirmadas: data-bind (change)
const LIVE = {};  // digitação: data-live (input)

const sheetOf = el => el.closest('.sheet-wrap');
const field = (label, input, hint = '') => `<label class="field"><span>${label}</span>${input}${hint ? `<small>${hint}</small>` : ''}</label>`;
const moneyField = (name, value, label = 'Valor', attrs = '') => field(label, `<div class="money"><span>R$</span><input name="${name}" inputmode="decimal" placeholder="0,00" value="${moneyInput(value)}" ${attrs}></div>`);
const categorySelect = (kind, selected) => `<select name="category" data-bind="catTouched">${options(DB.categories[kind], selected, catLabel)}</select>`;

function afterSave(message, category) {
  save();
  closeAllSheets();
  rerender();
  const alert = category ? budgetAlert(category) : '';
  toast(alert || message, alert ? 'warn' : '');
}

/* ================= LANÇAMENTO RÁPIDO ================= */
const QA_KINDS = [['despesa', 'Despesa'], ['receita', 'Receita'], ['cartao', 'Cartão']];

function quickAddHtml(kind, v = {}) {
  const catKind = kind === 'receita' ? 'receita' : 'despesa';
  const cats = DB.categories[catKind];
  const category = v.category && cats.includes(v.category) ? v.category : (cats.includes('Outros') ? 'Outros' : cats[0]);
  let extra = '';
  if (kind === 'despesa') {
    extra = field('Pagamento', `<div class="chips">${PAYMENTS.map(p => `<label class="chip-radio"><input type="radio" name="payment" value="${p}" ${p === (v.payment || 'PIX') ? 'checked' : ''}><span>${p}</span></label>`).join('')}</div>`);
  } else if (kind === 'cartao') {
    if (!DB.cards.length) return `${seg('qaKind', QA_KINDS, kind)}${emptyState('card', 'Nenhum cartão', 'Cadastre um cartão para lançar compras.', `<button class="btn btn-primary" data-act="newCard">${ic('plus')}Cadastrar cartão</button>`)}`;
    const cardId = v.cardId || DB.ui.lastCard || DB.cards[0].id;
    extra = field('Cartão', `<select name="cardId" data-live="qaPreview">${DB.cards.map(c => `<option value="${c.id}" ${c.id === cardId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`)
      + field('Parcelas', `<div class="count-row"><input name="count" type="number" min="1" max="48" value="${v.count || 1}" inputmode="numeric" data-live="qaPreview">${[1, 2, 3, 6, 10, 12].map(n => `<button type="button" class="chip" data-act="qaCount" data-v="${n}">${n}x</button>`).join('')}</div>`)
      + `<p class="preview" id="qa-preview"></p>`;
  }
  return `${seg('qaKind', QA_KINDS, kind)}
    <form class="form" data-kind="${kind}" onsubmit="return false">
      <div class="amount-big"><span>R$</span><input name="amount" inputmode="decimal" placeholder="0,00" value="${moneyInput(v.amount)}" autofocus data-live="qaPreview"></div>
      ${field('Descrição', `<input name="description" value="${esc(v.description || '')}" placeholder="${kind === 'receita' ? 'Ex.: Salário, atendimento' : 'Ex.: Mercado, Uber, farmácia'}" autocomplete="off" data-live="descSuggest">`)}
      ${field('Categoria', categorySelect(catKind, category))}
      ${field(kind === 'cartao' ? 'Data da compra' : 'Data', `<input name="date" type="date" value="${v.date || today()}" data-live="qaPreview">`)}
      ${extra}
      <button class="btn btn-primary btn-xl" data-act="qaSave">${ic('check')}Salvar</button>
    </form>`;
}

function openQuickAdd(kind = 'despesa', preset = {}) {
  const w = openSheet(quickAddHtml(kind, preset), { cls: 'sheet-form' });
  updateQaPreview(w);
}
ACT.quickAdd = el => openQuickAdd(el.dataset.v || 'despesa');
ACT.qaKind = el => {
  const w = sheetOf(el), v = formValues(w);
  v.amount = parseMoney(v.amount);
  const body = $('.sheet-body', w);
  body.innerHTML = quickAddHtml(el.dataset.v, v);
  updateQaPreview(w);
};
ACT.qaCount = el => { const w = sheetOf(el); $('[name=count]', w).value = el.dataset.v; updateQaPreview(w); };
BIND.catTouched = el => { el.dataset.touched = '1'; };
LIVE.descSuggest = el => {
  const w = sheetOf(el), select = $('[name=category]', w);
  if (!select || select.dataset.touched) return;
  const kind = $('form', w)?.dataset.kind === 'receita' ? 'receita' : 'despesa';
  const cat = suggestCategory(el.value, kind);
  if (cat) select.value = cat;
};
LIVE.qaPreview = el => updateQaPreview(sheetOf(el));
function updateQaPreview(w) {
  const out = $('#qa-preview', w);
  if (!out) return;
  const v = formValues(w), card = cardById(v.cardId), amount = parseMoney(v.amount), count = Math.max(1, +v.count || 1);
  if (!card || !v.date) { out.textContent = ''; return; }
  const first = firstInvoiceMonth(v.date, card);
  out.innerHTML = `${count > 1 ? `${count}x de <b>${brl(amount / count)}</b> · ` : ''}1ª fatura <b>${monthShort(first)}</b>${count > 1 ? ` · última ${monthShort(addMonths(first, count - 1))}` : ''}`;
}

ACT.qaSave = el => {
  const w = sheetOf(el), form = $('form', w), kind = form.dataset.kind, v = formValues(w);
  const amount = round2(parseMoney(v.amount));
  if (!(amount > 0)) { toast('Informe um valor maior que zero.'); $('[name=amount]', w).focus(); return; }
  if (!v.date) { toast('Informe a data.'); return; }
  const touched = $('[name=category]', w).dataset.touched;
  if (touched && v.description) learnCategory(v.description, v.category);
  if (kind === 'receita') {
    DB.incomes.push({ id: uid(), date: v.date, category: v.category, description: v.description, amount });
    afterSave(`Receita salva: ${brl(amount)}`);
  } else if (kind === 'despesa') {
    DB.expenses.push({ id: uid(), date: v.date, category: v.category, description: v.description, amount, payment: v.payment || 'PIX' });
    afterSave(`Despesa salva: ${brl(amount)}`, v.category);
  } else {
    if (!v.description) { toast('Informe a descrição da compra.'); return; }
    const p = addPurchase({ cardId: v.cardId, date: v.date, description: v.description, category: v.category, total: amount, count: Math.max(1, +v.count || 1) });
    DB.ui.lastCard = v.cardId;
    afterSave(`Compra salva · 1ª fatura ${monthShort(p.firstInvoice)}`, v.category);
  }
};

/* ================= EDITAR RECEITA / DESPESA ================= */
function openEntry(type, id) {
  const list = type === 'income' ? DB.incomes : DB.expenses;
  const e = list.find(x => x.id === id);
  if (!e) return;
  const kind = type === 'income' ? 'receita' : 'despesa';
  openSheet(`<h3 class="sheet-title">${type === 'income' ? 'Receita' : 'Despesa'}</h3>
    <form class="form" data-kind="${kind}" onsubmit="return false">
      ${moneyField('amount', e.amount)}
      ${field('Descrição', `<input name="description" value="${esc(e.description || '')}" autocomplete="off">`)}
      ${field('Categoria', categorySelect(kind, e.category))}
      ${field('Data', `<input name="date" type="date" value="${e.date}">`)}
      ${type === 'expense' ? field('Pagamento', `<select name="payment">${options([...new Set([...PAYMENTS, e.payment || 'PIX'])], e.payment || 'PIX')}</select>`) : ''}
      ${e.recurringId ? `<p class="hint">${ic('repeat')}Lançada automaticamente por uma recorrência.</p>` : ''}
      <div class="sheet-actions">
        <button class="btn btn-ghost danger-text" data-act="entryDelete" data-type="${type}" data-id="${id}">${ic('trash')}Excluir</button>
        <button class="btn btn-primary" data-act="entrySave" data-type="${type}" data-id="${id}">${ic('check')}Salvar</button>
      </div>
    </form>`, { cls: 'sheet-form' });
}
ACT.openEntry = el => {
  if (el.dataset.type === 'card') return openPurchase(el.dataset.id);
  openEntry(el.dataset.type, el.dataset.id);
};
ACT.entrySave = el => {
  const list = el.dataset.type === 'income' ? DB.incomes : DB.expenses;
  const e = list.find(x => x.id === el.dataset.id), v = formValues(sheetOf(el));
  const amount = round2(parseMoney(v.amount));
  if (!(amount > 0)) return toast('Informe um valor maior que zero.');
  if (v.category !== e.category) learnCategory(v.description || e.description, v.category);
  Object.assign(e, { amount, description: v.description, category: v.category, date: v.date });
  if (v.payment) e.payment = v.payment;
  afterSave('Lançamento atualizado.', el.dataset.type === 'expense' ? v.category : '');
};
ACT.entryDelete = async el => {
  if (!await confirmSheet({ title: 'Excluir lançamento?', text: 'Esta ação não pode ser desfeita.', ok: 'Excluir', danger: true })) return;
  const key = el.dataset.type === 'income' ? 'incomes' : 'expenses';
  DB[key] = DB[key].filter(x => x.id !== el.dataset.id);
  afterSave('Lançamento excluído.');
};

/* ================= COMPRA NO CARTÃO ================= */
function openPurchase(id) {
  const p = DB.purchases.find(x => x.id === id);
  if (!p) return;
  const card = cardById(p.cardId);
  const schedule = installmentsOf(p);
  openSheet(`<h3 class="sheet-title">Compra no cartão</h3>
    <p class="muted">${esc(card?.name || '')} · ${p.count > 1 ? `${p.count}x de ${brl(schedule[0]?.amount)}` : 'à vista'} · faturas ${monthShort(schedule[0].month)}${schedule.length > 1 ? ` a ${monthShort(schedule[schedule.length - 1].month)}` : ''}</p>
    <form class="form" data-kind="despesa" onsubmit="return false">
      ${field('Descrição', `<input name="description" value="${esc(p.description)}" autocomplete="off">`)}
      ${field('Categoria', categorySelect('despesa', p.category))}
      ${moneyField('total', p.total, 'Valor total da compra')}
      ${field('Parcelas', `<input name="count" type="number" min="1" max="48" inputmode="numeric" value="${p.count}">`, p.startNumber > 1 ? `Importada a partir da parcela ${p.startNumber}.` : '')}
      <div class="sheet-actions">
        <button class="btn btn-ghost danger-text" data-act="purchaseDelete" data-id="${id}">${ic('trash')}Excluir</button>
        <button class="btn btn-primary" data-act="purchaseSave" data-id="${id}">${ic('check')}Salvar</button>
      </div>
    </form>`, { cls: 'sheet-form' });
}
ACT.purchaseSave = el => {
  const p = DB.purchases.find(x => x.id === el.dataset.id), v = formValues(sheetOf(el));
  const total = round2(parseMoney(v.total)), count = Math.max(+v.count || 1, p.startNumber || 1);
  if (!(total > 0)) return toast('Informe o valor total.');
  if (v.category !== p.category) learnCategory(v.description, v.category);
  Object.assign(p, { description: v.description, category: v.category, total, count });
  afterSave('Compra atualizada.', v.category);
};
ACT.purchaseDelete = async el => {
  if (!await confirmSheet({ title: 'Excluir compra?', text: 'Todas as parcelas saem das faturas.', ok: 'Excluir', danger: true })) return;
  DB.purchases = DB.purchases.filter(x => x.id !== el.dataset.id);
  afterSave('Compra excluída.');
};

/* ================= CARTÃO ================= */
function openCard(id) {
  const c = id ? cardById(id) : { name: '', limit: 0, closingDay: 25, dueDay: 5 };
  openSheet(`<h3 class="sheet-title">${id ? 'Editar cartão' : 'Novo cartão'}</h3>
    <form class="form" onsubmit="return false">
      ${field('Nome', `<input name="name" value="${esc(c.name)}" placeholder="Ex.: Nubank, C6, Inter" ${id ? '' : 'autofocus'}>`)}
      ${moneyField('limit', c.limit, 'Limite')}
      <div class="row2">
        ${field('Dia do fechamento', `<input name="closingDay" type="number" min="1" max="31" inputmode="numeric" value="${c.closingDay}">`)}
        ${field('Dia do vencimento', `<input name="dueDay" type="number" min="1" max="31" inputmode="numeric" value="${c.dueDay}">`)}
      </div>
      <div class="sheet-actions">
        ${id ? `<button class="btn btn-ghost danger-text" data-act="cardDelete" data-id="${id}">${ic('trash')}Excluir</button>` : ''}
        <button class="btn btn-primary" data-act="cardSave" data-id="${id || ''}">${ic('check')}Salvar</button>
      </div>
    </form>`, { cls: 'sheet-form' });
}
ACT.newCard = () => openCard();
ACT.editCard = el => openCard(el.dataset.id);
ACT.cardSave = el => {
  const v = formValues(sheetOf(el));
  if (!v.name) return toast('Informe o nome do cartão.');
  const data = { name: v.name, limit: parseMoney(v.limit), closingDay: Math.min(31, Math.max(1, +v.closingDay || 1)), dueDay: Math.min(31, Math.max(1, +v.dueDay || 1)) };
  if (el.dataset.id) Object.assign(cardById(el.dataset.id), data);
  else { const c = { id: uid(), ...data }; DB.cards.push(c); DB.ui.card = c.id; }
  afterSave('Cartão salvo.');
};
ACT.cardDelete = async el => {
  const n = DB.purchases.filter(p => p.cardId === el.dataset.id).length;
  if (!await confirmSheet({ title: 'Excluir cartão?', text: n ? `As ${n} compras deste cartão também serão apagadas.` : 'Esta ação não pode ser desfeita.', ok: 'Excluir', danger: true })) return;
  DB.cards = DB.cards.filter(c => c.id !== el.dataset.id);
  DB.purchases = DB.purchases.filter(p => p.cardId !== el.dataset.id);
  afterSave('Cartão excluído.');
};
ACT.togglePaid = el => {
  const k = invoiceKey(el.dataset.card, el.dataset.month);
  if (DB.paidInvoices[k]) delete DB.paidInvoices[k]; else DB.paidInvoices[k] = true;
  save(); rerender();
  toast(DB.paidInvoices[k] ? `Fatura ${monthShort(el.dataset.month)} marcada como paga.` : 'Fatura reaberta.');
};

/* ================= ORÇAMENTO ================= */
function openBudget() {
  const cats = DB.categories.despesa;
  openSheet(`<h3 class="sheet-title">Limites por categoria</h3>
    <p class="muted">Limite mensal. Deixe vazio para não acompanhar a categoria.</p>
    <form class="form budget-form" onsubmit="return false">
      ${cats.map(c => `<label class="budget-line">${catDot(c)}<span>${esc(catLabel(c))}</span><div class="money small"><span>R$</span><input name="b:${esc(c)}" inputmode="decimal" placeholder="—" value="${moneyInput(DB.budgets[c])}"></div></label>`).join('')}
      <button class="btn btn-primary btn-xl" data-act="budgetSave">${ic('check')}Salvar orçamento</button>
    </form>`, { cls: 'sheet-form' });
}
ACT.editBudget = () => openBudget();
ACT.budgetSave = el => {
  const v = formValues(sheetOf(el));
  DB.budgets = {};
  Object.entries(v).forEach(([k, val]) => { const amount = parseMoney(val); if (k.startsWith('b:') && amount > 0) DB.budgets[k.slice(2)] = amount; });
  afterSave('Orçamento salvo.');
};

/* ================= RECORRENTES ================= */
function openRecurring(id) {
  const r = id ? DB.recurring.find(x => x.id === id) : { kind: 'Despesa', description: '', category: '', amount: 0, day: 5, payment: 'PIX', start: curMonth(), end: null, active: true };
  const kind = r.kind === 'Receita' ? 'receita' : 'despesa';
  openSheet(`<h3 class="sheet-title">${id ? 'Editar recorrência' : 'Nova recorrência'}</h3>
    <form class="form" data-kind="${kind}" onsubmit="return false">
      ${id ? '' : seg('recKind', [['Despesa', 'Despesa'], ['Receita', 'Receita']], r.kind)}
      <input type="hidden" name="kind" value="${r.kind}">
      ${field('Descrição', `<input name="description" value="${esc(r.description)}" placeholder="Ex.: Salário, Condomínio, Netflix" data-live="descSuggest">`)}
      ${field('Categoria', categorySelect(kind, r.category))}
      <div class="row2">${moneyField('amount', r.amount)}${field('Dia do mês', `<input name="day" type="number" min="1" max="31" inputmode="numeric" value="${r.day}">`)}</div>
      <div class="row2">
        ${field('Começa em', `<input name="start" type="month" value="${r.start}">`)}
        ${field('Termina em', `<input name="end" type="month" value="${r.end || ''}">`, 'Opcional')}
      </div>
      ${id ? '' : `<label class="check"><input type="checkbox" name="skip"> Já lancei a deste mês (não lançar de novo)</label>`}
      <div class="sheet-actions">
        ${id ? `<button class="btn btn-ghost danger-text" data-act="recDelete" data-id="${id}">${ic('trash')}Excluir</button>` : ''}
        <button class="btn btn-primary" data-act="recSave" data-id="${id || ''}">${ic('check')}Salvar</button>
      </div>
    </form>`, { cls: 'sheet-form' });
}
ACT.newRecurring = () => openRecurring();
ACT.editRecurring = el => openRecurring(el.dataset.id);
ACT.recKind = el => {
  const w = sheetOf(el), form = $('form', w), kind = el.dataset.v === 'Receita' ? 'receita' : 'despesa';
  $$('.seg button', w).forEach(b => b.classList.toggle('on', b === el));
  $('[name=kind]', w).value = el.dataset.v;
  form.dataset.kind = kind;
  $('[name=category]', w).outerHTML = categorySelect(kind, '');
};
ACT.recSave = el => {
  const v = formValues(sheetOf(el)), amount = round2(parseMoney(v.amount));
  if (!v.description || !(amount > 0)) return toast('Informe descrição e valor.');
  const data = { kind: v.kind, description: v.description, category: v.category, amount, day: Math.min(31, Math.max(1, +v.day || 1)), start: v.start || curMonth(), end: v.end || null };
  if (el.dataset.id) Object.assign(DB.recurring.find(x => x.id === el.dataset.id), data);
  else {
    const r = { id: uid(), ...data, payment: 'PIX', active: true, lastGenerated: null };
    if (v.skip && r.start <= curMonth()) r.lastGenerated = curMonth();
    DB.recurring.push(r);
  }
  const created = generateRecurring();
  afterSave(created ? `Recorrência salva · ${created} lançamento(s) feitos` : 'Recorrência salva.');
};
ACT.recToggle = el => {
  const r = DB.recurring.find(x => x.id === el.dataset.id);
  r.active = !r.active; save(); rerender();
  toast(r.active ? 'Recorrência reativada.' : 'Recorrência pausada.');
};
ACT.recDelete = async el => {
  if (!await confirmSheet({ title: 'Excluir recorrência?', text: 'Os lançamentos já feitos continuam.', ok: 'Excluir', danger: true })) return;
  DB.recurring = DB.recurring.filter(x => x.id !== el.dataset.id);
  afterSave('Recorrência excluída.');
};

/* ================= INVESTIMENTOS ================= */
function openAsset(id) {
  const a = id ? DB.assets.find(x => x.id === id) : null;
  if (!a) {
    openSheet(`<h3 class="sheet-title">Novo investimento</h3>
      <form class="form" onsubmit="return false">
        ${field('Nome', `<input name="name" placeholder="Ex.: CDB Banco X, Tesouro Selic, PETR4" autofocus>`)}
        ${field('Tipo', `<select name="category">${options(Object.keys(ASSET_CATEGORY_LABELS), 'CDB', x => ASSET_CATEGORY_LABELS[x])}</select>`)}
        ${field('Instituição', `<input name="institution" placeholder="Opcional">`)}
        <div class="row2">${moneyField('invested', 0, 'Valor aplicado')}${moneyField('current', 0, 'Saldo atual')}</div>
        ${field('Data da aplicação', `<input name="startDate" type="date" value="${today()}">`)}
        <button class="btn btn-primary btn-xl" data-act="assetCreate">${ic('check')}Cadastrar</button>
      </form>`, { cls: 'sheet-form' });
    return;
  }
  const row = assetRows().find(x => x.id === id);
  openSheet(`<h3 class="sheet-title">${esc(a.name)}</h3>
    <p class="muted">${esc(ASSET_CATEGORY_LABELS[a.category] || a.category)}${a.institution ? ` · ${esc(a.institution)}` : ''} · atualizado em ${fmtDate(a.lastUpdate)}</p>
    <div class="kpi-row">
      <div><small>Aplicado</small><b>${brl(a.invested)}</b></div>
      <div><small>Saldo</small><b>${brl(a.current)}</b></div>
      <div><small>Resultado</small><b class="${moneyClass(row.profit)}">${pct(row.profitPct, 1, true)}</b></div>
    </div>
    <form class="form" onsubmit="return false">
      <div class="update-line">${moneyField('current', a.current, 'Saldo atual (atualizar)')}<button class="btn btn-soft" data-act="assetUpdate" data-id="${id}">${ic('check')}Atualizar</button></div>
    </form>
    <h4 class="sub-title">Aporte ou resgate</h4>
    <form class="form" onsubmit="return false">
      ${seg('mvKind', [['Aporte', 'Aporte'], ['Resgate', 'Resgate']], 'Aporte')}
      <input type="hidden" name="kind" value="Aporte">
      <div class="row2">${moneyField('amount', 0)}${field('Data', `<input name="date" type="date" value="${today()}">`)}</div>
      ${a.ticker ? field('Quantidade (cotas)', `<input name="quantity" inputmode="decimal" placeholder="Ex.: 10">`, 'Necessária para a cotação automática continuar certa.') : ''}
      <button class="btn btn-primary" data-act="assetMove" data-id="${id}">${ic('swap')}Registrar</button>
    </form>
    <div class="sheet-actions">
      <button class="btn btn-ghost danger-text" data-act="assetDelete" data-id="${id}">${ic('trash')}Excluir</button>
      <button class="btn btn-ghost" data-act="assetEdit" data-id="${id}">${ic('edit')}Editar dados</button>
    </div>`, { cls: 'sheet-form' });
}

function openAssetEdit(id) {
  const a = DB.assets.find(x => x.id === id);
  openSheet(`<h3 class="sheet-title">Editar investimento</h3>
    <form class="form" onsubmit="return false">
      ${field('Nome', `<input name="name" value="${esc(a.name)}">`)}
      <div class="row2">
        ${field('Tipo', `<select name="category">${options([...new Set([...Object.keys(ASSET_CATEGORY_LABELS), a.category])], a.category, x => ASSET_CATEGORY_LABELS[x] || x)}</select>`)}
        ${field('Instituição', `<input name="institution" value="${esc(a.institution || '')}">`)}
      </div>
      <h4 class="sub-title">Atualização automática</h4>
      ${field('% do CDI', `<input name="cdiPercent" inputmode="decimal" value="${a.cdiPercent ? num(a.cdiPercent, 0) : ''}" placeholder="Ex.: 100 ou 110">`, 'Renda fixa (CDB, LCI, reserva). O rendimento passa a contar a partir de hoje.')}
      <div class="row2">
        ${field('Ticker', `<input name="ticker" value="${esc(a.ticker || '')}" placeholder="PETR4, IVVB11, bitcoin" autocapitalize="off">`)}
        ${field('Quantidade', `<input name="quantity" inputmode="decimal" value="${a.quantity ? String(a.quantity).replace('.', ',') : ''}">`)}
      </div>
      <p class="hint">Ações, FIIs e ETFs: código da B3. Cripto: nome no CoinGecko (bitcoin, ethereum). O saldo vira cotação × quantidade.</p>
      <button class="btn btn-primary btn-xl" data-act="assetEditSave" data-id="${id}">${ic('check')}Salvar</button>
    </form>`, { cls: 'sheet-form' });
}
ACT.assetEdit = el => { closeAllSheets(); setTimeout(() => openAssetEdit(el.dataset.id), 250); };
ACT.assetEditSave = el => {
  const a = DB.assets.find(x => x.id === el.dataset.id), v = formValues(sheetOf(el));
  if (!v.name) return toast('Informe o nome.');
  const cdi = parseMoney(v.cdiPercent);
  if (cdi !== (a.cdiPercent || 0)) a.lastUpdate = today();
  Object.assign(a, { name: v.name, category: v.category, institution: v.institution, cdiPercent: cdi, ticker: v.ticker.trim(), quantity: parseMoney(v.quantity) || a.quantity || 1 });
  afterSave('Investimento atualizado.');
};
ACT.newAsset = () => openAsset();
ACT.openAsset = el => openAsset(el.dataset.id);
ACT.mvKind = el => {
  const form = el.closest('form');
  $$('.seg button', form).forEach(b => b.classList.toggle('on', b === el));
  $('[name=kind]', form).value = el.dataset.v;
};
ACT.assetCreate = el => {
  const v = formValues(sheetOf(el)), invested = parseMoney(v.invested), current = parseMoney(v.current) || invested;
  if (!v.name) return toast('Informe o nome.');
  const a = { id: uid(), name: v.name, category: v.category, institution: v.institution, ticker: '', quantity: 1, invested, current, cdiPercent: 0, startDate: v.startDate || today(), lastUpdate: today(), monthStart: 0, monthStartDate: curMonth() };
  // Aplicado em mês anterior: a base do mês é o saldo atual; neste mês, o aporte inicial conta como aporte.
  if (monthOf(a.startDate) < curMonth()) a.monthStart = current;
  DB.assets.push(a);
  if (invested > 0) DB.assetTx.push({ id: uid(), assetId: a.id, date: a.startDate, kind: 'Aporte', amount: invested, quantity: 0, notes: 'Aporte inicial' });
  afterSave('Investimento cadastrado.');
};
ACT.assetUpdate = el => {
  const a = DB.assets.find(x => x.id === el.dataset.id), current = parseMoney(formValues(el.closest('form')).current);
  a.current = current; a.lastUpdate = today();
  afterSave(`${a.name} atualizado.`);
};
ACT.assetMove = el => {
  const a = DB.assets.find(x => x.id === el.dataset.id), v = formValues(el.closest('form'));
  const err = recordMovement(a, v.kind, v.date || today(), parseMoney(v.amount), parseMoney(v.quantity));
  if (err) return toast(err);
  afterSave(`${v.kind} registrado.`);
};
ACT.assetDelete = async el => {
  if (!await confirmSheet({ title: 'Excluir investimento?', text: 'O histórico de aportes dele também sai.', ok: 'Excluir', danger: true })) return;
  DB.assets = DB.assets.filter(x => x.id !== el.dataset.id);
  DB.assetTx = DB.assetTx.filter(x => x.assetId !== el.dataset.id);
  afterSave('Investimento excluído.');
};

/* ================= METAS ================= */
function openGoal(id) {
  const g = id ? DB.goals.find(x => x.id === id) : { name: '', target: 0, current: 0, deadline: `${new Date().getFullYear() + 1}-12-31`, monthly: 0 };
  openSheet(`<h3 class="sheet-title">${id ? 'Editar meta' : 'Nova meta'}</h3>
    <form class="form" onsubmit="return false">
      ${field('Nome', `<input name="name" value="${esc(g.name)}" placeholder="Ex.: Viagem, reserva, carro">`)}
      <div class="row2">${moneyField('target', g.target, 'Valor alvo')}${moneyField('current', g.current, 'Já guardado')}</div>
      <div class="row2">${moneyField('monthly', g.monthly, 'Aporte por mês')}${field('Prazo', `<input name="deadline" type="date" value="${g.deadline}">`)}</div>
      <div class="sheet-actions">
        ${id ? `<button class="btn btn-ghost danger-text" data-act="goalDelete" data-id="${id}">${ic('trash')}Excluir</button>` : ''}
        <button class="btn btn-primary" data-act="goalSave" data-id="${id || ''}">${ic('check')}Salvar</button>
      </div>
    </form>`, { cls: 'sheet-form' });
}
ACT.newGoal = () => openGoal();
ACT.editGoal = el => openGoal(el.dataset.id);
ACT.goalSave = el => {
  const v = formValues(sheetOf(el));
  if (!v.name) return toast('Informe o nome da meta.');
  const data = { name: v.name, target: parseMoney(v.target), current: parseMoney(v.current), monthly: parseMoney(v.monthly), deadline: v.deadline };
  if (el.dataset.id) Object.assign(DB.goals.find(x => x.id === el.dataset.id), data);
  else DB.goals.push({ id: uid(), ...data });
  afterSave('Meta salva.');
};
ACT.goalDelete = async el => {
  if (!await confirmSheet({ title: 'Excluir meta?', ok: 'Excluir', danger: true })) return;
  DB.goals = DB.goals.filter(x => x.id !== el.dataset.id);
  afterSave('Meta excluída.');
};

/* ================= BENS E DÍVIDAS ================= */
function openWealth(id) {
  const w = id ? DB.wealth.find(x => x.id === id) : { name: '', kind: 'Ativo', category: '', value: 0 };
  openSheet(`<h3 class="sheet-title">${id ? 'Editar' : 'Novo bem ou dívida'}</h3>
    <form class="form" onsubmit="return false">
      ${seg('wKind', [['Ativo', 'Bem'], ['Passivo', 'Dívida']], w.kind)}
      <input type="hidden" name="kind" value="${w.kind}">
      ${field('Nome', `<input name="name" value="${esc(w.name)}" placeholder="Ex.: Apartamento, carro, financiamento">`)}
      ${field('Categoria', `<input name="category" value="${esc(w.category)}" placeholder="Ex.: Imóveis, Veículos">`)}
      ${moneyField('value', w.value)}
      <div class="sheet-actions">
        ${id ? `<button class="btn btn-ghost danger-text" data-act="wealthDelete" data-id="${id}">${ic('trash')}Excluir</button>` : ''}
        <button class="btn btn-primary" data-act="wealthSave" data-id="${id || ''}">${ic('check')}Salvar</button>
      </div>
    </form>`, { cls: 'sheet-form' });
}
ACT.wKind = el => {
  const form = el.closest('form');
  $$('.seg button', form).forEach(b => b.classList.toggle('on', b === el));
  $('[name=kind]', form).value = el.dataset.v;
};
ACT.newWealth = () => openWealth();
ACT.editWealth = el => openWealth(el.dataset.id);
ACT.wealthSave = el => {
  const v = formValues(sheetOf(el));
  if (!v.name) return toast('Informe o nome.');
  const data = { name: v.name, kind: v.kind, category: v.category || (v.kind === 'Ativo' ? 'Bens' : 'Dívidas'), value: parseMoney(v.value), date: today() };
  if (el.dataset.id) Object.assign(DB.wealth.find(x => x.id === el.dataset.id), data);
  else DB.wealth.push({ id: uid(), ...data });
  afterSave('Salvo.');
};
ACT.wealthDelete = async el => {
  if (!await confirmSheet({ title: 'Excluir item?', ok: 'Excluir', danger: true })) return;
  DB.wealth = DB.wealth.filter(x => x.id !== el.dataset.id);
  afterSave('Item excluído.');
};
