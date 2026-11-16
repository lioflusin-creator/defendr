// Defendr — Liaison ADAC National
import { $, S, closeModal, esc, fail, openModal, readForm, sb, toast } from './core.js';
import { go, route } from './shell.js';

/* =====================================================================
   Liaison ADAC National (tableur Google, via le script adac-sync.gs)
   ===================================================================== */
export const ADAC_ACTIONS = { ajout: ['À ajouter', 'ok'], complete: ['Cases vides à compléter', 'accent'], present: ['Déjà présents, rien à changer', ''], ignore: ['Ignorés', 'warn'] };
export const ADAC_DONE = { ajout: 'Ajoutés', complete: 'Complétés', present: 'Déjà présents', ignore: 'Ignorés' };

export async function adacEnsureKey() {
  if (S.settings.adac_key) return S.settings.adac_key;
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const key = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  const { error } = await sb.from('club_settings').update({ adac_key: key }).eq('id', 1);
  if (error) { fail(error); return null; }
  S.settings.adac_key = key; return key;
}

export async function adacCall(body) {
  const s = S.settings;
  if (!s.adac_url || !s.adac_key) throw new Error('La liaison ADAC n’est pas encore installée.');
  let res;
  try {
    // Envoi en texte simple : évite la vérification préalable que Google refuse
    res = await fetch(s.adac_url, { method: 'POST', body: JSON.stringify({ key: s.adac_key, discipline: s.adac_discipline || 'BDR', ...body }) });
  } catch { throw new Error('Le tableur ADAC ne répond pas. Vérifiez l’URL et que le déploiement est accessible à « Tout le monde ».'); }
  let data;
  try { data = await res.json(); } catch { throw new Error('Réponse inattendue du tableur. Vérifiez que l’URL finit bien par /exec.'); }
  if (!data.ok) throw new Error(data.error || 'Le tableur a refusé l’envoi.');
  return data;
}

export async function adacMembers() {
  const { data, error } = await sb.from('members').select('first_name, last_name, gender, birth_date, address, email, guardian_email, tshirt_size').eq('status', 'actif').order('last_name');
  if (error) throw error;
  return data.map(m => ({ first_name: m.first_name, last_name: m.last_name, gender: m.gender, birth_date: m.birth_date, address: m.address, email: m.email || m.guardian_email, tshirt_size: m.tshirt_size }));
}

export function adacList(results, labels, withEmpty = false) {
  return Object.keys(labels).map(a => {
    const rows = results.filter(r => r.action === a);
    if (!rows.length && !withEmpty) return '';
    const [label, cls] = Array.isArray(labels[a]) ? labels[a] : [labels[a], ''];
    return `<div class="mt"><div class="row between"><strong>${esc(label)}</strong><span class="badge ${cls}">${rows.length}</span></div>
      ${a === 'present' ? '' : rows.map(r => `<div class="bday"><div style="flex:1">${esc(r.name)}</div><span class="small muted">${esc(r.detail || '')}</span></div>`).join('')}</div>`;
  }).join('');
}

export async function adacSync(btn) {
  btn.disabled = true;
  let members, preview;
  try {
    members = await adacMembers();
    if (!members.length) { btn.disabled = false; return toast('Aucun membre actif à envoyer.', 'error'); }
    preview = await adacCall({ dryRun: true, members });
  } catch (e) { btn.disabled = false; return toast(e.message, 'error'); }
  btn.disabled = false;
  const todo = preview.ajouts + preview.completes;
  openModal({
    title: 'Envoi à l’ADAC National',
    body: `<p class="small muted">Aperçu pour ${members.length} membre${members.length > 1 ? 's' : ''} actif${members.length > 1 ? 's' : ''}. Rien n’est encore envoyé.</p>${adacList(preview.results, ADAC_ACTIONS)}
      ${todo ? '' : '<div class="alert info mt">Le tableur de l’ADAC est déjà à jour.</div>'}`,
    foot: `<button class="btn" data-close>${todo ? 'Annuler' : 'Fermer'}</button>${todo ? `<button class="btn btn-primary" id="adac-go">Envoyer (${preview.ajouts} ajout${preview.ajouts > 1 ? 's' : ''}${preview.completes ? `, ${preview.completes} complété${preview.completes > 1 ? 's' : ''}` : ''})</button>` : ''}`,
    onMount: root => {
      const go = $('#adac-go', root); if (!go) return;
      go.onclick = async () => {
        go.disabled = true; go.textContent = 'Envoi en cours…';
        try {
          const r = await adacCall({ members });
          closeModal();
          toast(`ADAC : ${r.ajouts} ajouté${r.ajouts > 1 ? 's' : ''}, ${r.completes} complété${r.completes > 1 ? 's' : ''}`);
          openModal({ title: 'Envoi terminé', body: `<p class="small muted">Le tableur de l’ADAC a été mis à jour.</p>${adacList(r.results, ADAC_DONE)}`, foot: '<button class="btn btn-primary" data-close>Fermer</button>' });
        } catch (e) { go.disabled = false; go.textContent = 'Réessayer'; toast(e.message, 'error'); }
      };
    },
  });
}

export function bindAdac(view) {
  const card = $('#adac-card', view); if (!card) return;
  $('#adac-send', card).onclick = e => adacSync(e.currentTarget);
  $('#adac-copy', card).onclick = async () => {
    const key = await adacEnsureKey(); if (!key) return;
    let code;
    try { const r = await fetch(new URL('../adac-sync.gs', import.meta.url), { cache: 'no-store' }); if (!r.ok) throw 0; code = (await r.text()).replace('__CLE_DEFENDR__', key); }
    catch { return toast('Impossible de récupérer le script.', 'error'); }
    try { await navigator.clipboard.writeText(code); toast('Script copié : collez-le dans Apps Script'); }
    catch { openModal({ title: 'Script ADAC', body: `<p class="small muted">Sélectionnez tout le texte et copiez-le.</p><textarea class="input" style="min-height:300px;font-family:monospace;font-size:12px" readonly>${esc(code)}</textarea>`, foot: '<button class="btn" data-close>Fermer</button>' }); }
  };
  $('#adac-form', card).onsubmit = async e => {
    e.preventDefault();
    const d = readForm(e.target);
    if (d.adac_url && !/^https:\/\/script\.google(usercontent)?\.com\//.test(d.adac_url)) return toast('L’URL doit commencer par https://script.google.com/', 'error');
    if (d.adac_url && !S.settings.adac_key) { if (!await adacEnsureKey()) return; }
    const { error } = await sb.from('club_settings').update(d).eq('id', 1);
    if (error) return fail(error);
    Object.assign(S.settings, d); toast('Liaison ADAC enregistrée'); route();
  };
  $('#adac-test', card).onclick = async e => {
    const btn = e.currentTarget, url = $('#st-adac-url', card).value.trim();
    if (!url) return toast('Collez d’abord l’URL de l’application Web.', 'error');
    const prev = S.settings.adac_url; S.settings.adac_url = url; btn.disabled = true;
    try { await adacEnsureKey(); const r = await adacCall({ dryRun: true, members: [] }); toast(r.ok ? 'Liaison OK : le tableur répond' : 'Pas de réponse'); }
    catch (err) { toast(err.message, 'error'); }
    finally { S.settings.adac_url = prev; btn.disabled = false; }
  };
}
