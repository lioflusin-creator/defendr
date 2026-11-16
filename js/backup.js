// Defendr — Sauvegarde et restauration
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config.js';
import { $, MONTHS, S, closeModal, discName, esc, fail, fmtDate, fmtMoney, fullName, icon, isoDay, levelName, openModal, pad2, sb, toast } from './core.js';
import { go, loadRefs, route } from './shell.js';

/* =====================================================================
   Sauvegarde Excel
   ===================================================================== */
export const BACKUP_KEY = window.DEFENDR_DEMO ? 'defendr-demo-derniere-sauvegarde' : 'defendr-derniere-sauvegarde';
export const lastBackup = () => {
  let local = null; try { local = localStorage.getItem(BACKUP_KEY); } catch {}
  const auto = S.backupAuto?.last_auto_backup_at || null;
  return [local, auto].filter(Boolean).sort().pop() || null;
};
export function lastBackupText() {
  const d = lastBackup();
  if (!d) return '<span class="badge warn">Aucune sauvegarde téléchargée depuis cet appareil</span>';
  const days = Math.floor((Date.now() - new Date(d)) / 86400000);
  return `<span class="badge ${days > 31 ? 'warn' : 'ok'}">Dernière sauvegarde : ${fmtDate(d.slice(0, 10))}${days > 31 ? ' · il est temps d’en refaire une' : ''}</span>`;
}

export const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm';
/* Onglets du fichier de sauvegarde ↔ tables de la base */
export const BACKUP_SHEETS = {
  'Membres': 'members', 'Paiements': 'payments', 'Dépenses': 'expenses', 'Séances': 'courses', 'Présences': 'attendances',
  'Planification': 'plan_items', 'Disciplines': 'disciplines', 'Niveaux': 'levels', 'Saisons': 'seasons', 'Paramètres': 'club_settings',
  'Historique grades': 'level_history', 'Lien séances-programme': 'course_plan_items', 'Prospects': 'prospects',
  'Stages': 'stages', 'Envois stages': 'stage_sends',
};

export async function downloadBackup(btn) {
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
    const { data: prospects } = await sb.from('prospects').select('*').order('created_at'); // absent tant que migration-9.sql n'est pas exécuté
    if (prospects) sheets['Prospects'] = clean(prospects);
    const { data: stages } = await sb.from('stages').select('*').order('stage_date'); // absent tant que migration-11.sql n'est pas exécuté
    if (stages) { sheets['Stages'] = clean(stages); sheets['Envois stages'] = clean((await sb.from('stage_sends').select('*').order('sent_at')).data || []); }
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

/* ---------- Sauvegarde automatique mensuelle (script Google defendr-sauvegarde.gs) ---------- */
export function autoBackupHtml() {
  if (window.DEFENDR_DEMO) return '';
  const b = S.backupAuto;
  if (!b) return `<div class="section-title mt" style="font-size:13px">Sauvegarde automatique</div><div class="alert error">Pour l’activer, exécutez une fois le fichier <strong>migration-13.sql</strong> dans Supabase → Éditeur SQL.</div>`;
  const last = b.last_auto_backup_at;
  const late = last && Date.now() - new Date(last) > 35 * 86400000;
  return `<div class="section-title mt" style="font-size:13px">Sauvegarde automatique</div>
    <p class="small muted">Chaque mois, une copie des données est rangée toute seule dans votre Google Drive (dossier « Defendr – sauvegardes »). Rien à faire une fois installée.</p>
    <div class="small mb">${last ? `<span class="badge ${late ? 'warn' : 'ok'}">Dernière sauvegarde automatique : ${fmtDate(last.slice(0, 10))}${late ? ' · en retard, vérifiez le script' : ''}</span>` : '<span class="badge warn">Pas encore installée</span>'}</div>
    <details ${last ? '' : 'open'}><summary class="small" style="cursor:pointer;font-weight:600">Installation (une seule fois, depuis un ordinateur)</summary>
      <ol class="small" style="padding-left:18px;margin:8px 0">
        <li>Cliquez sur <strong>Copier le script</strong> ci-dessous.</li>
        <li>Ouvrez <a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener">script.google.com</a> avec le compte Google du club (un nouveau projet s’ouvre). Effacez le contenu, collez le script et cliquez sur l’icône <strong>Enregistrer</strong>.</li>
        <li>En haut, choisissez la fonction <strong>installer</strong> puis cliquez sur <strong>▶ Exécuter</strong>. Autorisez l’accès (si Google affiche « Application non validée » : <strong>Paramètres avancés → Accéder au projet</strong>).</li>
        <li>C’est fini : une première sauvegarde est faite tout de suite, puis le 1<sup>er</sup> de chaque mois. Revenez sur cette page pour voir la date.</li>
      </ol>
      <button type="button" class="btn btn-sm" id="ab-copy">${icon('copy')}Copier le script</button>
      <p class="small muted mt">Le script contient une clé qui permet seulement de lire une copie des données : ne le partagez pas. Pour restaurer, choisissez le fichier .json avec <strong>Restaurer depuis une sauvegarde</strong>.</p>
    </details>`;
}
export async function autoBackupEnsureKey() {
  if (S.backupAuto?.backup_key) return S.backupAuto.backup_key;
  const key = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
  const { error } = await sb.from('backup_settings').upsert({ id: 1, backup_key: key });
  if (error) { fail(error); return null; }
  S.backupAuto = { ...(S.backupAuto || {}), backup_key: key }; return key;
}
export function bindAutoBackup(view) {
  const btn = $('#ab-copy', view); if (!btn) return;
  btn.onclick = async () => {
    const key = await autoBackupEnsureKey(); if (!key) return;
    let code;
    try {
      const r = await fetch(new URL('../defendr-sauvegarde.gs', import.meta.url), { cache: 'no-store' }); if (!r.ok) throw 0;
      code = (await r.text()).replace('__SUPABASE_URL__', SUPABASE_URL).replace('__SUPABASE_ANON_KEY__', SUPABASE_ANON_KEY).replace('__CLE_SAUVEGARDE__', key);
    } catch { return toast('Impossible de récupérer le script.', 'error'); }
    try { await navigator.clipboard.writeText(code); toast('Script copié : collez-le dans script.google.com'); }
    catch { openModal({ title: 'Script de sauvegarde', body: `<p class="small muted">Sélectionnez tout le texte et copiez-le.</p><textarea class="input" style="min-height:300px;font-family:monospace;font-size:12px" readonly>${esc(code)}</textarea>`, foot: '<button class="btn btn-primary" data-close>Fermer</button>' }); }
  };
}

/* ---------- Restauration ---------- */
export const BOOL_COLS = new Set(['trial_present', 'medical_certificate', 'qss', 'medical_waiver', 'other_defense_sport', 'consent_image', 'consent_data', 'rules_read', 'rules_accepted', 'insurance_informed', 'parental_authorization', 'present', 'done', 'bank_checked', 'archived', 'is_active']);
export const ARRAY_COLS = new Set(['revenue_types', 'expense_categories', 'rooms', 'plan_sections']);
export const JSON_COLS = new Set(['club_documents', 'health_files']);
export const DATE_COLS = new Set(['tshirt_given_at', 'stage_date', 'trial_date', 'birth_date', 'registration_date', 'medical_waiver_validity', 'course_date', 'payment_date', 'due_date', 'expense_date', 'changed_on']);
export const TIME_COLS = new Set(['start_time', 'end_time', 'default_start_time', 'default_end_time']);
export const PHONE_COLS = new Set(['phone', 'emergency_phone', 'guardian_phone', 'whatsapp_number']);

export function normalizeCell(k, v) {
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

export async function readBackupFile(file) {
  if (/\.json$/i.test(file.name) || file.type === 'application/json') {
    let data; try { data = JSON.parse(await file.text()); } catch { throw new Error('Fichier illisible.'); }
    if (data?.format !== 'defendr-sauvegarde' || !Array.isArray(data.tables?.members)) throw new Error('Ce fichier n’est pas une sauvegarde Defendr.');
    const payload = {}, counts = {};
    for (const [sheet, table] of Object.entries(BACKUP_SHEETS)) if (Array.isArray(data.tables[table])) { payload[table] = data.tables[table]; counts[sheet] = payload[table].length; }
    if (payload.members.some(m => !m.id || !m.first_name)) throw new Error('Sauvegarde incomplète : chaque membre doit avoir un id et un prénom.');
    return { payload, counts, missing: Object.keys(BACKUP_SHEETS).filter(s => !(s in counts)) };
  }
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

export async function restoreFromFile(file) {
  let parsed;
  try { parsed = await readBackupFile(file); } catch (e) { return fail(e); }
  const { payload, counts, missing } = parsed;
  const dateInName = file.name.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  const total = payload.payments?.filter(p => p.status === 'payé' && !p.archived).reduce((s, p) => s + Number(p.amount || 0), 0) || 0;
  openModal({
    title: 'Restaurer une sauvegarde',
    body: `
      <div class="alert error"><strong>Attention :</strong> toutes les données actuelles (membres, paiements, dépenses, séances, présences, planification, grades, paramètres, prospects) seront <strong>remplacées</strong> par celles du fichier. Les comptes de l’équipe et les fichiers de cours sont conservés.</div>
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
