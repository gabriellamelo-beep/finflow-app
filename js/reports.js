'use strict';
/* Telas Financiamento, Ações e Imposto: mostram os relatórios que o FinFlow do PC grava no arquivo do Drive
   (campo "reports"). As contas (Price + TR, preço médio, IR) ficam só no PC; aqui é leitura. */

const REPORTS_KEY = 'finflow.reports';
function loadReports() { try { return JSON.parse(localStorage.getItem(REPORTS_KEY)) || null; } catch (e) { return null; } }
function saveReports(reports) { try { localStorage.setItem(REPORTS_KEY, JSON.stringify(reports)); } catch (e) { } }

const signedBrl = v => `${v > 0 ? '+' : ''}${brl(v)}`;
const pp = (v, d = 2) => `${v > 0 ? '+' : ''}${num(v, d)} p.p.`;
const qtyTxt = v => (+v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 6 });
const effective = monthly => ((1 + monthly / 100) ** 12 - 1) * 100;

function reportsNote(r) {
  if (!r) return '';
  const d = new Date(r.generatedAt);
  return `Calculado no PC em ${fmtDate(isoDate(d))} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function noReports(title, back = '#/mais') {
  return pageHead(title, '', '', back) + emptyState('cloud', 'Ainda sem dados do PC',
    'Esta tela mostra o que o FinFlow do computador calcula. Abra o FinFlow no PC e depois sincronize aqui (Ajustes › Sincronizar agora).',
    `<button class="btn btn-primary" data-act="driveNow">${ic('refresh')}Sincronizar agora</button>`);
}
const rTable = (head, rows, foot = '') => `<div class="r-table"><table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody>${foot}</table></div>`;

/* ================= FINANCIAMENTO ================= */
function renderFinancing(arg) {
  const r = loadReports(), list = r?.financings || [];
  if (!list.length) return noReports('Financiamento');
  const f = list[Math.min(+arg || 0, list.length - 1)], c = f.contract, t = f.totals, p = f.projection_summary, rows = f.rows || [];
  const first = rows[0], months = rows.length;
  const change = first ? c.balance - first.balance_before : 0;
  const avgCost = months ? sum(rows, x => x.cost_pct) / months : 0;
  const real = rows.filter(x => x.real_cost_pct != null);
  const avgReal = real.length ? sum(real, x => x.real_cost_pct) / real.length : null;
  const cut = c.term_months ? c.term_months - c.last_number - c.remaining : 0;
  let html = pageHead(c.name && c.name !== 'Financiamento' ? `Financiamento: ${esc(c.name)}` : 'Financiamento', '', reportsNote(r), '#/mais');
  if (list.length > 1) html += `<div class="chips scroll">${list.map((x, i) => `<a class="chip ${x === f ? 'on' : ''}" href="#/financiamento/${i}">${esc(x.contract.name)}</a>`).join('')}</div>`;
  html += `<section class="card hero"><small>Saldo devedor</small><div class="hero-value">${brl(c.balance)}</div>
    <p class="hero-note">${esc(c.institution || '')} · Price · ${num(c.effective_rate, 2)}% a.a.${c.indexer === 'TR' ? ' + TR' : ''} · ${c.last_number} pagas, faltam ${c.remaining} (até ${monthName(c.end_month.slice(0, 7))})${cut > 0 ? ` · ${cut} parcelas cortadas por amortizações` : ''}</p>
    ${c.financed_amount ? `<p class="hero-note">${signedBrl(c.balance - c.financed_amount)} ${c.balance > c.financed_amount ? 'acima' : 'abaixo'} do financiado (${brl(c.financed_amount)})</p>` : ''}</section>`;
  if (f.next) html += section(`Próxima prestação · ${f.next.number}ª em ${fmtDate(f.next.due)}`, `<div class="card"><div class="r-big">${brl(f.next.total)}</div>
    <div class="r-split">${[['Juros', f.next.interest, 'neg'], ['Amortização', f.next.amortization, 'pos'], ['Seguro e taxa', f.next.insurance + f.next.admin_fee, ''], ['TR soma ao saldo', f.next.correction, 'neg']]
      .map(([l, v, cls]) => `<div><small>${l}</small><b class="${cls}">${brl(v)}</b></div>`).join('')}</div>
    <p class="hint">${num(f.next.interest / f.next.total * 100, 1)}% da prestação é juros.${f.next.estimated ? ' A TR do mês ainda não saiu.' : ''}</p></div>`);
  html += `<div class="summary-row r-four">${kpi(`Pago em ${months}`, brl(t.total))}${kpi('Juros', brl(t.interest), `${num(t.total ? t.interest / t.total * 100 : 0, 0)}% do pago`, 'neg')}
    ${kpi('TR somou', brl(t.correction), '', 'neg')}${kpi('Amortizou', brl(t.amortization), `saldo ${change > 0 ? 'subiu' : 'caiu'} ${brl(Math.abs(change))}`, 'pos')}</div>`;
  const points = [...rows.map(x => ({ label: monthShort(x.due.slice(0, 7)), v: x.balance_after })), ...(f.projection || []).map(x => ({ label: x.due.slice(0, 4), v: x.balance }))];
  html += section('Saldo devedor: pagas e até quitar', `<div class="card">${lineChart(points, { label: 'Saldo' })}
    <p class="hint">Meses pagos e, depois, um ponto por ano até quitar, com a TR em ${num(f.average_tr_pct, 4)}% ao mês. ${p.turning_point ? `O saldo passa a cair de verdade em ${monthName(p.turning_point.slice(0, 7))}.` : ''}</p></div>`);
  html += section('Custo do dinheiro', `<div class="card"><div class="r-split">
    <div><small>Custo médio (juros + TR)</small><b>${num(avgCost, 3)}% a.m.</b><span class="muted">${num(effective(avgCost), 2)}% a.a.</span></div>
    ${avgReal != null ? `<div><small>Custo real (acima do IPCA)</small><b>${num(avgReal, 3)}% a.m.</b><span class="muted">${num(effective(avgReal), 2)}% a.a.</span></div>` : ''}</div></div>`);
  html += section('Até quitar', `<div class="card"><div class="r-split">
    <div><small>Ainda vai pagar</small><b>${brl(p.paid)}</b></div><div><small>Juros</small><b class="neg">${brl(p.interest)}</b></div>
    <div><small>Correção pela TR</small><b class="neg">${brl(p.correction)}</b></div><div><small>Termina</small><b>${p.end ? monthName(p.end.slice(0, 7)) : '—'}</b></div></div></div>`);
  const sim = f.simulation;
  if (sim) {
    const cdi = sim.cdi || {};
    html += section('Se amortizar R$ 10 mil agora', `<div class="card"><div class="r-split">
      <div><small>Reduzindo o prazo</small><b class="pos">${brl(sim.prazo.interest_saved)}</b><span class="muted">${sim.prazo.months_saved} parcelas a menos</span></div>
      <div><small>Reduzindo a prestação</small><b class="pos">${brl(sim.prestacao.interest_saved)}</b><span class="muted">prestação ${brl(sim.prestacao.payment_drop)} menor</span></div></div>
      ${cdi.cdi_annual_pct ? `<p class="hint">Amortizar rende ${num(cdi.debt.annual_pct, 2)}% a.a. garantido e sem IR. 100% do CDI (${num(cdi.cdi_annual_pct, 2)}%) com IR em 5 anos rende ${num(cdi.invest_net_annual_pct, 2)}% a.a. Empata com <b>${num(cdi.breakeven_pct_cdi, 1)}% do CDI</b>: acima disso, compensa deixar no CDI.</p>` : '<p class="hint">Comparação com o CDI: abra a tela Financiamento no PC para buscar o CDI de hoje.</p>'}
      <p class="hint">Economia em valores nominais. Simule outros valores na tela Financiamento do PC.</p></div>`);
  }
  html += section('Prestação a prestação', rTable(['Nº', 'Venc.', 'Juros', 'Amortiz.', 'TR', 'Total', 'Saldo', 'Variação', 'Custo'],
    [...rows].reverse().map(x => `<tr><td>${x.number}</td><td>${fmtDay(x.due)}/${x.due.slice(2, 4)}</td><td class="neg">${brl(x.interest)}</td><td class="pos">${brl(x.amortization)}</td>
      <td class="neg">${brl(x.correction)}</td><td><b>${brl(x.total)}</b></td><td>${brl(x.balance_after)}</td><td class="${x.balance_change > 0 ? 'neg' : 'pos'}">${signedBrl(x.balance_change)}</td><td>${num(x.cost_pct, 3)}%</td></tr>`)));
  if ((f.extras || []).length) html += section('Amortizações extras', `<div class="list">${f.extras.map(x => `<div class="row"><span class="row-main"><b>${brl(x.amount)}</b><small>${fmtDate(x.date)} · reduziu ${x.mode === 'prazo' ? 'o prazo' : 'a prestação'}${x.notes ? ` · ${esc(x.notes)}` : ''}</small></span></div>`).join('')}</div>`);
  return html + `<p class="hint center">Registrar amortização e editar o contrato: no FinFlow do PC.</p>`;
}

/* ================= AÇÕES ================= */
function renderStocks() {
  const r = loadReports(), s = r?.stocks;
  if (!s) return noReports('Ações');
  const t = s.totals, beat = s.ibov ? t.profitability - s.ibov.change_pct : null;
  let html = pageHead('Ações', '', reportsNote(r), '#/mais');
  if (!s.rows.length) return html + emptyState('trend', 'Nenhuma ação', 'Cadastre ações no FinFlow do PC (categoria Ações).');
  html += `<section class="card hero"><small>Total em ações</small><div class="hero-value">${brl(t.current)}</div>
    <div class="hero-split">
      <div class="split-item"><span><small>Desde a compra</small><b>${signedBrl(t.profit)} · ${pct(t.profitability, 2, true)}</b></span></div>
      <div class="split-item"><span><small>Hoje</small><b>${t.day_change == null ? '—' : `${signedBrl(t.day_change)} · ${pct(t.day_change_pct, 2, true)}`}</b></span></div>
    </div>
    <p class="hero-note">${t.count} ações · ${num(t.share_of_portfolio, 1)}% dos investimentos${beat != null ? ` · ${pp(beat)} contra o Ibovespa (${pct(s.ibov.change_pct, 2, true)}) desde ${fmtDate(t.first_buy)}` : ''}</p></section>`;
  if (!s.quotes_live) html += `<p class="info">${ic('info')}<span>Cotação do último "Atualizar cotações" do PC. A variação do dia e a faixa de 52 semanas aparecem quando o PC buscar as cotações (aba Ações).</span></p>`;
  if ((s.history || []).length > 1) html += section('Evolução', `<div class="card">${lineChart(s.history.map(h => ({ label: fmtDay(h.date), v: h.value, v2: h.ibov ?? h.invested })), { label: 'Carteira', label2: s.ibov ? 'Se fosse Ibovespa' : 'Investido' })}</div>`);
  html += section('Posições', `<div class="list">${s.rows.map(x => `<div class="row r-stock">
    <span class="dot" style="background:${catColor(x.symbol)}">${esc(x.symbol).slice(0, 1)}</span>
    <span class="row-main"><b>${esc(x.symbol)} <small class="muted">${esc(x.name)}</small></b>
      <small>${qtyTxt(x.quantity)} × ${brl(x.current_price)} · médio ${brl(x.average_price)} · ${num(x.weight, 1)}%${x.institution ? ` · ${esc(x.institution)}` : ''}</small>
      ${x.low_52w != null && x.high_52w > x.low_52w ? `<small>52 sem.: ${brl(x.low_52w)} – ${brl(x.high_52w)}</small>` : ''}</span>
    <span class="row-amount"><span>${brl(x.current)}</span><small class="${moneyClass(x.profit)}">${signedBrl(x.profit)} · ${pct(x.profitability, 1, true)}</small>
      ${x.day_change_pct != null ? `<small class="${moneyClass(x.day_change_pct)}">hoje ${pct(x.day_change_pct, 2, true)}</small>` : ''}</span>
  </div>`).join('')}</div>`);
  html += `<div class="summary-row">${kpi('Investido', brl(t.invested))}${kpi('Valor atual', brl(t.current))}${kpi('Resultado', signedBrl(t.profit), pct(t.profitability, 2, true), moneyClass(t.profit))}</div>`;
  return html + `<p class="hint center">Vender ou lançar dividendo/JCP: no FinFlow do PC (aba Ações). Compra errada: corrija em Investimentos, no aporte.</p>`;
}

/* ================= IMPOSTO ================= */
function renderTax() {
  const r = loadReports(), m = r?.taxMonth, y = r?.taxYear;
  if (!m && !y) return noReports('Imposto');
  let html = pageHead('Imposto de ações', '', reportsNote(r), '#/mais');
  const res = m?.result, limit = m?.rules?.exempt_limit || 20000;
  let monthBody;
  if (!res || !res.sales?.length) {
    monthBody = `<div class="card"><p class="muted">Nenhuma venda de ação em ${monthName(m.month.slice(0, 7))}. Comprar não gera imposto, só vender com lucro.${res?.swing_loss_after ? ` Prejuízo a compensar: ${brl(res.swing_loss_after)}.` : ''}</p></div>`;
  } else {
    monthBody = `<div class="summary-row r-four">${kpi('Vendas comuns', brl(res.swing_sales), res.swing_sales <= limit ? `isento: faltam ${brl(limit - res.swing_sales)}` : `passou dos ${brl(limit)}`, res.swing_sales <= limit ? 'pos' : 'neg')}
      ${kpi('Resultado', signedBrl(res.swing_result + res.day_trade_result), '', moneyClass(res.swing_result + res.day_trade_result))}
      ${kpi('Imposto', brl(res.tax), `− IR fonte ${brl(res.irrf_used)}`)}
      ${kpi(`DARF ${m.rules.darf_code}`, res.darf ? brl(res.darf) : 'Não há', res.darf ? `vence ${fmtDate(res.due_date)} · ${res.status}` : res.carried_small ? `${brl(res.carried_small)} soma no mês seguinte` : 'nada a pagar', res.status === 'a pagar' ? 'neg' : '')}</div>
      <div class="list">${res.sales.map(x => `<div class="row"><span class="row-main"><b>${esc(x.symbol)} · ${qtyTxt(x.quantity)} × ${brl(x.price)}</b><small>${fmtDate(x.date)} · ${x.day_trade ? 'day trade' : 'comum'} · preço médio ${brl(x.average_cost)}</small></span>
        <span class="row-amount"><span class="${moneyClass(x.profit)}">${signedBrl(x.profit)}</span><small>venda ${brl(x.gross)}</small></span></div>`).join('')}</div>`;
  }
  html += section(`Mês · ${monthName(m.month.slice(0, 7))}`, monthBody);
  if (y) {
    html += section(`Declaração · ano-calendário ${y.year}`, `<p class="muted">Bens e Direitos, grupo 03, código 01 (Ações), pelo custo de aquisição. Toque em Copiar e cole na discriminação; complete os CNPJs.</p>
      ${y.goods.length ? `<div class="list">${y.goods.map(g => `<div class="row r-good"><span class="row-main"><b>${esc(g.symbol)} <small class="muted">${esc(g.name)}</small></b>
        <small>31/12/${y.year - 1}: ${qtyTxt(g.quantity_before)} · ${brl(g.cost_before)} → 31/12/${y.year}: ${qtyTxt(g.quantity)} · <b>${brl(g.cost)}</b></small>
        <small class="r-text">${esc(g.text)}</small></span>
        <button class="mini-btn" data-act="copyText" data-text="${esc(g.text)}">Copiar</button></div>`).join('')}</div>` : '<div class="card"><p class="muted">Nenhuma ação no ano.</p></div>'}
      <div class="summary-row r-four">${kpi('Linha 20 · isento', brl(y.exempt.stock_profits), 'lucro até R$ 20 mil/mês')}${kpi('Linha 09 · dividendos', brl(y.exempt.dividends))}
        ${kpi('Linha 10 · JCP líquido', brl(y.exclusive.jcp_net))}${kpi('Imposto pago', brl(y.taxes.paid), `devido ${brl(y.taxes.due)}`)}</div>
      ${y.months.length ? rTable(['Mês', 'Vendas', 'Resultado', 'Isento', 'Prejuízo', 'DARF', 'Pago'], y.months.map(x => `<tr><td>${monthShort(x.month.slice(0, 7))}</td><td>${brl(x.swing_sales)}</td>
        <td class="${moneyClass(x.swing_result + x.day_trade_result)}">${signedBrl(x.swing_result + x.day_trade_result)}</td><td>${x.exempt ? brl(x.exempt_profit) : '—'}</td>
        <td>${brl(x.swing_loss_after + x.day_trade_loss_after)}</td><td>${x.darf ? brl(x.darf) : '—'}</td><td>${x.paid ? brl(x.paid) : '—'}</td></tr>`)) : ''}`);
  }
  return html + `<p class="hint">Apoio para conferir, não substitui o informe da corretora nem um contador. As regras e o PDF para imprimir estão no FinFlow do PC (Investimentos › Imposto).</p>`;
}

ACT.copyText = el => {
  const text = el.dataset.text;
  (navigator.clipboard?.writeText(text) || Promise.reject()).then(() => toast('Copiado.'), () => toast('Não consegui copiar.'));
};
