// Defendr — point d'entrée : charge les rubriques (dossier js/) et démarre l'appli.
import { S, sb } from './js/core.js';
import { boot, route } from './js/shell.js';

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
