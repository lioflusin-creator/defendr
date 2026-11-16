/* =====================================================================
   DEFENDR → Google Drive : sauvegarde automatique mensuelle
   Script à coller dans un nouveau projet sur https://script.google.com
   (voir Defendr → Paramètres → Sauvegarde automatique).

   - Le 1er de chaque mois, vers 3 h du matin, une copie complète des
     données du club est rangée dans le dossier « Defendr – sauvegardes »
     de votre Google Drive (fichier .json).
   - Les 24 dernières sauvegardes sont gardées, les plus anciennes sont
     mises à la corbeille.
   - En cas de problème, un e-mail vous prévient.
   - Pour restaurer : Defendr → Paramètres → Restaurer depuis une
     sauvegarde, et choisissez le fichier .json.

   La clé ci-dessous permet seulement de LIRE une copie des données :
   gardez ce script pour vous, ne le partagez pas.
   ===================================================================== */

const SUPABASE_URL = '__SUPABASE_URL__';
const SUPABASE_ANON_KEY = '__SUPABASE_ANON_KEY__';
const CLE_SAUVEGARDE = '__CLE_SAUVEGARDE__';
const DOSSIER = 'Defendr – sauvegardes';
const GARDER = 24;

// À lancer UNE fois (bouton ▶ Exécuter) : programme la sauvegarde mensuelle
// et fait tout de suite une première sauvegarde.
function installer() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sauvegarder')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sauvegarder').timeBased().onMonthDay(1).atHour(3).create();
  sauvegarder();
}

function sauvegarder() {
  try {
    const res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/backup_export', {
      method: 'post',
      contentType: 'application/json',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
      payload: JSON.stringify({ p_key: CLE_SAUVEGARDE }),
      muteHttpExceptions: true,
    });
    const text = res.getContentText();
    if (res.getResponseCode() !== 200) {
      let msg = text;
      try { msg = JSON.parse(text).message || text; } catch (e) {}
      throw new Error(msg);
    }
    const data = JSON.parse(text);
    if (!data || data.format !== 'defendr-sauvegarde' || !data.tables || !data.tables.members) throw new Error('Réponse inattendue de la base.');

    const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd-HH'h'mm");
    const nom = 'Defendr-sauvegarde-' + stamp + '.json';
    const dossier = dossierSauvegardes_();
    dossier.createFile(Utilities.newBlob(text, 'application/json', nom));
    nettoyer_(dossier);
    console.log('Sauvegarde enregistrée : ' + nom + ' (' + data.tables.members.length + ' membres)');
  } catch (err) {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
      'Defendr : la sauvegarde automatique a échoué',
      'La sauvegarde mensuelle des données du club n’a pas pu se faire.\n\nMotif : ' + (err && err.message || err) +
      '\n\nVous pouvez faire une sauvegarde à la main depuis Defendr → Paramètres → Sauvegarde.');
    throw err;
  }
}

function dossierSauvegardes_() {
  const it = DriveApp.getFoldersByName(DOSSIER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(DOSSIER);
}

function nettoyer_(dossier) {
  const fichiers = [];
  const it = dossier.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (/^Defendr-sauvegarde-.*\.json$/.test(f.getName())) fichiers.push(f);
  }
  fichiers.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  fichiers.slice(GARDER).forEach(f => f.setTrashed(true));
}
