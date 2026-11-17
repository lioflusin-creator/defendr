// Defendr — Comptabilité et bilan
import { $, $$, S, activeSeason, closeModal, confirmBox, esc, fail, fmtDate, fmtMoney, fullName, icon, isoDay, openModal, parseDay, readForm, sb, toast } from './core.js';
import { go, head, route } from './shell.js';
import { printAgDossier, printDoc } from './print.js';

/* =====================================================================
   Comptabilité
   ===================================================================== */
export const METHODS = ['Virement', 'Chèque', 'Espèces', 'Carte bancaire', 'Prélèvement', 'Autre'];
S.acc = { tab: 'paiements', status: 'tous', archives: false, search: '' };

export async function loadAccounting() {
  const season = activeSeason();
  const sq = q => season ? q.eq('season_id', season.id) : q;
  const [pr, er, mr] = await Promise.all([
    sq(sb.from('payments').select('*')).order('payment_date', { ascending: false }),
    sq(sb.from('expenses').select('*')).order('expense_date', { ascending: false }),
    sb.from('members').select('id, first_name, last_name, status, fee_amount').order('last_name'),
  ]);
  for (const r of [pr, er, mr]) if (r.error) throw r.error;
  return { season, payments: pr.data, expenses: er.data, members: mr.data };
}
export function accountingTotals({ season, payments, expenses }) {
  const live = payments.filter(p => !p.archived), liveE = expenses.filter(e => !e.archived);
  const sum = a => a.reduce((s, x) => s + Number(x.amount), 0);
  const paid = sum(live.filter(p => p.status === 'payé')), pending = sum(live.filter(p => p.status === 'en attente'));
  const exp = sum(liveE), opening = Number(season?.opening_balance || 0);
  const bankIn = sum(live.filter(p => p.status === 'payé' && p.bank_checked)), bankOut = sum(liveE.filter(e => e.bank_checked));
  const balance = opening + paid - exp, current = opening + bankIn - bankOut;
  // current : solde actuel (sommes pointées seulement) · balance : solde théorique (pointées + non pointées)
  // unchecked : en attente = recettes encaissées non pointées − dépenses non pointées
  return { paid, pending, exp, opening, balance, current, unchecked: balance - current, uncheckedIn: paid - bankIn, uncheckedOut: exp - bankOut, bankIn, bankOut, bank: bankIn - bankOut };
}
function accStatsHtml(T, season) {
  return {
    sub: `<strong>Solde actuel : ${fmtMoney(T.current)}</strong> · solde théorique ${fmtMoney(T.balance)} · ${fmtMoney(T.unchecked)} en attente de pointage${T.pending ? ` · ${fmtMoney(T.pending)} de paiements à recevoir` : ''}${season ? ' · saison ' + esc(season.label) : ''}`,
    cards: `
      <div class="card stat accent"><div class="label">Solde actuel</div><div class="value">${fmtMoney(T.current)}</div><div class="hint">Sommes pointées : ${fmtMoney(T.opening)} + ${fmtMoney(T.bankIn)} − ${fmtMoney(T.bankOut)}</div></div>
      <div class="card stat"><div class="label">Solde théorique</div><div class="value">${fmtMoney(T.balance)}</div><div class="hint">Pointé et non pointé : ${fmtMoney(T.opening)} + ${fmtMoney(T.paid)} − ${fmtMoney(T.exp)}</div></div>
      <div class="card stat"><div class="label">En attente</div><div class="value" style="color:var(--warn)">${fmtMoney(T.unchecked)}</div><div class="hint">Non pointé : ${fmtMoney(T.uncheckedIn)} − ${fmtMoney(T.uncheckedOut)}</div></div>
      <div class="card stat"><div class="label">Solde de départ</div><div class="value">${fmtMoney(T.opening)}</div><div class="hint">Début de saison</div></div>
      <div class="card stat"><div class="label">Encaissé</div><div class="value" style="color:var(--ok)">${fmtMoney(T.paid)}</div>${T.pending ? `<div class="hint">+ ${fmtMoney(T.pending)} à recevoir</div>` : ''}</div>
      <div class="card stat"><div class="label">Déboursé</div><div class="value" style="color:var(--danger)">${fmtMoney(T.exp)}</div></div>`,
  };
}

export async function viewAccounting(view) {
  const D = await loadAccounting(), A = S.acc, T = accountingTotals(D);
  const mName = id => { const m = D.members.find(x => x.id === id); return m ? fullName(m) : '—'; };
  const payer = p => p.member_id ? mName(p.member_id) : (p.notes || 'Recette hors adhérent');
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const H = accStatsHtml(T, D.season);
  view.innerHTML = head('Comptabilité', `<span id="acc-sub">${H.sub}</span>`,
    `<button class="btn" id="bilan">${icon('chart')}Bilan comptable</button><button class="btn" id="pdf">${icon('file')}Export PDF</button>`) + `
    <div class="grid acc-stats mb" id="acc-stats">${H.cards}
    </div>
    <div class="toolbar between">
      <div class="chips">
        <button class="chip ${A.tab === 'paiements' ? 'active' : ''}" data-tab="paiements">Recettes <span class="n">${D.payments.filter(p => !p.archived).length}</span></button>
        <button class="chip ${A.tab === 'depenses' ? 'active' : ''}" data-tab="depenses">Dépenses <span class="n">${D.expenses.filter(e => !e.archived).length}</span></button>
      </div>
      <button class="btn btn-primary" id="add">${icon('plus')}${A.tab === 'paiements' ? 'Nouvelle recette' : 'Nouvelle dépense'}</button>
    </div>
    <div class="toolbar">
      <input class="input" type="search" id="acc-search" placeholder="${A.tab === 'paiements' ? 'Rechercher une recette…' : 'Rechercher une dépense…'}" value="${esc(A.search)}" aria-label="Rechercher">
      ${A.tab === 'paiements' ? `<div class="chips">${[['tous', 'Tous'], ['payé', 'Payés'], ['en attente', 'En attente'], ['a-pointer', 'À pointer']].map(([k, l]) => `<button class="chip ${A.status === k ? 'active' : ''}" data-st="${k}">${l}</button>`).join('')}</div>` : `<div class="chips"><button class="chip ${A.status === 'a-pointer' ? 'active' : ''}" data-st="${A.status === 'a-pointer' ? 'tous' : 'a-pointer'}">À pointer</button></div>`}
      <label class="check" style="margin-left:auto"><input type="checkbox" id="arch" ${A.archives ? 'checked' : ''}><span>Voir les archives</span></label>
    </div>
    <div class="card" id="acc-list"></div>`;

  const draw = () => {
    const q = norm(A.search), box = $('#acc-list');
    if (A.tab === 'paiements') {
      const rows = D.payments.filter(p => p.archived === A.archives)
        .filter(p => A.status === 'tous' || (A.status === 'a-pointer' ? (p.status === 'payé' && !p.bank_checked) : p.status === A.status))
        .filter(p => !q || norm(payer(p) + ' ' + p.payment_type + ' ' + (p.notes || '')).includes(q));
      if (!rows.length) { box.innerHTML = '<div class="empty">Aucune recette.</div>'; return; }
      box.innerHTML = `<div class="table-wrap only-desktop"><table class="table"><thead><tr><th title="Pointé sur le relevé bancaire">Pt</th><th>Membre / origine</th><th>Type</th><th>Montant</th><th>Mode</th><th>Date</th><th>Statut</th><th></th></tr></thead><tbody>
        ${rows.map(p => `<tr><td><input type="checkbox" class="pt" data-pt="${p.id}" ${p.bank_checked ? 'checked' : ''} aria-label="Pointé"></td>
          <td>${p.member_id ? `<a href="#/membres/${p.member_id}" style="font-weight:600;text-decoration:none">${esc(mName(p.member_id))}</a>${p.notes ? `<div class="small muted">${esc(p.notes)}</div>` : ''}` : `<span style="font-weight:600">${esc(payer(p))}</span><div class="small muted">Hors adhérent</div>`}</td>
          <td>${esc(p.payment_type)}</td><td style="font-weight:700">${fmtMoney(p.amount)}</td><td>${esc(p.method || '—')}</td>
          <td>${fmtDate(p.payment_date)}${p.due_date && p.due_date !== p.payment_date ? `<div class="small muted">échéance ${fmtDate(p.due_date)}</div>` : ''}</td>
          <td><span class="badge ${p.status === 'payé' ? 'ok' : 'warn'}">${p.status === 'payé' ? 'Payé' : 'En attente'}</span></td>
          <td style="white-space:nowrap"><button class="icon-btn" data-edit="${p.id}" aria-label="Modifier">${icon('edit')}</button></td></tr>`).join('')}
      </tbody></table></div>
      <div class="list only-mobile">${rows.map(p => `<div class="list-item" data-edit="${p.id}">
        <input type="checkbox" class="pt" data-pt="${p.id}" ${p.bank_checked ? 'checked' : ''} aria-label="Pointé">
        <div class="grow"><div style="font-weight:600">${esc(payer(p))}</div><div class="small muted">${fmtDate(p.payment_date)} · ${esc(p.payment_type)}${p.method ? ' · ' + esc(p.method) : ''}</div></div>
        <div class="right"><strong>${fmtMoney(p.amount)}</strong><span class="badge ${p.status === 'payé' ? 'ok' : 'warn'}">${p.status === 'payé' ? 'Payé' : 'En attente'}</span></div></div>`).join('')}</div>`;
    } else {
      const rows = D.expenses.filter(e => e.archived === A.archives)
        .filter(e => A.status !== 'a-pointer' || !e.bank_checked)
        .filter(e => !q || norm(e.label + ' ' + e.category + ' ' + (e.supplier || '')).includes(q));
      if (!rows.length) { box.innerHTML = '<div class="empty">Aucune dépense.</div>'; return; }
      box.innerHTML = `<div class="table-wrap only-desktop"><table class="table"><thead><tr><th>Pt</th><th>Libellé</th><th>Catégorie</th><th>Montant</th><th>Mode</th><th>Date</th><th></th></tr></thead><tbody>
        ${rows.map(e => `<tr><td><input type="checkbox" class="pt" data-pt="${e.id}" ${e.bank_checked ? 'checked' : ''} aria-label="Pointé"></td>
          <td style="font-weight:600">${esc(e.label)}${e.supplier || e.notes ? `<div class="small muted" style="font-weight:400">${esc([e.supplier, e.notes].filter(Boolean).join(' · '))}</div>` : ''}</td>
          <td><span class="badge">${esc(e.category || '—')}</span></td><td style="font-weight:700;color:var(--danger)">−${fmtMoney(e.amount)}</td>
          <td>${esc(e.method || '—')}</td><td>${fmtDate(e.expense_date)}</td>
          <td><button class="icon-btn" data-edit="${e.id}" aria-label="Modifier">${icon('edit')}</button></td></tr>`).join('')}
      </tbody></table></div>
      <div class="list only-mobile">${rows.map(e => `<div class="list-item" data-edit="${e.id}">
        <input type="checkbox" class="pt" data-pt="${e.id}" ${e.bank_checked ? 'checked' : ''} aria-label="Pointé">
        <div class="grow"><div style="font-weight:600">${esc(e.label)}</div><div class="small muted">${fmtDate(e.expense_date)} · ${esc(e.category || '')}</div></div>
        <div class="right"><strong style="color:var(--danger)">−${fmtMoney(e.amount)}</strong></div></div>`).join('')}</div>`;
    }
    $$('.pt', box).forEach(cb => {
      cb.onclick = ev => ev.stopPropagation();
      cb.onchange = async () => {
        const table = A.tab === 'paiements' ? 'payments' : 'expenses';
        const { error } = await sb.from(table).update({ bank_checked: cb.checked }).eq('id', cb.dataset.pt);
        if (error) { cb.checked = !cb.checked; return fail(error); }
        const item = (A.tab === 'paiements' ? D.payments : D.expenses).find(x => x.id === cb.dataset.pt); item.bank_checked = cb.checked;
        const H2 = accStatsHtml(accountingTotals(D), D.season);
        $('#acc-stats').innerHTML = H2.cards; const sub = $('#acc-sub'); if (sub) sub.innerHTML = H2.sub;
        toast(cb.checked ? 'Pointé' : 'Pointage retiré');
      };
    });
    $$('[data-edit]', box).forEach(b => b.onclick = () => A.tab === 'paiements'
      ? paymentForm(D.payments.find(p => p.id === b.dataset.edit))
      : expenseForm(D.expenses.find(e => e.id === b.dataset.edit)));
  };
  draw();
  $('#acc-search').oninput = e => { A.search = e.target.value; draw(); };
  $$('[data-tab]', view).forEach(b => b.onclick = () => { A.tab = b.dataset.tab; A.status = 'tous'; A.search = ''; route(); });
  $$('[data-st]', view).forEach(b => b.onclick = () => { A.status = b.dataset.st; route(); });
  $('#arch').onchange = e => { A.archives = e.target.checked; route(); };
  $('#add').onclick = () => A.tab === 'paiements' ? paymentForm(null) : expenseForm(null);
  $('#bilan').onclick = () => go('/bilan');
  $('#pdf').onclick = () => exportPdf(D);
}

export async function paymentForm(p, defaults = {}) {
  const { data: members, error } = await sb.from('members').select('id, first_name, last_name, status, fee_amount').order('last_name');
  if (error) return fail(error);
  const v = p || { payment_type: (S.settings?.revenue_types || []).includes('Cotisation annuelle') ? 'Cotisation annuelle' : (S.settings?.revenue_types || [])[0], payment_date: isoDay(new Date()), status: 'payé', method: 'Virement', ...defaults };
  const types = [...new Set([...(S.settings?.revenue_types || []), 'Subvention', 'Don', v.payment_type].filter(Boolean))];
  openModal({
    title: p ? 'Modifier la recette' : 'Nouvelle recette',
    body: `<form id="pf" class="form-grid" novalidate>
      <div class="field full"><label for="pf-m">Membre</label><select class="input" id="pf-m" name="member_id"><option value="">— Recette hors adhérent (subvention, don…) —</option>${members.filter(m => m.status === 'actif' || m.id === v.member_id).map(m => `<option value="${m.id}" ${m.id === v.member_id ? 'selected' : ''}>${esc(fullName(m))}</option>`).join('')}</select></div>
      <div class="field"><label for="pf-t">Type *</label><select class="input" id="pf-t" name="payment_type">${types.map(t => `<option ${t === v.payment_type ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      <div class="field"><label for="pf-a">Montant (€) *</label><input class="input" id="pf-a" name="amount" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(v.amount ?? '')}"></div>
      <div class="field"><label for="pf-me">Mode de paiement</label><select class="input" id="pf-me" name="method">${[...new Set([...METHODS, v.method].filter(Boolean))].map(x => `<option ${x === v.method ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="field"><label for="pf-s">Statut</label><select class="input" id="pf-s" name="status"><option value="payé" ${v.status === 'payé' ? 'selected' : ''}>Payé</option><option value="en attente" ${v.status === 'en attente' ? 'selected' : ''}>En attente</option></select></div>
      <div class="field"><label for="pf-d">Date du paiement *</label><input class="input" id="pf-d" name="payment_date" type="date" value="${esc(v.payment_date || '')}"></div>
      <div class="field"><label for="pf-dd">Date d’encaissement prévue</label><input class="input" id="pf-dd" name="due_date" type="date" value="${esc(v.due_date || '')}"><span class="help">Pour un chèque à encaisser plus tard.</span></div>
      ${p ? '' : `<div class="field full"><label for="pf-n">Paiement en plusieurs fois</label><select class="input" id="pf-n"><option value="1">En une fois</option>${[2, 3, 4, 5, 6, 8, 10].map(n => `<option value="${n}">En ${n} fois (un par mois)</option>`).join('')}</select><span class="help" id="pf-help">Le montant total sera réparti en plusieurs paiements, un par mois à partir de la date indiquée.</span></div>`}
      <label class="check full"><input type="checkbox" name="bank_checked" ${v.bank_checked ? 'checked' : ''}><span>Pointé sur le relevé bancaire</span></label>
      <div class="field full"><label for="pf-no">Notes <span class="muted" id="pf-no-req">${v.member_id ? '' : '(origine obligatoire : ex. Mairie de Clermont)'}</span></label><input class="input" id="pf-no" name="notes" value="${esc(v.notes || '')}" placeholder="${v.member_id ? '' : 'ex : Subvention Mairie de Clermont-l’Hérault'}"></div>
    </form>`,
    foot: `${p ? `<button class="icon-btn" id="pf-del" aria-label="Supprimer" title="Supprimer">${icon('trash')}</button><button class="btn" id="pf-arch">${p.archived ? 'Désarchiver' : 'Archiver'}</button>` : ''}<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="pf-save">Enregistrer</button>`,
    onMount: root => {
      $('#pf-m', root).onchange = e => { const m = members.find(x => x.id === e.target.value); if (m?.fee_amount && !$('#pf-a', root).value) $('#pf-a', root).value = m.fee_amount; $('#pf-no-req', root).textContent = m ? '' : '(origine obligatoire : ex. Mairie de Clermont)'; };
      $('#pf-save', root).onclick = async () => {
        const d = readForm($('#pf', root));
        if (d.amount == null || !d.payment_date) return toast('Le montant et la date sont obligatoires.', 'error');
        if (!d.member_id && !d.notes) return toast('Pour une recette hors adhérent, indiquez son origine dans Notes (ex : Mairie de Clermont).', 'error');
        if (p) {
          const { error } = await sb.from('payments').update(d).eq('id', p.id);
          if (error) return fail(error);
          closeModal(); toast('Recette mise à jour'); return route();
        }
        const n = Number($('#pf-n', root).value || 1);
        const cents = Math.round(d.amount * 100), base = Math.floor(cents / n), extra = cents - base * n;
        const rows = Array.from({ length: n }, (_, i) => {
          const dt = new Date(parseDay(d.payment_date)); dt.setMonth(dt.getMonth() + i);
          const day = isoDay(dt);
          return { ...d, amount: (base + (i === 0 ? extra : 0)) / 100, payment_date: day, due_date: n > 1 ? day : d.due_date, bank_checked: i === 0 ? d.bank_checked : false, season_id: activeSeason()?.id || null, notes: n > 1 ? [d.notes, `${i + 1}/${n}`].filter(Boolean).join(' · ') : d.notes };
        });
        const { error } = await sb.from('payments').insert(rows);
        if (error) return fail(error);
        closeModal(); toast(n > 1 ? `${n} paiements enregistrés` : 'Recette enregistrée'); route();
      };
      if (p) {
        $('#pf-arch', root).onclick = async () => { const { error } = await sb.from('payments').update({ archived: !p.archived }).eq('id', p.id); if (error) return fail(error); closeModal(); toast(p.archived ? 'Paiement désarchivé' : 'Paiement archivé'); route(); };
        $('#pf-del', root).onclick = async () => {
          if (!await confirmBox('Supprimer le paiement', `Supprimer ce paiement de ${fmtMoney(p.amount)} ? Pour le garder en mémoire sans le compter, préférez « Archiver ».`)) return;
          const { error } = await sb.from('payments').delete().eq('id', p.id); if (error) return fail(error); toast('Paiement supprimé'); route();
        };
      }
    },
  });
}

export function expenseForm(e) {
  const v = e || { expense_date: isoDay(new Date()), method: 'Prélèvement' };
  const cats = [...new Set([...(S.settings?.expense_categories || []), v.category].filter(Boolean))];
  openModal({
    title: e ? 'Modifier la dépense' : 'Nouvelle dépense',
    body: `<form id="ef" class="form-grid" novalidate>
      <div class="field full"><label for="ef-l">Libellé *</label><input class="input" id="ef-l" name="label" value="${esc(v.label || '')}" placeholder="ex : Location de la salle"></div>
      <div class="field"><label for="ef-c">Catégorie</label><select class="input" id="ef-c" name="category"><option value="">—</option>${cats.map(c => `<option ${c === v.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      <div class="field"><label for="ef-a">Montant (€) *</label><input class="input" id="ef-a" name="amount" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(v.amount ?? '')}"></div>
      <div class="field"><label for="ef-m">Mode de paiement</label><select class="input" id="ef-m" name="method">${[...new Set([...METHODS, v.method].filter(Boolean))].map(x => `<option ${x === v.method ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="field"><label for="ef-d">Date *</label><input class="input" id="ef-d" name="expense_date" type="date" value="${esc(v.expense_date || '')}"></div>
      <div class="field full"><label for="ef-s">Fournisseur</label><input class="input" id="ef-s" name="supplier" value="${esc(v.supplier || '')}"></div>
      <label class="check full"><input type="checkbox" name="bank_checked" ${v.bank_checked ? 'checked' : ''}><span>Pointé sur le relevé bancaire</span></label>
      <div class="field full"><label for="ef-n">Notes</label><input class="input" id="ef-n" name="notes" value="${esc(v.notes || '')}"></div>
    </form>`,
    foot: `${e ? `<button class="icon-btn" id="ef-del" aria-label="Supprimer" title="Supprimer">${icon('trash')}</button><button class="btn" id="ef-arch">${e.archived ? 'Désarchiver' : 'Archiver'}</button>` : ''}<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="ef-save">Enregistrer</button>`,
    onMount: root => {
      $('#ef-save', root).onclick = async () => {
        const d = readForm($('#ef', root));
        if (!d.label || d.amount == null || !d.expense_date) return toast('Libellé, montant et date sont obligatoires.', 'error');
        const { error } = e ? await sb.from('expenses').update(d).eq('id', e.id) : await sb.from('expenses').insert({ ...d, season_id: activeSeason()?.id || null });
        if (error) return fail(error);
        closeModal(); toast(e ? 'Dépense mise à jour' : 'Dépense enregistrée'); S.acc.tab = 'depenses'; route();
      };
      if (e) {
        $('#ef-arch', root).onclick = async () => { const { error } = await sb.from('expenses').update({ archived: !e.archived }).eq('id', e.id); if (error) return fail(error); closeModal(); toast(e.archived ? 'Dépense désarchivée' : 'Dépense archivée'); route(); };
        $('#ef-del', root).onclick = async () => {
          if (!await confirmBox('Supprimer la dépense', `Supprimer « ${esc(e.label)} » (${fmtMoney(e.amount)}) ?`)) return;
          const { error } = await sb.from('expenses').delete().eq('id', e.id); if (error) return fail(error); toast('Dépense supprimée'); route();
        };
      }
    },
  });
}

export function bilanData(D) {
  const T = accountingTotals(D);
  const group = (rows, key) => Object.entries(rows.reduce((a, x) => { const k = x[key] || 'Autre'; a[k] = (a[k] || 0) + Number(x.amount); return a; }, {})).sort((a, b) => b[1] - a[1]);
  return {
    T,
    recettes: group(D.payments.filter(p => !p.archived && p.status === 'payé'), 'payment_type'),
    depenses: group(D.expenses.filter(e => !e.archived), 'category'),
    methodes: group(D.payments.filter(p => !p.archived && p.status === 'payé'), 'method'),
  };
}
export function bilanHtml(D) {
  const B = bilanData(D), T = B.T;
  const tbl = (rows, total, neg) => `<table class="table"><tbody>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td style="text-align:right">${neg ? '−' : ''}${fmtMoney(v)}</td></tr>`).join('') || '<tr><td class="muted">Aucune</td><td></td></tr>'}<tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${neg ? '−' : ''}${fmtMoney(total)}</strong></td></tr></tbody></table>`;
  return `
    <div class="grid two">
      <div><h2 class="section-title">Recettes encaissées</h2>${tbl(B.recettes, T.paid)}</div>
      <div><h2 class="section-title">Dépenses</h2>${tbl(B.depenses, T.exp, true)}</div>
    </div>
    <h2 class="section-title mt">Résultat</h2>
    <table class="table"><tbody>
      <tr><td>Solde en début d’exercice</td><td style="text-align:right">${fmtMoney(T.opening)}</td></tr>
      <tr><td>+ Recettes encaissées</td><td style="text-align:right">${fmtMoney(T.paid)}</td></tr>
      <tr><td>− Dépenses</td><td style="text-align:right">−${fmtMoney(T.exp)}</td></tr>
      <tr><td><strong>Résultat de l’exercice (recettes − dépenses)</strong></td><td style="text-align:right"><strong>${fmtMoney(T.paid - T.exp)}</strong></td></tr>
      <tr><td><strong>Solde comptable</strong></td><td style="text-align:right"><strong>${fmtMoney(T.balance)}</strong></td></tr>
      <tr><td>Paiements à recevoir (non encore payés)</td><td style="text-align:right">${fmtMoney(T.pending)}</td></tr>
    </tbody></table>
    ${B.methodes.length ? `<h2 class="section-title mt">Recettes par mode de paiement</h2>${tbl(B.methodes, T.paid)}` : ''}`;
}
export function showBilan(D) {
  openModal({ title: `Bilan simplifié${D.season ? ' · ' + D.season.label : ''}`, body: bilanHtml(D), foot: `<button class="btn" data-close>Fermer</button><button class="btn btn-primary" id="b-pdf">${icon('file')}Export PDF</button>`, onMount: r => $('#b-pdf', r).onclick = () => { closeModal(); exportPdf(D); } });
}
export function exportPdf(D) {
  const mName = id => { const m = D.members.find(x => x.id === id); return m ? fullName(m) : '—'; };
  const pays = D.payments.filter(p => !p.archived), exps = D.expenses.filter(e => !e.archived);
  const who = p => p.member_id ? mName(p.member_id) : (p.notes || 'Hors adhérent');
  printDoc(`
    <h1>${esc(S.settings?.club_name || 'Club')}</h1>
    <p class="muted">Comptabilité${D.season ? ' — saison ' + esc(D.season.label) : ''} · édité le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    ${bilanHtml(D)}
    <h2 class="section-title mt">Détail des paiements (${pays.length})</h2>
    <table class="table"><thead><tr><th>Date</th><th>Membre</th><th>Type</th><th>Mode</th><th>Statut</th><th>Pointé</th><th style="text-align:right">Montant</th></tr></thead><tbody>
      ${pays.slice().sort((a, b) => a.payment_date.localeCompare(b.payment_date)).map(p => `<tr><td>${fmtDate(p.payment_date)}</td><td>${esc(who(p))}</td><td>${esc(p.payment_type)}</td><td>${esc(p.method || '')}</td><td>${p.status === 'payé' ? 'Payé' : 'En attente'}</td><td>${p.bank_checked ? 'Oui' : ''}</td><td style="text-align:right">${fmtMoney(p.amount)}</td></tr>`).join('')}
    </tbody></table>
    <h2 class="section-title mt">Détail des dépenses (${exps.length})</h2>
    <table class="table"><thead><tr><th>Date</th><th>Libellé</th><th>Catégorie</th><th>Mode</th><th>Pointé</th><th style="text-align:right">Montant</th></tr></thead><tbody>
      ${exps.slice().sort((a, b) => a.expense_date.localeCompare(b.expense_date)).map(e => `<tr><td>${fmtDate(e.expense_date)}</td><td>${esc(e.label)}</td><td>${esc(e.category || '')}</td><td>${esc(e.method || '')}</td><td>${e.bank_checked ? 'Oui' : ''}</td><td style="text-align:right">${fmtMoney(e.amount)}</td></tr>`).join('')}
    </tbody></table>`);
}

/* =====================================================================
   Bilan comptable de l'association (présentation du plan comptable associatif)
   Compte de résultat (N et N-1), bilan actif / passif, annexe, impression pour l'AG.
   ===================================================================== */
// Rubriques : [n° de compte, intitulé, détail, mots-clés reconnus dans la catégorie ou le type]
export const PCA_CHARGES = [
  ['60', 'Achats', 'matériel, équipement, fournitures, tenues', /mat[ée]riel|[ée]quipement|fourniture|achat|tenue|t-?shirt|textile|kimono|gant|protection|pharmacie|trousse/i],
  ['64', 'Charges de personnel', 'salaires, défraiements', /salaire|personnel|urssaf|indemnit|d[ée]fraiement|r[ée]mun[ée]ration|vacation/i],
  ['63', 'Impôts et taxes', '', /imp[ôo]t|taxe|sacem/i],
  ['61', 'Services extérieurs', 'locations, assurances, entretien', /loyer|location|salle|gymnase|dojo|assurance|entretien|r[ée]paration|maintenance|nettoyage/i],
  ['62', 'Autres services extérieurs', 'affiliations, licences, déplacements, communication, frais bancaires', /affiliation|licence|f[ée]d[ée]ration|adac|d[ée]placement|transport|carburant|essence|p[ée]age|communication|publicit|impression|site|frais bancaire|banque|honoraire|formation|[ée]v[ée]nement|r[ée]ception|stage|poste|affranchissement|t[ée]l[ée]phone|internet|abonnement/i],
  ['66', 'Charges financières', '', /int[ée]r[êe]t|agios/i],
  ['67', 'Charges exceptionnelles', '', /exceptionnel/i],
  ['65', 'Autres charges de gestion courante', 'divers', /.*/],
];
export const PCA_PRODUITS = [
  ['74', 'Subventions d’exploitation', 'commune, département, région, État', /subvention|mairie|commune|d[ée]partement|r[ée]gion|cnds|\bans\b|[ée]tat|pass.?sport/i],
  ['754', 'Dons et mécénat', '', /\bdons?\b|m[ée]c[ée]nat|parrainage|sponsor/i],
  ['756', 'Cotisations des adhérents', 'adhésions, licences', /cotisation|adh[ée]sion|licence|inscription/i],
  ['70', 'Ventes et prestations', 'stages, équipement vendu, manifestations', /stage|vente|[ée]quipement|t-?shirt|prestation|buvette|billetterie|manifestation|cours/i],
  ['76', 'Produits financiers', 'intérêts', /int[ée]r[êe]t|livret/i],
  ['77', 'Produits exceptionnels', '', /exceptionnel/i],
  ['758', 'Autres produits de gestion courante', 'divers', /.*/],
];
export const pcaOf = (list, label) => list.find(([, , , re]) => re.test(label || '')) || list[list.length - 1];
export const ORDER_C = ['60', '61', '62', '63', '64', '65', '66', '67'], ORDER_P = ['70', '74', '754', '756', '758', '76', '77'];

export async function loadSeasonBooks(season) {
  const sq = q => season ? q.eq('season_id', season.id) : q;
  const [pr, er] = await Promise.all([
    sq(sb.from('payments').select('id, member_id, payment_type, amount, method, status, bank_checked, payment_date, notes').eq('archived', false)),
    sq(sb.from('expenses').select('id, label, category, amount, method, bank_checked, expense_date').eq('archived', false)),
  ]);
  for (const r of [pr, er]) if (r.error) throw r.error;
  return computeBooks(season, pr.data, er.data);
}

export function computeBooks(season, payments, expenses) {
  const cents = v => Math.round(Number(v || 0) * 100);
  const add = (map, list, label, amount) => {
    const [code, title, hint] = pcaOf(list, label);
    const r = map[code] ||= { code, title, hint, total: 0, detail: {} };
    r.total += cents(amount); const k = label || 'Autre'; r.detail[k] = (r.detail[k] || 0) + cents(amount);
  };
  const charges = {}, produits = {};
  expenses.forEach(e => add(charges, PCA_CHARGES, e.category || e.label, e.amount));
  const paid = payments.filter(p => p.status === 'payé'), pending = payments.filter(p => p.status === 'en attente');
  [...paid, ...pending].forEach(p => add(produits, PCA_PRODUITS, p.payment_type, p.amount));
  const sum = a => a.reduce((t, x) => t + cents(x.amount), 0);
  const opening = cents(season?.opening_balance), cIn = sum(paid), cPending = sum(pending), cOut = sum(expenses);
  const totC = Object.values(charges).reduce((t, r) => t + r.total, 0), totP = Object.values(produits).reduce((t, r) => t + r.total, 0);
  const cash = opening + cIn - cOut;
  return {
    season, charges, produits, totC, totP, result: totP - totC, opening, cashIn: cIn, cashOut: cOut, pending: cPending, cash,
    bankIn: sum(paid.filter(p => p.bank_checked)), bankOut: sum(expenses.filter(e => e.bank_checked)),
    toPointIn: paid.filter(p => !p.bank_checked).length, toPointOut: expenses.filter(e => !e.bank_checked).length,
    nPayers: new Set(paid.filter(p => p.member_id && /cotisation|adh[ée]sion|licence/i.test(p.payment_type || '')).map(p => p.member_id)).size,
    // Bilan : Actif = disponibilités + créances ; Passif = fonds associatifs (report à nouveau) + résultat
    actif: { dispo: cash, creances: cPending }, passif: { fonds: opening, result: totP - totC },
  };
}

export const eur = c => fmtMoney(c / 100);
export const prevSeasonOf = season => {
  if (!season) return null;
  const list = S.seasons.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  return list[list.indexOf(list.find(x => x.id === season.id)) - 1] || null;
};

export function bilanBlocks(B, P) {
  const yr = s => s ? esc(s.label) : 'Total';
  const hasP = !!P;
  const side = (rows, order, prevRows, total, prevTotal, title) => {
    const codes = order.filter(c => rows[c] || prevRows?.[c]);
    return `<table class="table bilan-t"><thead><tr><th>${title}</th><th class="num">${yr(B.season)}</th>${hasP ? `<th class="num muted">${yr(P.season)}</th>` : ''}</tr></thead><tbody>
      ${codes.length ? codes.map(c => { const r = rows[c] || prevRows[c];
        return `<tr><td><span class="acc-code">${c}</span>${esc(r.title)}${rows[c] && Object.keys(rows[c].detail).length ? `<div class="small muted">${Object.entries(rows[c].detail).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)} ${eur(v)}`).join(' · ')}</div>` : ''}</td>
          <td class="num">${rows[c] ? eur(rows[c].total) : '—'}</td>${hasP ? `<td class="num muted">${prevRows[c] ? eur(prevRows[c].total) : '—'}</td>` : ''}</tr>`; }).join('')
        : `<tr><td class="muted" colspan="${hasP ? 3 : 2}">Aucune écriture</td></tr>`}
      <tr class="tot"><td>Total ${title.toLowerCase()}</td><td class="num">${eur(total)}</td>${hasP ? `<td class="num muted">${eur(prevTotal)}</td>` : ''}</tr></tbody></table>`;
  };
  const res = r => r >= 0 ? `Excédent ${eur(r)}` : `Déficit ${eur(-r)}`;
  const ctrl = P ? P.cash - B.opening : 0;

  const compte = `<div class="grid two bilan-grid">
      <div>${side(B.charges, ORDER_C, P?.charges, B.totC, P?.totC, 'Charges')}</div>
      <div>${side(B.produits, ORDER_P, P?.produits, B.totP, P?.totP, 'Produits')}</div>
    </div>
    <table class="table bilan-t mt"><tbody><tr class="tot big"><td>Résultat de l’exercice (produits − charges)</td>
      <td class="num" style="color:var(${B.result >= 0 ? '--ok' : '--danger'})">${res(B.result)}</td>${hasP ? `<td class="num muted">${res(P.result)}</td>` : ''}</tr></tbody></table>`;

  const bilan = `<div class="grid two bilan-grid">
      <table class="table bilan-t"><thead><tr><th>Actif</th><th class="num">Fin ${yr(B.season)}</th></tr></thead><tbody>
        <tr><td>Créances<div class="small muted">Recettes « en attente » non encore encaissées</div></td><td class="num">${eur(B.actif.creances)}</td></tr>
        <tr><td>Disponibilités<div class="small muted">Banque et caisse : solde de départ + encaissements − décaissements</div></td><td class="num">${eur(B.actif.dispo)}</td></tr>
        <tr class="tot"><td>Total actif</td><td class="num">${eur(B.actif.dispo + B.actif.creances)}</td></tr></tbody></table>
      <table class="table bilan-t"><thead><tr><th>Passif</th><th class="num">Fin ${yr(B.season)}</th></tr></thead><tbody>
        <tr><td>Fonds associatifs (report à nouveau)<div class="small muted">Solde de trésorerie en début de saison</div></td><td class="num">${eur(B.passif.fonds)}</td></tr>
        <tr><td>Résultat de l’exercice</td><td class="num">${eur(B.passif.result)}</td></tr>
        <tr><td>Dettes<div class="small muted">Aucune dette enregistrée</div></td><td class="num">${eur(0)}</td></tr>
        <tr class="tot"><td>Total passif</td><td class="num">${eur(B.passif.fonds + B.passif.result)}</td></tr></tbody></table>
    </div>`;

  const annexe = `<div class="grid two bilan-grid">
      <table class="table bilan-t"><thead><tr><th colspan="2">Trésorerie de la saison</th></tr></thead><tbody>
        <tr><td>Solde en début de saison</td><td class="num">${eur(B.opening)}</td></tr>
        <tr><td>+ Encaissements</td><td class="num">${eur(B.cashIn)}</td></tr>
        <tr><td>− Décaissements</td><td class="num">−${eur(B.cashOut)}</td></tr>
        <tr class="tot"><td>Solde en fin de saison</td><td class="num">${eur(B.cash)}</td></tr>
        <tr><td colspan="2" class="small muted">Rapprochement bancaire : ${eur(B.bankIn)} d’entrées et ${eur(B.bankOut)} de sorties pointées sur le relevé${B.toPointIn + B.toPointOut ? ` · ${B.toPointIn + B.toPointOut} opération(s) restent à pointer` : ' · tout est pointé'}.</td></tr></tbody></table>
      <table class="table bilan-t"><thead><tr><th colspan="2">Informations</th></tr></thead><tbody>
        <tr><td>Adhérents ayant réglé une cotisation</td><td class="num">${B.nPayers}</td></tr>
        <tr><td>Recettes en attente d’encaissement</td><td class="num">${eur(B.pending)}</td></tr>
        ${B.unpaidFees != null ? `<tr><td>Cotisations restant dues (non comptabilisées)<div class="small muted">Écart entre la cotisation prévue et les règlements des membres actifs</div></td><td class="num">${eur(B.unpaidFees)}</td></tr>` : ''}
        <tr><td colspan="2" class="small muted">Comptabilité tenue en recettes / dépenses, présentée selon les rubriques du plan comptable associatif (règlement ANC n° 2018-06). Le bénévolat n’est pas valorisé.</td></tr></tbody></table>
    </div>
    ${P && ctrl !== 0 ? `<div class="alert info mt"><strong>Contrôle :</strong> le solde de départ de ${esc(B.season.label)} (${eur(B.opening)}) ne correspond pas au solde de fin de ${esc(P.season.label)} (${eur(P.cash)}), soit un écart de ${eur(Math.abs(ctrl))}. Vérifiez le solde de départ dans Paramètres → Saisons.</div>` : ''}
    ${P && ctrl === 0 ? `<div class="small muted mt">Contrôle : le solde de départ correspond bien au solde de fin de ${esc(P.season.label)}.</div>` : ''}`;
  return { compte, bilan, annexe };
}

S.bilanSeason = null;
/* Bilan complet d'une saison (compte de résultat N/N-1, bilan, annexe) : page Bilan et dossier d'AG */
export async function seasonBilan(season) {
  const prev = prevSeasonOf(season);
  const [B, P] = await Promise.all([loadSeasonBooks(season), prev ? loadSeasonBooks(prev) : null]);
  if (season?.is_active) {
    const [{ data: mem, error: me }, { data: pays, error: pe }] = await Promise.all([
      sb.from('members').select('id, fee_amount').eq('status', 'actif'),
      sb.from('payments').select('member_id, amount, status').eq('season_id', season.id).eq('archived', false).eq('status', 'payé'),
    ]);
    if (!me && !pe) {
      const paidBy = {}; pays.forEach(p => { if (p.member_id) paidBy[p.member_id] = (paidBy[p.member_id] || 0) + Math.round(Number(p.amount) * 100); });
      B.unpaidFees = mem.reduce((t, m) => t + Math.max(0, Math.round(Number(m.fee_amount || 0) * 100) - (paidBy[m.id] || 0)), 0);
    }
  }
  return { season, prev, B, P, X: bilanBlocks(B, P) };
}

export async function viewBilan(view) {
  const { season, prev, B, P, X } = await seasonBilan(S.seasons.find(x => x.id === S.bilanSeason) || activeSeason() || S.seasons[0] || null);
  view.innerHTML = `<div class="row mb"><a href="#/paiements" class="btn btn-sm">${icon('back')}Comptabilité</a></div>`
    + head('Bilan comptable', `${esc(S.settings?.club_name || 'Association')}${season ? ' · saison ' + esc(season.label) : ''}${prev ? ' · comparé à ' + esc(prev.label) : ''}`,
      `<button class="btn" id="bl-print">${icon('file')}Imprimer les comptes</button><button class="btn btn-primary" id="bl-dossier">${icon('file')}Dossier d’AG complet</button>`) + `
    ${S.seasons.length > 1 ? `<div class="chips mb">${S.seasons.map(x => `<button class="chip ${x.id === season?.id ? 'active' : ''}" data-bs="${x.id}">${esc(x.label)}${x.is_active ? ' · en cours' : ''}</button>`).join('')}</div>` : ''}
    <div class="grid acc-stats mb">
      <div class="card stat"><div class="label">Produits</div><div class="value" style="color:var(--ok)">${eur(B.totP)}</div></div>
      <div class="card stat"><div class="label">Charges</div><div class="value" style="color:var(--danger)">${eur(B.totC)}</div></div>
      <div class="card stat accent"><div class="label">${B.result >= 0 ? 'Excédent' : 'Déficit'}</div><div class="value">${eur(Math.abs(B.result))}</div>${P ? `<div class="hint">${esc(P.season.label)} : ${P.result >= 0 ? 'excédent' : 'déficit'} ${eur(Math.abs(P.result))}</div>` : ''}</div>
      <div class="card stat"><div class="label">Trésorerie fin de saison</div><div class="value">${eur(B.cash)}</div><div class="hint">Départ ${eur(B.opening)}</div></div>
    </div>
    ${season?.is_active ? '<div class="alert info mb">Saison en cours : le bilan est provisoire et se met à jour à chaque recette ou dépense.</div>' : ''}
    <div class="card card-pad mb"><h2>Compte de résultat</h2>${X.compte}</div>
    <div class="card card-pad mb"><h2>Bilan au ${season?.closed_at ? fmtDate(season.closed_at.slice(0, 10)) : 'jour'}</h2>${X.bilan}</div>
    <div class="card card-pad mb"><h2>Annexe</h2>${X.annexe}</div>
    <p class="small muted">Les rubriques sont déduites des catégories de dépenses et des types de recettes. Pour qu’une ligne change de rubrique, renommez sa catégorie ou son type (ex. « Subvention mairie », « Location salle »).</p>`;
  $$('[data-bs]', view).forEach(b => b.onclick = () => { S.bilanSeason = b.dataset.bs; route(); });
  $('#bl-print', view).onclick = () => printBilan(B, P, X);
  $('#bl-dossier', view).onclick = e => printAgDossier(e.currentTarget);
}

export function printBilan(B, P, X) { printDoc(bilanPrintHtml(B, P, X), 'print-bilan'); }
export function bilanPrintHtml(B, P, X) {
  const s = S.settings || {};
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return `
    <div class="bilan-print">
      <div class="attest-head"><div class="logo-mark">D</div>
        <div><div class="attest-club">${esc(s.club_name || 'Association')}</div>
          <div class="small">${esc(s.club_address || '')}${s.club_legal_id ? ' · ' + esc(s.club_legal_id) : ''}${s.club_email ? ' · ' + esc(s.club_email) : ''}</div></div></div>
      <h1>Comptes annuels${B.season ? ' · saison ' + esc(B.season.label) : ''}</h1>
      <p class="small">Édité le ${today}${B.season?.is_active ? ' · saison en cours : document provisoire' : ''}${P ? ' · comparaison avec la saison ' + esc(P.season.label) : ''}.</p>
      <h2 class="section-title">1. Compte de résultat</h2>${X.compte}
      <h2 class="section-title">2. Bilan</h2>${X.bilan}
      <h2 class="section-title">3. Annexe</h2>${X.annexe}
      <p style="margin-top:22px">Comptes arrêtés par le bureau et soumis à l’approbation de l’assemblée générale du …………………………</p>
      <div class="bilan-signs"><div>Le/la président(e)<div class="sign-box">${esc(s.president_name || '')}</div></div><div>Le/la trésorier(ère)<div class="sign-box"></div></div></div>
    </div>`;
}
