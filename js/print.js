// Defendr — Impression et export Excel des membres
import { $, $$, S, activeSeason, ageOf, discName, esc, fail, fmtDate, fmtMoney, fullName, icon, isoDay, levelName, openModal, sb, toast, saveFile, XLSX_MIME } from './core.js';
import { seasonStart } from './inscriptions.js';
import { XLSX_URL } from './backup.js';
import { bilanHtml, loadAccounting } from './compta.js';

/* =====================================================================
   Impression (attestations, rapports)
   ===================================================================== */
export function printDoc(html, cls = '', onPreview = null) {
  let el = $('#print-root');
  if (!el) { el = document.createElement('div'); el.id = 'print-root'; document.body.appendChild(el); }
  el.className = cls;
  el.innerHTML = html;
  // Sur téléphone (iPhone surtout, et a fortiori dans l'appli installée sur l'écran d'accueil),
  // window.print() lancé automatiquement ne fait souvent rien : on affiche donc d'abord le document
  // à l'écran, avec un bouton « Imprimer » qui lance l'impression directement depuis le toucher.
  if (matchMedia('(pointer: coarse)').matches || navigator.standalone) {
    openModal({
      title: 'Aperçu',
      body: `<div class="print-preview ${cls}">${html}</div>`,
      foot: `<button class="btn" data-close>Fermer</button><button class="btn btn-primary" id="pp-print">${icon('file')}Imprimer / PDF</button>`,
      onMount: r => { $('#pp-print', r).onclick = () => window.print(); onPreview?.(r); },
    });
    return;
  }
  setTimeout(() => window.print(), 60);
}

/* Export tableur de la liste des membres affichée (filtre + recherche) */
export async function exportMembersXlsx(rows, label, balance, btn) {
  const html = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.textContent = 'Préparation…'; }
  try {
    const XLSX = await import(XLSX_URL);
    const yn = v => v ? 'Oui' : 'Non';
    const d = v => v ? new Date(v + 'T12:00:00').toLocaleDateString('fr-FR') : '';
    const sorted = rows.slice().sort((a, b) => (a.last_name || '').localeCompare(b.last_name || '', 'fr') || (a.first_name || '').localeCompare(b.first_name || '', 'fr'));
    const data = sorted.map(m => {
      const age = ageOf(m.birth_date);
      const r = {
        'Nom': (m.last_name || '').toUpperCase(), 'Prénom': m.first_name || '', 'Genre': m.gender || '',
        'Date de naissance': d(m.birth_date), 'Âge': age ?? '', 'Adresse': m.address || '',
        'E-mail': m.email || m.guardian_email || '', 'Téléphone': m.phone || m.guardian_phone || '',
        'Discipline': m.discipline_id ? discName(m.discipline_id) : '', 'Niveau': m.level_id ? levelName(m.level_id) : '',
        'Statut': m.status === 'actif' ? 'Actif' : 'Inactif', 'Date d’inscription': d(m.registration_date),
        'Taille T-shirt': m.tshirt_size || '',
        'T-shirt remis le': m.tshirt_given_at ? fmtDate(m.tshirt_given_at) : '',
        'Certificat médical / QSS': m.medical_certificate ? 'Certificat' : m.qss ? 'QSS' : 'Manquant',
        'Droit à l’image': yn(m.consent_image),
        'Contact d’urgence': m.emergency_contact || '', 'Tél. urgence': m.emergency_phone || '',
        'Responsable légal (mineurs)': age != null && age < 18 ? m.guardian_name || '' : '',
      };
      if (balance) { r['Cotisation'] = m.fee_type || ''; r['Montant cotisation (€)'] = m.fee_amount != null ? Number(m.fee_amount) : ''; r['Reste à payer (€)'] = Math.max(0, balance(m)); }
      return r;
    });
    const keys = [...new Set(data.flatMap(r => Object.keys(r)))];
    const ws = XLSX.utils.json_to_sheet(data, { header: keys });
    ws['!cols'] = keys.map(k => ({ wch: Math.min(40, Math.max(k.length, ...data.map(r => String(r[k] ?? '').length)) + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Membres');
    const slug = label.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\w]+/g, '-').toLowerCase();
    const saved = await saveFile(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: XLSX_MIME }), `Membres-${slug}-${isoDay(new Date())}.xlsx`);
    if (saved) toast(`${rows.length} membre${rows.length > 1 ? 's' : ''} exporté${rows.length > 1 ? 's' : ''}`);
  } catch (e) { fail(e); }
  if (btn) { btn.disabled = false; btn.innerHTML = html; }
}

export function printTshirtList(rows, label, onChange = null) {
  // Colonne « Remis » : vraie case à cocher dans l'aperçu (téléphone) une fois migration-12.sql exécuté
  const canTick = rows.length > 0 && 'tshirt_given_at' in rows[0];
  const given = m => m.tshirt_given_at ? fmtDate(m.tshirt_given_at) : '';
  const tick = m => canTick ? `<label class="ts-tick"><input type="checkbox" data-tsg="${m.id}" ${m.tshirt_given_at ? 'checked' : ''}><span class="small" data-tsd="${m.id}">${given(m)}</span></label>` : '☐';
  const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
  const count = {};
  rows.forEach(m => { const k = m.tshirt_size || 'Non renseignée'; count[k] = (count[k] || 0) + 1; });
  const keys = [...SIZES.filter(k => count[k]), ...Object.keys(count).filter(k => !SIZES.includes(k) && k !== 'Non renseignée'), ...(count['Non renseignée'] ? ['Non renseignée'] : [])];
  const sorted = rows.slice().sort((a, b) => (a.last_name || '').localeCompare(b.last_name || '', 'fr') || (a.first_name || '').localeCompare(b.first_name || '', 'fr'));
  printDoc(`
    <h1>${esc(S.settings?.club_name || 'Club')}</h1>
    <p class="muted">Liste des membres et tailles de T-shirt — ${esc(label)} · ${rows.length} membre${rows.length > 1 ? 's' : ''} · édité le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    <h2 class="section-title mt">Récapitulatif par taille</h2>
    <table class="table" style="width:auto"><thead><tr>${keys.map(k => `<th style="text-align:center">${esc(k)}</th>`).join('')}<th style="text-align:center">Total</th></tr></thead>
      <tbody><tr>${keys.map(k => `<td style="text-align:center">${count[k]}</td>`).join('')}<td style="text-align:center"><strong>${rows.length}</strong></td></tr></tbody></table>
    <h2 class="section-title mt">Détail</h2>
    <table class="table"><thead><tr><th style="width:28px">#</th><th>Nom</th><th>Prénom</th><th>Taille T-shirt</th><th style="width:90px">Remis</th></tr></thead><tbody>
      ${sorted.map((m, i) => `<tr><td>${i + 1}</td><td>${esc((m.last_name || '').toUpperCase())}</td><td>${esc(m.first_name || '')}</td><td><strong>${esc(m.tshirt_size || '—')}</strong></td><td>${tick(m)}</td></tr>`).join('')}
    </tbody></table>`, '', root => {
    if (!canTick) return;
    $$('[data-tsg]', root).forEach(cb => cb.onchange = async () => {
      const m = rows.find(x => x.id === cb.dataset.tsg);
      const value = cb.checked ? isoDay(new Date()) : null;
      cb.disabled = true;
      const { error } = await sb.from('members').update({ tshirt_given_at: value }).eq('id', m.id);
      cb.disabled = false;
      if (error) { cb.checked = !cb.checked; return fail(error); }
      m.tshirt_given_at = value;
      // même état dans la version imprimée
      $$(`[data-tsg="${m.id}"]`).forEach(x => { x.checked = !!value; });
      $$(`[data-tsd="${m.id}"]`).forEach(x => { x.textContent = given(m); });
      toast(value ? `T-shirt remis à ${fullName(m)}` : `Remise annulée pour ${fullName(m)}`);
      onChange?.();
    });
  });
}

export function printAttestation(m, pays, season) {
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

export async function printAgReport({ sessions, rows, avgPresent, avgRate, cats }) {
  const season = activeSeason(), s = S.settings || {};
  const [{ data: all, error }, D, { data: allPays }, { data: allStages }] = await Promise.all([
    sb.from('members').select('*'), loadAccounting(),
    sb.from('payments').select('season_id, member_id, payment_type, status').eq('archived', false),
    sb.from('stages').select('*').order('stage_date'),
  ]);
  if (error) throw error;
  // Évolution : adhérents ayant une cotisation enregistrée, saison par saison
  const seasonsSorted = S.seasons.slice().sort((a, b) => seasonStart(a).localeCompare(seasonStart(b)));
  const evo = seasonsSorted.map(se => {
    const ids = new Set((allPays || []).filter(p => p.season_id === se.id && p.member_id && /cotis|adh[ée]sion|licence/i.test(p.payment_type || '')).map(p => p.member_id));
    return { se, n: ids.size };
  }).filter(x => x.n > 0 || x.se.id === season?.id);
  const cur = evo.find(x => x.se.id === season?.id);
  if (cur) cur.n = Math.max(cur.n, all.filter(m => m.status === 'actif').length);
  const evoHtml = evo.length > 1 ? `<h2 class="section-title mt">Évolution des effectifs</h2>
    <table class="table"><thead><tr><th>Saison</th><th style="text-align:right">Adhérents</th><th style="text-align:right">Évolution</th></tr></thead><tbody>
      ${evo.map((x, i) => { const prev = evo[i - 1]; const diff = prev ? x.n - prev.n : null;
        return `<tr><td>${esc(x.se.label)}${x.se.id === season?.id ? ' (en cours)' : ''}</td><td style="text-align:right"><strong>${x.n}</strong></td><td style="text-align:right">${diff == null ? '—' : (diff > 0 ? '+' : '') + diff + (prev.n ? ` (${diff > 0 ? '+' : ''}${Math.round(diff / prev.n * 100)} %)` : '')}</td></tr>`; }).join('')}
    </tbody></table><p class="small muted">Saisons passées : adhérents ayant réglé une cotisation. Saison en cours : adhérents actifs.</p>` : '';
  // Stages de la saison (du 1er août au 31 juillet)
  const sStart = season ? seasonStart(season) : null;
  const sEnd = sStart ? `${Number(sStart.slice(0, 4)) + 1}-07-31` : null;
  const stagesSeason = (allStages || []).filter(st => !sStart || (st.stage_date >= sStart && st.stage_date <= sEnd));
  const stagesHtml = `<h2 class="section-title mt">Stages${season ? ' de la saison' : ''} (${stagesSeason.length})</h2>` + (stagesSeason.length
    ? `<table class="table"><thead><tr><th>Date</th><th>Stage</th><th>Lieu</th><th>Public</th></tr></thead><tbody>
        ${stagesSeason.map(st => `<tr><td>${fmtDate(st.stage_date)}</td><td>${esc(st.title)}</td><td>${esc(st.place || '')}</td><td>${esc(st.audience || '')}</td></tr>`).join('')}
      </tbody></table>`
    : '<p class="muted">Aucun stage enregistré sur la période.</p>');
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
    ${evoHtml}
    ${stagesHtml}
    <h2 class="section-title mt">Bilan financier</h2>
    ${bilanHtml(D)}
  `);
}
