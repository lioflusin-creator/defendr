/* =====================================================================
   DEFENDR — base de données de DÉMONSTRATION
   Remplace Supabase par une base fictive stockée dans le navigateur du testeur.
   Aucune donnée n'est envoyée nulle part ; « Réinitialiser » remet le club démo à zéro.
   ===================================================================== */
import { buildDemoData } from './seed.js';

const DB_KEY = 'defendr-demo-db-v1';
const SESSION_KEY = 'defendr-demo-session';
const DEMO_USER = { id: 'demo-president', email: 'demo@club-demo.fr' };

let db;
try { db = JSON.parse(localStorage.getItem(DB_KEY)); } catch { db = null; }
if (!db || !db.members) {
  db = buildDemoData(DEMO_USER.id);
  try { localStorage.setItem('defendr-demo-derniere-sauvegarde', new Date().toISOString()); } catch {} // pas de rappel de sauvegarde dans la démo
}
const files = new Map(); // fichiers ajoutés pendant la visite (non conservés)
// Bases de démo créées avant l'ajout des documents du club
if (db.club_settings?.[0]) { const s0 = db.club_settings[0]; s0.club_documents ??= {}; if (s0.federation_label === undefined) s0.federation_label = 'la fédération'; }

function save() { try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch {} }
save();
export function resetDemo() {
  try { localStorage.removeItem(DB_KEY); localStorage.removeItem(SESSION_KEY); localStorage.removeItem('defendr-demo-derniere-sauvegarde'); } catch {}
}

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
const nowIso = () => new Date().toISOString();
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const clone = v => JSON.parse(JSON.stringify(v));
const table = name => (db[name] ||= []);

/* Valeurs par défaut (comme dans la vraie base) */
const DEFAULTS = {
  members: () => ({ status: 'actif', member_role: 'membre', registration_date: today(), medical_certificate: false, qss: false, medical_waiver: false, other_defense_sport: false, consent_image: false, consent_data: false, rules_read: false, rules_accepted: false, insurance_informed: false, parental_authorization: false, updated_at: nowIso() }),
  payments: () => ({ status: 'payé', bank_checked: false, archived: false, payment_date: today() }),
  expenses: () => ({ bank_checked: false, archived: false, expense_date: today() }),
  plan_items: () => ({ done: false, position: 0 }),
  attendances: () => ({ present: true }),
  seasons: () => ({ is_active: false, opening_balance: 0 }),
  disciplines: () => ({ is_active: true }),
  levels: () => ({ is_active: true }),
  level_history: () => ({ changed_on: today() }),
  registrations: () => ({ status: 'nouvelle' }),
  prospects: () => ({ source: 'manuel', status: 'a_contacter' }),
};
const NO_ID = new Set(['attendances', 'course_plan_items', 'club_settings']);

/* Relations utilisées par l'appli dans les « select » imbriqués */
const REL = {
  courses: { attendances: { many: 'attendances', fk: 'course_id' } },
  course_plan_items: { plan_items: { one: 'plan_items', fk: 'plan_item_id' }, courses: { one: 'courses', fk: 'course_id' } },
  attendances: { courses: { one: 'courses', fk: 'course_id' } },
};
/* Suppressions en cascade */
const CASCADE = {
  members: [['attendances', 'member_id'], ['level_history', 'member_id']],
  courses: [['attendances', 'course_id'], ['course_plan_items', 'course_id']],
  plan_items: [['course_plan_items', 'plan_item_id']],
};

function parseEmbeds(sel) {
  const out = []; let depth = 0, cur = '';
  for (const ch of (sel || '*') + ',') {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { const t = cur.trim(); const m = t.match(/^(\w+)\((.*)\)$/); if (m) out.push({ name: m[1], inner: m[2].trim() }); cur = ''; }
    else cur += ch;
  }
  return out;
}

class Query {
  constructor(t) { this.t = t; this.filters = []; this.orders = []; this.op = 'select'; this.sel = '*'; }
  select(cols = '*', opts = {}) { if (this.op === 'select') this.sel = cols; else this.returning = true; if (opts.head) this.head = true; if (opts.count) this.wantCount = true; return this; }
  eq(c, v) { this.filters.push(r => r[c] === v || (v != null && r[c] != null && String(r[c]) === String(v))); return this; }
  neq(c, v) { this.filters.push(r => r[c] !== v); return this; }
  gte(c, v) { this.filters.push(r => r[c] != null && r[c] >= v); return this; }
  lte(c, v) { this.filters.push(r => r[c] != null && r[c] <= v); return this; }
  in(c, arr) { const s = new Set((arr || []).map(String)); this.filters.push(r => s.has(String(r[c]))); return this; }
  like(c, p) { const re = new RegExp('^' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$'); this.filters.push(r => re.test(String(r[c] ?? ''))); return this; }
  not(c, op, v) { if (op === 'in') { const s = new Set(String(v).replace(/^\(|\)$/g, '').split(',').map(x => x.trim())); this.filters.push(r => !s.has(String(r[c]))); } return this; }
  order(c, o = {}) { this.orders.push([c, o.ascending !== false]); return this; }
  limit(n) { this.lim = n; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  single() { this.one = 'single'; return this; }
  insert(rows) { this.op = 'insert'; this.payload = rows; return this; }
  update(patch) { this.op = 'update'; this.payload = patch; return this; }
  delete() { this.op = 'delete'; return this; }
  upsert(rows, opts = {}) { this.op = 'upsert'; this.payload = rows; this.conflict = (opts.onConflict || 'id').split(',').map(s => s.trim()); return this; }
  then(res, rej) { try { res(this.run()); } catch (e) { res({ data: null, error: { message: e.message } }); } }

  match(r) { return this.filters.every(f => f(r)); }
  shape(rows) {
    let out = rows.slice();
    for (const [c, asc] of this.orders.slice().reverse()) out.sort((a, b) => { const x = a[c], y = b[c]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * (asc ? 1 : -1); });
    if (this.lim != null) out = out.slice(0, this.lim);
    const embeds = parseEmbeds(this.sel), rel = REL[this.t] || {};
    return out.map(r => {
      const o = clone(r);
      for (const e of embeds) {
        const R = rel[e.name]; if (!R) continue;
        if (R.many) { const rs = table(R.many).filter(x => x[R.fk] === r.id); o[e.name] = e.inner === 'count' ? [{ count: rs.length }] : clone(rs); }
        else o[e.name] = clone(table(R.one).find(x => x.id === r[R.fk]) || null);
      }
      return o;
    });
  }
  result(rows) {
    if (this.one === 'single') return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: 'Élément introuvable' } };
    if (this.one === 'maybe') return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  }
  run() {
    const T = table(this.t);
    if (this.op === 'select') {
      const rows = T.filter(r => this.match(r));
      if (this.head) return { data: null, count: rows.length, error: null };
      return { ...this.result(this.shape(rows)), count: this.wantCount ? rows.length : null };
    }
    if (this.op === 'insert') {
      const list = [].concat(this.payload).map(r => ({ ...(DEFAULTS[this.t]?.() || {}), ...(NO_ID.has(this.t) ? {} : { id: uuid() }), created_at: nowIso(), ...clone(r) }));
      T.push(...list); save();
      return this.returning ? this.result(clone(list)) : { data: null, error: null };
    }
    if (this.op === 'update') {
      const hit = T.filter(r => this.match(r));
      for (const r of hit) {
        if (this.t === 'members' && 'level_id' in this.payload && this.payload.level_id !== r.level_id)
          table('level_history').push({ id: uuid(), member_id: r.id, from_level_id: r.level_id ?? null, to_level_id: this.payload.level_id ?? null, changed_on: today(), notes: null, created_at: nowIso() });
        Object.assign(r, clone(this.payload));
        if ('updated_at' in r) r.updated_at = nowIso();
      }
      save();
      return this.returning ? this.result(clone(hit)) : { data: null, error: null };
    }
    if (this.op === 'delete') {
      const gone = T.filter(r => this.match(r)), ids = new Set(gone.map(r => r.id));
      db[this.t] = T.filter(r => !this.match(r));
      for (const [child, fk] of CASCADE[this.t] || []) db[child] = table(child).filter(r => !ids.has(r[fk]));
      save();
      return { data: null, error: null };
    }
    if (this.op === 'upsert') {
      for (const row of [].concat(this.payload)) {
        const ex = T.find(r => this.conflict.every(k => String(r[k]) === String(row[k])));
        if (ex) Object.assign(ex, clone(row));
        else T.push({ ...(DEFAULTS[this.t]?.() || {}), ...(NO_ID.has(this.t) ? {} : { id: uuid() }), created_at: nowIso(), ...clone(row) });
      }
      save();
      return { data: null, error: null };
    }
  }
}

/* ---------- Authentification de démo : on est connecté d'office comme président ---------- */
let listener = null;
const readSession = () => { try { return localStorage.getItem(SESSION_KEY) === 'out' ? null : { user: DEMO_USER, access_token: 'demo' }; } catch { return { user: DEMO_USER }; } };
const setSession = on => { try { localStorage.setItem(SESSION_KEY, on ? 'in' : 'out'); } catch {} };

export function createClient() {
  return {
    from: t => new Query(t),
    rpc: async (fn, args = {}) => {
      if (fn === 'public_club_info') { const s = db.club_settings[0] || {}; return { data: { club_name: s.club_name, fee_new: s.fee_new, fee_returning: s.fee_returning, fee_jobseeker: s.fee_jobseeker, fee_student: s.fee_student, club_email: s.club_email, bank_holder: s.bank_holder, bank_iban: s.bank_iban, bank_bic: s.bank_bic, bank_name: s.bank_name, club_documents: s.club_documents || {} }, error: null }; }
      if (fn === 'restore_backup') {
        const p = args.payload || {};
        if (!Array.isArray(p.members)) return { data: null, error: { message: 'Fichier de sauvegarde invalide : onglet Membres introuvable.' } };
        for (const t of ['attendances', 'course_plan_items', 'level_history', 'payments', 'expenses', 'plan_items', 'courses', 'members', 'levels', 'disciplines', 'seasons']) db[t] = clone(p[t] || []);
        if (Array.isArray(p.club_settings) && p.club_settings.length) db.club_settings = [clone(p.club_settings[0])];
        save();
        return { data: { membres: db.members.length, paiements: db.payments.length, depenses: db.expenses.length, seances: db.courses.length, presences: db.attendances.length, planification: db.plan_items.length }, error: null };
      }
      return { data: null, error: { message: 'Fonction indisponible dans la démo' } };
    },
    storage: {
      from: () => ({
        upload: async (path, blob) => { files.set(path, URL.createObjectURL(blob)); return { data: { path }, error: null }; },
        createSignedUrl: async path => files.has(path) ? { data: { signedUrl: files.get(path) }, error: null } : { data: null, error: { message: 'Fichier de démonstration indisponible' } },
        getPublicUrl: path => ({ data: { publicUrl: files.get(path) || '#fichier-de-demonstration-indisponible' } }),
        remove: async paths => { (paths || []).forEach(p => files.delete(p)); return { data: [], error: null }; },
      }),
    },
    auth: {
      onAuthStateChange(cb) { listener = cb; setTimeout(() => cb('INITIAL_SESSION', readSession())); return { data: { subscription: { unsubscribe() {} } } }; },
      async signInWithPassword() { setSession(true); const s = readSession(); setTimeout(() => listener?.('SIGNED_IN', s)); return { data: { session: s }, error: null }; },
      async signOut() { setSession(false); setTimeout(() => listener?.('SIGNED_OUT', null)); return { error: null }; },
      async signUp() { return { data: null, error: { message: 'Dans la démo, pas besoin de compte : cliquez sur « Se connecter » avec n’importe quel e-mail et mot de passe.' } }; },
      async resetPasswordForEmail() { return { error: null }; },
      async updateUser() { return { data: {}, error: null }; },
    },
  };
}
