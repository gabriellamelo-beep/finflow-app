'use strict';
/* Ícones, toasts, folhas (bottom sheets), confirmações e pequenos componentes. */

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  up: '<path d="M7 17 17 7M9 7h8v8"/>',
  down: '<path d="M7 7l10 10M17 9v8H9"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  wallet: '<path d="M4 7h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12v3"/><circle cx="16" cy="13.5" r="1.3" fill="currentColor" stroke="none"/>',
  bank: '<path d="M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  piggy: '<path d="M5 11a7 6 0 0 1 12.6-3.5L20 7v4l-1.5.8A7 6 0 0 1 15 17v2h-3v-1.5H9V19H6v-2.5A6 6 0 0 1 5 11z"/><circle cx="15.5" cy="10.5" r=".9" fill="currentColor" stroke="none"/>',
  repeat: '<path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  donut: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3.5V8.5"/>',
  flow: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/>',
  house: '<path d="M4 11 12 4l8 7M6 9.5V20h12V9.5M10 20v-5h4v5"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 15V4M7 9l5-5 5 5M5 20h14"/>',
  phone: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  alert: '<path d="M12 3 2 20h20zM12 10v4.5M12 17.5v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  swap: '<path d="M7 4 3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="M7 5v14l12-7z"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>',
};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

/* Cor estável por categoria. */
const PALETTE = ['#6D28D9', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6', '#8B5CF6', '#64748B', '#F97316', '#84CC16', '#06B6D4'];
function catColor(name) {
  let h = 0;
  for (const ch of plain(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
const catDot = name => `<span class="dot" style="background:${catColor(name)}">${esc(catLabel(name)).slice(0, 1)}</span>`;

function toast(msg, kind = '') {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.className = `toast show ${kind}`;
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), kind === 'warn' ? 4200 : 2600);
}

function openSheet(html, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-bg" data-close></div><div class="sheet ${opts.cls || ''}" role="dialog" aria-modal="true"><div class="sheet-grip" data-close></div><div class="sheet-body">${html}</div></div>`;
  $('#sheets').appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  wrap.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(wrap); });
  wrap._onClose = opts.onClose;
  const first = $('[autofocus]', wrap);
  if (first) setTimeout(() => first.focus(), 260);
  return wrap;
}
function closeSheet(wrap) {
  wrap = wrap || $$('#sheets .sheet-wrap').pop();
  if (!wrap || wrap._closing) return;
  wrap._closing = true;
  wrap.classList.remove('open');
  setTimeout(() => wrap.remove(), 240);
  if (wrap._onClose) wrap._onClose();
}
function closeAllSheets() { $$('#sheets .sheet-wrap').forEach(w => closeSheet(w)); }

function confirmSheet({ title, text = '', ok = 'Confirmar', cancel = 'Cancelar', danger = false }) {
  return new Promise(res => {
    let done = false;
    const w = openSheet(`<h3 class="sheet-title">${esc(title)}</h3>${text ? `<p class="muted">${esc(text)}</p>` : ''}
      <div class="sheet-actions"><button class="btn btn-ghost" data-r="0">${esc(cancel)}</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-r="1">${esc(ok)}</button></div>`,
      { onClose: () => { if (!done) { done = true; res(false); } } });
    w.addEventListener('click', e => {
      const b = e.target.closest('[data-r]');
      if (b) { done = true; res(b.dataset.r === '1'); closeSheet(w); }
    });
  });
}

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* Lê os campos [name] de um formulário/folha. */
function formValues(root) {
  const out = {};
  $$('[name]', root).forEach(el => {
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else out[el.name] = el.value.trim();
  });
  return out;
}

const seg = (act, options, value, extra = '') => `<div class="seg" role="tablist">${options.map(([v, l]) => `<button type="button" class="${String(v) === String(value) ? 'on' : ''}" data-act="${act}" data-v="${esc(v)}" ${extra}>${l}</button>`).join('')}</div>`;
const emptyState = (icon, title, text, action = '') => `<div class="empty">${ic(icon)}<h3>${title}</h3><p>${text}</p>${action}</div>`;
const bar = (p, cls = '') => `<div class="bar ${cls}"><span style="width:${Math.max(0, Math.min(100, p))}%"></span></div>`;
const moneyClass = v => v > 0.004 ? 'pos' : v < -0.004 ? 'neg' : '';
const options = (list, selected, label = x => x) => list.map(x => `<option value="${esc(x)}" ${x === selected ? 'selected' : ''}>${esc(label(x))}</option>`).join('');

function applyTheme() {
  const t = DB.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name="theme-color"]').setAttribute('content', dark ? '#0F1117' : '#F6F7FB');
}
