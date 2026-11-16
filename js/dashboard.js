// Defendr — Tableau de bord
import { $, $$, MONTHS, S, activeSeason, addDays, ageOf, esc, fail, fmtDate, fmtDay, fmtMoney, fullName, icon, initials, isAdmin, isBirthdayMonth, isoDay, sb, toast, waLink } from './core.js';
import { head, route } from './shell.js';
import { openRegistrations } from './inscriptions.js';
import { dashProspects } from './prospects.js';
import { lastBackup } from './backup.js';
import { dropoutInfo } from './planning.js';
import { bindWeeklyPoll, isSummerBreak, waUrl, weeklyPollCard, weeklyPollDays } from './whatsapp.js';

/* =====================================================================
   Tableau de bord
   ===================================================================== */
/* Justificatif de santé : un certificat médical OU un QSS rempli (« tout non ») suffit */
export const hasHealthDoc = m => !!(m.medical_certificate || m.qss);
export function healthBadge(m, short = false) {
  if (m.medical_certificate) return `<span class="badge ok">${short ? 'Certificat' : 'Certificat ✓'}</span>`;
  if (m.qss) return `<span class="badge ok">${short ? 'QSS' : 'QSS ✓'}</span>`;
  return `<span class="badge warn">${short ? 'Certificat' : 'Certificat / QSS manquant'}</span>`;
}

/* Documents et autorisations à relancer pour un membre actif */
export function memberIssues(m) {
  if (m.status !== 'actif') return [];
  const out = [], today = new Date(), soon = isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30)), now = isoDay(today);
  const waiverValid = m.medical_waiver && m.medical_waiver_validity && m.medical_waiver_validity >= now;
  if (!hasHealthDoc(m)) {
    const ask = 'un certificat médical ou le questionnaire de santé (QSS)';
    if (m.medical_waiver && m.medical_waiver_validity && m.medical_waiver_validity < now) out.push({ label: `Décharge expirée le ${fmtDate(m.medical_waiver_validity)}`, cls: 'danger', ask: `${ask} (ta décharge a expiré)` });
    else if (waiverValid && m.medical_waiver_validity <= soon) out.push({ label: `Décharge expire le ${fmtDate(m.medical_waiver_validity)}`, cls: 'warn', ask: `${ask} avant le ${fmtDay(m.medical_waiver_validity)}` });
    else if (!waiverValid) out.push({ label: 'Certificat / QSS manquant', cls: 'warn', ask });
  }
  const age = ageOf(m.birth_date);
  if (age != null && age < 18) {
    if (!m.parental_authorization) out.push({ label: 'Autorisation parentale', cls: 'danger', ask: 'l’autorisation parentale signée' });
    if (!m.guardian_name || !m.guardian_phone) out.push({ label: 'Responsable légal à compléter', cls: 'warn', ask: 'les coordonnées du responsable légal' });
  }
  return out;
}
export function reminderLink(m, issues) {
  const minor = (ageOf(m.birth_date) ?? 99) < 18;
  const phone = minor && m.guardian_phone ? m.guardian_phone : m.phone;
  if (!waLink(phone)) return null;
  const who = minor && m.guardian_phone ? `Bonjour${m.guardian_name ? ' ' + m.guardian_name.split(' ')[0] : ''},\n\npour l’inscription de ${m.first_name}` : `Bonjour ${m.first_name},\n\npour ton inscription`;
  return waUrl(phone, `${who} au ${S.settings?.club_name || 'club'}, il nous manque encore :\n${issues.map(i => '• ' + i.ask).join('\n')}\n\nMerci de nous le transmettre au prochain cours 🙏`);
}

export async function viewDashboard(view) {
  const season = activeSeason();
  const membersQ = sb.from('members').select('*');
  const coursesQ = season ? sb.from('courses').select('id', { count: 'exact', head: true }).eq('season_id', season.id) : sb.from('courses').select('id', { count: 'exact', head: true });
  const payQ = isAdmin() ? (season ? sb.from('payments').select('id, amount, status, payment_date, due_date, payment_type, member_id, method, bank_checked').eq('season_id', season.id).eq('archived', false) : sb.from('payments').select('id, amount, status, payment_date, due_date, payment_type, member_id, method, bank_checked').eq('archived', false)) : null;
  const expQ = isAdmin() ? (season ? sb.from('expenses').select('amount').eq('season_id', season.id).eq('archived', false) : sb.from('expenses').select('amount').eq('archived', false)) : null;
  const [mr, cr, pr, er] = await Promise.all([membersQ, coursesQ, payQ, expQ]);
  for (const r of [mr, cr, pr, er]) if (r?.error) throw r.error;
  const members = mr.data;
  const active = members.filter(m => m.status === 'actif');
  const noCert = active.filter(m => !hasHealthDoc(m));
  const month = new Date().getMonth();
  const bdays = members.filter(m => m.status === 'actif' && isBirthdayMonth(m.birth_date, month))
    .sort((a, b) => new Date(a.birth_date).getDate() - new Date(b.birth_date).getDate());
  const byDisc = S.disciplines.map(d => ({ name: d.name, n: active.filter(m => m.discipline_id === d.id).length })).filter(x => x.n > 0);
  const maxDisc = Math.max(1, ...byDisc.map(x => x.n));

  let money = '', lastPays = '';
  if (isAdmin()) {
    const pays = pr.data, paid = pays.filter(p => p.status === 'payé').reduce((s, p) => s + Number(p.amount), 0);
    const pending = pays.filter(p => p.status === 'en attente');
    const exp = er.data.reduce((s, e) => s + Number(e.amount), 0);
    const net = Number(season?.opening_balance || 0) + paid - exp;
    money = `
      <div class="card stat accent"><div class="label">Revenus encaissés</div><div class="value">${fmtMoney(paid)}</div><div class="hint">Solde net ${fmtMoney(net)}</div></div>
      <div class="card stat"><div class="label">Paiements en attente</div><div class="value">${pending.length}</div><div class="hint">${fmtMoney(pending.reduce((s, p) => s + Number(p.amount), 0))}</div></div>`;
    const mName = id => { const m = members.find(x => x.id === id); return m ? fullName(m) : 'Hors adhérent'; };
    const recent = [...pays].sort((a, b) => b.payment_date.localeCompare(a.payment_date)).slice(0, 5);
    lastPays = `<div class="card card-pad"><h2>Derniers paiements</h2>${recent.length ? recent.map(p => `
      <div class="bday"><div class="grow" style="flex:1"><div style="font-weight:600">${esc(p.member_id ? mName(p.member_id) : (p.notes || 'Hors adhérent'))}</div><div class="small muted">${fmtDate(p.payment_date)} · ${esc(p.payment_type)}</div></div>
      <div style="text-align:right"><div style="font-weight:700">${fmtMoney(p.amount)}</div><span class="badge ${p.status === 'payé' ? 'ok' : 'warn'}">${p.status === 'payé' ? 'Payé' : 'En attente'}</span></div></div>`).join('') : '<div class="empty">Aucun paiement pour l’instant.</div>'}</div>`;

    // Chèques à déposer : chèques non pointés dont l'encaissement est dû d'ici 7 jours
    const today = isoDay(new Date()), week = isoDay(addDays(new Date(), 7));
    const cheques = pays.filter(p => /ch[eè]que/i.test(p.method || '') && p.status === 'payé' && !p.bank_checked && (p.due_date || p.payment_date) <= week)
      .sort((a, b) => (a.due_date || a.payment_date).localeCompare(b.due_date || b.payment_date));
    const later = pays.filter(p => /ch[eè]que/i.test(p.method || '') && p.status === 'payé' && !p.bank_checked && (p.due_date || p.payment_date) > week);
    lastPays += `<div class="card card-pad"><div class="row between"><h2 style="margin:0">Chèques à déposer</h2><span class="badge ${cheques.length ? 'warn' : 'ok'}">${cheques.length}</span></div>
      <div class="small muted mb">Chèques à encaisser d’ici une semaine${later.length ? ` · ${later.length} autre(s) plus tard (${fmtMoney(later.reduce((s, p) => s + Number(p.amount), 0))})` : ''}.</div>
      ${cheques.length ? cheques.map(p => { const d = p.due_date || p.payment_date; return `<div class="bday"><div style="flex:1"><div style="font-weight:600">${esc(mName(p.member_id))} · ${fmtMoney(p.amount)}</div><div class="small muted">${d < today ? `<span style="color:var(--danger)">prévu le ${fmtDate(d)}</span>` : `à déposer le ${fmtDate(d)}`}</div></div><button class="btn btn-sm" data-deposit="${p.id}">${icon('check')}Déposé</button></div>`; }).join('') : '<div class="empty" style="padding:16px">Aucun chèque à déposer cette semaine.</div>'}
    </div>`;

    // Soldes impayés de la saison
    const paidBy = {}; pays.filter(p => p.status === 'payé').forEach(p => { paidBy[p.member_id] = (paidBy[p.member_id] || 0) + Number(p.amount); });
    const unpaid = active.map(m => ({ m, due: Number(m.fee_amount || 0) - (paidBy[m.id] || 0) })).filter(x => x.due > 0).sort((a, b) => b.due - a.due);
    lastPays += `<div class="card card-pad"><div class="row between"><h2 style="margin:0">Soldes impayés</h2><span class="badge ${unpaid.length ? 'danger' : 'ok'}">${fmtMoney(unpaid.reduce((s, x) => s + x.due, 0))}</span></div>
      <div class="mt">${unpaid.length ? unpaid.map(({ m, due }) => { const minor = (ageOf(m.birth_date) ?? 99) < 18, phone = minor && m.guardian_phone ? m.guardian_phone : m.phone;
        const link = waLink(phone) ? waUrl(phone, `Bonjour ${minor && m.guardian_name ? m.guardian_name.split(' ')[0] : m.first_name},\n\npetit rappel du ${S.settings?.club_name || 'club'} : il reste ${fmtMoney(due)} à régler pour la cotisation ${season ? season.label : ''}${minor ? ' de ' + m.first_name : ''}.\nTu peux régler par chèque, virement ou espèces au prochain cours.\n\nMerci ! 🙏`) : null;
        return `<div class="bday"><a href="#/membres/${m.id}" style="flex:1;text-decoration:none"><div style="font-weight:600">${esc(fullName(m))}</div><div class="small muted">reste ${fmtMoney(due)} sur ${fmtMoney(m.fee_amount)}</div></a>${link ? `<a class="btn btn-sm" href="${esc(link)}" target="_blank" rel="noopener">${icon('chat')}Relancer</a>` : ''}</div>`; }).join('') : '<div class="empty" style="padding:16px">Toutes les cotisations sont réglées 👏</div>'}</div>
    </div>`;
  } else {
    money = `<div class="card stat"><div class="label">Certificats / QSS manquants</div><div class="value">${noCert.length}</div><div class="hint">membres actifs</div></div>
      <div class="card stat"><div class="label">Anniversaires</div><div class="value">${bdays.length}</div><div class="hint">ce mois-ci</div></div>`;
  }

  // Le dimanche : les questions du sondage de la semaine, directement sur l'accueil (hors vacances d'été)
  const sundayPoll = new Date().getDay() === 0 && !isSummerBreak(weeklyPollDays()) ? weeklyPollDays() : null;
  view.innerHTML = head('Tableau de bord', `Vue d'ensemble de votre club${season ? ' · saison ' + esc(season.label) : ''}`) + `
    <div id="dash-regs"></div><div id="dash-prospects"></div><div id="dash-dropouts"></div>
    ${sundayPoll ? weeklyPollCard(sundayPoll, true) : ''}
    ${isAdmin() && (!lastBackup() || Date.now() - new Date(lastBackup()) > 31 * 86400000) ? `<div class="alert info">Pensez à télécharger une sauvegarde de vos données : <a href="#/parametres">Paramètres → Sauvegarde</a>.</div>` : ''}
    ${!season && isAdmin() ? `<div class="alert info">Aucune saison active. <a href="#/parametres">Créez la saison en cours dans les Paramètres</a> pour suivre la comptabilité par saison.</div>` : ''}
    <div class="grid stats mb">
      <div class="card stat"><div class="label">Membres actifs</div><div class="value">${active.length}</div><div class="hint">${members.length} inscrits au total</div></div>
      <div class="card stat"><div class="label">Cours</div><div class="value">${cr.count ?? 0}</div><div class="hint">${season ? 'cette saison' : 'au total'}</div></div>
      ${money}
    </div>
    <div class="grid two">
      ${(() => {
        const todo = active.map(m => ({ m, issues: memberIssues(m) })).filter(x => x.issues.length)
          .sort((a, b) => b.issues.filter(i => i.cls === 'danger').length - a.issues.filter(i => i.cls === 'danger').length || b.issues.length - a.issues.length);
        return `<div class="card card-pad"><div class="row between"><h2 style="margin:0">À relancer</h2><span class="badge ${todo.length ? 'warn' : 'ok'}">${todo.length}</span></div>
          <div class="small muted mb">Documents de santé et autorisations à récupérer.</div>
          ${todo.length ? todo.slice(0, 6).map(({ m, issues }) => { const link = reminderLink(m, issues); return `<div class="bday"><a href="#/membres/${m.id}" style="flex:1;text-decoration:none;min-width:0"><div style="font-weight:600">${esc(fullName(m))}</div><div class="row wrap" style="gap:4px;margin-top:3px">${issues.map(i => `<span class="badge ${i.cls}">${esc(i.label)}</span>`).join('')}</div></a>${link ? `<a class="btn btn-sm" href="${esc(link)}" target="_blank" rel="noopener">${icon('chat')}Relancer</a>` : ''}</div>`; }).join('') + (todo.length > 6 ? `<a class="btn btn-sm mt" href="#/membres" data-filter="relancer">Voir les ${todo.length} membres à relancer</a>` : '') : '<div class="empty" style="padding:16px">Tous les dossiers sont complets 👏</div>'}
        </div>`;
      })()}
      <div class="card card-pad"><h2>Anniversaires de ${MONTHS[month]}</h2>
        ${bdays.length ? bdays.map(m => `<a class="bday" href="#/membres/${m.id}" style="text-decoration:none"><div class="avatar">${esc(initials(m))}</div><div style="flex:1"><div style="font-weight:600">${esc(fullName(m))}</div><div class="small muted">${fmtDay(m.birth_date)} · ${new Date().getFullYear() - Number(m.birth_date.slice(0, 4))} ans</div></div>${new Date(m.birth_date + 'T00:00:00').getDate() === new Date().getDate() ? '<span class="badge accent">Aujourd’hui</span>' : ''}</a>`).join('') : '<div class="empty">Aucun anniversaire ce mois-ci.</div>'}
      </div>
      <div class="card card-pad"><h2>Disciplines</h2>
        ${byDisc.length ? `<div class="bars">${byDisc.map(x => `<div class="bar-row"><span>${esc(x.name)}</span><div class="bar"><span style="width:${(x.n / maxDisc) * 100}%"></span></div><strong>${x.n}</strong></div>`).join('')}</div>` : '<div class="empty">Aucun membre actif rattaché à une discipline.</div>'}
        ${noCert.length && isAdmin() ? `<div class="mt"><a href="#/membres" data-filter="certificat" class="badge warn" style="text-decoration:none">${noCert.length} certificat(s) ou QSS manquant(s)</a></div>` : ''}
      </div>
      ${lastPays}
    </div>`;
  $$('[data-filter]', view).forEach(a => a.onclick = () => { S.memberFilter = a.dataset.filter; });
  sb.from('registrations').select('id', { count: 'exact', head: true }).eq('status', 'nouvelle').then(({ count }) => {
    if (count && $('#dash-regs')) $('#dash-regs').innerHTML = `<div class="alert info row between wrap" style="gap:8px"><span><strong>${count} nouvelle${count > 1 ? 's' : ''} demande${count > 1 ? 's' : ''} d’inscription</strong> en ligne.</span><button class="btn btn-sm btn-primary" id="dash-open-regs">Voir</button></div>`;
    $('#dash-open-regs') && ($('#dash-open-regs').onclick = openRegistrations);
  });
  dashProspects();
  dropoutInfo(members).then(d => {
    const n = Object.keys(d).length, box = $('#dash-dropouts');
    if (!n || !box) return;
    box.innerHTML = `<div class="alert info row between wrap" style="gap:8px"><span>${n} membre${n > 1 ? 's' : ''} absent${n > 1 ? 's' : ''} depuis 3 semaines ou plus : un petit message peut éviter un abandon.</span><a class="btn btn-sm" href="#/membres" id="dash-ab">Voir</a></div>`;
    $('#dash-ab').onclick = () => { S.memberFilter = 'absents'; };
  }).catch(e => console.error(e));
  if (sundayPoll) bindWeeklyPoll(view, sundayPoll);
  $$('[data-deposit]', view).forEach(b => b.onclick = async () => {
    b.disabled = true;
    const { error } = await sb.from('payments').update({ bank_checked: true }).eq('id', b.dataset.deposit);
    if (error) { b.disabled = false; return fail(error); }
    toast('Chèque marqué comme déposé et pointé'); route();
  });
}
