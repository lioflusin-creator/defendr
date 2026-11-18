// Defendr — Signatures du président et du trésorier (Paramètres), ajoutées aux documents officiels
import { $, $$, S, closeModal, confirmBox, esc, fail, icon, openModal, sb, toast } from './core.js';

export const SIGNERS = [
  { key: 'president', label: 'Président(e)', nameField: 'president_name' },
  { key: 'tresorier', label: 'Trésorier(ère)', nameField: 'treasurer_name' },
];
const BUCKET = 'signatures', pathOf = key => `${key}.png`;
const cache = {}; // key → { bytes, url } | null (absente), chargée une fois par session
const missing = e => /bucket not found|not found|does not exist/i.test(e?.message || e?.error || '');

/* Rôle du compte (admin / tresorier) ou libellé (« Président(e) ») → clé de signature */
export const signerKey = v => /^admin$|pr[ée]sident/i.test(v || '') ? 'president' : /tr[ée]sor/i.test(v || '') ? 'tresorier' : null;

/* Image PNG d'une signature (ou null si aucune) */
export async function loadSignature(key) {
  if (key in cache) return cache[key];
  try {
    const { data, error } = await sb.storage.from(BUCKET).download(pathOf(key));
    if (error || !data) throw error || new Error('absente');
    const bytes = new Uint8Array(await data.arrayBuffer());
    const url = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(new Blob([bytes], { type: 'image/png' })); });
    return (cache[key] = { bytes, url });
  } catch { return (cache[key] = null); }
}
export const loadSignatures = () => Promise.all(SIGNERS.map(s => loadSignature(s.key)));
/* Image prête pour un document HTML imprimé (après loadSignatures) */
export const signatureImg = key => cache[key]?.url ? `<img class="sign-img" src="${cache[key].url}" alt="Signature">` : '';

/* ---------- Paramètres : carte « Signatures » ---------- */
export async function renderSignatures(box) {
  const { error } = await sb.storage.from(BUCKET).list('', { limit: 1 });
  const ready = !error || !missing(error);
  await loadSignatures();
  const s = S.settings || {};
  box.innerHTML = `<h2>Signatures</h2>
    ${ready ? '' : '<div class="alert error">Pour activer les signatures, exécutez une fois le fichier <strong>migration-15.sql</strong> dans Supabase → Éditeur SQL.</div>'}
    <p class="small muted">Ajoutées automatiquement aux reçus de cotisation, aux attestations de paiement et aux comptes annuels. Elles restent privées : seuls le président et le trésorier connectés y ont accès.</p>
    ${SIGNERS.map(g => `<div class="sig-row">
      <div class="sig-head"><div><div style="font-weight:600">${g.label}</div><div class="small muted">${esc(s[g.nameField] || 'Nom à indiquer dans Club')}</div></div>
        <div class="row" style="gap:6px">
          <button class="btn btn-sm${cache[g.key] ? '' : ' btn-primary'}" data-sig-draw="${g.key}" ${ready ? '' : 'disabled'}>${icon('edit')}Dessiner</button>
          <label class="btn btn-sm" style="cursor:pointer${ready ? '' : ';pointer-events:none;opacity:.5'}">${icon('up')}Photo<input type="file" accept="image/*" data-sig-file="${g.key}" hidden></label>
          ${cache[g.key] ? `<button class="icon-btn" data-sig-rm="${g.key}" aria-label="Retirer la signature">${icon('trash')}</button>` : ''}
        </div></div>
      <div class="sig-preview">${cache[g.key] ? `<img src="${cache[g.key].url}" alt="Signature ${g.label}">` : '<span class="small muted">Aucune signature</span>'}</div>
    </div>`).join('')}
    <p class="small muted">Photo : signez au stylo noir sur une feuille blanche et prenez-la en photo bien à plat ; le fond blanc est retiré automatiquement.</p>`;
  const refresh = () => renderSignatures(box);
  $$('[data-sig-draw]', box).forEach(b => b.onclick = () => drawPad(b.dataset.sigDraw, refresh));
  $$('[data-sig-file]', box).forEach(inp => inp.onchange = async () => {
    const f = inp.files[0]; inp.value = ''; if (!f) return;
    try { await saveSignature(inp.dataset.sigFile, await fromPhoto(f)); refresh(); } catch (e) { fail(e); }
  });
  $$('[data-sig-rm]', box).forEach(b => b.onclick = async () => {
    const g = SIGNERS.find(x => x.key === b.dataset.sigRm);
    if (!await confirmBox('Retirer la signature', `Retirer la signature du/de la ${g.label.toLowerCase()} ? Elle ne figurera plus sur les documents.`, 'Retirer')) return;
    const { error } = await sb.storage.from(BUCKET).remove([pathOf(g.key)]);
    if (error) return fail(error);
    cache[g.key] = null; toast('Signature retirée'); refresh();
  });
}

async function saveSignature(key, blob) {
  const { error } = await sb.storage.from(BUCKET).upload(pathOf(key), blob, { contentType: 'image/png', upsert: true, cacheControl: '0' });
  if (error) throw error;
  delete cache[key]; await loadSignature(key);
  toast('Signature enregistrée');
}

/* Garde l'encre, rend le fond transparent, recadre au plus juste et réduit à 900 px de large */
function inkToPng(src, sw, sh, threshold = 175) {
  const c = document.createElement('canvas'); c.width = sw; c.height = sh;
  const x = c.getContext('2d'); x.drawImage(src, 0, 0, sw, sh);
  const img = x.getImageData(0, 0, sw, sh), p = img.data;
  let minX = sw, minY = sh, maxX = -1, maxY = -1;
  for (let i = 0; i < p.length; i += 4) {
    const a = p[i + 3] / 255, lum = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) * a + 255 * (1 - a);
    if (lum > threshold) { p[i + 3] = 0; continue; }
    // encre : bleu nuit, plus ou moins opaque selon son intensité (bords adoucis)
    const k = Math.min(1, (threshold - lum) / (threshold * 0.6));
    p[i] = 20; p[i + 1] = 30; p[i + 2] = 70; p[i + 3] = Math.round(255 * Math.max(0.35, k));
    const n = i / 4, px = n % sw, py = (n / sw) | 0;
    if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py;
  }
  if (maxX < 0) throw new Error('Aucune signature détectée : essayez avec un trait plus foncé ou une photo plus nette.');
  x.putImageData(img, 0, 0);
  const pad = 6, w = maxX - minX + 1 + 2 * pad, h = maxY - minY + 1 + 2 * pad, k = Math.min(1, 900 / w);
  const out = document.createElement('canvas'); out.width = Math.round(w * k); out.height = Math.round(h * k);
  out.getContext('2d').drawImage(c, minX - pad, minY - pad, w, h, 0, 0, out.width, out.height);
  return new Promise((res, rej) => out.toBlob(b => b ? res(b) : rej(new Error('Image impossible à créer')), 'image/png'));
}

async function fromPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Cette image ne peut pas être lue : utilisez une photo JPG ou PNG.')); i.src = url; });
    const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
    return await inkToPng(im, Math.round(im.naturalWidth * k), Math.round(im.naturalHeight * k));
  } finally { URL.revokeObjectURL(url); }
}

/* Signer au doigt, à la souris ou au stylet */
function drawPad(key, done) {
  const g = SIGNERS.find(x => x.key === key);
  openModal({
    title: `Signature · ${g.label}`,
    body: `<p class="small muted" style="margin-top:0">Signez dans le cadre avec le doigt, la souris ou un stylet.</p>
      <canvas id="sp" class="sig-pad"></canvas>`,
    foot: `<button class="btn" id="sp-clear">Effacer</button><button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="sp-save">Enregistrer</button>`,
    onMount: root => {
      const cv = $('#sp', root), ratio = Math.max(2, devicePixelRatio || 1);
      const size = () => { const r = cv.getBoundingClientRect(); cv.width = r.width * ratio; cv.height = r.height * ratio; const x = cv.getContext('2d'); x.scale(ratio, ratio); x.lineCap = x.lineJoin = 'round'; x.strokeStyle = '#141e46'; x.lineWidth = 2.6; };
      size();
      const ctx = cv.getContext('2d'); let drawing = false, last = null, empty = true;
      const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      cv.onpointerdown = e => { drawing = true; last = pos(e); cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.arc(last.x, last.y, 1.2, 0, Math.PI * 2); ctx.fillStyle = '#141e46'; ctx.fill(); empty = false; e.preventDefault(); };
      cv.onpointermove = e => { if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; e.preventDefault(); };
      cv.onpointerup = cv.onpointercancel = () => { drawing = false; };
      $('#sp-clear', root).onclick = () => { ctx.clearRect(0, 0, cv.width, cv.height); empty = true; };
      $('#sp-save', root).onclick = async e => {
        if (empty) return toast('Signez d’abord dans le cadre.', 'error');
        const b = e.currentTarget; b.disabled = true;
        try { await saveSignature(key, await inkToPng(cv, cv.width, cv.height, 250)); closeModal(); done(); }
        catch (err) { b.disabled = false; fail(err); }
      };
    },
  });
}
