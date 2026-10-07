'use strict';
/* Backup automático no Google Drive (mesmo mecanismo do Evolua).
   Login pelo Google no próprio navegador, sem servidor; o token vale ~1 h. O arquivo
   "finflow-backup.json" é atualizado ao abrir o app e logo depois de cada alteração; o Drive
   guarda as versões anteriores. Client ID e token ficam só neste aparelho, fora do backup. */

const DRIVE_KEY = 'finflow.drive';
const DRIVE_FILE = 'finflow-backup.json';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE = { busy: false, timer: null };

function driveCfg() { try { return JSON.parse(localStorage.getItem(DRIVE_KEY)) || {}; } catch (e) { return {}; } }
function saveDrive(c) { try { localStorage.setItem(DRIVE_KEY, JSON.stringify(c)); } catch (e) { } }
/* O Evolua fica no mesmo endereço: dá para reaproveitar o ID do cliente que você já criou lá. */
function evoluaClientId() { try { return JSON.parse(localStorage.getItem('evolua.drive'))?.clientId || ''; } catch (e) { return ''; } }
const driveConnected = () => !!driveCfg().connected;
const driveTokenOk = () => { const c = driveCfg(); return !!c.accessToken && Date.now() < (c.expiresAt || 0) - 60e3; };
const driveRedirectUri = () => location.origin + location.pathname;
function driveDirty() {
  const c = driveCfg();
  let changed = 0; try { changed = +localStorage.getItem('finflow.changed') || 0; } catch (e) { }
  return !c.lastSync || changed > new Date(c.lastSync).getTime();
}

function driveAuthorize({ silent = false, then = '' } = {}) {
  const c = driveCfg();
  if (!c.clientId) return ACT.driveSetup();
  c.returnTo = location.hash || '#/'; c.then = then; saveDrive(c);
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  const q = { client_id: c.clientId, redirect_uri: driveRedirectUri(), response_type: 'token', scope: DRIVE_SCOPE, include_granted_scopes: 'true', state: 'finflow-drive' };
  if (silent) q.prompt = 'none';
  if (c.email) q.login_hint = c.email;
  u.search = new URLSearchParams(q);
  location.href = u.toString();
}

/* Chamado antes do roteamento: trata a volta do Google (#access_token=…). */
function driveHandleRedirect() {
  const h = location.hash;
  if (!h.includes('state=finflow-drive')) return;
  const q = new URLSearchParams(h.slice(1));
  const c = driveCfg();
  history.replaceState(null, '', location.pathname + (c.returnTo || '#/'));
  const then = c.then; delete c.returnTo; delete c.then;
  if (q.get('access_token')) {
    Object.assign(c, { accessToken: q.get('access_token'), expiresAt: Date.now() + (+q.get('expires_in') || 3600) * 1000, connected: true, needsLogin: false });
    saveDrive(c);
    setTimeout(() => { if (then === 'restore') driveRestore(); else driveSync({ force: true }); }, 300);
  } else {
    const err = q.get('error');
    if (err && err !== 'access_denied') c.needsLogin = true;
    saveDrive(c);
    setTimeout(() => toast(err === 'access_denied' ? 'Acesso ao Google Drive não autorizado.' : 'Entre de novo na sua conta Google para o backup no Drive.'), 300);
  }
}

async function driveFetch(url, opts = {}) {
  const c = driveCfg();
  const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + c.accessToken, ...(opts.headers || {}) } });
  if (r.status === 401) { c.accessToken = ''; saveDrive(c); throw new Error('auth'); }
  if (!r.ok) throw new Error('Drive respondeu ' + r.status);
  return r;
}
async function driveFindFile() {
  const q = encodeURIComponent(`name='${DRIVE_FILE}' and trashed=false`);
  const r = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&orderBy=modifiedTime desc&fields=files(id,modifiedTime)`);
  return (await r.json()).files?.[0] || null;
}
async function driveUpload() {
  const c = driveCfg(), body = JSON.stringify({ app: 'finflow', source: 'mobile', version: 1, exportedAt: new Date().toISOString(), data: DB });
  if (!c.fileId) c.fileId = (await driveFindFile())?.id || '';
  if (c.fileId) {
    try {
      await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${c.fileId}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
      return c.fileId;
    } catch (e) { if (e.message === 'auth') throw e; c.fileId = ''; }
  }
  const b = 'finflow' + Date.now();
  const multipart = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: DRIVE_FILE, mimeType: 'application/json' })}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`;
  const r = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body: multipart });
  return (await r.json()).id;
}

/* Envia se houver alterações (ou force). Sem token válido: interactive = vai ao Google buscar. */
async function driveSync({ force = false, interactive = false, quiet = false } = {}) {
  if (!driveConnected() || DRIVE.busy) return;
  if (!force && !driveDirty()) return;
  if (!driveTokenOk()) { if (interactive) driveAuthorize({ silent: !driveCfg().needsLogin }); return; }
  DRIVE.busy = true;
  try {
    const id = await driveUpload();
    const c = driveCfg(); Object.assign(c, { fileId: id, lastSync: new Date().toISOString(), needsLogin: false }); saveDrive(c);
    DB.settings.lastBackup = c.lastSync;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); localStorage.setItem('finflow.changed', String(Date.now() - 1000)); } catch (e) { }
    if (!quiet) toast('Backup salvo no Google Drive.');
  } catch (e) {
    console.error(e);
    if (e.message === 'auth') { if (interactive) driveAuthorize({ silent: true }); }
    else if (!quiet) toast('Não foi possível salvar no Drive. Tente de novo mais tarde.');
  } finally {
    DRIVE.busy = false;
    if (['', 'ajustes'].includes(parseHash().name) && !$('#sheets .sheet-wrap')) rerender();
  }
}
/* Depois de cada alteração: envia em ~20 s, se o token ainda vale (sem sair do app). */
function driveSchedule() {
  if (!driveConnected() || !driveTokenOk()) return;
  clearTimeout(DRIVE.timer);
  DRIVE.timer = setTimeout(() => driveSync({ quiet: true }), 20000);
}

async function driveRestore() {
  if (!driveTokenOk()) return driveAuthorize({ then: 'restore' });
  try {
    const f = await driveFindFile();
    if (!f) return toast('Nenhum backup do FinFlow encontrado no seu Drive.');
    const parsed = await (await driveFetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`)).json();
    if (parsed?.app !== 'finflow' || !parsed.data) return toast('O arquivo do Drive não é um backup do FinFlow.');
    const c = driveCfg(); c.fileId = f.id; saveDrive(c);
    const when = new Date(f.modifiedTime);
    const ok = await confirmSheet({ title: 'Restaurar backup do Drive?', text: `Backup salvo em ${fmtDate(isoDate(when))} às ${pad(when.getHours())}:${pad(when.getMinutes())}. Os dados atuais deste celular serão substituídos.`, ok: 'Restaurar' });
    if (!ok) return;
    applyImport(parsed);
    toast('Backup do Drive restaurado.');
    go('#/');
  } catch (e) { console.error(e); toast(e.message === 'auth' ? 'Entre de novo na sua conta Google.' : 'Não foi possível ler o backup do Drive.'); }
}

/* ---------- telas ---------- */
function driveStatusHtml() {
  const c = driveCfg();
  if (!c.connected) return `<p class="muted">Salve uma cópia automática dos seus dados no seu Google Drive. Se trocar ou perder o celular, é só restaurar.</p>
    <button class="btn btn-primary" data-act="driveSetup">${ic('upload')}Configurar backup no Drive</button>`;
  return `<p class="muted">O arquivo <b>${DRIVE_FILE}</b> no seu Drive é atualizado sozinho ao abrir o app e depois de cada alteração. ${c.lastSync ? `Último envio: ${fmtDate(isoDate(new Date(c.lastSync)))}.` : 'Ainda não enviado.'}</p>
    <button class="btn btn-soft" data-act="driveNow">${ic('upload')}Salvar no Drive agora</button>
    <button class="btn btn-ghost" data-act="driveRestoreBtn">${ic('download')}Restaurar do Drive</button>
    <button class="btn btn-ghost danger-text" data-act="driveOff">Desconectar</button>`;
}

ACT.driveSetup = () => {
  closeAllSheets();
  const c = driveCfg(), evo = evoluaClientId(), id = c.clientId || evo, redir = driveRedirectUri();
  openSheet(`<h3 class="sheet-title">Backup automático no Google Drive</h3>
    ${evo ? `<p class="info">${ic('info')}<span>Você já criou um acesso do Google para o <b>Evolua</b>. Dá para usar o mesmo: só falta autorizar o endereço do FinFlow nele (passo abaixo).</span></p>
      <ol class="steps">
        <li>Abra <a class="link" href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener">Google Auth Platform → Clientes</a> e toque no cliente que você criou para o Evolua.</li>
        <li>Em <b>URIs de redirecionamento autorizados</b>, toque em <b>Adicionar URI</b> e cole:<br><code>${esc(redir)}</code><br>Salve. (A origem <code>${esc(location.origin)}</code> já está lá.)</li>
        <li>Volte aqui e toque em <b>Conectar com Google</b>.</li>
      </ol>`
    : `<p class="info">${ic('info')}<span><b>Já configurou o backup no Evolua?</b> Use o mesmo acesso: abra o cliente do Evolua em <a class="link" href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener">Google Auth Platform → Clientes</a>, adicione a URI de redirecionamento <code>${esc(redir)}</code>, salve e cole abaixo o mesmo ID do cliente.</span></p>
      <p class="muted">Se ainda não tem, o Google exige que você crie um acesso na sua conta. É grátis e só precisa ser feito uma vez (uns 10 minutos, de preferência no computador):</p>
      <ol class="steps">
        <li>Abra <a class="link" href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">console.cloud.google.com</a> e crie um projeto chamado <b>FinFlow</b>.</li>
        <li>Em <a class="link" href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener">Google Drive API</a>, toque em <b>Ativar</b>.</li>
        <li>Em <a class="link" href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noopener">Google Auth Platform</a>, toque em <b>Começar</b>: nome <b>FinFlow</b>, seu e-mail, público <b>Externo</b>. Depois, em <b>Público-alvo</b>, adicione seu e-mail em <b>Usuários de teste</b>.</li>
        <li>Em <a class="link" href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener">Clientes</a>, crie um cliente <b>Aplicativo da Web</b> com:<br><b>Origens JavaScript autorizadas</b>: <code>${esc(location.origin)}</code><br><b>URIs de redirecionamento autorizados</b>: <code>${esc(redir)}</code></li>
        <li>Copie o <b>ID do cliente</b> (termina em <code>.apps.googleusercontent.com</code>) e cole abaixo.</li>
      </ol>`}
    <label class="field"><span>ID do cliente</span><input id="gdId" value="${esc(id)}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
    <p class="hint">O app só enxerga os arquivos que ele mesmo cria no seu Drive. O ID fica salvo só neste aparelho.</p>
    <button class="btn btn-primary btn-xl" data-act="driveGo">Conectar com Google</button>`, { cls: 'sheet-form tall' });
};
ACT.driveGo = () => {
  const id = $('#gdId').value.trim();
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(id)) return toast('O ID do cliente termina em .apps.googleusercontent.com');
  saveDrive({ ...driveCfg(), clientId: id });
  driveAuthorize();
};
ACT.driveNow = () => { closeAllSheets(); driveSync({ force: true, interactive: true }); };
ACT.driveRestoreBtn = () => { closeAllSheets(); driveRestore(); };
ACT.driveOff = async () => {
  if (!await confirmSheet({ title: 'Desconectar o Google Drive?', text: 'O backup que já está no Drive continua lá. O app para de atualizá-lo.', ok: 'Desconectar', danger: true })) return;
  const c = driveCfg();
  try { if (c.accessToken) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(c.accessToken), { method: 'POST' }); } catch (e) { }
  saveDrive({ clientId: c.clientId });
  toast('Google Drive desconectado.'); rerender();
};
