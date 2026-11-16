// Defendr — Inscriptions en ligne et réinscription
import { $, $$, S, activeSeason, ageOf, closeModal, confirmBox, esc, fail, fmtDate, fmtMoney, fullName, icon, isAdmin, isoDay, openModal, sb, toast, waLink } from './core.js';
import { go, head, loadRefs, route } from './shell.js';
import { feeOptions } from './members.js';
import { inviteForm, markProspectRegistered, saveProspectInvite } from './prospects.js';
import { waUrl } from './whatsapp.js';

/* =====================================================================
   Inscription en ligne (rubrique du menu)
   ===================================================================== */
export async function viewRegistration(view) {
  await loadRefs(); // saison active, utilisée par le dossier PDF
  view.innerHTML = head('Inscription en ligne', 'Le lien à envoyer aux futurs adhérents et le dossier PDF à signer') + `<div id="reg-page-banner"></div>
    <div class="grid">
    <div class="card card-pad">
      <h2>Lien d’inscription</h2>
      <p class="small muted">Envoyez ce lien aux personnes qui veulent s’inscrire : elles remplissent leur fiche elles-mêmes, envoient leur certificat médical ou leur questionnaire de santé, et la demande arrive dans la page Membres, à valider.</p>
      <div class="row" style="gap:8px"><input class="input" id="reg-url" readonly value="${esc(registrationUrl())}" aria-label="Lien d’inscription"><button class="btn" id="reg-copy">${icon('copy')}</button></div>
      <div class="row wrap mt" style="gap:8px"><button class="btn btn-primary" id="reg-invite">${icon('chat')}Inviter une personne sur WhatsApp</button><a class="btn btn-sm" href="${esc(registrationUrl())}" target="_blank" rel="noopener">Voir la page</a></div>
      <p class="small muted" style="margin-bottom:0">Chaque personne invitée est ajoutée à la rubrique <a href="#/prospects">Prospects</a>.</p>
      <div class="section-title mt">Dossier PDF à signer</div>
      <p class="small muted">Pour les personnes qui préfèrent remplir et signer un PDF : un lien vers la fiche complète, envoyé par WhatsApp (cotisation, virement, droit à l’image, règlement, autorisation parentale, santé), suivie des documents du club en annexe.</p>
      <button class="btn" id="pdf-send">${icon('chat')}Envoyer le dossier PDF par WhatsApp</button>
    </div>
    <div class="card card-pad" id="renew-card"><h2>Réinscription ${activeSeason() ? esc(activeSeason().label) : ''}</h2><div class="small muted">Chargement…</div></div>
    <div class="card card-pad">
      <h2>Documents et paiement</h2>
      <p class="small muted">Le règlement, les questionnaires de santé, le RIB et les coordonnées bancaires proposés sur la page d’inscription et joints au dossier PDF se gèrent ${isAdmin() ? 'dans les <a href="#/parametres">Paramètres</a>' : 'par le président ou le trésorier, dans les Paramètres'}.</p>
    </div>
    </div>`;
  $('#reg-copy').onclick = async () => { try { await navigator.clipboard.writeText(registrationUrl()); toast('Lien copié'); } catch { $('#reg-url').select(); toast('Sélectionnez le lien pour le copier', 'error'); } };
  $('#pdf-send').onclick = openPdfDossier;
  $('#reg-invite').onclick = () => inviteForm();
  renewalCard($('#renew-card'));
  sb.from('registrations').select('id', { count: 'exact', head: true }).eq('status', 'nouvelle').then(({ count }) => {
    const box = $('#reg-page-banner'); if (!box) return;
    box.innerHTML = `<div class="alert info row between wrap" style="gap:8px"><span>${count ? `<strong>${count} demande${count > 1 ? 's' : ''} d’inscription en ligne</strong> à traiter.` : 'Aucune nouvelle demande d’inscription.'}</span><button class="btn btn-sm${count ? ' btn-primary' : ''}" id="reg-page-open">Voir les demandes</button></div>`;
    $('#reg-page-open').onclick = openRegistrations;
  });
}


/* =====================================================================
   Réinscription de saison : lien personnel, fiche déjà remplie
   ===================================================================== */
// Début de saison : 1er août de la première année du libellé (« 2026/2027 »), sinon date de création
export const seasonStart = se => { const y = String(se?.label || '').match(/(\d{4})/)?.[1]; return y ? `${y}-08-01` : se?.created_at?.slice(0, 10) || '1900-01-01'; };
export const renewalUrl = m => `${registrationUrl()}?r=${m.renewal_token}`;
export const renewalPhone = m => (ageOf(m.birth_date) ?? 99) < 18 && m.guardian_phone ? m.guardian_phone : m.phone;
export const renewalText = m => { const se = activeSeason(), minor = (ageOf(m.birth_date) ?? 99) < 18 && m.guardian_phone;
  return `Bonjour ${minor && m.guardian_name ? m.guardian_name.split(' ')[0] : m.first_name},\n\nla saison ${se?.label || ''} du ${S.settings?.club_name || 'club'} commence ! Pour ${minor ? 'réinscrire ' + m.first_name : 'te réinscrire'}, la fiche est déjà remplie : il suffit de la vérifier, d’ajouter le certificat médical ou le questionnaire de santé, et de l’envoyer.\n\n${renewalUrl(m)}\n\nÀ très vite sur le tatami !`; };

export async function renewalCard(box) {
  if (!box) return;
  const se = activeSeason();
  const title = `<h2>Réinscription${se ? ' ' + esc(se.label) : ''}</h2>`;
  if (!se) { box.innerHTML = title + `<p class="small muted">Aucune saison active. ${isAdmin() ? '<a href="#/parametres">Créez la nouvelle saison dans les Paramètres</a>' : 'Le président ou le trésorier doit créer la nouvelle saison'} pour lancer les réinscriptions.</p>`; return; }
  const { data, error } = await sb.from('members').select('id, first_name, last_name, phone, birth_date, guardian_name, guardian_phone, status, registration_date, renewal_token, renewal_sent_at, renewed_season_id').eq('status', 'actif').order('last_name');
  if (error) { box.innerHTML = title + '<div class="small muted">Impossible de charger les membres.</div>'; return; }
  if (data.length && !('renewal_token' in data[0])) { box.innerHTML = title + '<div class="alert error">Pour activer la réinscription, exécutez une fois le fichier <strong>migration-10.sql</strong> dans Supabase → Éditeur SQL.</div>'; return; }
  const start = seasonStart(se);
  const concerned = data.filter(m => (m.registration_date || '1900-01-01') < start);
  const done = concerned.filter(m => m.renewed_season_id === se.id), todo = concerned.filter(m => m.renewed_season_id !== se.id);
  const unsent = todo.filter(m => !m.renewal_sent_at && waLink(renewalPhone(m)));
  box.innerHTML = title + `
    <p class="small muted">Chaque membre de la saison passée reçoit un lien personnel : sa fiche est déjà remplie, il la vérifie, joint son justificatif de santé et l’envoie. La demande arrive dans les inscriptions en ligne et met à jour sa fiche existante.</p>
    <div class="row wrap" style="gap:8px;align-items:center"><span class="badge ok">${done.length} réinscrit${done.length > 1 ? 's' : ''}</span><span class="badge">${todo.length} à réinscrire</span>
      ${unsent.length ? `<a class="btn btn-primary btn-sm" id="rn-next" href="${esc(waUrl(renewalPhone(unsent[0]), renewalText(unsent[0])))}" target="_blank" rel="noopener" data-m="${unsent[0].id}">${icon('chat')}Envoyer au suivant : ${esc(fullName(unsent[0]))} (${unsent.length})</a>` : ''}</div>
    ${todo.length ? `<div class="mt" id="rn-list">${todo.map(m => `<div class="bday" data-row="${m.id}"><div style="flex:1;min-width:0"><div style="font-weight:600">${esc(fullName(m))}</div>
      <div class="small muted">${m.renewal_sent_at ? `Lien envoyé le ${fmtDate(m.renewal_sent_at.slice(0, 10))}` : waLink(renewalPhone(m)) ? 'Pas encore envoyé' : 'Pas de téléphone : copiez le lien'}</div></div>
      ${waLink(renewalPhone(m)) ? `<a class="btn btn-sm" href="${esc(waUrl(renewalPhone(m), renewalText(m)))}" target="_blank" rel="noopener" data-send="${m.id}">${icon('chat')}${m.renewal_sent_at ? 'Relancer' : 'Envoyer'}</a>` : ''}
      <button class="icon-btn" data-copy="${m.id}" aria-label="Copier le lien de ${esc(fullName(m))}" title="Copier le lien">${icon('copy')}</button>
      <button class="btn btn-sm" data-done="${m.id}" title="Réinscrit sur papier ou en main propre">${icon('check')}Réinscrit</button></div>`).join('')}</div>` : `<p class="small mt">${concerned.length ? 'Tous les membres de la saison passée sont réinscrits. 🎉' : 'Aucun membre inscrit avant cette saison.'}</p>`}`;
  const byId = id => data.find(m => m.id === id);
  const sent = id => sb.from('members').update({ renewal_sent_at: new Date().toISOString() }).eq('id', id).then(() => setTimeout(() => renewalCard(box), 400));
  $('#rn-next', box) && ($('#rn-next', box).onclick = e => sent(e.currentTarget.dataset.m));
  box.onclick = async e => {
    const t = e.target.closest('[data-send],[data-copy],[data-done]'); if (!t) return;
    if (t.dataset.send) return sent(t.dataset.send);
    if (t.dataset.copy) { try { await navigator.clipboard.writeText(renewalUrl(byId(t.dataset.copy))); toast('Lien personnel copié'); } catch { toast('Copie impossible', 'error'); } return; }
    if (t.dataset.done) { const { error } = await sb.from('members').update({ renewed_season_id: se.id }).eq('id', t.dataset.done); if (error) return fail(error); toast(`${byId(t.dataset.done).first_name} : réinscription notée`); renewalCard(box); }
  };
}

/* =====================================================================
   Inscriptions en ligne
   ===================================================================== */
export const registrationUrl = () => location.origin + location.pathname.replace(/[^/]*$/, '') + 'inscription.html';

// Documents du club, réglables dans Paramètres (stockés dans l'espace public « documents »)
export const CLUB_DOCS = [
  { key: 'reglement', label: 'Règlement intérieur' },
  { key: 'qss', label: 'Questionnaire de santé QS-Sport (adultes)' },
  { key: 'qss_mineur', label: 'Questionnaire de santé (mineurs)' },
  { key: 'rib', label: 'RIB du club' },
  { key: 'logo', label: 'Logo du club (en-tête du dossier PDF)', image: true },
];
export const docUrl = f => f?.path ? sb.storage.from('documents').getPublicUrl(f.path).data.publicUrl : null;

// Justificatifs de santé envoyés avec l'inscription (espace privé « inscriptions »)
export const HEALTH_KIND = { certificat: 'Certificat médical', questionnaire: 'Questionnaire de santé' };
export const healthFileButtons = files => (files || []).map((f, i) => `<button type="button" class="btn btn-sm" data-hf="${i}">${icon('file')}${esc(HEALTH_KIND[f.kind] || 'Justificatif')}</button>`).join('');
export function bindHealthFiles(root, files) {
  $$('[data-hf]', root).forEach(b => b.onclick = async () => {
    const f = files[+b.dataset.hf];
    const w = window.open('', '_blank'); // ouvert tout de suite, sinon le téléphone bloque la fenêtre
    const { data, error } = await sb.storage.from('inscriptions').createSignedUrl(f.path, 600);
    if (error) { w?.close(); return fail(error); }
    if (w) w.location = data.signedUrl; else location.href = data.signedUrl;
  });
}

/* ---------- Dossier d'inscription PDF à signer, envoyé par WhatsApp ---------- */
export function openPdfDossier() {
  const slug = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  let pdfFile = null;
  openModal({
    title: 'Dossier PDF à signer', size: 'sm',
    body: `<form id="pd-f"><p class="small muted" style="margin-top:0">Le message WhatsApp contiendra un lien vers le dossier PDF : la personne l’ouvre d’un simple toucher, le remplit, le signe et vous le renvoie.</p>
      <div class="form-grid"><div class="field"><label for="pd-fn">Prénom</label><input class="input" id="pd-fn" name="prenom" autocomplete="off"></div>
      <div class="field"><label for="pd-ln">Nom</label><input class="input" id="pd-ln" name="nom" autocomplete="off"></div></div>
      <div class="field"><label for="pd-ph">Téléphone WhatsApp</label><input class="input" id="pd-ph" name="tel" type="tel" autocomplete="off" placeholder="06 12 34 56 78"><span class="help">Laissez vide pour choisir la personne ou le groupe dans WhatsApp. Avec un prénom, la personne est ajoutée aux Prospects.</span></div>
      <div id="pd-msg"></div></form>`,
    foot: `<button class="btn" data-close>Fermer</button><button class="btn btn-primary" id="pd-make">${icon('file')}Préparer le dossier</button><a class="btn btn-primary" id="pd-wa" href="#" target="_blank" rel="noopener" hidden>${icon('chat')}Envoyer sur WhatsApp</a>`,
    onMount: root => {
      const form = $('#pd-f', root), msg = $('#pd-msg', root), make = $('#pd-make', root), wa = $('#pd-wa', root);
      let pdfUrl = null;
      const text = () => { const p = form.prenom.value.trim(); return `Bonjour${p ? ' ' + p : ''},\n\nvoici ton dossier d’inscription au ${S.settings?.club_name || 'club'}${activeSeason() ? ' pour la saison ' + activeSeason().label : ''}. Touche le lien pour l’ouvrir :\n\n${pdfUrl}\n\n1. Ouvre le PDF, remplis-le et signe-le (sur ton téléphone ou imprimé).\n2. Joins ton certificat médical ou signe l’attestation de santé (page 3).\n3. Règle la cotisation : virement (coordonnées page 2), chèque ou espèces.\n\nRenvoie-nous le tout ici ou apporte-le au prochain cours. À très vite sur le tatami !`; };
      const refreshLink = () => { if (pdfUrl) wa.href = waUrl(form.tel.value.trim() || null, text()) || waUrl(null, text()); };
      form.oninput = refreshLink;
      wa.addEventListener('click', () => { const fn = form.prenom.value.trim(); if (fn) saveProspectInvite({ first_name: fn, last_name: form.nom.value.trim(), phone: form.tel.value.trim() }, 'pdf'); });
      make.onclick = async () => {
        make.disabled = true; make.textContent = 'Préparation…'; msg.innerHTML = '';
        if (!isAdmin()) { // les enseignants ne peuvent pas mettre de fichier en ligne : ils envoient le dernier dossier préparé par le bureau
          const last = S.settings?.club_documents?.dossier;
          if (last?.path) {
            pdfUrl = docUrl(last); refreshLink(); make.hidden = true; wa.hidden = false;
            msg.innerHTML = `<div class="alert info" style="margin:0">Dossier prêt (dernière version préparée par le bureau le ${fmtDate(last.updated_at)}). Touchez <strong>Envoyer sur WhatsApp</strong> : le message part avec le lien du PDF.<div class="mt"><a href="${esc(pdfUrl)}" target="_blank" rel="noopener">Voir le PDF</a></div></div>`;
          } else {
            make.disabled = false; make.innerHTML = `${icon('file')}Préparer le dossier`;
            msg.innerHTML = '<div class="alert error" style="margin:0">Le dossier PDF n’a pas encore été préparé. Demandez au président ou au trésorier de l’envoyer une première fois depuis cette page : vous pourrez ensuite l’envoyer vous aussi.</div>';
          }
          return;
        }
        try {
          const { bytes, problems } = await buildDossierPdf({ prenom: '', nom: '', tel: '' });
          pdfFile = new File([bytes], `dossier-inscription-${slug(S.settings?.club_name).replace(/_/g, '-').toLowerCase() || 'club'}.pdf`, { type: 'application/pdf' }); // pas de « _ » : WhatsApp le prendrait pour de l'italique et casserait le lien
          // Le dossier en ligne ne contient aucune donnée personnelle ; l'ancien est retiré à chaque nouvel envoi
          const path = `dossier/${Date.now().toString(36)}/${pdfFile.name}`;
          const { error } = await sb.storage.from('documents').upload(path, pdfFile, { contentType: 'application/pdf' });
          if (error) throw error;
          pdfUrl = sb.storage.from('documents').getPublicUrl(path).data.publicUrl;
          const docs = { ...(S.settings.club_documents || {}) }, old = docs.dossier;
          docs.dossier = { path, name: pdfFile.name, type: 'application/pdf', updated_at: new Date().toISOString() };
          const { error: e2 } = await sb.from('club_settings').update({ club_documents: docs }).eq('id', 1);
          if (!e2) { S.settings.club_documents = docs; if (old?.path) sb.storage.from('documents').remove([old.path]).catch(() => {}); }
          refreshLink(); make.hidden = true; wa.hidden = false;
          msg.innerHTML = `<div class="alert ${problems.length ? 'error' : 'info'}" style="margin:0">${problems.length ? `Dossier prêt, mais ces documents n’ont pas pu être ajoutés : ${esc(problems.join(', '))}. Vérifiez-les dans Documents et paiement de l’inscription.` : 'Dossier prêt.'} Touchez <strong>Envoyer sur WhatsApp</strong> : le message part avec le lien du PDF.<div class="mt"><a href="${esc(pdfUrl)}" target="_blank" rel="noopener">Voir le PDF</a></div></div>`;
        } catch (e) {
          fail(e);
          msg.innerHTML = `<div class="alert error" style="margin:0">Le dossier n’a pas pu être mis en ligne. Vérifiez que migration-7.sql a bien été exécuté dans Supabase.</div>`;
        } finally { make.disabled = false; make.innerHTML = `${icon('file')}Préparer le dossier`; }
      };
    },
  });
}

export async function buildDossierPdf(ad) {
  const { PDFDocument, StandardFonts, rgb } = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');
  const s = S.settings || {}, season = activeSeason(), docs = s.club_documents || {};
  const club = s.club_name || 'le club', fede = (s.federation_label ?? 'l’ADAC').trim();
  const hx = h => { const n = parseInt(h.slice(1), 16); return rgb((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); };
  const RED = hx('#D0161B'), DARK = hx('#111111'), GREY = hx('#5A5A5A'), LIGHT = hx('#F4F4F4'), FIELD = hx('#FBF6F6'), LINE = hx('#BDBDBD'),
    GREEN = hx('#2E7D32'), BLUE = hx('#1F4E9E'), PURPLE = hx('#6A2A9A'), WHITE = rgb(1, 1, 1), BLACK = rgb(0, 0, 0), PINK = hx('#FFF5F5'), SOFT = hx('#BBBBBB');
  const doc = await PDFDocument.create();
  doc.setTitle(`Dossier d'inscription – ${club}`); doc.setAuthor(club);
  const F = await doc.embedFont(StandardFonts.Helvetica), FB = await doc.embedFont(StandardFonts.HelveticaBold),
    FI = await doc.embedFont(StandardFonts.HelveticaOblique), FC = await doc.embedFont(StandardFonts.CourierBold);
  const form = doc.getForm();
  const W = 595.28, H = 841.89, M = 30, half = (W - 2 * M - 12) / 2;
  let page, y;
  const clean = v => { let o = ''; for (const ch of String(v ?? '')) { try { F.encodeText(ch); o += ch; } catch { o += ({ ' ': ' ', ' ': ' ', '‑': '-', '→': '>' })[ch] ?? ''; } } return o; };
  const text = (t, x, yy, size = 9, font = F, color = DARK) => page.drawText(clean(t), { x, y: yy, size, font, color });
  const wrap = (t, font, size, w) => { const out = []; for (const p of clean(t).split('\n')) { let line = ''; for (const word of p.split(' ')) { const c = line ? line + ' ' + word : word; if (font.widthOfTextAtSize(c, size) > w && line) { out.push(line); line = word; } else line = c; } out.push(line); } return out; };
  const para = (t, x, yy, w, size = 8.5, font = F, color = DARK) => { for (const l of wrap(t, font, size, w)) { page.drawText(l, { x, y: yy, size, font, color }); yy -= size * 1.3; } return yy; };
  const rrect = (x, yy, w, h, r, o) => page.drawSvgPath(`M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`,
    { x, y: yy + h, color: o.fill, borderColor: o.stroke, borderWidth: o.stroke ? (o.bw || 0.8) : 0, borderDashArray: o.dash });
  const names = new Set(); const uniq = n => { let k = n, i = 2; while (names.has(k)) k = n + '_' + i++; names.add(k); return k; };
  const tf = (name, x, yy, w, h = 15, o = {}) => { const f = form.createTextField(uniq(name)); if (o.multiline) f.enableMultiline(); if (o.value) f.setText(clean(o.value));
    f.addToPage(page, { x, y: yy, width: w, height: h, borderColor: LINE, backgroundColor: FIELD, borderWidth: 0.6, textColor: BLACK, font: F }); f.setFontSize(9); };
  const cb = (name, x, yy, size = 10) => form.createCheckBox(uniq(name)).addToPage(page, { x, y: yy, width: size, height: size, borderColor: GREY, borderWidth: 0.8, backgroundColor: WHITE, textColor: RED });
  const labeled = (label, name, x, yy, w, value) => { const lw = FB.widthOfTextAtSize(clean(label), 8.5) + 5; text(label, x, yy + 4, 8.5, FB); tf(name, x + lw, yy, w - lw, 15, { value }); };
  const section = (num, title, color = RED) => { rrect(M, y - 20, W - 2 * M, 20, 4, { fill: color }); page.drawCircle({ x: M + 14, y: y - 10, size: 7, color: WHITE });
    const n = String(num); page.drawText(n, { x: M + 14 - FB.widthOfTextAtSize(n, 9) / 2, y: y - 13.2, size: 9, font: FB, color }); text(title, M + 28, y - 14, 10.5, FB, WHITE); y -= 32; };
  const signRow = (prefix, label = 'Signature') => { rrect(M, y - 34, W - 2 * M, 40, 4, { fill: LIGHT }); text('Date :', M + 10, y - 14, 8.5, FB); tf(prefix + '_date', M + 42, y - 18, 80);
    const lw = FB.widthOfTextAtSize(clean(label + ' :'), 8.5); text(label + ' :', M + 140, y - 14, 8.5, FB); tf(prefix + '_signature', M + 140 + lw + 6, y - 28, W - 2 * M - 160 - lw, 30); y -= 46; };
  const fetchDoc = async f => { const r = await fetch(docUrl(f)); if (!r.ok) throw new Error('introuvable'); return new Uint8Array(await r.arrayBuffer()); };

  let logo = null;
  if (docs.logo) { try { const b = await fetchDoc(docs.logo); logo = /png/i.test(docs.logo.type || docs.logo.path) ? await doc.embedPng(b) : await doc.embedJpg(b); } catch { logo = null; } }
  const header = () => { page.drawRectangle({ x: 0, y: H - 118, width: W, height: 118, color: DARK }); page.drawRectangle({ x: 0, y: H - 122, width: W, height: 4, color: RED });
    let tx = M;
    if (logo) { const k = Math.min(88 / logo.width, 101 / logo.height), w = logo.width * k, h = logo.height * k; page.drawImage(logo, { x: M - 4 + (88 - w) / 2, y: H - 112 + (101 - h) / 2, width: w, height: h }); tx = M + 100; }
    text("FICHE D'INSCRIPTION", tx, H - 52, 25, FB, WHITE); if (season) text('SAISON ' + season.label.replace('/', ' / '), tx, H - 72, 13, FB, RED);
    text(club, tx, H - 90, 10, F, WHITE); text('Remplissez et signez ce dossier, puis renvoyez-le avec les pièces demandées (page 3).', tx, H - 105, 8.5, FI, SOFT); };
  const footer = n => { page.drawRectangle({ x: 0, y: 0, width: W, height: 30, color: DARK }); page.drawRectangle({ x: 0, y: 30, width: W, height: 2, color: RED });
    const line = [s.club_address, s.whatsapp_number, s.club_email].filter(Boolean).join('  ·  '); let fs = 7.5; while (F.widthOfTextAtSize(clean(line), fs) > W - 2 * M - 30 && fs > 5) fs -= 0.25;
    text(line, M, 12, fs, F, WHITE); text(n + '/3', W - M - F.widthOfTextAtSize(n + '/3', 7.5), 12, 7.5, F, WHITE); };

  /* Page 1 */
  page = doc.addPage([W, H]); header(); y = H - 136;
  section(1, 'INFORMATIONS PERSONNELLES');
  labeled('Nom :', 'nom', M, y - 4, half, ad.nom); labeled('Prénom :', 'prenom', M + half + 12, y - 4, half, ad.prenom); y -= 22;
  labeled('Date de naissance :', 'date_naissance', M, y - 4, half);
  text('Sexe :', M + half + 12, y, 8.5, FB); cb('sexe_f', M + half + 50, y - 2); text('F', M + half + 64, y, 8.5); cb('sexe_m', M + half + 82, y - 2); text('M', M + half + 96, y, 8.5); y -= 22;
  labeled('Adresse :', 'adresse', M, y - 4, W - 2 * M); y -= 22;
  labeled('Code postal :', 'code_postal', M, y - 4, 150); labeled('Ville :', 'ville', M + 162, y - 4, W - 2 * M - 162); y -= 22;
  labeled('Téléphone :', 'telephone', M, y - 4, half, ad.tel); labeled('E-mail :', 'email', M + half + 12, y - 4, half); y -= 26;
  rrect(M, y - 52, W - 2 * M, 60, 4, { fill: LIGHT });
  text("PERSONNE À PRÉVENIR EN CAS D'URGENCE", M + 10, y - 6, 8.5, FB, RED);
  labeled('Nom et prénom :', 'urgence_nom', M + 10, y - 28, half - 10); labeled('Lien :', 'urgence_lien', M + half + 12, y - 28, half - 10);
  labeled('Téléphone :', 'urgence_tel', M + 10, y - 48, half - 10); y -= 72;
  section(2, 'INFORMATIONS SPORTIVES');
  text('Avez-vous déjà pratiqué un art martial ou un sport de combat ?', M, y, 8.5, FB);
  cb('pratique_oui', M + 290, y - 2); text('Oui', M + 304, y, 8.5); cb('pratique_non', M + 330, y - 2); text('Non', M + 344, y, 8.5); y -= 22;
  labeled('Si oui, lequel et combien de temps ?', 'pratique_lequel', M, y - 4, W - 2 * M); y -= 24;
  text('Comment avez-vous connu le club ?', M, y, 8.5, FB); y -= 18;
  let x = M;
  for (const [l, n] of [['Bouche à oreille', 'connu_bouche'], ['Internet / réseaux', 'connu_internet'], ['Forum des associations', 'connu_forum'], ['Démonstration', 'connu_demo']]) { cb(n, x, y - 2); text(l, x + 14, y, 8.5); x += 130; }
  y -= 20; cb('connu_autre', M, y - 2); text('Autre :', M + 14, y, 8.5); tf('connu_autre_precision', M + 50, y - 4, W - 2 * M - 50); y -= 24;
  text('Taille du T-shirt (adulte) :', M, y, 8.5, FB); x = M + 130;
  for (const t of ['XS', 'S', 'M', 'L', 'XL', 'XXL']) { cb('tshirt_' + t, x, y - 2); text(t, x + 14, y, 8.5); x += 50; } y -= 28;
  section(3, 'COTISATION  (licence et assurance incluses)');
  feeOptions().filter(([, a]) => a != null).forEach(([l, a], i) => { cb('cotis_' + (i + 1), M, y - 2); text(l, M + 14, y, 8.5); text(fmtMoney(a), M + 330, y, 8.5, FB); y -= 17; });
  y -= 4; text('Mode de règlement :', M, y, 8.5, FB, RED); x = M + 105;
  for (const [l, n] of [[s.bank_iban ? 'Virement (coordonnées page 2)' : 'Virement', 'regl_virement'], ['Chèque(s)', 'regl_cheque'], ['Espèces', 'regl_especes']]) { cb(n, x, y - 2); text(l, x + 14, y, 8.5); x += F.widthOfTextAtSize(clean(l), 8.5) + 34; }
  y -= 22; labeled('Nombre de chèques :', 'nb_cheques', M, y - 4, 160); labeled('N° du ou des chèques :', 'num_cheques', M + 172, y - 4, W - 2 * M - 172); y -= 16;
  para(`Chèques à l'ordre de « ${s.bank_holder || club} ». Paiement possible en plusieurs chèques encaissés à des dates différentes, à indiquer au dos.`, M, y - 4, W - 2 * M, 7.5, FI, GREY);
  footer(1);

  /* Page 2 */
  page = doc.addPage([W, H]); y = H - 36;
  if (s.bank_iban) {
    rrect(M, y - 104, W - 2 * M, 104, 6, { fill: PINK, stroke: RED, bw: 1.2 });
    text('PAYER PAR VIREMENT', M + 12, y - 18, 11, FB, RED);
    let yy = y - 36;
    for (const [k, v] of [['Titulaire', s.bank_holder], ['IBAN', s.bank_iban], ['BIC', s.bank_bic], ['Banque', s.bank_name]]) { text(k, M + 12, yy, 8.5, FB, GREY); text(v || '', M + 72, yy, k === 'IBAN' ? 9.5 : 8.5, k === 'IBAN' || k === 'BIC' ? FC : F, DARK); yy -= 14; }
    text('Libellé à indiquer :', M + 12, yy - 2, 8.5, FB, GREY); text("COTISATION + NOM Prénom de l'adhérent", M + 100, yy - 2, 8.5, FB, RED);
    labeled('Date du virement :', 'virement_date', M + 330, y - 40, 175); y -= 122;
  }
  section(4, "AUTORISATION DU DROIT À L'IMAGE", PURPLE);
  y = para(`J'autorise ${fede || 'le club'} à prendre des photos ou des vidéos de moi (ou de mon enfant) lors des cours ou en stage, et à les diffuser sur le site web, les réseaux sociaux ou d'autres supports de communication du club${fede ? ' ou de ' + fede : ''}.`, M, y, W - 2 * M) - 6;
  cb('image_accepte', M, y - 2); text("J'accepte", M + 14, y, 9, FB, GREEN); cb('image_refuse', M + 100, y - 2); text('Je refuse', M + 114, y, 9, FB, RED); y -= 18; signRow('image');
  section(5, "CONSENTEMENT À L'UTILISATION DES DONNÉES", BLUE);
  y = para(`J'accepte que ${fede ? "l'association " + fede.replace(/^l['’]\s*/i, '') : 'le club'} collecte et utilise les données personnelles renseignées dans ce formulaire, pour la gestion de mon adhésion et de ma licence, conformément à la politique de protection des données du club ${club}${fede ? ' et de ' + fede : ''}.`, M, y, W - 2 * M);
  y = para(`Afin de protéger la confidentialité de vos données, le club${fede ? ' et ' + fede + " s'engagent" : " s'engage"} à ne pas les divulguer, ne pas les transmettre ni les partager avec d'autres entités, entreprises ou organismes, quels qu'ils soient, conformément au Règlement général sur la protection des données (RGPD). Les informations de santé ne sont utilisées que pour vérifier l'aptitude à la pratique.`, M, y - 2, W - 2 * M, 7.8, FI, GREY) - 6;
  cb('rgpd_accepte', M, y - 2); text("J'ai lu et j'accepte cette politique.", M + 14, y, 9, FB); y -= 18; signRow('rgpd');
  section(6, 'LECTURE DU RÈGLEMENT INTÉRIEUR', GREEN);
  y = para(`Le règlement intérieur du club ${docs.reglement ? 'est joint à ce dossier (annexe)' : 'est disponible auprès du bureau'}. Je reconnais l'avoir lu et l'accepter sans réserve ; j'ai également pris connaissance de la possibilité de souscrire une assurance complémentaire à celle proposée par le club.`, M, y, W - 2 * M) - 6;
  for (const [l, n] of [["J'ai lu le règlement intérieur.", 'ri_lu'], ["Je l'accepte sans réserve.", 'ri_accepte'], ["J'ai pris connaissance de la possibilité de souscrire une assurance complémentaire.", 'ri_assurance']]) { cb(n, M, y - 2); text(l, M + 14, y, 9, FB); y -= 16; }
  y -= 2; signRow('ri', 'Signature (+ représentant légal si mineur)');
  section(7, 'AUTORISATION PARENTALE  (obligatoire pour les moins de 18 ans)', DARK);
  labeled('Je soussigné(e) :', 'parent_nom', M, y - 4, half); labeled('agissant en qualité de :', 'parent_qualite', M + half + 12, y - 4, half); y -= 20;
  labeled("représentant légal de l'enfant :", 'parent_enfant', M, y - 4, W - 2 * M); y -= 14;
  y = para("autorise mon enfant à s'inscrire au club et à participer aux cours et stages de self-défense. J'autorise les responsables du club à prendre, en cas d'urgence, toute mesure nécessaire (appel des secours, transport vers un établissement de soins). Je m'engage à accompagner et récupérer mon enfant dans la salle, aux horaires des cours.", M, y - 4, W - 2 * M) - 4;
  labeled('Téléphone du représentant légal :', 'parent_tel', M, y - 4, half + 60); y -= 14; signRow('parent', 'Signature du représentant légal');
  footer(2);

  /* Page 3 */
  page = doc.addPage([W, H]); y = H - 36;
  section(8, 'CERTIFICAT MÉDICAL OU QUESTIONNAIRE DE SANTÉ');
  y = para(`Cochez la situation qui vous concerne. ${docs.qss || docs.qss_mineur ? 'Les questionnaires officiels sont joints en annexe : remplissez-les pour vous-même, sans nous les renvoyer, puis attestez ci-dessous.' : 'Remplissez le questionnaire officiel pour vous-même, puis attestez ci-dessous.'} Si vous répondez OUI à au moins une question, ou si vous n'êtes pas certain d'avoir compris une question, un certificat médical est obligatoire.`, M, y, W - 2 * M) - 8;
  const block = (n, title, body, h) => { rrect(M, y - h, W - 2 * M, h + 6, 5, { fill: WHITE, stroke: LINE }); cb(n, M + 8, y - 10, 11); text(title, M + 26, y - 8, 9.5, FB, RED); return para(body, M + 26, y - 22, W - 2 * M - 36, 8.3); };
  block('sante_certificat', 'A. Je joins un certificat médical', "Certificat de moins d'un an attestant l'absence de contre-indication à la pratique de la self-défense / des sports de combat. Obligatoire pour un adulte qui s'inscrit pour la première fois, ou dès qu'une réponse « OUI » a été donnée à un questionnaire.", 52);
  y -= 64;
  let yy = block('sante_qs_majeur', 'B. Adulte – renouvellement : attestation QS-SPORT (Cerfa n°15699*01)', "Je soussigné(e) ci-dessous atteste avoir renseigné le questionnaire de santé QS-SPORT Cerfa n°15699*01 et avoir répondu par la négative à l'ensemble des rubriques.", 64);
  labeled('Nom, prénom :', 'qs_majeur_nom', M + 26, yy - 6, 250);
  text('Date :', M + 290, yy - 2, 8.5, FB); tf('qs_majeur_date', M + 320, yy - 6, 70); text('Signature :', M + 398, yy - 2, 8.5, FB); tf('qs_majeur_signature', M + 446, yy - 10, W - 2 * M - 452, 20);
  y -= 78;
  yy = block('sante_qs_mineur', 'C. Mineur : attestation du questionnaire de santé du sportif mineur', "Je soussigné(e) ci-dessous, représentant légal de l'enfant, atteste que chacune des rubriques du questionnaire de santé du sportif mineur a donné lieu à une réponse négative. Le certificat médical n'est alors pas exigé (articles L. 231-2 et D. 231-1-4 du Code du sport).", 92);
  labeled("Nom de l'enfant :", 'qs_mineur_enfant', M + 26, yy - 6, 220); labeled('Représentant légal :', 'qs_mineur_parent', M + 256, yy - 6, W - 2 * M - 262); yy -= 20;
  text('Date :', M + 26, yy - 2, 8.5, FB); tf('qs_mineur_date', M + 56, yy - 6, 70); text('Signature :', M + 140, yy - 2, 8.5, FB); tf('qs_mineur_signature', M + 188, yy - 10, 200, 20);
  y -= 108;
  rrect(M, y - 150, W - 2 * M, 150, 6, { fill: DARK });
  text('DOSSIER À RETOURNER', M + 12, y - 18, 11, FB, WHITE); yy = y - 38;
  for (const it of ['Cette fiche complétée, avec les cases cochées et les signatures', "Le certificat médical, OU l'attestation B (adulte) / C (mineur) ci-dessus", "L'autorisation parentale (section 7) pour les moins de 18 ans", 'Le règlement de la cotisation : virement (libellé « COTISATION + NOM Prénom »), chèque(s) ou espèces']) {
    page.drawRectangle({ x: M + 14, y: yy - 1, width: 7, height: 7, color: RED }); text(it, M + 28, yy, 8.5, F, WHITE); yy -= 15; }
  yy -= 4; text('Comment le renvoyer ?', M + 14, yy, 9, FB, RED); yy -= 14;
  const ways = ['par WhatsApp' + (s.whatsapp_number ? ' au ' + s.whatsapp_number : ''), s.club_email ? 'par e-mail à ' + s.club_email : '', "ou remis en main propre au début d'un cours" + (s.club_address ? ` (${s.club_address})` : '')].filter(Boolean);
  para('PDF complété ou photo lisible : ' + ways.join(', ') + '.', M + 14, yy, W - 2 * M - 28, 8.5, F, WHITE);
  y -= 168;
  rrect(M, y - 92, W - 2 * M, 92, 5, { stroke: GREY, dash: [3, 2] });
  text('RÉSERVÉ AU CLUB', M + 12, y - 16, 9.5, FB, GREY);
  [['Dossier complet', 'club_complet'], ['Cotisation réglée', 'club_cotisation'], ['Licence enregistrée', 'club_licence'], ['Assurance', 'club_assurance'], ['Certificat / attestation santé', 'club_sante'], ['Autorisation parentale', 'club_parent']].forEach(([l, n], i) => {
    const xx = M + 12 + Math.floor(i / 3) * 170, y2 = y - 34 - (i % 3) * 16; cb(n, xx, y2 - 2); text(l, xx + 14, y2, 8.5, F, GREY); });
  text('Observations :', M + 352, y - 32, 8.5, FB, GREY); tf('club_observations', M + 352, y - 84, W - 2 * M - 362, 46, { multiline: true });
  footer(3);

  /* Annexes : règlement intérieur, questionnaires, RIB */
  const problems = [];
  for (const d of CLUB_DOCS.filter(x => !x.image)) {
    const f = docs[d.key]; if (!f) continue;
    try {
      const bytes = await fetchDoc(f);
      if (/pdf/i.test(f.type || f.path)) {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        (await doc.copyPages(src, src.getPageIndices())).forEach(p => doc.addPage(p));
      } else {
        const im = /png/i.test(f.type || f.path) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        page = doc.addPage([W, H]); text(d.label.toUpperCase(), M, H - 40, 12, FB, RED);
        const k = Math.min((W - 2 * M) / im.width, (H - 100) / im.height, 1.5);
        page.drawImage(im, { x: (W - im.width * k) / 2, y: H - 60 - im.height * k, width: im.width * k, height: im.height * k });
      }
    } catch { problems.push(d.label); }
  }
  form.updateFieldAppearances(F);
  return { bytes: await doc.save(), problems };
}

export async function openRegistrations() {
  const { data, error } = await sb.from('registrations').select('*').eq('status', 'nouvelle').order('created_at');
  if (error) return fail(error);
  const yes = b => b ? 'Oui' : 'Non';
  openModal({
    title: 'Inscriptions en ligne',
    body: data.length ? data.map(r => { const d = r.data || {}; const minor = (ageOf(d.birth_date) ?? 99) < 18; return `
      <div class="card card-pad mb reg-card" data-r="${r.id}">
        <div class="row between wrap"><div><strong style="font-size:16px">${esc(d.first_name)} ${esc(d.last_name)}</strong>${d.renewal_token ? ' <span class="badge ok">Réinscription</span>' : ''}<div class="small muted">Reçue le ${fmtDate(r.created_at.slice(0, 10))}${d.birth_date ? ` · ${ageOf(d.birth_date)} ans` : ''}${minor ? ' · <span class="badge warn">Mineur</span>' : ''}</div></div>
          ${isAdmin() ? `<div class="row" style="gap:6px"><button class="btn btn-sm" data-refuse="${r.id}">Refuser</button><button class="btn btn-sm btn-primary" data-accept="${r.id}">${icon('check')}Créer la fiche</button></div>` : ''}</div>
        <dl class="kv small mt">
          <dt>Téléphone</dt><dd>${esc(d.phone || '—')}</dd><dt>E-mail</dt><dd>${esc(d.email || '—')}</dd>
          <dt>Adresse</dt><dd>${esc(d.address || '—')}</dd><dt>Cotisation</dt><dd>${esc(d.fee_type || '—')}</dd>
          <dt>Urgence</dt><dd>${esc(d.emergency_contact || '—')} · ${esc(d.emergency_phone || '')}</dd>
          ${minor ? `<dt>Responsable légal</dt><dd>${esc(d.guardian_name || '—')} · ${esc(d.guardian_phone || '')}</dd><dt>Autorisation parentale</dt><dd>${yes(d.parental_authorization)}</dd>` : ''}
          ${d.medical_notes ? `<dt>Info médicale</dt><dd>${esc(d.medical_notes)}</dd>` : ''}
          <dt>Santé</dt><dd>${d.health_mode === 'certificat' ? 'Certificat médical envoyé' : d.health_mode === 'questionnaire' ? `Questionnaire de santé : toutes les réponses « Non »${d.health_attested ? ' (attesté)' : ''}` : '—'}</dd>
          <dt>Paiement prévu</dt><dd>${esc(d.payment_method || '—')}</dd>
          <dt>Droit à l’image</dt><dd>${yes(d.consent_image)}</dd><dt>Connu par</dt><dd>${esc(d.how_found || '—')}</dd>
        </dl>${d.health_files?.length ? `<div class="row wrap mt" style="gap:6px">${healthFileButtons(d.health_files)}</div>` : ''}</div>`; }).join('') : '<div class="empty">Aucune demande en attente.</div>',
    foot: `<button class="btn" data-close>Fermer</button>`,
    onMount: root => {
      $$('.reg-card', root).forEach(card => bindHealthFiles(card, data.find(x => x.id === card.dataset.r)?.data?.health_files));
      $$('[data-accept]', root).forEach(b => b.onclick = async () => {
        const r = data.find(x => x.id === b.dataset.accept), d = r.data || {};
        const allowed = ['first_name', 'last_name', 'email', 'phone', 'address', 'birth_date', 'gender', 'tshirt_size', 'fee_type', 'emergency_contact', 'emergency_phone', 'how_found', 'other_defense_sport', 'other_defense_sport_details', 'consent_image', 'consent_data', 'rules_read', 'rules_accepted', 'insurance_informed', 'medical_notes', 'guardian_name', 'guardian_phone', 'guardian_email', 'parental_authorization', 'pickup_persons'];
        const member = Object.fromEntries(allowed.filter(k => d[k] !== undefined).map(k => [k, d[k]]));
        const fee = feeOptions().find(([l]) => l === d.fee_type);
        const disc = S.disciplines.filter(x => x.is_active);
        const firstLevel = S.levels.filter(l => l.is_active).sort((a, b) => a.rank - b.rank)[0];
        Object.assign(member, { status: 'actif', member_role: 'membre', registration_date: isoDay(new Date()), fee_amount: fee?.[1] ?? null, discipline_id: disc.length === 1 ? disc[0].id : null, level_id: firstLevel?.id || null });
        if (d.health_mode === 'certificat' && d.health_files?.some(f => f.kind === 'certificat')) member.medical_certificate = true;
        if (d.health_mode === 'questionnaire' && d.health_attested) member.qss = true;
        if (d.health_files?.length) member.health_files = d.health_files;
        b.disabled = true;
        // Réinscription : on met à jour la fiche existante au lieu d'en créer une nouvelle
        const prev = d.renewal_token ? (await sb.from('members').select('id, registration_date, discipline_id, level_id, fee_amount').eq('renewal_token', d.renewal_token).maybeSingle()).data : null;
        if (prev) {
          Object.assign(member, { registration_date: prev.registration_date, discipline_id: prev.discipline_id ?? member.discipline_id, level_id: prev.level_id ?? member.level_id, fee_amount: member.fee_amount ?? prev.fee_amount,
            renewed_season_id: activeSeason()?.id || null, medical_certificate: !!member.medical_certificate, qss: !!member.qss });
          const { error } = await sb.from('members').update(member).eq('id', prev.id);
          if (error) { b.disabled = false; return fail(error); }
          await sb.from('registrations').delete().eq('id', r.id);
          closeModal(); toast(`Réinscription de ${d.first_name} enregistrée`); return go('/membres/' + prev.id);
        }
        const { data: created, error } = await sb.from('members').insert(member).select('id').single();
        if (error) { b.disabled = false; return fail(error); }
        await sb.from('registrations').delete().eq('id', r.id); // la fiche membre remplace la demande
        await markProspectRegistered(d.phone, created.id);
        closeModal(); toast(`Fiche ${/^[aeiouyhàâäéèêëîïôöùûü]/i.test(d.first_name || '') ? 'd’' : 'de '}${d.first_name} créée`); go('/membres/' + created.id);
      });
      $$('[data-refuse]', root).forEach(b => b.onclick = async () => {
        const r = data.find(x => x.id === b.dataset.refuse);
        if (!await confirmBox('Refuser la demande', `Refuser et supprimer la demande de ${esc(r.data?.first_name || '')} ${esc(r.data?.last_name || '')} ? Ses informations seront effacées.`, 'Refuser')) return;
        const { error } = await sb.from('registrations').delete().eq('id', r.id);
        if (error) return fail(error);
        const paths = (r.data?.health_files || []).map(f => f.path);
        if (paths.length) sb.storage.from('inscriptions').remove(paths).catch(() => {});
        toast('Demande refusée et supprimée'); route();
      });
    },
  });
}
