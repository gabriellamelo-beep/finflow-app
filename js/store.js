'use strict';
/* Dados no aparelho (localStorage), migração, backup e importação do FinFlow do PC. */

const STORE_KEY = 'finflow.v1';
const DEFAULT_CATEGORIES = {
  receita: ['Salário', 'Renda extra', 'Rendimentos', 'Restituição IR', 'Outros'],
  despesa: ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Academia', 'Lazer', 'Viagens', 'Pets', 'Assinaturas', 'Impostos', 'Outros'],
};
const PAYMENTS = ['PIX', 'Débito', 'Dinheiro'];
const ASSET_CLASSES = {
  'Reserva de Emergencia': 'Caixa', 'CDB': 'Renda fixa', 'Tesouro': 'Renda fixa', 'Tesouro Direto': 'Renda fixa',
  'Previdencia': 'Previdência', 'Previdencia Privada': 'Previdência', 'Acoes': 'Ações', 'ETFs': 'ETFs', 'ETF': 'ETFs',
  'FIIs': 'FIIs', 'FII': 'FIIs', 'Criptomoedas': 'Cripto', 'Outros': 'Outros',
};
const ASSET_CATEGORY_LABELS = {
  'Reserva de Emergencia': 'Reserva de emergência', 'CDB': 'CDB / LCI / LCA', 'Tesouro': 'Tesouro Direto', 'Previdencia': 'Previdência',
  'Acoes': 'Ações', 'ETFs': 'ETFs', 'FIIs': 'FIIs', 'Criptomoedas': 'Criptomoedas', 'Outros': 'Outros',
};

let DB;

function defaultDB() {
  return {
    schema: 1,
    settings: { theme: 'auto', lastBackup: null, importedAt: null, createdAt: new Date().toISOString() },
    categories: { receita: [...DEFAULT_CATEGORIES.receita], despesa: [...DEFAULT_CATEGORIES.despesa] },
    incomes: [],
    expenses: [],
    cards: [],
    purchases: [],
    paidInvoices: {},
    budgets: {},
    recurring: [],
    assets: [],
    assetTx: [],
    goals: [],
    wealth: [],
    rules: {},
    ui: {},
  };
}

function migrate(db) {
  const base = defaultDB();
  for (const key of Object.keys(base)) if (db[key] == null) db[key] = base[key];
  db.settings = { ...base.settings, ...db.settings };
  db.categories = {
    receita: db.categories.receita?.length ? db.categories.receita : base.categories.receita,
    despesa: db.categories.despesa?.length ? db.categories.despesa : base.categories.despesa,
  };
  return db;
}

function loadDB() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    DB = raw ? migrate(JSON.parse(raw)) : defaultDB();
  } catch (e) {
    console.error(e);
    DB = defaultDB();
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(DB));
  } catch (e) {
    toast('Não foi possível salvar: o armazenamento do aparelho está cheio.');
  }
}

const hasData = () => DB.expenses.length + DB.incomes.length + DB.purchases.length + DB.assets.length > 0;

/* ---------- backup ---------- */
function exportBackup() {
  DB.settings.lastBackup = new Date().toISOString();
  save();
  download(`finflow-backup-${today()}.json`, JSON.stringify({ app: 'finflow', source: 'mobile', version: 1, exportedAt: new Date().toISOString(), data: DB }), 'application/json');
}

/* Lê um arquivo .json do app (backup) ou gerado pelo FinFlow do PC. */
function readBackupFile(file) {
  return file.text().then(text => {
    const parsed = JSON.parse(text);
    if (!parsed || parsed.app !== 'finflow' || !parsed.data) throw new Error('Este arquivo não é um backup do FinFlow.');
    return parsed;
  });
}

function applyImport(parsed) {
  const settings = DB.settings;
  DB = migrate(JSON.parse(JSON.stringify(parsed.data)));
  // Tema e datas de backup continuam os deste aparelho.
  DB.settings = { ...DB.settings, theme: settings.theme, lastBackup: settings.lastBackup, importedAt: new Date().toISOString() };
  normalizeCategories();
  rolloverAssets();
  save();
}

/* Garante que toda categoria usada exista na lista. */
function normalizeCategories() {
  const add = (kind, name) => { if (name && !DB.categories[kind].includes(name)) DB.categories[kind].push(name); };
  DB.incomes.forEach(x => add('receita', x.category));
  DB.expenses.forEach(x => add('despesa', x.category));
  DB.purchases.forEach(x => add('despesa', x.category));
  DB.recurring.forEach(x => add(x.kind === 'Receita' ? 'receita' : 'despesa', x.category));
  Object.keys(DB.budgets).forEach(c => add('despesa', c));
  DB.categories.receita.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  DB.categories.despesa.sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/* Nome bonito para categorias que vieram do PC sem acento. */
const CATEGORY_DISPLAY = { alimentacao: 'Alimentação', saude: 'Saúde', educacao: 'Educação', salario: 'Salário', 'restituicao ir': 'Restituição IR' };
function catLabel(name) {
  const p = plain(name);
  for (const [key, label] of Object.entries(CATEGORY_DISPLAY)) if (p === key) return label;
  return name;
}
