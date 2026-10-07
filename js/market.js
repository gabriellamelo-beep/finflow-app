'use strict';
/* Cotações e CDI direto do celular: Banco Central (CDI, Selic, IPCA), CoinGecko (cripto),
   AwesomeAPI (dólar) e brapi.dev (ações, FIIs e ETFs; precisa de token gratuito).
   Configuração (token) fica só neste aparelho, fora do backup. */

const MARKET_KEY = 'finflow.market';
const MARKET = { busy: false };
function marketCfg() { try { return JSON.parse(localStorage.getItem(MARKET_KEY)) || {}; } catch (e) { return {}; } }
function saveMarket(c) { try { localStorage.setItem(MARKET_KEY, JSON.stringify(c)); } catch (e) { } }
const brDate = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/* O Banco Central às vezes recusa uma chamada (e a resposta de erro vem sem CORS): tenta de novo. */
async function getJson(url, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`${new URL(url).hostname} respondeu ${r.status}`);
      return await r.json();
    } catch (e) {
      if (attempt >= tries) throw e;
      await new Promise(res => setTimeout(res, 700 * attempt));
    }
  }
}
async function bcbSeries(code, startIso, endIso) {
  if (startIso > endIso) return [];
  const data = await getJson(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${brDate(startIso)}&dataFinal=${brDate(endIso)}`);
  return (data || []).map(d => ({ date: `${d.data.slice(6, 10)}-${d.data.slice(3, 5)}-${d.data.slice(0, 2)}`, value: parseFloat(String(d.valor).replace(',', '.')) })).filter(d => !isNaN(d.value));
}
async function bcbLast(code, daysBack = 60) {
  const end = today(), start = isoDate(new Date(Date.now() - daysBack * 864e5));
  const rows = await bcbSeries(code, start, end);
  return rows[rows.length - 1] || null;
}

/* Indicadores do topo da tela de investimentos. */
async function fetchIndicators() {
  const out = {};
  const tasks = [
    getJson('https://economia.awesomeapi.com.br/json/last/USD-BRL').then(d => { if (d) out.dolar = { value: +d.USDBRL.bid, change: +d.USDBRL.pctChange }; }),
    getJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=brl&include_24hr_change=true').then(d => { if (d) out.bitcoin = { value: d.bitcoin.brl, change: d.bitcoin.brl_24h_change }; }),
    bcbLast(12).then(d => { if (d) out.cdi = { value: (Math.pow(1 + d.value / 100, 252) - 1) * 100, date: d.date }; }),
    bcbLast(432).then(d => { if (d) out.selic = { value: d.value, date: d.date }; }),
    bcbLast(13522, 120).then(d => { if (d) out.ipca = { value: d.value, date: d.date }; }),
  ];
  await Promise.allSettled(tasks);
  return out;
}

/* Corrige pelo CDI diário os ativos com "% do CDI", desde a última atualização. */
async function updateCdiAssets() {
  const assets = DB.assets.filter(a => (a.cdiPercent || 0) > 0);
  if (!assets.length) return [];
  const start = assets.map(a => a.lastUpdate || a.startDate || today()).sort()[0];
  const rates = await bcbSeries(12, isoDate(new Date(new Date(start + 'T12:00:00').getTime() + 864e5)), today());
  const msgs = [];
  for (const a of assets) {
    const since = a.lastUpdate || a.startDate || today();
    const period = rates.filter(r => r.date > since);
    if (!period.length) continue;
    const factor = period.reduce((f, r) => f * (1 + r.value / 100 * a.cdiPercent / 100), 1);
    const gain = a.current * (factor - 1);
    a.current = round2(a.current + gain);
    a.lastUpdate = period[period.length - 1].date;
    msgs.push(`${a.name} +${brl(gain)}`);
  }
  return msgs;
}

async function updateCryptoAssets() {
  const assets = DB.assets.filter(a => a.category === 'Criptomoedas' && a.ticker && a.quantity > 0);
  if (!assets.length) return [];
  const ids = [...new Set(assets.map(a => a.ticker.toLowerCase().trim()))].join(',');
  const data = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=brl`);
  const msgs = [];
  for (const a of assets) {
    const price = data?.[a.ticker.toLowerCase().trim()]?.brl;
    if (!price) continue;
    a.current = round2(price * a.quantity); a.lastUpdate = today();
    msgs.push(`${a.name} ${brl(a.current)}`);
  }
  return msgs;
}

async function updateStockAssets() {
  const token = marketCfg().brapiToken;
  const assets = DB.assets.filter(a => ['Acoes', 'ETFs', 'FIIs'].includes(a.category) && a.ticker && a.quantity > 0);
  if (!assets.length || !token) return [];
  const msgs = [];
  for (const a of assets) {
    const ticker = a.ticker.toUpperCase().replace(/\.SA$/, '').trim();
    try {
      const d = await getJson(`https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?token=${encodeURIComponent(token)}`);
      const price = d?.results?.[0]?.regularMarketPrice;
      if (!price) continue;
      a.current = round2(price * a.quantity); a.lastUpdate = today();
      msgs.push(`${a.name} ${brl(a.current)}`);
    } catch (e) { console.warn(ticker, e); }
  }
  return msgs;
}

/* Atualiza tudo. quiet = sem avisos (atualização automática ao abrir o app). */
async function updateMarket({ quiet = false } = {}) {
  if (MARKET.busy || !navigator.onLine) { if (!quiet && !navigator.onLine) toast('Sem internet para atualizar as cotações.'); return; }
  MARKET.busy = true;
  if (!quiet) toast('Atualizando cotações...');
  const results = await Promise.allSettled([fetchIndicators(), updateCdiAssets(), updateCryptoAssets(), updateStockAssets()]);
  MARKET.busy = false;
  const cfg = marketCfg();
  if (results[0].status === 'fulfilled') cfg.indicators = { ...(cfg.indicators || {}), ...results[0].value };
  cfg.updatedAt = new Date().toISOString(); cfg.lastAuto = today();
  saveMarket(cfg);
  const updated = results.slice(1).flatMap(r => (r.status === 'fulfilled' ? r.value : []));
  const failed = results.slice(1).some(r => r.status === 'rejected');
  if (updated.length) save();
  if (['investimentos', ''].includes(parseHash().name)) rerender();
  if (!quiet) toast(updated.length ? `${updated.length} investimento(s) atualizado(s).` : failed ? 'Algumas fontes não responderam. Tente mais tarde.' : 'Cotações em dia.');
}
function autoUpdateMarket() {
  const has = DB.assets.some(a => (a.cdiPercent || 0) > 0 || (a.ticker && a.quantity > 0));
  if (marketCfg().lastAuto !== today() && (has || DB.assets.length)) updateMarket({ quiet: true });
}

ACT.updateMarket = () => updateMarket();
BIND.brapiToken = el => { saveMarket({ ...marketCfg(), brapiToken: el.value.trim() }); toast(el.value.trim() ? 'Token salvo neste aparelho.' : 'Token removido.'); };
