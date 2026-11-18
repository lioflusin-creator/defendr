// Mise en cache de l'appli pour un démarrage rapide sur téléphone.
// Les données (Supabase) ne sont jamais mises en cache : elles restent toujours à jour.
const VERSION = 'defendr-v56';

const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'js/adac.js', 'js/backup.js', 'js/compta.js', 'js/core.js', 'js/dashboard.js', 'js/grades.js', 'js/guide.js', 'js/history.js', 'js/inscriptions.js', 'js/members.js', 'js/plan.js', 'js/planning.js', 'js/print.js', 'js/prospects.js', 'js/receipts.js', 'js/referentiels.js', 'js/settings.js', 'js/shell.js', 'js/stages.js', 'js/stats.js', 'js/whatsapp.js', 'config.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Réseau d'abord (pour toujours avoir la dernière version), cache en secours hors connexion.
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
      const copy = res.clone();
      if (res.ok) caches.open(VERSION).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
