'use strict';
/* Gráficos em SVG (sem bibliotecas, funcionam offline). */

const shortMoney = v => {
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  if (a >= 1e6) return `${s}${num(a / 1e6, a >= 1e7 ? 0 : 1)} mi`;
  if (a >= 1e3) return `${s}${num(a / 1e3, a >= 1e5 ? 0 : 1)} mil`;
  return `${s}${num(a, 0)}`;
};
function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/* Barras agrupadas (entradas × saídas) com linha de saldo. data: [{label, a, b, title}] */
function barsChart(data, { aLabel = 'Entradas', bLabel = 'Saídas', line = null } = {}) {
  const W = 340, H = 190, L = 34, B = 22, T = 10, iw = W - L - 6, ih = H - B - T;
  const max = niceMax(Math.max(...data.map(d => Math.max(d.a, d.b)), 1));
  const step = iw / data.length, bw = Math.min(12, step / 2.8);
  const y = v => T + ih - (v / max) * ih;
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${aLabel} e ${bLabel} por mês">`;
  for (let i = 0; i <= 4; i++) { const v = max / 4 * i, yy = y(v); svg += `<line x1="${L}" x2="${W - 6}" y1="${yy}" y2="${yy}" class="grid"/><text x="${L - 4}" y="${yy + 3}" class="axis" text-anchor="end">${shortMoney(v)}</text>`; }
  data.forEach((d, i) => {
    const cx = L + step * i + step / 2;
    svg += `<g><title>${esc(d.title || d.label)}: ${aLabel} ${brl(d.a)} · ${bLabel} ${brl(d.b)}</title>
      <rect x="${cx - bw - 1}" y="${y(d.a)}" width="${bw}" height="${Math.max(0, T + ih - y(d.a))}" rx="3" class="bar-a"/>
      <rect x="${cx + 1}" y="${y(d.b)}" width="${bw}" height="${Math.max(0, T + ih - y(d.b))}" rx="3" class="bar-b"/></g>
      <text x="${cx}" y="${H - 6}" class="axis" text-anchor="middle">${esc(d.label)}</text>`;
  });
  if (line) {
    const ly = v => T + ih - (Math.max(v, 0) / max) * ih;
    svg += `<polyline class="line" points="${data.map((d, i) => `${L + step * i + step / 2},${ly(d[line])}`).join(' ')}"/>`;
  }
  return svg + '</svg>' + `<div class="chart-legend"><span><i class="bar-a"></i>${aLabel}</span><span><i class="bar-b"></i>${bLabel}</span>${line ? '<span><i class="line"></i>Saldo</span>' : ''}</div>`;
}

/* Linha com área. points: [{label, v, v2?}] */
function lineChart(points, { label = 'Valor', label2 = '' } = {}) {
  if (points.length < 2) return '<p class="muted center">Ainda não há meses suficientes para o gráfico.</p>';
  const W = 340, H = 190, L = 40, B = 22, T = 10, iw = W - L - 8, ih = H - B - T;
  const vals = points.flatMap(p => [p.v, p.v2 ?? p.v]);
  const lo = Math.min(0, ...vals), max = niceMax(Math.max(...vals) - lo) + lo;
  const x = i => L + (iw * i) / (points.length - 1), y = v => T + ih - ((v - lo) / (max - lo)) * ih;
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} ao longo do tempo">`;
  for (let i = 0; i <= 4; i++) { const v = lo + (max - lo) / 4 * i, yy = y(v); svg += `<line x1="${L}" x2="${W - 8}" y1="${yy}" y2="${yy}" class="grid"/><text x="${L - 4}" y="${yy + 3}" class="axis" text-anchor="end">${shortMoney(v)}</text>`; }
  const path = points.map((p, i) => `${x(i)},${y(p.v)}`).join(' ');
  svg += `<polygon class="area" points="${x(0)},${y(lo)} ${path} ${x(points.length - 1)},${y(lo)}"/><polyline class="line strong" points="${path}"/>`;
  if (label2) svg += `<polyline class="line dashed" points="${points.map((p, i) => `${x(i)},${y(p.v2 ?? 0)}`).join(' ')}"/>`;
  const every = Math.ceil(points.length / 6);
  points.forEach((p, i) => { if (i % every === 0 || i === points.length - 1) svg += `<text x="${x(i)}" y="${H - 6}" class="axis" text-anchor="middle">${esc(p.label)}</text>`; });
  const last = points[points.length - 1];
  svg += `<circle cx="${x(points.length - 1)}" cy="${y(last.v)}" r="4" class="dot-end"/>`;
  return svg + '</svg>' + (label2 ? `<div class="chart-legend"><span><i class="line"></i>${esc(label)}</span><span><i class="line dashed"></i>${esc(label2)}</span></div>` : '');
}

/* Rosca por categoria. items: [{label, value, color}] */
function donutChart(items, center = '') {
  const total = sum(items, i => i.value);
  if (!total) return '';
  const R = 70, r = 46, C = 90;
  let a0 = -Math.PI / 2, svg = `<svg class="chart donut" viewBox="0 0 180 180" role="img" aria-label="Distribuição por categoria">`;
  items.forEach(it => {
    const a1 = a0 + (it.value / total) * Math.PI * 2, large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (ang, rad) => `${C + rad * Math.cos(ang)},${C + rad * Math.sin(ang)}`;
    svg += items.length === 1
      ? `<circle cx="${C}" cy="${C}" r="${(R + r) / 2}" fill="none" stroke="${it.color}" stroke-width="${R - r}"/>`
      : `<path d="M${p(a0, R)} A${R},${R} 0 ${large} 1 ${p(a1, R)} L${p(a1, r)} A${r},${r} 0 ${large} 0 ${p(a0, r)}Z" fill="${it.color}"><title>${esc(it.label)}: ${brl(it.value)}</title></path>`;
    a0 = a1;
  });
  return svg + `<text x="${C}" y="${C - 2}" text-anchor="middle" class="donut-total">${esc(center)}</text><text x="${C}" y="${C + 14}" text-anchor="middle" class="axis">no mês</text></svg>`;
}
