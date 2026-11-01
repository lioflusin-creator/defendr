import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* =====================================================================
   État global
   ===================================================================== */
const S = {
  session: null,
  profile: null,
  settings: null,
  disciplines: [],
  levels: [],
  seasons: [],
  recovery: false,
  authMode: 'login',
  memberFilter: 'tous',
  memberSearch: '',
};
const isAdmin = () => S.profile?.role === 'admin';
const activeSeason = () => S.seasons.find(s => s.is_active) || null;

/* =====================================================================
   Utilitaires
   ===================================================================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const fmtDate = d => d ? new Date(d + (String(d).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDay = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' }) : '';
const fmtMoney = n => (Number(n) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: Number(n) % 1 ? 2 : 0 });
const fullName = m => `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim();
const initials = m => ((m.first_name || '?')[0] + (m.last_name || '')[0] || '').toUpperCase();
const ageOf = d => { if (!d) return null; const b = new Date(d + 'T00:00:00'), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a; };
const isBirthdayMonth = (d, month = new Date().getMonth()) => d && new Date(d + 'T00:00:00').getMonth() === month;
const discName = id => S.disciplines.find(d => d.id === id)?.name || '—';
const levelName = id => S.levels.find(l => l.id === id)?.name || '—';
const waLink = phone => { const p = String(phone || '').replace(/\D/g, ''); return p ? `https://wa.me/${p.startsWith('0') ? '33' + p.slice(1) : p}` : null; };

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 5000 : 2600);
}
function fail(error) {
  console.error(error);
  const m = error?.message || String(error);
  const fr = {
    'Invalid login credentials': 'E-mail ou mot de passe incorrect.',
    'Email not confirmed': 'Adresse e-mail pas encore confirmée : cliquez sur le lien reçu par e-mail.',
    'User already registered': 'Un compte existe déjà avec cette adresse e-mail.',
  }[m];
  toast(fr || 'Erreur : ' + m, 'error');
}

/* Lecture d'un formulaire → objet prêt pour la base */
function readForm(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'number') out[el.name] = el.value === '' ? null : Number(el.value);
    else out[el.name] = el.value.trim() === '' ? null : el.value.trim();
  }
  return out;
}

/* Icônes */
const I = {
  home: '<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.7-3.6 3.3-5.5 6.5-5.5s5.8 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16 14.6c2.8-.3 5 1.4 5.5 4.4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
  euro: '<path d="M18 6.5A7 7 0 1 0 18 17.5"/><path d="M4 10h9M4 14h9"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  chat: '<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  cake: '<path d="M4 21h16v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z"/><path d="M4 16c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5M12 11V7M12 4.5v.01"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] || ''}</svg>`;

/* Fenêtres modales */
function openModal({ title, body, foot = '', size = '', onMount }) {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-back">
      <div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Fermer">${icon('x')}</button></div>
        <div class="modal-body">${body}</div>
        ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
      </div>
    </div>`;
  const back = $('.modal-back', root);
  back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) closeModal(); });
  document.addEventListener('keydown', escClose);
  onMount?.(root);
}
function escClose(e) { if (e.key === 'Escape') closeModal(); }
function closeModal() { $('#modal-root').innerHTML = ''; document.removeEventListener('keydown', escClose); }
function confirmBox(title, text, okLabel = 'Supprimer') {
  return new Promise(resolve => {
    openModal({
      title, size: 'sm',
      body: `<p style="margin:0">${text}</p>`,
      foot: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="confirm-ok">${esc(okLabel)}</button>`,
      onMount: r => {
        $('#confirm-ok', r).onclick = () => { closeModal(); resolve(true); };
        $$('[data-close]', r).forEach(b => b.addEventListener('click', () => resolve(false)));
      },
    });
  });
}

/* =====================================================================
   Navigation
   ===================================================================== */
const NAV = [
  { path: '/', label: 'Tableau de bord', short: 'Accueil', icon: 'home' },
  { path: '/membres', label: 'Membres', short: 'Membres', icon: 'users' },
  { path: '/planning', label: 'Planning', short: 'Planning', icon: 'calendar', soon: true },
  { path: '/planification', label: 'Planification annuelle', icon: 'list', soon: true },
  { path: '/paiements', label: 'Comptabilité', short: 'Compta', icon: 'euro', admin: true, soon: true },
  { path: '/disciplines', label: 'Disciplines', icon: 'target' },
  { path: '/niveaux', label: 'Niveaux', icon: 'layers' },
  { path: '/statistiques', label: 'Statistiques', short: 'Stats', icon: 'chart', soon: true },
  { path: '/whatsapp', label: 'WhatsApp', icon: 'chat', soon: true },
  { path: '/parametres', label: 'Paramètres', icon: 'gear' },
];
const navItems = () => NAV.filter(n => !n.admin || isAdmin());
const currentPath = () => (location.hash.replace(/^#/, '') || '/').split('?')[0];
const go = path => { location.hash = '#' + path; };

function navLinks(path) {
  return navItems().map(n => {
    const active = n.path === '/' ? path === '/' : path.startsWith(n.path);
    return `<a href="#${n.path}" class="${active ? 'active' : ''}">${icon(n.icon)}<span>${esc(n.label)}</span>${n.soon ? '<span class="soon">bientôt</span>' : ''}</a>`;
  }).join('');
}
function sideFoot() {
  return `<div class="side-foot">
    <div class="who">${esc(S.profile?.full_name || S.session?.user?.email)}</div>
    <div class="role">${S.profile?.role === 'admin' ? 'Administrateur' : 'Enseignant'}</div>
    <button data-logout>Se déconnecter</button>
  </div>`;
}
function brand() {
  return `<div class="brand"><div class="logo-mark">D</div><div><div class="brand-name">Defendr</div><div class="brand-club">${esc(S.settings?.club_name || '')}</div></div></div>`;
}

function shell(content) {
  const path = currentPath();
  const tabs = [navItems()[0], navItems()[1], NAV.find(n => n.path === '/planning'), isAdmin() ? NAV.find(n => n.path === '/paiements') : NAV.find(n => n.path === '/statistiques')];
  return `
    <div class="shell">
      <aside class="sidebar">${brand()}<nav class="nav">${navLinks(path)}</nav>${sideFoot()}</aside>
      <div style="flex:1;min-width:0">
        <header class="topbar">${brand()}<button data-drawer aria-label="Menu">${icon('menu')}</button></header>
        <main class="main" id="view">${content}</main>
      </div>
    </div>
    <nav class="tabbar">
      ${tabs.map(n => { const a = n.path === '/' ? path === '/' : path.startsWith(n.path); return `<a href="#${n.path}" class="${a ? 'active' : ''}">${icon(n.icon)}<span>${esc(n.short || n.label)}</span></a>`; }).join('')}
      <button data-drawer>${icon('menu')}<span>Plus</span></button>
    </nav>`;
}
function openDrawer() {
  const d = document.createElement('div');
  d.id = 'drawer';
  d.innerHTML = `<div class="drawer-back"></div><div class="drawer">${brand()}<nav class="nav">${navLinks(currentPath())}</nav>${sideFoot()}</div>`;
  document.body.appendChild(d);
  d.addEventListener('click', e => { if (e.target.classList.contains('drawer-back') || e.target.closest('a')) d.remove(); });
  bindGlobal(d);
}
function bindGlobal(root = document) {
  $$('[data-logout]', root).forEach(b => b.onclick = async () => { await sb.auth.signOut(); });
  $$('[data-drawer]', root).forEach(b => b.onclick = openDrawer);
}

/* =====================================================================
   Démarrage & authentification
   ===================================================================== */
async function loadRefs() {
  const [st, di, le, se] = await Promise.all([
    sb.from('club_settings').select('*').eq('id', 1).maybeSingle(),
    sb.from('disciplines').select('*').order('name'),
    sb.from('levels').select('*').order('rank'),
    sb.from('seasons').select('*').order('created_at', { ascending: false }),
  ]);
  for (const r of [st, di, le, se]) if (r.error) throw r.error;
  S.settings = st.data; S.disciplines = di.data; S.levels = le.data; S.seasons = se.data;
}

async function boot() {
  const app = $('#app');
  if (S.recovery) return renderAuth('reset');
  if (!S.session) return renderAuth(S.authMode);
  const { data: profile, error } = await sb.from('profiles').select('*').eq('id', S.session.user.id).maybeSingle();
  if (error) { fail(error); return renderAuth('login'); }
  S.profile = profile;
  if (!profile || profile.role === 'en_attente') {
    app.innerHTML = `<div class="auth"><div class="auth-card card card-pad">
      <div class="logo-mark">D</div>
      <h1>Compte en attente</h1>
      <p class="lead">Votre compte est bien créé. L'administrateur du club doit maintenant le valider avant que vous puissiez accéder aux données.</p>
      <button class="btn btn-block" data-logout>Se déconnecter</button></div></div>`;
    return bindGlobal(app);
  }
  try { await loadRefs(); } catch (e) { fail(e); }
  route();
}

function renderAuth(mode) {
  S.authMode = mode;
  const titles = {
    login: ['Connexion', 'Accédez à la gestion de votre club.'],
    signup: ['Créer un compte', 'Le premier compte créé devient administrateur du club.'],
    forgot: ['Mot de passe oublié', 'Recevez un lien pour choisir un nouveau mot de passe.'],
    reset: ['Nouveau mot de passe', 'Choisissez votre nouveau mot de passe.'],
  };
  const [t, lead] = titles[mode];
  $('#app').innerHTML = `
    <div class="auth"><form class="auth-card card card-pad" id="auth-form" novalidate>
      <div class="logo-mark">D</div>
      <h1>${t}</h1><p class="lead">${lead}</p>
      ${mode === 'signup' ? `<div class="field"><label for="f-name">Prénom et nom</label><input class="input" id="f-name" name="full_name" autocomplete="name" required></div>` : ''}
      ${mode !== 'reset' ? `<div class="field"><label for="f-email">E-mail</label><input class="input" id="f-email" name="email" type="email" autocomplete="email" required></div>` : ''}
      ${mode !== 'forgot' ? `<div class="field"><label for="f-pass">Mot de passe</label><input class="input" id="f-pass" name="password" type="password" minlength="8" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required>${mode !== 'login' ? '<span class="help">8 caractères minimum.</span>' : ''}</div>` : ''}
      <div id="auth-msg"></div>
      <button class="btn btn-primary btn-block" type="submit">${{ login: 'Se connecter', signup: 'Créer mon compte', forgot: 'Envoyer le lien', reset: 'Enregistrer' }[mode]}</button>
      <div class="auth-links">
        ${mode === 'login' ? `<button type="button" class="link" data-mode="forgot">Mot de passe oublié ?</button><button type="button" class="link" data-mode="signup">Créer un compte</button>` : ''}
        ${mode === 'signup' || mode === 'forgot' ? `<button type="button" class="link" data-mode="login">← Retour à la connexion</button>` : ''}
      </div>
    </form></div>`;
  $$('[data-mode]').forEach(b => b.onclick = () => renderAuth(b.dataset.mode));
  $('#auth-form').onsubmit = async e => {
    e.preventDefault();
    const f = readForm(e.target), btn = $('button[type=submit]', e.target), msg = $('#auth-msg');
    btn.disabled = true;
    try {
      const redirect = location.origin + location.pathname;
      if (mode === 'login') {
        const { error } = await sb.auth.signInWithPassword({ email: f.email, password: f.password });
        if (error) throw error;
      } else if (mode === 'signup') {
        if (!f.full_name || !f.email || (f.password || '').length < 8) throw new Error('Merci de remplir tous les champs (mot de passe de 8 caractères minimum).');
        const { data, error } = await sb.auth.signUp({ email: f.email, password: f.password, options: { data: { full_name: f.full_name }, emailRedirectTo: redirect } });
        if (error) throw error;
        if (!data.session) msg.innerHTML = `<div class="alert info">Compte créé ! Un e-mail de confirmation vient de vous être envoyé. Cliquez sur le lien qu'il contient, puis connectez-vous.</div>`;
      } else if (mode === 'forgot') {
        const { error } = await sb.auth.resetPasswordForEmail(f.email, { redirectTo: redirect });
        if (error) throw error;
        msg.innerHTML = `<div class="alert info">Si un compte existe pour cette adresse, un e-mail vient d'être envoyé.</div>`;
      } else if (mode === 'reset') {
        if ((f.password || '').length < 8) throw new Error('8 caractères minimum.');
        const { error } = await sb.auth.updateUser({ password: f.password });
        if (error) throw error;
        S.recovery = false; toast('Mot de passe mis à jour'); boot();
      }
    } catch (err) {
      msg.innerHTML = `<div class="alert error">${esc({ 'Invalid login credentials': 'E-mail ou mot de passe incorrect.', 'Email not confirmed': 'Adresse e-mail pas encore confirmée : cliquez sur le lien reçu par e-mail.', 'User already registered': 'Un compte existe déjà avec cette adresse e-mail.' }[err.message] || err.message)}</div>`;
    } finally { btn.disabled = false; }
  };
}

/* =====================================================================
   Routeur
   ===================================================================== */
async function route() {
  if (!S.session || !S.profile || S.profile.role === 'en_attente') return;
  const path = currentPath();
  $('#drawer')?.remove();
  closeModal();
  const item = NAV.find(n => n.path !== '/' && path.startsWith(n.path));
  $('#app').innerHTML = shell('<div class="empty">Chargement…</div>');
  bindGlobal();
  window.scrollTo(0, 0);
  const view = $('#view');
  try {
    if (path === '/') await viewDashboard(view);
    else if (path.startsWith('/membres/')) await viewMember(view, path.split('/')[2]);
    else if (path === '/membres') await viewMembers(view);
    else if (path === '/disciplines') await viewDisciplines(view);
    else if (path === '/niveaux') await viewLevels(view);
    else if (path === '/parametres') await viewSettings(view);
    else if (item?.admin && !isAdmin()) view.innerHTML = `<div class="empty">Cette rubrique est réservée à l'administrateur.</div>`;
    else if (item) viewSoon(view, item);
    else go('/');
  } catch (e) { fail(e); view.innerHTML = `<div class="empty">Impossible de charger cette page.</div>`; }
}

function head(title, sub = '', actions = '') {
  return `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
}
function viewSoon(view, item) {
  view.innerHTML = head(item.label) + `<div class="card soon-box"><div class="logo-mark">${icon(item.icon)}</div>
    <h2 class="section-title">Bientôt disponible</h2>
    <p class="muted" style="max-width:420px;margin:0 auto">Cette rubrique arrive dans la prochaine version. En attendant, elle reste accessible dans votre ancienne appli.</p></div>`;
}

/* =====================================================================
   Tableau de bord
   ===================================================================== */
async function viewDashboard(view) {
  const season = activeSeason();
  const membersQ = sb.from('members').select('id, first_name, last_name, birth_date, status, medical_certificate, discipline_id');
  const coursesQ = season ? sb.from('courses').select('id', { count: 'exact', head: true }).eq('season_id', season.id) : sb.from('courses').select('id', { count: 'exact', head: true });
  const payQ = isAdmin() ? (season ? sb.from('payments').select('id, amount, status, payment_date, payment_type, member_id').eq('season_id', season.id).eq('archived', false) : sb.from('payments').select('id, amount, status, payment_date, payment_type, member_id').eq('archived', false)) : null;
  const expQ = isAdmin() ? (season ? sb.from('expenses').select('amount').eq('season_id', season.id).eq('archived', false) : sb.from('expenses').select('amount').eq('archived', false)) : null;
  const [mr, cr, pr, er] = await Promise.all([membersQ, coursesQ, payQ, expQ]);
  for (const r of [mr, cr, pr, er]) if (r?.error) throw r.error;
  const members = mr.data;
  const active = members.filter(m => m.status === 'actif');
  const noCert = active.filter(m => !m.medical_certificate);
  const month = new Date().getMonth();
  const bdays = members.filter(m => m.status === 'actif' && isBirthdayMonth(m.birth_date, month))
    .sort((a, b) => new Date(a.birth_date).getDate() - new Date(b.birth_date).getDate());
  const byDisc = S.disciplines.map(d => ({ name: d.name, n: active.filter(m => m.discipline_id === d.id).length })).filter(x => x.n > 0);
  const maxDisc = Math.max(1, ...byDisc.map(x => x.n));

  let money = '', lastPays = '';
  if (isAdmin()) {
    const pays = pr.data, paid = pays.filter(p => p.status === 'payé').reduce((s, p) => s + Number(p.amount), 0);
    const pending = pays.filter(p => p.status === 'en attente');
    const exp = er.data.reduce((s, e) => s + Number(e.amount), 0);
    const net = Number(season?.opening_balance || 0) + paid - exp;
    money = `
      <div class="card stat accent"><div class="label">Revenus encaissés</div><div class="value">${fmtMoney(paid)}</div><div class="hint">Solde net ${fmtMoney(net)}</div></div>
      <div class="card stat"><div class="label">Paiements en attente</div><div class="value">${pending.length}</div><div class="hint">${fmtMoney(pending.reduce((s, p) => s + Number(p.amount), 0))}</div></div>`;
    const mName = id => { const m = members.find(x => x.id === id); return m ? fullName(m) : '—'; };
    const recent = [...pays].sort((a, b) => b.payment_date.localeCompare(a.payment_date)).slice(0, 5);
    lastPays = `<div class="card card-pad"><h2>Derniers paiements</h2>${recent.length ? recent.map(p => `
      <div class="bday"><div class="grow" style="flex:1"><div style="font-weight:600">${esc(mName(p.member_id))}</div><div class="small muted">${fmtDate(p.payment_date)} · ${esc(p.payment_type)}</div></div>
      <div style="text-align:right"><div style="font-weight:700">${fmtMoney(p.amount)}</div><span class="badge ${p.status === 'payé' ? 'ok' : 'warn'}">${p.status === 'payé' ? 'Payé' : 'En attente'}</span></div></div>`).join('') : '<div class="empty">Aucun paiement pour l’instant.</div>'}</div>`;
  } else {
    money = `<div class="card stat"><div class="label">Certificats manquants</div><div class="value">${noCert.length}</div><div class="hint">membres actifs</div></div>
      <div class="card stat"><div class="label">Anniversaires</div><div class="value">${bdays.length}</div><div class="hint">ce mois-ci</div></div>`;
  }

  view.innerHTML = head('Tableau de bord', `Vue d'ensemble de votre club${season ? ' · saison ' + esc(season.label) : ''}`) + `
    ${!season && isAdmin() ? `<div class="alert info">Aucune saison active. <a href="#/parametres">Créez la saison en cours dans les Paramètres</a> pour suivre la comptabilité par saison.</div>` : ''}
    <div class="grid stats mb">
      <div class="card stat"><div class="label">Membres actifs</div><div class="value">${active.length}</div><div class="hint">${members.length} inscrits au total</div></div>
      <div class="card stat"><div class="label">Cours</div><div class="value">${cr.count ?? 0}</div><div class="hint">${season ? 'cette saison' : 'au total'}</div></div>
      ${money}
    </div>
    <div class="grid two">
      <div class="card card-pad"><h2>Anniversaires de ${MONTHS[month]}</h2>
        ${bdays.length ? bdays.map(m => `<a class="bday" href="#/membres/${m.id}" style="text-decoration:none"><div class="avatar">${esc(initials(m))}</div><div style="flex:1"><div style="font-weight:600">${esc(fullName(m))}</div><div class="small muted">${fmtDay(m.birth_date)} · ${new Date().getFullYear() - Number(m.birth_date.slice(0, 4))} ans</div></div>${new Date(m.birth_date + 'T00:00:00').getDate() === new Date().getDate() ? '<span class="badge accent">Aujourd’hui</span>' : ''}</a>`).join('') : '<div class="empty">Aucun anniversaire ce mois-ci.</div>'}
      </div>
      <div class="card card-pad"><h2>Disciplines</h2>
        ${byDisc.length ? `<div class="bars">${byDisc.map(x => `<div class="bar-row"><span>${esc(x.name)}</span><div class="bar"><span style="width:${(x.n / maxDisc) * 100}%"></span></div><strong>${x.n}</strong></div>`).join('')}</div>` : '<div class="empty">Aucun membre actif rattaché à une discipline.</div>'}
        ${noCert.length && isAdmin() ? `<div class="mt"><a href="#/membres" data-filter="certificat" class="badge warn" style="text-decoration:none">${noCert.length} certificat(s) médical(aux) manquant(s)</a></div>` : ''}
      </div>
      ${lastPays}
    </div>`;
  $$('[data-filter]', view).forEach(a => a.onclick = () => { S.memberFilter = a.dataset.filter; });
}

/* =====================================================================
   Membres
   ===================================================================== */
async function viewMembers(view) {
  const season = activeSeason();
  const [mr, pr] = await Promise.all([
    sb.from('members').select('*').order('last_name'),
    isAdmin() ? (season ? sb.from('payments').select('member_id, amount, status').eq('season_id', season.id) : sb.from('payments').select('member_id, amount, status')) : null,
  ]);
  if (mr.error) throw mr.error;
  if (pr?.error) throw pr.error;
  const members = mr.data;
  const paidBy = {};
  (pr?.data || []).filter(p => p.status === 'payé').forEach(p => { paidBy[p.member_id] = (paidBy[p.member_id] || 0) + Number(p.amount); });
  const balance = m => Number(m.fee_amount || 0) - (paidBy[m.id] || 0);

  const filters = [
    { k: 'tous', label: 'Tous', fn: () => true },
    { k: 'actifs', label: 'Actifs', fn: m => m.status === 'actif' },
    ...(isAdmin() ? [{ k: 'impayes', label: 'Soldes impayés', fn: m => m.status === 'actif' && balance(m) > 0 }] : []),
    { k: 'certificat', label: 'Certificat manquant', fn: m => m.status === 'actif' && !m.medical_certificate },
    { k: 'anniversaires', label: 'Anniversaires du mois', fn: m => isBirthdayMonth(m.birth_date) },
    { k: 'inactifs', label: 'Inactifs', fn: m => m.status === 'inactif' },
  ];
  if (!filters.find(f => f.k === S.memberFilter)) S.memberFilter = 'tous';

  view.innerHTML = head('Membres', `${members.filter(m => m.status === 'actif').length} membres actifs · ${members.length} inscrits`,
    `<button class="btn btn-primary" id="new-member">${icon('plus')}Nouveau membre</button>`) + `
    <div class="toolbar">
      <input class="input" type="search" id="m-search" placeholder="Rechercher un membre…" value="${esc(S.memberSearch)}" aria-label="Rechercher un membre">
      <div class="chips">${filters.map(f => `<button class="chip ${S.memberFilter === f.k ? 'active' : ''}" data-f="${f.k}">${esc(f.label)} <span class="n">${members.filter(f.fn).length}</span></button>`).join('')}</div>
    </div>
    <div class="card" id="m-list"></div>`;

  const draw = () => {
    const q = S.memberSearch.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const f = filters.find(x => x.k === S.memberFilter);
    const rows = members.filter(f.fn).filter(m => !q || [fullName(m), m.email, m.phone].join(' ').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').includes(q));
    const box = $('#m-list');
    if (!rows.length) { box.innerHTML = `<div class="empty">${members.length ? 'Aucun membre ne correspond.' : 'Aucun membre pour l’instant. Ajoutez le premier avec « Nouveau membre ».'}</div>`; return; }
    const certBadge = m => m.medical_certificate ? '<span class="badge ok">Certificat ✓</span>' : '<span class="badge warn">Certificat manquant</span>';
    const statusBadge = m => m.status === 'actif' ? '<span class="badge ok">Actif</span>' : '<span class="badge">Inactif</span>';
    box.innerHTML = `
      <div class="table-wrap only-desktop"><table class="table"><thead><tr><th>Nom</th><th>Contact</th><th>Discipline</th><th>Niveau</th><th>Cert. médical</th>${isAdmin() ? '<th>Solde</th>' : ''}<th>Statut</th></tr></thead><tbody>
        ${rows.map(m => `<tr class="clickable" data-id="${m.id}">
          <td><div class="person"><div class="avatar">${esc(initials(m))}</div><div><div class="name">${esc(fullName(m))}</div>${m.birth_date ? `<div class="meta">${ageOf(m.birth_date)} ans</div>` : ''}</div></div></td>
          <td class="small">${esc(m.phone || '')}<div class="muted">${esc(m.email || '')}</div></td>
          <td>${esc(discName(m.discipline_id))}</td><td>${esc(levelName(m.level_id))}</td>
          <td>${certBadge(m)}${m.qss ? ' <span class="badge">QSS</span>' : ''}</td>
          ${isAdmin() ? `<td>${balance(m) > 0 ? `<span class="badge danger">${fmtMoney(balance(m))}</span>` : '<span class="badge ok">À jour</span>'}</td>` : ''}
          <td>${statusBadge(m)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="list only-mobile">${rows.map(m => `<div class="list-item" data-id="${m.id}">
          <div class="avatar">${esc(initials(m))}</div>
          <div class="grow"><div style="font-weight:600">${esc(fullName(m))}</div><div class="small muted">${esc(discName(m.discipline_id))} · ${esc(levelName(m.level_id))}</div></div>
          <div class="right">${m.status !== 'actif' ? statusBadge(m) : (!m.medical_certificate ? '<span class="badge warn">Certificat</span>' : '')}${isAdmin() && balance(m) > 0 ? `<span class="badge danger">${fmtMoney(balance(m))}</span>` : ''}</div>
        </div>`).join('')}</div>`;
    $$('[data-id]', box).forEach(r => r.onclick = () => go('/membres/' + r.dataset.id));
  };
  draw();
  $('#m-search').oninput = e => { S.memberSearch = e.target.value; draw(); };
  $$('[data-f]', view).forEach(b => b.onclick = () => { S.memberFilter = b.dataset.f; $$('[data-f]', view).forEach(x => x.classList.toggle('active', x === b)); draw(); });
  $('#new-member').onclick = () => memberForm(null, id => go('/membres/' + id));
}

function feeOptions() {
  const s = S.settings || {};
  return [
    ['Nouvel adhérent(e)', s.fee_new], ['Ancien(ne) adhérent(e)', s.fee_returning],
    ['Demandeur(se) d’emploi', s.fee_jobseeker], ['Étudiant(e)', s.fee_student], ['Autre', null],
  ];
}

function memberForm(m, onSaved) {
  const v = m || { status: 'actif', member_role: 'membre', registration_date: new Date().toISOString().slice(0, 10) };
  const sel = (name, opts, cur) => `<select class="input" name="${name}" id="mf-${name}"><option value="">—</option>${opts.map(([val, lab]) => `<option value="${esc(val)}" ${String(cur ?? '') === String(val) ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select>`;
  const inp = (name, label, type = 'text', extra = '') => `<div class="field ${extra}"><label for="mf-${name}">${label}</label><input class="input" id="mf-${name}" name="${name}" type="${type}" value="${esc(v[name] ?? '')}" ${type === 'number' ? 'step="0.01" min="0" inputmode="decimal"' : ''}></div>`;
  const chk = (name, label) => `<label class="check full"><input type="checkbox" name="${name}" ${v[name] ? 'checked' : ''}><span>${label}</span></label>`;
  const body = `<form id="member-form" class="form-grid" novalidate>
    <div class="fieldset-title">Identité</div>
    ${inp('first_name', 'Prénom *')}${inp('last_name', 'Nom *')}
    ${inp('birth_date', 'Date de naissance', 'date')}
    <div class="field"><label for="mf-gender">Genre</label>${sel('gender', [['Femme', 'Femme'], ['Homme', 'Homme'], ['Autre', 'Autre']], v.gender)}</div>
    <div class="fieldset-title">Coordonnées</div>
    ${inp('phone', 'Téléphone', 'tel')}${inp('email', 'E-mail', 'email')}
    ${inp('address', 'Adresse postale', 'text', 'full')}
    ${inp('emergency_contact', 'Contact d’urgence')}${inp('emergency_phone', 'Tél. urgence', 'tel')}
    <div class="fieldset-title">Pratique</div>
    <div class="field"><label for="mf-discipline_id">Discipline</label>${sel('discipline_id', S.disciplines.filter(d => d.is_active || d.id === v.discipline_id).map(d => [d.id, d.name]), v.discipline_id)}</div>
    <div class="field"><label for="mf-level_id">Niveau</label>${sel('level_id', S.levels.filter(l => l.is_active || l.id === v.level_id).map(l => [l.id, l.name]), v.level_id)}</div>
    <div class="field"><label for="mf-status">Statut</label>${sel('status', [['actif', 'Actif'], ['inactif', 'Inactif']], v.status)}</div>
    <div class="field"><label for="mf-member_role">Rôle</label>${sel('member_role', [['membre', 'Membre'], ['animateur', 'Animateur'], ['bureau', 'Membre du bureau'], ['enseignant', 'Enseignant'], ['assistant', 'Assistant']], v.member_role)}</div>
    ${inp('registration_date', 'Date d’inscription', 'date')}
    <div class="field"><label for="mf-tshirt_size">Taille du T-shirt</label>${sel('tshirt_size', ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'].map(x => [x, x]), v.tshirt_size)}</div>
    <div class="fieldset-title">Cotisation</div>
    <div class="field"><label for="mf-fee_type">Type de cotisation</label>${sel('fee_type', feeOptions().map(([l, a]) => [l, a != null ? `${l} — ${fmtMoney(a)}` : l]), v.fee_type)}</div>
    ${inp('fee_amount', 'Montant cotisation (€)', 'number')}
    <div class="fieldset-title">Santé et documents</div>
    ${chk('medical_certificate', 'Certificat médical fourni')}
    ${chk('qss', 'QSS (Questionnaire de Santé Sportive) rempli')}
    ${chk('medical_waiver', 'Décharge médicale signée')}
    ${inp('medical_waiver_validity', 'Décharge valable jusqu’au', 'date')}
    <div class="field full"><label for="mf-medical_notes">Notes médicales</label><textarea class="input" id="mf-medical_notes" name="medical_notes">${esc(v.medical_notes ?? '')}</textarea><span class="help">Ne notez que ce qui est utile à la sécurité pendant les cours.</span></div>
    <div class="fieldset-title">Origine et expérience</div>
    ${inp('how_found', 'Comment avez-vous connu le club ?', 'text', 'full')}
    ${chk('other_defense_sport', 'A déjà pratiqué un autre sport de défense')}
    ${inp('other_defense_sport_details', 'Lequel / combien de temps ?', 'text', 'full')}
    <div class="fieldset-title">Consentements et règlement</div>
    ${chk('consent_image', 'Autorisation du droit à l’image')}
    ${chk('consent_data', 'Consentement à l’utilisation des données')}
    ${chk('rules_read', 'Lecture du règlement intérieur')}
    ${chk('rules_accepted', 'Acceptation sans réserve du règlement intérieur')}
    ${chk('insurance_informed', 'A pris connaissance de la possibilité de souscrire une assurance complémentaire')}
  </form>`;
  openModal({
    title: m ? 'Modifier le membre' : 'Nouveau membre', body,
    foot: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="mf-save">Enregistrer</button>`,
    onMount: root => {
      const fee = $('#mf-fee_type', root), amt = $('#mf-fee_amount', root);
      fee.onchange = () => { const o = feeOptions().find(([l]) => l === fee.value); if (o && o[1] != null) amt.value = o[1]; };
      $('#mf-save', root).onclick = async () => {
        const data = readForm($('#member-form', root));
        if (!data.first_name || !data.last_name) return toast('Le prénom et le nom sont obligatoires.', 'error');
        if (!data.status) data.status = 'actif';
        if (!data.member_role) data.member_role = 'membre';
        const btn = $('#mf-save', root); btn.disabled = true;
        const q = m ? sb.from('members').update(data).eq('id', m.id).select().single() : sb.from('members').insert(data).select().single();
        const { data: saved, error } = await q;
        btn.disabled = false;
        if (error) return fail(error);
        closeModal(); toast(m ? 'Membre mis à jour' : 'Membre ajouté');
        onSaved?.(saved.id);
      };
    },
  });
}

async function viewMember(view, id) {
  const season = activeSeason();
  const [mr, pr, ar] = await Promise.all([
    sb.from('members').select('*').eq('id', id).maybeSingle(),
    isAdmin() ? sb.from('payments').select('*').eq('member_id', id).order('payment_date', { ascending: false }) : null,
    sb.from('attendances').select('present, notes, courses(title, course_date, discipline_id)').eq('member_id', id),
  ]);
  if (mr.error) throw mr.error;
  const m = mr.data;
  if (!m) { view.innerHTML = `<div class="empty">Membre introuvable. <a href="#/membres">Retour à la liste</a></div>`; return; }
  const pays = pr?.data || [];
  const seasonPays = season ? pays.filter(p => p.season_id === season.id) : pays;
  const paid = seasonPays.filter(p => p.status === 'payé').reduce((s, p) => s + Number(p.amount), 0);
  const due = Number(m.fee_amount || 0) - paid;
  const att = (ar.data || []).filter(a => a.courses).sort((a, b) => b.courses.course_date.localeCompare(a.courses.course_date));
  const present = att.filter(a => a.present).length;
  const yes = b => b ? '<span class="badge ok">Oui</span>' : '<span class="badge warn">Non</span>';
  const wa = waLink(m.phone);

  view.innerHTML = `
    <div class="row mb"><a href="#/membres" class="btn btn-sm">${icon('back')}Membres</a></div>
    <div class="card card-pad mb">
      <div class="row wrap between">
        <div class="person"><div class="avatar lg">${esc(initials(m))}</div><div>
          <h1 style="font-family:var(--display);text-transform:uppercase;margin:0;font-size:26px;line-height:1.1">${esc(fullName(m))}</h1>
          <div class="row wrap" style="gap:6px;margin-top:6px">
            ${m.status === 'actif' ? '<span class="badge ok">Actif</span>' : '<span class="badge">Inactif</span>'}
            <span class="badge">${esc(discName(m.discipline_id))}</span><span class="badge">${esc(levelName(m.level_id))}</span>
            ${m.birth_date ? `<span class="badge">${ageOf(m.birth_date)} ans</span>` : ''}
            ${isBirthdayMonth(m.birth_date) ? `<span class="badge accent">Anniversaire le ${fmtDay(m.birth_date)}</span>` : ''}
          </div></div></div>
        <div class="actions">
          ${m.phone ? `<a class="btn btn-sm" href="tel:${esc(m.phone.replace(/\s/g, ''))}">${icon('phone')}Appeler</a>` : ''}
          ${wa ? `<a class="btn btn-sm" href="${wa}" target="_blank" rel="noopener">${icon('chat')}WhatsApp</a>` : ''}
          ${m.email ? `<a class="btn btn-sm" href="mailto:${esc(m.email)}">${icon('mail')}E-mail</a>` : ''}
          <button class="btn btn-sm btn-primary" id="edit">${icon('edit')}Modifier</button>
        </div>
      </div>
    </div>
    <div class="grid two">
      <div class="card card-pad"><h2>Coordonnées</h2><dl class="kv">
        <dt>Téléphone</dt><dd>${esc(m.phone || '—')}</dd><dt>E-mail</dt><dd>${esc(m.email || '—')}</dd>
        <dt>Adresse</dt><dd>${esc(m.address || '—')}</dd><dt>Date de naissance</dt><dd>${fmtDate(m.birth_date)}</dd>
        <dt>Genre</dt><dd>${esc(m.gender || '—')}</dd>
        <dt>Contact d’urgence</dt><dd>${esc(m.emergency_contact || '—')}${m.emergency_phone ? ` · <a href="tel:${esc(m.emergency_phone.replace(/\s/g, ''))}">${esc(m.emergency_phone)}</a>` : ''}</dd>
      </dl></div>
      <div class="card card-pad"><h2>Inscription</h2><dl class="kv">
        <dt>Date d’inscription</dt><dd>${fmtDate(m.registration_date)}</dd><dt>Rôle</dt><dd>${esc(m.member_role || '—')}</dd>
        <dt>T-shirt</dt><dd>${esc(m.tshirt_size || '—')}</dd><dt>Cotisation</dt><dd>${esc(m.fee_type || '—')}${m.fee_amount != null ? ' · ' + fmtMoney(m.fee_amount) : ''}</dd>
        <dt>Connu le club par</dt><dd>${esc(m.how_found || '—')}</dd>
        <dt>Autre sport de défense</dt><dd>${m.other_defense_sport ? 'Oui' + (m.other_defense_sport_details ? ' — ' + esc(m.other_defense_sport_details) : '') : 'Non'}</dd>
      </dl></div>
      <div class="card card-pad"><h2>Santé et documents</h2><dl class="kv">
        <dt>Certificat médical</dt><dd>${yes(m.medical_certificate)}</dd><dt>QSS</dt><dd>${yes(m.qss)}</dd>
        <dt>Décharge médicale</dt><dd>${yes(m.medical_waiver)}${m.medical_waiver_validity ? ' · jusqu’au ' + fmtDate(m.medical_waiver_validity) : ''}</dd><dt>Notes médicales</dt><dd>${esc(m.medical_notes || '—')}</dd>
      </dl></div>
      <div class="card card-pad"><h2>Consentements</h2><dl class="kv">
        <dt>Droit à l’image</dt><dd>${yes(m.consent_image)}</dd><dt>Utilisation des données</dt><dd>${yes(m.consent_data)}</dd>
        <dt>Règlement lu</dt><dd>${yes(m.rules_read)}</dd><dt>Règlement accepté</dt><dd>${yes(m.rules_accepted)}</dd>
        <dt>Info assurance</dt><dd>${yes(m.insurance_informed)}</dd>
      </dl></div>
      ${isAdmin() ? `<div class="card card-pad"><div class="row between"><h2 style="margin:0">Paiements${season ? ' · ' + esc(season.label) : ''}</h2>
          ${due > 0 ? `<span class="badge danger">Reste ${fmtMoney(due)}</span>` : (m.fee_amount ? '<span class="badge ok">À jour</span>' : '')}</div>
        <div class="small muted mb">Payé : ${fmtMoney(paid)}${m.fee_amount != null ? ' sur ' + fmtMoney(m.fee_amount) : ''}</div>
        ${seasonPays.length ? seasonPays.map(p => `<div class="bday"><div style="flex:1"><div style="font-weight:600">${esc(p.payment_type)}</div><div class="small muted">${fmtDate(p.payment_date)}${p.method ? ' · ' + esc(p.method) : ''}${p.bank_checked ? ' · pointé' : ''}</div></div><div style="text-align:right"><div style="font-weight:700">${fmtMoney(p.amount)}</div><span class="badge ${p.status === 'payé' ? 'ok' : 'warn'}">${p.status === 'payé' ? 'Payé' : 'En attente'}</span></div></div>`).join('') : '<div class="empty">Aucun paiement enregistré.</div>'}
        <p class="small muted">L’enregistrement des paiements arrive avec la rubrique Comptabilité.</p>
      </div>` : ''}
      <div class="card card-pad"><div class="row between"><h2 style="margin:0">Historique des cours</h2>${att.length ? `<span class="badge">${present}/${att.length} présences</span>` : ''}</div>
        ${att.length ? `<div class="mt">${att.slice(0, 15).map(a => `<div class="bday"><div style="flex:1"><div style="font-weight:600">${esc(a.courses.title)}</div><div class="small muted">${fmtDate(a.courses.course_date)}</div></div>${a.present ? '<span class="badge ok">Présent</span>' : '<span class="badge">Absent</span>'}</div>`).join('')}</div>` : '<div class="empty">Aucun cours enregistré.</div>'}
      </div>
    </div>
    <div class="mt"><button class="btn btn-danger btn-sm" id="del">${icon('trash')}Supprimer ce membre</button></div>`;
  $('#edit').onclick = () => memberForm(m, () => route());
  $('#del').onclick = async () => {
    if (!await confirmBox('Supprimer le membre', `Supprimer définitivement <strong>${esc(fullName(m))}</strong> ? Ses présences seront aussi supprimées. Pour un membre qui arrête, préférez le statut « Inactif ».`)) return;
    const { error } = await sb.from('members').delete().eq('id', m.id);
    if (error) return fail(error);
    toast('Membre supprimé'); go('/membres');
  };
}

/* =====================================================================
   Disciplines & niveaux
   ===================================================================== */
async function viewDisciplines(view) {
  const { data: members, error } = await sb.from('members').select('discipline_id, status');
  if (error) throw error;
  S.disciplines = (await sb.from('disciplines').select('*').order('name')).data || S.disciplines;
  view.innerHTML = head('Disciplines', `${S.disciplines.length} discipline(s) enregistrée(s)`, isAdmin() ? `<button class="btn btn-primary" id="add">${icon('plus')}Nouvelle discipline</button>` : '') +
    (S.disciplines.length ? `<div class="grid two">${S.disciplines.map(d => {
      const n = members.filter(m => m.discipline_id === d.id && m.status === 'actif').length;
      return `<div class="card card-pad"><div class="row between"><h2 style="margin:0">${esc(d.name)}</h2>${d.is_active ? '<span class="badge ok">Active</span>' : '<span class="badge">Inactive</span>'}</div>
        <p class="muted small">${esc(d.description || '')}</p>
        <div class="row between"><span class="small">${n} membre(s) actif(s)</span>${isAdmin() ? `<div><button class="icon-btn" data-edit="${d.id}" aria-label="Modifier">${icon('edit')}</button><button class="icon-btn" data-del="${d.id}" aria-label="Supprimer">${icon('trash')}</button></div>` : ''}</div></div>`;
    }).join('')}</div>` : `<div class="card empty">Aucune discipline. Ajoutez-en une pour commencer.</div>`);
  const form = d => openModal({
    title: d ? 'Modifier la discipline' : 'Nouvelle discipline', size: 'sm',
    body: `<form id="df"><div class="field"><label for="df-name">Nom *</label><input class="input" id="df-name" name="name" value="${esc(d?.name || '')}"></div>
      <div class="field"><label for="df-desc">Description</label><input class="input" id="df-desc" name="description" value="${esc(d?.description || '')}"></div>
      <label class="check"><input type="checkbox" name="is_active" ${!d || d.is_active ? 'checked' : ''}><span>Discipline active</span></label></form>`,
    foot: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="df-save">Enregistrer</button>`,
    onMount: r => $('#df-save', r).onclick = async () => {
      const data = readForm($('#df', r));
      if (!data.name) return toast('Le nom est obligatoire.', 'error');
      const { error } = d ? await sb.from('disciplines').update(data).eq('id', d.id) : await sb.from('disciplines').insert(data);
      if (error) return fail(error);
      closeModal(); toast('Discipline enregistrée'); route();
    },
  });
  $('#add') && ($('#add').onclick = () => form(null));
  $$('[data-edit]', view).forEach(b => b.onclick = () => form(S.disciplines.find(d => d.id === b.dataset.edit)));
  $$('[data-del]', view).forEach(b => b.onclick = async () => {
    const d = S.disciplines.find(x => x.id === b.dataset.del);
    if (!await confirmBox('Supprimer la discipline', `Supprimer « ${esc(d.name)} » ? Les membres concernés n’auront plus de discipline. Vous pouvez aussi simplement la rendre inactive.`)) return;
    const { error } = await sb.from('disciplines').delete().eq('id', d.id);
    if (error) return fail(error);
    toast('Discipline supprimée'); route();
  });
}

async function viewLevels(view) {
  const { data: members, error } = await sb.from('members').select('level_id, status');
  if (error) throw error;
  S.levels = (await sb.from('levels').select('*').order('rank')).data || S.levels;
  view.innerHTML = head('Niveaux', `${S.levels.length} niveau(x) enregistré(s)`, isAdmin() ? `<button class="btn btn-primary" id="add">${icon('plus')}Nouveau niveau</button>` : '') +
    (S.levels.length ? `<div class="card"><div class="list">${S.levels.map(l => `
      <div class="list-item" style="cursor:default"><div class="avatar">#${l.rank}</div>
        <div class="grow"><div style="font-weight:600">${esc(l.name)}</div><div class="small muted">${members.filter(m => m.level_id === l.id && m.status === 'actif').length} membre(s) actif(s)</div></div>
        ${l.is_active ? '<span class="badge ok">Actif</span>' : '<span class="badge">Inactif</span>'}
        ${isAdmin() ? `<button class="icon-btn" data-edit="${l.id}" aria-label="Modifier">${icon('edit')}</button><button class="icon-btn" data-del="${l.id}" aria-label="Supprimer">${icon('trash')}</button>` : ''}
      </div>`).join('')}</div></div>` : `<div class="card empty">Aucun niveau. Ajoutez-en un pour commencer.</div>`);
  const form = l => openModal({
    title: l ? 'Modifier le niveau' : 'Nouveau niveau', size: 'sm',
    body: `<form id="lf"><div class="field"><label for="lf-name">Nom *</label><input class="input" id="lf-name" name="name" value="${esc(l?.name || '')}"></div>
      <div class="field"><label for="lf-rank">Ordre *</label><input class="input" id="lf-rank" name="rank" type="number" min="1" value="${l?.rank ?? (Math.max(0, ...S.levels.map(x => x.rank)) + 1)}"><span class="help">1 = premier niveau (débutant).</span></div>
      <label class="check"><input type="checkbox" name="is_active" ${!l || l.is_active ? 'checked' : ''}><span>Niveau actif</span></label></form>`,
    foot: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="lf-save">Enregistrer</button>`,
    onMount: r => $('#lf-save', r).onclick = async () => {
      const data = readForm($('#lf', r));
      if (!data.name || !data.rank) return toast('Le nom et l’ordre sont obligatoires.', 'error');
      const { error } = l ? await sb.from('levels').update(data).eq('id', l.id) : await sb.from('levels').insert(data);
      if (error) return fail(error);
      closeModal(); toast('Niveau enregistré'); route();
    },
  });
  $('#add') && ($('#add').onclick = () => form(null));
  $$('[data-edit]', view).forEach(b => b.onclick = () => form(S.levels.find(x => x.id === b.dataset.edit)));
  $$('[data-del]', view).forEach(b => b.onclick = async () => {
    const l = S.levels.find(x => x.id === b.dataset.del);
    if (!await confirmBox('Supprimer le niveau', `Supprimer « ${esc(l.name)} » ? Les membres concernés n’auront plus de niveau.`)) return;
    const { error } = await sb.from('levels').delete().eq('id', l.id);
    if (error) return fail(error);
    toast('Niveau supprimé'); route();
  });
}

/* =====================================================================
   Paramètres
   ===================================================================== */
async function viewSettings(view) {
  if (!isAdmin()) {
    view.innerHTML = head('Paramètres') + `<div class="card card-pad"><h2>Mon compte</h2><dl class="kv"><dt>Nom</dt><dd>${esc(S.profile.full_name || '—')}</dd><dt>E-mail</dt><dd>${esc(S.session.user.email)}</dd><dt>Rôle</dt><dd>Enseignant</dd></dl>
      <p class="small muted mt">Les réglages du club sont gérés par l’administrateur.</p><button class="btn mt" data-logout>${icon('logout')}Se déconnecter</button></div>`;
    return bindGlobal(view);
  }
  await loadRefs();
  const { data: team, error } = await sb.from('profiles').select('*').order('created_at');
  if (error) throw error;
  const s = S.settings;
  const num = (name, label, ph = '') => `<div class="field"><label for="st-${name}">${label}</label><input class="input" id="st-${name}" name="${name}" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(s[name] ?? '')}" placeholder="${ph}"></div>`;
  const tagBox = (key, label, help) => `<div class="field"><label>${label}</label><div class="tags" data-tags="${key}">${(s[key] || []).map((t, i) => `<span class="tag">${esc(t)}<button type="button" data-rm="${key}:${i}" aria-label="Retirer ${esc(t)}">×</button></span>`).join('') || '<span class="small muted">Aucun élément</span>'}</div>
    <div class="tag-add"><input class="input" data-new="${key}" placeholder="${help}" aria-label="Ajouter : ${label}"><button type="button" class="btn" data-add="${key}">Ajouter</button></div></div>`;

  view.innerHTML = head('Paramètres', 'Configurez votre club') + `
    <div class="grid two">
      <form class="card card-pad" id="club-form">
        <h2>Club</h2>
        <div class="field"><label for="st-club_name">Nom du club *</label><input class="input" id="st-club_name" name="club_name" value="${esc(s.club_name)}"></div>
        <div class="section-title mt">Cotisations annuelles (€)</div>
        <div class="form-grid">${num('fee_new', 'Nouvel adhérent(e)', '150')}${num('fee_returning', 'Ancien(ne) adhérent(e)', '130')}${num('fee_jobseeker', 'Demandeur(se) d’emploi', '80')}${num('fee_student', 'Étudiant(e)', '90')}</div>
        <div class="section-title mt">Horaires par défaut des cours</div>
        <div class="form-grid">
          <div class="field"><label for="st-start">Heure de début</label><input class="input" id="st-start" name="default_start_time" type="time" value="${esc((s.default_start_time || '').slice(0, 5))}"></div>
          <div class="field"><label for="st-end">Heure de fin</label><input class="input" id="st-end" name="default_end_time" type="time" value="${esc((s.default_end_time || '').slice(0, 5))}"></div>
        </div>
        <div class="field"><label for="st-wa">Votre numéro WhatsApp (rappel anniversaires)</label><input class="input" id="st-wa" name="whatsapp_number" type="tel" value="${esc(s.whatsapp_number || '')}" placeholder="06 12 34 56 78"></div>
        <button class="btn btn-primary" type="submit">Enregistrer</button>
      </form>

      <div class="card card-pad" id="tags-card">
        <h2>Catégories & salles</h2>
        ${tagBox('revenue_types', 'Types de recettes', 'ex : Cotisation annuelle')}
        ${tagBox('expense_categories', 'Catégories de dépenses', 'ex : Loyer')}
        ${tagBox('rooms', 'Salles disponibles', 'ex : Dojo 1')}
      </div>

      <form class="card card-pad" id="thr-form">
        <h2>Seuils d’assiduité</h2>
        <p class="small muted">Pourcentage de présence minimum pour classer un adhérent dans chaque catégorie (page Statistiques).</p>
        <div class="form-grid">
          <div class="field"><label for="st-ta">Assidu à partir de (%)</label><input class="input" id="st-ta" name="threshold_assidu" type="number" min="0" max="100" value="${s.threshold_assidu}"></div>
          <div class="field"><label for="st-tr">Régulier à partir de (%)</label><input class="input" id="st-tr" name="threshold_regulier" type="number" min="0" max="100" value="${s.threshold_regulier}"></div>
          <div class="field"><label for="st-tk">À risque à partir de (%)</label><input class="input" id="st-tk" name="threshold_risque" type="number" min="0" max="100" value="${s.threshold_risque}"></div>
        </div>
        <button class="btn btn-primary" type="submit">Enregistrer</button>
      </form>

      <div class="card card-pad">
        <div class="row between"><h2 style="margin:0">Saisons</h2><button class="btn btn-sm" id="new-season">${icon('plus')}Nouvelle saison</button></div>
        <div class="mt">${S.seasons.length ? S.seasons.map(se => `<div class="bday"><div style="flex:1"><div style="font-weight:600">${esc(se.label)}</div><div class="small muted">Créée le ${fmtDate(se.created_at.slice(0, 10))} · solde de départ ${fmtMoney(se.opening_balance)}${se.closed_at ? ' · clôturée le ' + fmtDate(se.closed_at.slice(0, 10)) : ''}</div></div>
          ${se.is_active ? '<span class="badge ok">Active</span>' : ''}
          <button class="icon-btn" data-se-edit="${se.id}" aria-label="Modifier">${icon('edit')}</button>
          ${se.is_active ? `<button class="btn btn-sm" data-se-close="${se.id}">Clôturer</button>` : (!se.closed_at ? `<button class="btn btn-sm" data-se-act="${se.id}">Activer</button>` : '')}</div>`).join('') : '<div class="empty">Aucune saison. Créez la saison en cours (ex : 2026/2027).</div>'}</div>
      </div>

      <div class="card card-pad">
        <h2>Équipe</h2>
        <p class="small muted">Pour donner accès à un enseignant : il crée son compte depuis l’écran de connexion (« Créer un compte »), puis vous le validez ici en choisissant son rôle. Les enseignants n’ont pas accès à la comptabilité.</p>
        ${team.map(p => `<div class="bday"><div class="avatar">${esc((p.full_name || '?').slice(0, 2).toUpperCase())}</div><div style="flex:1"><div style="font-weight:600">${esc(p.full_name || '—')}</div>${p.id === S.profile.id ? '<div class="small muted">Vous</div>' : ''}</div>
          ${p.id === S.profile.id ? '<span class="badge accent">Administrateur</span>' : `<select class="input" style="width:auto" data-role="${p.id}" aria-label="Rôle de ${esc(p.full_name || '')}">
            <option value="en_attente" ${p.role === 'en_attente' ? 'selected' : ''}>En attente (aucun accès)</option>
            <option value="enseignant" ${p.role === 'enseignant' ? 'selected' : ''}>Enseignant</option>
            <option value="admin" ${p.role === 'admin' ? 'selected' : ''}>Administrateur</option></select>`}</div>`).join('')}
      </div>
    </div>`;

  const save = async (data, msg = 'Paramètres enregistrés') => {
    const { error } = await sb.from('club_settings').update(data).eq('id', 1);
    if (error) { fail(error); return false; }
    Object.assign(S.settings, data); toast(msg); return true;
  };
  $('#club-form').onsubmit = async e => {
    e.preventDefault();
    const d = readForm(e.target);
    if (!d.club_name) return toast('Le nom du club est obligatoire.', 'error');
    if (await save(d)) $$('.brand-club').forEach(x => x.textContent = d.club_name);
  };
  $('#thr-form').onsubmit = async e => { e.preventDefault(); await save(readForm(e.target)); };
  const tags = $('#tags-card');
  tags.onclick = async e => {
    const rm = e.target.closest('[data-rm]'), add = e.target.closest('[data-add]');
    if (rm) { const [k, i] = rm.dataset.rm.split(':'); const arr = [...(S.settings[k] || [])]; arr.splice(+i, 1); if (await save({ [k]: arr }, 'Élément retiré')) route(); }
    if (add) { const k = add.dataset.add, inp = $(`[data-new="${k}"]`, tags), v = inp.value.trim(); if (!v) return; if (await save({ [k]: [...(S.settings[k] || []), v] }, 'Élément ajouté')) route(); }
  };
  $$('[data-new]', tags).forEach(inp => inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $(`[data-add="${inp.dataset.new}"]`, tags).click(); } });

  const seasonForm = se => {
    const y = new Date().getFullYear(), m = new Date().getMonth();
    const def = m >= 7 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
    openModal({
      title: se ? 'Modifier la saison' : 'Nouvelle saison', size: 'sm',
      body: `<form id="sf"><div class="field"><label for="sf-label">Nom *</label><input class="input" id="sf-label" name="label" value="${esc(se?.label || def)}"></div>
        <div class="field"><label for="sf-ob">Solde en début de saison (€)</label><input class="input" id="sf-ob" name="opening_balance" type="number" step="0.01" value="${esc(se?.opening_balance ?? 0)}"><span class="help">Le solde du compte bancaire du club au début de la saison.</span></div>
        ${se ? '' : '<label class="check"><input type="checkbox" name="activate" checked><span>En faire la saison active</span></label>'}</form>`,
      foot: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="sf-save">Enregistrer</button>`,
      onMount: r => $('#sf-save', r).onclick = async () => {
        const d = readForm($('#sf', r)); const activate = d.activate; delete d.activate;
        if (!d.label) return toast('Le nom est obligatoire.', 'error');
        d.opening_balance = d.opening_balance ?? 0;
        if (se) { const { error } = await sb.from('seasons').update(d).eq('id', se.id); if (error) return fail(error); }
        else {
          if (activate) { const { error: e1 } = await sb.from('seasons').update({ is_active: false }).eq('is_active', true); if (e1) return fail(e1); }
          const { error } = await sb.from('seasons').insert({ ...d, is_active: !!activate }); if (error) return fail(error);
        }
        closeModal(); toast('Saison enregistrée'); route();
      },
    });
  };
  $('#new-season').onclick = () => seasonForm(null);
  $$('[data-se-edit]', view).forEach(b => b.onclick = () => seasonForm(S.seasons.find(x => x.id === b.dataset.seEdit)));
  $$('[data-se-act]', view).forEach(b => b.onclick = async () => {
    const { error: e1 } = await sb.from('seasons').update({ is_active: false }).eq('is_active', true); if (e1) return fail(e1);
    const { error } = await sb.from('seasons').update({ is_active: true }).eq('id', b.dataset.seAct); if (error) return fail(error);
    toast('Saison activée'); route();
  });
  $$('[data-se-close]', view).forEach(b => b.onclick = async () => {
    if (!await confirmBox('Clôturer la saison', 'La saison ne sera plus active. Pensez à créer la nouvelle saison ensuite. Les données restent consultables.', 'Clôturer')) return;
    const { error } = await sb.from('seasons').update({ is_active: false, closed_at: new Date().toISOString() }).eq('id', b.dataset.seClose);
    if (error) return fail(error);
    toast('Saison clôturée'); route();
  });
  $$('[data-role]', view).forEach(sel => sel.onchange = async () => {
    const { error } = await sb.from('profiles').update({ role: sel.value }).eq('id', sel.dataset.role);
    if (error) return fail(error);
    toast('Rôle mis à jour');
  });
}

/* =====================================================================
   Lancement
   ===================================================================== */
window.addEventListener('hashchange', route);
sb.auth.onAuthStateChange((event, session) => {
  const was = S.session?.user?.id;
  S.session = session;
  if (event === 'PASSWORD_RECOVERY') { S.recovery = true; return setTimeout(boot); }
  if (event === 'SIGNED_OUT') { S.profile = null; S.authMode = 'login'; return setTimeout(boot); }
  if (event === 'INITIAL_SESSION' || (event === 'SIGNED_IN' && was !== session?.user?.id)) setTimeout(boot);
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
