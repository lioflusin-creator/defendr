// Defendr — WhatsApp
import { $, $$, MONTHS, S, esc, openModal, fmtDate, fmtDay, fullName, hhmm, icon, initials, isAdmin, isBirthdayMonth, isoDay, parseDay, sb, toast, waLink } from './core.js';
import { head } from './shell.js';

/* =====================================================================
   WhatsApp : anniversaires et sondages de présence
   ===================================================================== */
export const waUrl = (phone, text) => { const base = phone ? waLink(phone) : 'https://wa.me/'; return base ? `${base}?text=${encodeURIComponent(text)}` : null; };
export const DEFAULT_POLL = 'Bonjour ! 👊\n\nSondage de présence pour le cours *[COURS]*\ndu *[DATE]* à *[HEURE]*.\n\nSerez-vous présent(e) ?\n✅ Oui\n❌ Non\n\nMerci de répondre à ce message ! 🙏';
export const birthdayText = m => `Joyeux anniversaire ${m.first_name} ! 🎉🥳\nToute l’équipe du ${S.settings?.club_name || 'club'} te souhaite une excellente journée. À très vite sur le tatami ! 👊`;
S.wa = { course: '', custom: '' };

// Sondage de la semaine : le mardi qui suit le jour d'envoi, puis le jeudi juste après
export function weeklyPollDays(from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const tue = new Date(d); tue.setDate(d.getDate() + (((2 - d.getDay() + 7) % 7) || 7));
  const thu = new Date(tue); thu.setDate(tue.getDate() + 2);
  return [tue, thu];
}
// Pas de sondage si le mardi ou le jeudi tombe pendant les vacances d'été (juillet, août)
export const isSummerBreak = days => days.some(d => d.getMonth() === 6 || d.getMonth() === 7);
export function nextPollSunday(from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  for (let i = 0; i < 30 && isSummerBreak(weeklyPollDays(d)); i++) d.setDate(d.getDate() + 7);
  return d;
}
/* Carte « Sondage de la semaine » (page WhatsApp et tableau de bord du dimanche) */
export function weeklyPollCard(pollDays, linkToWa = false) {
  return `<div class="card card-pad mb" id="wa-week">
      <div class="row between wrap"><h2 style="margin:0">Sondage de la semaine</h2>${linkToWa ? '<a class="small" href="#/whatsapp">Page WhatsApp</a>' : ''}</div>
      <p class="small muted" style="margin-top:0">Les deux questions pour les cours du mardi et du jeudi qui arrivent, prêtes à coller dans un sondage WhatsApp.</p>
      ${isSummerBreak(pollDays) ? `<div class="alert info" style="margin:0">Pas de sondage cette semaine : vacances d’été (pas de cours en juillet et en août). Prochain sondage le <strong>${nextPollSunday().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>.</div>` : `${pollDays.map((d, i) => `<div class="bday"><div style="flex:1"><div style="font-weight:600">${i + 1}) ${esc(weeklyPollQuestion(d))}</div><div class="small muted">Réponses : Oui / Non</div></div>
        <button class="btn btn-sm ${i ? '' : 'btn-primary'}" data-wq="${i}">${icon('copy')}Copier</button></div>`).join('')}
      <p class="small muted mt" style="margin-bottom:0">Dans le groupe WhatsApp du club : touchez <strong>+</strong> (ou 📎) → <strong>Sondage</strong>, collez la question, écrivez <strong>Oui</strong> et <strong>Non</strong> comme réponses, puis envoyez. Recommencez pour la deuxième question.</p>`}
    </div>`;
}
export function bindWeeklyPoll(root, pollDays) {
  $$('[data-wq]', root).forEach(b => b.onclick = async () => {
    const q = weeklyPollQuestion(pollDays[Number(b.dataset.wq)]);
    try { await navigator.clipboard.writeText(q); toast('Question copiée : collez-la dans le sondage WhatsApp'); }
    catch { openModal({ title: 'Question du sondage', body: `<p class="small muted">Sélectionnez le texte et copiez-le.</p><textarea class="input" rows="2" readonly>${esc(q)}</textarea>`, foot: '<button class="btn btn-primary" data-close>Fermer</button>' }); }
  });
}
export const weeklyPollQuestion = day => `Qui sera présent(e) au cours du ${day.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} ?`;

export async function viewWhatsApp(view) {
  const today = isoDay(new Date());
  const [mr, cr] = await Promise.all([
    sb.from('members').select('id, first_name, last_name, phone, birth_date, status').eq('status', 'actif').order('last_name'),
    sb.from('courses').select('id, title, course_date, start_time, room').gte('course_date', today).order('course_date').order('start_time').limit(30),
  ]);
  if (mr.error) throw mr.error;
  if (cr.error) throw cr.error;
  const members = mr.data, courses = cr.data;
  const month = new Date().getMonth();
  const bdays = members.filter(m => isBirthdayMonth(m.birth_date, month)).sort((a, b) => Number(a.birth_date.slice(8)) - Number(b.birth_date.slice(8)));
  const isToday = m => m.birth_date.slice(5) === today.slice(5);
  const withPhone = members.filter(m => waLink(m.phone));
  const pollText = () => {
    const c = courses.find(x => x.id === S.wa.course);
    const tpl = (S.wa.custom || DEFAULT_POLL);
    return c ? tpl.replace(/\[COURS\]/g, c.title).replace(/\[DATE\]/g, parseDay(c.course_date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })).replace(/\[HEURE\]/g, hhmm(c.start_time).replace(':', 'h')) : tpl;
  };
  const bdayList = bdays.map(m => `${fmtDay(m.birth_date)} : ${fullName(m)} (${new Date().getFullYear() - Number(m.birth_date.slice(0, 4))} ans)`).join('\n');

  const pollDays = weeklyPollDays();
  view.innerHTML = head('WhatsApp', 'Anniversaires et sondages de présence') + `
    ${weeklyPollCard(pollDays)}
    <div class="grid two">
      <div class="card card-pad">
        <div class="row between"><h2 style="margin:0">Anniversaires de ${MONTHS[month]}</h2><span class="badge">${bdays.length}</span></div>
        <div class="mt">${bdays.length ? bdays.map(m => `<div class="bday"><div class="avatar">${esc(initials(m))}</div>
          <div style="flex:1"><div style="font-weight:600">${esc(fullName(m))}</div><div class="small muted">${fmtDay(m.birth_date)} · ${new Date().getFullYear() - Number(m.birth_date.slice(0, 4))} ans${isToday(m) ? ' · <strong style="color:var(--accent)">aujourd’hui</strong>' : ''}</div></div>
          ${waUrl(m.phone, birthdayText(m)) && m.phone ? `<a class="btn btn-sm ${isToday(m) ? 'btn-primary' : ''}" href="${esc(waUrl(m.phone, birthdayText(m)))}" target="_blank" rel="noopener">${icon('cake')}Souhaiter</a>` : '<span class="small muted">Pas de numéro</span>'}</div>`).join('') : '<div class="empty">Aucun anniversaire ce mois-ci.</div>'}</div>
        ${bdays.length && S.settings?.whatsapp_number ? `<a class="btn btn-block mt" href="${esc(waUrl(S.settings.whatsapp_number, `🎂 Anniversaires de ${MONTHS[month]} :\n${bdayList}`))}" target="_blank" rel="noopener">${icon('chat')}M’envoyer la liste sur WhatsApp</a>` : ''}
        ${bdays.length && !S.settings?.whatsapp_number && isAdmin() ? `<p class="small muted mt">Ajoutez votre numéro WhatsApp dans les <a href="#/parametres">Paramètres</a> pour vous envoyer la liste.</p>` : ''}
      </div>

      <div class="card card-pad">
        <h2>Sondage de présence</h2>
        <div class="field"><label for="wa-course">Cours *</label><select class="input" id="wa-course"><option value="">Choisir un cours…</option>${courses.map(c => `<option value="${c.id}" ${c.id === S.wa.course ? 'selected' : ''}>${esc(fmtDate(c.course_date))} ${hhmm(c.start_time)} · ${esc(c.title)}</option>`).join('')}</select>
          ${courses.length ? '' : '<span class="help">Aucune séance à venir : créez-en une dans le <a href="#/planning">Planning</a>.</span>'}</div>
        <div class="field"><label for="wa-custom">Message personnalisé (facultatif)</label><textarea class="input" id="wa-custom" rows="4" placeholder="Laissez vide pour utiliser le message par défaut. Vous pouvez utiliser [COURS], [DATE] et [HEURE].">${esc(S.wa.custom)}</textarea></div>
        <div class="field"><label>Aperçu du message</label><div class="wa-preview" id="wa-preview"></div></div>
        <div class="actions">
          <a class="btn btn-primary" id="wa-group" target="_blank" rel="noopener">${icon('chat')}Envoyer dans un groupe</a>
          <button class="btn" id="wa-copy">${icon('copy')}Copier le message</button>
        </div>
        <p class="small muted">« Envoyer dans un groupe » ouvre WhatsApp avec le message prêt : choisissez le groupe du club, puis envoyez.</p>
      </div>
    </div>

    <div class="card mt">
      <div class="card-pad" style="padding-bottom:6px"><div class="row between wrap"><h2 style="margin:0">Envoi individuel</h2><span class="small muted">${withPhone.length} membre(s) actif(s) avec téléphone</span></div>
      <p class="small muted" id="wa-ind-help">${S.wa.course ? 'Chaque bouton ouvre WhatsApp avec le sondage prêt pour cette personne.' : 'Choisissez d’abord un cours pour activer l’envoi.'}</p></div>
      <div class="list" id="wa-ind">${members.map(m => `<div class="list-item" style="cursor:default"><div class="avatar">${esc(initials(m))}</div>
        <div class="grow"><div style="font-weight:600">${esc(fullName(m))}</div><div class="small muted">${esc(m.phone || 'Pas de numéro')}</div></div>
        ${waLink(m.phone) ? `<a class="btn btn-sm wa-send" data-phone="${esc(m.phone)}" target="_blank" rel="noopener">${icon('chat')}Envoyer</a>` : ''}</div>`).join('')}</div>
    </div>`;

  const refresh = () => {
    const txt = pollText(), ok = !!S.wa.course;
    $('#wa-preview').textContent = txt;
    const g = $('#wa-group');
    g.href = ok ? waUrl(null, txt) : '#'; g.classList.toggle('disabled', !ok); g.setAttribute('aria-disabled', String(!ok));
    $$('.wa-send', view).forEach(a => { a.href = ok ? waUrl(a.dataset.phone, txt) : '#'; a.classList.toggle('disabled', !ok); });
    $('#wa-ind-help').textContent = ok ? 'Chaque bouton ouvre WhatsApp avec le sondage prêt pour cette personne.' : 'Choisissez d’abord un cours pour activer l’envoi.';
  };
  refresh();
  $('#wa-course').onchange = e => { S.wa.course = e.target.value; refresh(); };
  $('#wa-custom').oninput = e => { S.wa.custom = e.target.value; refresh(); };
  view.addEventListener('click', e => { const a = e.target.closest('a.disabled'); if (a) { e.preventDefault(); toast('Choisissez d’abord un cours.', 'error'); } });
  bindWeeklyPoll(view, pollDays);
  $('#wa-copy').onclick = async () => {
    if (!S.wa.course) return toast('Choisissez d’abord un cours.', 'error');
    try { await navigator.clipboard.writeText(pollText()); toast('Message copié'); }
    catch { toast('Copie impossible : sélectionnez le texte de l’aperçu.', 'error'); }
  };
}
