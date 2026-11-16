// Defendr — Guide enseignant
import { $, esc, fail, icon, isAdmin, sb, toast } from './core.js';
import { head, route } from './shell.js';

/* =====================================================================
   Guide enseignant ADAC : repères clés + PDF complet (stockage privé)
   ===================================================================== */
export const GUIDE_PATH = 'guides/adac-planifier-les-cours.pdf';
export async function viewGuide(view) {
  const { data: signed } = await sb.storage.from('cours').createSignedUrl(GUIDE_PATH, 3600);
  const pdf = signed?.signedUrl || null;
  const card = (title, body) => `<div class="card card-pad">${title ? `<h2>${title}</h2>` : ''}${body}</div>`;
  const tbl = (head, rows) => `<div class="table-wrap"><table class="table"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  view.innerHTML = head('Guide enseignant', 'Repères du guide ADAC « Planifier les cours de self-défense et de combat » (édition 2026)',
    pdf ? `<a class="btn btn-primary" href="${esc(pdf)}" target="_blank" rel="noopener">${icon('file')}Ouvrir le guide complet (PDF)</a>` : '') + `
    ${!pdf ? `<div class="alert info row wrap between mb" style="gap:8px"><span>Le PDF complet du guide n’est pas encore dans le logiciel.${isAdmin() ? ' Ajoutez-le une fois : il sera rangé dans votre espace privé, visible uniquement par l’équipe connectée.' : ' Le président ou le trésorier peut l’ajouter.'}</span>
      ${isAdmin() ? `<label class="btn btn-sm btn-primary" style="cursor:pointer">${icon('up')}Ajouter le PDF du guide<input type="file" id="guide-up" accept="application/pdf,.pdf" hidden></label>` : ''}</div>` : ''}
    <div class="grid two">
      ${card('Les 3 temps de l’apprentissage', `<ol class="small" style="padding-left:18px;margin:0">
        <li><strong>Construire</strong> des réponses motrices simples et fiables.</li>
        <li><strong>Entretenir</strong> : organiser les rappels pour limiter l’oubli.</li>
        <li><strong>Restituer</strong> en mise en situation (stages CATS, jeux de rôle, situations réelles débriefées).</li></ol>
        <p class="small muted mt">En self-défense, pas de pic de forme à une date connue : on vise une disponibilité permanente des réponses.</p>`)}
      ${card('Trame d’une séance (1 h 30 à 2 h)', tbl(['Durée', 'Bloc', 'Progression'], [
        ['10–15 min', 'Accueil, mise en train', 'Du général au spécifique'],
        ['15 min', 'Récurrence (révision)', 'Lent → variable'],
        ['35–50 min', 'Développement technico-tactique', 'Bloc → aléatoire → incertitude'],
        ['15–25 min', 'Préparation physique', 'Décontextualisé → contextualisé'],
        ['5–10 min', 'Retour au calme, connaissances', 'Respiration, bilan, consigne de rappel'],
      ]) + '<p class="small muted mt">Des repères, pas une prescription : la sécurité et le niveau réel du groupe priment.</p>')}
      ${card('Quand réviser', tbl(['Rythme', 'À faire'], [
        ['Chaque séance', '≈ 15 min de rappel de la séance précédente'],
        ['Chaque mois', '1re séance : stabiliser le thème du mois précédent'],
        ['Tous les 3 à 5 mois', 'À partir de mars, 2e séance du mois : retour sur un bloc plus ancien'],
      ]) + '<p class="small muted mt">Une révision commence lente et prévisible, puis gagne en vitesse, variabilité et incertitude.</p>')}
      ${card('Cycle de difficulté d’une révision', `<ol class="small" style="padding-left:18px;margin:0">
        <li>Reconstruction lente, sans incertitude</li><li>Stabilisation à vitesse modérée</li><li>Variabilité : ordre et partenaires différents</li>
        <li>Incertitude adaptée : vrai choix, peu d’options</li><li>Réemploi contextualisé : exercice intégré, flow ou opposition aménagée</li></ol>`)}
      ${card('Les paliers d’automatisation', `<ul class="small" style="padding-left:18px;margin:0">
        <li><strong>Consistance</strong> : une situation, une réponse, répétée lentement et proprement.</li>
        <li><strong>Variabilité</strong> : plusieurs stimuli, chacun sa réponse, dans un ordre qui change.</li>
        <li><strong>Incertitude</strong> : percevoir, décider, agir, avec une difficulté adaptée au niveau.</li></ul>
        <p class="small muted mt">Enseigner peu de « micro-blocs » courts, stables et réutilisables plutôt que de longues combinaisons.</p>`)}
      ${card('Contrôle rapide avant le cours', `<ul class="small" style="padding-left:18px;margin:0">
        <li>Une seule intention dominante par exercice</li><li>Une correction prioritaire à la fois</li><li>Une difficulté compatible avec la réussite et la sécurité</li>
        <li>Une révision planifiée, pas improvisée</li><li>Un passage progressif du stable vers le variable</li><li>Une version plus simple et une plus difficile prêtes</li></ul>
        <p class="small mt"><strong>En fin de séance :</strong> qu’est-ce qui est vraiment acquis ? que faut-il revoir la semaine prochaine ? quel exercice a le mieux fonctionné ?</p>`)}
    </div>
    <div class="card card-pad mt row wrap between" style="gap:8px"><span class="small">Le programme annuel du guide (septembre à juin) peut être ajouté en un clic à votre planification.</span><a class="btn btn-sm" href="#/planification">${icon('list')}Planification annuelle</a></div>
    ${pdf && isAdmin() ? `<div class="small muted mt"><label style="cursor:pointer;text-decoration:underline">Remplacer le PDF du guide<input type="file" id="guide-up" accept="application/pdf,.pdf" hidden></label></div>` : ''}`;
  $('#guide-up', view) && ($('#guide-up', view).onchange = async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    if (!/pdf$/i.test(file.type || file.name)) return toast('Choisissez un fichier PDF.', 'error');
    toast('Envoi du guide…');
    const { error } = await sb.storage.from('cours').upload(GUIDE_PATH, file, { upsert: true, contentType: 'application/pdf' });
    if (error) return fail(error);
    toast('Guide ajouté'); route();
  });
}
