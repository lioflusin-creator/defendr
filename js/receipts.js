// Defendr — Reçus de cotisation (PDF à remettre à l'employeur de l'adhérent)
import { $, $$, S, activeSeason, closeModal, esc, fail, fmtDate, fmtMoney, fullName, icon, openModal, readForm, roleLabel, saveFile, sb, toast } from './core.js';
import { docUrl } from './inscriptions.js';
import { waUrl } from './whatsapp.js';

const METHODS = ['Virement', 'Chèque', 'Espèces', 'Carte bancaire', 'Prélèvement', 'Autre'];
export const VAT_MENTIONS = [
  ['TVA non applicable, article 261-7-1° du CGI', 'Article 261-7-1° du CGI : association à but non lucratif (recommandé)'],
  ['TVA non applicable, article 293 B du CGI', 'Article 293 B du CGI : franchise en base de TVA'],
];
const isFee = p => /cotisation|adh[ée]sion|licence|inscription/i.test(p.payment_type || '');
const civilityOf = m => m?.gender === 'Femme' ? 'Mme' : m?.gender === 'Homme' ? 'M.' : '';
const longDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const money = n => (Number(n) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const methodText = m => String(m || '').split(/\s*(?:,|\bet\b)\s*/).filter(Boolean).map(x => x.toLowerCase()).join(' et ');
const fileSlug = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const receiptFileName = r => `recu-cotisation-${r.number}-${fileSlug(r.data.last_name + ' ' + r.data.first_name)}.pdf`; // pas de « _ » : WhatsApp le prendrait pour de l'italique
const missingFn = e => /create_receipt|receipts|schema cache|does not exist/i.test(e?.message || '');
const migrationMsg = 'Les reçus de cotisation ne sont pas encore installés : exécutez une fois le fichier migration-14.sql dans Supabase → Éditeur SQL.';

/* Fenêtre « Reçu de cotisation » : choix de l'adhérent, champs pré-remplis, puis création du PDF numéroté */
export async function receiptForm(pre = {}) {
  const season = activeSeason();
  const [mr, pr, rr] = await Promise.all([
    sb.from('members').select('id, first_name, last_name, gender, address, phone, guardian_phone, status, fee_amount').order('last_name'),
    season ? sb.from('payments').select('member_id, payment_type, amount, method, status, payment_date, archived').eq('season_id', season.id) : Promise.resolve({ data: [] }),
    sb.from('receipts').select('*').order('created_at', { ascending: false }),
  ]);
  if (mr.error) return fail(mr.error);
  if (pr.error) return fail(pr.error);
  const members = mr.data, payments = (pr.data || []).filter(p => !p.archived && p.status === 'payé' && isFee(p));
  const receipts = rr.error ? null : rr.data; // null : migration-14.sql pas encore exécutée
  const s = S.settings || {}, club = s.club_name || 'l’association';
  const gaps = [!s.club_address && 'l’adresse du siège', !s.club_legal_id && 'le n° RNA'].filter(Boolean);
  const list = members.filter(m => m.status === 'actif' || m.id === pre.member_id);

  openModal({
    title: 'Reçu de cotisation',
    body: `${receipts === null ? `<div class="alert error">${migrationMsg}</div>` : ''}
      ${gaps.length ? `<div class="alert info">À compléter dans <a href="#/parametres" data-close>Paramètres → Club</a> pour qu’il figure sur le reçu : ${gaps.join(' et ')}.</div>` : ''}
      <form id="rc" class="form-grid" novalidate>
        <div class="field full"><label for="rc-m">Adhérent *</label><select class="input" id="rc-m" name="member_id"><option value="">— Choisir —</option>${list.map(m => `<option value="${m.id}" ${m.id === pre.member_id ? 'selected' : ''}>${esc(fullName(m))}</option>`).join('')}</select><span class="help" id="rc-info"></span></div>
        <div class="field"><label for="rc-c">Civilité</label><select class="input" id="rc-c" name="civility"><option value="">—</option><option>M.</option><option>Mme</option></select></div>
        <div class="field"><label for="rc-fn">Prénom *</label><input class="input" id="rc-fn" name="first_name"></div>
        <div class="field full"><label for="rc-ln">Nom *</label><input class="input" id="rc-ln" name="last_name"></div>
        <div class="field full"><label for="rc-ad">Adresse de l’adhérent</label><input class="input" id="rc-ad" name="address" placeholder="Facultatif"></div>
        <label class="check full"><input type="checkbox" id="rc-co"><span>Établir le reçu au nom de son entreprise</span></label>
        <div class="field full" data-co hidden><label for="rc-cn">Nom de l’entreprise *</label><input class="input" id="rc-cn" name="company" placeholder="ex : SARL Dupont"><span class="help">Le reçu portera « Entreprise, pour le compte de M./Mme … ». Demandez à l’adhérent ce que son entreprise veut voir écrit.</span></div>
        <div class="field full" data-co hidden><label for="rc-ca">Adresse de l’entreprise</label><input class="input" id="rc-ca" name="company_address" placeholder="Facultatif"></div>
        <div class="field full"><label for="rc-o">Objet *</label><input class="input" id="rc-o" name="object" value="${esc(`Cotisation annuelle d’adhésion à ${club}`)}"></div>
        <div class="field full"><label for="rc-p">Période couverte *</label><input class="input" id="rc-p" name="period" value="${esc(season ? 'Saison ' + season.label.replace(/\s*\/\s*/, '-') : 'Saison ' + new Date().getFullYear() + '-' + (new Date().getFullYear() + 1))}" placeholder="ex : Saison 2026-2027, ou du 1er septembre 2026 au 31 août 2027"></div>
        <div class="field"><label for="rc-a">Montant total (€) *</label><input class="input" id="rc-a" name="amount" type="number" step="0.01" min="0" inputmode="decimal"></div>
        <div class="field"><label for="rc-d">Acquittée le *</label><input class="input" id="rc-d" name="paid_on" type="date"></div>
        <div class="field full"><label for="rc-me">Mode de paiement *</label><input class="input" id="rc-me" name="method" list="rc-ml" placeholder="ex : Virement"><datalist id="rc-ml">${METHODS.map(x => `<option value="${x}">`).join('')}</datalist></div>
        <div class="field full"><label for="rc-v">Mention TVA</label><select class="input" id="rc-v" name="vat_mention">${VAT_MENTIONS.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></div>
      </form>
      <div id="rc-hist"></div>`,
    foot: `${receipts?.length ? `<button class="btn" id="rc-reg">${icon('list')}Reçus émis <span class="badge">${receipts.length}</span></button>` : ''}<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="rc-go" ${receipts === null ? 'disabled' : ''}>${icon('file')}Créer le reçu PDF</button>`,
    onMount: root => {
      const f = $('#rc', root), co = $('#rc-co', root);
      const showCo = () => $$('[data-co]', root).forEach(x => x.hidden = !co.checked);
      co.onchange = showCo;
      const fill = () => {
        const m = members.find(x => x.id === f.member_id.value), info = $('#rc-info', root), hist = $('#rc-hist', root);
        if (!m) { info.textContent = ''; hist.innerHTML = ''; return; }
        f.civility.value = civilityOf(m); f.first_name.value = m.first_name || ''; f.last_name.value = m.last_name || ''; f.address.value = m.address || '';
        const mine = payments.filter(p => p.member_id === m.id).sort((a, b) => a.payment_date.localeCompare(b.payment_date));
        if (mine.length) {
          f.amount.value = Math.round(mine.reduce((t, p) => t + Number(p.amount) * 100, 0)) / 100;
          f.paid_on.value = mine[mine.length - 1].payment_date;
          f.method.value = [...new Set(mine.map(p => p.method).filter(Boolean))].join(' et ');
          info.textContent = `D’après la comptabilité : ${mine.length > 1 ? mine.length + ' paiements de cotisation' : '1 paiement de cotisation'} cette saison (${mine.map(p => fmtMoney(p.amount) + ' le ' + fmtDate(p.payment_date)).join(', ')}).`;
        } else {
          f.amount.value = m.fee_amount ?? ''; f.paid_on.value = ''; f.method.value = '';
          info.textContent = 'Aucun paiement de cotisation enregistré pour cette saison : le reçu atteste d’un paiement, vérifiez le montant, la date et le mode.';
        }
        const old = (receipts || []).filter(r => r.member_id === m.id);
        hist.innerHTML = old.length ? `<div class="section-title mt">Déjà émis pour ${esc(m.first_name)}</div><div class="list">${old.map(rowHtml).join('')}</div>` : '';
        bindRows(hist, receipts);
      };
      f.member_id.onchange = fill;
      if (pre.member_id) fill();
      $('#rc-reg', root)?.addEventListener('click', () => registry(receipts));
      $('#rc-go', root).onclick = async e => {
        const d = readForm(f);
        if (!d.member_id) return toast('Choisissez l’adhérent.', 'error');
        if (!d.first_name || !d.last_name) return toast('Le prénom et le nom sont obligatoires.', 'error');
        if (co.checked && !d.company) return toast('Indiquez le nom de l’entreprise, ou décochez la case.', 'error');
        if (!d.object || !d.period) return toast('L’objet et la période sont obligatoires.', 'error');
        if (!(d.amount > 0)) return toast('Indiquez le montant de la cotisation.', 'error');
        if (!d.paid_on || !d.method) return toast('Indiquez la date et le mode de paiement : le reçu atteste que la cotisation est réglée.', 'error');
        if (!co.checked) { d.company = null; d.company_address = null; }
        const member_id = d.member_id; delete d.member_id;
        const data = {
          ...d, amount: Math.round(d.amount * 100) / 100,
          club: { name: s.club_name || '', address: s.club_address || '', rna: s.club_legal_id || '', siret: s.club_siret || '', email: s.club_email || '' },
          signer: { name: S.profile?.full_name || '', role: roleLabel(S.profile?.role) },
        };
        const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Création…';
        try {
          const { data: r, error } = await sb.rpc('create_receipt', { p_member_id: member_id, p_data: data });
          if (error) throw error;
          const rec = Array.isArray(r) ? r[0] : r;
          const m = members.find(x => x.id === member_id);
          await deliver(rec, m?.phone || m?.guardian_phone);
        } catch (err) {
          btn.disabled = false; btn.innerHTML = `${icon('file')}Créer le reçu PDF`;
          if (missingFn(err)) return toast(migrationMsg, 'error');
          fail(err);
        }
      };
    },
  });
}

const rowHtml = r => `<div class="list-item"><div class="grow"><div style="font-weight:600">N° ${esc(r.number)} · ${esc(r.data.first_name)} ${esc(r.data.last_name)}</div>
  <div class="small muted">${fmtDate(r.issued_on)} · ${money(r.data.amount)}${r.data.company ? ' · ' + esc(r.data.company) : ''}</div></div>
  <button class="btn btn-sm" data-rc="${r.id}">${icon('file')}PDF</button></div>`;
function bindRows(box, receipts) {
  $$('[data-rc]', box).forEach(b => b.onclick = async () => {
    const r = receipts.find(x => x.id === b.dataset.rc);
    b.disabled = true;
    try { const bytes = await buildReceiptPdf(r); await saveFile(new Blob([bytes], { type: 'application/pdf' }), receiptFileName(r)); }
    catch (e) { fail(e); } finally { b.disabled = false; }
  });
}

/* Registre de tous les reçus émis, du plus récent au plus ancien */
function registry(receipts) {
  openModal({
    title: `Reçus de cotisation émis (${receipts.length})`,
    body: `<p class="small muted" style="margin-top:0">Un reçu émis garde son numéro : il ne peut être ni modifié ni supprimé, pour que la numérotation reste sans trou. En cas d’erreur, émettez un nouveau reçu et ne transmettez pas l’ancien.</p>
      <div class="list" id="rg">${receipts.map(rowHtml).join('')}</div>`,
    foot: `<button class="btn" data-close>Fermer</button>`,
    onMount: root => bindRows($('#rg', root), receipts),
  });
}

/* Reçu créé : PDF prêt à partager (WhatsApp, Fichiers…) ou à télécharger */
async function deliver(r, phone) {
  const bytes = await buildReceiptPdf(r);
  const blob = new Blob([bytes], { type: 'application/pdf' }), name = receiptFileName(r);
  const mobile = matchMedia('(pointer: coarse)').matches || navigator.standalone;
  const club = S.settings?.club_name || '';
  const text = link => `Bonjour ${r.data.first_name},\n\nvoici ton reçu de cotisation n° ${r.number} (${money(r.data.amount)}), à remettre à ton entreprise pour le remboursement${link ? ` :\n\n${link}\n\n(lien valable un an : pense à enregistrer le PDF)` : '.'}\n\nSportivement,\n${club}`;
  // Sur ordinateur, WhatsApp ne permet pas à un site de joindre un fichier : on dépose le PDF
  // dans l'espace privé du club et le message part avec un lien sécurisé vers ce PDF.
  let link = null;
  if (!mobile) {
    try {
      const path = `recus/${r.number}-${Math.random().toString(36).slice(2, 12)}/${name}`;
      const up = await sb.storage.from('inscriptions').upload(path, blob, { contentType: 'application/pdf' });
      if (up.error) throw up.error;
      const { data, error } = await sb.storage.from('inscriptions').createSignedUrl(path, 365 * 24 * 3600);
      if (error) throw error;
      link = data.signedUrl.replace(/_/g, '%5F'); // pas de « _ » : WhatsApp le prendrait pour de l'italique et casserait le lien
    } catch (e) { console.error(e); link = null; }
  }
  const wa = waUrl(phone || null, text(link));
  const who = `<strong>${esc(r.data.first_name)} ${esc(r.data.last_name)}</strong>`;
  openModal({
    title: `Reçu n° ${r.number} créé`, size: 'sm',
    body: `<p style="margin-top:0">Le reçu de ${who} (${money(r.data.amount)}) est prêt.</p>
      <p class="small muted">${mobile ? 'Touchez <strong>Envoyer sur WhatsApp</strong>, choisissez WhatsApp puis la conversation de l’adhérent : le PDF part avec le message. Si le message n’apparaît pas, il est copié : appuyez longuement dans la zone de texte et choisissez « Coller ».'
        : link ? `Cliquez sur <strong>Envoyer sur WhatsApp</strong> : la conversation${phone ? '' : ' (choisissez l’adhérent)'} s’ouvre avec le message et le lien du PDF, il ne reste qu’à appuyer sur Entrée.`
        : 'Téléchargez le PDF, puis ouvrez WhatsApp et joignez-le au message (glisser-déposer le fichier dans la conversation).'}</p>`,
    foot: mobile ? `<button class="btn btn-primary" id="rd-go">${icon('chat')}Envoyer sur WhatsApp</button>`
      : `<button class="btn" id="rd-go">${icon('file')}Télécharger le PDF</button>${wa ? `<a class="btn ${link ? 'btn-primary' : ''}" href="${esc(wa)}" target="_blank" rel="noopener">${icon('chat')}${link ? 'Envoyer sur WhatsApp' : 'Ouvrir WhatsApp'}</a>` : ''}`,
    onMount: root => {
      $('#rd-go', root).onclick = async () => {
        const msg = text(null);
        if (mobile) navigator.clipboard?.writeText(msg).catch(() => {}); // au cas où WhatsApp ne garde que le fichier
        try { if (await saveFile(blob, name, mobile ? msg : '')) toast(mobile ? 'Reçu envoyé' : 'Reçu téléchargé'); } catch (e) { fail(e); }
      };
    },
  });
}

/* Construction du PDF (A4) avec pdf-lib */
export async function buildReceiptPdf(r) {
  const { PDFDocument, StandardFonts, rgb } = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');
  const d = r.data, c = d.club || {};
  const hx = h => { const n = parseInt(h.slice(1), 16); return rgb((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); };
  const DARK = hx('#14181F'), GREY = hx('#5A5F6A'), LINE = hx('#D5D8DD'), LIGHT = hx('#F3F4F6'), ACCENT = hx('#D0161B'), OK = hx('#1E7B34'), OKBG = hx('#EAF6EC'), WHITE = rgb(1, 1, 1);
  const doc = await PDFDocument.create();
  doc.setTitle(`Reçu de cotisation n° ${r.number}`); doc.setAuthor(c.name || ''); doc.setSubject(d.object || '');
  const F = await doc.embedFont(StandardFonts.Helvetica), FB = await doc.embedFont(StandardFonts.HelveticaBold), FI = await doc.embedFont(StandardFonts.HelveticaOblique);
  const W = 595.28, H = 841.89, M = 50;
  const page = doc.addPage([W, H]);
  const clean = v => { let o = ''; for (let ch of String(v ?? '')) { if (/[    ]/.test(ch)) ch = ' '; else if (ch === '‑' || ch === '–' || ch === '—') ch = '-'; try { F.encodeText(ch); o += ch; } catch { /* caractère non imprimable */ } } return o; };
  const width = (t, size, font = F) => font.widthOfTextAtSize(clean(t), size);
  const text = (t, x, y, size = 10, font = F, color = DARK) => page.drawText(clean(t), { x, y, size, font, color });
  const right = (t, xr, y, size = 10, font = F, color = DARK) => text(t, xr - width(t, size, font), y, size, font, color);
  const wrap = (t, size, w, font = F) => { const out = []; for (const p of clean(t).split('\n')) { let line = ''; for (const word of p.split(' ')) { const x = line ? line + ' ' + word : word; if (font.widthOfTextAtSize(x, size) > w && line) { out.push(line); line = word; } else line = x; } out.push(line); } return out; };
  const para = (t, x, y, w, size = 10, font = F, color = DARK, lh = 1.35) => { for (const l of wrap(t, size, w, font)) { page.drawText(l, { x, y, size, font, color }); y -= size * lh; } return y; };

  // Logo du club (s'il a été ajouté dans Paramètres → Documents)
  let logo = null; const lf = S.settings?.club_documents?.logo;
  if (lf) { try { const res = await fetch(docUrl(lf)); if (res.ok) { const b = new Uint8Array(await res.arrayBuffer()); logo = /png/i.test(lf.type || lf.path) ? await doc.embedPng(b) : await doc.embedJpg(b); } } catch { logo = null; } }

  // En-tête : identité de l'association
  page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: ACCENT });
  let y = H - 58, tx = M;
  if (logo) { const k = Math.min(64 / logo.width, 64 / logo.height), w = logo.width * k, h = logo.height * k; page.drawImage(logo, { x: M, y: H - 40 - h, width: w, height: h }); tx = M + w + 14; }
  // Titre, numéro, date d'émission (à droite) ; l'identité du club, à gauche, ne déborde jamais dessus
  const xr = W - M, title = 'REÇU DE COTISATION', dateLine = `Date d’émission : ${longDate(r.issued_on)}`;
  const maxW = xr - Math.max(width(title, 17, FB), width(dateLine, 9.5)) - 24 - tx;
  const name = c.name || 'Association';
  let ns = 15; while (ns > 10 && (wrap(name, ns, maxW, FB).length > 2 || wrap(name, ns, maxW, FB).some(l => FB.widthOfTextAtSize(l, ns) > maxW))) ns -= 0.5;
  y = para(name, tx, y, maxW, ns, FB, DARK, 1.2) + ns * 1.2 - 15;
  text('Association loi 1901', tx, y, 9.5, FI, GREY); y -= 13;
  for (const l of [c.address, [c.rna && 'RNA : ' + c.rna, c.siret && 'SIRET : ' + c.siret].filter(Boolean).join('   ·   '), c.email].filter(Boolean)) { y = para(l, tx, y, maxW, 9, F, GREY, 1.3); }
  right(title, xr, H - 58, 17, FB);
  right(`N° ${r.number}`, xr, H - 78, 13, FB, ACCENT);
  right(dateLine, xr, H - 94, 9.5, F, GREY);

  y = Math.min(y, H - 130) - 18;
  page.drawLine({ start: { x: M, y }, end: { x: xr, y }, thickness: 0.8, color: LINE });
  y -= 26;

  // Destinataire
  const who = [d.civility, d.first_name, d.last_name].filter(Boolean).join(' ');
  const bx = W / 2 + 10, bw = xr - bx;
  text('ÉTABLI AU NOM DE', bx, y, 8, FB, GREY);
  let by = y - 16;
  if (d.company) {
    by = para(d.company, bx, by, bw, 11, FB);
    by = para(`pour le compte de ${who || (d.first_name + ' ' + d.last_name)}`, bx, by, bw, 10);
    if (d.company_address) by = para(d.company_address, bx, by, bw, 9.5, F, GREY);
  } else {
    by = para(who, bx, by, bw, 11, FB);
    if (d.address) by = para(d.address, bx, by, bw, 9.5, F, GREY);
  }
  let ay = y;
  if (d.company) { // l'adhérent, à gauche, quand le reçu est au nom de l'entreprise
    text('ADHÉRENT', M, y, 8, FB, GREY); ay = y - 16;
    ay = para(who, M, ay, bw, 11, FB);
    if (d.address) ay = para(d.address, M, ay, bw, 9.5, F, GREY);
  }
  y = Math.min(by, ay) - 22;

  // Tableau : désignation, période, montant
  const c1 = M + 10, c2 = M + 285, c3 = xr - 10;
  page.drawRectangle({ x: M, y: y - 8, width: xr - M, height: 24, color: DARK });
  text('Désignation', c1, y, 9, FB, WHITE); text('Période', c2, y, 9, FB, WHITE); right('Montant', c3, y, 9, FB, WHITE);
  y -= 30;
  const l1 = wrap(d.object, 10, c2 - c1 - 14), l2 = wrap(d.period, 10, c3 - c2 - 80);
  const rows = Math.max(l1.length, l2.length), rowH = rows * 13.5 + 12;
  page.drawRectangle({ x: M, y: y - rowH + 16, width: xr - M, height: rowH, color: LIGHT });
  l1.forEach((l, i) => page.drawText(l, { x: c1, y: y - i * 13.5, size: 10, font: F, color: DARK }));
  l2.forEach((l, i) => page.drawText(l, { x: c2, y: y - i * 13.5, size: 10, font: F, color: DARK }));
  right(money(d.amount), c3, y, 10, FB);
  y -= rowH + 4;
  page.drawLine({ start: { x: M, y: y + 10 }, end: { x: xr, y: y + 10 }, thickness: 0.8, color: LINE });

  // Total (un seul montant, sans TVA)
  y -= 12;
  const tl = 'Montant total', tv = money(d.amount);
  page.drawRectangle({ x: xr - 230, y: y - 10, width: 230, height: 30, color: LIGHT });
  text(tl, xr - 220, y, 11, FB); right(tv, c3, y, 13, FB);
  y -= 26;
  right(d.vat_mention || VAT_MENTIONS[0][0], xr, y, 9, FI, GREY);
  y -= 34;

  // Acquittement
  const paid = `Acquittée le ${longDate(d.paid_on)} par ${methodText(d.method)}.`;
  page.drawRectangle({ x: M, y: y - 12, width: xr - M, height: 32, color: OKBG, borderColor: OK, borderWidth: 0.8 });
  text(paid, M + 12, y, 10.5, FB, OK);
  y -= 42;

  // Attestation
  y = para(`L’association ${c.name || ''} certifie avoir reçu de ${who} la somme de ${money(d.amount)} au titre de la cotisation d’adhésion décrite ci-dessus (${String(d.period || '').replace(/^./, x => x.toLowerCase())}). Cette somme n’est pas soumise à la TVA.`, M, y, xr - M, 10, F, DARK, 1.45);
  y -= 26;

  // Signature
  const sx = W / 2 + 10;
  text(`Fait le ${longDate(r.issued_on)}`, sx, y, 10); y -= 15;
  text(`Pour l’association, ${d.signer?.role ? 'le/la ' + d.signer.role.toLowerCase() : 'le bureau'}`, sx, y, 10, F, GREY); y -= 14;
  if (d.signer?.name) text(d.signer.name, sx, y, 10.5, FB);
  page.drawRectangle({ x: sx, y: y - 62, width: xr - sx, height: 50, borderColor: LINE, borderWidth: 0.6, borderDashArray: [3, 3] });

  // Pied de page
  page.drawLine({ start: { x: M, y: 46 }, end: { x: xr, y: 46 }, thickness: 0.6, color: LINE });
  const foot = [c.name, 'association loi 1901', c.address, c.rna && 'RNA ' + c.rna, c.siret && 'SIRET ' + c.siret].filter(Boolean).join(' · ');
  let fs = 7.5; while (width(foot, fs) > xr - M && fs > 5) fs -= 0.25;
  text(foot, (W - width(foot, fs)) / 2, 32, fs, F, GREY);
  const fn = `Reçu n° ${r.number}`; text(fn, (W - width(fn, 7.5)) / 2, 20, 7.5, F, GREY);

  return doc.save();
}
