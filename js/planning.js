// Defendr — Planning et appel des présences
import { $, $$, DAYS, MONTHS, S, activeSeason, addDays, ageOf, closeModal, confirmBox, discName, esc, fail, fullName, hhmm, icon, initials, isAdmin, isoDay, levelName, longDay, mondayOf, openModal, parseDay, readForm, sb, toast } from './core.js';
import { currentPath, go, head, route } from './shell.js';
import { trialRow } from './prospects.js';

/* =====================================================================
   Planning & appel des présences
   ===================================================================== */
S.plan = { mode: window.innerWidth < 860 ? 'liste' : 'semaine', anchor: new Date() };

export async function fileHref(c) {
  if (!c.file_url) return null;
  if (!c.file_url.startsWith('storage:')) return c.file_url;
  const { data, error } = await sb.storage.from('cours').createSignedUrl(c.file_url.slice(8), 3600);
  return error ? null : data.signedUrl;
}
export const safeName = n => (n || 'fichier').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_');

/* Règle d'assiduité : on ne compte que les séances passées de la saison active
   où l'appel a été fait, et seulement à partir de la date d'inscription du membre. */
export async function seasonSessionsWithCall() {
  const season = activeSeason();
  let q = sb.from('courses').select('id, title, course_date, attendances(count)').lte('course_date', isoDay(new Date()));
  if (season) q = q.eq('season_id', season.id);
  const { data, error } = await q.order('course_date', { ascending: false });
  if (error) throw error;
  return data.filter(c => (c.attendances?.[0]?.count ?? 0) > 0);
}
export function attendanceLevel(rate) {
  const t = S.settings || {};
  if (rate >= (t.threshold_assidu ?? 70)) return ['Assidu', 'ok'];
  if (rate >= (t.threshold_regulier ?? 45)) return ['Régulier', 'accent'];
  if (rate >= (t.threshold_risque ?? 25)) return ['À risque', 'warn'];
  return ['Quasi-absent', 'danger'];
}
export function attendanceFor(m, sessions, presentIds) {
  // Point de départ : la date d'inscription (à défaut, la première présence).
  // Avant l'inscription, la personne ne pouvait pas venir : les séances manquées
  // ne comptent pas. Une présence antérieure (cours d'essai) compte en bonus,
  // sans faire entrer dans le calcul les séances qui la séparent de l'inscription.
  const firstPresent = sessions.filter(c => presentIds.has(c.id)).map(c => c.course_date).sort()[0];
  const start = m.registration_date || firstPresent;
  const list = sessions.filter(c => !start || c.course_date >= start || presentIds.has(c.id))
    .map(c => ({ ...c, present: presentIds.has(c.id) }));
  const present = list.filter(c => c.present).length;
  const rate = list.length ? Math.round(present / list.length * 100) : 0;
  const [label, cls] = attendanceLevel(rate);
  return { sessions: list, present, rate, label, cls };
}
export async function memberAttendance(m, presentIds) {
  return attendanceFor(m, await seasonSessionsWithCall(), presentIds);
}

/* Rapatrie une seule fois les fichiers de cours encore stockés chez Base44 */
export async function migrateBase44Files() {
  if (!isAdmin() || S.migrating) return;
  S.migrating = true;
  try {
    const { data } = await sb.from('courses').select('file_url, file_name').like('file_url', 'https://base44.app/%');
    const urls = [...new Map((data || []).map(c => [c.file_url, c.file_name])).entries()];
    let done = 0;
    for (const [url, name] of urls) {
      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.blob();
      const path = `base44/${url.split('/').pop().split('_')[0]}-${safeName(name)}`;
      const up = await sb.storage.from('cours').upload(path, blob, { upsert: true, contentType: blob.type || undefined });
      if (up.error) { console.error(up.error); continue; }
      const { error } = await sb.from('courses').update({ file_url: 'storage:' + path }).eq('file_url', url);
      if (!error) done++;
    }
    if (done) toast(`${done} fichier(s) de cours rapatrié(s) depuis Base44`);
  } catch (e) { console.error(e); }
}

export async function viewPlanning(view) {
  migrateBase44Files();
  const P = S.plan, season = activeSeason();
  let from, to, label;
  if (P.mode === 'semaine') {
    from = mondayOf(P.anchor); to = addDays(from, 6);
    label = `Semaine du ${from.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
  } else if (P.mode === 'mois') {
    const first = new Date(P.anchor.getFullYear(), P.anchor.getMonth(), 1);
    from = mondayOf(first); to = addDays(from, 41);
    label = first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    label = label[0].toUpperCase() + label.slice(1);
  } else { label = season ? `Saison ${season.label}` : 'Toutes les séances'; }

  let q = sb.from('courses').select('id, title, course_date, start_time, end_time, room, discipline_id, instructor, file_url, attendances(count)');
  if (from) q = q.gte('course_date', isoDay(from)).lte('course_date', isoDay(to));
  else if (season) q = q.eq('season_id', season.id);
  const { data: courses, error } = await q.order('course_date', { ascending: P.mode !== 'liste' }).order('start_time');
  if (error) throw error;
  const today = isoDay(new Date());
  const count = c => c.attendances?.[0]?.count ?? 0;
  const { data: todays } = await sb.from('courses').select('id, title').eq('course_date', today).order('start_time');

  const card = c => `<button class="session" data-c="${c.id}">
      <span class="s-time">${hhmm(c.start_time) || '—'}${c.end_time ? ' – ' + hhmm(c.end_time) : ''}</span>
      <span class="s-title">${esc(c.title)}</span>
      <span class="s-meta">${c.room ? esc(c.room) : ''}${count(c) ? `<span class="badge ok">${count(c)} présent${count(c) > 1 ? 's' : ''}</span>` : (c.course_date <= today ? '<span class="badge warn">Appel à faire</span>' : '')}${c.file_url ? icon('file') : ''}</span>
    </button>`;

  let body = '';
  if (P.mode === 'semaine') {
    body = `<div class="week">${[0, 1, 2, 3, 4, 5, 6].map(i => {
      const d = isoDay(addDays(from, i)), list = courses.filter(c => c.course_date === d);
      return `<div class="day ${d === today ? 'today' : ''} ${list.length ? '' : 'empty-day'}"><div class="day-head"><span>${DAYS[i]}</span><strong>${parseDay(d).getDate()}</strong></div>${list.map(card).join('')}</div>`;
    }).join('')}</div>`;
  } else if (P.mode === 'mois') {
    const month = P.anchor.getMonth();
    body = `<div class="month only-desktop">${DAYS.map(d => `<div class="m-head">${d}</div>`).join('')}${Array.from({ length: 42 }, (_, i) => {
      const dd = addDays(from, i), d = isoDay(dd), list = courses.filter(c => c.course_date === d);
      return `<div class="m-cell ${dd.getMonth() !== month ? 'out' : ''} ${d === today ? 'today' : ''}"><span class="m-num">${dd.getDate()}</span>${list.map(c => `<button class="m-chip ${count(c) ? 'done' : ''}" data-c="${c.id}">${hhmm(c.start_time)} ${esc(c.title)}</button>`).join('')}</div>`;
    }).join('')}</div>
    <div class="only-mobile">${groupByDay(courses.filter(c => parseDay(c.course_date).getMonth() === month), card)}</div>`;
  } else {
    const upcoming = courses.filter(c => c.course_date >= today).reverse(), past = courses.filter(c => c.course_date < today);
    body = `${upcoming.length ? `<h2 class="section-title mt">À venir</h2>${groupByDay(upcoming, card)}` : ''}
      ${past.length ? `<h2 class="section-title mt">Séances passées</h2>${groupByDay(past, card)}` : ''}`;
  }

  view.innerHTML = head('Planning', 'Séances et appel des présences',
    `${todays?.length ? `<button class="btn" id="today-call">${icon('check')}Faire l’appel du jour</button>` : ''}<button class="btn btn-primary" id="new-course">${icon('plus')}Nouvelle séance</button>`) + `
    <div class="toolbar between">
      <div class="chips">${[['semaine', 'Semaine'], ['mois', 'Mois'], ['liste', 'Liste']].map(([k, l]) => `<button class="chip ${P.mode === k ? 'active' : ''}" data-mode="${k}">${l}</button>`).join('')}</div>
      ${P.mode !== 'liste' ? `<div class="row"><button class="icon-btn" id="prev" aria-label="Précédent">${icon('left')}</button><button class="btn btn-sm" id="now">Aujourd’hui</button><button class="icon-btn" id="next" aria-label="Suivant">${icon('right')}</button></div>` : ''}
    </div>
    <h2 class="section-title">${esc(label)} <span class="muted small" style="text-transform:none;letter-spacing:0">· ${courses.length} séance(s)</span></h2>
    ${courses.length || P.mode !== 'liste' ? body : '<div class="card empty">Aucune séance pour l’instant. Créez la première avec « Nouvelle séance ».</div>'}`;

  $$('[data-mode]', view).forEach(b => b.onclick = () => { P.mode = b.dataset.mode; route(); });
  const step = dir => { P.anchor = P.mode === 'semaine' ? addDays(P.anchor, 7 * dir) : new Date(P.anchor.getFullYear(), P.anchor.getMonth() + dir, 1); route(); };
  $('#prev') && ($('#prev').onclick = () => step(-1));
  $('#next') && ($('#next').onclick = () => step(1));
  $('#now') && ($('#now').onclick = () => { P.anchor = new Date(); route(); });
  $$('[data-c]', view).forEach(b => b.onclick = () => openSession(b.dataset.c));
  $('#new-course').onclick = () => courseForm(null, { course_date: isoDay(P.mode === 'liste' ? new Date() : (from <= new Date() && new Date() <= addDays(to, 1) ? new Date() : from)) });
  $('#today-call') && ($('#today-call').onclick = () => openSession(todays[0].id));
}

export function groupByDay(courses, card) {
  if (!courses.length) return '<div class="card empty">Aucune séance sur cette période.</div>';
  const days = [...new Set(courses.map(c => c.course_date))];
  return `<div class="day-list">${days.map(d => `<div class="dl-group"><div class="dl-date">${esc(longDay(d))}</div>${courses.filter(c => c.course_date === d).map(card).join('')}</div>`).join('')}</div>`;
}

export async function openSession(id) {
  const [cr, ar, mr, lr] = await Promise.all([
    sb.from('courses').select('*').eq('id', id).single(),
    sb.from('attendances').select('member_id, present').eq('course_id', id),
    sb.from('members').select('id, first_name, last_name, status, level_id').order('last_name'),
    sb.from('course_plan_items').select('plan_item_id, plan_items(id, label, category, done)').eq('course_id', id),
  ]);
  for (const r of [cr, ar, mr, lr]) if (r.error) return fail(r.error);
  const c = cr.data;
  // Prospects attendus à ce cours pour un essai (rubrique absente tant que migration-10.sql n'est pas exécuté)
  const tr = await sb.from('prospects').select('id, first_name, last_name, trial_present, trial_course_id').eq('status', 'essai').eq('trial_date', c.course_date);
  const trialsOn = !tr.error, trials = (tr.data || []).filter(p => !p.trial_course_id || p.trial_course_id === c.id);
  const linked = lr.data.map(l => l.plan_items).filter(Boolean);
  const present = new Set(ar.data.filter(a => a.present).map(a => a.member_id));
  const people = mr.data.filter(m => m.status === 'actif' || present.has(m.id));
  const href = await fileHref(c);

  const row = m => `<label class="att-row ${present.has(m.id) ? 'on' : ''}" data-m="${m.id}" data-name="${esc(fullName(m).toLowerCase())}">
      <input type="checkbox" ${present.has(m.id) ? 'checked' : ''} aria-label="${esc(fullName(m))} présent">
      <span class="avatar">${esc(initials(m))}</span><span class="grow"><span class="att-name">${esc(fullName(m))}</span><span class="small muted">${esc(levelName(m.level_id))}</span></span>
      <span class="att-state">${present.has(m.id) ? 'Présent' : 'Absent'}</span></label>`;

  openModal({
    title: c.title,
    body: `
      <div class="row wrap small muted" style="gap:14px;margin-bottom:10px">
        <span class="row" style="gap:4px">${icon('calendar')}${esc(longDay(c.course_date))}</span>
        ${c.start_time ? `<span class="row" style="gap:4px">${icon('clock')}${hhmm(c.start_time)}${c.end_time ? ' – ' + hhmm(c.end_time) : ''}</span>` : ''}
        ${c.room ? `<span class="row" style="gap:4px">${icon('pin')}${esc(c.room)}</span>` : ''}
      </div>
      <div class="row wrap" style="gap:6px;margin-bottom:12px">
        ${c.discipline_id ? `<span class="badge">${esc(discName(c.discipline_id))}</span>` : ''}${c.instructor ? `<span class="badge">${esc(c.instructor)}</span>` : ''}
        ${href ? `<a class="btn btn-sm" href="${esc(href)}" target="_blank" rel="noopener">${icon('file')}${esc(c.file_name || 'Fichier du cours')}</a>` : ''}
      </div>
      ${c.notes ? `<p class="small" style="white-space:pre-line;margin:0 0 14px">${esc(c.notes)}</p>` : ''}
      ${linked.length ? `<div class="linked-plan"><div class="small muted" style="font-weight:700;margin-bottom:4px">Programme travaillé${linked.some(i => !i.done) ? ' · sera coché à l’enregistrement de l’appel' : ''}</div>${linked.map(i => `<div class="row small" style="gap:6px;align-items:flex-start">${i.done ? `<span style="color:var(--ok)">${icon('check')}</span>` : '<span class="dot"></span>'}<span>${esc(i.label)} <span class="muted">· ${esc(i.category)}</span></span></div>`).join('')}</div>` : ''}
      <div class="row between" style="margin:6px 0 10px"><h2 class="section-title" style="margin:0">Appel</h2><span class="badge ok" id="att-count"></span></div>
      <div class="row" style="gap:8px;margin-bottom:10px">
        <input class="input" type="search" id="att-search" placeholder="Rechercher…" aria-label="Rechercher un membre">
        <button class="btn btn-sm" id="att-all">Tous</button><button class="btn btn-sm" id="att-none">Aucun</button>
      </div>
      <div class="att-list" id="att-list">${people.map(row).join('')}</div>
      ${trialsOn ? `<div class="row between" style="margin:16px 0 8px"><h2 class="section-title" style="margin:0">Cours d’essai</h2><a class="small" href="#/prospects">Prospects</a></div>
      <div class="att-list" id="trial-list">${trials.map(trialRow).join('')}</div>
      <div class="row" style="gap:8px;margin-top:8px"><input class="input" id="trial-name" placeholder="Prénom et nom d’une personne venue à l’essai" aria-label="Personne venue à l’essai"><button class="btn btn-sm" id="trial-add">${icon('plus')}Ajouter</button></div>` : ''}`,
    foot: `<button class="icon-btn" id="c-del" aria-label="Supprimer la séance" title="Supprimer">${icon('trash')}</button>
      <button class="btn" id="c-dup">${icon('copy')}<span class="only-desktop">Dupliquer</span></button>
      <button class="btn" id="c-edit">${icon('edit')}<span class="only-desktop">Modifier</span></button>
      <button class="btn btn-primary" id="c-save">Enregistrer l’appel</button>`,
    onMount: root => {
      const list = $('#att-list', root);
      const refresh = () => {
        const n = $$('.att-row input:checked', list).length;
        $('#att-count', root).textContent = `${n} présent${n > 1 ? 's' : ''} / ${people.length}`;
        $$('.att-row', list).forEach(r => { const on = $('input', r).checked; r.classList.toggle('on', on); $('.att-state', r).textContent = on ? 'Présent' : 'Absent'; });
      };
      refresh();
      list.addEventListener('change', refresh);
      $('#att-search', root).oninput = e => { const v = e.target.value.toLowerCase(); $$('.att-row', list).forEach(r => r.style.display = r.dataset.name.includes(v) ? '' : 'none'); };
      $('#att-all', root).onclick = () => { $$('.att-row', list).forEach(r => { if (r.style.display !== 'none') $('input', r).checked = true; }); refresh(); };
      $('#att-none', root).onclick = () => { $$('.att-row input', list).forEach(i => i.checked = false); refresh(); };
      const tlist = $('#trial-list', root);
      if (tlist) {
        tlist.addEventListener('change', e => { const r = e.target.closest('.att-row'); if (r) { r.classList.toggle('on', e.target.checked); $('.att-state', r).textContent = e.target.checked ? 'Venu(e)' : 'Attendu(e)'; } });
        const add = async () => {
          const inp = $('#trial-name', root), [first, ...rest] = inp.value.trim().split(/\s+/); if (!first) return;
          const { data, error } = await sb.from('prospects').insert({ first_name: first, last_name: rest.join(' ') || null, source: 'manuel', status: 'essai', trial_date: c.course_date, trial_course_id: c.id, trial_present: true }).select().single();
          if (error) return fail(error);
          tlist.insertAdjacentHTML('beforeend', trialRow(data)); inp.value = ''; toast(`${first} ajouté(e) aux Prospects`);
        };
        $('#trial-add', root).onclick = add;
        $('#trial-name', root).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
      }
      $('#c-save', root).onclick = async () => {
        const btn = $('#c-save', root); btn.disabled = true;
        const ids = $$('.att-row', list).filter(r => $('input', r).checked).map(r => r.dataset.m);
        let del = sb.from('attendances').delete().eq('course_id', c.id);
        if (ids.length) del = del.not('member_id', 'in', `(${ids.join(',')})`);
        const r1 = await del;
        const r2 = ids.length ? await sb.from('attendances').upsert(ids.map(m => ({ course_id: c.id, member_id: m, present: true })), { onConflict: 'course_id,member_id' }) : { error: null };
        btn.disabled = false;
        if (r1.error || r2.error) return fail(r1.error || r2.error);
        if (tlist) await Promise.all($$('.att-row', tlist).map(r => sb.from('prospects').update({ trial_present: $('input', r).checked, trial_course_id: c.id }).eq('id', r.dataset.p)));
        let extra = '';
        const todo = linked.filter(i => !i.done).map(i => i.id);
        if (ids.length && todo.length) {
          const { error } = await sb.from('plan_items').update({ done: true }).in('id', todo);
          if (!error) extra = ` · ${todo.length} élément(s) du programme coché(s)`;
        }
        closeModal(); toast(`Appel enregistré : ${ids.length} présent${ids.length > 1 ? 's' : ''}${extra}`); if (currentPath() === '/planning') route();
      };
      $('#c-edit', root).onclick = () => courseForm(c);
      $('#c-dup', root).onclick = () => { const { id, created_at, legacy, ...rest } = c; courseForm(null, { ...rest, course_date: isoDay(addDays(parseDay(c.course_date), 7)) }); };
      $('#c-del', root).onclick = async () => {
        if (!await confirmBox('Supprimer la séance', `Supprimer « ${esc(c.title)} » du ${esc(longDay(c.course_date))} ? L’appel de cette séance sera aussi supprimé.`)) return;
        const { error } = await sb.from('courses').delete().eq('id', c.id);
        if (error) return fail(error);
        toast('Séance supprimée'); route();
      };
    },
  });
}

export async function courseForm(c, defaults = {}) {
  const v = c || { start_time: S.settings?.default_start_time, end_time: S.settings?.default_end_time, instructor: S.profile?.full_name, ...defaults };
  const rooms = [...new Set([...(S.settings?.rooms || []), v.room].filter(Boolean))];
  const hasFile = !!v.file_url;
  const season = activeSeason();
  const [pr, lr] = await Promise.all([
    season ? sb.from('plan_items').select('id, month, category, label, done, position').eq('season_id', season.id).order('position') : { data: [] },
    c ? sb.from('course_plan_items').select('plan_item_id').eq('course_id', c.id) : { data: [] },
  ]);
  if (pr.error || lr.error) return fail(pr.error || lr.error);
  const planItems = pr.data, chosen = new Set(lr.data.map(l => l.plan_item_id));
  const planBlock = date => {
    if (!planItems.length) return '<span class="help">Aucun programme pour cette saison.</span>';
    const month = date ? parseDay(date).getMonth() + 1 : new Date().getMonth() + 1;
    const its = planItems.filter(i => i.month === month || chosen.has(i.id));
    if (!its.length) return `<span class="help">Rien de prévu au programme de ${MONTHS[month - 1]}.</span>`;
    return [...new Set(its.map(i => i.category))].map(cat => `<div class="small muted" style="font-weight:700;margin:8px 0 2px">${esc(cat)}</div>${its.filter(i => i.category === cat).map(i => `<label class="check" style="padding:4px 0"><input type="checkbox" class="cf-plan" value="${i.id}" ${chosen.has(i.id) ? 'checked' : ''}><span>${esc(i.label)}${i.done ? ' <span class="badge ok">déjà fait</span>' : ''}</span></label>`).join('')}`).join('');
  };
  openModal({
    title: c ? 'Modifier la séance' : 'Nouvelle séance',
    body: `<form id="cf" class="form-grid" novalidate>
      <div class="field full"><label for="cf-title">Titre / thème du cours *</label><input class="input" id="cf-title" name="title" value="${esc(v.title || '')}" placeholder="ex : Défense sur saisies"></div>
      <div class="field"><label for="cf-date">Date *</label><input class="input" id="cf-date" name="course_date" type="date" value="${esc(v.course_date || '')}"></div>
      <div class="field"><label for="cf-room">Salle</label><select class="input" id="cf-room" name="room"><option value="">—</option>${rooms.map(r => `<option ${r === v.room ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></div>
      <div class="field"><label for="cf-start">Début</label><input class="input" id="cf-start" name="start_time" type="time" value="${esc(hhmm(v.start_time))}"></div>
      <div class="field"><label for="cf-end">Fin</label><input class="input" id="cf-end" name="end_time" type="time" value="${esc(hhmm(v.end_time))}"></div>
      <div class="field"><label for="cf-disc">Discipline</label><select class="input" id="cf-disc" name="discipline_id"><option value="">—</option>${S.disciplines.filter(d => d.is_active || d.id === v.discipline_id).map(d => `<option value="${d.id}" ${d.id === v.discipline_id || (!v.discipline_id && S.disciplines.filter(x => x.is_active).length === 1 && d.is_active) ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="cf-instr">Enseignant</label><input class="input" id="cf-instr" name="instructor" value="${esc(v.instructor || '')}"></div>
      <div class="field full"><label for="cf-notes">Contenu / notes</label><textarea class="input" id="cf-notes" name="notes">${esc(v.notes || '')}</textarea></div>
      <div class="field full"><label for="cf-file">Fichier du cours</label>
        ${hasFile ? `<div class="row small" style="margin-bottom:6px">${icon('file')}<span>${esc(v.file_name || 'Fichier joint')}</span><label class="check" style="padding:0;margin-left:auto"><input type="checkbox" id="cf-rmfile"><span>Retirer</span></label></div>` : ''}
        <input class="input" id="cf-file" type="file"><span class="help">${hasFile ? 'Choisir un fichier remplacera le fichier actuel.' : 'Plan de cours, fiche… (facultatif)'}</span></div>
      ${c ? '' : `<div class="field full"><label for="cf-repeat">Répéter chaque semaine jusqu’au (facultatif)</label><input class="input" id="cf-repeat" type="date"><span class="help">Crée la même séance chaque semaine, même jour, jusqu’à cette date.</span></div>`}
      <div class="field full"><label>Programme travaillé (planification annuelle)</label><div class="cf-plan-box" id="cf-plan">${planBlock(v.course_date)}</div>
        <span class="help">Les éléments choisis seront cochés automatiquement dans la planification quand vous ferez l’appel.</span></div>
    </form>`,
    foot: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="cf-save">Enregistrer</button>`,
    onMount: root => {
    const box = $('#cf-plan', root);
    box.addEventListener('change', e => { if (e.target.classList.contains('cf-plan')) e.target.checked ? chosen.add(e.target.value) : chosen.delete(e.target.value); });
    $('#cf-date', root).addEventListener('change', e => { box.innerHTML = planBlock(e.target.value); });
    const syncPlan = async courseIds => {
      const ids = [...chosen];
      for (const cid of courseIds) {
        let del = sb.from('course_plan_items').delete().eq('course_id', cid);
        if (ids.length) del = del.not('plan_item_id', 'in', `(${ids.join(',')})`);
        const r1 = await del; if (r1.error) throw r1.error;
        if (ids.length) { const r2 = await sb.from('course_plan_items').upsert(ids.map(p => ({ course_id: cid, plan_item_id: p })), { onConflict: 'course_id,plan_item_id' }); if (r2.error) throw r2.error; }
      }
    };
    $('#cf-save', root).onclick = async () => {
      const d = readForm($('#cf', root));
      if (!d.title || !d.course_date) return toast('Le titre et la date sont obligatoires.', 'error');
      const btn = $('#cf-save', root); btn.disabled = true;
      try {
        const file = $('#cf-file', root).files[0];
        if (file) {
          if (file.size > 20 * 1024 * 1024) throw new Error('Fichier trop lourd (20 Mo maximum).');
          const path = `seances/${Date.now()}-${safeName(file.name)}`;
          const up = await sb.storage.from('cours').upload(path, file, { contentType: file.type || undefined });
          if (up.error) throw up.error;
          d.file_url = 'storage:' + path; d.file_name = file.name;
        } else if ($('#cf-rmfile', root)?.checked) { d.file_url = null; d.file_name = null; }
        else if (!c && v.file_url) { d.file_url = v.file_url; d.file_name = v.file_name; }
        if (c) {
          const { error } = await sb.from('courses').update(d).eq('id', c.id);
          if (error) throw error;
          await syncPlan([c.id]);
          closeModal(); toast('Séance mise à jour'); route();
        } else {
          const until = $('#cf-repeat', root).value;
          const dates = [d.course_date];
          if (until) for (let x = addDays(parseDay(d.course_date), 7); isoDay(x) <= until && dates.length < 60; x = addDays(x, 7)) dates.push(isoDay(x));
          const rows = dates.map(dt => ({ ...d, course_date: dt, season_id: activeSeason()?.id || null }));
          const { data: created, error } = await sb.from('courses').insert(rows).select('id');
          if (error) throw error;
          if (chosen.size && created?.length) await syncPlan([created[0].id]);
          closeModal(); toast(rows.length > 1 ? `${rows.length} séances créées` : 'Séance créée');
          S.plan.anchor = parseDay(d.course_date); go('/planning'); route();
        }
      } catch (e) { fail(e); btn.disabled = false; }
    };
    },
  });
}

/* Décrocheurs : membres actifs qui ne sont pas venus depuis au moins 3 semaines, alors que
   l'appel a été fait à au moins 3 séances depuis (pour ne signaler personne pendant les vacances). */
export const DROPOUT_DAYS = 21, DROPOUT_SESSIONS = 3;
export async function dropoutInfo(members) {
  const today = isoDay(new Date()), since = isoDay(addDays(new Date(), -120));
  const { data: cs, error } = await sb.from('courses').select('id, course_date, attendances(count)').gte('course_date', since).lte('course_date', today);
  if (error) throw error;
  const sessions = cs.filter(c => (c.attendances?.[0]?.count ?? 0) > 0);
  const out = {};
  if (!sessions.length) return out;
  const { data: at, error: e2 } = await sb.from('attendances').select('member_id, course_id').eq('present', true).in('course_id', sessions.map(c => c.id));
  if (e2) throw e2;
  const dateOf = Object.fromEntries(sessions.map(c => [c.id, c.course_date]));
  const last = {};
  at.forEach(a => { const d = dateOf[a.course_id]; if (d && (!last[a.member_id] || d > last[a.member_id])) last[a.member_id] = d; });
  for (const m of members) {
    if (m.status !== 'actif') continue;
    const lastSeen = last[m.id] || null;
    const ref = [lastSeen, m.registration_date, since].filter(Boolean).sort().pop();
    const missed = sessions.filter(c => c.course_date > ref).length;
    const days = Math.floor((parseDay(today) - parseDay(ref)) / 86400000);
    if (days >= DROPOUT_DAYS && missed >= DROPOUT_SESSIONS) out[m.id] = { lastSeen, days, missed };
  }
  return out;
}
export function dropoutText(m) {
  const minor = (ageOf(m.birth_date) ?? 99) < 18 && m.guardian_phone;
  const club = S.settings?.club_name || 'club';
  return minor
    ? `Bonjour ${(m.guardian_name || '').split(' ')[0] || ''} ! 👋\n\nOn n’a pas vu ${m.first_name} au ${club} depuis un moment, tout va bien ? 🙂\nOn serait contents de le/la revoir sur le tatami. N’hésitez pas à me dire si quelque chose l’empêche de venir.\n\nÀ bientôt ! 👊`
    : `Bonjour ${m.first_name} ! 👋\n\nOn ne t’a pas vu(e) au ${club} depuis un moment, tout va bien ? 🙂\nOn serait contents de te revoir sur le tatami. N’hésite pas à me dire si quelque chose t’empêche de venir.\n\nÀ bientôt ! 👊`;
}
