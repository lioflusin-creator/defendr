// Defendr — Paramètres
import { $, $$, GITHUB_REPO, S, closeModal, confirmBox, esc, fail, fmtDate, fmtMoney, icon, isAdmin, isPresident, openModal, readForm, roleLabel, sb, toast } from './core.js';
import { bindGlobal, head, loadRefs, route } from './shell.js';
import { CLUB_DOCS, docUrl } from './inscriptions.js';
import { renderSignatures } from './signatures.js';
import { bindAdac } from './adac.js';
import { autoBackupHtml, bindAutoBackup, downloadBackup, lastBackupText, restoreFromFile } from './backup.js';
import { planSections } from './plan.js';

/* =====================================================================
   Paramètres
   ===================================================================== */
export async function viewSettings(view) {
  if (!isAdmin()) {
    view.innerHTML = head('Paramètres') + `<div class="card card-pad"><h2>Mon compte</h2><dl class="kv"><dt>Nom</dt><dd>${esc(S.profile.full_name || '—')}</dd><dt>E-mail</dt><dd>${esc(S.session.user.email)}</dd><dt>Rôle</dt><dd>${esc(roleLabel(S.profile.role))}</dd></dl>
      <p class="small muted mt">Les réglages du club sont gérés par le président et le trésorier.</p><button class="btn mt" data-logout>${icon('logout')}Se déconnecter</button></div>
      <div class="mt"><div class="card card-pad"><h2>Disciplines et niveaux</h2><p class="small muted">Les disciplines enseignées au club et la progression des niveaux (grades).</p>
      <div class="row wrap" style="gap:8px"><a class="btn" href="#/disciplines">${icon('target')}Disciplines <span class="badge">${S.disciplines.length}</span></a><a class="btn" href="#/niveaux">${icon('layers')}Niveaux <span class="badge">${S.levels.length}</span></a></div></div></div>`;
    return bindGlobal(view);
  }
  await loadRefs();
  const { data: team, error } = await sb.from('profiles').select('*').order('created_at');
  if (error) throw error;
  const s = S.settings;
  const num = (name, label, ph = '') => `<div class="field"><label for="st-${name}">${label}</label><input class="input" id="st-${name}" name="${name}" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(s[name] ?? '')}" placeholder="${ph}"></div>`;
  const tagVals = key => key === 'plan_sections' ? planSections() : (s[key] || []);
  const tagBox = (key, label, help) => `<div class="field"><label>${label}</label><div class="tags" data-tags="${key}">${tagVals(key).map((t, i) => `<span class="tag">${esc(t)}<button type="button" data-rm="${key}:${i}" aria-label="Retirer ${esc(t)}">×</button></span>`).join('') || '<span class="small muted">Aucun élément</span>'}</div>
    <div class="tag-add"><input class="input" data-new="${key}" placeholder="${help}" aria-label="Ajouter : ${label}"><button type="button" class="btn" data-add="${key}">Ajouter</button></div></div>`;

  view.innerHTML = head('Paramètres', 'Configurez votre club') + `
    <div class="mb"><div class="card card-pad"><h2>Disciplines et niveaux</h2><p class="small muted">Les disciplines enseignées au club et la progression des niveaux (grades).</p>
      <div class="row wrap" style="gap:8px"><a class="btn" href="#/disciplines">${icon('target')}Disciplines <span class="badge">${S.disciplines.length}</span></a><a class="btn" href="#/niveaux">${icon('layers')}Niveaux <span class="badge">${S.levels.length}</span></a></div></div></div>
    <div class="grid two">
      <form class="card card-pad" id="club-form">
        <h2>Club</h2>
        <div class="field"><label for="st-club_name">Nom du club *</label><input class="input" id="st-club_name" name="club_name" value="${esc(s.club_name)}"></div>
        <div class="section-title mt">Cotisations annuelles (€)</div>
        <div class="form-grid">${num('fee_new', 'Nouvel adhérent(e)', '150')}${num('fee_returning', 'Ancien(ne) adhérent(e)', '130')}${num('fee_jobseeker', 'Demandeur(se) d’emploi', '80')}${num('fee_student', 'Étudiant(e)', '90')}</div>
        <div class="section-title mt">Horaires par défaut des cours</div>
        <div class="form-grid">
          <div class="field"><label for="st-start">Heure de début</label><input class="input" id="st-start" name="default_start_time" type="time" value="${esc((s.default_start_time || '').slice(0, 5))}"></div>
          <div class="field"><label for="st-end">Heure de fin</label><input class="input" id="st-end" name="default_end_time" type="time" value="${esc((s.default_end_time || '').slice(0, 5))}"></div>
        </div>
        <div class="field"><label for="st-wa">Votre numéro WhatsApp (rappel anniversaires)</label><input class="input" id="st-wa" name="whatsapp_number" type="tel" value="${esc(s.whatsapp_number || '')}" placeholder="06 12 34 56 78"></div>
        <div class="section-title mt">Pour les attestations</div>
        <div class="field"><label for="st-addr">Adresse du club</label><input class="input" id="st-addr" name="club_address" value="${esc(s.club_address || '')}" placeholder="ex : Gymnase…, code postal et ville"></div>
        <div class="form-grid">
          <div class="field"><label for="st-pres">Président(e)</label><input class="input" id="st-pres" name="president_name" value="${esc(s.president_name || '')}"></div>
          ${'treasurer_name' in s ? `<div class="field"><label for="st-treas">Trésorier(ère)</label><input class="input" id="st-treas" name="treasurer_name" value="${esc(s.treasurer_name || '')}"></div>` : ''}
          <div class="field"><label for="st-legal">N° RNA</label><input class="input" id="st-legal" name="club_legal_id" value="${esc(s.club_legal_id || '')}" placeholder="W343…"></div>
        </div>
        ${'club_siret' in s ? `<div class="field"><label for="st-siret">N° SIRET <span class="muted">(si le club en a un)</span></label><input class="input" id="st-siret" name="club_siret" value="${esc(s.club_siret || '')}" inputmode="numeric" placeholder="14 chiffres"></div>` : ''}
        <div class="field"><label for="st-mail">E-mail du club</label><input class="input" id="st-mail" name="club_email" type="email" value="${esc(s.club_email || '')}"></div>
        <button class="btn btn-primary" type="submit">Enregistrer</button>
      </form>

      <div class="card card-pad" id="tags-card">
        <h2>Catégories, salles et chapitres</h2>
        ${tagBox('revenue_types', 'Types de recettes', 'ex : Cotisation annuelle')}
        ${tagBox('expense_categories', 'Catégories de dépenses', 'ex : Loyer')}
        ${tagBox('rooms', 'Salles disponibles', 'ex : Dojo 1')}
        ${tagBox('plan_sections', 'Chapitres de la planification annuelle', 'ex : Self-défense verbale')}
        <p class="small muted" style="margin-top:-4px">Retirer un chapitre ne supprime pas ses éléments déjà saisis : ils restent visibles dans les mois concernés.</p>
      </div>

      <form class="card card-pad" id="thr-form">
        <h2>Seuils d’assiduité</h2>
        <p class="small muted">Pourcentage de présence minimum pour classer un adhérent dans chaque catégorie (page Statistiques).</p>
        <div class="form-grid">
          <div class="field"><label for="st-ta">Assidu à partir de (%)</label><input class="input" id="st-ta" name="threshold_assidu" type="number" min="0" max="100" value="${s.threshold_assidu}"></div>
          <div class="field"><label for="st-tr">Régulier à partir de (%)</label><input class="input" id="st-tr" name="threshold_regulier" type="number" min="0" max="100" value="${s.threshold_regulier}"></div>
          <div class="field"><label for="st-tk">À risque à partir de (%)</label><input class="input" id="st-tk" name="threshold_risque" type="number" min="0" max="100" value="${s.threshold_risque}"></div>
        </div>
        <button class="btn btn-primary" type="submit">Enregistrer</button>
      </form>

      <div class="card card-pad">
        <div class="row between"><h2 style="margin:0">Saisons</h2><button class="btn btn-sm" id="new-season">${icon('plus')}Nouvelle saison</button></div>
        <div class="mt">${S.seasons.length ? S.seasons.map(se => `<div class="bday"><div style="flex:1"><div style="font-weight:600">${esc(se.label)}</div><div class="small muted">Créée le ${fmtDate(se.created_at.slice(0, 10))} · solde de départ ${fmtMoney(se.opening_balance)}${se.closed_at ? ' · clôturée le ' + fmtDate(se.closed_at.slice(0, 10)) : ''}</div></div>
          ${se.is_active ? '<span class="badge ok">Active</span>' : ''}
          <button class="icon-btn" data-se-edit="${se.id}" aria-label="Modifier">${icon('edit')}</button>
          ${se.is_active ? `<button class="btn btn-sm" data-se-close="${se.id}">Clôturer</button>` : (!se.closed_at ? `<button class="btn btn-sm" data-se-act="${se.id}">Activer</button>` : '')}</div>`).join('') : '<div class="empty">Aucune saison. Créez la saison en cours (ex : 2026/2027).</div>'}</div>
      </div>

      <div class="card card-pad">
        <h2>Équipe</h2>
        <p class="small muted">Pour donner accès à quelqu’un : il crée son compte depuis l’écran de connexion (« Créer un compte »), puis vous le validez ici en choisissant son rôle.</p>
        <ul class="small muted" style="margin:0 0 8px;padding-left:18px"><li><strong>Président(e)</strong> et <strong>Trésorier(ère)</strong> : accès à tout le logiciel, comptabilité comprise.</li><li><strong>Enseignant(e)</strong> : membres, planning, appel, planification et statistiques, sans la comptabilité.</li></ul>
        ${team.map(p => `<div class="bday"><div class="avatar">${esc((p.full_name || '?').slice(0, 2).toUpperCase())}</div><div style="flex:1"><div style="font-weight:600">${esc(p.full_name || '—')}</div>${p.id === S.profile.id ? '<div class="small muted">Vous</div>' : ''}</div>
          ${p.id === S.profile.id || (p.role === 'admin' && !isPresident()) ? `<span class="badge accent">${esc(roleLabel(p.role))}</span>` : `<select class="input" style="width:auto" data-role="${p.id}" aria-label="Rôle de ${esc(p.full_name || '')}">
            <option value="en_attente" ${p.role === 'en_attente' ? 'selected' : ''}>En attente (aucun accès)</option>
            <option value="enseignant" ${p.role === 'enseignant' ? 'selected' : ''}>Enseignant(e)</option>
            <option value="tresorier" ${p.role === 'tresorier' ? 'selected' : ''}>Trésorier(ère) · accès complet</option>
            ${isPresident() ? `<option value="admin" ${p.role === 'admin' ? 'selected' : ''}>Président(e) · accès complet</option>` : ''}</select>`}</div>`).join('')}
      </div>

      <div class="card card-pad">
        <h2>Sauvegarde</h2>
        <div class="section-title" style="font-size:13px">1. Les données du club</div>
        <p class="small muted">Un fichier Excel avec toutes les données : membres, paiements, dépenses, séances, présences, planification et paramètres. Conseillé une fois par mois, à garder en lieu sûr (il contient des données personnelles et médicales).</p>
        <div class="small mb">${lastBackupText()}</div>
        <button class="btn btn-primary" id="backup">${icon('file')}Télécharger les données</button>
        <div id="auto-backup">${autoBackupHtml()}</div>
        <div class="section-title mt" style="font-size:13px">2. Le logiciel</div>
        <p class="small muted">Un fichier .zip avec tout le logiciel : les écrans, le fonctionnement, l’icône et la structure de la base de données. Il ne contient aucune donnée d’adhérent. Chaque version est aussi conservée automatiquement sur GitHub.</p>
        ${GITHUB_REPO ? `<div class="row wrap" style="gap:8px"><a class="btn" href="${GITHUB_REPO}/archive/refs/heads/main.zip" download>${icon('file')}Télécharger le logiciel</a>
          <a class="btn btn-sm" href="${GITHUB_REPO}/commits/main" target="_blank" rel="noopener">Historique des versions</a></div>` : '<p class="small muted">Le logiciel se télécharge depuis l’hébergement du club.</p>'}
        <p class="small muted mt">Avec ces deux fichiers, le club peut tout reconstruire si besoin.</p>
        ${isPresident() ? `<div class="section-title mt" style="font-size:13px">3. Restaurer</div>
        <p class="small muted">Remet les données du club telles qu’elles étaient dans un fichier de sauvegarde. Réservé au président.</p>
        <label class="btn btn-danger" style="cursor:pointer">${icon('up')}Restaurer depuis une sauvegarde<input type="file" id="restore-file" accept=".xlsx,.json,application/json" hidden></label>` : ''}
      </div>


      <div class="card card-pad" id="adac-card">
        <h2>ADAC National</h2>
        <p class="small muted">Envoie les membres actifs dans l’onglet « BASE LICENCES » du tableur de l’ADAC. Un adhérent déjà présent n’est jamais ajouté une deuxième fois (même nom, prénom et date de naissance) : seules ses cases vides sont complétées, rien n’est écrasé. Un aperçu s’affiche avant chaque envoi.</p>
        <button class="btn btn-primary" id="adac-send" ${s.adac_url ? '' : 'disabled'}>${icon('up')}Envoyer à l’ADAC National</button>
        ${s.adac_url ? '' : '<div class="small muted mt">Faites d’abord l’installation ci-dessous (une seule fois).</div>'}
        <details class="mt" ${s.adac_url ? '' : 'open'}><summary class="small" style="cursor:pointer;font-weight:600">Installation de la liaison</summary>
          <ol class="small" style="padding-left:18px;margin:8px 0">
            <li>Cliquez sur <strong>Copier le script</strong> ci-dessous.</li>
            <li>Ouvrez le tableur de l’ADAC, menu <strong>Extensions → Apps Script</strong>. Effacez le contenu, collez le script et cliquez sur l’icône <strong>Enregistrer</strong>.</li>
            <li>En haut à droite : <strong>Déployer → Nouveau déploiement</strong>. Type : <strong>Application Web</strong>. « Exécuter en tant que » : <strong>Moi</strong>. « Qui a accès » : <strong>Tout le monde</strong>. Cliquez sur <strong>Déployer</strong> et autorisez l’accès avec votre compte Google.</li>
            <li>Copiez l’<strong>URL de l’application Web</strong> (elle finit par /exec), collez-la ici et enregistrez.</li>
          </ol>
          <button type="button" class="btn btn-sm mb" id="adac-copy">${icon('copy')}Copier le script</button>
          <form id="adac-form">
            <div class="field"><label for="st-adac-url">URL de l’application Web</label><input class="input" id="st-adac-url" name="adac_url" value="${esc(s.adac_url || '')}" placeholder="https://script.google.com/macros/s/…/exec"></div>
            <div class="field"><label for="st-adac-disc">Discipline indiquée à l’ADAC</label><input class="input" id="st-adac-disc" name="adac_discipline" value="${esc(s.adac_discipline || 'BDR')}" placeholder="BDR"></div>
            <div class="row wrap" style="gap:8px"><button class="btn btn-primary" type="submit">Enregistrer</button><button class="btn" type="button" id="adac-test">Tester la liaison</button></div>
          </form>
          <p class="small muted mt">Si vous recopiez un jour le script, pensez à refaire « Déployer → Gérer les déploiements → Modifier → Nouvelle version ».</p>
        </details>
      </div>
      <div class="card card-pad" id="docs-card">
        <h2>Documents et paiement de l’inscription</h2>
        ${'club_documents' in s ? '' : '<div class="alert error">Pour activer cette partie, exécutez une fois le fichier <strong>migration-7.sql</strong> dans Supabase → Éditeur SQL.</div>'}
        <p class="small muted">Ces fichiers sont proposés au téléchargement sur la page d’inscription en ligne et ajoutés en annexe du dossier PDF à signer. Formats : PDF, JPG ou PNG.</p>
        ${CLUB_DOCS.map(d => { const f = (s.club_documents || {})[d.key]; return `<div class="bday"><div style="flex:1;min-width:0"><div style="font-weight:600">${esc(d.label)}</div><div class="small muted" style="overflow-wrap:anywhere">${f ? esc(f.name) : 'Aucun fichier'}</div></div>
          ${f ? `<a class="btn btn-sm" href="${esc(docUrl(f))}" target="_blank" rel="noopener">Voir</a>` : ''}
          <label class="btn btn-sm${f ? '' : ' btn-primary'}" style="cursor:pointer">${icon('up')}${f ? 'Remplacer' : 'Ajouter'}<input type="file" data-doc="${d.key}" accept="${d.image ? 'image/png,image/jpeg' : 'application/pdf,image/png,image/jpeg'}" hidden></label>
          ${f ? `<button class="icon-btn" data-doc-rm="${d.key}" aria-label="Retirer ${esc(d.label)}">${icon('trash')}</button>` : ''}</div>`; }).join('')}
        <form id="bank-form" class="mt">
          <div class="section-title">Virement : coordonnées du compte du club</div>
          <div class="field"><label for="st-bh">Titulaire du compte</label><input class="input" id="st-bh" name="bank_holder" value="${esc(s.bank_holder || '')}" placeholder="ex : ASSOC. MON CLUB DE SELF-DÉFENSE"></div>
          <div class="field"><label for="st-iban">IBAN</label><input class="input" id="st-iban" name="bank_iban" value="${esc(s.bank_iban || '')}" placeholder="FR76 …" autocomplete="off"></div>
          <div class="form-grid">
            <div class="field"><label for="st-bic">BIC</label><input class="input" id="st-bic" name="bank_bic" value="${esc(s.bank_bic || '')}" autocomplete="off"></div>
            <div class="field"><label for="st-bn">Banque</label><input class="input" id="st-bn" name="bank_name" value="${esc(s.bank_name || '')}" placeholder="ex : Crédit Agricole Languedoc"></div>
          </div>
          <div class="field"><label for="st-fed">Fédération citée dans le droit à l’image et les données</label><input class="input" id="st-fed" name="federation_label" value="${esc(s.federation_label ?? 'l’ADAC')}" placeholder="ex : l’ADAC"><span class="help">Avec l’article (« l’ADAC », « la FFKDA »). Laissez vide si aucune.</span></div>
          <button class="btn btn-primary" type="submit">Enregistrer</button>
        </form>
      </div>
      <div class="card card-pad" id="sig-card"><h2>Signatures</h2><p class="small muted">Chargement…</p></div>
    </div>`;
  if (isAdmin()) renderSignatures($('#sig-card')).catch(fail); else $('#sig-card').remove();
  $('#backup').onclick = () => downloadBackup($('#backup'));
  bindAutoBackup(view);
  bindAdac(view);
  $('#restore-file') && ($('#restore-file').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) restoreFromFile(f); });

  const save = async (data, msg = 'Paramètres enregistrés') => {
    const { error } = await sb.from('club_settings').update(data).eq('id', 1);
    if (error) { fail(error); return false; }
    Object.assign(S.settings, data); toast(msg); return true;
  };
  $('#club-form').onsubmit = async e => {
    e.preventDefault();
    const d = readForm(e.target);
    if (!d.club_name) return toast('Le nom du club est obligatoire.', 'error');
    if (await save(d)) $$('.brand-club').forEach(x => x.textContent = d.club_name);
  };
  $('#thr-form').onsubmit = async e => { e.preventDefault(); await save(readForm(e.target)); };

  // Documents du club (règlement, QSS, QSS mineur, RIB, logo)
  $$('[data-doc]', view).forEach(inp => inp.onchange = async () => {
    const file = inp.files[0]; inp.value = ''; if (!file) return;
    const d = CLUB_DOCS.find(x => x.key === inp.dataset.doc);
    const okType = d.image ? /^image\/(png|jpeg)$/.test(file.type) : /^(application\/pdf|image\/(png|jpeg))$/.test(file.type);
    if (!okType) return toast(d.image ? 'Choisissez une image JPG ou PNG.' : 'Choisissez un PDF, un JPG ou un PNG.', 'error');
    if (file.size > 15 * 1024 * 1024) return toast('Fichier trop lourd : 15 Mo maximum.', 'error');
    const ext = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' }[file.type];
    const path = `${d.key}-${Date.now()}.${ext}`;
    toast('Envoi du fichier…');
    const { error } = await sb.storage.from('documents').upload(path, file, { contentType: file.type });
    if (error) return fail(error);
    const docs = { ...(S.settings.club_documents || {}) }, old = docs[d.key];
    docs[d.key] = { path, name: file.name, type: file.type, updated_at: new Date().toISOString() };
    if (await save({ club_documents: docs }, `${d.label} enregistré`)) {
      if (old?.path) sb.storage.from('documents').remove([old.path]).catch(() => {});
      route();
    } else sb.storage.from('documents').remove([path]).catch(() => {});
  });
  $$('[data-doc-rm]', view).forEach(b => b.onclick = async () => {
    const d = CLUB_DOCS.find(x => x.key === b.dataset.docRm);
    if (!await confirmBox('Retirer le document', `Retirer « ${esc(d.label)} » ? Il ne sera plus proposé sur la page d’inscription ni ajouté au dossier PDF.`, 'Retirer')) return;
    const docs = { ...(S.settings.club_documents || {}) }, old = docs[d.key]; delete docs[d.key];
    if (await save({ club_documents: docs }, 'Document retiré')) { if (old?.path) sb.storage.from('documents').remove([old.path]).catch(() => {}); route(); }
  });
  $('#bank-form').onsubmit = async e => {
    e.preventDefault();
    const d = readForm(e.target);
    if (d.bank_iban) d.bank_iban = d.bank_iban.replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();
    if (d.bank_bic) d.bank_bic = d.bank_bic.replace(/\s+/g, '').toUpperCase();
    if (d.bank_iban && !/^[A-Z]{2}\d{2}[A-Z0-9 ]{10,40}$/.test(d.bank_iban)) return toast('L’IBAN ne semble pas valide : vérifiez-le.', 'error');
    d.federation_label = e.target.federation_label.value.trim(); // vide = aucune fédération
    if (await save(d, 'Coordonnées enregistrées')) { $('#st-iban').value = d.bank_iban || ''; $('#st-bic').value = d.bank_bic || ''; }
  };
  const tags = $('#tags-card');
  tags.onclick = async e => {
    const rm = e.target.closest('[data-rm]'), add = e.target.closest('[data-add]');
    if (rm) { const [k, i] = rm.dataset.rm.split(':'); const arr = [...tagVals(k)]; arr.splice(+i, 1);
      if (k === 'plan_sections' && !arr.length) return toast('Gardez au moins un chapitre.', 'error');
      if (await save({ [k]: arr }, 'Élément retiré')) route(); }
    if (add) { const k = add.dataset.add, inp = $(`[data-new="${k}"]`, tags), v = inp.value.trim(); if (!v) return;
      if (tagVals(k).some(x => x.toLowerCase() === v.toLowerCase())) return toast('Cet élément existe déjà.', 'error');
      if (await save({ [k]: [...tagVals(k), v] }, 'Élément ajouté')) route(); }
  };
  $$('[data-new]', tags).forEach(inp => inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $(`[data-add="${inp.dataset.new}"]`, tags).click(); } });

  const seasonForm = se => {
    const y = new Date().getFullYear(), m = new Date().getMonth();
    const def = m >= 7 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
    openModal({
      title: se ? 'Modifier la saison' : 'Nouvelle saison', size: 'sm',
      body: `<form id="sf"><div class="field"><label for="sf-label">Nom *</label><input class="input" id="sf-label" name="label" value="${esc(se?.label || def)}"></div>
        <div class="field"><label for="sf-ob">Solde en début de saison (€)</label><input class="input" id="sf-ob" name="opening_balance" type="number" step="0.01" value="${esc(se?.opening_balance ?? 0)}"><span class="help">Le solde du compte bancaire du club au début de la saison.</span></div>
        ${se ? '' : '<label class="check"><input type="checkbox" name="activate" checked><span>En faire la saison active</span></label>'}</form>`,
      foot: `<button class="btn" data-close>Annuler</button><button class="btn btn-primary" id="sf-save">Enregistrer</button>`,
      onMount: r => $('#sf-save', r).onclick = async () => {
        const d = readForm($('#sf', r)); const activate = d.activate; delete d.activate;
        if (!d.label) return toast('Le nom est obligatoire.', 'error');
        d.opening_balance = d.opening_balance ?? 0;
        if (se) { const { error } = await sb.from('seasons').update(d).eq('id', se.id); if (error) return fail(error); }
        else {
          if (activate) { const { error: e1 } = await sb.from('seasons').update({ is_active: false }).eq('is_active', true); if (e1) return fail(e1); }
          const { error } = await sb.from('seasons').insert({ ...d, is_active: !!activate }); if (error) return fail(error);
        }
        closeModal(); toast('Saison enregistrée'); route();
      },
    });
  };
  $('#new-season').onclick = () => seasonForm(null);
  $$('[data-se-edit]', view).forEach(b => b.onclick = () => seasonForm(S.seasons.find(x => x.id === b.dataset.seEdit)));
  $$('[data-se-act]', view).forEach(b => b.onclick = async () => {
    const { error: e1 } = await sb.from('seasons').update({ is_active: false }).eq('is_active', true); if (e1) return fail(e1);
    const { error } = await sb.from('seasons').update({ is_active: true }).eq('id', b.dataset.seAct); if (error) return fail(error);
    toast('Saison activée'); route();
  });
  $$('[data-se-close]', view).forEach(b => b.onclick = async () => {
    if (!await confirmBox('Clôturer la saison', 'La saison ne sera plus active. Pensez à créer la nouvelle saison ensuite. Les données restent consultables.', 'Clôturer')) return;
    const { error } = await sb.from('seasons').update({ is_active: false, closed_at: new Date().toISOString() }).eq('id', b.dataset.seClose);
    if (error) return fail(error);
    toast('Saison clôturée'); route();
  });
  $$('[data-role]', view).forEach(sel => {
    sel.dataset.prev = sel.value;
    sel.onchange = async () => {
      const who = team.find(p => p.id === sel.dataset.role)?.full_name || 'cette personne';
      if (['admin', 'tresorier'].includes(sel.value) && !await confirmBox('Accès complet', `${esc(who)} aura accès à <strong>tout le logiciel</strong>, y compris la comptabilité, les données médicales et la gestion de l’équipe. Confirmer ?`, 'Confirmer')) { sel.value = sel.dataset.prev; return; }
      const { error } = await sb.from('profiles').update({ role: sel.value }).eq('id', sel.dataset.role);
      if (error) { sel.value = sel.dataset.prev; return fail(error); }
      sel.dataset.prev = sel.value;
      toast(`${who} : ${roleLabel(sel.value)}`);
    };
  });
}
