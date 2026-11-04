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
const isAdmin = () => ['admin', 'tresorier'].includes(S.profile?.role);
const isPresident = () => S.profile?.role === 'admin';
const ROLE_LABELS = { admin: 'Président(e)', tresorier: 'Trésorier(ère)', enseignant: 'Enseignant(e)', en_attente: 'En attente' };
const roleLabel = r => ROLE_LABELS[r] || r;
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
  left: '<path d="M15 5l-7 7 7 7"/>',
  up: '<path d="M5 15l7-7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M8 7h8M8 11h6"/>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
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
  { path: '/planning', label: 'Planning', short: 'Planning', icon: 'calendar' },
  { path: '/planification', label: 'Planification annuelle', icon: 'list' },
  { path: '/guide', label: 'Guide enseignant', icon: 'book' },
  { path: '/paiements', label: 'Comptabilité', short: 'Compta', icon: 'euro', admin: true },
  { path: '/disciplines', label: 'Disciplines', icon: 'target' },
  { path: '/niveaux', label: 'Niveaux', icon: 'layers' },
  { path: '/statistiques', label: 'Statistiques', short: 'Stats', icon: 'chart' },
  { path: '/whatsapp', label: 'WhatsApp', icon: 'chat' },
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
    <div class="role">${esc(roleLabel(S.profile?.role))}</div>
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
      <p class="lead">Votre compte est bien créé. Le président ou le trésorier du club doit maintenant le valider avant que vous puissiez accéder aux données.</p>
      <button class="btn btn-block" data-logout>Se déconnecter</button></div></div>`;
    return bindGlobal(app);
  }
  try { await loadRefs(); } catch (e) { fail(e); }
  // Le logiciel s'ouvre toujours sur le tableau de bord, même s'il a été quitté sur une autre page
  if (!S.opened) { S.opened = true; if (currentPath() !== '/') history.replaceState(null, '', location.pathname + location.search + '#/'); }
  route();
}

function renderAuth(mode) {
  S.authMode = mode;
  const titles = {
    login: ['Connexion', 'Accédez à la gestion de votre club.'],
    signup: ['Créer un compte', 'Après création, votre compte sera validé par le président ou le trésorier du club.'],
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
  const seq = S.routeSeq = (S.routeSeq || 0) + 1; // une page remplacée pendant son chargement s'arrête sans erreur
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
    else if (path === '/planning') await viewPlanning(view);
    else if (path === '/paiements' && isAdmin()) await viewAccounting(view);
    else if (path === '/bilan' && isAdmin()) await viewBilan(view);
    else if (path === '/statistiques') await viewStats(view);
    else if (path === '/planification') await viewPlan(view);
    else if (path === '/guide') await viewGuide(view);
    else if (path === '/whatsapp') await viewWhatsApp(view);
    else if (path === '/disciplines') await viewDisciplines(view);
    else if (path === '/niveaux') await viewLevels(view);
    else if (path === '/parametres') await viewSettings(view);
    else if (item?.admin && !isAdmin()) view.innerHTML = `<div class="empty">Cette rubrique est réservée au président et au trésorier.</div>`;
    else if (item) viewSoon(view, item);
    else go('/');
  } catch (e) {
    if (seq !== S.routeSeq || !view.isConnected) return; // page déjà remplacée : erreur sans importance
    fail(e); view.innerHTML = `<div class="empty">Impossible de charger cette page.</div>`;
  }
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
/* Justificatif de santé : un certificat médical OU un QSS rempli (« tout non ») suffit */
const hasHealthDoc = m => !!(m.medical_certificate || m.qss);
function healthBadge(m, short = false) {
  if (m.medical_certificate) return `<span class="badge ok">${short ? 'Certificat' : 'Certificat ✓'}</span>`;
  if (m.qss) return `<span class="badge ok">${short ? 'QSS' : 'QSS ✓'}</span>`;
  return `<span class="badge warn">${short ? 'Certificat' : 'Certificat / QSS manquant'}</span>`;
}

/* Documents et autorisations à relancer pour un membre actif */
function memberIssues(m) {
  if (m.status !== 'actif') return [];
  const out = [], today = new Date(), soon = isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30)), now = isoDay(today);
  const waiverValid = m.medical_waiver && m.medical_waiver_validity && m.medical_waiver_validity >= now;
  if (!hasHealthDoc(m)) {
    const ask = 'un certificat médical ou le questionnaire de santé (QSS)';
    if (m.medical_waiver && m.medical_waiver_validity && m.medical_waiver_validity < now) out.push({ label: `Décharge expirée le ${fmtDate(m.medical_waiver_validity)}`, cls: 'danger', ask: `${ask} (ta décharge a expiré)` });
    else if (waiverValid && m.medical_waiver_validity <= soon) out.push({ label: `Décharge expire le ${fmtDate(m.medical_waiver_validity)}`, cls: 'warn', ask: `${ask} avant le ${fmtDay(m.medical_waiver_validity)}` });
    else if (!waiverValid) out.push({ label: 'Certificat / QSS manquant', cls: 'warn', ask });
  }
  const age = ageOf(m.birth_date);
  if (age != null && age < 18) {
    if (!m.parental_authorization) out.push({ label: 'Autorisation parentale', cls: 'danger', ask: 'l’autorisation parentale signée' });
    if (!m.guardian_name || !m.guardian_phone) out.push({ label: 'Responsable légal à compléter', cls: 'warn', ask: 'les coordonnées du responsable légal' });
  }
  return out;
}
function reminderLink(m, issues) {
  const minor = (ageOf(m.birth_date) ?? 99) < 18;
  const phone = minor && m.guardian_phone ? m.guardian_phone : m.phone;
  if (!waLink(phone)) return null;
  const who = minor && m.guardian_phone ? `Bonjour${m.guardian_name ? ' ' + m.guardian_name.split(' ')[0] : ''},\n\npour l’inscription de ${m.first_name}` : `Bonjour ${m.first_name},\n\npour ton inscription`;
  return waUrl(phone, `${who} au ${S.settings?.club_name || 'club'}, il nous manque encore :\n${issues.map(i => '• ' + i.ask).join('\n')}\n\nMerci de nous le transmettre au prochain cours 🙏`);
}

async function viewDashboard(view) {
  const season = activeSeason();
  const membersQ = sb.from('members').select('*');
  const coursesQ = season ? sb.from('courses').select('id', { count: 'exact', head: true }).eq('season_id', season.id) : sb.from('courses').select('id', { count: 'exact', head: true });
  const payQ = isAdmin() ? (season ? sb.from('payments').select('id, amount, status, payment_date, due_date, payment_type, member_id, method, bank_checked').eq('season_id', season.id).eq('archived', false) : sb.from('payments').select('id, amount, status, payment_date, due_date, payment_type, member_id, method, bank_checked').eq('archived', false)) : null;
  const expQ = isAdmin() ? (season ? sb.from('expenses').select('amount').eq('season_id', season.id).eq('archived', false) : sb.from('expenses').select('amount').eq('archived', false)) : null;
  const [mr, cr, pr, er] = await Promise.all([membersQ, coursesQ, payQ, expQ]);
  for (const r of [mr, cr, pr, er]) if (r?.error) throw r.error;
  const members = mr.data;
  const active = members.filter(m => m.status === 'actif');
  const noCert = active.filter(m => !hasHealthDoc(m));
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
    const mName = id => { const m = members.find(x => x.id === id); return m ? fullName(m) : 'Hors adhérent'; };
    const recent = [...pays].sort((a, b) => b.payment_date.localeCompare(a.payment_date)).slice(0, 5);
    lastPays = `<div class="card card-pad"><h2>Derniers paiements</h2>${recent.length ? recent.map(p => `
      <div class="bday"><div class="grow" style="flex:1"><div style="font-weight:600">${esc(p.member_id ? mName(p.member_id) : (p.notes || 'Hors adhérent'))}</div><div class="small muted">${fmtDate(p.payment_date)} · ${esc(p.payment_type)}</div></div>
      <div style="text-align:right"><div style="font-weight:700">${fmtMoney(p.amount)}</div><span class="badge ${p.status === 'payé' ? 'ok' : 'warn'}">${p.status === 'payé' ? 'Payé' : 'En attente'}</span></div></div>`).join('') : '<div class="empty">Aucun paiement pour l’instant.</div>'}</div>`;

    // Chèques à déposer : chèques non pointés dont l'encaissement est dû d'ici 7 jours
    const today = isoDay(new Date()), week = isoDay(addDays(new Date(), 7));
    const cheques = pays.filter(p => /ch[eè]que/i.test(p.method || '') && p.status === 'payé' && !p.bank_checked && (p.due_date || p.payment_date) <= week)
      .sort((a, b) => (a.due_date || a.payment_date).localeCompare(b.due_date || b.payment_date));
    const later = pays.filter(p => /ch[eè]que/i.test(p.method || '') && p.status === 'payé' && !p.bank_checked && (p.due_date || p.payment_date) > week);
    lastPays += `<div class="card card-pad"><div class="row between"><h2 style="margin:0">Chèques à déposer</h2><span class="badge ${cheques.length ? 'warn' : 'ok'}">${cheques.length}</span></div>
      <div class="small muted mb">Chèques à encaisser d’ici une semaine${later.length ? ` · ${later.length} autre(s) plus tard (${fmtMoney(later.reduce((s, p) => s + Number(p.amount), 0))})` : ''}.</div>
      ${cheques.length ? cheques.map(p => { const d = p.due_date || p.payment_date; return `<div class="bday"><div style="flex:1"><div style="font-weight:600">${esc(mName(p.member_id))} · ${fmtMoney(p.amount)}</div><div class="small muted">${d < today ? `<span style="color:var(--danger)">prévu le ${fmtDate(d)}</span>` : `à déposer le ${fmtDate(d)}`}</div></div><button class="btn btn-sm" data-deposit="${p.id}">${icon('check')}Déposé</button></div>`; }).join('') : '<div class="empty" style="padding:16px">Aucun chèque à déposer cette semaine.</div>'}
    </div>`;

    // Soldes impayés de la saison
    const paidBy = {}; pays.filter(p => p.status === 'payé').forEach(p => { paidBy[p.member_id] = (paidBy[p.member_id] || 0) + Number(p.amount); });
    const unpaid = active.map(m => ({ m, due: Number(m.fee_amount || 0) - (paidBy[m.id] || 0) })).filter(x => x.due > 0).sort((a, b) => b.due - a.due);
    lastPays += `<div class="card card-pad"><div class="row between"><h2 style="margin:0">Soldes impayés</h2><span class="badge ${unpaid.length ? 'danger' : 'ok'}">${fmtMoney(unpaid.reduce((s, x) => s + x.due, 0))}</span></div>
      <div class="mt">${unpaid.length ? unpaid.map(({ m, due }) => { const minor = (ageOf(m.birth_date) ?? 99) < 18, phone = minor && m.guardian_phone ? m.guardian_phone : m.phone;
        const link = waLink(phone) ? waUrl(phone, `Bonjour ${minor && m.guardian_name ? m.guardian_name.split(' ')[0] : m.first_name},\n\npetit rappel du ${S.settings?.club_name || 'club'} : il reste ${fmtMoney(due)} à régler pour la cotisation ${season ? season.label : ''}${minor ? ' de ' + m.first_name : ''}.\nTu peux régler par chèque, virement ou espèces au prochain cours.\n\nMerci ! 🙏`) : null;
        return `<div class="bday"><a href="#/membres/${m.id}" style="flex:1;text-decoration:none"><div style="font-weight:600">${esc(fullName(m))}</div><div class="small muted">reste ${fmtMoney(due)} sur ${fmtMoney(m.fee_amount)}</div></a>${link ? `<a class="btn btn-sm" href="${esc(link)}" target="_blank" rel="noopener">${icon('chat')}Relancer</a>` : ''}</div>`; }).join('') : '<div class="empty" style="padding:16px">Toutes les cotisations sont réglées 👏</div>'}</div>
    </div>`;
  } else {
    money = `<div class="card stat"><div class="label">Certificats / QSS manquants</div><div class="value">${noCert.length}</div><div class="hint">membres actifs</div></div>
      <div class="card stat"><div class="label">Anniversaires</div><div class="value">${bdays.length}</div><div class="hint">ce mois-ci</div></div>`;
  }

  view.innerHTML = head('Tableau de bord', `Vue d'ensemble de votre club${season ? ' · saison ' + esc(season.label) : ''}`) + `
    <div id="dash-regs"></div>
    ${isAdmin() && (!lastBackup() || Date.now() - new Date(lastBackup()) > 31 * 86400000) ? `<div class="alert info">Pensez à télécharger une sauvegarde de vos données : <a href="#/parametres">Paramètres → Sauvegarde</a>.</div>` : ''}
    ${!season && isAdmin() ? `<div class="alert info">Aucune saison active. <a href="#/parametres">Créez la saison en cours dans les Paramètres</a> pour suivre la comptabilité par saison.</div>` : ''}
    <div class="grid stats mb">
      <div class="card stat"><div class="label">Membres actifs</div><div class="value">${active.length}</div><div class="hint">${members.length} inscrits au total</div></div>
      <div class="card stat"><div class="label">Cours</div><div class="value">${cr.count ?? 0}</div><div class="hint">${season ? 'cette saison' : 'au total'}</div></div>
      ${money}
    </div>
    <div class="grid two">
      ${(() => {
        const todo = active.map(m => ({ m, issues: memberIssues(m) })).filter(x => x.issues.length)
          .sort((a, b) => b.issues.filter(i => i.cls === 'danger').length - a.issues.filter(i => i.cls === 'danger').length || b.issues.length - a.issues.length);
        return `<div class="card card-pad"><div class="row between"><h2 style="margin:0">À relancer</h2><span class="badge ${todo.length ? 'warn' : 'ok'}">${todo.length}</span></div>
          <div class="small muted mb">Documents de santé et autorisations à récupérer.</div>
          ${todo.length ? todo.slice(0, 6).map(({ m, issues }) => { const link = reminderLink(m, issues); return `<div class="bday"><a href="#/membres/${m.id}" style="flex:1;text-decoration:none;min-width:0"><div style="font-weight:600">${esc(fullName(m))}</div><div class="row wrap" style="gap:4px;margin-top:3px">${issues.map(i => `<span class="badge ${i.cls}">${esc(i.label)}</span>`).join('')}</div></a>${link ? `<a class="btn btn-sm" href="${esc(link)}" target="_blank" rel="noopener">${icon('chat')}Relancer</a>` : ''}</div>`; }).join('') + (todo.length > 6 ? `<a class="btn btn-sm mt" href="#/membres" data-filter="relancer">Voir les ${todo.length} membres à relancer</a>` : '') : '<div class="empty" style="padding:16px">Tous les dossiers sont complets 👏</div>'}
        </div>`;
      })()}
      <div class="card card-pad"><h2>Anniversaires de ${MONTHS[month]}</h2>
        ${bdays.length ? bdays.map(m => `<a class="bday" href="#/membres/${m.id}" style="text-decoration:none"><div class="avatar">${esc(initials(m))}</div><div style="flex:1"><div style="font-weight:600">${esc(fullName(m))}</div><div class="small muted">${fmtDay(m.birth_date)} · ${new Date().getFullYear() - Number(m.birth_date.slice(0, 4))} ans</div></div>${new Date(m.birth_date + 'T00:00:00').getDate() === new Date().getDate() ? '<span class="badge accent">Aujourd’hui</span>' : ''}</a>`).join('') : '<div class="empty">Aucun anniversaire ce mois-ci.</div>'}
      </div>
      <div class="card card-pad"><h2>Disciplines</h2>
        ${byDisc.length ? `<div class="bars">${byDisc.map(x => `<div class="bar-row"><span>${esc(x.name)}</span><div class="bar"><span style="width:${(x.n / maxDisc) * 100}%"></span></div><strong>${x.n}</strong></div>`).join('')}</div>` : '<div class="empty">Aucun membre actif rattaché à une discipline.</div>'}
        ${noCert.length && isAdmin() ? `<div class="mt"><a href="#/membres" data-filter="certificat" class="badge warn" style="text-decoration:none">${noCert.length} certificat(s) ou QSS manquant(s)</a></div>` : ''}
      </div>
      ${lastPays}
    </div>`;
  $$('[data-filter]', view).forEach(a => a.onclick = () => { S.memberFilter = a.dataset.filter; });
  sb.from('registrations').select('id', { count: 'exact', head: true }).eq('status', 'nouvelle').then(({ count }) => {
    if (count && $('#dash-regs')) $('#dash-regs').innerHTML = `<div class="alert info row between wrap" style="gap:8px"><span><strong>${count} nouvelle${count > 1 ? 's' : ''} demande${count > 1 ? 's' : ''} d’inscription</strong> en ligne.</span><button class="btn btn-sm btn-primary" id="dash-open-regs">Voir</button></div>`;
    $('#dash-open-regs') && ($('#dash-open-regs').onclick = openRegistrations);
  });
  $$('[data-deposit]', view).forEach(b => b.onclick = async () => {
    b.disabled = true;
    const { error } = await sb.from('payments').update({ bank_checked: true }).eq('id', b.dataset.deposit);
    if (error) { b.disabled = false; return fail(error); }
    toast('Chèque marqué comme déposé et pointé'); route();
  });
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
    { k: 'relancer', label: 'À relancer', fn: m => memberIssues(m).length > 0 },
    { k: 'certificat', label: 'Certificat / QSS manquant', fn: m => m.status === 'actif' && !hasHealthDoc(m) },
    { k: 'anniversaires', label: 'Anniversaires du mois', fn: m => isBirthdayMonth(m.birth_date) },
    { k: 'inactifs', label: 'Inactifs', fn: m => m.status === 'inactif' },
  ];
  if (!filters.find(f => f.k === S.memberFilter)) S.memberFilter = 'tous';

  view.innerHTML = head('Membres', `${members.filter(m => m.status === 'actif').length} membres actifs · ${members.length} inscrits`,
    `<button class="btn btn-primary" id="new-member">${icon('plus')}Nouveau membre</button>`) + `
    <div id="reg-banner"></div>
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
    const statusBadge = m => m.status === 'actif' ? '<span class="badge ok">Actif</span>' : '<span class="badge">Inactif</span>';
    box.innerHTML = `
      <div class="table-wrap only-desktop"><table class="table"><thead><tr><th>Nom</th><th>Contact</th><th>Discipline</th><th>Niveau</th><th>Santé</th>${isAdmin() ? '<th>Solde</th>' : ''}<th>Statut</th></tr></thead><tbody>
        ${rows.map(m => `<tr class="clickable" data-id="${m.id}">
          <td><div class="person"><div class="avatar">${esc(initials(m))}</div><div><div class="name">${esc(fullName(m))}</div>${m.birth_date ? `<div class="meta">${ageOf(m.birth_date)} ans</div>` : ''}</div></div></td>
          <td class="small">${esc(m.phone || '')}<div class="muted">${esc(m.email || '')}</div></td>
          <td>${esc(discName(m.discipline_id))}</td><td>${esc(levelName(m.level_id))}</td>
          <td>${healthBadge(m)}</td>
          ${isAdmin() ? `<td>${balance(m) > 0 ? `<span class="badge danger">${fmtMoney(balance(m))}</span>` : '<span class="badge ok">À jour</span>'}</td>` : ''}
          <td>${statusBadge(m)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="list only-mobile">${rows.map(m => `<div class="list-item" data-id="${m.id}">
          <div class="avatar">${esc(initials(m))}</div>
          <div class="grow"><div style="font-weight:600">${esc(fullName(m))}</div><div class="small muted">${esc(discName(m.discipline_id))} · ${esc(levelName(m.level_id))}</div></div>
          <div class="right">${m.status !== 'actif' ? statusBadge(m) : (!hasHealthDoc(m) ? healthBadge(m, true) : '')}${isAdmin() && balance(m) > 0 ? `<span class="badge danger">${fmtMoney(balance(m))}</span>` : ''}</div>
        </div>`).join('')}</div>`;
    $$('[data-id]', box).forEach(r => r.onclick = () => go('/membres/' + r.dataset.id));
  };
  draw();
  $('#m-search').oninput = e => { S.memberSearch = e.target.value; draw(); };
  $$('[data-f]', view).forEach(b => b.onclick = () => { S.memberFilter = b.dataset.f; $$('[data-f]', view).forEach(x => x.classList.toggle('active', x === b)); draw(); });
  $('#new-member').onclick = () => memberForm(null, id => go('/membres/' + id));
  sb.from('registrations').select('id', { count: 'exact', head: true }).eq('status', 'nouvelle').then(({ count }) => {
    if (!count || !$('#reg-banner')) return;
    $('#reg-banner').innerHTML = `<div class="alert info row between wrap" style="gap:8px"><span><strong>${count} demande${count > 1 ? 's' : ''} d’inscription en ligne</strong> à traiter.</span><button class="btn btn-sm btn-primary" id="open-regs">Voir</button></div>`;
    $('#open-regs').onclick = openRegistrations;
  });
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
    ${isAdmin() ? '<div class="full" id="mf-pays"><div class="small muted">Chargement des règlements…</div></div>' : ''}
    <div class="fieldset-title">Santé et documents</div>
    ${chk('medical_certificate', 'Certificat médical fourni')}
    ${chk('qss', 'QSS (Questionnaire de Santé Sportive) rempli : vaut certificat médical')}
    ${chk('medical_waiver', 'Décharge médicale signée')}
    ${inp('medical_waiver_validity', 'Décharge valable jusqu’au', 'date')}
    <div class="field full"><label for="mf-medical_notes">Notes médicales</label><textarea class="input" id="mf-medical_notes" name="medical_notes">${esc(v.medical_notes ?? '')}</textarea><span class="help">Ne notez que ce qui est utile à la sécurité pendant les cours.</span></div>
    <div class="fieldset-title">Mineur : responsable légal</div>
    <p class="small muted full" style="margin:-4px 0 8px">À remplir pour les adhérents de moins de 18 ans.</p>
    ${inp('guardian_name', 'Nom du responsable légal')}${inp('guardian_phone', 'Téléphone du responsable', 'tel')}
    ${inp('guardian_email', 'E-mail du responsable', 'email', 'full')}
    ${chk('parental_authorization', 'Autorisation parentale signée')}
    <div class="field full"><label for="mf-pickup_persons">Personnes autorisées à récupérer l’enfant</label><input class="input" id="mf-pickup_persons" name="pickup_persons" value="${esc(v.pickup_persons ?? '')}" placeholder="ex : Mère, grand-père (Jean Dupont)"></div>
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
      const pays = isAdmin() ? memberPaymentsBox(m, $('#mf-pays', root), () => amt.value) : null;
      fee.onchange = () => { const o = feeOptions().find(([l]) => l === fee.value); if (o && o[1] != null) amt.value = o[1]; pays?.refresh(); };
      amt.oninput = () => pays?.refresh();
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
        const queued = pays ? await pays.flush(saved.id) : 0;
        if (queued < 0) return;
        closeModal(); toast((m ? 'Membre mis à jour' : 'Membre ajouté') + (queued ? ` · ${queued} règlement${queued > 1 ? 's' : ''} enregistré${queued > 1 ? 's' : ''}` : ''));
        onSaved?.(saved.id);
      };
    },
  });
}

const defaultPayType = () => { const t = S.settings?.revenue_types || []; return t.includes('Cotisation annuelle') ? 'Cotisation annuelle' : (t[0] || 'Cotisation annuelle'); };

// Règlements de la saison, affichés et saisis directement dans la fiche du membre.
// Membre existant : chaque règlement est enregistré tout de suite.
// Nouveau membre : les règlements sont gardés en attente et enregistrés avec la fiche.
function memberPaymentsBox(m, box, feeValue) {
  const season = activeSeason();
  let saved = [], queued = [];
  const rowHtml = (p, i) => `<div class="bday"><div style="flex:1"><div style="font-weight:600">${fmtMoney(p.amount)} · ${esc(p.method || '—')}</div>
      <div class="small muted">${fmtDate(p.payment_date)}${p.notes ? ' · ' + esc(p.notes) : ''}</div></div>
      ${i == null ? `<span class="badge ${p.status === 'payé' ? 'ok' : 'warn'}">${p.status === 'payé' ? 'Payé' : 'En attente'}</span>`
        : `<span class="badge accent">À enregistrer</span><button type="button" class="icon-btn" data-unq="${i}" aria-label="Retirer" title="Retirer">${icon('trash')}</button>`}</div>`;
  const totals = () => {
    const fee = Number(feeValue() || 0);
    const paid = [...saved.filter(p => p.status === 'payé'), ...queued].reduce((t, p) => t + Number(p.amount), 0);
    return { fee, paid, due: Math.round((fee - paid) * 100) / 100 };
  };
  const draw = () => {
    const { fee, paid, due } = totals();
    const dateVal = $('#mp-d', box)?.value || isoDay(new Date()), methodVal = $('#mp-me', box)?.value || 'Espèces';
    box.innerHTML = `<div class="card card-pad" style="background:var(--surface-2, transparent)">
      <div class="row between wrap" style="gap:6px"><strong>Règlements${season ? ' · ' + esc(season.label) : ''}</strong>
        ${fee ? (due > 0 ? `<span class="badge danger">Reste ${fmtMoney(due)}</span>` : '<span class="badge ok">À jour</span>') : ''}</div>
      <div class="small muted mb">Payé : ${fmtMoney(paid)}${fee ? ' sur ' + fmtMoney(fee) : ''}</div>
      ${saved.map(p => rowHtml(p)).join('')}${queued.map((p, i) => rowHtml(p, i)).join('')}
      ${!saved.length && !queued.length ? '<div class="small muted mb">Aucun règlement pour l’instant.</div>' : ''}
      <div class="form-grid mt" style="align-items:end">
        <div class="field"><label for="mp-a">Montant (€)</label><input class="input" id="mp-a" type="number" step="0.01" min="0" inputmode="decimal" value="${due > 0 ? due : ''}"></div>
        <div class="field"><label for="mp-me">Mode</label><select class="input" id="mp-me">${METHODS.map(x => `<option ${x === methodVal ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
        <div class="field"><label for="mp-d">Date</label><input class="input" id="mp-d" type="date" value="${esc(dateVal)}"></div>
        <div class="field"><label for="mp-no">N° de chèque / note</label><input class="input" id="mp-no"></div>
        <div class="full"><button type="button" class="btn btn-sm" id="mp-add">${icon('plus')}Ajouter ce règlement</button></div>
      </div></div>`;
    $('#mp-add', box).onclick = add;
    $$('[data-unq]', box).forEach(b => b.onclick = () => { queued.splice(+b.dataset.unq, 1); draw(); });
  };
  const add = async () => {
    const amount = Number($('#mp-a', box).value), payment_date = $('#mp-d', box).value;
    if (!(amount > 0) || !payment_date) return toast('Indiquez un montant et une date.', 'error');
    const row = { payment_type: defaultPayType(), amount, method: $('#mp-me', box).value, payment_date, status: 'payé', notes: $('#mp-no', box).value.trim() || null, season_id: season?.id || null };
    if (!m) { queued.push(row); return draw(); }
    const btn = $('#mp-add', box); btn.disabled = true;
    const { data, error } = await sb.from('payments').insert({ ...row, member_id: m.id }).select().single();
    if (error) { btn.disabled = false; return fail(error); }
    saved.push(data); toast(`Règlement de ${fmtMoney(amount)} enregistré`); draw();
  };
  (async () => {
    if (m) {
      let q = sb.from('payments').select('*').eq('member_id', m.id).eq('archived', false);
      if (season) q = q.eq('season_id', season.id);
      const { data, error } = await q.order('payment_date');
      if (error) { box.innerHTML = '<div class="small muted">Impossible de charger les règlements.</div>'; return; }
      saved = data || [];
    }
    draw();
  })();
  return {
    refresh: () => { if ($('#mp-add', box)) draw(); },
    // Enregistre les règlements en attente ; renvoie leur nombre, ou -1 en cas d'erreur
    flush: async memberId => {
      if (!queued.length) return 0;
      const { error } = await sb.from('payments').insert(queued.map(p => ({ ...p, member_id: memberId })));
      if (error) { fail(error); return -1; }
      return queued.length;
    },
  };
}

async function viewMember(view, id) {
  const season = activeSeason();
  const [mr, pr, ar] = await Promise.all([
    sb.from('members').select('*').eq('id', id).maybeSingle(),
    isAdmin() ? sb.from('payments').select('*').eq('member_id', id).order('payment_date', { ascending: false }) : null,
    sb.from('attendances').select('course_id, present').eq('member_id', id),
  ]);
  if (mr.error) throw mr.error;
  if (ar.error) throw ar.error;
  const { data: grades } = await sb.from('level_history').select('*').eq('member_id', id).order('changed_on', { ascending: false });
  const m = mr.data;
  if (!m) { view.innerHTML = `<div class="empty">Membre introuvable. <a href="#/membres">Retour à la liste</a></div>`; return; }
  const pays = pr?.data || [];
  const seasonPays = season ? pays.filter(p => p.season_id === season.id) : pays;
  const paid = seasonPays.filter(p => p.status === 'payé').reduce((s, p) => s + Number(p.amount), 0);
  const due = Number(m.fee_amount || 0) - paid;
  const st = await memberAttendance(m, new Set(ar.data.filter(a => a.present).map(a => a.course_id)));
  const att = st.sessions, present = st.present;
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
          ${isAdmin() ? `<button class="btn btn-sm" id="add-pay-top">${icon('euro')}Enregistrer un règlement</button>` : ''}
          <button class="btn btn-sm btn-primary" id="edit">${icon('edit')}Modifier</button>
        </div>
      </div>
    </div>
    ${(() => { const iss = memberIssues(m); if (!iss.length) return ''; const link = reminderLink(m, iss);
      return `<div class="alert info row wrap between mb" style="gap:8px"><div class="row wrap" style="gap:6px"><strong>À relancer :</strong>${iss.map(i => `<span class="badge ${i.cls}">${esc(i.label)}</span>`).join('')}</div>${link ? `<a class="btn btn-sm" href="${esc(link)}" target="_blank" rel="noopener">${icon('chat')}Relancer sur WhatsApp</a>` : ''}</div>`; })()}
    ${(ageOf(m.birth_date) ?? 99) < 18 ? `<div class="card card-pad mb"><h2>Mineur · responsable légal</h2><dl class="kv">
        <dt>Responsable</dt><dd>${esc(m.guardian_name || '—')}</dd>
        <dt>Téléphone</dt><dd>${m.guardian_phone ? `<a href="tel:${esc(m.guardian_phone.replace(/\s/g, ''))}">${esc(m.guardian_phone)}</a>` : '—'}</dd>
        <dt>E-mail</dt><dd>${esc(m.guardian_email || '—')}</dd>
        <dt>Autorisation parentale</dt><dd>${yes(m.parental_authorization)}</dd>
        <dt>Peut récupérer l’enfant</dt><dd>${esc(m.pickup_persons || '—')}</dd></dl></div>` : ''}
    <div class="grid two">
      ${isAdmin() ? `<div class="card card-pad"><div class="row between"><h2 style="margin:0">Règlements${season ? ' · ' + esc(season.label) : ''}</h2>
          ${due > 0 ? `<span class="badge danger">Reste ${fmtMoney(due)}</span>` : (m.fee_amount ? '<span class="badge ok">À jour</span>' : '')}</div>
        <div class="small muted mb">Payé : ${fmtMoney(paid)}${m.fee_amount != null ? ' sur ' + fmtMoney(m.fee_amount) : ''}</div>
        ${seasonPays.length ? seasonPays.map(p => `<div class="bday clickable" data-pay="${p.id}"><div style="flex:1"><div style="font-weight:600">${esc(p.payment_type)}</div><div class="small muted">${fmtDate(p.payment_date)}${p.method ? ' · ' + esc(p.method) : ''}${p.bank_checked ? ' · pointé' : ''}</div></div><div style="text-align:right"><div style="font-weight:700">${fmtMoney(p.amount)}</div><span class="badge ${p.status === 'payé' ? 'ok' : 'warn'}">${p.status === 'payé' ? 'Payé' : 'En attente'}</span></div></div>`).join('') : '<div class="empty">Aucun paiement enregistré.</div>'}
        <div class="row wrap mt" style="gap:8px"><button class="btn btn-sm" id="add-pay">${icon('plus')}Enregistrer un règlement</button>
        ${paid > 0 ? `<button class="btn btn-sm" id="attest">${icon('file')}Attestation de paiement</button>` : ''}</div>
      </div>` : ''}
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
        <dt>Justificatif de santé</dt><dd>${healthBadge(m)}</dd><dt>Certificat médical</dt><dd>${yes(m.medical_certificate)}</dd><dt>QSS</dt><dd>${yes(m.qss)}</dd>
        <dt>Décharge médicale</dt><dd>${yes(m.medical_waiver)}${m.medical_waiver_validity ? ' · jusqu’au ' + fmtDate(m.medical_waiver_validity) : ''}</dd><dt>Notes médicales</dt><dd>${esc(m.medical_notes || '—')}</dd>
      </dl>${m.health_files?.length ? `<div class="small muted mt">Reçu avec l’inscription en ligne :</div><div class="row wrap" id="m-hf" style="gap:6px;margin-top:6px">${healthFileButtons(m.health_files)}</div>` : ''}</div>
      <div class="card card-pad"><h2>Consentements</h2><dl class="kv">
        <dt>Droit à l’image</dt><dd>${yes(m.consent_image)}</dd><dt>Utilisation des données</dt><dd>${yes(m.consent_data)}</dd>
        <dt>Règlement lu</dt><dd>${yes(m.rules_read)}</dd><dt>Règlement accepté</dt><dd>${yes(m.rules_accepted)}</dd>
        <dt>Info assurance</dt><dd>${yes(m.insurance_informed)}</dd>
      </dl></div>
      <div class="card card-pad"><div class="row between"><h2 style="margin:0">Assiduité</h2>${att.length ? `<span class="badge ${st.cls}">${st.rate}% · ${st.label}</span>` : ''}</div>
        <div class="small muted">${att.length ? `${present} présence(s) sur ${att.length} séance(s)` : 'Aucune séance'} depuis l’inscription${m.registration_date ? ' le ' + fmtDate(m.registration_date) : ''}.</div>
        ${att.length ? `<div class="mt">${att.slice(0, 15).map(a => `<div class="bday"><div style="flex:1"><div style="font-weight:600">${esc(a.title)}</div><div class="small muted">${fmtDate(a.course_date)}</div></div>${a.present ? '<span class="badge ok">Présent</span>' : '<span class="badge">Absent</span>'}</div>`).join('')}${att.length > 15 ? `<div class="small muted mt">+ ${att.length - 15} séance(s) plus ancienne(s)</div>` : ''}</div>` : ''}
      </div>
    </div>
    ${(() => {
      const ordered = (grades || []).slice().sort((a, b) => b.changed_on.localeCompare(a.changed_on));
      const current = ordered.find(g => g.to_level_id === m.level_id);
      return `<div class="card card-pad mt"><div class="row between wrap" style="gap:8px"><h2 style="margin:0">Parcours de grades</h2>
        ${isAdmin() ? `<div class="row" style="gap:6px"><button class="btn btn-sm" id="add-grade">${icon('plus')}Ajouter un grade passé</button>${nextLevel(m.level_id) ? `<button class="btn btn-sm btn-primary" id="promote">${icon('up')}Passage de grade</button>` : ''}</div>` : ''}</div>
      <div class="small mt">Niveau actuel : <strong>${esc(levelName(m.level_id))}</strong>${m.level_id ? (current ? ` · obtenu le <strong>${fmtDate(current.changed_on)}</strong>` : ' · <span class="muted">date d’obtention non renseignée</span>') : ''}</div>
      ${ordered.length ? `<div class="mt">${ordered.map(g => `<div class="bday"><div style="flex:1"><div style="font-weight:600">${g.from_level_id ? esc(levelName(g.from_level_id)) + ' → ' : ''}${esc(g.to_level_id ? levelName(g.to_level_id) : '—')}</div>${g.notes ? `<div class="small muted">${esc(g.notes)}</div>` : ''}</div><span class="small muted">${fmtDate(g.changed_on)}</span>${isAdmin() ? `<button class="icon-btn" data-grade="${g.id}" aria-label="Modifier">${icon('edit')}</button>` : ''}</div>`).join('')}</div>`
        : `<div class="small muted mt">Aucun grade enregistré. ${isAdmin() ? 'Utilisez « Ajouter un grade passé » pour noter quand il a obtenu ses niveaux avant l’arrivée de la nouvelle appli.' : ''}</div>`}
    </div>`; })()}
    <div class="mt"><button class="btn btn-danger btn-sm" id="del">${icon('trash')}Supprimer ce membre</button></div>`;
  $('#m-hf') && bindHealthFiles($('#m-hf'), m.health_files);
  $('#promote') && ($('#promote').onclick = () => promoteForm(m, () => route()));
  $('#add-grade') && ($('#add-grade').onclick = () => gradeEntryForm(m, null));
  $$('[data-grade]', view).forEach(b => b.onclick = () => gradeEntryForm(m, grades.find(g => g.id === b.dataset.grade)));
  $('#edit').onclick = () => memberForm(m, () => route());
  $$('#add-pay, #add-pay-top', view).forEach(b => b.onclick = () => paymentForm(null, { member_id: m.id, amount: due > 0 ? due : m.fee_amount }));
  $('#attest') && ($('#attest').onclick = () => printAttestation(m, seasonPays.filter(p => p.status === 'payé' && !p.archived), season));
  $$('[data-pay]', view).forEach(r => r.onclick = () => paymentForm(seasonPays.find(p => p.id === r.dataset.pay)));
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
      </div>`).join('')}</div></div>` : `<div class="card empty">Aucun niveau. Ajoutez-en un pour commencer.</div>`) +
    `<div id="grades" class="mt"><div class="empty">Chargement des passages de grade…</div></div>`;
  gradeSection($('#grades', view)).catch(fail);
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
    view.innerHTML = head('Paramètres') + `<div class="card card-pad"><h2>Mon compte</h2><dl class="kv"><dt>Nom</dt><dd>${esc(S.profile.full_name || '—')}</dd><dt>E-mail</dt><dd>${esc(S.session.user.email)}</dd><dt>Rôle</dt><dd>${esc(roleLabel(S.profile.role))}</dd></dl>
      <p class="small muted mt">Les réglages du club sont gérés par le président et le trésorier.</p><button class="btn mt" data-logout>${icon('logout')}Se déconnecter</button></div>`;
    return bindGlobal(view);
  }
  await loadRefs();
  const { data: team, error } = await sb.from('profiles').select('*').order('created_at');
  if (error) throw error;
  const s = S.settings;
  const num = (name, label, ph = '') => `<div class="field"><label for="st-${name}">${label}</label><input class="input" id="st-${name}" name="${name}" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(s[name] ?? '')}" placeholder="${ph}"></div>`;
  const tagVals = key => key === 'plan_sections' ? planSections() : (s[key] || []);
  const tagBox = (key, label, help) => `<div class="field"><label>${label}</label><div class="tags" data-tags="${key}">${tagVals(key).map((t, i) => `<span class="tag">${esc(t)}<button type="button" data-rm="${key}:${i}" aria-label="Retirer ${esc(t)}">×</button></span>`).join('') || '<span class="small muted">Aucun élément</span>'}</div>
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
        <div class="section-title mt">Pour les attestations</div>
        <div class="field"><label for="st-addr">Adresse du club</label><input class="input" id="st-addr" name="club_address" value="${esc(s.club_address || '')}" placeholder="ex : Gymnase…, 34800 Clermont-l’Hérault"></div>
        <div class="form-grid">
          <div class="field"><label for="st-pres">Président(e)</label><input class="input" id="st-pres" name="president_name" value="${esc(s.president_name || '')}"></div>
          <div class="field"><label for="st-legal">N° RNA ou SIRET</label><input class="input" id="st-legal" name="club_legal_id" value="${esc(s.club_legal_id || '')}" placeholder="W343…"></div>
        </div>
        <div class="field"><label for="st-mail">E-mail du club</label><input class="input" id="st-mail" name="club_email" type="email" value="${esc(s.club_email || '')}"></div>
        <button class="btn btn-primary" type="submit">Enregistrer</button>
      </form>

      <div class="card card-pad" id="tags-card">
        <h2>Catégories, salles et chapitres</h2>
        ${tagBox('revenue_types', 'Types de recettes', 'ex : Cotisation annuelle')}
        ${tagBox('expense_categories', 'Catégories de dépenses', 'ex : Loyer')}
        ${tagBox('rooms', 'Salles disponibles', 'ex : Dojo 1')}
        ${tagBox('plan_sections', 'Chapitres de la planification annuelle', 'ex : Self-défense verbale')}
        <p class="small muted" style="margin-top:-4px">Retirer un chapitre ne supprime pas ses éléments déjà saisis : ils restent visibles dans les mois concernés.</p>
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
        <p class="small muted">Pour donner accès à quelqu’un : il crée son compte depuis l’écran de connexion (« Créer un compte »), puis vous le validez ici en choisissant son rôle.</p>
        <ul class="small muted" style="margin:0 0 8px;padding-left:18px"><li><strong>Président(e)</strong> et <strong>Trésorier(ère)</strong> : accès à tout le logiciel, comptabilité comprise.</li><li><strong>Enseignant(e)</strong> : membres, planning, appel, planification et statistiques, sans la comptabilité.</li></ul>
        ${team.map(p => `<div class="bday"><div class="avatar">${esc((p.full_name || '?').slice(0, 2).toUpperCase())}</div><div style="flex:1"><div style="font-weight:600">${esc(p.full_name || '—')}</div>${p.id === S.profile.id ? '<div class="small muted">Vous</div>' : ''}</div>
          ${p.id === S.profile.id || (p.role === 'admin' && !isPresident()) ? `<span class="badge accent">${esc(roleLabel(p.role))}</span>` : `<select class="input" style="width:auto" data-role="${p.id}" aria-label="Rôle de ${esc(p.full_name || '')}">
            <option value="en_attente" ${p.role === 'en_attente' ? 'selected' : ''}>En attente (aucun accès)</option>
            <option value="enseignant" ${p.role === 'enseignant' ? 'selected' : ''}>Enseignant(e)</option>
            <option value="tresorier" ${p.role === 'tresorier' ? 'selected' : ''}>Trésorier(ère) · accès complet</option>
            ${isPresident() ? `<option value="admin" ${p.role === 'admin' ? 'selected' : ''}>Président(e) · accès complet</option>` : ''}</select>`}</div>`).join('')}
      </div>

      <div class="card card-pad">
        <h2>Sauvegarde</h2>
        <div class="section-title" style="font-size:13px">1. Les données du club</div>
        <p class="small muted">Un fichier Excel avec toutes les données : membres, paiements, dépenses, séances, présences, planification et paramètres. Conseillé une fois par mois, à garder en lieu sûr (il contient des données personnelles et médicales).</p>
        <div class="small mb">${lastBackupText()}</div>
        <button class="btn btn-primary" id="backup">${icon('file')}Télécharger les données</button>
        <div class="section-title mt" style="font-size:13px">2. Le logiciel</div>
        <p class="small muted">Un fichier .zip avec tout le logiciel : les écrans, le fonctionnement, l’icône et la structure de la base de données. Il ne contient aucune donnée d’adhérent. Chaque version est aussi conservée automatiquement sur GitHub.</p>
        <div class="row wrap" style="gap:8px"><a class="btn" href="https://github.com/lioflusin-creator/defendr/archive/refs/heads/main.zip" download>${icon('file')}Télécharger le logiciel</a>
          <a class="btn btn-sm" href="https://github.com/lioflusin-creator/defendr/commits/main" target="_blank" rel="noopener">Historique des versions</a></div>
        <p class="small muted mt">Avec ces deux fichiers, le club peut tout reconstruire si besoin.</p>
        ${isPresident() ? `<div class="section-title mt" style="font-size:13px">3. Restaurer</div>
        <p class="small muted">Remet les données du club telles qu’elles étaient dans un fichier de sauvegarde. Réservé au président.</p>
        <label class="btn btn-danger" style="cursor:pointer">${icon('up')}Restaurer depuis une sauvegarde<input type="file" id="restore-file" accept=".xlsx" hidden></label>` : ''}
      </div>


      <div class="card card-pad" id="adac-card">
        <h2>ADAC National</h2>
        <p class="small muted">Envoie les membres actifs dans l’onglet « BASE LICENCES » du tableur de l’ADAC. Un adhérent déjà présent n’est jamais ajouté une deuxième fois (même nom, prénom et date de naissance) : seules ses cases vides sont complétées, rien n’est écrasé. Un aperçu s’affiche avant chaque envoi.</p>
        <button class="btn btn-primary" id="adac-send" ${s.adac_url ? '' : 'disabled'}>${icon('up')}Envoyer à l’ADAC National</button>
        ${s.adac_url ? '' : '<div class="small muted mt">Faites d’abord l’installation ci-dessous (une seule fois).</div>'}
        <details class="mt" ${s.adac_url ? '' : 'open'}><summary class="small" style="cursor:pointer;font-weight:600">Installation de la liaison</summary>
          <ol class="small" style="padding-left:18px;margin:8px 0">
            <li>Cliquez sur <strong>Copier le script</strong> ci-dessous.</li>
            <li>Ouvrez le tableur de l’ADAC, menu <strong>Extensions → Apps Script</strong>. Effacez le contenu, collez le script et cliquez sur l’icône <strong>Enregistrer</strong>.</li>
            <li>En haut à droite : <strong>Déployer → Nouveau déploiement</strong>. Type : <strong>Application Web</strong>. « Exécuter en tant que » : <strong>Moi</strong>. « Qui a accès » : <strong>Tout le monde</strong>. Cliquez sur <strong>Déployer</strong> et autorisez l’accès avec votre compte Google.</li>
            <li>Copiez l’<strong>URL de l’application Web</strong> (elle finit par /exec), collez-la ici et enregistrez.</li>
          </ol>
          <button type="button" class="btn btn-sm mb" id="adac-copy">${icon('copy')}Copier le script</button>
          <form id="adac-form">
            <div class="field"><label for="st-adac-url">URL de l’application Web</label><input class="input" id="st-adac-url" name="adac_url" value="${esc(s.adac_url || '')}" placeholder="https://script.google.com/macros/s/…/exec"></div>
            <div class="field"><label for="st-adac-disc">Discipline indiquée à l’ADAC</label><input class="input" id="st-adac-disc" name="adac_discipline" value="${esc(s.adac_discipline || 'BDR')}" placeholder="BDR"></div>
            <div class="row wrap" style="gap:8px"><button class="btn btn-primary" type="submit">Enregistrer</button><button class="btn" type="button" id="adac-test">Tester la liaison</button></div>
          </form>
          <p class="small muted mt">Si vous recopiez un jour le script, pensez à refaire « Déployer → Gérer les déploiements → Modifier → Nouvelle version ».</p>
        </details>
      </div>
      <div class="card card-pad" id="docs-card">
        <h2>Documents et paiement de l’inscription</h2>
        ${'club_documents' in s ? '' : '<div class="alert error">Pour activer cette partie, exécutez une fois le fichier <strong>migration-7.sql</strong> dans Supabase → Éditeur SQL.</div>'}
        <p class="small muted">Ces fichiers sont proposés au téléchargement sur la page d’inscription en ligne et ajoutés en annexe du dossier PDF à signer. Formats : PDF, JPG ou PNG.</p>
        ${CLUB_DOCS.map(d => { const f = (s.club_documents || {})[d.key]; return `<div class="bday"><div style="flex:1;min-width:0"><div style="font-weight:600">${esc(d.label)}</div><div class="small muted" style="overflow-wrap:anywhere">${f ? esc(f.name) : 'Aucun fichier'}</div></div>
          ${f ? `<a class="btn btn-sm" href="${esc(docUrl(f))}" target="_blank" rel="noopener">Voir</a>` : ''}
          <label class="btn btn-sm${f ? '' : ' btn-primary'}" style="cursor:pointer">${icon('up')}${f ? 'Remplacer' : 'Ajouter'}<input type="file" data-doc="${d.key}" accept="${d.image ? 'image/png,image/jpeg' : 'application/pdf,image/png,image/jpeg'}" hidden></label>
          ${f ? `<button class="icon-btn" data-doc-rm="${d.key}" aria-label="Retirer ${esc(d.label)}">${icon('trash')}</button>` : ''}</div>`; }).join('')}
        <form id="bank-form" class="mt">
          <div class="section-title">Virement : coordonnées du compte du club</div>
          <div class="field"><label for="st-bh">Titulaire du compte</label><input class="input" id="st-bh" name="bank_holder" value="${esc(s.bank_holder || '')}" placeholder="ex : ASSOC. CŒUR D’HÉRAULT AUTO DÉFENSE"></div>
          <div class="field"><label for="st-iban">IBAN</label><input class="input" id="st-iban" name="bank_iban" value="${esc(s.bank_iban || '')}" placeholder="FR76 …" autocomplete="off"></div>
          <div class="form-grid">
            <div class="field"><label for="st-bic">BIC</label><input class="input" id="st-bic" name="bank_bic" value="${esc(s.bank_bic || '')}" autocomplete="off"></div>
            <div class="field"><label for="st-bn">Banque</label><input class="input" id="st-bn" name="bank_name" value="${esc(s.bank_name || '')}" placeholder="ex : Crédit Agricole Languedoc"></div>
          </div>
          <div class="field"><label for="st-fed">Fédération citée dans le droit à l’image et les données</label><input class="input" id="st-fed" name="federation_label" value="${esc(s.federation_label ?? 'l’ADAC')}" placeholder="ex : l’ADAC"><span class="help">Avec l’article (« l’ADAC », « la FFKDA »). Laissez vide si aucune.</span></div>
          <button class="btn btn-primary" type="submit">Enregistrer</button>
        </form>
      </div>

      <div class="card card-pad">
        <h2>Inscription en ligne</h2>
        <p class="small muted">Envoyez ce lien aux personnes qui veulent s’inscrire : elles remplissent leur fiche elles-mêmes, envoient leur certificat médical ou leur questionnaire de santé, et la demande arrive dans la page Membres, à valider.</p>
        <div class="row" style="gap:8px"><input class="input" id="reg-url" readonly value="${esc(registrationUrl())}" aria-label="Lien d’inscription"><button class="btn" id="reg-copy">${icon('copy')}</button></div>
        <div class="row wrap mt" style="gap:8px"><a class="btn btn-sm" href="${esc(waUrl(null, `Pour t’inscrire au ${S.settings?.club_name || 'club'}, remplis ta fiche ici : ${registrationUrl()}`))}" target="_blank" rel="noopener">${icon('chat')}Partager sur WhatsApp</a><a class="btn btn-sm" href="${esc(registrationUrl())}" target="_blank" rel="noopener">Voir la page</a></div>
        <div class="section-title mt">Dossier PDF à signer</div>
        <p class="small muted">Pour les personnes qui préfèrent remplir et signer un PDF : fiche complète (cotisation, virement, droit à l’image, règlement, autorisation parentale, santé), suivie des documents du club en annexe.</p>
        <button class="btn btn-primary" id="pdf-send">${icon('chat')}Envoyer le dossier PDF par WhatsApp</button>
      </div>
    </div>`;
  $('#backup').onclick = () => downloadBackup($('#backup'));
  bindAdac(view);
  $('#restore-file') && ($('#restore-file').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) restoreFromFile(f); });
  $('#reg-copy').onclick = async () => { try { await navigator.clipboard.writeText(registrationUrl()); toast('Lien copié'); } catch { $('#reg-url').select(); toast('Sélectionnez le lien pour le copier', 'error'); } };

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

  // Documents du club (règlement, QSS, QSS mineur, RIB, logo)
  $$('[data-doc]', view).forEach(inp => inp.onchange = async () => {
    const file = inp.files[0]; inp.value = ''; if (!file) return;
    const d = CLUB_DOCS.find(x => x.key === inp.dataset.doc);
    const okType = d.image ? /^image\/(png|jpeg)$/.test(file.type) : /^(application\/pdf|image\/(png|jpeg))$/.test(file.type);
    if (!okType) return toast(d.image ? 'Choisissez une image JPG ou PNG.' : 'Choisissez un PDF, un JPG ou un PNG.', 'error');
    if (file.size > 15 * 1024 * 1024) return toast('Fichier trop lourd : 15 Mo maximum.', 'error');
    const ext = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' }[file.type];
    const path = `${d.key}-${Date.now()}.${ext}`;
    toast('Envoi du fichier…');
    const { error } = await sb.storage.from('documents').upload(path, file, { contentType: file.type });
    if (error) return fail(error);
    const docs = { ...(S.settings.club_documents || {}) }, old = docs[d.key];
    docs[d.key] = { path, name: file.name, type: file.type, updated_at: new Date().toISOString() };
    if (await save({ club_documents: docs }, `${d.label} enregistré`)) {
      if (old?.path) sb.storage.from('documents').remove([old.path]).catch(() => {});
      route();
    } else sb.storage.from('documents').remove([path]).catch(() => {});
  });
  $$('[data-doc-rm]', view).forEach(b => b.onclick = async () => {
    const d = CLUB_DOCS.find(x => x.key === b.dataset.docRm);
    if (!await confirmBox('Retirer le document', `Retirer « ${esc(d.label)} » ? Il ne sera plus proposé sur la page d’inscription ni ajouté au dossier PDF.`, 'Retirer')) return;
    const docs = { ...(S.settings.club_documents || {}) }, old = docs[d.key]; delete docs[d.key];
    if (await save({ club_documents: docs }, 'Document retiré')) { if (old?.path) sb.storage.from('documents').remove([old.path]).catch(() => {}); route(); }
  });
  $('#bank-form').onsubmit = async e => {
    e.preventDefault();
    const d = readForm(e.target);
    if (d.bank_iban) d.bank_iban = d.bank_iban.replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();
    if (d.bank_bic) d.bank_bic = d.bank_bic.replace(/\s+/g, '').toUpperCase();
    if (d.bank_iban && !/^[A-Z]{2}\d{2}[A-Z0-9 ]{10,40}$/.test(d.bank_iban)) return toast('L’IBAN ne semble pas valide : vérifiez-le.', 'error');
    d.federation_label = e.target.federation_label.value.trim(); // vide = aucune fédération
    if (await save(d, 'Coordonnées enregistrées')) { $('#st-iban').value = d.bank_iban || ''; $('#st-bic').value = d.bank_bic || ''; }
  };
  $('#pdf-send').onclick = openPdfDossier;
  const tags = $('#tags-card');
  tags.onclick = async e => {
    const rm = e.target.closest('[data-rm]'), add = e.target.closest('[data-add]');
    if (rm) { const [k, i] = rm.dataset.rm.split(':'); const arr = [...tagVals(k)]; arr.splice(+i, 1);
      if (k === 'plan_sections' && !arr.length) return toast('Gardez au moins un chapitre.', 'error');
      if (await save({ [k]: arr }, 'Élément retiré')) route(); }
    if (add) { const k = add.dataset.add, inp = $(`[data-new="${k}"]`, tags), v = inp.value.trim(); if (!v) return;
      if (tagVals(k).some(x => x.toLowerCase() === v.toLowerCase())) return toast('Cet élément existe déjà.', 'error');
      if (await save({ [k]: [...tagVals(k), v] }, 'Élément ajouté')) route(); }
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
  $$('[data-role]', view).forEach(sel => {
    sel.dataset.prev = sel.value;
    sel.onchange = async () => {
      const who = team.find(p => p.id === sel.dataset.role)?.full_name || 'cette personne';
      if (['admin', 'tresorier'].includes(sel.value) && !await confirmBox('Accès complet', `${esc(who)} aura accès à <strong>tout le logiciel</strong>, y compris la comptabilité, les données médicales et la gestion de l’équipe. Confirmer ?`, 'Confirmer')) { sel.value = sel.dataset.prev; return; }
      const { error } = await sb.from('profiles').update({ role: sel.value }).eq('id', sel.dataset.role);
      if (error) { sel.value = sel.dataset.prev; return fail(error); }
      sel.dataset.prev = sel.value;
      toast(`${who} : ${roleLabel(sel.value)}`);
    };
  });
}

/* =====================================================================
   Planning & appel des présences
   ===================================================================== */
/* =====================================================================
   Liaison ADAC National (tableur Google, via le script adac-sync.gs)
   ===================================================================== */
const ADAC_ACTIONS = { ajout: ['À ajouter', 'ok'], complete: ['Cases vides à compléter', 'accent'], present: ['Déjà présents, rien à changer', ''], ignore: ['Ignorés', 'warn'] };
const ADAC_DONE = { ajout: 'Ajoutés', complete: 'Complétés', present: 'Déjà présents', ignore: 'Ignorés' };

async function adacEnsureKey() {
  if (S.settings.adac_key) return S.settings.adac_key;
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const key = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  const { error } = await sb.from('club_settings').update({ adac_key: key }).eq('id', 1);
  if (error) { fail(error); return null; }
  S.settings.adac_key = key; return key;
}

async function adacCall(body) {
  const s = S.settings;
  if (!s.adac_url || !s.adac_key) throw new Error('La liaison ADAC n’est pas encore installée.');
  let res;
  try {
    // Envoi en texte simple : évite la vérification préalable que Google refuse
    res = await fetch(s.adac_url, { method: 'POST', body: JSON.stringify({ key: s.adac_key, discipline: s.adac_discipline || 'BDR', ...body }) });
  } catch { throw new Error('Le tableur ADAC ne répond pas. Vérifiez l’URL et que le déploiement est accessible à « Tout le monde ».'); }
  let data;
  try { data = await res.json(); } catch { throw new Error('Réponse inattendue du tableur. Vérifiez que l’URL finit bien par /exec.'); }
  if (!data.ok) throw new Error(data.error || 'Le tableur a refusé l’envoi.');
  return data;
}

async function adacMembers() {
  const { data, error } = await sb.from('members').select('first_name, last_name, gender, birth_date, address, email, guardian_email, tshirt_size').eq('status', 'actif').order('last_name');
  if (error) throw error;
  return data.map(m => ({ first_name: m.first_name, last_name: m.last_name, gender: m.gender, birth_date: m.birth_date, address: m.address, email: m.email || m.guardian_email, tshirt_size: m.tshirt_size }));
}

function adacList(results, labels, withEmpty = false) {
  return Object.keys(labels).map(a => {
    const rows = results.filter(r => r.action === a);
    if (!rows.length && !withEmpty) return '';
    const [label, cls] = Array.isArray(labels[a]) ? labels[a] : [labels[a], ''];
    return `<div class="mt"><div class="row between"><strong>${esc(label)}</strong><span class="badge ${cls}">${rows.length}</span></div>
      ${a === 'present' ? '' : rows.map(r => `<div class="bday"><div style="flex:1">${esc(r.name)}</div><span class="small muted">${esc(r.detail || '')}</span></div>`).join('')}</div>`;
  }).join('');
}

async function adacSync(btn) {
  btn.disabled = true;
  let members, preview;
  try {
    members = await adacMembers();
    if (!members.length) { btn.disabled = false; return toast('Aucun membre actif à envoyer.', 'error'); }
    preview = await adacCall({ dryRun: true, members });
  } catch (e) { btn.disabled = false; return toast(e.message, 'error'); }
  btn.disabled = false;
  const todo = preview.ajouts + preview.completes;
  openModal({
    title: 'Envoi à l’ADAC National',
    body: `<p class="small muted">Aperçu pour ${members.length} membre${members.length > 1 ? 's' : ''} actif${members.length > 1 ? 's' : ''}. Rien n’est encore envoyé.</p>${adacList(preview.results, ADAC_ACTIONS)}
      ${todo ? '' : '<div class="alert info mt">Le tableur de l’ADAC est déjà à jour.</div>'}`,
    foot: `<button class="btn" data-close>${todo ? 'Annuler' : 'Fermer'}</button>${todo ? `<button class="btn btn-primary" id="adac-go">Envoyer (${preview.ajouts} ajout${preview.ajouts > 1 ? 's' : ''}${preview.completes ? `, ${preview.completes} complété${preview.completes > 1 ? 's' : ''}` : ''})</button>` : ''}`,
    onMount: root => {
      const go = $('#adac-go', root); if (!go) return;
      go.onclick = async () => {
        go.disabled = true; go.textContent = 'Envoi en cours…';
        try {
          const r = await adacCall({ members });
          closeModal();
          toast(`ADAC : ${r.ajouts} ajouté${r.ajouts > 1 ? 's' : ''}, ${r.completes} complété${r.completes > 1 ? 's' : ''}`);
          openModal({ title: 'Envoi terminé', body: `<p class="small muted">Le tableur de l’ADAC a été mis à jour.</p>${adacList(r.results, ADAC_DONE)}`, foot: '<button class="btn btn-primary" data-close>Fermer</button>' });
        } catch (e) { go.disabled = false; go.textContent = 'Réessayer'; toast(e.message, 'error'); }
      };
    },
  });
}

function bindAdac(view) {
  const card = $('#adac-card', view); if (!card) return;
  $('#adac-send', card).onclick = e => adacSync(e.currentTarget);
  $('#adac-copy', card).onclick = async () => {
    const key = await adacEnsureKey(); if (!key) return;
    let code;
    try { const r = await fetch(new URL('adac-sync.gs', import.meta.url), { cache: 'no-store' }); if (!r.ok) throw 0; code = (await r.text()).replace('__CLE_DEFENDR__', key); }
    catch { return toast('Impossible de récupérer le script.', 'error'); }
    try { await navigator.clipboard.writeText(code); toast('Script copié : collez-le dans Apps Script'); }
    catch { openModal({ title: 'Script ADAC', body: `<p class="small muted">Sélectionnez tout le texte et copiez-le.</p><textarea class="input" style="min-height:300px;font-family:monospace;font-size:12px" readonly>${esc(code)}</textarea>`, foot: '<button class="btn" data-close>Fermer</button>' }); }
  };
  $('#adac-form', card).onsubmit = async e => {
    e.preventDefault();
    const d = readForm(e.target);
    if (d.adac_url && !/^https:\/\/script\.google(usercontent)?\.com\//.test(d.adac_url)) return toast('L’URL doit commencer par https://script.google.com/', 'error');
    if (d.adac_url && !S.settings.adac_key) { if (!await adacEnsureKey()) return; }
    const { error } = await sb.from('club_settings').update(d).eq('id', 1);
    if (error) return fail(error);
    Object.assign(S.settings, d); toast('Liaison ADAC enregistrée'); route();
  };
  $('#adac-test', card).onclick = async e => {
    const btn = e.currentTarget, url = $('#st-adac-url', card).value.trim();
    if (!url) return toast('Collez d’abord l’URL de l’application Web.', 'error');
    const prev = S.settings.adac_url; S.settings.adac_url = url; btn.disabled = true;
    try { await adacEnsureKey(); const r = await adacCall({ dryRun: true, members: [] }); toast(r.ok ? 'Liaison OK : le tableur répond' : 'Pas de réponse'); }
    catch (err) { toast(err.message, 'error'); }
    finally { S.settings.adac_url = prev; btn.disabled = false; }
  };
}

const pad2 = n => String(n).padStart(2, '0');
const isoDay = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseDay = s => new Date(s + 'T00:00:00');
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const hhmm = t => (t || '').slice(0, 5);
const longDay = s => parseDay(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
S.plan = { mode: window.innerWidth < 860 ? 'liste' : 'semaine', anchor: new Date() };

async function fileHref(c) {
  if (!c.file_url) return null;
  if (!c.file_url.startsWith('storage:')) return c.file_url;
  const { data, error } = await sb.storage.from('cours').createSignedUrl(c.file_url.slice(8), 3600);
  return error ? null : data.signedUrl;
}
const safeName = n => (n || 'fichier').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_');

/* Règle d'assiduité : on ne compte que les séances passées de la saison active
   où l'appel a été fait, et seulement à partir de la date d'inscription du membre. */
async function seasonSessionsWithCall() {
  const season = activeSeason();
  let q = sb.from('courses').select('id, title, course_date, attendances(count)').lte('course_date', isoDay(new Date()));
  if (season) q = q.eq('season_id', season.id);
  const { data, error } = await q.order('course_date', { ascending: false });
  if (error) throw error;
  return data.filter(c => (c.attendances?.[0]?.count ?? 0) > 0);
}
function attendanceLevel(rate) {
  const t = S.settings || {};
  if (rate >= (t.threshold_assidu ?? 70)) return ['Assidu', 'ok'];
  if (rate >= (t.threshold_regulier ?? 45)) return ['Régulier', 'accent'];
  if (rate >= (t.threshold_risque ?? 25)) return ['À risque', 'warn'];
  return ['Quasi-absent', 'danger'];
}
function attendanceFor(m, sessions, presentIds) {
  // Point de départ : la date d'inscription, ou la première présence si elle est antérieure (cours d'essai)
  const firstPresent = sessions.filter(c => presentIds.has(c.id)).map(c => c.course_date).sort()[0];
  const start = [m.registration_date, firstPresent].filter(Boolean).sort()[0];
  const list = sessions.filter(c => !start || c.course_date >= start)
    .map(c => ({ ...c, present: presentIds.has(c.id) }));
  const present = list.filter(c => c.present).length;
  const rate = list.length ? Math.round(present / list.length * 100) : 0;
  const [label, cls] = attendanceLevel(rate);
  return { sessions: list, present, rate, label, cls };
}
async function memberAttendance(m, presentIds) {
  return attendanceFor(m, await seasonSessionsWithCall(), presentIds);
}

/* Rapatrie une seule fois les fichiers de cours encore stockés chez Base44 */
async function migrateBase44Files() {
  if (!isAdmin() || S.migrating) return;
  S.migrating = true;
  try {
    const { data } = await sb.from('courses').select('file_url, file_name').like('file_url', 'https://base44.app/%');
    const urls = [...new Map((data || []).map(c => [c.file_url, c.file_name])).entries()];
    let done = 0;
    for (const [url, name] of urls) {
      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.blob();
      const path = `base44/${url.split('/').pop().split('_')[0]}-${safeName(name)}`;
      const up = await sb.storage.from('cours').upload(path, blob, { upsert: true, contentType: blob.type || undefined });
      if (up.error) { console.error(up.error); continue; }
      const { error } = await sb.from('courses').update({ file_url: 'storage:' + path }).eq('file_url', url);
      if (!error) done++;
    }
    if (done) toast(`${done} fichier(s) de cours rapatrié(s) depuis Base44`);
  } catch (e) { console.error(e); }
}

async function viewPlanning(view) {
  migrateBase44Files();
  const P = S.plan, season = activeSeason();
  let from, to, label;
  if (P.mode === 'semaine') {
    from = mondayOf(P.anchor); to = addDays(from, 6);
    label = `Semaine du ${from.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
  } else if (P.mode === 'mois') {
    const first = new Date(P.anchor.getFullYear(), P.anchor.getMonth(), 1);
    from = mondayOf(first); to = addDays(from, 41);
    label = first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    label = label[0].toUpperCase() + label.slice(1);
  } else { label = season ? `Saison ${season.label}` : 'Toutes les séances'; }

  let q = sb.from('courses').select('id, title, course_date, start_time, end_time, room, discipline_id, instructor, file_url, attendances(count)');
  if (from) q = q.gte('course_date', isoDay(from)).lte('course_date', isoDay(to));
  else if (season) q = q.eq('season_id', season.id);
  const { data: courses, error } = await q.order('course_date', { ascending: P.mode !== 'liste' }).order('start_time');
  if (error) throw error;
  const today = isoDay(new Date());
  const count = c => c.attendances?.[0]?.count ?? 0;
  const { data: todays } = await sb.from('courses').select('id, title').eq('course_date', today).order('start_time');

  const card = c => `<button class="session" data-c="${c.id}">
      <span class="s-time">${hhmm(c.start_time) || '—'}${c.end_time ? ' – ' + hhmm(c.end_time) : ''}</span>
      <span class="s-title">${esc(c.title)}</span>
      <span class="s-meta">${c.room ? esc(c.room) : ''}${count(c) ? `<span class="badge ok">${count(c)} présent${count(c) > 1 ? 's' : ''}</span>` : (c.course_date <= today ? '<span class="badge warn">Appel à faire</span>' : '')}${c.file_url ? icon('file') : ''}</span>
    </button>`;

  let body = '';
  if (P.mode === 'semaine') {
    body = `<div class="week">${[0, 1, 2, 3, 4, 5, 6].map(i => {
      const d = isoDay(addDays(from, i)), list = courses.filter(c => c.course_date === d);
      return `<div class="day ${d === today ? 'today' : ''} ${list.length ? '' : 'empty-day'}"><div class="day-head"><span>${DAYS[i]}</span><strong>${parseDay(d).getDate()}</strong></div>${list.map(card).join('')}</div>`;
    }).join('')}</div>`;
  } else if (P.mode === 'mois') {
    const month = P.anchor.getMonth();
    body = `<div class="month only-desktop">${DAYS.map(d => `<div class="m-head">${d}</div>`).join('')}${Array.from({ length: 42 }, (_, i) => {
      const dd = addDays(from, i), d = isoDay(dd), list = courses.filter(c => c.course_date === d);
      return `<div class="m-cell ${dd.getMonth() !== month ? 'out' : ''} ${d === today ? 'today' : ''}"><span class="m-num">${dd.getDate()}</span>${list.map(c => `<button class="m-chip ${count(c) ? 'done' : ''}" data-c="${c.id}">${hhmm(c.start_time)} ${esc(c.title)}</button>`).join('')}</div>`;
    }).join('')}</div>
    <div class="only-mobile">${groupByDay(courses.filter(c => parseDay(c.course_date).getMonth() === month), card)}</div>`;
  } else {
    const upcoming = courses.filter(c => c.course_date >= today).reverse(), past = courses.filter(c => c.course_date < today);
    body = `${upcoming.length ? `<h2 class="section-title mt">À venir</h2>${groupByDay(upcoming, card)}` : ''}
      ${past.length ? `<h2 class="section-title mt">Séances passées</h2>${groupByDay(past, card)}` : ''}`;
  }

  view.innerHTML = head('Planning', 'Séances et appel des présences',
    `${todays?.length ? `<button class="btn" id="today-call">${icon('check')}Faire l’appel du jour</button>` : ''}<button class="btn btn-primary" id="new-course">${icon('plus')}Nouvelle séance</button>`) + `
    <div class="toolbar between">
      <div class="chips">${[['semaine', 'Semaine'], ['mois', 'Mois'], ['liste', 'Liste']].map(([k, l]) => `<button class="chip ${P.mode === k ? 'active' : ''}" data-mode="${k}">${l}</button>`).join('')}</div>
      ${P.mode !== 'liste' ? `<div class="row"><button class="icon-btn" id="prev" aria-label="Précédent">${icon('left')}</button><button class="btn btn-sm" id="now">Aujourd’hui</button><button class="icon-btn" id="next" aria-label="Suivant">${icon('right')}</button></div>` : ''}
    </div>
    <h2 class="section-title">${esc(label)} <span class="muted small" style="text-transform:none;letter-spacing:0">· ${courses.length} séance(s)</span></h2>
    ${courses.length || P.mode !== 'liste' ? body : '<div class="card empty">Aucune séance pour l’instant. Créez la première avec « Nouvelle séance ».</div>'}`;

  $$('[data-mode]', view).forEach(b => b.onclick = () => { P.mode = b.dataset.mode; route(); });
  const step = dir => { P.anchor = P.mode === 'semaine' ? addDays(P.anchor, 7 * dir) : new Date(P.anchor.getFullYear(), P.anchor.getMonth() + dir, 1); route(); };
  $('#prev') && ($('#prev').onclick = () => step(-1));
  $('#next') && ($('#next').onclick = () => step(1));
  $('#now') && ($('#now').onclick = () => { P.anchor = new Date(); route(); });
  $$('[data-c]', view).forEach(b => b.onclick = () => openSession(b.dataset.c));
  $('#new-course').onclick = () => courseForm(null, { course_date: isoDay(P.mode === 'liste' ? new Date() : (from <= new Date() && new Date() <= addDays(to, 1) ? new Date() : from)) });
  $('#today-call') && ($('#today-call').onclick = () => openSession(todays[0].id));
}

function groupByDay(courses, card) {
  if (!courses.length) return '<div class="card empty">Aucune séance sur cette période.</div>';
  const days = [...new Set(courses.map(c => c.course_date))];
  return `<div class="day-list">${days.map(d => `<div class="dl-group"><div class="dl-date">${esc(longDay(d))}</div>${courses.filter(c => c.course_date === d).map(card).join('')}</div>`).join('')}</div>`;
}

async function openSession(id) {
  const [cr, ar, mr, lr] = await Promise.all([
    sb.from('courses').select('*').eq('id', id).single(),
    sb.from('attendances').select('member_id, present').eq('course_id', id),
    sb.from('members').select('id, first_name, last_name, status, level_id').order('last_name'),
    sb.from('course_plan_items').select('plan_item_id, plan_items(id, label, category, done)').eq('course_id', id),
  ]);
  for (const r of [cr, ar, mr, lr]) if (r.error) return fail(r.error);
  const c = cr.data;
  const linked = lr.data.map(l => l.plan_items).filter(Boolean);
  const present = new Set(ar.data.filter(a => a.present).map(a => a.member_id));
  const people = mr.data.filter(m => m.status === 'actif' || present.has(m.id));
  const href = await fileHref(c);

  const row = m => `<label class="att-row ${present.has(m.id) ? 'on' : ''}" data-m="${m.id}" data-name="${esc(fullName(m).toLowerCase())}">
      <input type="checkbox" ${present.has(m.id) ? 'checked' : ''} aria-label="${esc(fullName(m))} présent">
      <span class="avatar">${esc(initials(m))}</span><span class="grow"><span class="att-name">${esc(fullName(m))}</span><span class="small muted">${esc(levelName(m.level_id))}</span></span>
      <span class="att-state">${present.has(m.id) ? 'Présent' : 'Absent'}</span></label>`;

  openModal({
    title: c.title,
    body: `
      <div class="row wrap small muted" style="gap:14px;margin-bottom:10px">
        <span class="row" style="gap:4px">${icon('calendar')}${esc(longDay(c.course_date))}</span>
        ${c.start_time ? `<span class="row" style="gap:4px">${icon('clock')}${hhmm(c.start_time)}${c.end_time ? ' – ' + hhmm(c.end_time) : ''}</span>` : ''}
        ${c.room ? `<span class="row" style="gap:4px">${icon('pin')}${esc(c.room)}</span>` : ''}
      </div>
      <div class="row wrap" style="gap:6px;margin-bottom:12px">
        ${c.discipline_id ? `<span class="badge">${esc(discName(c.discipline_id))}</span>` : ''}${c.instructor ? `<span class="badge">${esc(c.instructor)}</span>` : ''}
        ${href ? `<a class="btn btn-sm" href="${esc(href)}" target="_blank" rel="noopener">${icon('file')}${esc(c.file_name || 'Fichier du cours')}</a>` : ''}
      </div>
      ${c.notes ? `<p class="small" style="white-space:pre-line;margin:0 0 14px">${esc(c.notes)}</p>` : ''}
      ${linked.length ? `<div class="linked-plan"><div class="small muted" style="font-weight:700;margin-bottom:4px">Programme travaillé${linked.some(i => !i.done) ? ' · sera coché à l’enregistrement de l’appel' : ''}</div>${linked.map(i => `<div class="row small" style="gap:6px;align-items:flex-start">${i.done ? `<span style="color:var(--ok)">${icon('check')}</span>` : '<span class="dot"></span>'}<span>${esc(i.label)} <span class="muted">· ${esc(i.category)}</span></span></div>`).join('')}</div>` : ''}
      <div class="row between" style="margin:6px 0 10px"><h2 class="section-title" style="margin:0">Appel</h2><span class="badge ok" id="att-count"></span></div>
      <div class="row" style="gap:8px;margin-bottom:10px">
        <input class="input" type="search" id="att-search" placeholder="Rechercher…" aria-label="Rechercher un membre">
        <button class="btn btn-sm" id="att-all">Tous</button><button class="btn btn-sm" id="att-none">Aucun</button>
      </div>
      <div class="att-list" id="att-list">${people.map(row).join('')}</div>`,
    foot: `<button class="icon-btn" id="c-del" aria-label="Supprimer la séance" title="Supprimer">${icon('trash')}</button>
      <button class="btn" id="c-dup">${icon('copy')}<span class="only-desktop">Dupliquer</span></button>
      <button class="btn" id="c-edit">${icon('edit')}<span class="only-desktop">Modifier</span></button>
      <button class="btn btn-primary" id="c-save">Enregistrer l’appel</button>`,
    onMount: root => {
      const list = $('#att-list', root);
      const refresh = () => {
        const n = $$('.att-row input:checked', list).length;
        $('#att-count', root).textContent = `${n} présent${n > 1 ? 's' : ''} / ${people.length}`;
        $$('.att-row', list).forEach(r => { const on = $('input', r).checked; r.classList.toggle('on', on); $('.att-state', r).textContent = on ? 'Présent' : 'Absent'; });
      };
      refresh();
      list.addEventListener('change', refresh);
      $('#att-search', root).oninput = e => { const v = e.target.value.toLowerCase(); $$('.att-row', list).forEach(r => r.style.display = r.dataset.name.includes(v) ? '' : 'none'); };
      $('#att-all', root).onclick = () => { $$('.att-row', list).forEach(r => { if (r.style.display !== 'none') $('input', r).checked = true; }); refresh(); };
      $('#att-none', root).onclick = () => { $$('.att-row input', list).forEach(i => i.checked = false); refresh(); };
      $('#c-save', root).onclick = async () => {
        const btn = $('#c-save', root); btn.disabled = true;
        const ids = $$('.att-row', list).filter(r => $('input', r).checked).map(r => r.dataset.m);
        let del = sb.from('attendances').delete().eq('course_id', c.id);
        if (ids.length) del = del.not('member_id', 'in', `(${ids.join(',')})`);
        const r1 = await del;
        const r2 = ids.length ? await sb.from('attendances').upsert(ids.map(m => ({ course_id: c.id, member_id: m, present: true })), { onConflict: 'course_id,member_id' }) : { error: null };
        btn.disabled = false;
        if (r1.error || r2.error) return fail(r1.error || r2.error);
        let extra = '';
        const todo = linked.filter(i => !i.done).map(i => i.id);
        if (ids.length && todo.length) {
          const { error } = await sb.from('plan_items').update({ done: true }).in('id', todo);
          if (!error) extra = ` · ${todo.length} élément(s) du programme coché(s)`;
        }
        closeModal(); toast(`Appel enregistré : ${ids.length} présent${ids.length > 1 ? 's' : ''}${extra}`); if (currentPath() === '/planning') route();
      };
      $('#c-edit', root).onclick = () => courseForm(c);
      $('#c-dup', root).onclick = () => { const { id, created_at, legacy, ...rest } = c; courseForm(null, { ...rest, course_date: isoDay(addDays(parseDay(c.course_date), 7)) }); };
      $('#c-del', root).onclick = async () => {
        if (!await confirmBox('Supprimer la séance', `Supprimer « ${esc(c.title)} » du ${esc(longDay(c.course_date))} ? L’appel de cette séance sera aussi supprimé.`)) return;
        const { error } = await sb.from('courses').delete().eq('id', c.id);
        if (error) return fail(error);
        toast('Séance supprimée'); route();
      };
    },
  });
}

async function courseForm(c, defaults = {}) {
  const v = c || { start_time: S.settings?.default_start_time, end_time: S.settings?.default_end_time, instructor: S.profile?.full_name, ...defaults };
  const rooms = [...new Set([...(S.settings?.rooms || []), v.room].filter(Boolean))];
  const hasFile = !!v.file_url;
  const season = activeSeason();
  const [pr, lr] = await Promise.all([
    season ? sb.from('plan_items').select('id, month, category, label, done, position').eq('season_id', season.id).order('position') : { data: [] },
    c ? sb.from('course_plan_items').select('plan_item_id').eq('course_id', c.id) : { data: [] },
  ]);
  if (pr.error || lr.error) return fail(pr.error || lr.error);
  const planItems = pr.data, chosen = new Set(lr.data.map(l => l.plan_item_id));
  const planBlock = date => {
    if (!planItems.length) return '<span class="help">Aucun programme pour cette saison.</span>';
    const month = date ? parseDay(date).getMonth() + 1 : new Date().getMonth() + 1;
    const its = planItems.filter(i => i.month === month || chosen.has(i.id));
    if (!its.length) return `<span class="help">Rien de prévu au programme de ${MONTHS[month - 1]}.</span>`;
    return [...new Set(its.map(i => i.category))].map(cat => `<div class="small muted" style="font-weight:700;margin:8px 0 2px">${esc(cat)}</div>${its.filter(i => i.category === cat).map(i => `<label class="check" style="padding:4px 0"><input type="checkbox" class="cf-plan" value="${i.id}" ${chosen.has(i.id) ? 'checked' : ''}><span>${esc(i.label)}${i.done ? ' <span class="badge ok">déjà fait</span>' : ''}</span></label>`).join('')}`).join('');
  };
  openModal({
    title: c ? 'Modifier la séance' : 'Nouvelle séance',
    body: `<form id="cf" class="form-grid" novalidate>
      <div class="field full"><label for="cf-title">Titre / thème du cours *</label><input class="input" id="cf-title" name="title" value="${esc(v.title || '')}" placeholder="ex : Défense sur saisies"></div>
      <div class="field"><label for="cf-date">Date *</label><input class="input" id="cf-date" name="course_date" type="date" value="${esc(v.course_date || '')}"></div>
      <div class="field"><label for="cf-room">Salle</label><select class="input" id="cf-room" name="room"><option value="">—</option>${rooms.map(r => `<option ${r === v.room ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></div>
      <div class="field"><label for="cf-start">Début</label><input class="input" id="cf-start" name="start_time" type="time" value="${esc(hhmm(v.start_time))}"></div>
      <div class="field"><label for="cf-end">Fin</label><input class="input" id="cf-end" name="end_time" type="time" value="${esc(hhmm(v.end_time))}"></div>
      <div class="field"><label for="cf-disc">Discipline</label><select class="input" id="cf-disc" name="discipline_id"><option value="">—</option>${S.disciplines.filter(d => d.is_active || d.id === v.discipline_id).map(d => `<option value="${d.id}" ${d.id === v.discipline_id || (!v.discipline_id && S.disciplines.filter(x => x.is_active).length === 1 && d.is_active) ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="cf-instr">Enseignant</label><input class="input" id="cf-instr" name="instructor" value="${esc(v.instructor || '')}"></div>
      <div class="field full"><label for="cf-notes">Contenu / notes</label><textarea class="input" id="cf-notes" name="notes">${esc(v.notes || '')}</textarea></div>
      <div class="field full"><label for="cf-file">Fichier du cours</label>
        ${hasFile ? `<div class="row small" style="margin-bottom:6px">${icon('file')}<span>${esc(v.file_name || 'Fichier joint')}</span><label class="check" style="padding:0;margin-left:auto"><input type="checkbox" id="cf-rmfile"><span>Retirer</span></label></div>` : ''}
        <input class="input" id="cf-file" type="file"><span class="help">${hasFile ? 'Choisir un fichier remplacera le fichier actuel.' : 'Plan de cours, fiche… (facultatif)'}</span></div>
      ${c ? '' : `<div class="field full"><label for="cf-repeat">Répéter chaque semaine jusqu’au (facultatif)</label><input class="input" id="cf-repeat" type="date"><span class="help">Crée la même séance chaque semaine, même jour, jusqu’à cette date.</span></div>`}
      <div class="field full"><label>Programme travaillé (planification annuelle)</label><div class="cf-plan-box" id="cf-plan">${planBlock(v.course_date)}</div>
        <span class="help">Les éléments choisis seront cochés automatiquement dans la planification quand vous ferez l’appel.</span></div>
    </form>`,
    foot: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="cf-save">Enregistrer</button>`,
    onMount: root => {
    const box = $('#cf-plan', root);
    box.addEventListener('change', e => { if (e.target.classList.contains('cf-plan')) e.target.checked ? chosen.add(e.target.value) : chosen.delete(e.target.value); });
    $('#cf-date', root).addEventListener('change', e => { box.innerHTML = planBlock(e.target.value); });
    const syncPlan = async courseIds => {
      const ids = [...chosen];
      for (const cid of courseIds) {
        let del = sb.from('course_plan_items').delete().eq('course_id', cid);
        if (ids.length) del = del.not('plan_item_id', 'in', `(${ids.join(',')})`);
        const r1 = await del; if (r1.error) throw r1.error;
        if (ids.length) { const r2 = await sb.from('course_plan_items').upsert(ids.map(p => ({ course_id: cid, plan_item_id: p })), { onConflict: 'course_id,plan_item_id' }); if (r2.error) throw r2.error; }
      }
    };
    $('#cf-save', root).onclick = async () => {
      const d = readForm($('#cf', root));
      if (!d.title || !d.course_date) return toast('Le titre et la date sont obligatoires.', 'error');
      const btn = $('#cf-save', root); btn.disabled = true;
      try {
        const file = $('#cf-file', root).files[0];
        if (file) {
          if (file.size > 20 * 1024 * 1024) throw new Error('Fichier trop lourd (20 Mo maximum).');
          const path = `seances/${Date.now()}-${safeName(file.name)}`;
          const up = await sb.storage.from('cours').upload(path, file, { contentType: file.type || undefined });
          if (up.error) throw up.error;
          d.file_url = 'storage:' + path; d.file_name = file.name;
        } else if ($('#cf-rmfile', root)?.checked) { d.file_url = null; d.file_name = null; }
        else if (!c && v.file_url) { d.file_url = v.file_url; d.file_name = v.file_name; }
        if (c) {
          const { error } = await sb.from('courses').update(d).eq('id', c.id);
          if (error) throw error;
          await syncPlan([c.id]);
          closeModal(); toast('Séance mise à jour'); route();
        } else {
          const until = $('#cf-repeat', root).value;
          const dates = [d.course_date];
          if (until) for (let x = addDays(parseDay(d.course_date), 7); isoDay(x) <= until && dates.length < 60; x = addDays(x, 7)) dates.push(isoDay(x));
          const rows = dates.map(dt => ({ ...d, course_date: dt, season_id: activeSeason()?.id || null }));
          const { data: created, error } = await sb.from('courses').insert(rows).select('id');
          if (error) throw error;
          if (chosen.size && created?.length) await syncPlan([created[0].id]);
          closeModal(); toast(rows.length > 1 ? `${rows.length} séances créées` : 'Séance créée');
          S.plan.anchor = parseDay(d.course_date); go('/planning'); route();
        }
      } catch (e) { fail(e); btn.disabled = false; }
    };
    },
  });
}

/* =====================================================================
   Inscriptions en ligne
   ===================================================================== */
const registrationUrl = () => location.origin + location.pathname.replace(/[^/]*$/, '') + 'inscription.html';

// Documents du club, réglables dans Paramètres (stockés dans l'espace public « documents »)
const CLUB_DOCS = [
  { key: 'reglement', label: 'Règlement intérieur' },
  { key: 'qss', label: 'Questionnaire de santé QS-Sport (adultes)' },
  { key: 'qss_mineur', label: 'Questionnaire de santé (mineurs)' },
  { key: 'rib', label: 'RIB du club' },
  { key: 'logo', label: 'Logo du club (en-tête du dossier PDF)', image: true },
];
const docUrl = f => f?.path ? sb.storage.from('documents').getPublicUrl(f.path).data.publicUrl : null;

// Justificatifs de santé envoyés avec l'inscription (espace privé « inscriptions »)
const HEALTH_KIND = { certificat: 'Certificat médical', questionnaire: 'Questionnaire de santé' };
const healthFileButtons = files => (files || []).map((f, i) => `<button type="button" class="btn btn-sm" data-hf="${i}">${icon('file')}${esc(HEALTH_KIND[f.kind] || 'Justificatif')}</button>`).join('');
function bindHealthFiles(root, files) {
  $$('[data-hf]', root).forEach(b => b.onclick = async () => {
    const f = files[+b.dataset.hf];
    const w = window.open('', '_blank'); // ouvert tout de suite, sinon le téléphone bloque la fenêtre
    const { data, error } = await sb.storage.from('inscriptions').createSignedUrl(f.path, 600);
    if (error) { w?.close(); return fail(error); }
    if (w) w.location = data.signedUrl; else location.href = data.signedUrl;
  });
}

/* ---------- Dossier d'inscription PDF à signer, envoyé par WhatsApp ---------- */
function openPdfDossier() {
  let pdfFile = null;
  openModal({
    title: 'Dossier PDF à signer', size: 'sm',
    body: `<form id="pd-f"><p class="small muted" style="margin-top:0">Le nom et le téléphone sont pré-remplis dans le PDF ; la personne complète et signe le reste.</p>
      <div class="field"><label for="pd-fn">Prénom</label><input class="input" id="pd-fn" name="prenom" autocomplete="off"></div>
      <div class="field"><label for="pd-ln">Nom</label><input class="input" id="pd-ln" name="nom" autocomplete="off"></div>
      <div class="field"><label for="pd-ph">Téléphone WhatsApp</label><input class="input" id="pd-ph" name="tel" type="tel" autocomplete="off" placeholder="06 12 34 56 78"></div>
      <div id="pd-msg"></div></form>`,
    foot: `<button class="btn" data-close>Fermer</button><button class="btn btn-primary" id="pd-make">${icon('file')}Préparer le PDF</button><button class="btn" id="pd-chat" hidden>${icon('chat')}Ouvrir la discussion</button><button class="btn btn-primary" id="pd-share" hidden>${icon('up')}Partager le PDF</button>`,
    onMount: root => {
      const form = $('#pd-f', root), msg = $('#pd-msg', root), make = $('#pd-make', root), share = $('#pd-share', root), chat = $('#pd-chat', root);
      const text = () => { const p = form.prenom.value.trim(); return `Bonjour${p ? ' ' + p : ''},\n\nvoici ton dossier d’inscription au ${S.settings?.club_name || 'club'}${activeSeason() ? ' pour la saison ' + activeSeason().label : ''}.\n\n1. Remplis et signe le PDF (sur ton téléphone ou imprimé).\n2. Joins ton certificat médical ou signe l’attestation de santé (page 3).\n3. Règle la cotisation : virement (coordonnées page 2), chèque ou espèces.\n\nRenvoie-nous le tout ici ou apporte-le au prochain cours. À très vite sur le tatami ! 👊`; };
      form.oninput = () => { pdfFile = null; share.hidden = true; chat.hidden = true; make.hidden = false; msg.innerHTML = ''; };
      chat.onclick = () => { const link = waUrl(form.tel.value.trim(), text().replace('voici ton dossier', 'je t’envoie ton dossier')); if (link) window.open(link, '_blank', 'noopener'); };
      make.onclick = async () => {
        make.disabled = true; make.textContent = 'Préparation…';
        try {
          const d = readForm(form);
          const { bytes, problems } = await buildDossierPdf({ prenom: d.prenom || '', nom: d.nom || '', tel: d.tel || '' });
          const slug = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
          const name = ['Dossier_inscription', slug(S.settings?.club_name), slug(d.nom), slug(d.prenom)].filter(Boolean).join('_') + '.pdf';
          pdfFile = new File([bytes], name, { type: 'application/pdf' });
          make.hidden = true; share.hidden = false; chat.hidden = !waLink(d.tel);
          msg.innerHTML = `<div class="alert ${problems.length ? 'error' : 'info'}" style="margin:0">${problems.length ? `PDF prêt, mais ces documents n’ont pas pu être ajoutés : ${esc(problems.join(', '))}. Vérifiez-les dans Documents et paiement de l’inscription.` : 'PDF prêt.'} ${navigator.canShare?.({ files: [pdfFile] }) ? '<br><br><strong>Partager le PDF</strong> : dans le menu qui s’ouvre, WhatsApp n’est pas toujours en premier. Faites glisser la rangée d’applications vers la gauche, ou touchez « Plus », puis WhatsApp et la personne. Astuce : dans « Plus », touchez « Modifier » et ajoutez WhatsApp aux favoris pour qu’il apparaisse en premier.' + (waLink(d.tel) ? '<br><br>La personne n’est pas dans vos contacts ? Touchez d’abord <strong>Ouvrir la discussion</strong> (WhatsApp s’ouvre sur son numéro avec le message), puis revenez ici pour partager le PDF dans cette discussion.' : '') : 'Le PDF va être téléchargé et WhatsApp s’ouvrira avec le message : joignez-y le PDF (trombone → Document).'}</div>`;
        } catch (e) { fail(e); }
        finally { make.disabled = false; make.innerHTML = `${icon('file')}Préparer le PDF`; }
      };
      share.onclick = async () => {
        if (!pdfFile) return;
        if (navigator.canShare?.({ files: [pdfFile] })) {
          try { await navigator.share({ files: [pdfFile], text: text() }); return; }
          catch (e) { if (e?.name === 'AbortError') return; }
        }
        const a = document.createElement('a'); a.href = URL.createObjectURL(pdfFile); a.download = pdfFile.name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 60000);
        const link = waUrl(form.tel.value.trim() || null, text());
        if (link) window.open(link, '_blank', 'noopener');
      };
    },
  });
}

async function buildDossierPdf(ad) {
  const { PDFDocument, StandardFonts, rgb } = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');
  const s = S.settings || {}, season = activeSeason(), docs = s.club_documents || {};
  const club = s.club_name || 'le club', fede = (s.federation_label ?? 'l’ADAC').trim();
  const hx = h => { const n = parseInt(h.slice(1), 16); return rgb((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); };
  const RED = hx('#D0161B'), DARK = hx('#111111'), GREY = hx('#5A5A5A'), LIGHT = hx('#F4F4F4'), FIELD = hx('#FBF6F6'), LINE = hx('#BDBDBD'),
    GREEN = hx('#2E7D32'), BLUE = hx('#1F4E9E'), PURPLE = hx('#6A2A9A'), WHITE = rgb(1, 1, 1), BLACK = rgb(0, 0, 0), PINK = hx('#FFF5F5'), SOFT = hx('#BBBBBB');
  const doc = await PDFDocument.create();
  doc.setTitle(`Dossier d'inscription – ${club}`); doc.setAuthor(club);
  const F = await doc.embedFont(StandardFonts.Helvetica), FB = await doc.embedFont(StandardFonts.HelveticaBold),
    FI = await doc.embedFont(StandardFonts.HelveticaOblique), FC = await doc.embedFont(StandardFonts.CourierBold);
  const form = doc.getForm();
  const W = 595.28, H = 841.89, M = 30, half = (W - 2 * M - 12) / 2;
  let page, y;
  const clean = v => { let o = ''; for (const ch of String(v ?? '')) { try { F.encodeText(ch); o += ch; } catch { o += ({ ' ': ' ', ' ': ' ', '‑': '-', '→': '>' })[ch] ?? ''; } } return o; };
  const text = (t, x, yy, size = 9, font = F, color = DARK) => page.drawText(clean(t), { x, y: yy, size, font, color });
  const wrap = (t, font, size, w) => { const out = []; for (const p of clean(t).split('\n')) { let line = ''; for (const word of p.split(' ')) { const c = line ? line + ' ' + word : word; if (font.widthOfTextAtSize(c, size) > w && line) { out.push(line); line = word; } else line = c; } out.push(line); } return out; };
  const para = (t, x, yy, w, size = 8.5, font = F, color = DARK) => { for (const l of wrap(t, font, size, w)) { page.drawText(l, { x, y: yy, size, font, color }); yy -= size * 1.3; } return yy; };
  const rrect = (x, yy, w, h, r, o) => page.drawSvgPath(`M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`,
    { x, y: yy + h, color: o.fill, borderColor: o.stroke, borderWidth: o.stroke ? (o.bw || 0.8) : 0, borderDashArray: o.dash });
  const names = new Set(); const uniq = n => { let k = n, i = 2; while (names.has(k)) k = n + '_' + i++; names.add(k); return k; };
  const tf = (name, x, yy, w, h = 15, o = {}) => { const f = form.createTextField(uniq(name)); if (o.multiline) f.enableMultiline(); if (o.value) f.setText(clean(o.value));
    f.addToPage(page, { x, y: yy, width: w, height: h, borderColor: LINE, backgroundColor: FIELD, borderWidth: 0.6, textColor: BLACK, font: F }); f.setFontSize(9); };
  const cb = (name, x, yy, size = 10) => form.createCheckBox(uniq(name)).addToPage(page, { x, y: yy, width: size, height: size, borderColor: GREY, borderWidth: 0.8, backgroundColor: WHITE, textColor: RED });
  const labeled = (label, name, x, yy, w, value) => { const lw = FB.widthOfTextAtSize(clean(label), 8.5) + 5; text(label, x, yy + 4, 8.5, FB); tf(name, x + lw, yy, w - lw, 15, { value }); };
  const section = (num, title, color = RED) => { rrect(M, y - 20, W - 2 * M, 20, 4, { fill: color }); page.drawCircle({ x: M + 14, y: y - 10, size: 7, color: WHITE });
    const n = String(num); page.drawText(n, { x: M + 14 - FB.widthOfTextAtSize(n, 9) / 2, y: y - 13.2, size: 9, font: FB, color }); text(title, M + 28, y - 14, 10.5, FB, WHITE); y -= 32; };
  const signRow = (prefix, label = 'Signature') => { rrect(M, y - 34, W - 2 * M, 40, 4, { fill: LIGHT }); text('Date :', M + 10, y - 14, 8.5, FB); tf(prefix + '_date', M + 42, y - 18, 80);
    const lw = FB.widthOfTextAtSize(clean(label + ' :'), 8.5); text(label + ' :', M + 140, y - 14, 8.5, FB); tf(prefix + '_signature', M + 140 + lw + 6, y - 28, W - 2 * M - 160 - lw, 30); y -= 46; };
  const fetchDoc = async f => { const r = await fetch(docUrl(f)); if (!r.ok) throw new Error('introuvable'); return new Uint8Array(await r.arrayBuffer()); };

  let logo = null;
  if (docs.logo) { try { const b = await fetchDoc(docs.logo); logo = /png/i.test(docs.logo.type || docs.logo.path) ? await doc.embedPng(b) : await doc.embedJpg(b); } catch { logo = null; } }
  const header = () => { page.drawRectangle({ x: 0, y: H - 118, width: W, height: 118, color: DARK }); page.drawRectangle({ x: 0, y: H - 122, width: W, height: 4, color: RED });
    let tx = M;
    if (logo) { const k = Math.min(88 / logo.width, 101 / logo.height), w = logo.width * k, h = logo.height * k; page.drawImage(logo, { x: M - 4 + (88 - w) / 2, y: H - 112 + (101 - h) / 2, width: w, height: h }); tx = M + 100; }
    text("FICHE D'INSCRIPTION", tx, H - 52, 25, FB, WHITE); if (season) text('SAISON ' + season.label.replace('/', ' / '), tx, H - 72, 13, FB, RED);
    text(club, tx, H - 90, 10, F, WHITE); text('Remplissez et signez ce dossier, puis renvoyez-le avec les pièces demandées (page 3).', tx, H - 105, 8.5, FI, SOFT); };
  const footer = n => { page.drawRectangle({ x: 0, y: 0, width: W, height: 30, color: DARK }); page.drawRectangle({ x: 0, y: 30, width: W, height: 2, color: RED });
    const line = [s.club_address, s.whatsapp_number, s.club_email].filter(Boolean).join('  ·  '); let fs = 7.5; while (F.widthOfTextAtSize(clean(line), fs) > W - 2 * M - 30 && fs > 5) fs -= 0.25;
    text(line, M, 12, fs, F, WHITE); text(n + '/3', W - M - F.widthOfTextAtSize(n + '/3', 7.5), 12, 7.5, F, WHITE); };

  /* Page 1 */
  page = doc.addPage([W, H]); header(); y = H - 136;
  section(1, 'INFORMATIONS PERSONNELLES');
  labeled('Nom :', 'nom', M, y - 4, half, ad.nom); labeled('Prénom :', 'prenom', M + half + 12, y - 4, half, ad.prenom); y -= 22;
  labeled('Date de naissance :', 'date_naissance', M, y - 4, half);
  text('Sexe :', M + half + 12, y, 8.5, FB); cb('sexe_f', M + half + 50, y - 2); text('F', M + half + 64, y, 8.5); cb('sexe_m', M + half + 82, y - 2); text('M', M + half + 96, y, 8.5); y -= 22;
  labeled('Adresse :', 'adresse', M, y - 4, W - 2 * M); y -= 22;
  labeled('Code postal :', 'code_postal', M, y - 4, 150); labeled('Ville :', 'ville', M + 162, y - 4, W - 2 * M - 162); y -= 22;
  labeled('Téléphone :', 'telephone', M, y - 4, half, ad.tel); labeled('E-mail :', 'email', M + half + 12, y - 4, half); y -= 26;
  rrect(M, y - 52, W - 2 * M, 60, 4, { fill: LIGHT });
  text("PERSONNE À PRÉVENIR EN CAS D'URGENCE", M + 10, y - 6, 8.5, FB, RED);
  labeled('Nom et prénom :', 'urgence_nom', M + 10, y - 28, half - 10); labeled('Lien :', 'urgence_lien', M + half + 12, y - 28, half - 10);
  labeled('Téléphone :', 'urgence_tel', M + 10, y - 48, half - 10); y -= 72;
  section(2, 'INFORMATIONS SPORTIVES');
  text('Avez-vous déjà pratiqué un art martial ou un sport de combat ?', M, y, 8.5, FB);
  cb('pratique_oui', M + 290, y - 2); text('Oui', M + 304, y, 8.5); cb('pratique_non', M + 330, y - 2); text('Non', M + 344, y, 8.5); y -= 22;
  labeled('Si oui, lequel et combien de temps ?', 'pratique_lequel', M, y - 4, W - 2 * M); y -= 24;
  text('Comment avez-vous connu le club ?', M, y, 8.5, FB); y -= 18;
  let x = M;
  for (const [l, n] of [['Bouche à oreille', 'connu_bouche'], ['Internet / réseaux', 'connu_internet'], ['Forum des associations', 'connu_forum'], ['Démonstration', 'connu_demo']]) { cb(n, x, y - 2); text(l, x + 14, y, 8.5); x += 130; }
  y -= 20; cb('connu_autre', M, y - 2); text('Autre :', M + 14, y, 8.5); tf('connu_autre_precision', M + 50, y - 4, W - 2 * M - 50); y -= 24;
  text('Taille du T-shirt (adulte) :', M, y, 8.5, FB); x = M + 130;
  for (const t of ['XS', 'S', 'M', 'L', 'XL', 'XXL']) { cb('tshirt_' + t, x, y - 2); text(t, x + 14, y, 8.5); x += 50; } y -= 28;
  section(3, 'COTISATION  (licence et assurance incluses)');
  feeOptions().filter(([, a]) => a != null).forEach(([l, a], i) => { cb('cotis_' + (i + 1), M, y - 2); text(l, M + 14, y, 8.5); text(fmtMoney(a), M + 330, y, 8.5, FB); y -= 17; });
  y -= 4; text('Mode de règlement :', M, y, 8.5, FB, RED); x = M + 105;
  for (const [l, n] of [[s.bank_iban ? 'Virement (coordonnées page 2)' : 'Virement', 'regl_virement'], ['Chèque(s)', 'regl_cheque'], ['Espèces', 'regl_especes']]) { cb(n, x, y - 2); text(l, x + 14, y, 8.5); x += F.widthOfTextAtSize(clean(l), 8.5) + 34; }
  y -= 22; labeled('Nombre de chèques :', 'nb_cheques', M, y - 4, 160); labeled('N° du ou des chèques :', 'num_cheques', M + 172, y - 4, W - 2 * M - 172); y -= 16;
  para(`Chèques à l'ordre de « ${s.bank_holder || club} ». Paiement possible en plusieurs chèques encaissés à des dates différentes, à indiquer au dos.`, M, y - 4, W - 2 * M, 7.5, FI, GREY);
  footer(1);

  /* Page 2 */
  page = doc.addPage([W, H]); y = H - 36;
  if (s.bank_iban) {
    rrect(M, y - 104, W - 2 * M, 104, 6, { fill: PINK, stroke: RED, bw: 1.2 });
    text('PAYER PAR VIREMENT', M + 12, y - 18, 11, FB, RED);
    let yy = y - 36;
    for (const [k, v] of [['Titulaire', s.bank_holder], ['IBAN', s.bank_iban], ['BIC', s.bank_bic], ['Banque', s.bank_name]]) { text(k, M + 12, yy, 8.5, FB, GREY); text(v || '', M + 72, yy, k === 'IBAN' ? 9.5 : 8.5, k === 'IBAN' || k === 'BIC' ? FC : F, DARK); yy -= 14; }
    text('Libellé à indiquer :', M + 12, yy - 2, 8.5, FB, GREY); text("COTISATION + NOM Prénom de l'adhérent", M + 100, yy - 2, 8.5, FB, RED);
    labeled('Date du virement :', 'virement_date', M + 330, y - 40, 175); y -= 122;
  }
  section(4, "AUTORISATION DU DROIT À L'IMAGE", PURPLE);
  y = para(`J'autorise ${fede || 'le club'} à prendre des photos ou des vidéos de moi (ou de mon enfant) lors des cours ou en stage, et à les diffuser sur le site web, les réseaux sociaux ou d'autres supports de communication du club${fede ? ' ou de ' + fede : ''}.`, M, y, W - 2 * M) - 6;
  cb('image_accepte', M, y - 2); text("J'accepte", M + 14, y, 9, FB, GREEN); cb('image_refuse', M + 100, y - 2); text('Je refuse', M + 114, y, 9, FB, RED); y -= 18; signRow('image');
  section(5, "CONSENTEMENT À L'UTILISATION DES DONNÉES", BLUE);
  y = para(`J'accepte que ${fede ? "l'association " + fede.replace(/^l['’]\s*/i, '') : 'le club'} collecte et utilise les données personnelles renseignées dans ce formulaire, pour la gestion de mon adhésion et de ma licence, conformément à la politique de protection des données du club ${club}${fede ? ' et de ' + fede : ''}.`, M, y, W - 2 * M);
  y = para(`Afin de protéger la confidentialité de vos données, le club${fede ? ' et ' + fede + " s'engagent" : " s'engage"} à ne pas les divulguer, ne pas les transmettre ni les partager avec d'autres entités, entreprises ou organismes, quels qu'ils soient, conformément au Règlement général sur la protection des données (RGPD). Les informations de santé ne sont utilisées que pour vérifier l'aptitude à la pratique.`, M, y - 2, W - 2 * M, 7.8, FI, GREY) - 6;
  cb('rgpd_accepte', M, y - 2); text("J'ai lu et j'accepte cette politique.", M + 14, y, 9, FB); y -= 18; signRow('rgpd');
  section(6, 'LECTURE DU RÈGLEMENT INTÉRIEUR', GREEN);
  y = para(`Le règlement intérieur du club ${docs.reglement ? 'est joint à ce dossier (annexe)' : 'est disponible auprès du bureau'}. Je reconnais l'avoir lu et l'accepter sans réserve ; j'ai également pris connaissance de la possibilité de souscrire une assurance complémentaire à celle proposée par le club.`, M, y, W - 2 * M) - 6;
  for (const [l, n] of [["J'ai lu le règlement intérieur.", 'ri_lu'], ["Je l'accepte sans réserve.", 'ri_accepte'], ["J'ai pris connaissance de la possibilité de souscrire une assurance complémentaire.", 'ri_assurance']]) { cb(n, M, y - 2); text(l, M + 14, y, 9, FB); y -= 16; }
  y -= 2; signRow('ri', 'Signature (+ représentant légal si mineur)');
  section(7, 'AUTORISATION PARENTALE  (obligatoire pour les moins de 18 ans)', DARK);
  labeled('Je soussigné(e) :', 'parent_nom', M, y - 4, half); labeled('agissant en qualité de :', 'parent_qualite', M + half + 12, y - 4, half); y -= 20;
  labeled("représentant légal de l'enfant :", 'parent_enfant', M, y - 4, W - 2 * M); y -= 14;
  y = para("autorise mon enfant à s'inscrire au club et à participer aux cours et stages de self-défense. J'autorise les responsables du club à prendre, en cas d'urgence, toute mesure nécessaire (appel des secours, transport vers un établissement de soins). Je m'engage à accompagner et récupérer mon enfant dans la salle, aux horaires des cours.", M, y - 4, W - 2 * M) - 4;
  labeled('Téléphone du représentant légal :', 'parent_tel', M, y - 4, half + 60); y -= 14; signRow('parent', 'Signature du représentant légal');
  footer(2);

  /* Page 3 */
  page = doc.addPage([W, H]); y = H - 36;
  section(8, 'CERTIFICAT MÉDICAL OU QUESTIONNAIRE DE SANTÉ');
  y = para(`Cochez la situation qui vous concerne. ${docs.qss || docs.qss_mineur ? 'Les questionnaires officiels sont joints en annexe : remplissez-les pour vous-même, sans nous les renvoyer, puis attestez ci-dessous.' : 'Remplissez le questionnaire officiel pour vous-même, puis attestez ci-dessous.'} Si vous répondez OUI à au moins une question, ou si vous n'êtes pas certain d'avoir compris une question, un certificat médical est obligatoire.`, M, y, W - 2 * M) - 8;
  const block = (n, title, body, h) => { rrect(M, y - h, W - 2 * M, h + 6, 5, { fill: WHITE, stroke: LINE }); cb(n, M + 8, y - 10, 11); text(title, M + 26, y - 8, 9.5, FB, RED); return para(body, M + 26, y - 22, W - 2 * M - 36, 8.3); };
  block('sante_certificat', 'A. Je joins un certificat médical', "Certificat de moins d'un an attestant l'absence de contre-indication à la pratique de la self-défense / des sports de combat. Obligatoire pour un adulte qui s'inscrit pour la première fois, ou dès qu'une réponse « OUI » a été donnée à un questionnaire.", 52);
  y -= 64;
  let yy = block('sante_qs_majeur', 'B. Adulte – renouvellement : attestation QS-SPORT (Cerfa n°15699*01)', "Je soussigné(e) ci-dessous atteste avoir renseigné le questionnaire de santé QS-SPORT Cerfa n°15699*01 et avoir répondu par la négative à l'ensemble des rubriques.", 64);
  labeled('Nom, prénom :', 'qs_majeur_nom', M + 26, yy - 6, 250);
  text('Date :', M + 290, yy - 2, 8.5, FB); tf('qs_majeur_date', M + 320, yy - 6, 70); text('Signature :', M + 398, yy - 2, 8.5, FB); tf('qs_majeur_signature', M + 446, yy - 10, W - 2 * M - 452, 20);
  y -= 78;
  yy = block('sante_qs_mineur', 'C. Mineur : attestation du questionnaire de santé du sportif mineur', "Je soussigné(e) ci-dessous, représentant légal de l'enfant, atteste que chacune des rubriques du questionnaire de santé du sportif mineur a donné lieu à une réponse négative. Le certificat médical n'est alors pas exigé (articles L. 231-2 et D. 231-1-4 du Code du sport).", 92);
  labeled("Nom de l'enfant :", 'qs_mineur_enfant', M + 26, yy - 6, 220); labeled('Représentant légal :', 'qs_mineur_parent', M + 256, yy - 6, W - 2 * M - 262); yy -= 20;
  text('Date :', M + 26, yy - 2, 8.5, FB); tf('qs_mineur_date', M + 56, yy - 6, 70); text('Signature :', M + 140, yy - 2, 8.5, FB); tf('qs_mineur_signature', M + 188, yy - 10, 200, 20);
  y -= 108;
  rrect(M, y - 150, W - 2 * M, 150, 6, { fill: DARK });
  text('DOSSIER À RETOURNER', M + 12, y - 18, 11, FB, WHITE); yy = y - 38;
  for (const it of ['Cette fiche complétée, avec les cases cochées et les signatures', "Le certificat médical, OU l'attestation B (adulte) / C (mineur) ci-dessus", "L'autorisation parentale (section 7) pour les moins de 18 ans", 'Le règlement de la cotisation : virement (libellé « COTISATION + NOM Prénom »), chèque(s) ou espèces']) {
    page.drawRectangle({ x: M + 14, y: yy - 1, width: 7, height: 7, color: RED }); text(it, M + 28, yy, 8.5, F, WHITE); yy -= 15; }
  yy -= 4; text('Comment le renvoyer ?', M + 14, yy, 9, FB, RED); yy -= 14;
  const ways = ['par WhatsApp' + (s.whatsapp_number ? ' au ' + s.whatsapp_number : ''), s.club_email ? 'par e-mail à ' + s.club_email : '', "ou remis en main propre au début d'un cours" + (s.club_address ? ` (${s.club_address})` : '')].filter(Boolean);
  para('PDF complété ou photo lisible : ' + ways.join(', ') + '.', M + 14, yy, W - 2 * M - 28, 8.5, F, WHITE);
  y -= 168;
  rrect(M, y - 92, W - 2 * M, 92, 5, { stroke: GREY, dash: [3, 2] });
  text('RÉSERVÉ AU CLUB', M + 12, y - 16, 9.5, FB, GREY);
  [['Dossier complet', 'club_complet'], ['Cotisation réglée', 'club_cotisation'], ['Licence enregistrée', 'club_licence'], ['Assurance', 'club_assurance'], ['Certificat / attestation santé', 'club_sante'], ['Autorisation parentale', 'club_parent']].forEach(([l, n], i) => {
    const xx = M + 12 + Math.floor(i / 3) * 170, y2 = y - 34 - (i % 3) * 16; cb(n, xx, y2 - 2); text(l, xx + 14, y2, 8.5, F, GREY); });
  text('Observations :', M + 352, y - 32, 8.5, FB, GREY); tf('club_observations', M + 352, y - 84, W - 2 * M - 362, 46, { multiline: true });
  footer(3);

  /* Annexes : règlement intérieur, questionnaires, RIB */
  const problems = [];
  for (const d of CLUB_DOCS.filter(x => !x.image)) {
    const f = docs[d.key]; if (!f) continue;
    try {
      const bytes = await fetchDoc(f);
      if (/pdf/i.test(f.type || f.path)) {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        (await doc.copyPages(src, src.getPageIndices())).forEach(p => doc.addPage(p));
      } else {
        const im = /png/i.test(f.type || f.path) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        page = doc.addPage([W, H]); text(d.label.toUpperCase(), M, H - 40, 12, FB, RED);
        const k = Math.min((W - 2 * M) / im.width, (H - 100) / im.height, 1.5);
        page.drawImage(im, { x: (W - im.width * k) / 2, y: H - 60 - im.height * k, width: im.width * k, height: im.height * k });
      }
    } catch { problems.push(d.label); }
  }
  form.updateFieldAppearances(F);
  return { bytes: await doc.save(), problems };
}

async function openRegistrations() {
  const { data, error } = await sb.from('registrations').select('*').eq('status', 'nouvelle').order('created_at');
  if (error) return fail(error);
  const yes = b => b ? 'Oui' : 'Non';
  openModal({
    title: 'Inscriptions en ligne',
    body: data.length ? data.map(r => { const d = r.data || {}; const minor = (ageOf(d.birth_date) ?? 99) < 18; return `
      <div class="card card-pad mb reg-card" data-r="${r.id}">
        <div class="row between wrap"><div><strong style="font-size:16px">${esc(d.first_name)} ${esc(d.last_name)}</strong><div class="small muted">Reçue le ${fmtDate(r.created_at.slice(0, 10))}${d.birth_date ? ` · ${ageOf(d.birth_date)} ans` : ''}${minor ? ' · <span class="badge warn">Mineur</span>' : ''}</div></div>
          ${isAdmin() ? `<div class="row" style="gap:6px"><button class="btn btn-sm" data-refuse="${r.id}">Refuser</button><button class="btn btn-sm btn-primary" data-accept="${r.id}">${icon('check')}Créer la fiche</button></div>` : ''}</div>
        <dl class="kv small mt">
          <dt>Téléphone</dt><dd>${esc(d.phone || '—')}</dd><dt>E-mail</dt><dd>${esc(d.email || '—')}</dd>
          <dt>Adresse</dt><dd>${esc(d.address || '—')}</dd><dt>Cotisation</dt><dd>${esc(d.fee_type || '—')}</dd>
          <dt>Urgence</dt><dd>${esc(d.emergency_contact || '—')} · ${esc(d.emergency_phone || '')}</dd>
          ${minor ? `<dt>Responsable légal</dt><dd>${esc(d.guardian_name || '—')} · ${esc(d.guardian_phone || '')}</dd><dt>Autorisation parentale</dt><dd>${yes(d.parental_authorization)}</dd>` : ''}
          ${d.medical_notes ? `<dt>Info médicale</dt><dd>${esc(d.medical_notes)}</dd>` : ''}
          <dt>Santé</dt><dd>${d.health_mode === 'certificat' ? 'Certificat médical envoyé' : d.health_mode === 'questionnaire' ? `Questionnaire de santé : toutes les réponses « Non »${d.health_attested ? ' (attesté)' : ''}` : '—'}</dd>
          <dt>Paiement prévu</dt><dd>${esc(d.payment_method || '—')}</dd>
          <dt>Droit à l’image</dt><dd>${yes(d.consent_image)}</dd><dt>Connu par</dt><dd>${esc(d.how_found || '—')}</dd>
        </dl>${d.health_files?.length ? `<div class="row wrap mt" style="gap:6px">${healthFileButtons(d.health_files)}</div>` : ''}</div>`; }).join('') : '<div class="empty">Aucune demande en attente.</div>',
    foot: `<button class="btn" data-close>Fermer</button>`,
    onMount: root => {
      $$('.reg-card', root).forEach(card => bindHealthFiles(card, data.find(x => x.id === card.dataset.r)?.data?.health_files));
      $$('[data-accept]', root).forEach(b => b.onclick = async () => {
        const r = data.find(x => x.id === b.dataset.accept), d = r.data || {};
        const allowed = ['first_name', 'last_name', 'email', 'phone', 'address', 'birth_date', 'gender', 'tshirt_size', 'fee_type', 'emergency_contact', 'emergency_phone', 'how_found', 'other_defense_sport', 'other_defense_sport_details', 'consent_image', 'consent_data', 'rules_read', 'rules_accepted', 'insurance_informed', 'medical_notes', 'guardian_name', 'guardian_phone', 'guardian_email', 'parental_authorization', 'pickup_persons'];
        const member = Object.fromEntries(allowed.filter(k => d[k] !== undefined).map(k => [k, d[k]]));
        const fee = feeOptions().find(([l]) => l === d.fee_type);
        const disc = S.disciplines.filter(x => x.is_active);
        const firstLevel = S.levels.filter(l => l.is_active).sort((a, b) => a.rank - b.rank)[0];
        Object.assign(member, { status: 'actif', member_role: 'membre', registration_date: isoDay(new Date()), fee_amount: fee?.[1] ?? null, discipline_id: disc.length === 1 ? disc[0].id : null, level_id: firstLevel?.id || null });
        if (d.health_mode === 'certificat' && d.health_files?.some(f => f.kind === 'certificat')) member.medical_certificate = true;
        if (d.health_mode === 'questionnaire' && d.health_attested) member.qss = true;
        if (d.health_files?.length) member.health_files = d.health_files;
        b.disabled = true;
        const { data: created, error } = await sb.from('members').insert(member).select('id').single();
        if (error) { b.disabled = false; return fail(error); }
        await sb.from('registrations').delete().eq('id', r.id); // la fiche membre remplace la demande
        closeModal(); toast(`Fiche ${/^[aeiouyhàâäéèêëîïôöùûü]/i.test(d.first_name || '') ? 'd’' : 'de '}${d.first_name} créée`); go('/membres/' + created.id);
      });
      $$('[data-refuse]', root).forEach(b => b.onclick = async () => {
        const r = data.find(x => x.id === b.dataset.refuse);
        if (!await confirmBox('Refuser la demande', `Refuser et supprimer la demande de ${esc(r.data?.first_name || '')} ${esc(r.data?.last_name || '')} ? Ses informations seront effacées.`, 'Refuser')) return;
        const { error } = await sb.from('registrations').delete().eq('id', r.id);
        if (error) return fail(error);
        const paths = (r.data?.health_files || []).map(f => f.path);
        if (paths.length) sb.storage.from('inscriptions').remove(paths).catch(() => {});
        toast('Demande refusée et supprimée'); route();
      });
    },
  });
}

/* =====================================================================
   Passages de grade
   ===================================================================== */
S.gradeMonths = 8;
const monthsBetween = (a, b = new Date()) => { const d = parseDay(a); return (b.getFullYear() - d.getFullYear()) * 12 + b.getMonth() - d.getMonth() - (b.getDate() < d.getDate() ? 1 : 0); };
const nextLevel = id => { const cur = S.levels.find(l => l.id === id); return S.levels.filter(l => l.is_active && (!cur || l.rank > cur.rank)).sort((a, b) => a.rank - b.rank)[0] || null; };

async function gradeSection(box) {
  const sessions = await seasonSessionsWithCall();
  const [mr, hr, ar] = await Promise.all([
    sb.from('members').select('id, first_name, last_name, status, level_id, registration_date').eq('status', 'actif'),
    sb.from('level_history').select('member_id, to_level_id, changed_on').order('changed_on', { ascending: false }),
    sessions.length ? sb.from('attendances').select('course_id, member_id').eq('present', true).in('course_id', sessions.map(s => s.id)) : { data: [] },
  ]);
  for (const r of [mr, hr, ar]) if (r.error) throw r.error;
  const lvlOf = Object.fromEntries(mr.data.map(m => [m.id, m.level_id]));
  const lastChange = {}; hr.data.forEach(h => { if (!lastChange[h.member_id] && h.to_level_id === lvlOf[h.member_id]) lastChange[h.member_id] = h.changed_on; });
  const byM = {}; ar.data.forEach(a => (byM[a.member_id] ||= new Set()).add(a.course_id));
  const minRate = S.settings?.threshold_regulier ?? 45;
  const rows = mr.data.map(m => {
    const since = lastChange[m.id] || m.registration_date;
    const months = since ? monthsBetween(since) : null;
    const att = attendanceFor(m, sessions, byM[m.id] || new Set());
    const next = nextLevel(m.level_id);
    const ready = next && months != null && months >= S.gradeMonths && (!att.sessions.length || att.rate >= minRate);
    return { m, since, months, att, next, ready };
  }).filter(r => r.next).sort((a, b) => b.ready - a.ready || (b.months ?? -1) - (a.months ?? -1));

  box.innerHTML = `
    <div class="row between wrap mb" style="gap:10px"><h2 class="section-title" style="margin:0">Passages de grade</h2>
      <label class="row small" style="gap:6px">Prêt à partir de <select class="input" id="g-months" style="width:auto;padding:6px 10px">${[3, 4, 6, 8, 10, 12, 18, 24].map(n => `<option value="${n}" ${n === S.gradeMonths ? 'selected' : ''}>${n} mois</option>`).join('')}</select> au même niveau</label></div>
    <p class="small muted">Sont signalés « prêts » les adhérents au même niveau depuis au moins ${S.gradeMonths} mois, avec une assiduité d’au moins ${minRate} % cette saison. C’est une aide : la décision reste la vôtre.</p>
    <div class="card"><div class="list">${rows.length ? rows.map(r => `
      <div class="list-item" style="cursor:default">
        <div class="avatar">${esc(initials(r.m))}</div>
        <a class="grow" href="#/membres/${r.m.id}" style="text-decoration:none"><div style="font-weight:600">${esc(fullName(r.m))}</div>
          <div class="small muted">${r.m.level_id ? esc(levelName(r.m.level_id)) : 'Sans niveau'}${r.months != null ? ` depuis ${r.months} mois` : ''} · assiduité ${r.att.sessions.length ? r.att.rate + ' %' : '—'}</div></a>
        <div class="right">${r.ready ? '<span class="badge ok">Prêt</span>' : `<span class="badge">${r.months == null ? 'Date d’inscription manquante' : r.months < S.gradeMonths ? 'Trop tôt' : 'Assiduité faible'}</span>`}
          ${isAdmin() ? `<button class="btn btn-sm" data-promote="${r.m.id}">→ ${esc(r.next.name)}</button>` : ''}</div>
      </div>`).join('') : '<div class="empty">Tous les adhérents actifs sont au niveau le plus élevé.</div>'}</div></div>`;
  $('#g-months', box).onchange = e => { S.gradeMonths = Number(e.target.value); gradeSection(box).catch(fail); };
  $$('[data-promote]', box).forEach(b => b.onclick = () => promoteForm(rows.find(r => r.m.id === b.dataset.promote).m, () => gradeSection(box).catch(fail)));
}

/* Saisie ou correction d'un grade obtenu (sans changer le niveau actuel du membre) */
function gradeEntryForm(m, g) {
  const levels = S.levels.slice().sort((a, b) => a.rank - b.rank);
  const v = g || { to_level_id: m.level_id, changed_on: '' };
  openModal({
    title: g ? 'Modifier le grade' : 'Ajouter un grade passé', size: 'sm',
    body: `<form id="ge"><p class="small muted" style="margin-top:0">Pour noter quand <strong>${esc(m.first_name)}</strong> a obtenu un niveau. Cela ne change pas son niveau actuel.</p>
      <div class="field"><label for="ge-l">Niveau obtenu *</label><select class="input" id="ge-l" name="to_level_id">${levels.map(l => `<option value="${l.id}" ${l.id === v.to_level_id ? 'selected' : ''}>${l.rank}. ${esc(l.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="ge-d">Date d’obtention *</label><input class="input" id="ge-d" name="changed_on" type="date" value="${esc(v.changed_on || '')}"><span class="help">Si vous ne connaissez que l’année, mettez par exemple le 1er juin de cette année.</span></div>
      <div class="field"><label for="ge-n">Remarques (facultatif)</label><input class="input" id="ge-n" name="notes" value="${esc(v.notes || '')}" placeholder="ex : examen de fin de saison"></div></form>`,
    foot: `${g ? `<button class="icon-btn" id="ge-del" aria-label="Supprimer" title="Supprimer">${icon('trash')}</button>` : ''}<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="ge-save">Enregistrer</button>`,
    onMount: r => {
      $('#ge-save', r).onclick = async () => {
        const d = readForm($('#ge', r));
        if (!d.to_level_id || !d.changed_on) return toast('Le niveau et la date sont obligatoires.', 'error');
        const to = levels.find(l => l.id === d.to_level_id);
        d.from_level_id = levels.filter(l => l.rank < to.rank).sort((a, b) => b.rank - a.rank)[0]?.id || null;
        const { error } = g ? await sb.from('level_history').update(d).eq('id', g.id) : await sb.from('level_history').insert({ ...d, member_id: m.id });
        if (error) return fail(error);
        closeModal(); toast('Grade enregistré'); route();
      };
      $('#ge-del', r) && ($('#ge-del', r).onclick = async () => {
        if (!await confirmBox('Supprimer ce grade', 'Supprimer cette ligne du parcours ? Le niveau actuel du membre ne change pas.')) return;
        const { error } = await sb.from('level_history').delete().eq('id', g.id);
        if (error) return fail(error);
        toast('Grade supprimé'); route();
      });
    },
  });
}

function promoteForm(m, onDone) {
  const next = nextLevel(m.level_id);
  openModal({
    title: 'Passage de grade', size: 'sm',
    body: `<form id="gf"><p style="margin-top:0"><strong>${esc(fullName(m))}</strong> : ${esc(levelName(m.level_id))} → </p>
      <div class="field"><label for="gf-l">Nouveau niveau</label><select class="input" id="gf-l" name="level_id">${S.levels.filter(l => l.is_active && l.id !== m.level_id).sort((a, b) => a.rank - b.rank).map(l => `<option value="${l.id}" ${l.id === next?.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="gf-d">Date du passage</label><input class="input" id="gf-d" name="changed_on" type="date" value="${isoDay(new Date())}"></div>
      <div class="field"><label for="gf-n">Remarques (facultatif)</label><input class="input" id="gf-n" name="notes" placeholder="ex : examen réussi, jury…"></div></form>`,
    foot: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="gf-save">Valider le passage</button>`,
    onMount: r => $('#gf-save', r).onclick = async () => {
      const d = readForm($('#gf', r));
      const { error } = await sb.from('members').update({ level_id: d.level_id }).eq('id', m.id);
      if (error) return fail(error);
      const { data: h } = await sb.from('level_history').select('id').eq('member_id', m.id).order('created_at', { ascending: false }).limit(1);
      if (h?.[0]) await sb.from('level_history').update({ changed_on: d.changed_on, notes: d.notes }).eq('id', h[0].id);
      closeModal(); toast(`${m.first_name} passe ${levelName(d.level_id)} 🥋`); onDone?.();
    },
  });
}

/* =====================================================================
   Impression (attestations, rapports)
   ===================================================================== */
function printDoc(html, cls = '') {
  let el = $('#print-root');
  if (!el) { el = document.createElement('div'); el.id = 'print-root'; document.body.appendChild(el); }
  el.className = cls;
  el.innerHTML = html;
  setTimeout(() => window.print(), 60);
}

function printAttestation(m, pays, season) {
  const s = S.settings || {};
  const total = pays.reduce((t, p) => t + Number(p.amount), 0);
  const minor = (ageOf(m.birth_date) ?? 99) < 18;
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const city = (s.club_address || '').match(/\d{5}\s+(.+)$/)?.[1] || '';
  if (!s.president_name || !s.club_address) toast('Astuce : complétez l’adresse du club et le nom du président dans les Paramètres.', '');
  printDoc(`
    <div class="attest">
      <div class="attest-head">
        <div class="logo-mark">D</div>
        <div><div class="attest-club">${esc(s.club_name || 'Club')}</div>
          <div class="small">${esc(s.club_address || '')}${s.club_legal_id ? ' · ' + esc(s.club_legal_id) : ''}${s.club_email ? ' · ' + esc(s.club_email) : ''}</div></div>
      </div>
      <h1>Attestation de paiement</h1>
      <p>Je soussigné(e) <strong>${esc(s.president_name || '…………………………')}</strong>, président(e) de l’association <strong>${esc(s.club_name || '')}</strong>, atteste que
      <strong>${esc(fullName(m))}</strong>${m.birth_date ? `, né(e) le ${fmtDate(m.birth_date)}` : ''}${minor && m.guardian_name ? `, représenté(e) par ${esc(m.guardian_name)}` : ''},
      est adhérent(e) du club pour la saison <strong>${esc(season?.label || '')}</strong>${m.discipline_id ? ` (${esc(discName(m.discipline_id))})` : ''}
      et a réglé la somme de <strong>${fmtMoney(total)}</strong> au titre de sa cotisation.</p>
      <table class="table"><thead><tr><th>Date</th><th>Objet</th><th>Mode de paiement</th><th style="text-align:right">Montant</th></tr></thead><tbody>
        ${pays.slice().sort((a, b) => a.payment_date.localeCompare(b.payment_date)).map(p => `<tr><td>${fmtDate(p.payment_date)}</td><td>${esc(p.payment_type)}</td><td>${esc(p.method || '')}</td><td style="text-align:right">${fmtMoney(p.amount)}</td></tr>`).join('')}
        <tr><td colspan="3"><strong>Total réglé</strong></td><td style="text-align:right"><strong>${fmtMoney(total)}</strong></td></tr>
      </tbody></table>
      <p>Cette attestation est délivrée à l’intéressé(e) pour servir et valoir ce que de droit.</p>
      <p style="margin-top:28px">Fait${city ? ' à ' + esc(city) : ''}, le ${today}.</p>
      <div class="attest-sign"><div>Le/la président(e)</div><div class="sign-box">${esc(s.president_name || '')}</div></div>
    </div>`, 'print-attest');
}

async function printAgReport({ sessions, rows, avgPresent, avgRate, cats }) {
  const season = activeSeason(), s = S.settings || {};
  const [{ data: all, error }, D] = await Promise.all([sb.from('members').select('*'), loadAccounting()]);
  if (error) throw error;
  const active = all.filter(m => m.status === 'actif');
  const count = fn => active.filter(fn).length;
  const pct = n => active.length ? Math.round(n / active.length * 100) + ' %' : '—';
  const ages = active.map(m => ageOf(m.birth_date));
  const bands = [['Moins de 18 ans', a => a < 18], ['18 – 25 ans', a => a >= 18 && a <= 25], ['26 – 40 ans', a => a >= 26 && a <= 40], ['41 – 60 ans', a => a >= 41 && a <= 60], ['Plus de 60 ans', a => a > 60]];
  const known = ages.filter(a => a != null);
  const avgAge = known.length ? Math.round(known.reduce((x, y) => x + y, 0) / known.length) : null;
  const newOnes = count(m => /nouv/i.test(m.fee_type || ''));
  const t = (title, rowsHtml) => `<h2 class="section-title mt">${title}</h2><table class="table"><tbody>${rowsHtml}</tbody></table>`;
  const tr = (k, v, p = '') => `<tr><td>${k}</td><td style="text-align:right"><strong>${v}</strong></td><td style="text-align:right;width:70px" class="muted">${p}</td></tr>`;
  printDoc(`
    <h1>${esc(s.club_name || 'Club')}</h1>
    <p class="muted">Rapport d’activité${season ? ' — saison ' + esc(season.label) : ''} · arrêté au ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}${s.club_legal_id ? ' · ' + esc(s.club_legal_id) : ''}</p>
    ${t('Effectifs', tr('Adhérents actifs', active.length) + tr('dont nouveaux adhérents', newOnes, pct(newOnes)) + tr('dont anciens adhérents', active.length - newOnes, pct(active.length - newOnes)) + tr('Femmes', count(m => m.gender === 'Femme'), pct(count(m => m.gender === 'Femme'))) + tr('Hommes', count(m => m.gender === 'Homme'), pct(count(m => m.gender === 'Homme'))) + (count(m => !m.gender) ? tr('Genre non renseigné', count(m => !m.gender), pct(count(m => !m.gender))) : ''))}
    <div class="grid two">
      <div>${t('Âges', bands.map(([k, f]) => tr(k, ages.filter(a => a != null && f(a)).length, pct(ages.filter(a => a != null && f(a)).length))).join('') + (ages.some(a => a == null) ? tr('Âge non renseigné', ages.filter(a => a == null).length) : '') + (avgAge != null ? tr('Âge moyen', avgAge + ' ans') : ''))}</div>
      <div>${t('Disciplines et niveaux', S.disciplines.filter(d => count(m => m.discipline_id === d.id)).map(d => tr(esc(d.name), count(m => m.discipline_id === d.id), pct(count(m => m.discipline_id === d.id)))).join('') + S.levels.filter(l => l.is_active || count(m => m.level_id === l.id)).sort((x, y) => x.rank - y.rank).map(l => tr(l.rank + '. ' + esc(l.name), count(m => m.level_id === l.id), pct(count(m => m.level_id === l.id)))).join(''))}</div>
    </div>
    ${t('Activité', tr('Séances avec appel', sessions.length) + tr('Présents par séance (moyenne)', avgPresent.toLocaleString('fr-FR', { maximumFractionDigits: 1 })) + tr('Taux de présence moyen', avgRate + ' %') + cats.map(c => tr('Adhérents « ' + c.k + ' »', rows.filter(r => r.sessions.length && r.label === c.k).length)).join(''))}
    <h2 class="section-title mt">Bilan financier</h2>
    ${bilanHtml(D)}
  `);
}

/* =====================================================================
   Sauvegarde Excel
   ===================================================================== */
const BACKUP_KEY = window.DEFENDR_DEMO ? 'defendr-demo-derniere-sauvegarde' : 'defendr-derniere-sauvegarde';
const lastBackup = () => { try { return localStorage.getItem(BACKUP_KEY); } catch { return null; } };
function lastBackupText() {
  const d = lastBackup();
  if (!d) return '<span class="badge warn">Aucune sauvegarde téléchargée depuis cet appareil</span>';
  const days = Math.floor((Date.now() - new Date(d)) / 86400000);
  return `<span class="badge ${days > 31 ? 'warn' : 'ok'}">Dernière sauvegarde : ${fmtDate(d.slice(0, 10))}${days > 31 ? ' · il est temps d’en refaire une' : ''}</span>`;
}

const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm';
/* Onglets du fichier de sauvegarde ↔ tables de la base */
const BACKUP_SHEETS = {
  'Membres': 'members', 'Paiements': 'payments', 'Dépenses': 'expenses', 'Séances': 'courses', 'Présences': 'attendances',
  'Planification': 'plan_items', 'Disciplines': 'disciplines', 'Niveaux': 'levels', 'Saisons': 'seasons', 'Paramètres': 'club_settings',
  'Historique grades': 'level_history', 'Lien séances-programme': 'course_plan_items',
};

async function downloadBackup(btn) {
  const label = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.textContent = 'Préparation…'; }
  try {
    const XLSX = await import(XLSX_URL);
    const all = async (table, order) => { const { data, error } = await sb.from(table).select('*').order(order); if (error) throw error; return data; };
    const [members, payments, expenses, courses, attendances, plan, disciplines, levels, seasons, settings, history, links] = await Promise.all([
      all('members', 'last_name'), all('payments', 'payment_date'), all('expenses', 'expense_date'), all('courses', 'course_date'),
      all('attendances', 'course_id'), all('plan_items', 'month'), all('disciplines', 'name'), all('levels', 'rank'), all('seasons', 'created_at'), all('club_settings', 'id'),
      all('level_history', 'changed_on'), all('course_plan_items', 'course_id'),
    ]);
    const nameOf = id => { const m = members.find(x => x.id === id); return m ? fullName(m) : ''; };
    const courseOf = id => courses.find(c => c.id === id);
    const seasonOf = id => seasons.find(s => s.id === id)?.label || '';
    const yn = v => v === true ? 'Oui' : v === false ? 'Non' : v;
    const clean = rows => rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'legacy').map(([k, v]) => [k, Array.isArray(v) ? (v.some(x => x && typeof x === 'object') ? JSON.stringify(v) : v.join(' | ')) : v && typeof v === 'object' ? JSON.stringify(v) : yn(v)])));
    const sheets = {
      'Membres': clean(members.map(m => ({ ...m, discipline: discName(m.discipline_id), niveau: levelName(m.level_id) }))),
      'Paiements': clean(payments.map(p => ({ membre: nameOf(p.member_id), saison: seasonOf(p.season_id), ...p }))),
      'Dépenses': clean(expenses.map(e => ({ saison: seasonOf(e.season_id), ...e }))),
      'Séances': clean(courses.map(c => ({ saison: seasonOf(c.season_id), ...c, presents: attendances.filter(a => a.course_id === c.id && a.present).length }))),
      'Présences': clean(attendances.map(a => ({ date: courseOf(a.course_id)?.course_date || '', seance: courseOf(a.course_id)?.title || '', membre: nameOf(a.member_id), ...a }))),
      'Planification': clean(plan.map(p => ({ saison: seasonOf(p.season_id), mois: MONTHS[p.month - 1], ...p }))),
      'Disciplines': clean(disciplines), 'Niveaux': clean(levels), 'Saisons': clean(seasons), 'Paramètres': clean(settings),
      'Historique grades': clean(history.map(h => ({ membre: nameOf(h.member_id), ...h }))),
      'Lien séances-programme': clean(links),
    };
    const wb = XLSX.utils.book_new();
    for (const [name, rows] of Object.entries(sheets)) {
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ info: 'Aucune donnée' }]);
      const keys = Object.keys(rows[0] || { info: '' });
      ws['!cols'] = keys.map(k => ({ wch: Math.min(40, Math.max(k.length, ...rows.slice(0, 50).map(r => String(r[k] ?? '').length)) + 2) }));
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
    const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', 'h');
    XLSX.writeFile(wb, `Defendr-sauvegarde-${stamp}.xlsx`);
    try { localStorage.setItem(BACKUP_KEY, new Date().toISOString()); } catch {}
    toast('Sauvegarde téléchargée');
    const info = btn?.previousElementSibling; if (info) info.innerHTML = lastBackupText();
    return true;
  } catch (e) { fail(e); return false; }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = label; } }
}

/* ---------- Restauration ---------- */
const BOOL_COLS = new Set(['medical_certificate', 'qss', 'medical_waiver', 'other_defense_sport', 'consent_image', 'consent_data', 'rules_read', 'rules_accepted', 'insurance_informed', 'parental_authorization', 'present', 'done', 'bank_checked', 'archived', 'is_active']);
const ARRAY_COLS = new Set(['revenue_types', 'expense_categories', 'rooms', 'plan_sections']);
const JSON_COLS = new Set(['club_documents', 'health_files']);
const DATE_COLS = new Set(['birth_date', 'registration_date', 'medical_waiver_validity', 'course_date', 'payment_date', 'due_date', 'expense_date', 'changed_on']);
const TIME_COLS = new Set(['start_time', 'end_time', 'default_start_time', 'default_end_time']);
const PHONE_COLS = new Set(['phone', 'emergency_phone', 'guardian_phone', 'whatsapp_number']);

function normalizeCell(k, v) {
  if (v === undefined || v === null) return null;
  if (BOOL_COLS.has(k)) return v === true || /^(oui|true|vrai|1)$/i.test(String(v).trim());
  if (JSON_COLS.has(k)) { try { return String(v).trim() ? JSON.parse(v) : (k === 'club_documents' ? {} : null); } catch { return k === 'club_documents' ? {} : null; } }
  if (ARRAY_COLS.has(k)) return String(v).trim() ? String(v).split(' | ').map(x => x.trim()).filter(Boolean) : [];
  if (v instanceof Date) {
    if (TIME_COLS.has(k)) return `${pad2(v.getHours())}:${pad2(v.getMinutes())}:00`;
    if (DATE_COLS.has(k)) return isoDay(v);
    return v.toISOString();
  }
  if (PHONE_COLS.has(k) && typeof v === 'number') { const s = String(v); return /^\d{9}$/.test(s) ? '0' + s : s; }
  if (typeof v === 'string' && v.trim() === '') return null;
  return v;
}

async function readBackupFile(file) {
  const XLSX = await import(XLSX_URL);
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  if (!wb.SheetNames.includes('Membres')) throw new Error('Ce fichier n’est pas une sauvegarde Defendr (onglet « Membres » introuvable).');
  const payload = {}, counts = {};
  for (const [sheet, table] of Object.entries(BACKUP_SHEETS)) {
    if (!wb.Sheets[sheet]) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { raw: true })
      .filter(r => !('info' in r && Object.keys(r).length === 1))
      .map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, normalizeCell(k, v)])))
      // Colonnes absentes d'une ancienne sauvegarde : valeurs par défaut plutôt que vides
      .map(r => { for (const c of BOOL_COLS) if (r[c] == null) r[c] = c === 'is_active'; for (const c of ARRAY_COLS) if (r[c] == null) r[c] = []; return r; });
    payload[table] = rows; counts[sheet] = rows.length;
  }
  if (payload.members.some(m => !m.id || !m.first_name)) throw new Error('Onglet « Membres » incomplet : chaque ligne doit avoir un id et un prénom.');
  return { payload, counts, missing: Object.keys(BACKUP_SHEETS).filter(s => !(s in counts)) };
}

async function restoreFromFile(file) {
  let parsed;
  try { parsed = await readBackupFile(file); } catch (e) { return fail(e); }
  const { payload, counts, missing } = parsed;
  const dateInName = file.name.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  const total = payload.payments?.filter(p => p.status === 'payé' && !p.archived).reduce((s, p) => s + Number(p.amount || 0), 0) || 0;
  openModal({
    title: 'Restaurer une sauvegarde',
    body: `
      <div class="alert error"><strong>Attention :</strong> toutes les données actuelles (membres, paiements, dépenses, séances, présences, planification, grades, paramètres) seront <strong>remplacées</strong> par celles du fichier. Les comptes de l’équipe et les fichiers de cours sont conservés.</div>
      <p style="margin:0 0 8px">Fichier : <strong>${esc(file.name)}</strong>${dateInName ? ` · sauvegarde du <strong>${fmtDate(dateInName)}</strong>` : ''}</p>
      <table class="table small"><tbody>${Object.entries(counts).map(([k, n]) => `<tr><td>${esc(k)}</td><td style="text-align:right"><strong>${n}</strong></td></tr>`).join('')}
        <tr><td>Total encaissé dans le fichier</td><td style="text-align:right"><strong>${fmtMoney(total)}</strong></td></tr></tbody></table>
      ${missing.length ? `<p class="small muted">Onglets absents de ce fichier (ancienne sauvegarde) : ${esc(missing.join(', '))}. Ces informations seront vides après la restauration.</p>` : ''}
      <p class="small">Par sécurité, une <strong>sauvegarde de l’état actuel</strong> sera téléchargée automatiquement juste avant.</p>
      <div class="field"><label for="rs-confirm">Pour confirmer, tapez <strong>RESTAURER</strong></label><input class="input" id="rs-confirm" autocomplete="off" autocapitalize="characters"></div>`,
    foot: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="rs-go" disabled>Restaurer</button>`,
    onMount: root => {
      const go = $('#rs-go', root);
      $('#rs-confirm', root).oninput = e => { go.disabled = e.target.value.trim().toUpperCase() !== 'RESTAURER'; };
      go.onclick = async () => {
        go.disabled = true; go.textContent = 'Sauvegarde de l’état actuel…';
        if (!await downloadBackup(null)) { go.textContent = 'Restaurer'; go.disabled = false; return toast('La sauvegarde de sécurité a échoué : restauration annulée.', 'error'); }
        go.textContent = 'Restauration…';
        const { data, error } = await sb.rpc('restore_backup', { payload });
        if (error) { go.textContent = 'Restaurer'; go.disabled = false; return fail(error); }
        closeModal();
        await loadRefs().catch(() => {});
        toast(`Restauration terminée : ${data.membres} membres, ${data.paiements} paiements, ${data.presences} présences`);
        location.hash = '#/'; route();
      };
    },
  });
}

/* =====================================================================
   WhatsApp : anniversaires et sondages de présence
   ===================================================================== */
const waUrl = (phone, text) => { const base = phone ? waLink(phone) : 'https://wa.me/'; return base ? `${base}?text=${encodeURIComponent(text)}` : null; };
const DEFAULT_POLL = 'Bonjour ! 👊\n\nSondage de présence pour le cours *[COURS]*\ndu *[DATE]* à *[HEURE]*.\n\nSerez-vous présent(e) ?\n✅ Oui\n❌ Non\n\nMerci de répondre à ce message ! 🙏';
const birthdayText = m => `Joyeux anniversaire ${m.first_name} ! 🎉🥳\nToute l’équipe du ${S.settings?.club_name || 'club'} te souhaite une excellente journée. À très vite sur le tatami ! 👊`;
S.wa = { course: '', custom: '' };

async function viewWhatsApp(view) {
  const today = isoDay(new Date());
  const [mr, cr] = await Promise.all([
    sb.from('members').select('id, first_name, last_name, phone, birth_date, status').eq('status', 'actif').order('last_name'),
    sb.from('courses').select('id, title, course_date, start_time, room').gte('course_date', today).order('course_date').order('start_time').limit(30),
  ]);
  if (mr.error) throw mr.error;
  if (cr.error) throw cr.error;
  const members = mr.data, courses = cr.data;
  const month = new Date().getMonth();
  const bdays = members.filter(m => isBirthdayMonth(m.birth_date, month)).sort((a, b) => Number(a.birth_date.slice(8)) - Number(b.birth_date.slice(8)));
  const isToday = m => m.birth_date.slice(5) === today.slice(5);
  const withPhone = members.filter(m => waLink(m.phone));
  const pollText = () => {
    const c = courses.find(x => x.id === S.wa.course);
    const tpl = (S.wa.custom || DEFAULT_POLL);
    return c ? tpl.replace(/\[COURS\]/g, c.title).replace(/\[DATE\]/g, parseDay(c.course_date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })).replace(/\[HEURE\]/g, hhmm(c.start_time).replace(':', 'h')) : tpl;
  };
  const bdayList = bdays.map(m => `${fmtDay(m.birth_date)} : ${fullName(m)} (${new Date().getFullYear() - Number(m.birth_date.slice(0, 4))} ans)`).join('\n');

  view.innerHTML = head('WhatsApp', 'Anniversaires et sondages de présence') + `
    <div class="grid two">
      <div class="card card-pad">
        <div class="row between"><h2 style="margin:0">Anniversaires de ${MONTHS[month]}</h2><span class="badge">${bdays.length}</span></div>
        <div class="mt">${bdays.length ? bdays.map(m => `<div class="bday"><div class="avatar">${esc(initials(m))}</div>
          <div style="flex:1"><div style="font-weight:600">${esc(fullName(m))}</div><div class="small muted">${fmtDay(m.birth_date)} · ${new Date().getFullYear() - Number(m.birth_date.slice(0, 4))} ans${isToday(m) ? ' · <strong style="color:var(--accent)">aujourd’hui</strong>' : ''}</div></div>
          ${waUrl(m.phone, birthdayText(m)) && m.phone ? `<a class="btn btn-sm ${isToday(m) ? 'btn-primary' : ''}" href="${esc(waUrl(m.phone, birthdayText(m)))}" target="_blank" rel="noopener">${icon('cake')}Souhaiter</a>` : '<span class="small muted">Pas de numéro</span>'}</div>`).join('') : '<div class="empty">Aucun anniversaire ce mois-ci.</div>'}</div>
        ${bdays.length && S.settings?.whatsapp_number ? `<a class="btn btn-block mt" href="${esc(waUrl(S.settings.whatsapp_number, `🎂 Anniversaires de ${MONTHS[month]} :\n${bdayList}`))}" target="_blank" rel="noopener">${icon('chat')}M’envoyer la liste sur WhatsApp</a>` : ''}
        ${bdays.length && !S.settings?.whatsapp_number && isAdmin() ? `<p class="small muted mt">Ajoutez votre numéro WhatsApp dans les <a href="#/parametres">Paramètres</a> pour vous envoyer la liste.</p>` : ''}
      </div>

      <div class="card card-pad">
        <h2>Sondage de présence</h2>
        <div class="field"><label for="wa-course">Cours *</label><select class="input" id="wa-course"><option value="">Choisir un cours…</option>${courses.map(c => `<option value="${c.id}" ${c.id === S.wa.course ? 'selected' : ''}>${esc(fmtDate(c.course_date))} ${hhmm(c.start_time)} · ${esc(c.title)}</option>`).join('')}</select>
          ${courses.length ? '' : '<span class="help">Aucune séance à venir : créez-en une dans le <a href="#/planning">Planning</a>.</span>'}</div>
        <div class="field"><label for="wa-custom">Message personnalisé (facultatif)</label><textarea class="input" id="wa-custom" rows="4" placeholder="Laissez vide pour utiliser le message par défaut. Vous pouvez utiliser [COURS], [DATE] et [HEURE].">${esc(S.wa.custom)}</textarea></div>
        <div class="field"><label>Aperçu du message</label><div class="wa-preview" id="wa-preview"></div></div>
        <div class="actions">
          <a class="btn btn-primary" id="wa-group" target="_blank" rel="noopener">${icon('chat')}Envoyer dans un groupe</a>
          <button class="btn" id="wa-copy">${icon('copy')}Copier le message</button>
        </div>
        <p class="small muted">« Envoyer dans un groupe » ouvre WhatsApp avec le message prêt : choisissez le groupe du club, puis envoyez.</p>
      </div>
    </div>

    <div class="card mt">
      <div class="card-pad" style="padding-bottom:6px"><div class="row between wrap"><h2 style="margin:0">Envoi individuel</h2><span class="small muted">${withPhone.length} membre(s) actif(s) avec téléphone</span></div>
      <p class="small muted" id="wa-ind-help">${S.wa.course ? 'Chaque bouton ouvre WhatsApp avec le sondage prêt pour cette personne.' : 'Choisissez d’abord un cours pour activer l’envoi.'}</p></div>
      <div class="list" id="wa-ind">${members.map(m => `<div class="list-item" style="cursor:default"><div class="avatar">${esc(initials(m))}</div>
        <div class="grow"><div style="font-weight:600">${esc(fullName(m))}</div><div class="small muted">${esc(m.phone || 'Pas de numéro')}</div></div>
        ${waLink(m.phone) ? `<a class="btn btn-sm wa-send" data-phone="${esc(m.phone)}" target="_blank" rel="noopener">${icon('chat')}Envoyer</a>` : ''}</div>`).join('')}</div>
    </div>`;

  const refresh = () => {
    const txt = pollText(), ok = !!S.wa.course;
    $('#wa-preview').textContent = txt;
    const g = $('#wa-group');
    g.href = ok ? waUrl(null, txt) : '#'; g.classList.toggle('disabled', !ok); g.setAttribute('aria-disabled', String(!ok));
    $$('.wa-send', view).forEach(a => { a.href = ok ? waUrl(a.dataset.phone, txt) : '#'; a.classList.toggle('disabled', !ok); });
    $('#wa-ind-help').textContent = ok ? 'Chaque bouton ouvre WhatsApp avec le sondage prêt pour cette personne.' : 'Choisissez d’abord un cours pour activer l’envoi.';
  };
  refresh();
  $('#wa-course').onchange = e => { S.wa.course = e.target.value; refresh(); };
  $('#wa-custom').oninput = e => { S.wa.custom = e.target.value; refresh(); };
  view.addEventListener('click', e => { const a = e.target.closest('a.disabled'); if (a) { e.preventDefault(); toast('Choisissez d’abord un cours.', 'error'); } });
  $('#wa-copy').onclick = async () => {
    if (!S.wa.course) return toast('Choisissez d’abord un cours.', 'error');
    try { await navigator.clipboard.writeText(pollText()); toast('Message copié'); }
    catch { toast('Copie impossible : sélectionnez le texte de l’aperçu.', 'error'); }
  };
}

/* =====================================================================
   Planification annuelle
   ===================================================================== */
const SEASON_MONTHS = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
const PLAN_SECTIONS = ['Technico tactique', 'Révisions', 'Connaissances générales', 'Préparation physique générale', 'Préparation récupération'];

// Programme annuel proposé par le guide ADAC « Planifier les cours » (édition 2026), chapitre 4
const ADAC_PROGRAM = {
  9: { tt: ['Coups frappés poings / pieds', 'O/D poings-pieds : hérisson, déviés, blocages', 'Distances de base et attitudes'],
       rev: ['15 min : DTT de la séance précédente'],
       pp: ['Endurance longue, intensité faible', 'Apprentissage : burpees, planche, gainage statique', 'Souplesse', 'Équilibre et proprioception décontextualisés'] },
  10: { tt: ['Contre-saisie et déplacement au sol', 'O/D saisies agressives et sol vs debout', 'O/D poings-pieds : déviés + riposte'],
        rev: ['Séance 1 : stabilisation de septembre', '15 min : DTT de la séance précédente'],
        pp: ['Endurance longue, intensité faible', 'Stabilisation des mouvements de référence + circuit décontextualisé', 'Souplesse', 'Équilibre et proprioception contextualisés'] },
  11: { tt: ['O/D poings-pieds : esquive et saisie', 'O/D au sol vs agresseur debout', 'Lutte debout : clinch, saisir / dessaisir, tirer / pousser'],
        rev: ['Séance 1 : stabilisation d’octobre', '15 min : DTT de la séance précédente'],
        pp: ['Intermittent court : 15/15 à 30/30', 'Burpees, planche, gainage dynamique', 'Force haut du corps décontextualisée : pompes, biceps, concentrique', 'Souplesse'] },
  12: { tt: ['O/D poings-pieds complet', 'Lutter : contrôler, projeter…', 'Combativité 1'],
        rev: ['Séance 1 : stabilisation de novembre', '15 min : DTT de la séance précédente'],
        pp: ['Intermittent long : 1/1 à 3/3', 'Circuit de pré-fatigue alterné avec paos ou pattes d’ours', 'Force haut du corps contextualisée : lutte, tirer / pousser', 'Souplesse'] },
  1: { tt: ['O/D poings-pieds complet', 'Réagir à plusieurs face à un agresseur armé', 'Contrôles : clé bras tendu, aile de poulet'],
       rev: ['Séance 1 : stabilisation de décembre', '15 min : DTT de la séance précédente'],
       pp: ['Endurance longue, intensité moyenne', 'Force bas du corps décontextualisée : poussée horizontale, squat jump, concentrique', 'Souplesse'] },
  2: { tt: ['O/D poings-pieds complet', 'O/D seul face à un agresseur armé', 'Lutter, projeter et contrôler au sol, seul ou à plusieurs'],
       rev: ['Séance 1 : stabilisation de janvier', '15 min : DTT de la séance précédente'],
       pp: ['Alternance endurance fondamentale / intermittent court / intermittent long', 'Force bas du corps contextualisée : pousser, soulever, déplacer', 'Souplesse'] },
  3: { tt: ['O/D poings-pieds complet', 'Défense d’une tierce personne, seul', 'Lutter : contrôler, projeter…'],
       rev: ['Séance 1 : stabilisation de février', 'Séance 2 : stabilisation septembre-octobre', '15 min : DTT de la séance précédente'],
       pp: ['Endurance 6 à 8 min, intensité moyenne, contextualisée : lutte / boxe / repli', 'Force haut et bas décontextualisée : pompes, biceps, isométrie'] },
  4: { tt: ['O/D poings-pieds complet', 'Défense d’une tierce personne, à plusieurs', 'Contrôles : clé bras tendu, aile de poulet'],
       rev: ['Séance 1 : stabilisation de mars', 'Séance 2 : stabilisation novembre-décembre', '15 min : DTT de la séance précédente'],
       pp: ['Temps intermédiaires, intensité alternée : 15 s à 3 min', 'Travail contextualisé : lutte / boxe / repli', 'Force haut et bas contextualisée avec résistance (élastique…)'] },
  5: { tt: ['Préparation à l’examen'],
       rev: ['Séance 1 : stabilisation d’avril', 'Séance 2 : stabilisation janvier-février', '15 min : DTT de la séance précédente'],
       pp: ['Flow supervisé à vitesse variable', 'Équilibre et proprioception contextualisés : frapper depuis des positions variées'] },
  6: { tt: ['Intégration globale : « la bagarre »'],
       rev: ['Séance 1 : stabilisation de mai', 'Séance 2 : stabilisation mars-avril', '15 min : DTT de la séance précédente'],
       pp: ['Flow libre à vitesse variable', 'Équilibre et proprioception contextualisés : frapper depuis des positions variées'] },
};
const ADAC_CATS = { tt: 'Technico tactique', rev: 'Révisions', pp: 'Préparation physique générale' };
S.planMonth = new Date().getMonth() + 1;
// Chapitres de la planification : réglables dans Paramètres, sinon liste par défaut
const planSections = () => (S.settings?.plan_sections?.length ? S.settings.plan_sections : PLAN_SECTIONS);

async function viewPlan(view) {
  const season = activeSeason();
  if (!season) { view.innerHTML = head('Planification annuelle') + `<div class="card empty">Aucune saison active. ${isAdmin() ? '<a href="#/parametres">Créez la saison en cours dans les Paramètres.</a>' : ''}</div>`; return; }
  const [{ data: items, error }, lk] = await Promise.all([
    sb.from('plan_items').select('*').eq('season_id', season.id).order('position'),
    sb.from('course_plan_items').select('plan_item_id, courses(course_date)'),
  ]);
  if (error) throw error;
  const workedOn = {};
  (lk.data || []).forEach(l => { if (l.courses) (workedOn[l.plan_item_id] ||= []).push(l.courses.course_date); });
  const month = S.planMonth, monthName = m => MONTHS[m - 1][0].toUpperCase() + MONTHS[m - 1].slice(1);
  const ofMonth = items.filter(i => i.month === month);
  const done = ofMonth.filter(i => i.done).length;
  const sections = [...new Set([...planSections(), ...ofMonth.map(i => i.category)])];
  const yearDone = items.filter(i => i.done).length;

  view.innerHTML = head('Planification annuelle', `Programme mois par mois, à cocher au fil de l’année · saison ${esc(season.label)}`) + `
    <div class="month-tabs" role="tablist" aria-label="Mois">${SEASON_MONTHS.map(m => {
      const its = items.filter(i => i.month === m), d = its.filter(i => i.done).length;
      return `<button class="mtab ${m === month ? 'active' : ''}" data-month="${m}" role="tab" aria-selected="${m === month}"><span>${['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'][m - 1]}</span><span class="mtab-bar">${its.length ? `<span style="width:${d / its.length * 100}%"></span>` : ''}</span></button>`;
    }).join('')}</div>
    <div class="card card-pad mb">
      <div class="row between wrap">
        <div><h2 style="margin:0;font-size:20px">${monthName(month)}</h2><div class="small muted">Avancement du mois : ${done}/${ofMonth.length}${items.length ? ` · année : ${yearDone}/${items.length}` : ''}</div></div>
        ${ofMonth.length ? `<div class="progress-big"><span style="width:${ofMonth.length ? done / ofMonth.length * 100 : 0}%"></span></div>` : ''}
      </div>
    </div>
    ${!items.length && S.seasons.length > 1 && isAdmin() ? `<div class="alert info">Le programme de cette saison est vide. <button class="link" id="copy-plan">Copier le programme d’une saison précédente</button></div>` : ''}
    <div class="row wrap mb" style="gap:8px"><button class="btn btn-sm" id="adac-plan">${icon('book')}Importer le programme annuel ADAC</button><a class="btn btn-sm" href="#/guide">Guide enseignant</a></div>
    <div class="grid two plan-grid">${sections.map(sec => {
      const its = ofMonth.filter(i => i.category === sec).sort((a, b) => a.position - b.position);
      const d = its.filter(i => i.done).length;
      return `<div class="card card-pad" data-sec="${esc(sec)}">
        <div class="row between"><h2 style="margin:0">${esc(sec)}</h2><span class="badge ${its.length && d === its.length ? 'ok' : ''}">${d}/${its.length}</span></div>
        <div class="plan-list mt">${its.map((i, idx) => `
          <div class="plan-item ${i.done ? 'done' : ''}" data-id="${i.id}">
            <input type="checkbox" class="pi-check" ${i.done ? 'checked' : ''} aria-label="Fait : ${esc(i.label)}">
            <span class="pi-label">${esc(i.label)}${workedOn[i.id] ? `<span class="small muted" style="display:block;text-decoration:none">Travaillé le ${workedOn[i.id].sort().map(d => fmtDate(d)).join(', ')}</span>` : ''}</span>
            <span class="pi-actions">
              <button class="icon-btn" data-up ${idx === 0 ? 'disabled' : ''} aria-label="Monter">${icon('up')}</button>
              <button class="icon-btn" data-edit aria-label="Modifier">${icon('edit')}</button>
              <button class="icon-btn" data-del aria-label="Supprimer">${icon('trash')}</button>
            </span>
          </div>`).join('')}</div>
        <form class="tag-add mt" data-add="${esc(sec)}"><input class="input" placeholder="Ajouter un élément…" aria-label="Ajouter un élément en ${esc(sec)}"><button class="btn" type="submit">${icon('plus')}</button></form>
      </div>`;
    }).join('')}</div>`;

  $$('[data-month]', view).forEach(b => b.onclick = () => { S.planMonth = Number(b.dataset.month); route(); });
  view.querySelector('.mtab.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  const byId = id => items.find(i => i.id === id);
  $$('.plan-item', view).forEach(row => {
    const it = byId(row.dataset.id);
    $('.pi-check', row).onchange = async e => {
      const { error } = await sb.from('plan_items').update({ done: e.target.checked }).eq('id', it.id);
      if (error) { e.target.checked = !e.target.checked; return fail(error); }
      route();
    };
    $('[data-del]', row).onclick = async () => {
      if (!await confirmBox('Supprimer l’élément', `Supprimer « ${esc(it.label)} » du programme ?`)) return;
      const { error } = await sb.from('plan_items').delete().eq('id', it.id); if (error) return fail(error); route();
    };
    $('[data-up]', row).onclick = async () => {
      const sib = ofMonth.filter(i => i.category === it.category).sort((a, b) => a.position - b.position);
      const k = sib.findIndex(i => i.id === it.id); if (k < 1) return;
      const reordered = [...sib]; [reordered[k - 1], reordered[k]] = [reordered[k], reordered[k - 1]];
      const results = await Promise.all(reordered.map((i, p) => sb.from('plan_items').update({ position: p }).eq('id', i.id)));
      const err = results.find(r => r.error); if (err) return fail(err.error); route();
    };
    $('[data-edit]', row).onclick = () => openModal({
      title: 'Modifier l’élément', size: 'sm',
      body: `<form id="pe"><div class="field"><label for="pe-l">Intitulé</label><textarea class="input" id="pe-l" name="label">${esc(it.label)}</textarea></div>
        <div class="field"><label for="pe-c">Rubrique</label><select class="input" id="pe-c" name="category">${sections.map(s => `<option ${s === it.category ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
        <div class="field"><label for="pe-m">Mois</label><select class="input" id="pe-m" name="month">${SEASON_MONTHS.map(m => `<option value="${m}" ${m === it.month ? 'selected' : ''}>${monthName(m)}</option>`).join('')}</select></div></form>`,
      foot: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="pe-save">Enregistrer</button>`,
      onMount: r => $('#pe-save', r).onclick = async () => {
        const d = readForm($('#pe', r)); d.month = Number(d.month);
        if (!d.label) return toast('L’intitulé est obligatoire.', 'error');
        const { error } = await sb.from('plan_items').update(d).eq('id', it.id); if (error) return fail(error);
        closeModal(); toast('Élément modifié'); route();
      },
    });
  });
  $$('[data-add]', view).forEach(f => f.onsubmit = async e => {
    e.preventDefault();
    const label = $('input', f).value.trim(); if (!label) return;
    const sec = f.dataset.add, pos = Math.max(-1, ...ofMonth.filter(i => i.category === sec).map(i => i.position)) + 1;
    const { error } = await sb.from('plan_items').insert({ season_id: season.id, month, category: sec, label, position: pos });
    if (error) return fail(error);
    toast('Élément ajouté'); route();
  });
  $('#adac-plan').onclick = async () => {
    const have = new Set(items.map(i => `${i.month}|${i.category}|${i.label.trim().toLowerCase()}`));
    const rows = [];
    for (const [m, blocks] of Object.entries(ADAC_PROGRAM)) for (const [k, cat] of Object.entries(ADAC_CATS)) {
      let pos = Math.max(-1, ...items.filter(i => i.month === +m && i.category === cat).map(i => i.position)) + 1;
      for (const label of blocks[k]) if (!have.has(`${m}|${cat}|${label.toLowerCase()}`)) rows.push({ season_id: season.id, month: +m, category: cat, label, position: pos++ });
    }
    if (!rows.length) return toast('Le programme ADAC est déjà dans la planification de cette saison.');
    if (!await confirmBox('Programme annuel ADAC', `Ajouter ${rows.length} élément${rows.length > 1 ? 's' : ''} de septembre à juin (technico-tactique, révisions, préparation physique), d’après le guide ADAC « Planifier les cours » ? Ce qui est déjà dans votre planification est conservé et les éléments déjà présents ne sont pas ajoutés en double.`, 'Importer')) return;
    const { error } = await sb.from('plan_items').insert(rows);
    if (error) return fail(error);
    toast(`${rows.length} éléments du programme ADAC ajoutés`); route();
  };
  $('#copy-plan') && ($('#copy-plan').onclick = async () => {
    const prev = S.seasons.filter(s => s.id !== season.id);
    const { data: old, error } = await sb.from('plan_items').select('month, category, label, position, season_id').in('season_id', prev.map(s => s.id));
    if (error) return fail(error);
    const src = prev.find(s => old.some(o => o.season_id === s.id));
    if (!src) return toast('Aucun programme à copier.', 'error');
    if (!await confirmBox('Copier le programme', `Copier les ${old.filter(o => o.season_id === src.id).length} éléments de la saison ${esc(src.label)} (tous décochés) ?`, 'Copier')) return;
    const { error: e2 } = await sb.from('plan_items').insert(old.filter(o => o.season_id === src.id).map(({ season_id, ...o }) => ({ ...o, season_id: season.id, done: false })));
    if (e2) return fail(e2);
    toast('Programme copié'); route();
  });
}

/* =====================================================================
   Guide enseignant ADAC : repères clés + PDF complet (stockage privé)
   ===================================================================== */
const GUIDE_PATH = 'guides/adac-planifier-les-cours.pdf';
async function viewGuide(view) {
  const { data: signed } = await sb.storage.from('cours').createSignedUrl(GUIDE_PATH, 3600);
  const pdf = signed?.signedUrl || null;
  const card = (title, body) => `<div class="card card-pad">${title ? `<h2>${title}</h2>` : ''}${body}</div>`;
  const tbl = (head, rows) => `<div class="table-wrap"><table class="table"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  view.innerHTML = head('Guide enseignant', 'Repères du guide ADAC « Planifier les cours de self-défense et de combat » (édition 2026)',
    pdf ? `<a class="btn btn-primary" href="${esc(pdf)}" target="_blank" rel="noopener">${icon('file')}Ouvrir le guide complet (PDF)</a>` : '') + `
    ${!pdf ? `<div class="alert info row wrap between mb" style="gap:8px"><span>Le PDF complet du guide n’est pas encore dans le logiciel.${isAdmin() ? ' Ajoutez-le une fois : il sera rangé dans votre espace privé, visible uniquement par l’équipe connectée.' : ' Le président ou le trésorier peut l’ajouter.'}</span>
      ${isAdmin() ? `<label class="btn btn-sm btn-primary" style="cursor:pointer">${icon('up')}Ajouter le PDF du guide<input type="file" id="guide-up" accept="application/pdf,.pdf" hidden></label>` : ''}</div>` : ''}
    <div class="grid two">
      ${card('Les 3 temps de l’apprentissage', `<ol class="small" style="padding-left:18px;margin:0">
        <li><strong>Construire</strong> des réponses motrices simples et fiables.</li>
        <li><strong>Entretenir</strong> : organiser les rappels pour limiter l’oubli.</li>
        <li><strong>Restituer</strong> en mise en situation (stages CATS, jeux de rôle, situations réelles débriefées).</li></ol>
        <p class="small muted mt">En self-défense, pas de pic de forme à une date connue : on vise une disponibilité permanente des réponses.</p>`)}
      ${card('Trame d’une séance (1 h 30 à 2 h)', tbl(['Durée', 'Bloc', 'Progression'], [
        ['10–15 min', 'Accueil, mise en train', 'Du général au spécifique'],
        ['15 min', 'Récurrence (révision)', 'Lent → variable'],
        ['35–50 min', 'Développement technico-tactique', 'Bloc → aléatoire → incertitude'],
        ['15–25 min', 'Préparation physique', 'Décontextualisé → contextualisé'],
        ['5–10 min', 'Retour au calme, connaissances', 'Respiration, bilan, consigne de rappel'],
      ]) + '<p class="small muted mt">Des repères, pas une prescription : la sécurité et le niveau réel du groupe priment.</p>')}
      ${card('Quand réviser', tbl(['Rythme', 'À faire'], [
        ['Chaque séance', '≈ 15 min de rappel de la séance précédente'],
        ['Chaque mois', '1re séance : stabiliser le thème du mois précédent'],
        ['Tous les 3 à 5 mois', 'À partir de mars, 2e séance du mois : retour sur un bloc plus ancien'],
      ]) + '<p class="small muted mt">Une révision commence lente et prévisible, puis gagne en vitesse, variabilité et incertitude.</p>')}
      ${card('Cycle de difficulté d’une révision', `<ol class="small" style="padding-left:18px;margin:0">
        <li>Reconstruction lente, sans incertitude</li><li>Stabilisation à vitesse modérée</li><li>Variabilité : ordre et partenaires différents</li>
        <li>Incertitude adaptée : vrai choix, peu d’options</li><li>Réemploi contextualisé : exercice intégré, flow ou opposition aménagée</li></ol>`)}
      ${card('Les paliers d’automatisation', `<ul class="small" style="padding-left:18px;margin:0">
        <li><strong>Consistance</strong> : une situation, une réponse, répétée lentement et proprement.</li>
        <li><strong>Variabilité</strong> : plusieurs stimuli, chacun sa réponse, dans un ordre qui change.</li>
        <li><strong>Incertitude</strong> : percevoir, décider, agir, avec une difficulté adaptée au niveau.</li></ul>
        <p class="small muted mt">Enseigner peu de « micro-blocs » courts, stables et réutilisables plutôt que de longues combinaisons.</p>`)}
      ${card('Contrôle rapide avant le cours', `<ul class="small" style="padding-left:18px;margin:0">
        <li>Une seule intention dominante par exercice</li><li>Une correction prioritaire à la fois</li><li>Une difficulté compatible avec la réussite et la sécurité</li>
        <li>Une révision planifiée, pas improvisée</li><li>Un passage progressif du stable vers le variable</li><li>Une version plus simple et une plus difficile prêtes</li></ul>
        <p class="small mt"><strong>En fin de séance :</strong> qu’est-ce qui est vraiment acquis ? que faut-il revoir la semaine prochaine ? quel exercice a le mieux fonctionné ?</p>`)}
    </div>
    <div class="card card-pad mt row wrap between" style="gap:8px"><span class="small">Le programme annuel du guide (septembre à juin) peut être ajouté en un clic à votre planification.</span><a class="btn btn-sm" href="#/planification">${icon('list')}Planification annuelle</a></div>
    ${pdf && isAdmin() ? `<div class="small muted mt"><label style="cursor:pointer;text-decoration:underline">Remplacer le PDF du guide<input type="file" id="guide-up" accept="application/pdf,.pdf" hidden></label></div>` : ''}`;
  $('#guide-up', view) && ($('#guide-up', view).onchange = async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    if (!/pdf$/i.test(file.type || file.name)) return toast('Choisissez un fichier PDF.', 'error');
    toast('Envoi du guide…');
    const { error } = await sb.storage.from('cours').upload(GUIDE_PATH, file, { upsert: true, contentType: 'application/pdf' });
    if (error) return fail(error);
    toast('Guide ajouté'); route();
  });
}

/* =====================================================================
   Statistiques d'assiduité
   ===================================================================== */
S.stats = { filter: 'tous', sort: 'taux' };

async function viewStats(view) {
  const sessions = await seasonSessionsWithCall();
  const ids = sessions.map(s => s.id);
  const [mr, ar] = await Promise.all([
    sb.from('members').select('id, first_name, last_name, status, registration_date, level_id').eq('status', 'actif'),
    ids.length ? sb.from('attendances').select('course_id, member_id').eq('present', true).in('course_id', ids) : { data: [] },
  ]);
  if (mr.error) throw mr.error;
  if (ar.error) throw ar.error;
  const byMember = {};
  ar.data.forEach(a => (byMember[a.member_id] ||= new Set()).add(a.course_id));
  const rows = mr.data.map(m => ({ m, ...attendanceFor(m, sessions, byMember[m.id] || new Set()) }));
  const t = S.settings || {};
  const cats = [
    { k: 'Assidu', cls: 'ok', hint: `≥ ${t.threshold_assidu ?? 70} % de présence` },
    { k: 'Régulier', cls: 'accent', hint: `${t.threshold_regulier ?? 45}–${(t.threshold_assidu ?? 70) - 1} %` },
    { k: 'À risque', cls: 'warn', hint: `${t.threshold_risque ?? 25}–${(t.threshold_regulier ?? 45) - 1} %` },
    { k: 'Quasi-absent', cls: 'danger', hint: `< ${t.threshold_risque ?? 25} %` },
  ];
  const withSessions = rows.filter(r => r.sessions.length);
  const noSession = rows.filter(r => !r.sessions.length);
  const avgRate = withSessions.length ? Math.round(withSessions.reduce((s, r) => s + r.rate, 0) / withSessions.length) : 0;
  const perSession = sessions.slice().reverse().map(s => ({ s, n: ar.data.filter(a => a.course_id === s.id).length }));
  const avgPresent = perSession.length ? (perSession.reduce((s, x) => s + x.n, 0) / perSession.length) : 0;
  const maxN = Math.max(1, ...perSession.map(x => x.n));

  view.innerHTML = head('Statistiques', `Assiduité de la saison${activeSeason() ? ' ' + esc(activeSeason().label) : ''}, calculée pour chaque adhérent depuis son inscription`,
    isAdmin() ? `<button class="btn" id="ag-report">${icon('file')}Rapport pour l’AG</button>` : '') + `
    <div class="grid stats mb">
      ${cats.map(c => { const n = withSessions.filter(r => r.label === c.k).length; return `<button class="card stat stat-btn ${S.stats.filter === c.k ? 'sel' : ''}" data-cat="${c.k}"><div class="label"><span class="dot ${c.cls}"></span>${c.k}</div><div class="value">${n}</div><div class="hint">adhérent(s) · ${c.hint}</div></button>`; }).join('')}
    </div>
    <div class="grid two mb">
      <div class="card card-pad"><h2>En chiffres</h2><dl class="kv">
        <dt>Séances avec appel</dt><dd><strong>${sessions.length}</strong></dd>
        <dt>Présents par séance</dt><dd><strong>${avgPresent.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</strong> en moyenne</dd>
        <dt>Taux moyen</dt><dd><strong>${avgRate} %</strong> par adhérent</dd>
        <dt>Adhérents actifs</dt><dd><strong>${rows.length}</strong>${noSession.length ? ` <span class="muted small">(${noSession.length} sans séance depuis l’inscription)</span>` : ''}</dd>
      </dl></div>
      <div class="card card-pad"><h2>Présents par séance</h2>
        ${perSession.length ? `<div class="spark" role="img" aria-label="Nombre de présents à chacune des ${perSession.length} séances">${perSession.slice(-24).map(x => `<div class="spark-col" title="${esc(fmtDate(x.s.course_date))} · ${esc(x.s.title)} : ${x.n} présent(s)"><span class="spark-n">${x.n}</span><div class="spark-bar" style="height:${Math.max(4, x.n / maxN * 100)}%"></div><span class="spark-d">${parseDay(x.s.course_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' })}</span></div>`).join('')}</div>` : '<div class="empty">Aucun appel enregistré pour l’instant.</div>'}
      </div>
    </div>
    <div class="toolbar between">
      <h2 class="section-title" style="margin:0">Détail par adhérent ${S.stats.filter !== 'tous' ? `<span class="badge">${esc(S.stats.filter)}</span> <button class="link small" id="clear-f" style="text-transform:none;letter-spacing:0">tout afficher</button>` : ''}</h2>
      <div class="chips">${[['taux', 'Par taux'], ['nom', 'Par nom']].map(([k, l]) => `<button class="chip ${S.stats.sort === k ? 'active' : ''}" data-sort="${k}">${l}</button>`).join('')}</div>
    </div>
    <div class="card"><div class="list" id="st-list"></div></div>`;

  const list = rows.filter(r => S.stats.filter === 'tous' || (r.sessions.length && r.label === S.stats.filter))
    .sort((a, b) => S.stats.sort === 'nom' ? fullName(a.m).localeCompare(fullName(b.m), 'fr') : (b.sessions.length ? b.rate : -1) - (a.sessions.length ? a.rate : -1) || b.present - a.present);
  $('#st-list').innerHTML = list.length ? list.map(r => `
    <a class="list-item" href="#/membres/${r.m.id}" style="text-decoration:none">
      <div class="avatar">${esc(initials(r.m))}</div>
      <div class="grow"><div style="font-weight:600">${esc(fullName(r.m))}</div>
        <div class="small muted">${r.sessions.length ? `${r.present} présent(s) · ${r.sessions.length - r.present} manquée(s) sur ${r.sessions.length} séance(s)` : 'Aucune séance depuis l’inscription'}${r.m.registration_date ? ' · inscrit(e) le ' + fmtDate(r.m.registration_date) : ''}</div>
        ${r.sessions.length ? `<div class="bar mt-xs"><span style="width:${r.rate}%;background:var(--${r.cls === 'accent' ? 'accent' : r.cls})"></span></div>` : ''}</div>
      <div class="right"><strong style="font-size:18px">${r.sessions.length ? r.rate + ' %' : '—'}</strong>${r.sessions.length ? `<span class="badge ${r.cls}">${r.label}</span>` : '<span class="badge">Nouveau</span>'}</div>
    </a>`).join('') : '<div class="empty">Aucun adhérent dans cette catégorie.</div>';

  $('#ag-report') && ($('#ag-report').onclick = async () => {
    const btn = $('#ag-report'); btn.disabled = true;
    try { await printAgReport({ sessions, rows, avgPresent, avgRate, cats }); } catch (e) { fail(e); }
    btn.disabled = false;
  });
  $$('[data-cat]', view).forEach(b => b.onclick = () => { S.stats.filter = S.stats.filter === b.dataset.cat ? 'tous' : b.dataset.cat; route(); });
  $$('[data-sort]', view).forEach(b => b.onclick = () => { S.stats.sort = b.dataset.sort; route(); });
  $('#clear-f') && ($('#clear-f').onclick = () => { S.stats.filter = 'tous'; route(); });
}

/* =====================================================================
   Comptabilité
   ===================================================================== */
const METHODS = ['Virement', 'Chèque', 'Espèces', 'Carte bancaire', 'Prélèvement', 'Autre'];
S.acc = { tab: 'paiements', status: 'tous', archives: false, search: '' };

async function loadAccounting() {
  const season = activeSeason();
  const sq = q => season ? q.eq('season_id', season.id) : q;
  const [pr, er, mr] = await Promise.all([
    sq(sb.from('payments').select('*')).order('payment_date', { ascending: false }),
    sq(sb.from('expenses').select('*')).order('expense_date', { ascending: false }),
    sb.from('members').select('id, first_name, last_name, status, fee_amount').order('last_name'),
  ]);
  for (const r of [pr, er, mr]) if (r.error) throw r.error;
  return { season, payments: pr.data, expenses: er.data, members: mr.data };
}
function accountingTotals({ season, payments, expenses }) {
  const live = payments.filter(p => !p.archived), liveE = expenses.filter(e => !e.archived);
  const sum = a => a.reduce((s, x) => s + Number(x.amount), 0);
  const paid = sum(live.filter(p => p.status === 'payé')), pending = sum(live.filter(p => p.status === 'en attente'));
  const exp = sum(liveE), opening = Number(season?.opening_balance || 0);
  const bankIn = sum(live.filter(p => p.status === 'payé' && p.bank_checked)), bankOut = sum(liveE.filter(e => e.bank_checked));
  return { paid, pending, exp, opening, balance: opening + paid - exp, bankIn, bankOut, bank: bankIn - bankOut };
}

async function viewAccounting(view) {
  const D = await loadAccounting(), A = S.acc, T = accountingTotals(D);
  const mName = id => { const m = D.members.find(x => x.id === id); return m ? fullName(m) : '—'; };
  const payer = p => p.member_id ? mName(p.member_id) : (p.notes || 'Recette hors adhérent');
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  view.innerHTML = head('Comptabilité', `${fmtMoney(T.paid)} encaissés · ${fmtMoney(T.pending)} en attente · ${fmtMoney(T.exp)} de dépenses${D.season ? ' · saison ' + esc(D.season.label) : ''}`,
    `<button class="btn" id="bilan">${icon('chart')}Bilan comptable</button><button class="btn" id="pdf">${icon('file')}Export PDF</button>`) + `
    <div class="grid acc-stats mb">
      <div class="card stat"><div class="label">Solde début d’exercice</div><div class="value">${fmtMoney(T.opening)}</div></div>
      <div class="card stat"><div class="label">Revenus encaissés</div><div class="value" style="color:var(--ok)">${fmtMoney(T.paid)}</div></div>
      <div class="card stat"><div class="label">En attente</div><div class="value" style="color:var(--warn)">${fmtMoney(T.pending)}</div></div>
      <div class="card stat"><div class="label">Dépenses</div><div class="value" style="color:var(--danger)">${fmtMoney(T.exp)}</div></div>
      <div class="card stat accent"><div class="label">Solde comptable</div><div class="value">${fmtMoney(T.balance)}</div><div class="hint">Début + encaissés − dépenses</div></div>
      <div class="card stat"><div class="label">Pointé banque</div><div class="value">${fmtMoney(T.bank)}</div><div class="hint">${fmtMoney(T.bankIn)} − ${fmtMoney(T.bankOut)}</div></div>
    </div>
    <div class="toolbar between">
      <div class="chips">
        <button class="chip ${A.tab === 'paiements' ? 'active' : ''}" data-tab="paiements">Recettes <span class="n">${D.payments.filter(p => !p.archived).length}</span></button>
        <button class="chip ${A.tab === 'depenses' ? 'active' : ''}" data-tab="depenses">Dépenses <span class="n">${D.expenses.filter(e => !e.archived).length}</span></button>
      </div>
      <button class="btn btn-primary" id="add">${icon('plus')}${A.tab === 'paiements' ? 'Nouvelle recette' : 'Nouvelle dépense'}</button>
    </div>
    <div class="toolbar">
      <input class="input" type="search" id="acc-search" placeholder="${A.tab === 'paiements' ? 'Rechercher une recette…' : 'Rechercher une dépense…'}" value="${esc(A.search)}" aria-label="Rechercher">
      ${A.tab === 'paiements' ? `<div class="chips">${[['tous', 'Tous'], ['payé', 'Payés'], ['en attente', 'En attente'], ['a-pointer', 'À pointer']].map(([k, l]) => `<button class="chip ${A.status === k ? 'active' : ''}" data-st="${k}">${l}</button>`).join('')}</div>` : `<div class="chips"><button class="chip ${A.status === 'a-pointer' ? 'active' : ''}" data-st="${A.status === 'a-pointer' ? 'tous' : 'a-pointer'}">À pointer</button></div>`}
      <label class="check" style="margin-left:auto"><input type="checkbox" id="arch" ${A.archives ? 'checked' : ''}><span>Voir les archives</span></label>
    </div>
    <div class="card" id="acc-list"></div>`;

  const draw = () => {
    const q = norm(A.search), box = $('#acc-list');
    if (A.tab === 'paiements') {
      const rows = D.payments.filter(p => p.archived === A.archives)
        .filter(p => A.status === 'tous' || (A.status === 'a-pointer' ? (p.status === 'payé' && !p.bank_checked) : p.status === A.status))
        .filter(p => !q || norm(payer(p) + ' ' + p.payment_type + ' ' + (p.notes || '')).includes(q));
      if (!rows.length) { box.innerHTML = '<div class="empty">Aucune recette.</div>'; return; }
      box.innerHTML = `<div class="table-wrap only-desktop"><table class="table"><thead><tr><th title="Pointé sur le relevé bancaire">Pt</th><th>Membre / origine</th><th>Type</th><th>Montant</th><th>Mode</th><th>Date</th><th>Statut</th><th></th></tr></thead><tbody>
        ${rows.map(p => `<tr><td><input type="checkbox" class="pt" data-pt="${p.id}" ${p.bank_checked ? 'checked' : ''} aria-label="Pointé"></td>
          <td>${p.member_id ? `<a href="#/membres/${p.member_id}" style="font-weight:600;text-decoration:none">${esc(mName(p.member_id))}</a>${p.notes ? `<div class="small muted">${esc(p.notes)}</div>` : ''}` : `<span style="font-weight:600">${esc(payer(p))}</span><div class="small muted">Hors adhérent</div>`}</td>
          <td>${esc(p.payment_type)}</td><td style="font-weight:700">${fmtMoney(p.amount)}</td><td>${esc(p.method || '—')}</td>
          <td>${fmtDate(p.payment_date)}${p.due_date && p.due_date !== p.payment_date ? `<div class="small muted">échéance ${fmtDate(p.due_date)}</div>` : ''}</td>
          <td><span class="badge ${p.status === 'payé' ? 'ok' : 'warn'}">${p.status === 'payé' ? 'Payé' : 'En attente'}</span></td>
          <td style="white-space:nowrap"><button class="icon-btn" data-edit="${p.id}" aria-label="Modifier">${icon('edit')}</button></td></tr>`).join('')}
      </tbody></table></div>
      <div class="list only-mobile">${rows.map(p => `<div class="list-item" data-edit="${p.id}">
        <input type="checkbox" class="pt" data-pt="${p.id}" ${p.bank_checked ? 'checked' : ''} aria-label="Pointé">
        <div class="grow"><div style="font-weight:600">${esc(payer(p))}</div><div class="small muted">${fmtDate(p.payment_date)} · ${esc(p.payment_type)}${p.method ? ' · ' + esc(p.method) : ''}</div></div>
        <div class="right"><strong>${fmtMoney(p.amount)}</strong><span class="badge ${p.status === 'payé' ? 'ok' : 'warn'}">${p.status === 'payé' ? 'Payé' : 'En attente'}</span></div></div>`).join('')}</div>`;
    } else {
      const rows = D.expenses.filter(e => e.archived === A.archives)
        .filter(e => A.status !== 'a-pointer' || !e.bank_checked)
        .filter(e => !q || norm(e.label + ' ' + e.category + ' ' + (e.supplier || '')).includes(q));
      if (!rows.length) { box.innerHTML = '<div class="empty">Aucune dépense.</div>'; return; }
      box.innerHTML = `<div class="table-wrap only-desktop"><table class="table"><thead><tr><th>Pt</th><th>Libellé</th><th>Catégorie</th><th>Montant</th><th>Mode</th><th>Date</th><th></th></tr></thead><tbody>
        ${rows.map(e => `<tr><td><input type="checkbox" class="pt" data-pt="${e.id}" ${e.bank_checked ? 'checked' : ''} aria-label="Pointé"></td>
          <td style="font-weight:600">${esc(e.label)}${e.supplier || e.notes ? `<div class="small muted" style="font-weight:400">${esc([e.supplier, e.notes].filter(Boolean).join(' · '))}</div>` : ''}</td>
          <td><span class="badge">${esc(e.category || '—')}</span></td><td style="font-weight:700;color:var(--danger)">−${fmtMoney(e.amount)}</td>
          <td>${esc(e.method || '—')}</td><td>${fmtDate(e.expense_date)}</td>
          <td><button class="icon-btn" data-edit="${e.id}" aria-label="Modifier">${icon('edit')}</button></td></tr>`).join('')}
      </tbody></table></div>
      <div class="list only-mobile">${rows.map(e => `<div class="list-item" data-edit="${e.id}">
        <input type="checkbox" class="pt" data-pt="${e.id}" ${e.bank_checked ? 'checked' : ''} aria-label="Pointé">
        <div class="grow"><div style="font-weight:600">${esc(e.label)}</div><div class="small muted">${fmtDate(e.expense_date)} · ${esc(e.category || '')}</div></div>
        <div class="right"><strong style="color:var(--danger)">−${fmtMoney(e.amount)}</strong></div></div>`).join('')}</div>`;
    }
    $$('.pt', box).forEach(cb => {
      cb.onclick = ev => ev.stopPropagation();
      cb.onchange = async () => {
        const table = A.tab === 'paiements' ? 'payments' : 'expenses';
        const { error } = await sb.from(table).update({ bank_checked: cb.checked }).eq('id', cb.dataset.pt);
        if (error) { cb.checked = !cb.checked; return fail(error); }
        const item = (A.tab === 'paiements' ? D.payments : D.expenses).find(x => x.id === cb.dataset.pt); item.bank_checked = cb.checked;
        toast(cb.checked ? 'Pointé' : 'Pointage retiré');
      };
    });
    $$('[data-edit]', box).forEach(b => b.onclick = () => A.tab === 'paiements'
      ? paymentForm(D.payments.find(p => p.id === b.dataset.edit))
      : expenseForm(D.expenses.find(e => e.id === b.dataset.edit)));
  };
  draw();
  $('#acc-search').oninput = e => { A.search = e.target.value; draw(); };
  $$('[data-tab]', view).forEach(b => b.onclick = () => { A.tab = b.dataset.tab; A.status = 'tous'; A.search = ''; route(); });
  $$('[data-st]', view).forEach(b => b.onclick = () => { A.status = b.dataset.st; route(); });
  $('#arch').onchange = e => { A.archives = e.target.checked; route(); };
  $('#add').onclick = () => A.tab === 'paiements' ? paymentForm(null) : expenseForm(null);
  $('#bilan').onclick = () => go('/bilan');
  $('#pdf').onclick = () => exportPdf(D);
}

async function paymentForm(p, defaults = {}) {
  const { data: members, error } = await sb.from('members').select('id, first_name, last_name, status, fee_amount').order('last_name');
  if (error) return fail(error);
  const v = p || { payment_type: (S.settings?.revenue_types || []).includes('Cotisation annuelle') ? 'Cotisation annuelle' : (S.settings?.revenue_types || [])[0], payment_date: isoDay(new Date()), status: 'payé', method: 'Virement', ...defaults };
  const types = [...new Set([...(S.settings?.revenue_types || []), 'Subvention', 'Don', v.payment_type].filter(Boolean))];
  openModal({
    title: p ? 'Modifier la recette' : 'Nouvelle recette',
    body: `<form id="pf" class="form-grid" novalidate>
      <div class="field full"><label for="pf-m">Membre</label><select class="input" id="pf-m" name="member_id"><option value="">— Recette hors adhérent (subvention, don…) —</option>${members.filter(m => m.status === 'actif' || m.id === v.member_id).map(m => `<option value="${m.id}" ${m.id === v.member_id ? 'selected' : ''}>${esc(fullName(m))}</option>`).join('')}</select></div>
      <div class="field"><label for="pf-t">Type *</label><select class="input" id="pf-t" name="payment_type">${types.map(t => `<option ${t === v.payment_type ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      <div class="field"><label for="pf-a">Montant (€) *</label><input class="input" id="pf-a" name="amount" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(v.amount ?? '')}"></div>
      <div class="field"><label for="pf-me">Mode de paiement</label><select class="input" id="pf-me" name="method">${[...new Set([...METHODS, v.method].filter(Boolean))].map(x => `<option ${x === v.method ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="field"><label for="pf-s">Statut</label><select class="input" id="pf-s" name="status"><option value="payé" ${v.status === 'payé' ? 'selected' : ''}>Payé</option><option value="en attente" ${v.status === 'en attente' ? 'selected' : ''}>En attente</option></select></div>
      <div class="field"><label for="pf-d">Date du paiement *</label><input class="input" id="pf-d" name="payment_date" type="date" value="${esc(v.payment_date || '')}"></div>
      <div class="field"><label for="pf-dd">Date d’encaissement prévue</label><input class="input" id="pf-dd" name="due_date" type="date" value="${esc(v.due_date || '')}"><span class="help">Pour un chèque à encaisser plus tard.</span></div>
      ${p ? '' : `<div class="field full"><label for="pf-n">Paiement en plusieurs fois</label><select class="input" id="pf-n"><option value="1">En une fois</option>${[2, 3, 4, 5, 6, 8, 10].map(n => `<option value="${n}">En ${n} fois (un par mois)</option>`).join('')}</select><span class="help" id="pf-help">Le montant total sera réparti en plusieurs paiements, un par mois à partir de la date indiquée.</span></div>`}
      <label class="check full"><input type="checkbox" name="bank_checked" ${v.bank_checked ? 'checked' : ''}><span>Pointé sur le relevé bancaire</span></label>
      <div class="field full"><label for="pf-no">Notes <span class="muted" id="pf-no-req">${v.member_id ? '' : '(origine obligatoire : ex. Mairie de Clermont)'}</span></label><input class="input" id="pf-no" name="notes" value="${esc(v.notes || '')}" placeholder="${v.member_id ? '' : 'ex : Subvention Mairie de Clermont-l’Hérault'}"></div>
    </form>`,
    foot: `${p ? `<button class="icon-btn" id="pf-del" aria-label="Supprimer" title="Supprimer">${icon('trash')}</button><button class="btn" id="pf-arch">${p.archived ? 'Désarchiver' : 'Archiver'}</button>` : ''}<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="pf-save">Enregistrer</button>`,
    onMount: root => {
      $('#pf-m', root).onchange = e => { const m = members.find(x => x.id === e.target.value); if (m?.fee_amount && !$('#pf-a', root).value) $('#pf-a', root).value = m.fee_amount; $('#pf-no-req', root).textContent = m ? '' : '(origine obligatoire : ex. Mairie de Clermont)'; };
      $('#pf-save', root).onclick = async () => {
        const d = readForm($('#pf', root));
        if (d.amount == null || !d.payment_date) return toast('Le montant et la date sont obligatoires.', 'error');
        if (!d.member_id && !d.notes) return toast('Pour une recette hors adhérent, indiquez son origine dans Notes (ex : Mairie de Clermont).', 'error');
        if (p) {
          const { error } = await sb.from('payments').update(d).eq('id', p.id);
          if (error) return fail(error);
          closeModal(); toast('Recette mise à jour'); return route();
        }
        const n = Number($('#pf-n', root).value || 1);
        const cents = Math.round(d.amount * 100), base = Math.floor(cents / n), extra = cents - base * n;
        const rows = Array.from({ length: n }, (_, i) => {
          const dt = new Date(parseDay(d.payment_date)); dt.setMonth(dt.getMonth() + i);
          const day = isoDay(dt);
          return { ...d, amount: (base + (i === 0 ? extra : 0)) / 100, payment_date: day, due_date: n > 1 ? day : d.due_date, bank_checked: i === 0 ? d.bank_checked : false, season_id: activeSeason()?.id || null, notes: n > 1 ? [d.notes, `${i + 1}/${n}`].filter(Boolean).join(' · ') : d.notes };
        });
        const { error } = await sb.from('payments').insert(rows);
        if (error) return fail(error);
        closeModal(); toast(n > 1 ? `${n} paiements enregistrés` : 'Recette enregistrée'); route();
      };
      if (p) {
        $('#pf-arch', root).onclick = async () => { const { error } = await sb.from('payments').update({ archived: !p.archived }).eq('id', p.id); if (error) return fail(error); closeModal(); toast(p.archived ? 'Paiement désarchivé' : 'Paiement archivé'); route(); };
        $('#pf-del', root).onclick = async () => {
          if (!await confirmBox('Supprimer le paiement', `Supprimer ce paiement de ${fmtMoney(p.amount)} ? Pour le garder en mémoire sans le compter, préférez « Archiver ».`)) return;
          const { error } = await sb.from('payments').delete().eq('id', p.id); if (error) return fail(error); toast('Paiement supprimé'); route();
        };
      }
    },
  });
}

function expenseForm(e) {
  const v = e || { expense_date: isoDay(new Date()), method: 'Prélèvement' };
  const cats = [...new Set([...(S.settings?.expense_categories || []), v.category].filter(Boolean))];
  openModal({
    title: e ? 'Modifier la dépense' : 'Nouvelle dépense',
    body: `<form id="ef" class="form-grid" novalidate>
      <div class="field full"><label for="ef-l">Libellé *</label><input class="input" id="ef-l" name="label" value="${esc(v.label || '')}" placeholder="ex : Location de la salle"></div>
      <div class="field"><label for="ef-c">Catégorie</label><select class="input" id="ef-c" name="category"><option value="">—</option>${cats.map(c => `<option ${c === v.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      <div class="field"><label for="ef-a">Montant (€) *</label><input class="input" id="ef-a" name="amount" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(v.amount ?? '')}"></div>
      <div class="field"><label for="ef-m">Mode de paiement</label><select class="input" id="ef-m" name="method">${[...new Set([...METHODS, v.method].filter(Boolean))].map(x => `<option ${x === v.method ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="field"><label for="ef-d">Date *</label><input class="input" id="ef-d" name="expense_date" type="date" value="${esc(v.expense_date || '')}"></div>
      <div class="field full"><label for="ef-s">Fournisseur</label><input class="input" id="ef-s" name="supplier" value="${esc(v.supplier || '')}"></div>
      <label class="check full"><input type="checkbox" name="bank_checked" ${v.bank_checked ? 'checked' : ''}><span>Pointé sur le relevé bancaire</span></label>
      <div class="field full"><label for="ef-n">Notes</label><input class="input" id="ef-n" name="notes" value="${esc(v.notes || '')}"></div>
    </form>`,
    foot: `${e ? `<button class="icon-btn" id="ef-del" aria-label="Supprimer" title="Supprimer">${icon('trash')}</button><button class="btn" id="ef-arch">${e.archived ? 'Désarchiver' : 'Archiver'}</button>` : ''}<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="ef-save">Enregistrer</button>`,
    onMount: root => {
      $('#ef-save', root).onclick = async () => {
        const d = readForm($('#ef', root));
        if (!d.label || d.amount == null || !d.expense_date) return toast('Libellé, montant et date sont obligatoires.', 'error');
        const { error } = e ? await sb.from('expenses').update(d).eq('id', e.id) : await sb.from('expenses').insert({ ...d, season_id: activeSeason()?.id || null });
        if (error) return fail(error);
        closeModal(); toast(e ? 'Dépense mise à jour' : 'Dépense enregistrée'); S.acc.tab = 'depenses'; route();
      };
      if (e) {
        $('#ef-arch', root).onclick = async () => { const { error } = await sb.from('expenses').update({ archived: !e.archived }).eq('id', e.id); if (error) return fail(error); closeModal(); toast(e.archived ? 'Dépense désarchivée' : 'Dépense archivée'); route(); };
        $('#ef-del', root).onclick = async () => {
          if (!await confirmBox('Supprimer la dépense', `Supprimer « ${esc(e.label)} » (${fmtMoney(e.amount)}) ?`)) return;
          const { error } = await sb.from('expenses').delete().eq('id', e.id); if (error) return fail(error); toast('Dépense supprimée'); route();
        };
      }
    },
  });
}

function bilanData(D) {
  const T = accountingTotals(D);
  const group = (rows, key) => Object.entries(rows.reduce((a, x) => { const k = x[key] || 'Autre'; a[k] = (a[k] || 0) + Number(x.amount); return a; }, {})).sort((a, b) => b[1] - a[1]);
  return {
    T,
    recettes: group(D.payments.filter(p => !p.archived && p.status === 'payé'), 'payment_type'),
    depenses: group(D.expenses.filter(e => !e.archived), 'category'),
    methodes: group(D.payments.filter(p => !p.archived && p.status === 'payé'), 'method'),
  };
}
function bilanHtml(D) {
  const B = bilanData(D), T = B.T;
  const tbl = (rows, total, neg) => `<table class="table"><tbody>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td style="text-align:right">${neg ? '−' : ''}${fmtMoney(v)}</td></tr>`).join('') || '<tr><td class="muted">Aucune</td><td></td></tr>'}<tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${neg ? '−' : ''}${fmtMoney(total)}</strong></td></tr></tbody></table>`;
  return `
    <div class="grid two">
      <div><h2 class="section-title">Recettes encaissées</h2>${tbl(B.recettes, T.paid)}</div>
      <div><h2 class="section-title">Dépenses</h2>${tbl(B.depenses, T.exp, true)}</div>
    </div>
    <h2 class="section-title mt">Résultat</h2>
    <table class="table"><tbody>
      <tr><td>Solde en début d’exercice</td><td style="text-align:right">${fmtMoney(T.opening)}</td></tr>
      <tr><td>+ Recettes encaissées</td><td style="text-align:right">${fmtMoney(T.paid)}</td></tr>
      <tr><td>− Dépenses</td><td style="text-align:right">−${fmtMoney(T.exp)}</td></tr>
      <tr><td><strong>Résultat de l’exercice (recettes − dépenses)</strong></td><td style="text-align:right"><strong>${fmtMoney(T.paid - T.exp)}</strong></td></tr>
      <tr><td><strong>Solde comptable</strong></td><td style="text-align:right"><strong>${fmtMoney(T.balance)}</strong></td></tr>
      <tr><td>Paiements en attente</td><td style="text-align:right">${fmtMoney(T.pending)}</td></tr>
    </tbody></table>
    ${B.methodes.length ? `<h2 class="section-title mt">Recettes par mode de paiement</h2>${tbl(B.methodes, T.paid)}` : ''}`;
}
function showBilan(D) {
  openModal({ title: `Bilan simplifié${D.season ? ' · ' + D.season.label : ''}`, body: bilanHtml(D), foot: `<button class="btn" data-close>Fermer</button><button class="btn btn-primary" id="b-pdf">${icon('file')}Export PDF</button>`, onMount: r => $('#b-pdf', r).onclick = () => { closeModal(); exportPdf(D); } });
}
function exportPdf(D) {
  const mName = id => { const m = D.members.find(x => x.id === id); return m ? fullName(m) : '—'; };
  const pays = D.payments.filter(p => !p.archived), exps = D.expenses.filter(e => !e.archived);
  const who = p => p.member_id ? mName(p.member_id) : (p.notes || 'Hors adhérent');
  let el = $('#print-root');
  if (!el) { el = document.createElement('div'); el.id = 'print-root'; document.body.appendChild(el); }
  el.className = '';
  el.innerHTML = `
    <h1>${esc(S.settings?.club_name || 'Club')}</h1>
    <p class="muted">Comptabilité${D.season ? ' — saison ' + esc(D.season.label) : ''} · édité le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    ${bilanHtml(D)}
    <h2 class="section-title mt">Détail des paiements (${pays.length})</h2>
    <table class="table"><thead><tr><th>Date</th><th>Membre</th><th>Type</th><th>Mode</th><th>Statut</th><th>Pointé</th><th style="text-align:right">Montant</th></tr></thead><tbody>
      ${pays.slice().sort((a, b) => a.payment_date.localeCompare(b.payment_date)).map(p => `<tr><td>${fmtDate(p.payment_date)}</td><td>${esc(who(p))}</td><td>${esc(p.payment_type)}</td><td>${esc(p.method || '')}</td><td>${p.status === 'payé' ? 'Payé' : 'En attente'}</td><td>${p.bank_checked ? 'Oui' : ''}</td><td style="text-align:right">${fmtMoney(p.amount)}</td></tr>`).join('')}
    </tbody></table>
    <h2 class="section-title mt">Détail des dépenses (${exps.length})</h2>
    <table class="table"><thead><tr><th>Date</th><th>Libellé</th><th>Catégorie</th><th>Mode</th><th>Pointé</th><th style="text-align:right">Montant</th></tr></thead><tbody>
      ${exps.slice().sort((a, b) => a.expense_date.localeCompare(b.expense_date)).map(e => `<tr><td>${fmtDate(e.expense_date)}</td><td>${esc(e.label)}</td><td>${esc(e.category || '')}</td><td>${esc(e.method || '')}</td><td>${e.bank_checked ? 'Oui' : ''}</td><td style="text-align:right">${fmtMoney(e.amount)}</td></tr>`).join('')}
    </tbody></table>`;
  setTimeout(() => window.print(), 50);
}

/* =====================================================================
   Bilan comptable de l'association (présentation du plan comptable associatif)
   Compte de résultat (N et N-1), bilan actif / passif, annexe, impression pour l'AG.
   ===================================================================== */
// Rubriques : [n° de compte, intitulé, détail, mots-clés reconnus dans la catégorie ou le type]
const PCA_CHARGES = [
  ['60', 'Achats', 'matériel, équipement, fournitures, tenues', /mat[ée]riel|[ée]quipement|fourniture|achat|tenue|t-?shirt|textile|kimono|gant|protection|pharmacie|trousse/i],
  ['64', 'Charges de personnel', 'salaires, défraiements', /salaire|personnel|urssaf|indemnit|d[ée]fraiement|r[ée]mun[ée]ration|vacation/i],
  ['63', 'Impôts et taxes', '', /imp[ôo]t|taxe|sacem/i],
  ['61', 'Services extérieurs', 'locations, assurances, entretien', /loyer|location|salle|gymnase|dojo|assurance|entretien|r[ée]paration|maintenance|nettoyage/i],
  ['62', 'Autres services extérieurs', 'affiliations, licences, déplacements, communication, frais bancaires', /affiliation|licence|f[ée]d[ée]ration|adac|d[ée]placement|transport|carburant|essence|p[ée]age|communication|publicit|impression|site|frais bancaire|banque|honoraire|formation|[ée]v[ée]nement|r[ée]ception|stage|poste|affranchissement|t[ée]l[ée]phone|internet|abonnement/i],
  ['66', 'Charges financières', '', /int[ée]r[êe]t|agios/i],
  ['67', 'Charges exceptionnelles', '', /exceptionnel/i],
  ['65', 'Autres charges de gestion courante', 'divers', /.*/],
];
const PCA_PRODUITS = [
  ['74', 'Subventions d’exploitation', 'commune, département, région, État', /subvention|mairie|commune|d[ée]partement|r[ée]gion|cnds|\bans\b|[ée]tat|pass.?sport/i],
  ['754', 'Dons et mécénat', '', /\bdons?\b|m[ée]c[ée]nat|parrainage|sponsor/i],
  ['756', 'Cotisations des adhérents', 'adhésions, licences', /cotisation|adh[ée]sion|licence|inscription/i],
  ['70', 'Ventes et prestations', 'stages, équipement vendu, manifestations', /stage|vente|[ée]quipement|t-?shirt|prestation|buvette|billetterie|manifestation|cours/i],
  ['76', 'Produits financiers', 'intérêts', /int[ée]r[êe]t|livret/i],
  ['77', 'Produits exceptionnels', '', /exceptionnel/i],
  ['758', 'Autres produits de gestion courante', 'divers', /.*/],
];
const pcaOf = (list, label) => list.find(([, , , re]) => re.test(label || '')) || list[list.length - 1];
const ORDER_C = ['60', '61', '62', '63', '64', '65', '66', '67'], ORDER_P = ['70', '74', '754', '756', '758', '76', '77'];

async function loadSeasonBooks(season) {
  const sq = q => season ? q.eq('season_id', season.id) : q;
  const [pr, er] = await Promise.all([
    sq(sb.from('payments').select('id, member_id, payment_type, amount, method, status, bank_checked, payment_date, notes').eq('archived', false)),
    sq(sb.from('expenses').select('id, label, category, amount, method, bank_checked, expense_date').eq('archived', false)),
  ]);
  for (const r of [pr, er]) if (r.error) throw r.error;
  return computeBooks(season, pr.data, er.data);
}

function computeBooks(season, payments, expenses) {
  const cents = v => Math.round(Number(v || 0) * 100);
  const add = (map, list, label, amount) => {
    const [code, title, hint] = pcaOf(list, label);
    const r = map[code] ||= { code, title, hint, total: 0, detail: {} };
    r.total += cents(amount); const k = label || 'Autre'; r.detail[k] = (r.detail[k] || 0) + cents(amount);
  };
  const charges = {}, produits = {};
  expenses.forEach(e => add(charges, PCA_CHARGES, e.category || e.label, e.amount));
  const paid = payments.filter(p => p.status === 'payé'), pending = payments.filter(p => p.status === 'en attente');
  [...paid, ...pending].forEach(p => add(produits, PCA_PRODUITS, p.payment_type, p.amount));
  const sum = a => a.reduce((t, x) => t + cents(x.amount), 0);
  const opening = cents(season?.opening_balance), cIn = sum(paid), cPending = sum(pending), cOut = sum(expenses);
  const totC = Object.values(charges).reduce((t, r) => t + r.total, 0), totP = Object.values(produits).reduce((t, r) => t + r.total, 0);
  const cash = opening + cIn - cOut;
  return {
    season, charges, produits, totC, totP, result: totP - totC, opening, cashIn: cIn, cashOut: cOut, pending: cPending, cash,
    bankIn: sum(paid.filter(p => p.bank_checked)), bankOut: sum(expenses.filter(e => e.bank_checked)),
    toPointIn: paid.filter(p => !p.bank_checked).length, toPointOut: expenses.filter(e => !e.bank_checked).length,
    nPayers: new Set(paid.filter(p => p.member_id && /cotisation|adh[ée]sion|licence/i.test(p.payment_type || '')).map(p => p.member_id)).size,
    // Bilan : Actif = disponibilités + créances ; Passif = fonds associatifs (report à nouveau) + résultat
    actif: { dispo: cash, creances: cPending }, passif: { fonds: opening, result: totP - totC },
  };
}

const eur = c => fmtMoney(c / 100);
const prevSeasonOf = season => {
  if (!season) return null;
  const list = S.seasons.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  return list[list.indexOf(list.find(x => x.id === season.id)) - 1] || null;
};

function bilanBlocks(B, P) {
  const yr = s => s ? esc(s.label) : 'Total';
  const hasP = !!P;
  const side = (rows, order, prevRows, total, prevTotal, title) => {
    const codes = order.filter(c => rows[c] || prevRows?.[c]);
    return `<table class="table bilan-t"><thead><tr><th>${title}</th><th class="num">${yr(B.season)}</th>${hasP ? `<th class="num muted">${yr(P.season)}</th>` : ''}</tr></thead><tbody>
      ${codes.length ? codes.map(c => { const r = rows[c] || prevRows[c];
        return `<tr><td><span class="acc-code">${c}</span>${esc(r.title)}${rows[c] && Object.keys(rows[c].detail).length ? `<div class="small muted">${Object.entries(rows[c].detail).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)} ${eur(v)}`).join(' · ')}</div>` : ''}</td>
          <td class="num">${rows[c] ? eur(rows[c].total) : '—'}</td>${hasP ? `<td class="num muted">${prevRows[c] ? eur(prevRows[c].total) : '—'}</td>` : ''}</tr>`; }).join('')
        : `<tr><td class="muted" colspan="${hasP ? 3 : 2}">Aucune écriture</td></tr>`}
      <tr class="tot"><td>Total ${title.toLowerCase()}</td><td class="num">${eur(total)}</td>${hasP ? `<td class="num muted">${eur(prevTotal)}</td>` : ''}</tr></tbody></table>`;
  };
  const res = r => r >= 0 ? `Excédent ${eur(r)}` : `Déficit ${eur(-r)}`;
  const ctrl = P ? P.cash - B.opening : 0;

  const compte = `<div class="grid two bilan-grid">
      <div>${side(B.charges, ORDER_C, P?.charges, B.totC, P?.totC, 'Charges')}</div>
      <div>${side(B.produits, ORDER_P, P?.produits, B.totP, P?.totP, 'Produits')}</div>
    </div>
    <table class="table bilan-t mt"><tbody><tr class="tot big"><td>Résultat de l’exercice (produits − charges)</td>
      <td class="num" style="color:var(${B.result >= 0 ? '--ok' : '--danger'})">${res(B.result)}</td>${hasP ? `<td class="num muted">${res(P.result)}</td>` : ''}</tr></tbody></table>`;

  const bilan = `<div class="grid two bilan-grid">
      <table class="table bilan-t"><thead><tr><th>Actif</th><th class="num">Fin ${yr(B.season)}</th></tr></thead><tbody>
        <tr><td>Créances<div class="small muted">Recettes « en attente » non encore encaissées</div></td><td class="num">${eur(B.actif.creances)}</td></tr>
        <tr><td>Disponibilités<div class="small muted">Banque et caisse : solde de départ + encaissements − décaissements</div></td><td class="num">${eur(B.actif.dispo)}</td></tr>
        <tr class="tot"><td>Total actif</td><td class="num">${eur(B.actif.dispo + B.actif.creances)}</td></tr></tbody></table>
      <table class="table bilan-t"><thead><tr><th>Passif</th><th class="num">Fin ${yr(B.season)}</th></tr></thead><tbody>
        <tr><td>Fonds associatifs (report à nouveau)<div class="small muted">Solde de trésorerie en début de saison</div></td><td class="num">${eur(B.passif.fonds)}</td></tr>
        <tr><td>Résultat de l’exercice</td><td class="num">${eur(B.passif.result)}</td></tr>
        <tr><td>Dettes<div class="small muted">Aucune dette enregistrée</div></td><td class="num">${eur(0)}</td></tr>
        <tr class="tot"><td>Total passif</td><td class="num">${eur(B.passif.fonds + B.passif.result)}</td></tr></tbody></table>
    </div>`;

  const annexe = `<div class="grid two bilan-grid">
      <table class="table bilan-t"><thead><tr><th colspan="2">Trésorerie de la saison</th></tr></thead><tbody>
        <tr><td>Solde en début de saison</td><td class="num">${eur(B.opening)}</td></tr>
        <tr><td>+ Encaissements</td><td class="num">${eur(B.cashIn)}</td></tr>
        <tr><td>− Décaissements</td><td class="num">−${eur(B.cashOut)}</td></tr>
        <tr class="tot"><td>Solde en fin de saison</td><td class="num">${eur(B.cash)}</td></tr>
        <tr><td colspan="2" class="small muted">Rapprochement bancaire : ${eur(B.bankIn)} d’entrées et ${eur(B.bankOut)} de sorties pointées sur le relevé${B.toPointIn + B.toPointOut ? ` · ${B.toPointIn + B.toPointOut} opération(s) restent à pointer` : ' · tout est pointé'}.</td></tr></tbody></table>
      <table class="table bilan-t"><thead><tr><th colspan="2">Informations</th></tr></thead><tbody>
        <tr><td>Adhérents ayant réglé une cotisation</td><td class="num">${B.nPayers}</td></tr>
        <tr><td>Recettes en attente d’encaissement</td><td class="num">${eur(B.pending)}</td></tr>
        ${B.unpaidFees != null ? `<tr><td>Cotisations restant dues (non comptabilisées)<div class="small muted">Écart entre la cotisation prévue et les règlements des membres actifs</div></td><td class="num">${eur(B.unpaidFees)}</td></tr>` : ''}
        <tr><td colspan="2" class="small muted">Comptabilité tenue en recettes / dépenses, présentée selon les rubriques du plan comptable associatif (règlement ANC n° 2018-06). Le bénévolat n’est pas valorisé.</td></tr></tbody></table>
    </div>
    ${P && ctrl !== 0 ? `<div class="alert info mt"><strong>Contrôle :</strong> le solde de départ de ${esc(B.season.label)} (${eur(B.opening)}) ne correspond pas au solde de fin de ${esc(P.season.label)} (${eur(P.cash)}), soit un écart de ${eur(Math.abs(ctrl))}. Vérifiez le solde de départ dans Paramètres → Saisons.</div>` : ''}
    ${P && ctrl === 0 ? `<div class="small muted mt">Contrôle : le solde de départ correspond bien au solde de fin de ${esc(P.season.label)}.</div>` : ''}`;
  return { compte, bilan, annexe };
}

S.bilanSeason = null;
async function viewBilan(view) {
  const season = S.seasons.find(x => x.id === S.bilanSeason) || activeSeason() || S.seasons[0] || null;
  const prev = prevSeasonOf(season);
  const [B, P] = await Promise.all([loadSeasonBooks(season), prev ? loadSeasonBooks(prev) : null]);
  if (season?.is_active) {
    const [{ data: mem, error: me }, { data: pays, error: pe }] = await Promise.all([
      sb.from('members').select('id, fee_amount').eq('status', 'actif'),
      sb.from('payments').select('member_id, amount, status').eq('season_id', season.id).eq('archived', false).eq('status', 'payé'),
    ]);
    if (!me && !pe) {
      const paidBy = {}; pays.forEach(p => { if (p.member_id) paidBy[p.member_id] = (paidBy[p.member_id] || 0) + Math.round(Number(p.amount) * 100); });
      B.unpaidFees = mem.reduce((t, m) => t + Math.max(0, Math.round(Number(m.fee_amount || 0) * 100) - (paidBy[m.id] || 0)), 0);
    }
  }
  const X = bilanBlocks(B, P);
  view.innerHTML = `<div class="row mb"><a href="#/paiements" class="btn btn-sm">${icon('back')}Comptabilité</a></div>`
    + head('Bilan comptable', `${esc(S.settings?.club_name || 'Association')}${season ? ' · saison ' + esc(season.label) : ''}${prev ? ' · comparé à ' + esc(prev.label) : ''}`,
      `<button class="btn btn-primary" id="bl-print">${icon('file')}Imprimer / PDF pour l’AG</button>`) + `
    ${S.seasons.length > 1 ? `<div class="chips mb">${S.seasons.map(x => `<button class="chip ${x.id === season?.id ? 'active' : ''}" data-bs="${x.id}">${esc(x.label)}${x.is_active ? ' · en cours' : ''}</button>`).join('')}</div>` : ''}
    <div class="grid acc-stats mb">
      <div class="card stat"><div class="label">Produits</div><div class="value" style="color:var(--ok)">${eur(B.totP)}</div></div>
      <div class="card stat"><div class="label">Charges</div><div class="value" style="color:var(--danger)">${eur(B.totC)}</div></div>
      <div class="card stat accent"><div class="label">${B.result >= 0 ? 'Excédent' : 'Déficit'}</div><div class="value">${eur(Math.abs(B.result))}</div>${P ? `<div class="hint">${esc(P.season.label)} : ${P.result >= 0 ? 'excédent' : 'déficit'} ${eur(Math.abs(P.result))}</div>` : ''}</div>
      <div class="card stat"><div class="label">Trésorerie fin de saison</div><div class="value">${eur(B.cash)}</div><div class="hint">Départ ${eur(B.opening)}</div></div>
    </div>
    ${season?.is_active ? '<div class="alert info mb">Saison en cours : le bilan est provisoire et se met à jour à chaque recette ou dépense.</div>' : ''}
    <div class="card card-pad mb"><h2>Compte de résultat</h2>${X.compte}</div>
    <div class="card card-pad mb"><h2>Bilan au ${season?.closed_at ? fmtDate(season.closed_at.slice(0, 10)) : 'jour'}</h2>${X.bilan}</div>
    <div class="card card-pad mb"><h2>Annexe</h2>${X.annexe}</div>
    <p class="small muted">Les rubriques sont déduites des catégories de dépenses et des types de recettes. Pour qu’une ligne change de rubrique, renommez sa catégorie ou son type (ex. « Subvention mairie », « Location salle »).</p>`;
  $$('[data-bs]', view).forEach(b => b.onclick = () => { S.bilanSeason = b.dataset.bs; route(); });
  $('#bl-print', view).onclick = () => printBilan(B, P, X);
}

function printBilan(B, P, X) {
  const s = S.settings || {};
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  printDoc(`
    <div class="bilan-print">
      <div class="attest-head"><div class="logo-mark">D</div>
        <div><div class="attest-club">${esc(s.club_name || 'Association')}</div>
          <div class="small">${esc(s.club_address || '')}${s.club_legal_id ? ' · ' + esc(s.club_legal_id) : ''}${s.club_email ? ' · ' + esc(s.club_email) : ''}</div></div></div>
      <h1>Comptes annuels${B.season ? ' · saison ' + esc(B.season.label) : ''}</h1>
      <p class="small">Édité le ${today}${B.season?.is_active ? ' · saison en cours : document provisoire' : ''}${P ? ' · comparaison avec la saison ' + esc(P.season.label) : ''}.</p>
      <h2 class="section-title">1. Compte de résultat</h2>${X.compte}
      <h2 class="section-title">2. Bilan</h2>${X.bilan}
      <h2 class="section-title">3. Annexe</h2>${X.annexe}
      <p style="margin-top:22px">Comptes arrêtés par le bureau et soumis à l’approbation de l’assemblée générale du …………………………</p>
      <div class="bilan-signs"><div>Le/la président(e)<div class="sign-box">${esc(s.president_name || '')}</div></div><div>Le/la trésorier(ère)<div class="sign-box"></div></div></div>
    </div>`, 'print-bilan');
}

/* =====================================================================
   Lancement
   ===================================================================== */
window.addEventListener('hashchange', route);
sb.auth.onAuthStateChange((event, session) => {
  const was = S.session?.user?.id;
  S.session = session;
  if (event === 'PASSWORD_RECOVERY') { S.recovery = true; return setTimeout(boot); }
  if (event === 'SIGNED_OUT') { S.profile = null; S.authMode = 'login'; S.bootedFor = null; S.opened = false; return setTimeout(boot); }
  // À l'ouverture, Supabase peut annoncer la connexion deux fois : on ne démarre qu'une fois par compte
  if (event === 'INITIAL_SESSION' || (event === 'SIGNED_IN' && was !== session?.user?.id)) {
    const who = session?.user?.id || 'aucun';
    if (S.bootedFor === who) return;
    S.bootedFor = who; setTimeout(boot);
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
