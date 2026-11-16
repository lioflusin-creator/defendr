// Defendr — Membres
import { $, $$, S, activeSeason, ageOf, closeModal, confirmBox, discName, esc, fail, fmtDate, fmtDay, fmtMoney, fullName, icon, initials, isAdmin, isBirthdayMonth, isoDay, levelName, openModal, readForm, sb, toast, waLink } from './core.js';
import { go, head, route } from './shell.js';
import { hasHealthDoc, healthBadge, memberIssues, reminderLink } from './dashboard.js';
import { bindHealthFiles, healthFileButtons, openRegistrations, renewalPhone } from './inscriptions.js';
import { dropoutInfo, dropoutText, memberAttendance } from './planning.js';
import { waUrl } from './whatsapp.js';
import { gradeEntryForm, nextLevel, promoteForm } from './grades.js';
import { exportMembersXlsx, printAttestation, printTshirtList } from './print.js';
import { METHODS, paymentForm } from './compta.js';

/* =====================================================================
   Membres
   ===================================================================== */
export async function viewMembers(view) {
  const season = activeSeason();
  const [mr, pr] = await Promise.all([
    sb.from('members').select('*').order('last_name'),
    isAdmin() ? (season ? sb.from('payments').select('member_id, amount, status').eq('season_id', season.id) : sb.from('payments').select('member_id, amount, status')) : null,
  ]);
  if (mr.error) throw mr.error;
  if (pr?.error) throw pr.error;
  const members = mr.data;
  // Décrocheurs (absents depuis 3 semaines) : calculé à part, la liste s'affiche sans l'attendre
  let dropouts = null;
  const paidBy = {};
  (pr?.data || []).filter(p => p.status === 'payé').forEach(p => { paidBy[p.member_id] = (paidBy[p.member_id] || 0) + Number(p.amount); });
  const balance = m => Number(m.fee_amount || 0) - (paidBy[m.id] || 0);
  // Colonne « T-shirt remis » présente une fois migration-12.sql exécuté
  const hasTshirtCol = !members.length || 'tshirt_given_at' in members[0];

  const filters = [
    { k: 'tous', label: 'Tous', fn: () => true },
    { k: 'actifs', label: 'Actifs', fn: m => m.status === 'actif' },
    ...(isAdmin() ? [{ k: 'impayes', label: 'Soldes impayés', fn: m => m.status === 'actif' && balance(m) > 0 }] : []),
    { k: 'relancer', label: 'À relancer', fn: m => memberIssues(m).length > 0 },
    { k: 'certificat', label: 'Certificat / QSS manquant', fn: m => m.status === 'actif' && !hasHealthDoc(m) },
    { k: 'anniversaires', label: 'Anniversaires du mois', fn: m => isBirthdayMonth(m.birth_date) },
    { k: 'absents', label: 'Absents depuis 3 semaines', fn: m => !!dropouts?.[m.id] },
    ...(hasTshirtCol ? [{ k: 'tshirt', label: 'T-shirt à remettre', fn: m => m.status === 'actif' && !m.tshirt_given_at }] : []),
    { k: 'inactifs', label: 'Inactifs', fn: m => m.status === 'inactif' },
  ];
  if (!filters.find(f => f.k === S.memberFilter)) S.memberFilter = 'tous';

  view.innerHTML = head('Membres', `${members.filter(m => m.status === 'actif').length} membres actifs · ${members.length} inscrits`,
    `${window.DEFENDR_DEMO ? '' : `<button class="btn" id="print-tshirts">${icon('file')}Imprimer (T-shirts)</button>`}<button class="btn" id="export-members">${icon('file')}Exporter (Excel)</button><button class="btn btn-primary" id="new-member">${icon('plus')}Nouveau membre</button>`) + `
    <div id="reg-banner"></div>
    <div class="toolbar">
      <input class="input" type="search" id="m-search" placeholder="Rechercher un membre…" value="${esc(S.memberSearch)}" aria-label="Rechercher un membre">
      <div class="chips">${filters.map(f => `<button class="chip ${S.memberFilter === f.k ? 'active' : ''}" data-f="${f.k}">${esc(f.label)} <span class="n">${members.filter(f.fn).length}</span></button>`).join('')}</div>
    </div>
    <div class="card" id="m-list"></div>`;

  let shownRows = [];
  const draw = () => {
    const q = S.memberSearch.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const f = filters.find(x => x.k === S.memberFilter);
    const rows = members.filter(f.fn).filter(m => !q || [fullName(m), m.email, m.phone].join(' ').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').includes(q));
    shownRows = rows;
    const box = $('#m-list');
    if (S.memberFilter === 'absents' && !dropouts) { box.innerHTML = '<div class="empty">Calcul des présences…</div>'; return; }
    if (!rows.length) { box.innerHTML = `<div class="empty">${members.length ? 'Aucun membre ne correspond.' : 'Aucun membre pour l’instant. Ajoutez le premier avec « Nouveau membre ».'}</div>`; return; }
    const statusBadge = m => m.status === 'actif' ? '<span class="badge ok">Actif</span>' : '<span class="badge">Inactif</span>';
    const tsMode = S.memberFilter === 'tshirt';
    const abMode = S.memberFilter === 'absents';
    const abInfo = m => { const d = dropouts?.[m.id]; return d ? (d.lastSeen ? `Dernière venue le ${fmtDate(d.lastSeen)}` : 'Pas venu(e) depuis plus de 4 mois') + ` · ${d.missed} séance${d.missed > 1 ? 's' : ''} manquée${d.missed > 1 ? 's' : ''}` : ''; };
    const abBtn = m => { const u = waUrl(renewalPhone(m), dropoutText(m)); return u && renewalPhone(m) ? `<a class="btn btn-sm btn-primary" data-ab href="${esc(u)}" target="_blank" rel="noopener">${icon('chat')}Relancer</a>` : '<span class="small muted">Pas de numéro</span>'; };
    const tsBtn = m => `<button class="btn btn-sm btn-primary" data-ts="${m.id}">${icon('check')}${esc(m.tshirt_size || 'Taille ?')} · Remis</button>`;
    box.innerHTML = `
      ${tsMode ? '<div class="small muted" style="padding:12px 16px 0">Touchez « Remis » quand vous donnez son T-shirt à un membre : il disparaît de cette liste.</div>' : ''}
      ${abMode ? '<div class="small muted" style="padding:12px 16px 0">Membres actifs pas venus depuis au moins 3 semaines, alors que l’appel a été fait à 3 séances ou plus depuis. « Relancer » ouvre WhatsApp avec un message prêt (au responsable légal pour un mineur).</div>' : ''}
      <div class="table-wrap only-desktop"><table class="table"><thead><tr><th>Nom</th><th>Contact</th><th>Discipline</th><th>Niveau</th><th>Santé</th>${isAdmin() ? '<th>Solde</th>' : ''}<th>Statut</th>${tsMode ? '<th>T-shirt</th>' : ''}${abMode ? '<th>Absence</th>' : ''}</tr></thead><tbody>
        ${rows.map(m => `<tr class="clickable" data-id="${m.id}">
          <td><div class="person"><div class="avatar">${esc(initials(m))}</div><div><div class="name">${esc(fullName(m))}</div>${m.birth_date ? `<div class="meta">${ageOf(m.birth_date)} ans</div>` : ''}</div></div></td>
          <td class="small">${esc(m.phone || '')}<div class="muted">${esc(m.email || '')}</div></td>
          <td>${esc(discName(m.discipline_id))}</td><td>${esc(levelName(m.level_id))}</td>
          <td>${healthBadge(m)}</td>
          ${isAdmin() ? `<td>${balance(m) > 0 ? `<span class="badge danger">${fmtMoney(balance(m))}</span>` : '<span class="badge ok">À jour</span>'}</td>` : ''}
          <td>${statusBadge(m)}</td>${tsMode ? `<td>${tsBtn(m)}</td>` : ''}${abMode ? `<td><div class="small muted mb">${abInfo(m)}</div>${abBtn(m)}</td>` : ''}</tr>`).join('')}
      </tbody></table></div>
      <div class="list only-mobile">${rows.map(m => `<div class="list-item" data-id="${m.id}">
          <div class="avatar">${esc(initials(m))}</div>
          <div class="grow"><div style="font-weight:600">${esc(fullName(m))}</div><div class="small muted">${abMode ? abInfo(m) : `${esc(discName(m.discipline_id))} · ${esc(levelName(m.level_id))}`}</div></div>
          <div class="right">${abMode ? abBtn(m) : tsMode ? tsBtn(m) : `${m.status !== 'actif' ? statusBadge(m) : (!hasHealthDoc(m) ? healthBadge(m, true) : '')}${isAdmin() && balance(m) > 0 ? `<span class="badge danger">${fmtMoney(balance(m))}</span>` : ''}`}</div>
        </div>`).join('')}</div>`;
    $$('[data-id]', box).forEach(r => r.onclick = () => go('/membres/' + r.dataset.id));
    $$('[data-ab]', box).forEach(a => a.addEventListener('click', e => e.stopPropagation()));
    $$('[data-ts]', box).forEach(b => b.onclick = async e => {
      e.stopPropagation();
      const m = members.find(x => x.id === b.dataset.ts);
      b.disabled = true;
      const day = isoDay(new Date());
      const { error } = await sb.from('members').update({ tshirt_given_at: day }).eq('id', m.id);
      if (error) { b.disabled = false; return fail(error); }
      m.tshirt_given_at = day;
      toast(`T-shirt remis à ${fullName(m)}`);
      $$('[data-f]', view).forEach(c => { const f = filters.find(x => x.k === c.dataset.f); if (f) $('.n', c).textContent = members.filter(f.fn).length; });
      draw();
    });
  };
  draw();
  dropoutInfo(members).then(d => {
    dropouts = d;
    if (!view.isConnected) return;
    $$('[data-f]', view).forEach(c => { const x = filters.find(y => y.k === c.dataset.f); if (x) $('.n', c).textContent = members.filter(x.fn).length; });
    if (S.memberFilter === 'absents') draw();
  }).catch(e => console.error(e));
  $('#m-search').oninput = e => { S.memberSearch = e.target.value; draw(); };
  $$('[data-f]', view).forEach(b => b.onclick = () => { S.memberFilter = b.dataset.f; $$('[data-f]', view).forEach(x => x.classList.toggle('active', x === b)); draw(); });
  $('#new-member').onclick = () => memberForm(null, id => go('/membres/' + id));
  if ($('#print-tshirts')) $('#print-tshirts').onclick = () => {
    if (!shownRows.length) return toast('Aucun membre à imprimer');
    const f = filters.find(x => x.k === S.memberFilter);
    printTshirtList(shownRows, f.label + (S.memberSearch ? ` · recherche « ${S.memberSearch} »` : ''), () => {
      $$('[data-f]', view).forEach(c => { const x = filters.find(y => y.k === c.dataset.f); if (x) $('.n', c).textContent = members.filter(x.fn).length; });
      draw();
    });
  };
  $('#export-members').onclick = () => {
    if (!shownRows.length) return toast('Aucun membre à exporter');
    exportMembersXlsx(shownRows, filters.find(x => x.k === S.memberFilter).label, isAdmin() ? balance : null, $('#export-members'));
  };
  sb.from('registrations').select('id', { count: 'exact', head: true }).eq('status', 'nouvelle').then(({ count }) => {
    if (!count || !$('#reg-banner')) return;
    $('#reg-banner').innerHTML = `<div class="alert info row between wrap" style="gap:8px"><span><strong>${count} demande${count > 1 ? 's' : ''} d’inscription en ligne</strong> à traiter.</span><button class="btn btn-sm btn-primary" id="open-regs">Voir</button></div>`;
    $('#open-regs').onclick = openRegistrations;
  });
}

export function feeOptions() {
  const s = S.settings || {};
  return [
    ['Nouvel adhérent(e)', s.fee_new], ['Ancien(ne) adhérent(e)', s.fee_returning],
    ['Demandeur(se) d’emploi', s.fee_jobseeker], ['Étudiant(e)', s.fee_student], ['Autre', null],
  ];
}

export function memberForm(m, onSaved, prefill = {}) {
  const v = m || { status: 'actif', member_role: 'membre', registration_date: new Date().toISOString().slice(0, 10), ...prefill };
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

export const defaultPayType = () => { const t = S.settings?.revenue_types || []; return t.includes('Cotisation annuelle') ? 'Cotisation annuelle' : (t[0] || 'Cotisation annuelle'); };

// Règlements de la saison, affichés et saisis directement dans la fiche du membre.
// Membre existant : chaque règlement est enregistré tout de suite.
// Nouveau membre : les règlements sont gardés en attente et enregistrés avec la fiche.
export function memberPaymentsBox(m, box, feeValue) {
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

export async function viewMember(view, id) {
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
        <dt>T-shirt</dt><dd>${esc(m.tshirt_size || '—')}${'tshirt_given_at' in m ? ` · ${m.tshirt_given_at ? `<span class="badge ok">Remis le ${fmtDate(m.tshirt_given_at)}</span>` : '<span class="badge warn">Pas encore remis</span>'} <button class="btn btn-sm" id="ts-toggle" style="margin-left:4px">${m.tshirt_given_at ? 'Annuler' : 'Marquer remis'}</button>` : ''}</dd><dt>Cotisation</dt><dd>${esc(m.fee_type || '—')}${m.fee_amount != null ? ' · ' + fmtMoney(m.fee_amount) : ''}</dd>
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
  $('#ts-toggle') && ($('#ts-toggle').onclick = async () => {
    const { error } = await sb.from('members').update({ tshirt_given_at: m.tshirt_given_at ? null : isoDay(new Date()) }).eq('id', m.id);
    if (error) return fail(error);
    toast(m.tshirt_given_at ? 'Remise du T-shirt annulée' : 'T-shirt noté comme remis'); route();
  });
  $$('[data-pay]', view).forEach(r => r.onclick = () => paymentForm(seasonPays.find(p => p.id === r.dataset.pay)));
  $('#del').onclick = async () => {
    if (!await confirmBox('Supprimer le membre', `Supprimer définitivement <strong>${esc(fullName(m))}</strong> ? Ses présences seront aussi supprimées. Pour un membre qui arrête, préférez le statut « Inactif ».`)) return;
    const { error } = await sb.from('members').delete().eq('id', m.id);
    if (error) return fail(error);
    toast('Membre supprimé'); go('/membres');
  };
}
