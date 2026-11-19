// Defendr — Historique des modifications
import { $, $$, S, discName, esc, fmtDate, levelName, sb } from './core.js';
import { currentPath, head, loadRefs, route } from './shell.js';
import { PROSPECT_SOURCE, PROSPECT_STATUS } from './prospects.js';

/* =====================================================================
   Historique des modifications
   ===================================================================== */
export const AUDIT_TABLES = { stages: 'Stages', members: 'Membres', payments: 'Paiements', expenses: 'Dépenses', prospects: 'Prospects', courses: 'Séances', seasons: 'Saisons', club_settings: 'Paramètres', restauration: 'Restauration' };
export const AUDIT_FIELDS = { first_name: 'Prénom', last_name: 'Nom', phone: 'Téléphone', email: 'E-mail', address: 'Adresse', birth_date: 'Date de naissance', status: 'Statut', level_id: 'Niveau', discipline_id: 'Discipline',
  fee_type: 'Cotisation', fee_amount: 'Montant cotisation', amount: 'Montant', payment_type: 'Type', payment_date: 'Date', method: 'Moyen de paiement', due_date: 'Encaissement prévu', bank_checked: 'Pointé en banque',
  tshirt_size: 'Taille T-shirt', tshirt_given_at: 'T-shirt remis le', medical_certificate: 'Certificat médical', qss: 'Questionnaire de santé', registration_date: 'Date d’inscription', member_role: 'Rôle', notes: 'Notes', label: 'Libellé', category: 'Catégorie', expense_date: 'Date',
  course_date: 'Date', title: 'Titre', start_time: 'Début', end_time: 'Fin', room: 'Salle', instructor: 'Encadrant', is_active: 'Active', opening_balance: 'Solde de départ', archived: 'Archivé',
  trial_date: 'Date d’essai', trial_present: 'Venu(e) à l’essai', invited_at: 'Invité(e) le', stage_date: 'Date du stage', place: 'Lieu', price: 'Tarif', audience: 'Public', description: 'Programme', trial_course_id: 'Séance d’essai', converted_at: 'Inscrit(e) le', source: 'Origine', renewal_sent_at: 'Lien de réinscription envoyé', renewed_season_id: 'Réinscrit(e) pour la saison', adac_sent_at: 'Déclaré(e) à l’ADAC le', adac_season_id: 'Déclaré(e) à l’ADAC pour la saison', member_id: 'Fiche membre',
  emergency_contact: 'Contact d’urgence', emergency_phone: 'Tél. urgence', guardian_name: 'Responsable légal', guardian_phone: 'Tél. responsable', consent_image: 'Droit à l’image', club_documents: 'Documents du club' };
export const auditVal = (k, v, t) => {
  if (v === null || v === undefined || v === '') return '—';
  if (k === 'status' && t === 'prospects') return PROSPECT_STATUS[v] || v;
  if (k === 'source') return PROSPECT_SOURCE[v] || v;
  if (k === 'status') return v === 'actif' ? 'Actif' : v === 'inactif' ? 'Inactif' : v;
  if (v === true) return 'Oui'; if (v === false) return 'Non';
  if (k === 'level_id') return levelName(v); if (k === 'discipline_id') return discName(v);
  if (k.endsWith('season_id')) return S.seasons.find(x => x.id === v)?.label || 'autre saison';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtDate(v);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDate(v.slice(0, 10));
  if (typeof v === 'object') return 'modifié';
  if (/_id$/.test(k)) return 'renseigné';
  const str = String(v); return str.length > 60 ? str.slice(0, 57) + '…' : str;
};
export const auditRow = (a, withTable = true) => {
  const changes = a.action === 'modification' && a.changes ? Object.entries(a.changes).filter(([k]) => AUDIT_FIELDS[k] || !/(_id|_at|token|legacy)$/.test(k)).map(([k, [o, n]]) => `<div class="small"><span class="muted">${esc(AUDIT_FIELDS[k] || k)} :</span> ${esc(auditVal(k, o, a.table_name))} → <strong>${esc(auditVal(k, n, a.table_name))}</strong></div>`).join('') : '';
  const cls = { ajout: 'ok', modification: '', suppression: 'danger', restauration: 'warn' }[a.action] ?? '';
  const when = new Date(a.at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const link = a.table_name === 'members' && a.action !== 'suppression' && a.row_id ? `#/membres/${a.row_id}` : '';
  return `<div class="bday" style="align-items:flex-start;padding:10px 16px"><div style="flex:1;min-width:0">
    <div class="row wrap" style="gap:6px;align-items:center"><span class="badge ${cls}">${esc(a.action)}</span>${withTable ? `<span class="small muted">${esc(AUDIT_TABLES[a.table_name] || a.table_name)}</span>` : ''}
      ${link ? `<a href="${link}" style="font-weight:600">${esc(a.label || '—')}</a>` : `<strong>${esc(a.label || '—')}</strong>`}</div>
    ${changes}${a.action === 'suppression' && a.changes ? `<details class="small"><summary style="cursor:pointer" class="muted">Données supprimées</summary><div style="overflow-wrap:anywhere">${Object.entries(a.changes).filter(([, v]) => v !== null && v !== '' && v !== false).filter(([k]) => AUDIT_FIELDS[k]).map(([k, v]) => `${esc(AUDIT_FIELDS[k])} : ${esc(auditVal(k, v, a.table_name))}`).join(' · ')}</div></details>` : ''}
    <div class="small muted">${esc(when)} · ${esc(a.user_name || 'Système')}</div></div></div>`;
};

S.history = { table: 'tous', limit: 100, search: '' };
export async function viewHistory(view) {
  await loadRefs();
  let q = sb.from('audit_log').select('*').order('at', { ascending: false }).limit(S.history.limit);
  if (S.history.table !== 'tous') q = q.eq('table_name', S.history.table);
  const { data, error } = await q;
  if (error) {
    if (!/audit_log|schema cache|does not exist|42P01|PGRST205/i.test(`${error.code} ${error.message}`)) throw error;
    view.innerHTML = head('Historique') + '<div class="alert error">Pour activer l’historique, exécutez une fois le fichier <strong>migration-10.sql</strong> dans Supabase → Éditeur SQL.</div>'; return;
  }
  view.innerHTML = head('Historique', 'Qui a ajouté, modifié ou supprimé quoi, et quand. Visible par le président et le trésorier.') + `
    <div class="toolbar"><input class="input" type="search" id="h-search" placeholder="Rechercher un nom, une personne…" value="${esc(S.history.search)}" aria-label="Rechercher dans l’historique">
      <div class="chips">${[['tous', 'Tout'], ...Object.entries(AUDIT_TABLES)].map(([k, l]) => `<button class="chip ${S.history.table === k ? 'active' : ''}" data-t="${k}">${esc(l)}</button>`).join('')}</div></div>
    <div class="card" id="h-list"></div>
    ${data.length >= S.history.limit ? '<div class="row mt" style="justify-content:center"><button class="btn" id="h-more">Voir plus</button></div>' : ''}`;
  const draw = () => {
    const n = x => String(x || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, ''), q = n(S.history.search);
    const rows = data.filter(a => !q || n(`${a.label} ${a.user_name}`).includes(q));
    $('#h-list').innerHTML = rows.length ? rows.map(a => auditRow(a)).join('') : `<div class="empty">${data.length ? 'Aucune modification ne correspond.' : 'Aucune modification enregistrée pour l’instant. Chaque changement apparaîtra ici.'}</div>`;
  };
  draw();
  $('#h-search').oninput = e => { S.history.search = e.target.value; draw(); };
  $$('[data-t]', view).forEach(b => b.onclick = () => { S.history.table = b.dataset.t; S.history.limit = 100; route(); });
  $('#h-more') && ($('#h-more').onclick = () => { S.history.limit += 100; route(); });
}
export async function memberHistory(view, id) {
  const { data, error } = await sb.from('audit_log').select('*').eq('row_id', id).order('at', { ascending: false }).limit(15);
  if (error || !data?.length || !view.isConnected || currentPath() !== '/membres/' + id) return;
  view.insertAdjacentHTML('beforeend', `<div class="card mt"><div class="card-pad" style="padding-bottom:0"><h2>Historique de la fiche</h2></div>${data.map(a => auditRow(a, false)).join('')}</div>`);
}
