// Defendr — Navigation, démarrage, connexion, routeur
import { $, $$, S, closeModal, esc, fail, icon, isAdmin, readForm, roleLabel, sb, toast } from './core.js';
import { viewDashboard } from './dashboard.js';
import { viewMember, viewMembers } from './members.js';
import { viewDisciplines, viewLevels } from './referentiels.js';
import { viewRegistration } from './inscriptions.js';
import { viewProspects } from './prospects.js';
import { registrationStats, viewStats } from './stats.js';
import { memberHistory, viewHistory } from './history.js';
import { viewStages } from './stages.js';
import { viewSettings } from './settings.js';
import { viewPlanning } from './planning.js';
import { viewWhatsApp } from './whatsapp.js';
import { viewPlan } from './plan.js';
import { viewGuide } from './guide.js';
import { viewAccounting, viewBilan } from './compta.js';

/* =====================================================================
   Navigation
   ===================================================================== */
export const NAV = [
  { path: '/', label: 'Tableau de bord', short: 'Accueil', icon: 'home' },
  { path: '/membres', label: 'Membres', short: 'Membres', icon: 'users' },
  { path: '/planning', label: 'Planning', short: 'Planning', icon: 'calendar' },
  { path: '/paiements', label: 'Comptabilité', short: 'Compta', icon: 'euro', admin: true },
  { path: '/statistiques', label: 'Statistiques', short: 'Stats', icon: 'chart' },
  { path: '/inscription', label: 'Inscription en ligne', icon: 'userplus' },
  { path: '/planification', label: 'Planification annuelle', icon: 'list' },
  { path: '/guide', label: 'Guide enseignant', icon: 'book' },
  { path: '/whatsapp', label: 'WhatsApp', icon: 'chat' },
  { path: '/prospects', label: 'Prospects', icon: 'star' },
  { path: '/stages', label: 'Stages', icon: 'flag' },
  { path: '/parametres', label: 'Paramètres', icon: 'gear' },
  { path: '/historique', label: 'Historique', icon: 'clock', admin: true },
];
export const SETTINGS_SUBPAGES = ['/disciplines', '/niveaux']; // pages ouvertes depuis les Paramètres
export const navItems = () => NAV.filter(n => !n.admin || isAdmin());
export const currentPath = () => (location.hash.replace(/^#/, '') || '/').split('?')[0];
export const go = path => { location.hash = '#' + path; };

export function navLinks(path) {
  return navItems().map(n => {
    const active = n.path === '/' ? path === '/' : path.startsWith(n.path) || (n.path === '/parametres' && SETTINGS_SUBPAGES.some(p => path.startsWith(p)));
    return `<a href="#${n.path}" class="${active ? 'active' : ''}">${icon(n.icon)}<span>${esc(n.label)}</span>${n.soon ? '<span class="soon">bientôt</span>' : ''}</a>`;
  }).join('');
}
export function sideFoot() {
  return `<div class="side-foot">
    <div class="who">${esc(S.profile?.full_name || S.session?.user?.email)}</div>
    <div class="role">${esc(roleLabel(S.profile?.role))}</div>
    <button data-logout>Se déconnecter</button>
  </div>`;
}
export function brand() {
  return `<div class="brand"><div class="logo-mark">D</div><div><div class="brand-name">Defendr</div><div class="brand-club">${esc(S.settings?.club_name || '')}</div></div></div>`;
}

export function shell(content) {
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
export function openDrawer() {
  const d = document.createElement('div');
  d.id = 'drawer';
  d.innerHTML = `<div class="drawer-back"></div><div class="drawer">${brand()}<nav class="nav">${navLinks(currentPath())}</nav>${sideFoot()}</div>`;
  document.body.appendChild(d);
  d.addEventListener('click', e => { if (e.target.classList.contains('drawer-back') || e.target.closest('a')) d.remove(); });
  bindGlobal(d);
}
export function bindGlobal(root = document) {
  $$('[data-logout]', root).forEach(b => b.onclick = async () => { await sb.auth.signOut(); });
  $$('[data-drawer]', root).forEach(b => b.onclick = openDrawer);
}

/* =====================================================================
   Démarrage & authentification
   ===================================================================== */
export async function loadRefs() {
  const [st, di, le, se] = await Promise.all([
    sb.from('club_settings').select('*').eq('id', 1).maybeSingle(),
    sb.from('disciplines').select('*').order('name'),
    sb.from('levels').select('*').order('rank'),
    sb.from('seasons').select('*').order('created_at', { ascending: false }),
  ]);
  for (const r of [st, di, le, se]) if (r.error) throw r.error;
  S.settings = st.data; S.disciplines = di.data; S.levels = le.data; S.seasons = se.data;
  // Sauvegarde automatique mensuelle (absente tant que migration-13.sql n'est pas exécuté)
  if (isAdmin()) { const { data, error } = await sb.from('backup_settings').select('*').eq('id', 1).maybeSingle(); S.backupAuto = error ? null : (data || {}); }
}

export async function boot() {
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

export function renderAuth(mode) {
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
export async function route() {
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
    else if (path.startsWith('/membres/')) { await viewMember(view, path.split('/')[2]); if (isAdmin()) memberHistory(view, path.split('/')[2]); }
    else if (path === '/membres') await viewMembers(view);
    else if (path === '/planning') await viewPlanning(view);
    else if (path === '/paiements' && isAdmin()) await viewAccounting(view);
    else if (path === '/bilan' && isAdmin()) await viewBilan(view);
    else if (path === '/statistiques') { await viewStats(view); registrationStats($('#st-regs')); }
    else if (path === '/planification') await viewPlan(view);
    else if (path === '/guide') await viewGuide(view);
    else if (path === '/whatsapp') await viewWhatsApp(view);
    else if (path === '/disciplines') await viewDisciplines(view);
    else if (path === '/niveaux') await viewLevels(view);
    else if (path === '/inscription') await viewRegistration(view);
    else if (path === '/prospects') await viewProspects(view);
    else if (path === '/stages') await viewStages(view);
    else if (path === '/historique' && isAdmin()) await viewHistory(view);
    else if (path === '/parametres') await viewSettings(view);
    else if (item?.admin && !isAdmin()) view.innerHTML = `<div class="empty">Cette rubrique est réservée au président et au trésorier.</div>`;
    else if (item) viewSoon(view, item);
    else go('/');
  } catch (e) {
    if (seq !== S.routeSeq || !view.isConnected) return; // page déjà remplacée : erreur sans importance
    fail(e); view.innerHTML = `<div class="empty">Impossible de charger cette page.</div>`;
  }
}

export function head(title, sub = '', actions = '') {
  return `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
}
export function viewSoon(view, item) {
  view.innerHTML = head(item.label) + `<div class="card soon-box"><div class="logo-mark">${icon(item.icon)}</div>
    <h2 class="section-title">Bientôt disponible</h2>
    <p class="muted" style="max-width:420px;margin:0 auto">Cette rubrique arrive dans la prochaine version. En attendant, elle reste accessible dans votre ancienne appli.</p></div>`;
}
