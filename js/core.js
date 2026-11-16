// Defendr — État global, utilitaires, fenêtres
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SITE, SUPABASE_ANON_KEY, SUPABASE_URL } from '../config.js';

// Garde-fou pour les copies du logiciel : tant que config.js n'est pas adapté au nouveau club,
// l'appli ne se connecte pas à la base d'un autre club.
export const SITE_OK = window.DEFENDR_DEMO || !SITE || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  || (location.host + location.pathname).toLowerCase().startsWith(String(SITE).toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, ''));
if (!SITE_OK) {
  document.getElementById('app').innerHTML = `<div style="max-width:560px;margin:12vh auto;padding:24px;font:16px/1.5 system-ui,sans-serif">
    <div class="logo-mark" style="margin-bottom:16px">D</div><h1 style="margin:0 0 8px">Defendr n’est pas encore configuré</h1>
    <p>Cette copie du logiciel doit être reliée à la base de données de votre club : renseignez l’adresse et la clé de votre projet Supabase, ainsi que l’adresse de ce site, dans le fichier <strong>config.js</strong>.</p>
    <p>Toutes les étapes sont décrites dans le fichier <strong>INSTALLER-NOUVEAU-CLUB.md</strong> du logiciel.</p></div>`;
  throw new Error('config.js à adapter pour ce club');
}

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Dépôt GitHub de ce club (déduit de l'adresse GitHub Pages) pour les boutons de sauvegarde
export const GITHUB_REPO = (() => {
  const m = location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i); if (!m) return null;
  const seg = location.pathname.split('/').filter(Boolean)[0];
  return `https://github.com/${m[1]}/${seg && !seg.includes('.') ? seg : m[1] + '.github.io'}`;
})();

/* =====================================================================
   État global
   ===================================================================== */
export const S = {
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
export const isAdmin = () => ['admin', 'tresorier'].includes(S.profile?.role);
export const isPresident = () => S.profile?.role === 'admin';
export const ROLE_LABELS = { admin: 'Président(e)', tresorier: 'Trésorier(ère)', enseignant: 'Enseignant(e)', en_attente: 'En attente' };
export const roleLabel = r => ROLE_LABELS[r] || r;
export const activeSeason = () => S.seasons.find(s => s.is_active) || null;

/* =====================================================================
   Utilitaires
   ===================================================================== */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const fmtDate = d => d ? new Date(d + (String(d).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const fmtDay = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' }) : '';
export const fmtMoney = n => (Number(n) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: Number(n) % 1 ? 2 : 0 });
export const fullName = m => `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim();
export const initials = m => ((m.first_name || '?')[0] + ((m.last_name || '')[0] || '')).toUpperCase();
export const ageOf = d => { if (!d) return null; const b = new Date(d + 'T00:00:00'), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a; };
export const isBirthdayMonth = (d, month = new Date().getMonth()) => d && new Date(d + 'T00:00:00').getMonth() === month;
export const discName = id => S.disciplines.find(d => d.id === id)?.name || '—';
export const levelName = id => S.levels.find(l => l.id === id)?.name || '—';
export const waLink = phone => { const p = String(phone || '').replace(/\D/g, ''); return p ? `https://wa.me/${p.startsWith('0') ? '33' + p.slice(1) : p}` : null; };

export function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 5000 : 2600);
}
export function fail(error) {
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
export function readForm(form) {
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
export const I = {
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
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  userplus: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/>',
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
export const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] || ''}</svg>`;

/* Fenêtres modales */
export function openModal({ title, body, foot = '', size = '', onMount }) {
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
export function escClose(e) { if (e.key === 'Escape') closeModal(); }
export function closeModal() { $('#modal-root').innerHTML = ''; document.removeEventListener('keydown', escClose); }
/* Enregistrer un fichier créé par l'appli. Sur téléphone (iPhone surtout, et dans l'appli installée
   sur l'écran d'accueil), un téléchargement direct ne marche pas bien : on passe par le menu Partager,
   d'où l'on peut « Enregistrer dans Fichiers », l'envoyer par mail, etc. Renvoie true si le fichier est parti. */
export async function saveFile(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  const mobile = matchMedia('(pointer: coarse)').matches || navigator.standalone;
  if (mobile && navigator.canShare?.({ files: [file] })) {
    const share = () => navigator.share({ files: [file], title: filename }).then(() => true, e => e?.name === 'AbortError' ? false : Promise.reject(e));
    try { return await share(); }
    catch (e) {
      if (e?.name !== 'NotAllowedError') throw e;
      // La préparation a pris trop de temps : le téléphone exige un nouveau toucher pour partager
      return new Promise(resolve => openModal({
        title: 'Fichier prêt', size: 'sm',
        body: `<p style="margin:0"><strong>${esc(filename)}</strong></p><p class="small muted">Touchez le bouton, puis choisissez « Enregistrer dans Fichiers » ou l’application de votre choix.</p>`,
        foot: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="sf-go">${icon('up')}Enregistrer / partager</button>`,
        onMount: r => {
          $('#sf-go', r).onclick = () => share().then(ok => { closeModal(); resolve(ok); }, err => { closeModal(); fail(err); resolve(false); });
          $$('[data-close]', r).forEach(b => b.addEventListener('click', () => resolve(false)));
        },
      }));
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export function confirmBox(title, text, okLabel = 'Supprimer') {
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

export const pad2 = n => String(n).padStart(2, '0');
export const isoDay = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const parseDay = s => new Date(s + 'T00:00:00');
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const mondayOf = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
export const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const hhmm = t => (t || '').slice(0, 5);
export const longDay = s => parseDay(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
