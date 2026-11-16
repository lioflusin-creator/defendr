// Defendr — Stages
import { $, $$, S, addDays, ageOf, closeModal, confirmBox, esc, fail, fmtMoney, fullName, hhmm, icon, initials, isoDay, longDay, openModal, sb, toast, waLink } from './core.js';
import { currentPath, head, loadRefs, route } from './shell.js';
import { PROSPECT_STATUS } from './prospects.js';
import { waUrl } from './whatsapp.js';

/* =====================================================================
   Stages : événements ponctuels envoyés par WhatsApp aux prospects et aux adhérents
   ===================================================================== */
export const stagesMissing = e => /stage|schema cache|does not exist|42P01|PGRST205/i.test(`${e?.code || ''} ${e?.message || ''}`);
export const stageWhen = st => `${longDay(st.stage_date)}${st.start_time ? `, de ${hhmm(st.start_time).replace(':', 'h')}${st.end_time ? ' à ' + hhmm(st.end_time).replace(':', 'h') : ''}` : ''}`;
export const stagePrice = st => st.price == null || st.price === '' ? '' : Number(st.price) === 0 ? 'Gratuit' : fmtMoney(st.price);
export const stageText = st => [
  `Bonjour [PRÉNOM] ! 👋`, '',
  `Le ${S.settings?.club_name || 'club'} organise un stage : *${st.title}*`, '',
  `📅 ${stageWhen(st).replace(/^./, c => c.toUpperCase())}`,
  st.place && `📍 ${st.place}`,
  stagePrice(st) && `💶 ${stagePrice(st)}`,
  st.audience && `👥 ${st.audience}`,
  st.description && `\n${st.description}`, '',
  `Pour t’inscrire, réponds simplement à ce message. À très vite sur le tatami !`,
].filter(x => x !== null && x !== undefined && x !== false && x !== 0).join('\n').replace(/\n{3,}/g, '\n\n');

export function stageForm(st, onSaved) {
  const v = st || { stage_date: isoDay(addDays(new Date(), 14)), start_time: S.settings?.default_start_time || '', end_time: S.settings?.default_end_time || '' };
  const f = (name, label, type = 'text', extra = '', attrs = '') => `<div class="field ${extra}"><label for="sg-${name}">${label}</label><input class="input" id="sg-${name}" name="${name}" type="${type}" value="${esc(type === 'time' ? hhmm(v[name]) : v[name] ?? '')}" ${attrs}></div>`;
  openModal({
    title: st ? 'Modifier le stage' : 'Nouveau stage',
    body: `<form id="sg" class="form-grid">
      ${f('title', 'Titre *', 'text', 'full', 'placeholder="ex : Stage 100 % féminin – Journée de la femme"')}
      ${f('stage_date', 'Date *', 'date')}${f('place', 'Lieu', 'text', '', `placeholder="${esc((S.settings?.rooms || [])[0] || 'ex : Dojo municipal')}" list="sg-rooms"`)}
      <datalist id="sg-rooms">${(S.settings?.rooms || []).map(r => `<option value="${esc(r)}">`).join('')}</datalist>
      ${f('start_time', 'Début', 'time')}${f('end_time', 'Fin', 'time')}
      ${f('price', 'Tarif (€)', 'number', '', 'step="0.01" min="0" placeholder="0 = gratuit, vide = non précisé"')}${f('audience', 'Public', 'text', '', 'placeholder="ex : Femmes, dès 15 ans"')}
      <div class="field full"><label for="sg-description">Ce que l’on trouvera dans ce stage</label><textarea class="input" id="sg-description" name="description" rows="6" placeholder="ex : 3 heures pour apprendre à se dégager d’une saisie, gérer le stress d’une agression et poser ses limites. Ouvert à toutes, débutantes bienvenues. Tenue de sport conseillée.">${esc(v.description || '')}</textarea></div>
    </form>`,
    foot: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="sg-save">Enregistrer</button>`,
    onMount: root => $('#sg-save', root).onclick = async () => {
      const form = $('#sg', root);
      const d = Object.fromEntries(['title', 'stage_date', 'start_time', 'end_time', 'place', 'price', 'audience', 'description'].map(k => [k, form[k].value.trim() || null]));
      if (!d.title || !d.stage_date) return toast('Le titre et la date sont obligatoires.', 'error');
      if (d.price != null) d.price = Number(d.price);
      const { error } = st ? await sb.from('stages').update(d).eq('id', st.id) : await sb.from('stages').insert(d);
      if (error) return fail(error);
      closeModal(); toast(st ? 'Stage modifié' : 'Stage créé'); onSaved?.();
    },
  });
}

export async function viewStages(view) {
  await loadRefs();
  const [sr, er] = await Promise.all([sb.from('stages').select('*').order('stage_date'), sb.from('stage_sends').select('stage_id, target_type, target_id')]);
  if (sr.error) {
    if (!stagesMissing(sr.error)) throw sr.error;
    view.innerHTML = head('Stages') + '<div class="alert error">Pour activer cette rubrique, exécutez une fois le fichier <strong>migration-11.sql</strong> dans Supabase → Éditeur SQL.</div>'; return;
  }
  const today = isoDay(new Date()), sends = er.data || [];
  const upcoming = sr.data.filter(x => x.stage_date >= today), past = sr.data.filter(x => x.stage_date < today).reverse();
  const count = (id, t) => new Set(sends.filter(x => x.stage_id === id && x.target_type === t).map(x => x.target_id)).size;
  const card = st => `<div class="card card-pad">
    <div class="row between wrap" style="gap:8px;align-items:flex-start"><div style="min-width:0"><h2 style="margin:0 0 4px">${esc(st.title)}</h2>
      <div class="small muted">${esc(stageWhen(st).replace(/^./, c => c.toUpperCase()))}${st.place ? ` · ${esc(st.place)}` : ''}${stagePrice(st) ? ` · ${esc(stagePrice(st))}` : ''}</div>
      ${st.audience ? `<div class="mt-xs"><span class="badge">${esc(st.audience)}</span></div>` : ''}</div>
      <div class="row" style="gap:4px"><button class="icon-btn" data-edit="${st.id}" aria-label="Modifier">${icon('edit')}</button><button class="icon-btn" data-del="${st.id}" aria-label="Supprimer">${icon('trash')}</button></div></div>
    ${st.description ? `<p class="small" style="white-space:pre-line;margin:10px 0 0">${esc(st.description)}</p>` : ''}
    <div class="small muted mt">Envoyé à ${count(st.id, 'prospect')} prospect(s) et ${count(st.id, 'member')} adhérent(s)</div>
    <div class="row wrap mt" style="gap:8px"><button class="btn btn-primary btn-sm" data-send="${st.id}:prospect">${icon('chat')}Envoyer aux prospects</button><button class="btn btn-primary btn-sm" data-send="${st.id}:member">${icon('chat')}Envoyer aux adhérents</button><button class="btn btn-sm" data-group="${st.id}">Partager dans un groupe</button></div>
  </div>`;
  view.innerHTML = head('Stages', 'Stages et événements ponctuels, à faire connaître par WhatsApp', `<button class="btn btn-primary" id="sg-new">${icon('plus')}Nouveau stage</button>`) + `
    ${upcoming.length ? `<div class="grid two">${upcoming.map(card).join('')}</div>` : '<div class="card empty">Aucun stage à venir. Créez-en un avec « Nouveau stage ».</div>'}
    ${past.length ? `<details class="mt"><summary class="section-title" style="cursor:pointer">Stages passés (${past.length})</summary><div class="grid two mt">${past.map(card).join('')}</div></details>` : ''}`;
  const byId = id => sr.data.find(x => x.id === id);
  $('#sg-new').onclick = () => stageForm(null, route);
  view.onclick = async e => {
    const t = e.target.closest('[data-edit],[data-del],[data-send],[data-group]'); if (!t) return;
    if (t.dataset.edit) return stageForm(byId(t.dataset.edit), route);
    if (t.dataset.send) { const [id, type] = t.dataset.send.split(':'); return stageSend(byId(id), type, sends); }
    if (t.dataset.group) return window.open(waUrl(null, stageText(byId(t.dataset.group)).replace('Bonjour [PRÉNOM] !', 'Bonjour à toutes et à tous !')), '_blank', 'noopener');
    if (t.dataset.del) {
      const st = byId(t.dataset.del);
      if (!await confirmBox('Supprimer le stage', `Supprimer « ${esc(st.title)} » ?`)) return;
      const { error } = await sb.from('stages').delete().eq('id', st.id);
      if (error) return fail(error);
      toast('Stage supprimé'); route();
    }
  };
}

// Envoi d'un stage : choix des destinataires (tous ou un par un), message prêt, envoi WhatsApp personne par personne
export async function stageSend(st, type, sends) {
  const isM = type === 'member';
  let people;
  if (isM) {
    const { data, error } = await sb.from('members').select('id, first_name, last_name, phone, birth_date, gender, guardian_name, guardian_phone, status').eq('status', 'actif').order('last_name');
    if (error) return fail(error);
    people = data.map(m => { const minor = (ageOf(m.birth_date) ?? 99) < 18 && m.guardian_phone;
      return { id: m.id, name: fullName(m), first: minor && m.guardian_name ? m.guardian_name.split(' ')[0] : m.first_name, phone: minor ? m.guardian_phone : m.phone, gender: m.gender, note: minor ? `responsable : ${m.guardian_name || 'parent'}` : '', minor: !!minor, child: m.first_name }; });
  } else {
    const { data, error } = await sb.from('prospects').select('id, first_name, last_name, phone, status').neq('status', 'inscrit').order('created_at', { ascending: false });
    if (error) return fail(error);
    people = data.map(p => ({ id: p.id, name: fullName(p), first: p.first_name, phone: p.phone, note: PROSPECT_STATUS[p.status] || '', off: p.status === 'abandon' }));
  }
  const sentAt = new Set(sends.filter(x => x.stage_id === st.id && x.target_type === type).map(x => x.target_id));
  const reachable = people.filter(x => waLink(x.phone));
  const noPhone = people.length - reachable.length;
  const personal = (tpl, x) => { const t = tpl.replace(/\[PR[ÉE]NOM\]/g, x.first || ''); return x.minor ? t.replace(/^(.*)$/m, `$1\n(message au sujet de ${x.child})`) : t; };
  openModal({
    title: `${esc(st.title)} · envoyer aux ${isM ? 'adhérents' : 'prospects'}`,
    body: `<div class="field"><label for="ss-msg">Message WhatsApp <span class="muted small">([PRÉNOM] est remplacé par le prénom de chacun)</span></label><textarea class="input" id="ss-msg" rows="9">${esc(stageText(st))}</textarea></div>
      <div class="row between wrap" style="gap:8px;margin:4px 0 8px"><strong id="ss-count"></strong>
        <div class="row wrap" style="gap:6px">${isM ? '<label class="check" style="margin:0"><input type="checkbox" id="ss-women"><span>Femmes uniquement</span></label>' : ''}
        <label class="check" style="margin:0"><input type="checkbox" id="ss-skip" checked><span>Sauf ceux qui l’ont déjà reçu</span></label>
        <button class="btn btn-sm" id="ss-all">Tous</button><button class="btn btn-sm" id="ss-none">Aucun</button></div></div>
      ${reachable.length ? `<div class="att-list" id="ss-list">${reachable.map(x => `<label class="att-row" data-id="${x.id}" data-g="${esc(x.gender || '')}"><input type="checkbox">
        <span class="avatar">${esc(initials({ first_name: x.name.split(' ')[0], last_name: x.name.split(' ').slice(1).join(' ') }))}</span>
        <span class="grow"><span class="att-name">${esc(x.name)}</span><span class="small muted">${esc([x.note, sentAt.has(x.id) ? 'déjà reçu' : ''].filter(Boolean).join(' · '))}</span></span>
        <a class="btn btn-sm" data-one="${x.id}" href="#" target="_blank" rel="noopener">${icon('chat')}Envoyer</a></label>`).join('')}</div>` : `<div class="empty">Aucun ${isM ? 'adhérent actif' : 'prospect'} avec un numéro de téléphone.</div>`}
      ${noPhone ? `<p class="small muted">${noPhone} ${isM ? 'adhérent(s)' : 'prospect(s)'} sans téléphone ne figure(nt) pas dans la liste.</p>` : ''}
      <p class="small muted">WhatsApp ne permet pas d’envoyer à plusieurs personnes d’un coup depuis un autre logiciel : le bouton ci-dessous ouvre le message déjà rédigé pour chaque personne cochée, l’une après l’autre. Il suffit de toucher « Envoyer » dans WhatsApp, puis de revenir ici.</p>`,
    foot: `<button class="btn" id="ss-close">Fermer</button><a class="btn btn-primary" id="ss-next" href="#" target="_blank" rel="noopener">${icon('chat')}Envoyer</a>`,
    onMount: root => {
      const list = $('#ss-list', root), msg = $('#ss-msg', root), next = $('#ss-next', root), done = new Set();
      const rows = () => list ? $$('.att-row', list) : [];
      const person = id => reachable.find(x => x.id === id);
      const select = () => {
        const women = $('#ss-women', root)?.checked, skip = $('#ss-skip', root).checked;
        rows().forEach(r => { const x = person(r.dataset.id), ok = !women || r.dataset.g === 'Femme'; r.style.display = ok ? '' : 'none'; $('input', r).checked = ok && !x.off && !(skip && sentAt.has(x.id)); });
        refresh();
      };
      const refresh = () => {
        rows().forEach(r => { r.classList.toggle('on', $('input', r).checked); const x = person(r.dataset.id); $('[data-one]', r).href = waUrl(x.phone, personal(msg.value, x)); });
        const queue = rows().filter(r => $('input', r).checked && !done.has(r.dataset.id));
        $('#ss-count', root).textContent = `${rows().filter(r => $('input', r).checked).length} destinataire(s) coché(s)${done.size ? ` · ${done.size} envoyé(s)` : ''}`;
        if (queue.length) { const x = person(queue[0].dataset.id); next.hidden = false; next.href = waUrl(x.phone, personal(msg.value, x)); next.dataset.id = x.id; next.innerHTML = `${icon('chat')}Envoyer à ${esc(x.name)} (${queue.length} restant${queue.length > 1 ? 's' : ''})`; }
        else { next.hidden = !done.size; next.removeAttribute('href'); next.innerHTML = done.size ? `${icon('check')}Terminé` : ''; next.dataset.id = ''; }
      };
      const mark = id => {
        done.add(id); sentAt.add(id);
        const r = rows().find(r => r.dataset.id === id); if (r) { $('input', r).checked = false; $('.small', r).textContent = [person(id).note, 'envoyé à l’instant'].filter(Boolean).join(' · '); }
        sends.push({ stage_id: st.id, target_type: type, target_id: id });
        sb.from('stage_sends').insert({ stage_id: st.id, target_type: type, target_id: id }).then(({ error }) => { if (error) toast('Message envoyé, mais l’envoi n’a pas pu être noté.', 'error'); });
        setTimeout(refresh, 50);
      };
      list?.addEventListener('change', refresh);
      list?.addEventListener('click', e => { const a = e.target.closest('[data-one]'); if (a) { e.stopPropagation(); mark(a.dataset.one); } else if (e.target.closest('a')) e.preventDefault(); });
      msg.oninput = refresh;
      $('#ss-close', root).onclick = () => { closeModal(); if (done.size && currentPath() === '/stages') route(); };
      $('#ss-all', root).onclick = () => { rows().forEach(r => $('input', r).checked = r.style.display !== 'none'); refresh(); };
      $('#ss-none', root).onclick = () => { rows().forEach(r => $('input', r).checked = false); refresh(); };
      $('#ss-skip', root).onchange = select; $('#ss-women', root) && ($('#ss-women', root).onchange = select);
      next.onclick = e => { if (!next.dataset.id) { e.preventDefault(); if (done.size) { closeModal(); if (currentPath() === '/stages') route(); } return; } mark(next.dataset.id); };
      select();
    },
  });
}
