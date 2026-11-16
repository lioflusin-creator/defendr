// Defendr — Planification annuelle
import { $, $$, MONTHS, S, activeSeason, closeModal, confirmBox, esc, fail, fmtDate, icon, isAdmin, openModal, readForm, sb, toast } from './core.js';
import { head, route } from './shell.js';

/* =====================================================================
   Planification annuelle
   ===================================================================== */
export const SEASON_MONTHS = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
export const PLAN_SECTIONS = ['Technico tactique', 'Révisions', 'Connaissances générales', 'Préparation physique générale', 'Préparation récupération'];

// Programme annuel proposé par le guide ADAC « Planifier les cours » (édition 2026), chapitre 4
export const ADAC_PROGRAM = {
  9: { tt: ['Coups frappés poings / pieds', 'O/D poings-pieds : hérisson, déviés, blocages', 'Distances de base et attitudes'],
       rev: ['15 min : DTT de la séance précédente'],
       pp: ['Endurance longue, intensité faible', 'Apprentissage : burpees, planche, gainage statique', 'Souplesse', 'Équilibre et proprioception décontextualisés'] },
  10: { tt: ['Contre-saisie et déplacement au sol', 'O/D saisies agressives et sol vs debout', 'O/D poings-pieds : déviés + riposte'],
        rev: ['Séance 1 : stabilisation de septembre', '15 min : DTT de la séance précédente'],
        pp: ['Endurance longue, intensité faible', 'Stabilisation des mouvements de référence + circuit décontextualisé', 'Souplesse', 'Équilibre et proprioception contextualisés'] },
  11: { tt: ['O/D poings-pieds : esquive et saisie', 'O/D au sol vs agresseur debout', 'Lutte debout : clinch, saisir / dessaisir, tirer / pousser'],
        rev: ['Séance 1 : stabilisation d’octobre', '15 min : DTT de la séance précédente'],
        pp: ['Intermittent court : 15/15 à 30/30', 'Burpees, planche, gainage dynamique', 'Force haut du corps décontextualisée : pompes, biceps, concentrique', 'Souplesse'] },
  12: { tt: ['O/D poings-pieds complet', 'Lutter : contrôler, projeter…', 'Combativité 1'],
        rev: ['Séance 1 : stabilisation de novembre', '15 min : DTT de la séance précédente'],
        pp: ['Intermittent long : 1/1 à 3/3', 'Circuit de pré-fatigue alterné avec paos ou pattes d’ours', 'Force haut du corps contextualisée : lutte, tirer / pousser', 'Souplesse'] },
  1: { tt: ['O/D poings-pieds complet', 'Réagir à plusieurs face à un agresseur armé', 'Contrôles : clé bras tendu, aile de poulet'],
       rev: ['Séance 1 : stabilisation de décembre', '15 min : DTT de la séance précédente'],
       pp: ['Endurance longue, intensité moyenne', 'Force bas du corps décontextualisée : poussée horizontale, squat jump, concentrique', 'Souplesse'] },
  2: { tt: ['O/D poings-pieds complet', 'O/D seul face à un agresseur armé', 'Lutter, projeter et contrôler au sol, seul ou à plusieurs'],
       rev: ['Séance 1 : stabilisation de janvier', '15 min : DTT de la séance précédente'],
       pp: ['Alternance endurance fondamentale / intermittent court / intermittent long', 'Force bas du corps contextualisée : pousser, soulever, déplacer', 'Souplesse'] },
  3: { tt: ['O/D poings-pieds complet', 'Défense d’une tierce personne, seul', 'Lutter : contrôler, projeter…'],
       rev: ['Séance 1 : stabilisation de février', 'Séance 2 : stabilisation septembre-octobre', '15 min : DTT de la séance précédente'],
       pp: ['Endurance 6 à 8 min, intensité moyenne, contextualisée : lutte / boxe / repli', 'Force haut et bas décontextualisée : pompes, biceps, isométrie'] },
  4: { tt: ['O/D poings-pieds complet', 'Défense d’une tierce personne, à plusieurs', 'Contrôles : clé bras tendu, aile de poulet'],
       rev: ['Séance 1 : stabilisation de mars', 'Séance 2 : stabilisation novembre-décembre', '15 min : DTT de la séance précédente'],
       pp: ['Temps intermédiaires, intensité alternée : 15 s à 3 min', 'Travail contextualisé : lutte / boxe / repli', 'Force haut et bas contextualisée avec résistance (élastique…)'] },
  5: { tt: ['Préparation à l’examen'],
       rev: ['Séance 1 : stabilisation d’avril', 'Séance 2 : stabilisation janvier-février', '15 min : DTT de la séance précédente'],
       pp: ['Flow supervisé à vitesse variable', 'Équilibre et proprioception contextualisés : frapper depuis des positions variées'] },
  6: { tt: ['Intégration globale : « la bagarre »'],
       rev: ['Séance 1 : stabilisation de mai', 'Séance 2 : stabilisation mars-avril', '15 min : DTT de la séance précédente'],
       pp: ['Flow libre à vitesse variable', 'Équilibre et proprioception contextualisés : frapper depuis des positions variées'] },
};
export const ADAC_CATS = { tt: 'Technico tactique', rev: 'Révisions', pp: 'Préparation physique générale' };
S.planMonth = new Date().getMonth() + 1;
// Chapitres de la planification : réglables dans Paramètres, sinon liste par défaut
export const planSections = () => (S.settings?.plan_sections?.length ? S.settings.plan_sections : PLAN_SECTIONS);

export async function viewPlan(view) {
  const season = activeSeason();
  if (!season) { view.innerHTML = head('Planification annuelle') + `<div class="card empty">Aucune saison active. ${isAdmin() ? '<a href="#/parametres">Créez la saison en cours dans les Paramètres.</a>' : ''}</div>`; return; }
  const [{ data: items, error }, lk] = await Promise.all([
    sb.from('plan_items').select('*').eq('season_id', season.id).order('position'),
    sb.from('course_plan_items').select('plan_item_id, courses(course_date)'),
  ]);
  if (error) throw error;
  const workedOn = {};
  (lk.data || []).forEach(l => { if (l.courses) (workedOn[l.plan_item_id] ||= []).push(l.courses.course_date); });
  const month = S.planMonth, monthName = m => MONTHS[m - 1][0].toUpperCase() + MONTHS[m - 1].slice(1);
  const ofMonth = items.filter(i => i.month === month);
  const done = ofMonth.filter(i => i.done).length;
  const sections = [...new Set([...planSections(), ...ofMonth.map(i => i.category)])];
  const yearDone = items.filter(i => i.done).length;

  view.innerHTML = head('Planification annuelle', `Programme mois par mois, à cocher au fil de l’année · saison ${esc(season.label)}`) + `
    <div class="month-tabs" role="tablist" aria-label="Mois">${SEASON_MONTHS.map(m => {
      const its = items.filter(i => i.month === m), d = its.filter(i => i.done).length;
      return `<button class="mtab ${m === month ? 'active' : ''}" data-month="${m}" role="tab" aria-selected="${m === month}"><span>${['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'][m - 1]}</span><span class="mtab-bar">${its.length ? `<span style="width:${d / its.length * 100}%"></span>` : ''}</span></button>`;
    }).join('')}</div>
    <div class="card card-pad mb">
      <div class="row between wrap">
        <div><h2 style="margin:0;font-size:20px">${monthName(month)}</h2><div class="small muted">Avancement du mois : ${done}/${ofMonth.length}${items.length ? ` · année : ${yearDone}/${items.length}` : ''}</div></div>
        ${ofMonth.length ? `<div class="progress-big"><span style="width:${ofMonth.length ? done / ofMonth.length * 100 : 0}%"></span></div>` : ''}
      </div>
    </div>
    ${!items.length && S.seasons.length > 1 && isAdmin() ? `<div class="alert info">Le programme de cette saison est vide. <button class="link" id="copy-plan">Copier le programme d’une saison précédente</button></div>` : ''}
    <div class="row wrap mb" style="gap:8px"><button class="btn btn-sm" id="adac-plan">${icon('book')}Importer le programme annuel ADAC</button><a class="btn btn-sm" href="#/guide">Guide enseignant</a></div>
    <div class="grid two plan-grid">${sections.map(sec => {
      const its = ofMonth.filter(i => i.category === sec).sort((a, b) => a.position - b.position);
      const d = its.filter(i => i.done).length;
      return `<div class="card card-pad" data-sec="${esc(sec)}">
        <div class="row between"><h2 style="margin:0">${esc(sec)}</h2><span class="badge ${its.length && d === its.length ? 'ok' : ''}">${d}/${its.length}</span></div>
        <div class="plan-list mt">${its.map((i, idx) => `
          <div class="plan-item ${i.done ? 'done' : ''}" data-id="${i.id}">
            <input type="checkbox" class="pi-check" ${i.done ? 'checked' : ''} aria-label="Fait : ${esc(i.label)}">
            <span class="pi-label">${esc(i.label)}${workedOn[i.id] ? `<span class="small muted" style="display:block;text-decoration:none">Travaillé le ${workedOn[i.id].sort().map(d => fmtDate(d)).join(', ')}</span>` : ''}</span>
            <span class="pi-actions">
              <button class="icon-btn" data-up ${idx === 0 ? 'disabled' : ''} aria-label="Monter">${icon('up')}</button>
              <button class="icon-btn" data-edit aria-label="Modifier">${icon('edit')}</button>
              <button class="icon-btn" data-del aria-label="Supprimer">${icon('trash')}</button>
            </span>
          </div>`).join('')}</div>
        <form class="tag-add mt" data-add="${esc(sec)}"><input class="input" placeholder="Ajouter un élément…" aria-label="Ajouter un élément en ${esc(sec)}"><button class="btn" type="submit">${icon('plus')}</button></form>
      </div>`;
    }).join('')}</div>`;

  $$('[data-month]', view).forEach(b => b.onclick = () => { S.planMonth = Number(b.dataset.month); route(); });
  view.querySelector('.mtab.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  const byId = id => items.find(i => i.id === id);
  $$('.plan-item', view).forEach(row => {
    const it = byId(row.dataset.id);
    $('.pi-check', row).onchange = async e => {
      const { error } = await sb.from('plan_items').update({ done: e.target.checked }).eq('id', it.id);
      if (error) { e.target.checked = !e.target.checked; return fail(error); }
      route();
    };
    $('[data-del]', row).onclick = async () => {
      if (!await confirmBox('Supprimer l’élément', `Supprimer « ${esc(it.label)} » du programme ?`)) return;
      const { error } = await sb.from('plan_items').delete().eq('id', it.id); if (error) return fail(error); route();
    };
    $('[data-up]', row).onclick = async () => {
      const sib = ofMonth.filter(i => i.category === it.category).sort((a, b) => a.position - b.position);
      const k = sib.findIndex(i => i.id === it.id); if (k < 1) return;
      const reordered = [...sib]; [reordered[k - 1], reordered[k]] = [reordered[k], reordered[k - 1]];
      const results = await Promise.all(reordered.map((i, p) => sb.from('plan_items').update({ position: p }).eq('id', i.id)));
      const err = results.find(r => r.error); if (err) return fail(err.error); route();
    };
    $('[data-edit]', row).onclick = () => openModal({
      title: 'Modifier l’élément', size: 'sm',
      body: `<form id="pe"><div class="field"><label for="pe-l">Intitulé</label><textarea class="input" id="pe-l" name="label">${esc(it.label)}</textarea></div>
        <div class="field"><label for="pe-c">Rubrique</label><select class="input" id="pe-c" name="category">${sections.map(s => `<option ${s === it.category ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
        <div class="field"><label for="pe-m">Mois</label><select class="input" id="pe-m" name="month">${SEASON_MONTHS.map(m => `<option value="${m}" ${m === it.month ? 'selected' : ''}>${monthName(m)}</option>`).join('')}</select></div></form>`,
      foot: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="pe-save">Enregistrer</button>`,
      onMount: r => $('#pe-save', r).onclick = async () => {
        const d = readForm($('#pe', r)); d.month = Number(d.month);
        if (!d.label) return toast('L’intitulé est obligatoire.', 'error');
        const { error } = await sb.from('plan_items').update(d).eq('id', it.id); if (error) return fail(error);
        closeModal(); toast('Élément modifié'); route();
      },
    });
  });
  $$('[data-add]', view).forEach(f => f.onsubmit = async e => {
    e.preventDefault();
    const label = $('input', f).value.trim(); if (!label) return;
    const sec = f.dataset.add, pos = Math.max(-1, ...ofMonth.filter(i => i.category === sec).map(i => i.position)) + 1;
    const { error } = await sb.from('plan_items').insert({ season_id: season.id, month, category: sec, label, position: pos });
    if (error) return fail(error);
    toast('Élément ajouté'); route();
  });
  $('#adac-plan').onclick = async () => {
    const have = new Set(items.map(i => `${i.month}|${i.category}|${i.label.trim().toLowerCase()}`));
    const rows = [];
    for (const [m, blocks] of Object.entries(ADAC_PROGRAM)) for (const [k, cat] of Object.entries(ADAC_CATS)) {
      let pos = Math.max(-1, ...items.filter(i => i.month === +m && i.category === cat).map(i => i.position)) + 1;
      for (const label of blocks[k]) if (!have.has(`${m}|${cat}|${label.toLowerCase()}`)) rows.push({ season_id: season.id, month: +m, category: cat, label, position: pos++ });
    }
    if (!rows.length) return toast('Le programme ADAC est déjà dans la planification de cette saison.');
    if (!await confirmBox('Programme annuel ADAC', `Ajouter ${rows.length} élément${rows.length > 1 ? 's' : ''} de septembre à juin (technico-tactique, révisions, préparation physique), d’après le guide ADAC « Planifier les cours » ? Ce qui est déjà dans votre planification est conservé et les éléments déjà présents ne sont pas ajoutés en double.`, 'Importer')) return;
    const { error } = await sb.from('plan_items').insert(rows);
    if (error) return fail(error);
    toast(`${rows.length} éléments du programme ADAC ajoutés`); route();
  };
  $('#copy-plan') && ($('#copy-plan').onclick = async () => {
    const prev = S.seasons.filter(s => s.id !== season.id);
    const { data: old, error } = await sb.from('plan_items').select('month, category, label, position, season_id').in('season_id', prev.map(s => s.id));
    if (error) return fail(error);
    const src = prev.find(s => old.some(o => o.season_id === s.id));
    if (!src) return toast('Aucun programme à copier.', 'error');
    if (!await confirmBox('Copier le programme', `Copier les ${old.filter(o => o.season_id === src.id).length} éléments de la saison ${esc(src.label)} (tous décochés) ?`, 'Copier')) return;
    const { error: e2 } = await sb.from('plan_items').insert(old.filter(o => o.season_id === src.id).map(({ season_id, ...o }) => ({ ...o, season_id: season.id, done: false })));
    if (e2) return fail(e2);
    toast('Programme copié'); route();
  });
}
