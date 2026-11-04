/* =====================================================================
   DEFENDR → ADAC National
   Script à coller dans le tableur « BASE LICENCES ADAC »
   (Extensions → Apps Script), puis à déployer en « Application Web ».

   Règles :
   - un adhérent déjà présent (même NOM + Prénom + date de naissance,
     sans tenir compte des accents ni des majuscules) n'est JAMAIS ajouté
     une deuxième fois ;
   - pour un adhérent déjà présent, seules les cases VIDES sont complétées :
     rien de ce qui est déjà saisi dans le tableur n'est écrasé ;
   - les nouveaux adhérents sont ajoutés à la suite, avec le numéro
     d'adhérent suivant ;
   - tous les champs texte sont écrits en MAJUSCULES, comme l'exige l'ADAC
     (sauf l'e-mail, gardé en minuscules pour rester valide).
   ===================================================================== */

const SECRET = '__CLE_DEFENDR__';          // clé fournie par Defendr (Paramètres → ADAC National)
const SHEET_NAME = 'BASE LICENCES';
const FIRST_ROW = 11;                      // première ligne d'adhérent (sous les titres)
const COL = { NB: 1, NUM: 2, HF: 3, NOM: 4, PRENOM: 5, NAISS: 6, ADRESSE: 7, MAIL: 9, DISCIPLINE: 10, TS: 11 };
const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];   // colonnes K à O
const WIDTH = COL.TS + SIZES.length - 1;       // jusqu'à la colonne O

function doGet() {
  return out({ ok: true, service: 'Defendr → ADAC', onglet: SHEET_NAME });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: 'Requête illisible.' }); }
  if (!body || body.key !== SECRET) return out({ ok: false, error: 'Clé incorrecte : recopiez le script depuis Defendr.' });
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return out(sync(body.members || [], !!body.dryRun, body.discipline || 'BDR'));
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function norm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

// Date du tableur (objet Date, « 10/04/1966 » ou « 25021981 ») → « 1966-04-10 »
function isoOf(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const s = String(v == null ? '' : v).trim();
  let m;
  if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/))) return m[3] + '-' + pad(m[2]) + '-' + pad(m[1]);
  if ((m = s.match(/^(\d{2})(\d{2})(\d{4})$/))) return m[3] + '-' + m[2] + '-' + m[1];
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[1] + '-' + m[2] + '-' + m[3];
  return '';
}
function pad(n) { return String(n).padStart(2, '0'); }
function toDate(iso) { const p = iso.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
const blank = v => v === '' || v == null;
const upper = v => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').toUpperCase();

function sizeOf(s) {
  const t = String(s || '').toUpperCase().trim();
  if (t === 'XS') return 'S';
  if (t === 'XXXL' || t === '3XL') return 'XXL';
  return SIZES.indexOf(t) >= 0 ? t : '';
}

// Valeurs que Defendr propose pour chaque colonne (seulement celles qui sont renseignées)
function wantedFor(m, discipline) {
  const w = {};
  const g = norm(m.gender);
  if (g === 'HOMME' || g === 'H') w[COL.HF] = 'H';
  if (g === 'FEMME' || g === 'F') w[COL.HF] = 'F';
  if (m.birth_date) w[COL.NAISS] = toDate(m.birth_date);
  if (m.address) w[COL.ADRESSE] = upper(m.address);
  if (m.email) w[COL.MAIL] = String(m.email).trim().toLowerCase();
  if (discipline) w[COL.DISCIPLINE] = upper(discipline);
  return w;
}

const LABELS = { 3: 'H/F', 6: 'date de naissance', 7: 'adresse', 9: 'e-mail', 10: 'discipline' };

function sync(members, dryRun, discipline) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sh) return { ok: false, error: 'Onglet « ' + SHEET_NAME + ' » introuvable dans le tableur.' };

  const lastRow = Math.max(sh.getLastRow(), FIRST_ROW);
  const grid = sh.getRange(FIRST_ROW, 1, lastRow - FIRST_ROW + 1, WIDTH).getValues();
  const existing = [];
  let nextRow = FIRST_ROW, nextNum = 1;
  grid.forEach((r, i) => {
    const num = Number(r[COL.NUM - 1]);
    if (num >= nextNum) nextNum = num + 1;
    if (blank(r[COL.NOM - 1]) && blank(r[COL.PRENOM - 1])) return;
    nextRow = FIRST_ROW + i + 1;
    existing.push({ row: FIRST_ROW + i, values: r, nom: norm(r[COL.NOM - 1]), prenom: norm(r[COL.PRENOM - 1]), naiss: isoOf(r[COL.NAISS - 1]) });
  });

  const results = [], seen = {};
  members.forEach(m => {
    const name = [m.last_name, m.first_name].filter(Boolean).join(' ');
    const nom = norm(m.last_name), prenom = norm(m.first_name), naiss = m.birth_date || '';
    if (!nom || !prenom) { results.push({ name: name || '(sans nom)', action: 'ignore', detail: 'nom ou prénom manquant' }); return; }
    const key = nom + '|' + prenom + '|' + naiss;
    if (seen[key]) { results.push({ name, action: 'ignore', detail: 'en double dans Defendr' }); return; }
    seen[key] = true;

    // Même nom + prénom ; si les deux dates de naissance sont connues, elles doivent correspondre
    const same = existing.filter(x => x.nom === nom && x.prenom === prenom && (!naiss || !x.naiss || x.naiss === naiss));
    const hit = same.find(x => naiss && x.naiss === naiss) || same[0];
    const wanted = wantedFor(m, discipline);
    const size = sizeOf(m.tshirt_size);

    if (hit) {
      const fill = [];
      Object.keys(wanted).forEach(c => { if (blank(hit.values[c - 1])) fill.push(Number(c)); });
      const noSize = SIZES.every((_, k) => blank(hit.values[COL.TS - 1 + k]));
      const addSize = size && noSize;
      if (!fill.length && !addSize) { results.push({ name, action: 'present', row: hit.row }); return; }
      if (!dryRun) {
        fill.forEach(c => { sh.getRange(hit.row, c).setValue(wanted[c]); hit.values[c - 1] = wanted[c]; });
        if (addSize) { sh.getRange(hit.row, COL.TS + SIZES.indexOf(size)).setValue(1); hit.values[COL.TS - 1 + SIZES.indexOf(size)] = 1; }
      }
      results.push({ name, action: 'complete', row: hit.row, detail: fill.map(c => LABELS[c]).concat(addSize ? ['T-shirt ' + size] : []).join(', ') });
      return;
    }

    const row = nextRow++, num = nextNum++;
    const line = new Array(WIDTH).fill('');
    line[COL.NB - 1] = 1;
    line[COL.NUM - 1] = num;
    line[COL.NOM - 1] = upper(m.last_name);
    line[COL.PRENOM - 1] = upper(m.first_name);
    Object.keys(wanted).forEach(c => { line[c - 1] = wanted[c]; });
    if (size) line[COL.TS - 1 + SIZES.indexOf(size)] = 1;
    if (!dryRun) {
      if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), row - sh.getMaxRows());
      sh.getRange(FIRST_ROW, 1, 1, WIDTH).copyFormatToRange(sh, 1, WIDTH, row, row);
      sh.getRange(row, 1, 1, WIDTH).setValues([line]);
      sh.getRange(row, COL.ADRESSE, 1, 2).merge();
    }
    existing.push({ row, values: line, nom, prenom, naiss });
    results.push({ name, action: 'ajout', row, detail: 'n° ' + String(num).padStart(3, '0') });
  });

  const count = a => results.filter(r => r.action === a).length;
  return { ok: true, dryRun, results, ajouts: count('ajout'), completes: count('complete'), presents: count('present'), ignores: count('ignore') };
}
