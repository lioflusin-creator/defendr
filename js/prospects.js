// Defendr — Prospects
import { $, $$, S, addDays, closeModal, confirmBox, esc, fail, fmtDate, fullName, hhmm, icon, initials, isoDay, longDay, openModal, parseDay, sb, toast, waLink } from './core.js';
import { currentPath, go, head, loadRefs, route } from './shell.js';
import { memberForm } from './members.js';
import { registrationUrl } from './inscriptions.js';
import { waUrl } from './whatsapp.js';

/* =====================================================================
   Prospects : personnes invitées à s'inscrire ou saisies à la main
   ===================================================================== */
export const PROSPECT_STATUS = { a_contacter: 'À contacter', invite: 'Invité(e)', essai: 'Cours d’essai', inscrit: 'Inscrit(e)', abandon: 'Sans suite' };
export const FOLLOW_UP_DAYS = 7; // délai avant de proposer une relance
export const daysSince = d => d ? Math.floor((Date.now() - new Date(d)) / 86400000) : null;
// À relancer : invité(e) il y a plus d'une semaine, ou venu(e) à l'essai sans s'inscrire depuis
export const needsFollowUp = p => (p.status === 'invite' && daysSince(p.invited_at) >= FOLLOW_UP_DAYS) || (p.status === 'essai' && p.trial_date && p.trial_date < isoDay(addDays(new Date(), -1)));
export const trialRow = p => `<label class="att-row ${p.trial_present ? 'on' : ''}" data-p="${p.id}"><input type="checkbox" ${p.trial_present ? 'checked' : ''} aria-label="${esc(fullName(p))} venu(e) à l’essai">
  <span class="avatar">${esc(initials(p))}</span><span class="grow"><span class="att-name">${esc(fullName(p))}</span><span class="small muted">Cours d’essai</span></span><span class="att-state">${p.trial_present ? 'Venu(e)' : 'Attendu(e)'}</span></label>`;
export const PROSPECT_SOURCE = { manuel: 'Saisi à la main', lien: 'Lien d’inscription', pdf: 'Dossier PDF' };
export const phoneKey = p => { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('33') && d.length === 11 ? '0' + d.slice(2) : d; };
export const inviteText = p => p?.status === 'essai' && p.trial_present
  ? `Bonjour ${p.first_name},\n\nmerci d’être venu(e) au cours d’essai du ${S.settings?.club_name || 'club'} ! Si tu veux continuer avec nous, remplis ta fiche d’inscription ici : ${registrationUrl()}\n\nÀ très vite sur le tatami !`
  : `Bonjour${p?.first_name ? ' ' + p.first_name : ''},\n\npour t’inscrire au ${S.settings?.club_name || 'club'}, remplis ta fiche ici : ${registrationUrl()}\n\nÀ très vite sur le tatami !`;
export const prospectsMissing = e => /prospects|schema cache|does not exist|42P01|PGRST205/i.test(`${e?.code || ''} ${e?.message || ''}`);

// Enregistre (ou met à jour, même numéro) la personne invitée. Tourne en arrière-plan : WhatsApp s'ouvre sans attendre.
export async function saveProspectInvite(p, source) {
  const now = new Date().toISOString();
  try {
    const key = phoneKey(p.phone);
    let existing = null;
    if (key) { const { data, error } = await sb.from('prospects').select('id, phone, status'); if (error) throw error; existing = data.find(x => phoneKey(x.phone) === key); }
    const { error } = existing
      ? await sb.from('prospects').update({ invited_at: now, ...(existing.status === 'inscrit' ? {} : { status: 'invite' }) }).eq('id', existing.id)
      : await sb.from('prospects').insert({ first_name: p.first_name, last_name: p.last_name || null, phone: p.phone || null, email: p.email || null, source, status: 'invite', invited_at: now });
    if (error) throw error;
    toast(existing ? `${p.first_name} : invitation notée dans les Prospects` : `${p.first_name} ajouté(e) aux Prospects`);
  } catch (e) {
    toast(prospectsMissing(e) ? 'Invitation envoyée, mais la rubrique Prospects n’est pas activée (migration-9.sql).' : 'Invitation envoyée, mais la personne n’a pas pu être ajoutée aux Prospects.', 'error');
  }
}
export async function markProspectRegistered(phone, memberId) {
  const key = phoneKey(phone); if (!key) return;
  const { data } = await sb.from('prospects').select('*');
  const p = (data || []).find(x => phoneKey(x.phone) === key && !x.member_id);
  if (p) await linkProspectToMember(p, memberId);
}
// Le prospect devient membre : statut, date, et sa présence au cours d'essai passe sur sa fiche
export async function linkProspectToMember(p, memberId) {
  const { error } = await sb.from('prospects').update({ status: 'inscrit', member_id: memberId, converted_at: new Date().toISOString() }).eq('id', p.id);
  if (error) await sb.from('prospects').update({ status: 'inscrit', member_id: memberId }).eq('id', p.id); // avant migration-10.sql
  if (p.trial_present && p.trial_course_id) await sb.from('attendances').upsert({ course_id: p.trial_course_id, member_id: memberId, present: true }, { onConflict: 'course_id,member_id' });
}

// Encadré du tableau de bord : prospects à relancer et cours d'essai du jour
export async function dashProspects() {
  const { data, error } = await sb.from('prospects').select('id, first_name, last_name, status, invited_at, trial_date');
  const box = $('#dash-prospects'); if (error || !box) return;
  const todo = data.filter(needsFollowUp), today = isoDay(new Date());
  const trials = data.filter(p => p.status === 'essai' && p.trial_date === today);
  box.innerHTML = [
    todo.length && `<div class="alert info row between wrap" style="gap:8px"><span><strong>${todo.length} prospect${todo.length > 1 ? 's' : ''} à relancer</strong> : invité${todo.length > 1 ? 's' : ''} depuis plus de ${FOLLOW_UP_DAYS} jours ou venu${todo.length > 1 ? 's' : ''} à l’essai sans inscription (${esc(todo.slice(0, 3).map(fullName).join(', '))}${todo.length > 3 ? '…' : ''}).</span><button class="btn btn-sm btn-primary" id="dash-relance">Voir</button></div>`,
    trials.length && `<div class="alert info row between wrap" style="gap:8px"><span><strong>Cours d’essai aujourd’hui</strong> : ${esc(trials.map(fullName).join(', '))}. Cochez leur présence dans l’appel.</span></div>`,
  ].filter(Boolean).join('');
  $('#dash-relance') && ($('#dash-relance').onclick = () => { S.prospectFilter = 'relancer'; go('/prospects'); });
}

// Planifier un cours d'essai, puis prévenir la personne
export async function trialForm(p) {
  const { data: next } = await sb.from('courses').select('id, title, course_date, start_time, room').gte('course_date', isoDay(new Date())).order('course_date').order('start_time').limit(12);
  const label = c => `${parseDay(c.course_date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}${c.start_time ? ' · ' + hhmm(c.start_time) : ''} · ${c.title}`;
  openModal({
    title: `Cours d’essai de ${esc(p.first_name)}`, size: 'sm',
    body: `<form id="tf">
      ${(next || []).length ? `<div class="field"><label for="tf-c">Séance</label><select class="input" id="tf-c" name="course"><option value="">Autre date…</option>${next.map(c => `<option value="${c.id}" ${p.trial_course_id === c.id ? 'selected' : ''}>${esc(label(c))}</option>`).join('')}</select></div>` : ''}
      <div class="field" id="tf-d-f"><label for="tf-d">Date</label><input class="input" id="tf-d" name="date" type="date" value="${esc(p.trial_date || '')}"></div>
      <div id="tf-msg"></div></form>`,
    foot: `<button class="btn" data-close>Fermer</button><button class="btn btn-primary" id="tf-save">Enregistrer</button><a class="btn btn-primary" id="tf-wa" href="#" target="_blank" rel="noopener" hidden>${icon('chat')}Prévenir sur WhatsApp</a>`,
    onMount: root => {
      const f = $('#tf', root), sel = f.course;
      const sync = () => { $('#tf-d-f', root).hidden = !!sel?.value; };
      if (sel) { if (!sel.value && !p.trial_date && next.length) sel.value = next[0].id; sel.onchange = sync; sync(); }
      $('#tf-save', root).onclick = async () => {
        const c = sel?.value ? next.find(x => x.id === sel.value) : null, date = c ? c.course_date : f.date.value;
        if (!date) return toast('Choisissez une séance ou une date.', 'error');
        const { error } = await sb.from('prospects').update({ trial_date: date, trial_course_id: c?.id || null, trial_present: false, ...(p.status === 'inscrit' ? {} : { status: 'essai' }) }).eq('id', p.id);
        if (error) return fail(error);
        toast('Cours d’essai enregistré');
        const when = `${longDay(date)}${c?.start_time ? ' à ' + hhmm(c.start_time).replace(':', 'h') : ''}${c?.room ? ' (' + c.room + ')' : ''}`;
        const text = `Bonjour ${p.first_name},\n\nje te confirme ton cours d’essai au ${S.settings?.club_name || 'club'} le ${when}. Prévois une tenue de sport confortable et une bouteille d’eau.\n\nÀ très vite sur le tatami !`;
        const wa = $('#tf-wa', root);
        if (p.phone && waLink(p.phone)) { wa.href = waUrl(p.phone, text); wa.hidden = false; $('#tf-save', root).hidden = true; wa.onclick = () => setTimeout(() => { closeModal(); route(); }, 300); $('#tf-msg', root).innerHTML = '<div class="alert info" style="margin:0">Cours d’essai enregistré. Vous pouvez prévenir la personne.</div>'; }
        else { closeModal(); route(); }
      };
    },
  });
}

// Invitation à l'inscription en ligne : la fiche prospect est créée au moment de l'envoi
export function inviteForm(p = null) {
  openModal({
    title: p ? `Inviter ${esc(p.first_name)}` : 'Inviter une personne', size: 'sm',
    body: `<form id="iv-f"><p class="small muted" style="margin-top:0">La personne reçoit sur WhatsApp le lien d’inscription en ligne et apparaît dans les Prospects.</p>
      <div class="form-grid"><div class="field"><label for="iv-fn">Prénom *</label><input class="input" id="iv-fn" name="first_name" value="${esc(p?.first_name || '')}" autocomplete="off"></div>
      <div class="field"><label for="iv-ln">Nom</label><input class="input" id="iv-ln" name="last_name" value="${esc(p?.last_name || '')}" autocomplete="off"></div></div>
      <div class="field"><label for="iv-ph">Téléphone WhatsApp *</label><input class="input" id="iv-ph" name="phone" type="tel" value="${esc(p?.phone || '')}" placeholder="06 12 34 56 78" autocomplete="off"></div>
      <div class="field"><label for="iv-msg">Message</label><textarea class="input" id="iv-msg" name="message" rows="5">${esc(inviteText(p))}</textarea></div></form>`,
    foot: `<button class="btn" data-close>Annuler</button><a class="btn btn-primary" id="iv-send" href="#" target="_blank" rel="noopener">${icon('chat')}Envoyer sur WhatsApp</a>`,
    onMount: root => {
      const f = $('#iv-f', root), send = $('#iv-send', root);
      let touched = false;
      f.message.oninput = () => { touched = true; refresh(); };
      const refresh = () => {
        if (!touched) f.message.value = inviteText({ ...(p || {}), first_name: f.first_name.value.trim() });
        send.href = waUrl(f.phone.value.trim(), f.message.value) || '#';
      };
      f.first_name.oninput = f.last_name.oninput = f.phone.oninput = refresh; refresh();
      send.onclick = e => {
        const d = { first_name: f.first_name.value.trim(), last_name: f.last_name.value.trim(), phone: f.phone.value.trim() };
        if (!d.first_name || phoneKey(d.phone).length < 9) { e.preventDefault(); return toast('Indiquez le prénom et un numéro de téléphone.', 'error'); }
        const done = p ? sb.from('prospects').update({ ...d, last_name: d.last_name || null, invited_at: new Date().toISOString(), ...(['inscrit', 'essai'].includes(p.status) ? {} : { status: 'invite' }) }).eq('id', p.id)
          .then(({ error }) => { if (error) throw error; toast('Invitation notée'); }).catch(fail) : saveProspectInvite(d, 'lien');
        setTimeout(() => { closeModal(); if (currentPath() === '/prospects') done.then(route); }, 300);
      };
    },
  });
}

export function prospectForm(p, onSaved) {
  const v = p || { status: 'a_contacter', source: 'manuel' };
  const sel = (name, opts) => `<select class="input" id="pf-${name}" name="${name}">${Object.entries(opts).map(([k, l]) => `<option value="${k}" ${v[name] === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  openModal({
    title: p ? 'Modifier le prospect' : 'Nouveau prospect',
    body: `<form id="pf" class="form-grid">
      <div class="field"><label for="pf-fn">Prénom *</label><input class="input" id="pf-fn" name="first_name" value="${esc(v.first_name || '')}"></div>
      <div class="field"><label for="pf-ln">Nom</label><input class="input" id="pf-ln" name="last_name" value="${esc(v.last_name || '')}"></div>
      <div class="field"><label for="pf-ph">Téléphone</label><input class="input" id="pf-ph" name="phone" type="tel" value="${esc(v.phone || '')}" placeholder="06 12 34 56 78"></div>
      <div class="field"><label for="pf-em">E-mail</label><input class="input" id="pf-em" name="email" type="email" value="${esc(v.email || '')}"></div>
      <div class="field"><label for="pf-status">Statut</label>${sel('status', PROSPECT_STATUS)}</div>
      <div class="field"><label for="pf-source">Origine</label>${sel('source', PROSPECT_SOURCE)}</div>
      <div class="field full"><label for="pf-notes">Notes</label><textarea class="input" id="pf-notes" name="notes" rows="3" placeholder="ex : vue au forum des associations, intéressée par le cours du jeudi">${esc(v.notes || '')}</textarea></div></form>`,
    foot: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="pf-save">Enregistrer</button>`,
    onMount: root => $('#pf-save', root).onclick = async () => {
      const f = $('#pf', root);
      const d = Object.fromEntries(['first_name', 'last_name', 'phone', 'email', 'status', 'source', 'notes'].map(k => [k, f[k].value.trim() || null]));
      if (!d.first_name) return toast('Le prénom est obligatoire.', 'error');
      const { error } = p ? await sb.from('prospects').update(d).eq('id', p.id) : await sb.from('prospects').insert(d);
      if (error) return fail(error);
      closeModal(); toast(p ? 'Prospect modifié' : 'Prospect ajouté'); onSaved?.();
    },
  });
}

S.prospectFilter = 'actifs'; S.prospectSearch = '';
export async function viewProspects(view) {
  await loadRefs();
  const [pr, rr] = await Promise.all([
    sb.from('prospects').select('*').order('created_at', { ascending: false }),
    sb.from('registrations').select('data').eq('status', 'nouvelle'),
  ]);
  if (pr.error) {
    if (!prospectsMissing(pr.error)) throw pr.error;
    view.innerHTML = head('Prospects') + `<div class="alert error">Pour activer cette rubrique, exécutez une fois le fichier <strong>migration-9.sql</strong> dans Supabase → Éditeur SQL.</div>`;
    return;
  }
  const list = pr.data;
  const pending = new Set((rr.data || []).map(r => phoneKey(r.data?.phone)).filter(Boolean));
  const filters = [
    { k: 'actifs', label: 'En cours', fn: p => ['a_contacter', 'invite', 'essai'].includes(p.status) },
    { k: 'relancer', label: 'À relancer', fn: needsFollowUp },
    { k: 'a_contacter', label: 'À contacter', fn: p => p.status === 'a_contacter' },
    { k: 'invite', label: 'Invités', fn: p => p.status === 'invite' },
    { k: 'essai', label: 'Cours d’essai', fn: p => p.status === 'essai' },
    { k: 'inscrit', label: 'Inscrits', fn: p => p.status === 'inscrit' },
    { k: 'abandon', label: 'Sans suite', fn: p => p.status === 'abandon' },
    { k: 'tous', label: 'Tous', fn: () => true },
  ];
  view.innerHTML = head('Prospects', 'Les personnes invitées à s’inscrire et celles que vous ajoutez à la main',
    `<button class="btn" id="pr-invite">${icon('chat')}Inviter</button><button class="btn btn-primary" id="pr-new">${icon('plus')}Nouveau prospect</button>`) + `
    <div class="toolbar">
      <input class="input" type="search" id="pr-search" placeholder="Rechercher un prospect…" value="${esc(S.prospectSearch)}" aria-label="Rechercher un prospect">
      <div class="chips">${filters.map(f => `<button class="chip ${S.prospectFilter === f.k ? 'active' : ''}" data-f="${f.k}">${esc(f.label)} <span class="n">${list.filter(f.fn).length}</span></button>`).join('')}</div>
    </div>
    <div class="card" id="pr-list"></div>`;
  const badge = p => `<span class="badge${p.status === 'inscrit' ? ' ok' : ''}">${esc(PROSPECT_STATUS[p.status] || p.status)}</span>${needsFollowUp(p) ? ' <span class="badge warn">À relancer</span>' : ''}`;
  const trialInfo = p => p.trial_date ? ` · essai le ${fmtDate(p.trial_date)}${p.trial_date <= isoDay(new Date()) ? (p.trial_present ? ' (venu·e)' : ' (pas venu·e)') : ''}` : '';
  const draw = () => {
    const norm = x => String(x || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const q = norm(S.prospectSearch), f = filters.find(x => x.k === S.prospectFilter) || filters[0];
    const rows = list.filter(f.fn).filter(p => !q || norm([fullName(p), p.phone, p.email, p.notes].join(' ')).includes(q));
    const box = $('#pr-list');
    if (!rows.length) { box.innerHTML = `<div class="empty">${list.length ? 'Aucun prospect ne correspond.' : 'Aucun prospect pour l’instant. Invitez quelqu’un depuis l’Inscription en ligne, ou ajoutez-le avec « Nouveau prospect ».'}</div>`; return; }
    box.innerHTML = rows.map(p => `<div class="bday" style="align-items:flex-start;flex-wrap:wrap;gap:10px;padding:12px 16px">
      <div class="person" style="flex:1;min-width:220px"><div class="avatar">${esc(initials(p))}</div><div style="min-width:0">
        <div class="name">${esc(fullName(p))} ${badge(p)}${pending.has(phoneKey(p.phone)) && p.status !== 'inscrit' ? ' <span class="badge ok">Demande reçue</span>' : ''}</div>
        <div class="meta">${[p.phone, p.email].filter(Boolean).map(esc).join(' · ') || 'Pas de coordonnées'}</div>
        <div class="meta">${esc(PROSPECT_SOURCE[p.source] || '')} · ajouté(e) le ${fmtDate(p.created_at.slice(0, 10))}${p.invited_at ? ` · invité(e) le ${fmtDate(p.invited_at.slice(0, 10))}` : ''}${trialInfo(p)}</div>
        ${p.notes ? `<div class="small" style="margin-top:4px;white-space:pre-line">${esc(p.notes)}</div>` : ''}</div></div>
      <div class="row wrap" style="gap:6px">
        ${p.member_id ? `<a class="btn btn-sm" href="#/membres/${p.member_id}">Voir la fiche</a>` : `${p.phone ? `<button class="btn btn-sm" data-inv="${p.id}">${icon('chat')}${p.invited_at || p.status === 'essai' ? 'Relancer' : 'Inviter'}</button>` : ''}<button class="btn btn-sm" data-trial="${p.id}">${icon('calendar')}Essai</button><button class="btn btn-sm" data-member="${p.id}">${icon('check')}Créer la fiche membre</button>`}
        <button class="icon-btn" data-edit="${p.id}" aria-label="Modifier">${icon('edit')}</button><button class="icon-btn" data-del="${p.id}" aria-label="Supprimer">${icon('trash')}</button>
      </div></div>`).join('');
  };
  draw();
  const byId = id => list.find(p => p.id === id);
  $('#pr-search').oninput = e => { S.prospectSearch = e.target.value; draw(); };
  $$('[data-f]', view).forEach(b => b.onclick = () => { S.prospectFilter = b.dataset.f; $$('[data-f]', view).forEach(x => x.classList.toggle('active', x === b)); draw(); });
  $('#pr-new').onclick = () => prospectForm(null, route);
  $('#pr-invite').onclick = () => inviteForm();
  $('#pr-list').onclick = async e => {
    const t = e.target.closest('[data-inv],[data-trial],[data-member],[data-edit],[data-del]'); if (!t) return;
    const p = byId(t.dataset.inv || t.dataset.trial || t.dataset.member || t.dataset.edit || t.dataset.del);
    if (t.dataset.inv) inviteForm(p);
    else if (t.dataset.trial) trialForm(p);
    else if (t.dataset.edit) prospectForm(p, route);
    else if (t.dataset.member) memberForm(null, async id => {
      await linkProspectToMember(p, id);
      go('/membres/' + id);
    }, { first_name: p.first_name, last_name: p.last_name || '', phone: p.phone || '', email: p.email || '' });
    else if (t.dataset.del) {
      if (!await confirmBox('Supprimer le prospect', `Supprimer ${esc(fullName(p))} des prospects ?`)) return;
      const { error } = await sb.from('prospects').delete().eq('id', p.id);
      if (error) return fail(error);
      toast('Prospect supprimé'); route();
    }
  };
}
