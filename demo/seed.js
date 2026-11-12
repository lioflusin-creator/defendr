/* =====================================================================
   DEFENDR — club fictif pour la démonstration
   Toutes les personnes, coordonnées et sommes sont inventées.
   Les dates sont calculées par rapport au jour d'ouverture de la démo.
   ===================================================================== */
export function buildDemoData(userId) {
  // Générateur pseudo-aléatoire reproductible : la démo est identique pour tout le monde
  let seed = 20262027;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  let n = 0; const id = p => `${p}-${String(++n).padStart(4, '0')}`;
  const pad = x => String(x).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, k) => { const x = new Date(d); x.setDate(x.getDate() + k); return x; };
  const addMonths = (d, k) => { const x = new Date(d); x.setMonth(x.getMonth() + k); return x; };
  const ts = d => new Date(d).toISOString();

  const now = new Date(); now.setHours(12, 0, 0, 0);
  const sy = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;   // la saison commence en septembre
  const seasonStart = new Date(sy, 8, 1, 12);
  const label = `${sy}/${sy + 1}`;

  const seasonId = id('season');
  const seasons = [{ id: seasonId, label, opening_balance: 342.5, is_active: true, created_at: ts(seasonStart), closed_at: null }];

  const club_settings = [{
    id: 1, club_name: 'Club Démo Self-Défense', fee_new: 250, fee_returning: 230, fee_jobseeker: 150, fee_student: 150,
    default_start_time: '19:00:00', default_end_time: '20:30:00', whatsapp_number: null,
    revenue_types: ['Cotisation annuelle', 'Cotisation mensuelle', 'Stage', 'Équipement', 'Autre'],
    expense_categories: ['Loyer', 'Équipement', 'Assurance', 'Affiliation', 'Frais bancaires', 'Communication', 'Événement', 'Autre'],
    rooms: ['Dojo municipal', 'Gymnase des Sports', 'Extérieur'], threshold_assidu: 70, threshold_regulier: 45, threshold_risque: 25,
    club_address: 'Gymnase des Sports, 1 rue du Stade, 00000 Ville-Démo', club_legal_id: 'W000000000', president_name: 'Camille Martin', club_email: 'contact@club-demo.fr', updated_at: ts(now),
    bank_holder: 'CLUB DÉMO SELF-DÉFENSE', bank_iban: 'FR76 0000 0000 0000 0000 0000 000', bank_bic: 'DEMOFRPP', bank_name: 'Banque fictive de démonstration', federation_label: 'la fédération', club_documents: {},
  }];

  const profiles = [
    { id: userId, full_name: 'Camille Martin', role: 'admin', created_at: ts(seasonStart) },
    { id: id('user'), full_name: 'Alex Durand', role: 'tresorier', created_at: ts(addDays(seasonStart, 3)) },
    { id: id('user'), full_name: 'Sam Leroy', role: 'enseignant', created_at: ts(addDays(seasonStart, 5)) },
    { id: id('user'), full_name: 'Morgan Petit', role: 'en_attente', created_at: ts(addDays(now, -2)) },
  ];

  const sd = id('disc'), sda = id('disc');
  const disciplines = [
    { id: sd, name: 'Self Défense', description: 'Adultes', color: null, is_active: true, created_at: ts(seasonStart) },
    { id: sda, name: 'Self Défense Ados', description: '12 – 17 ans', color: null, is_active: true, created_at: ts(seasonStart) },
  ];
  const L = ['Débutant', 'Fondamental', 'Confirmé', 'Avancé'].map((name, i) => ({ id: id('level'), rank: i + 1, name, is_active: true, created_at: ts(seasonStart) }));

  // ---------- Adhérents fictifs ----------
  const people = [
    ['Julie', 'Bernard', 'Femme', 1986, 1], ['Thomas', 'Robert', 'Homme', 1979, 2], ['Sophie', 'Richard', 'Femme', 1991, 0], ['Nicolas', 'Durand', 'Homme', 1983, 1],
    ['Claire', 'Dubois', 'Femme', 1975, 0], ['Antoine', 'Moreau', 'Homme', 1995, 0], ['Isabelle', 'Laurent', 'Femme', 1969, 2], ['Mathieu', 'Simon', 'Homme', 1988, 0],
    ['Émilie', 'Michel', 'Femme', 2001, 0], ['Julien', 'Lefebvre', 'Homme', 1972, 3], ['Céline', 'Leroy', 'Femme', 1984, 1], ['David', 'Roux', 'Homme', 1990, 0],
    ['Nathalie', 'David', 'Femme', 1966, 0], ['Romain', 'Bertrand', 'Homme', 1998, 1], ['Aurélie', 'Morel', 'Femme', 1993, 0], ['Laurent', 'Fournier', 'Homme', 1958, 0],
    ['Manon', 'Girard', 'Femme', 2010, 0], ['Lucas', 'Bonnet', 'Homme', 2011, 0], ['Sandrine', 'Dupont', 'Femme', 1980, 1], ['Pierre', 'Lambert', 'Homme', 1977, 0],
    ['Léa', 'Fontaine', 'Femme', 2003, 0], ['Karim', 'Rousseau', 'Homme', 1987, 0],
  ];
  const howFound = ['Bouche à oreille', 'Réseaux sociaux', 'Forum des associations', 'Affiche / flyer', 'Internet'];
  const sizes = ['S', 'M', 'L', 'XL'];
  const notes = { 3: 'Ancienne blessure au genou droit : adapter les chutes.', 10: 'Aide à l’encadrement des débutants.', 12: 'Asthme léger, a sa ventoline dans son sac.' };
  const thisMonth = now.getMonth() + 1;
  const members = people.map(([first, last, gender, year, lvl], i) => {
    const minor = now.getFullYear() - year < 18;
    const isNew = lvl === 0 && i % 3 !== 2;
    const reg = i < 16 ? addDays(seasonStart, 4 + Math.floor(rnd() * 10)) : addDays(seasonStart, 30 + Math.floor(rnd() * Math.max(5, (now - seasonStart) / 864e5 - 40)));
    const regDate = reg > now ? addDays(now, -10) : reg;
    // Quelques anniversaires ce mois-ci
    const month = [1, 6, 13].includes(i) ? thisMonth : 1 + Math.floor(rnd() * 12);
    const day = i === 1 ? now.getDate() : 1 + Math.floor(rnd() * 27);
    const health = rnd();
    const cert = health < 0.45, qss = !cert && health < 0.85;
    const fee_type = minor || i === 8 || i === 20 ? 'Étudiant(e)' : isNew ? 'Nouvel adhérent(e)' : 'Ancien(ne) adhérent(e)';
    const fee_amount = { 'Étudiant(e)': 150, 'Nouvel adhérent(e)': 250, 'Ancien(ne) adhérent(e)': 230 }[fee_type];
    const waiver = !cert && !qss;
    return {
      id: id('member'), first_name: first, last_name: last, email: `${first.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${last.toLowerCase()}@exemple.fr`,
      phone: `06 00 00 ${pad(10 + i)} ${pad(20 + i)}`, address: `${10 + i} rue des Exemples, 00000 Ville-Démo`, birth_date: `${year}-${pad(month)}-${pad(day)}`, gender,
      discipline_id: minor ? sda : sd, level_id: L[lvl].id, status: i === 21 ? 'inactif' : 'actif', member_role: i === 9 ? 'animateur' : 'membre',
      registration_date: iso(regDate), tshirt_size: pick(sizes), fee_type, fee_amount,
      emergency_contact: minor ? `Parent de ${first}` : pick(['Conjoint(e)', 'Mère', 'Père', 'Ami(e)', 'Sœur', 'Frère']), emergency_phone: `06 00 00 ${pad(50 + i)} ${pad(60 + i)}`,
      medical_certificate: cert, qss, medical_waiver: waiver, medical_waiver_validity: waiver ? iso(addDays(now, i % 2 ? 12 : 40)) : null,
      how_found: pick(howFound), other_defense_sport: rnd() < 0.3, other_defense_sport_details: null,
      consent_image: rnd() < 0.85, consent_data: true, rules_read: true, rules_accepted: true, insurance_informed: true,
      medical_notes: notes[i] || null,
      guardian_name: minor ? `${pick(['Hélène', 'Marc', 'Sarah', 'Olivier'])} ${last}` : null, guardian_phone: minor ? `06 00 00 ${pad(70 + i)} ${pad(80 + i)}` : null, guardian_email: null,
      parental_authorization: minor && i === 16, pickup_persons: minor ? 'Parents, grand-mère' : null,
      created_at: ts(regDate), updated_at: ts(regDate), legacy: null,
    };
  });

  // Historique de grades
  const level_history = [];
  members.forEach((m, i) => {
    const lvl = L.findIndex(l => l.id === m.level_id);
    for (let k = 1; k <= lvl; k++) level_history.push({ id: id('grade'), member_id: m.id, from_level_id: L[k - 1].id, to_level_id: L[k].id, changed_on: `${sy - (lvl - k) - (i % 2)}-06-${pad(10 + k)}`, notes: k === lvl && lvl >= 2 ? 'Examen de fin de saison' : null, created_at: ts(seasonStart) });
  });

  // ---------- Séances : mardi et jeudi, de septembre à trois semaines après aujourd'hui ----------
  const themes = ['Reprise et principes de base', 'Distances et garde', 'Frappes de base', 'Déplacements et esquives', 'Défense sur saisies de poignet', 'Défense sur saisie de cou',
    'Chutes avant et arrière', 'Travail au sol', 'Se relever en sécurité', 'Défense sur coups de poing', 'Défense sur coups de pied', 'Gestion du stress', 'Travail à plusieurs agresseurs',
    'Parcours technique', 'Mises en situation', 'Révisions'];
  const courses = [], attendances = [];
  const todayIso = iso(now);
  const until = addDays(now, 21);
  let k = 0, lastPast = null;
  for (let d = new Date(seasonStart); d <= until; d = addDays(d, 1)) {
    const wd = d.getDay(); if (wd !== 2 && wd !== 4) continue;
    if (d.getMonth() === 9 && d.getDate() > 24 || d.getMonth() === 10 && d.getDate() < 3) continue; // vacances de la Toussaint
    const c = { id: id('course'), season_id: seasonId, title: themes[k++ % themes.length], discipline_id: sd, room: wd === 2 ? 'Dojo municipal' : 'Gymnase des Sports', course_date: iso(d), start_time: '19:00:00', end_time: '20:30:00', notes: null, file_url: null, file_name: null, instructor: k % 3 ? 'Camille Martin' : 'Sam Leroy', legacy: null, created_at: ts(seasonStart) };
    courses.push(c);
    if (c.course_date < todayIso) lastPast = c;
  }
  const assiduity = members.map((m, i) => [0.95, 0.85, 0.75, 0.9, 0.55, 0.6, 0.8, 0.35, 0.7, 0.98, 0.88, 0.5, 0.65, 0.78, 0.2, 0.6, 0.85, 0.7, 0.45, 0.66, 0.8, 0.3][i] ?? 0.6);
  for (const c of courses) {
    if (c.course_date >= todayIso || c === lastPast) continue; // la dernière séance : appel à faire
    members.forEach((m, i) => { if (m.status === 'actif' && c.course_date >= m.registration_date && rnd() < assiduity[i]) attendances.push({ course_id: c.id, member_id: m.id, present: true, notes: null }); });
  }

  // ---------- Paiements ----------
  const payments = [];
  members.forEach((m, i) => {
    if (m.status !== 'actif') return;
    const base = new Date(m.registration_date + 'T12:00:00');
    const plan = i % 5 === 1 ? 3 : i % 7 === 3 ? 5 : 1;
    const unpaid = i === 5 || i === 14;
    const amount = unpaid ? Math.round(m.fee_amount / 2) : m.fee_amount;
    const parts = plan;
    for (let p = 0; p < parts; p++) {
      const due = addMonths(base, p);
      const amt = Math.round((amount / parts) * 100) / 100 + (p === 0 ? Math.round((amount - Math.round((amount / parts) * 100) / 100 * parts) * 100) / 100 : 0);
      const method = plan > 1 ? 'Chèque' : pick(['Virement', 'Virement', 'Chèque', 'Espèces']);
      payments.push({ id: id('pay'), season_id: seasonId, member_id: m.id, payment_type: 'Cotisation annuelle', amount: amt, method, payment_date: iso(plan > 1 ? base : due), due_date: plan > 1 ? iso(due) : null,
        status: i === 18 && p === 0 ? 'en attente' : 'payé', bank_checked: due < addDays(now, -5), archived: false, notes: plan > 1 ? `${p + 1}/${parts}` : null, created_at: ts(base) });
    }
  });
  payments.push({ id: id('pay'), season_id: seasonId, member_id: members[1].id, payment_type: 'Stage', amount: 30, method: 'Espèces', payment_date: iso(addDays(now, -12)), due_date: null, status: 'payé', bank_checked: false, archived: false, notes: 'Stage du samedi', created_at: ts(addDays(now, -12)) });

  // ---------- Dépenses ----------
  const expenses = [
    ['Affiliation fédérale de la saison', 'Affiliation', 200, 'Virement', addDays(seasonStart, 10), true, 'Fédération'],
    ['Assurance responsabilité civile', 'Assurance', 185, 'Prélèvement', addDays(seasonStart, 15), true, 'Assureur Démo'],
    ['Paos et boucliers de frappe', 'Équipement', 249.9, 'Carte bancaire', addDays(seasonStart, 20), true, 'Magasin de sport'],
    ['Impression des flyers', 'Communication', 45, 'Carte bancaire', addDays(seasonStart, 2), true, 'Imprimerie'],
  ].map(([label, category, amount, method, d, bank, supplier]) => ({ id: id('exp'), season_id: seasonId, label, category, amount, method, expense_date: iso(d), supplier, bank_checked: bank && d < now, archived: false, notes: null, created_at: ts(d) }));
  for (let d = new Date(sy, 8, 12, 12); d <= now; d = addMonths(d, 1))
    expenses.push({ id: id('exp'), season_id: seasonId, label: 'Tenue de compte', category: 'Frais bancaires', amount: 4.5, method: 'Prélèvement', expense_date: iso(d), supplier: 'Banque', bank_checked: d < addDays(now, -10), archived: false, notes: null, created_at: ts(d) });

  // ---------- Planification annuelle (programme d'exemple) ----------
  const PROG = {
    'Technico tactique': ['Attitudes de base, garde et distances', 'Frappes de base et enchaînements', 'Défenses sur saisies', 'Chutes et travail au sol', 'Défense sur coups de pied', 'Travail contre deux agresseurs', 'Gestion du corps à corps', 'Mises en situation réalistes', 'Préparation au passage de grade'],
    'Connaissances générales': ['La légitime défense', 'Les zones vulnérables', 'Gestion du stress', 'L’alerte aux secours', 'Le signalement', 'Réaction de groupe face à une menace', 'Les effets du stress', 'Révisions', 'Bilan de saison'],
    'Préparation physique générale': ['Gainage et renforcement', 'Explosivité au pao', 'Travail cardio par intervalles', 'Pliométrie légère', 'Parcours technique', 'Vitesse de réaction', 'Endurance de combat', 'Tests de fin de trimestre', 'Tests de fin de saison'],
    'Préparation récupération': ['Respiration et cohérence cardiaque', 'Étirements de base', 'Relaxation guidée', 'Étirements à deux', 'Visualisation', 'Respiration 4-2-4', 'Retour au calme', 'Auto-massages', 'Relaxation complète'],
  };
  const seasonMonths = [9, 10, 11, 12, 1, 2, 3, 4, 5];
  const curIdx = seasonMonths.indexOf(thisMonth);
  const plan_items = [];
  seasonMonths.forEach((m, mi) => Object.entries(PROG).forEach(([cat, items]) => {
    const list = [items[mi], items[(mi + 3) % items.length]];
    list.forEach((label, p) => plan_items.push({ id: id('plan'), season_id: seasonId, month: m, category: cat, label: p ? `${label} (renfort)` : label, done: curIdx >= 0 && (mi < curIdx || (mi === curIdx && p === 0 && cat !== 'Préparation récupération')), position: p, created_at: ts(seasonStart) }));
  }));

  // Lien entre la prochaine séance et le programme du mois
  const next = courses.find(c => c.course_date >= todayIso);
  const course_plan_items = next ? plan_items.filter(p => p.month === thisMonth && !p.done).slice(0, 2).map(p => ({ course_id: next.id, plan_item_id: p.id })) : [];

  // Une demande d'inscription en ligne en attente
  const registrations = [{ id: id('reg'), status: 'nouvelle', created_at: ts(addDays(now, -1)), data: {
    first_name: 'Chloé', last_name: 'Garnier', birth_date: `${now.getFullYear() - 29}-03-14`, gender: 'Femme', phone: '06 00 00 99 01', email: 'chloe.garnier@exemple.fr', address: null,
    tshirt_size: 'S', fee_type: 'Nouvel adhérent(e)', emergency_contact: 'Paul (conjoint)', emergency_phone: '06 00 00 99 02', medical_notes: null, how_found: 'Réseaux sociaux',
    other_defense_sport: false, other_defense_sport_details: null, consent_image: true, consent_data: true, rules_read: true, rules_accepted: true, insurance_informed: true } }];

  // Quelques prospects : un à relancer, un cours d'essai à venir, un tout juste ajouté
  const prospects = [
    { id: id('pros'), first_name: 'Inès', last_name: 'Barbier', phone: '06 00 00 88 01', email: null, source: 'lien', status: 'invite', invited_at: ts(addDays(now, -10)), notes: 'Rencontrée au forum des associations', trial_present: false, created_at: ts(addDays(now, -10)) },
    { id: id('pros'), first_name: 'Karim', last_name: 'Benali', phone: '06 00 00 88 02', email: null, source: 'manuel', status: 'essai', trial_date: next ? next.course_date : iso(addDays(now, 3)), trial_course_id: next?.id || null, trial_present: false, notes: 'Collègue d’un adhérent', created_at: ts(addDays(now, -4)) },
    { id: id('pros'), first_name: 'Manon', last_name: 'Lefèvre', phone: '06 00 00 88 03', email: null, source: 'pdf', status: 'invite', invited_at: ts(addDays(now, -2)), trial_present: false, created_at: ts(addDays(now, -2)) },
  ];

  return { profiles, club_settings, seasons, disciplines, levels: L, members, level_history, courses, attendances, payments, expenses, plan_items, course_plan_items, registrations, prospects, audit_log: [] };
}
