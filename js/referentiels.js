// Defendr — Disciplines et niveaux
import { $, $$, S, closeModal, confirmBox, esc, fail, icon, isAdmin, openModal, readForm, sb, toast } from './core.js';
import { head, route } from './shell.js';
import { gradeSection } from './grades.js';

/* =====================================================================
   Disciplines & niveaux
   ===================================================================== */
export async function viewDisciplines(view) {
  const { data: members, error } = await sb.from('members').select('discipline_id, status');
  if (error) throw error;
  S.disciplines = (await sb.from('disciplines').select('*').order('name')).data || S.disciplines;
  view.innerHTML = `<div class="row mb"><a href="#/parametres" class="btn btn-sm">${icon('back')}Paramètres</a></div>` + head('Disciplines', `${S.disciplines.length} discipline(s) enregistrée(s)`, isAdmin() ? `<button class="btn btn-primary" id="add">${icon('plus')}Nouvelle discipline</button>` : '') +
    (S.disciplines.length ? `<div class="grid two">${S.disciplines.map(d => {
      const n = members.filter(m => m.discipline_id === d.id && m.status === 'actif').length;
      return `<div class="card card-pad"><div class="row between"><h2 style="margin:0">${esc(d.name)}</h2>${d.is_active ? '<span class="badge ok">Active</span>' : '<span class="badge">Inactive</span>'}</div>
        <p class="muted small">${esc(d.description || '')}</p>
        <div class="row between"><span class="small">${n} membre(s) actif(s)</span>${isAdmin() ? `<div><button class="icon-btn" data-edit="${d.id}" aria-label="Modifier">${icon('edit')}</button><button class="icon-btn" data-del="${d.id}" aria-label="Supprimer">${icon('trash')}</button></div>` : ''}</div></div>`;
    }).join('')}</div>` : `<div class="card empty">Aucune discipline. Ajoutez-en une pour commencer.</div>`);
  const form = d => openModal({
    title: d ? 'Modifier la discipline' : 'Nouvelle discipline', size: 'sm',
    body: `<form id="df"><div class="field"><label for="df-name">Nom *</label><input class="input" id="df-name" name="name" value="${esc(d?.name || '')}"></div>
      <div class="field"><label for="df-desc">Description</label><input class="input" id="df-desc" name="description" value="${esc(d?.description || '')}"></div>
      <label class="check"><input type="checkbox" name="is_active" ${!d || d.is_active ? 'checked' : ''}><span>Discipline active</span></label></form>`,
    foot: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="df-save">Enregistrer</button>`,
    onMount: r => $('#df-save', r).onclick = async () => {
      const data = readForm($('#df', r));
      if (!data.name) return toast('Le nom est obligatoire.', 'error');
      const { error } = d ? await sb.from('disciplines').update(data).eq('id', d.id) : await sb.from('disciplines').insert(data);
      if (error) return fail(error);
      closeModal(); toast('Discipline enregistrée'); route();
    },
  });
  $('#add') && ($('#add').onclick = () => form(null));
  $$('[data-edit]', view).forEach(b => b.onclick = () => form(S.disciplines.find(d => d.id === b.dataset.edit)));
  $$('[data-del]', view).forEach(b => b.onclick = async () => {
    const d = S.disciplines.find(x => x.id === b.dataset.del);
    if (!await confirmBox('Supprimer la discipline', `Supprimer « ${esc(d.name)} » ? Les membres concernés n’auront plus de discipline. Vous pouvez aussi simplement la rendre inactive.`)) return;
    const { error } = await sb.from('disciplines').delete().eq('id', d.id);
    if (error) return fail(error);
    toast('Discipline supprimée'); route();
  });
}

export async function viewLevels(view) {
  const { data: members, error } = await sb.from('members').select('level_id, status');
  if (error) throw error;
  S.levels = (await sb.from('levels').select('*').order('rank')).data || S.levels;
  view.innerHTML = `<div class="row mb"><a href="#/parametres" class="btn btn-sm">${icon('back')}Paramètres</a></div>` + head('Niveaux', `${S.levels.length} niveau(x) enregistré(s)`, isAdmin() ? `<button class="btn btn-primary" id="add">${icon('plus')}Nouveau niveau</button>` : '') +
    (S.levels.length ? `<div class="card"><div class="list">${S.levels.map(l => `
      <div class="list-item" style="cursor:default"><div class="avatar">#${l.rank}</div>
        <div class="grow"><div style="font-weight:600">${esc(l.name)}</div><div class="small muted">${members.filter(m => m.level_id === l.id && m.status === 'actif').length} membre(s) actif(s)</div></div>
        ${l.is_active ? '<span class="badge ok">Actif</span>' : '<span class="badge">Inactif</span>'}
        ${isAdmin() ? `<button class="icon-btn" data-edit="${l.id}" aria-label="Modifier">${icon('edit')}</button><button class="icon-btn" data-del="${l.id}" aria-label="Supprimer">${icon('trash')}</button>` : ''}
      </div>`).join('')}</div></div>` : `<div class="card empty">Aucun niveau. Ajoutez-en un pour commencer.</div>`) +
    `<div id="grades" class="mt"><div class="empty">Chargement des passages de grade…</div></div>`;
  gradeSection($('#grades', view)).catch(fail);
  const form = l => openModal({
    title: l ? 'Modifier le niveau' : 'Nouveau niveau', size: 'sm',
    body: `<form id="lf"><div class="field"><label for="lf-name">Nom *</label><input class="input" id="lf-name" name="name" value="${esc(l?.name || '')}"></div>
      <div class="field"><label for="lf-rank">Ordre *</label><input class="input" id="lf-rank" name="rank" type="number" min="1" value="${l?.rank ?? (Math.max(0, ...S.levels.map(x => x.rank)) + 1)}"><span class="help">1 = premier niveau (débutant).</span></div>
      <label class="check"><input type="checkbox" name="is_active" ${!l || l.is_active ? 'checked' : ''}><span>Niveau actif</span></label></form>`,
    foot: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="lf-save">Enregistrer</button>`,
    onMount: r => $('#lf-save', r).onclick = async () => {
      const data = readForm($('#lf', r));
      if (!data.name || !data.rank) return toast('Le nom et l’ordre sont obligatoires.', 'error');
      const { error } = l ? await sb.from('levels').update(data).eq('id', l.id) : await sb.from('levels').insert(data);
      if (error) return fail(error);
      closeModal(); toast('Niveau enregistré'); route();
    },
  });
  $('#add') && ($('#add').onclick = () => form(null));
  $$('[data-edit]', view).forEach(b => b.onclick = () => form(S.levels.find(x => x.id === b.dataset.edit)));
  $$('[data-del]', view).forEach(b => b.onclick = async () => {
    const l = S.levels.find(x => x.id === b.dataset.del);
    if (!await confirmBox('Supprimer le niveau', `Supprimer « ${esc(l.name)} » ? Les membres concernés n’auront plus de niveau.`)) return;
    const { error } = await sb.from('levels').delete().eq('id', l.id);
    if (error) return fail(error);
    toast('Niveau supprimé'); route();
  });
}
