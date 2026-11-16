// Defendr — Passages de grade
import { $, $$, S, closeModal, confirmBox, esc, fail, fullName, icon, initials, isAdmin, isoDay, levelName, openModal, parseDay, readForm, sb, toast } from './core.js';
import { route } from './shell.js';
import { attendanceFor, seasonSessionsWithCall } from './planning.js';

/* =====================================================================
   Passages de grade
   ===================================================================== */
S.gradeMonths = 8;
export const monthsBetween = (a, b = new Date()) => { const d = parseDay(a); return (b.getFullYear() - d.getFullYear()) * 12 + b.getMonth() - d.getMonth() - (b.getDate() < d.getDate() ? 1 : 0); };
export const nextLevel = id => { const cur = S.levels.find(l => l.id === id); return S.levels.filter(l => l.is_active && (!cur || l.rank > cur.rank)).sort((a, b) => a.rank - b.rank)[0] || null; };

export async function gradeSection(box) {
  const sessions = await seasonSessionsWithCall();
  const [mr, hr, ar] = await Promise.all([
    sb.from('members').select('id, first_name, last_name, status, level_id, registration_date').eq('status', 'actif'),
    sb.from('level_history').select('member_id, to_level_id, changed_on').order('changed_on', { ascending: false }),
    sessions.length ? sb.from('attendances').select('course_id, member_id').eq('present', true).in('course_id', sessions.map(s => s.id)) : { data: [] },
  ]);
  for (const r of [mr, hr, ar]) if (r.error) throw r.error;
  const lvlOf = Object.fromEntries(mr.data.map(m => [m.id, m.level_id]));
  const lastChange = {}; hr.data.forEach(h => { if (!lastChange[h.member_id] && h.to_level_id === lvlOf[h.member_id]) lastChange[h.member_id] = h.changed_on; });
  const byM = {}; ar.data.forEach(a => (byM[a.member_id] ||= new Set()).add(a.course_id));
  const minRate = S.settings?.threshold_regulier ?? 45;
  const rows = mr.data.map(m => {
    const since = lastChange[m.id] || m.registration_date;
    const months = since ? monthsBetween(since) : null;
    const att = attendanceFor(m, sessions, byM[m.id] || new Set());
    const next = nextLevel(m.level_id);
    const ready = next && months != null && months >= S.gradeMonths && (!att.sessions.length || att.rate >= minRate);
    return { m, since, months, att, next, ready };
  }).filter(r => r.next).sort((a, b) => b.ready - a.ready || (b.months ?? -1) - (a.months ?? -1));

  box.innerHTML = `
    <div class="row between wrap mb" style="gap:10px"><h2 class="section-title" style="margin:0">Passages de grade</h2>
      <label class="row small" style="gap:6px">Prêt à partir de <select class="input" id="g-months" style="width:auto;padding:6px 10px">${[3, 4, 6, 8, 10, 12, 18, 24].map(n => `<option value="${n}" ${n === S.gradeMonths ? 'selected' : ''}>${n} mois</option>`).join('')}</select> au même niveau</label></div>
    <p class="small muted">Sont signalés « prêts » les adhérents au même niveau depuis au moins ${S.gradeMonths} mois, avec une assiduité d’au moins ${minRate} % cette saison. C’est une aide : la décision reste la vôtre.</p>
    <div class="card"><div class="list">${rows.length ? rows.map(r => `
      <div class="list-item" style="cursor:default">
        <div class="avatar">${esc(initials(r.m))}</div>
        <a class="grow" href="#/membres/${r.m.id}" style="text-decoration:none"><div style="font-weight:600">${esc(fullName(r.m))}</div>
          <div class="small muted">${r.m.level_id ? esc(levelName(r.m.level_id)) : 'Sans niveau'}${r.months != null ? ` depuis ${r.months} mois` : ''} · assiduité ${r.att.sessions.length ? r.att.rate + ' %' : '—'}</div></a>
        <div class="right">${r.ready ? '<span class="badge ok">Prêt</span>' : `<span class="badge">${r.months == null ? 'Date d’inscription manquante' : r.months < S.gradeMonths ? 'Trop tôt' : 'Assiduité faible'}</span>`}
          ${isAdmin() ? `<button class="btn btn-sm" data-promote="${r.m.id}">→ ${esc(r.next.name)}</button>` : ''}</div>
      </div>`).join('') : '<div class="empty">Tous les adhérents actifs sont au niveau le plus élevé.</div>'}</div></div>`;
  $('#g-months', box).onchange = e => { S.gradeMonths = Number(e.target.value); gradeSection(box).catch(fail); };
  $$('[data-promote]', box).forEach(b => b.onclick = () => promoteForm(rows.find(r => r.m.id === b.dataset.promote).m, () => gradeSection(box).catch(fail)));
}

/* Saisie ou correction d'un grade obtenu (sans changer le niveau actuel du membre) */
export function gradeEntryForm(m, g) {
  const levels = S.levels.slice().sort((a, b) => a.rank - b.rank);
  const v = g || { to_level_id: m.level_id, changed_on: '' };
  openModal({
    title: g ? 'Modifier le grade' : 'Ajouter un grade passé', size: 'sm',
    body: `<form id="ge"><p class="small muted" style="margin-top:0">Pour noter quand <strong>${esc(m.first_name)}</strong> a obtenu un niveau. Cela ne change pas son niveau actuel.</p>
      <div class="field"><label for="ge-l">Niveau obtenu *</label><select class="input" id="ge-l" name="to_level_id">${levels.map(l => `<option value="${l.id}" ${l.id === v.to_level_id ? 'selected' : ''}>${l.rank}. ${esc(l.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="ge-d">Date d’obtention *</label><input class="input" id="ge-d" name="changed_on" type="date" value="${esc(v.changed_on || '')}"><span class="help">Si vous ne connaissez que l’année, mettez par exemple le 1er juin de cette année.</span></div>
      <div class="field"><label for="ge-n">Remarques (facultatif)</label><input class="input" id="ge-n" name="notes" value="${esc(v.notes || '')}" placeholder="ex : examen de fin de saison"></div></form>`,
    foot: `${g ? `<button class="icon-btn" id="ge-del" aria-label="Supprimer" title="Supprimer">${icon('trash')}</button>` : ''}<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="ge-save">Enregistrer</button>`,
    onMount: r => {
      $('#ge-save', r).onclick = async () => {
        const d = readForm($('#ge', r));
        if (!d.to_level_id || !d.changed_on) return toast('Le niveau et la date sont obligatoires.', 'error');
        const to = levels.find(l => l.id === d.to_level_id);
        d.from_level_id = levels.filter(l => l.rank < to.rank).sort((a, b) => b.rank - a.rank)[0]?.id || null;
        const { error } = g ? await sb.from('level_history').update(d).eq('id', g.id) : await sb.from('level_history').insert({ ...d, member_id: m.id });
        if (error) return fail(error);
        closeModal(); toast('Grade enregistré'); route();
      };
      $('#ge-del', r) && ($('#ge-del', r).onclick = async () => {
        if (!await confirmBox('Supprimer ce grade', 'Supprimer cette ligne du parcours ? Le niveau actuel du membre ne change pas.')) return;
        const { error } = await sb.from('level_history').delete().eq('id', g.id);
        if (error) return fail(error);
        toast('Grade supprimé'); route();
      });
    },
  });
}

export function promoteForm(m, onDone) {
  const next = nextLevel(m.level_id);
  openModal({
    title: 'Passage de grade', size: 'sm',
    body: `<form id="gf"><p style="margin-top:0"><strong>${esc(fullName(m))}</strong> : ${esc(levelName(m.level_id))} → </p>
      <div class="field"><label for="gf-l">Nouveau niveau</label><select class="input" id="gf-l" name="level_id">${S.levels.filter(l => l.is_active && l.id !== m.level_id).sort((a, b) => a.rank - b.rank).map(l => `<option value="${l.id}" ${l.id === next?.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="gf-d">Date du passage</label><input class="input" id="gf-d" name="changed_on" type="date" value="${isoDay(new Date())}"></div>
      <div class="field"><label for="gf-n">Remarques (facultatif)</label><input class="input" id="gf-n" name="notes" placeholder="ex : examen réussi, jury…"></div></form>`,
    foot: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="gf-save">Valider le passage</button>`,
    onMount: r => $('#gf-save', r).onclick = async () => {
      const d = readForm($('#gf', r));
      const { error } = await sb.from('members').update({ level_id: d.level_id }).eq('id', m.id);
      if (error) return fail(error);
      const { data: h } = await sb.from('level_history').select('id').eq('member_id', m.id).order('created_at', { ascending: false }).limit(1);
      if (h?.[0]) await sb.from('level_history').update({ changed_on: d.changed_on, notes: d.notes }).eq('id', h[0].id);
      closeModal(); toast(`${m.first_name} passe ${levelName(d.level_id)} 🥋`); onDone?.();
    },
  });
}
