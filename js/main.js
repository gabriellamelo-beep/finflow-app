'use strict';
/* Inicialização e delegação de eventos. */

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (!fn) return;
  // Links com data-act seguem o href depois da ação (ex.: escolher cartão e abrir Cartões).
  if (el.tagName !== 'A') e.preventDefault();
  fn(el, e);
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-bind]');
  if (el && BIND[el.dataset.bind]) BIND[el.dataset.bind](el, e);
});
document.addEventListener('input', e => {
  const el = e.target.closest('[data-live]');
  if (el && LIVE[el.dataset.live]) LIVE[el.dataset.live](el, e);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#sheets .sheet-wrap')) closeSheet(); });
window.addEventListener('hashchange', () => { closeAllSheets(); route(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());

loadDB();
applyTheme();
rolloverAssets();
const created = generateRecurring();
route();
if (created) toast(`${created} lançamento(s) recorrente(s) feitos automaticamente.`);

if (navigator.storage?.persist) navigator.storage.persist().catch(() => { });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  // Versão nova instalada: recarrega uma vez (os dados ficam salvos no aparelho).
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded || $('#sheets .sheet-wrap')) return;
    reloaded = true; location.reload();
  });
  navigator.serviceWorker.register('sw.js').then(reg => reg.update()).catch(err => console.warn('SW', err));
}
