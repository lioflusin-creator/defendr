// Defendr — Statistiques
import { $, $$, S, activeSeason, esc, fail, fmtDate, fullName, icon, initials, isAdmin, parseDay, sb } from './core.js';
import { head, route } from './shell.js';
import { seasonStart } from './inscriptions.js';
import { PROSPECT_SOURCE } from './prospects.js';
import { attendanceFor, seasonSessionsWithCall } from './planning.js';
import { printAgReport } from './print.js';

/* =====================================================================
   Statistiques d'inscription (page Statistiques)
   ===================================================================== */
export async function registrationStats(box) {
  if (!box) return;
  const se = activeSeason(), start = se ? seasonStart(se) : '1900-01-01';
  const [pr, mr] = await Promise.all([sb.from('prospects').select('*'), sb.from('members').select('id, registration_date, how_found, renewed_season_id, status')]);
  if (mr.error) return;
  const pros = (pr.data || []).filter(p => p.created_at.slice(0, 10) >= start);
  const conv = pros.filter(p => p.status === 'inscrit');
  const delays = conv.filter(p => p.converted_at).map(p => (new Date(p.converted_at) - new Date(p.created_at)) / 86400000);
  const tried = pros.filter(p => p.trial_present), triedConv = tried.filter(p => p.status === 'inscrit');
  const newMembers = mr.data.filter(m => (m.registration_date || '') >= start);
  const renewed = se ? mr.data.filter(m => m.renewed_season_id === se.id).length : 0;
  const pct = (a, b) => b ? Math.round(a / b * 100) + ' %' : '—';
  const bars = (rows) => { const max = Math.max(1, ...rows.map(r => r[1])); return rows.length ? `<div class="bars">${rows.map(([l, n, extra]) => `<div class="bar-row"><span>${esc(l)}</span><div class="bar"><span style="width:${n / max * 100}%"></span></div><strong>${n}</strong></div>${extra ? `<div class="small muted" style="margin:-4px 0 4px">${extra}</div>` : ''}`).join('')}</div>` : '<div class="empty">Pas encore de données.</div>'; };
  const bySource = Object.entries(PROSPECT_SOURCE).map(([k, l]) => { const g = pros.filter(p => p.source === k); return [l, g.length, g.length ? `${g.filter(p => p.status === 'inscrit').length} inscrit(s) · ${pct(g.filter(p => p.status === 'inscrit').length, g.length)}` : '']; }).filter(r => r[1]);
  const found = {}; newMembers.forEach(m => { const k = m.how_found || 'Non renseigné'; found[k] = (found[k] || 0) + 1; });
  box.innerHTML = `<div class="grid two">
    <div class="card card-pad"><h2>Inscriptions${se ? ' ' + esc(se.label) : ''}</h2><dl class="kv">
      <dt>Nouveaux adhérents</dt><dd><strong>${newMembers.length}</strong></dd>
      <dt>Réinscriptions</dt><dd><strong>${renewed}</strong></dd>
      ${pr.error ? '' : `<dt>Prospects</dt><dd><strong>${pros.length}</strong> dont ${conv.length} inscrit(s)</dd>
      <dt>Taux de transformation</dt><dd><strong>${pct(conv.length, pros.length)}</strong></dd>
      <dt>Après un cours d’essai</dt><dd><strong>${pct(triedConv.length, tried.length)}</strong> <span class="muted small">(${triedConv.length} sur ${tried.length} venu(e)s)</span></dd>
      <dt>Délai moyen</dt><dd><strong>${delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) + ' jour(s)' : '—'}</strong> <span class="muted small">entre premier contact et inscription</span></dd>`}
    </dl></div>
    <div class="card card-pad"><h2>D’où viennent-ils ?</h2>
      ${pr.error ? '' : `<div class="section-title" style="font-size:13px">Prospects, par origine</div>${bars(bySource)}`}
      <div class="section-title mt" style="font-size:13px">Nouveaux adhérents : « comment avez-vous connu le club ? »</div>${bars(Object.entries(found).sort((a, b) => b[1] - a[1]))}
    </div></div>`;
}

/* =====================================================================
   Statistiques d'assiduité
   ===================================================================== */
S.stats = { filter: 'tous', sort: 'taux' };

export async function viewStats(view) {
  const sessions = await seasonSessionsWithCall();
  const ids = sessions.map(s => s.id);
  const [mr, ar] = await Promise.all([
    sb.from('members').select('id, first_name, last_name, status, registration_date, level_id').eq('status', 'actif'),
    ids.length ? sb.from('attendances').select('course_id, member_id').eq('present', true).in('course_id', ids) : { data: [] },
  ]);
  if (mr.error) throw mr.error;
  if (ar.error) throw ar.error;
  const byMember = {};
  ar.data.forEach(a => (byMember[a.member_id] ||= new Set()).add(a.course_id));
  const rows = mr.data.map(m => ({ m, ...attendanceFor(m, sessions, byMember[m.id] || new Set()) }));
  const t = S.settings || {};
  const cats = [
    { k: 'Assidu', cls: 'ok', hint: `≥ ${t.threshold_assidu ?? 70} % de présence` },
    { k: 'Régulier', cls: 'accent', hint: `${t.threshold_regulier ?? 45}–${(t.threshold_assidu ?? 70) - 1} %` },
    { k: 'À risque', cls: 'warn', hint: `${t.threshold_risque ?? 25}–${(t.threshold_regulier ?? 45) - 1} %` },
    { k: 'Quasi-absent', cls: 'danger', hint: `< ${t.threshold_risque ?? 25} %` },
  ];
  const withSessions = rows.filter(r => r.sessions.length);
  const noSession = rows.filter(r => !r.sessions.length);
  const avgRate = withSessions.length ? Math.round(withSessions.reduce((s, r) => s + r.rate, 0) / withSessions.length) : 0;
  const perSession = sessions.slice().reverse().map(s => ({ s, n: ar.data.filter(a => a.course_id === s.id).length }));
  const avgPresent = perSession.length ? (perSession.reduce((s, x) => s + x.n, 0) / perSession.length) : 0;
  const maxN = Math.max(1, ...perSession.map(x => x.n));

  view.innerHTML = head('Statistiques', `Assiduité de la saison${activeSeason() ? ' ' + esc(activeSeason().label) : ''}, calculée pour chaque adhérent depuis son inscription`,
    isAdmin() ? `<button class="btn" id="ag-report">${icon('file')}Rapport pour l’AG</button>` : '') + `
    <div class="grid stats mb">
      ${cats.map(c => { const n = withSessions.filter(r => r.label === c.k).length; return `<button class="card stat stat-btn ${S.stats.filter === c.k ? 'sel' : ''}" data-cat="${c.k}"><div class="label"><span class="dot ${c.cls}"></span>${c.k}</div><div class="value">${n}</div><div class="hint">adhérent(s) · ${c.hint}</div></button>`; }).join('')}
    </div>
    <div class="grid two mb">
      <div class="card card-pad"><h2>En chiffres</h2><dl class="kv">
        <dt>Séances avec appel</dt><dd><strong>${sessions.length}</strong></dd>
        <dt>Présents par séance</dt><dd><strong>${avgPresent.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</strong> en moyenne</dd>
        <dt>Taux moyen</dt><dd><strong>${avgRate} %</strong> par adhérent</dd>
        <dt>Adhérents actifs</dt><dd><strong>${rows.length}</strong>${noSession.length ? ` <span class="muted small">(${noSession.length} sans séance depuis l’inscription)</span>` : ''}</dd>
      </dl></div>
      <div class="card card-pad"><h2>Présents par séance</h2>
        ${perSession.length ? `<div class="spark" role="img" aria-label="Nombre de présents à chacune des ${perSession.length} séances">${perSession.slice(-24).map(x => `<div class="spark-col" title="${esc(fmtDate(x.s.course_date))} · ${esc(x.s.title)} : ${x.n} présent(s)"><span class="spark-n">${x.n}</span><div class="spark-bar" style="height:${Math.max(4, x.n / maxN * 100)}%"></div><span class="spark-d">${parseDay(x.s.course_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' })}</span></div>`).join('')}</div>` : '<div class="empty">Aucun appel enregistré pour l’instant.</div>'}
      </div>
    </div>
    <div id="st-regs" class="mb"></div>
    <div class="toolbar between">
      <h2 class="section-title" style="margin:0">Détail par adhérent ${S.stats.filter !== 'tous' ? `<span class="badge">${esc(S.stats.filter)}</span> <button class="link small" id="clear-f" style="text-transform:none;letter-spacing:0">tout afficher</button>` : ''}</h2>
      <div class="chips">${[['taux', 'Par taux'], ['nom', 'Par nom']].map(([k, l]) => `<button class="chip ${S.stats.sort === k ? 'active' : ''}" data-sort="${k}">${l}</button>`).join('')}</div>
    </div>
    <div class="card"><div class="list" id="st-list"></div></div>`;

  const list = rows.filter(r => S.stats.filter === 'tous' || (r.sessions.length && r.label === S.stats.filter))
    .sort((a, b) => S.stats.sort === 'nom' ? fullName(a.m).localeCompare(fullName(b.m), 'fr') : (b.sessions.length ? b.rate : -1) - (a.sessions.length ? a.rate : -1) || b.present - a.present);
  $('#st-list').innerHTML = list.length ? list.map(r => `
    <a class="list-item" href="#/membres/${r.m.id}" style="text-decoration:none">
      <div class="avatar">${esc(initials(r.m))}</div>
      <div class="grow"><div style="font-weight:600">${esc(fullName(r.m))}</div>
        <div class="small muted">${r.sessions.length ? `${r.present} présent(s) · ${r.sessions.length - r.present} manquée(s) sur ${r.sessions.length} séance(s)` : 'Aucune séance depuis l’inscription'}${r.m.registration_date ? ' · inscrit(e) le ' + fmtDate(r.m.registration_date) : ''}</div>
        ${r.sessions.length ? `<div class="bar mt-xs"><span style="width:${r.rate}%;background:var(--${r.cls === 'accent' ? 'accent' : r.cls})"></span></div>` : ''}</div>
      <div class="right"><strong style="font-size:18px">${r.sessions.length ? r.rate + ' %' : '—'}</strong>${r.sessions.length ? `<span class="badge ${r.cls}">${r.label}</span>` : '<span class="badge">Nouveau</span>'}</div>
    </a>`).join('') : '<div class="empty">Aucun adhérent dans cette catégorie.</div>';

  $('#ag-report') && ($('#ag-report').onclick = async () => {
    const btn = $('#ag-report'); btn.disabled = true;
    try { await printAgReport({ sessions, rows, avgPresent, avgRate, cats }); } catch (e) { fail(e); }
    btn.disabled = false;
  });
  $$('[data-cat]', view).forEach(b => b.onclick = () => { S.stats.filter = S.stats.filter === b.dataset.cat ? 'tous' : b.dataset.cat; route(); });
  $$('[data-sort]', view).forEach(b => b.onclick = () => { S.stats.sort = b.dataset.sort; route(); });
  $('#clear-f') && ($('#clear-f').onclick = () => { S.stats.filter = 'tous'; route(); });
}
