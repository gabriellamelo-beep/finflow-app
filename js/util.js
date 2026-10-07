'use strict';
/* Utilitários: DOM, formatação em pt-BR, datas (texto AAAA-MM-DD) e meses (AAAA-MM). */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl = v => BRL.format(+v || 0);
const round2 = v => Math.round((+v + Number.EPSILON) * 100) / 100;
const num = (v, d = 2) => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v, d = 1, signed = false) => `${signed && v > 0 ? '+' : ''}${num(v, d)}%`;
const sum = (arr, f = x => x) => arr.reduce((a, x) => a + (+f(x) || 0), 0);

/* Converte texto digitado em número: aceita "1.234,56", "1234,56", "1234.56" e "R$ 10". */
function parseMoney(text) {
  let t = String(text ?? '').replace(/[R$\s]/g, '');
  if (!t) return 0;
  const negative = t.startsWith('-');
  t = t.replace(/^[-+]/, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = parseFloat(t);
  return isNaN(n) ? 0 : (negative ? -n : n);
}
const moneyInput = v => (v || v === 0) && +v ? num(v) : '';

/* ---------- datas ---------- */
const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoDate(new Date());
const curMonth = () => today().slice(0, 7);
const monthOf = iso => String(iso || '').slice(0, 7);
function addMonths(ym, n) {
  let [y, m] = ym.split('-').map(Number);
  m += n;
  y += Math.floor((m - 1) / 12);
  m = ((m - 1) % 12 + 12) % 12 + 1;
  return `${y}-${pad(m)}`;
}
const monthDiff = (a, b) => { const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number); return (yb - ya) * 12 + (mb - ma); };
const daysInMonth = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const dayInMonth = (ym, day) => `${ym}-${pad(Math.min(Math.max(+day || 1, 1), daysInMonth(ym)))}`;

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const monthName = ym => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} de ${y}`; };
const monthShort = ym => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1].slice(0, 3)}/${String(y).slice(2)}`; };
const fmtDate = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';
const fmtDay = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '';
const fmtMonth = ym => ym ? `${ym.slice(5, 7)}/${ym.slice(0, 4)}` : '';
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
function dayHeader(iso) {
  const d = new Date(iso + 'T12:00:00');
  const t = today(), y = isoDate(new Date(Date.now() - 864e5));
  if (iso === t) return 'Hoje';
  if (iso === y) return 'Ontem';
  return `${WEEKDAYS[d.getDay()]}, ${fmtDay(iso)}`;
}
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);

/* Texto sem acento e em minúsculas, para comparar descrições. */
const plain = s => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
