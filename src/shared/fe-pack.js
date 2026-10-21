/*
 * Pack « Personnages de la série Fire Emblem » : fiches (classe, niveau, stats, croissances, inventaire,
 * rareté d'invocation, série, bio) des personnages principaux de chaque jeu.
 * Les stats sont approximatives : calculées depuis la classe et le niveau, avec la personnalité des
 * croissances du personnage. Images : seuls les personnages dont le projet fournit déjà les ressources
 * (ART : Eliwood, Lyn, Hector, rangés dans ressources/personnages/) les reçoivent ; les autres gardent
 * les sprites de leur classe (ou un jeton) jusqu'à ce qu'on leur donne les leurs.
 *
 * Installation (Base de données › Unités › Personnages de la série) : install(db, ['fe7', ...]) ajoute les
 * classes manquantes, les personnages absents (même nom et même série = déjà là) et une bannière par jeu.
 */
(function (root, factory) {
  const common = typeof module !== 'undefined' && module.exports;
  const api = factory(common ? require('./rules.js') : root.Rules, common ? require('./defaults.js') : root.Defaults);
  if (common) module.exports = api; else root.FEPack = api;
})(typeof self !== 'undefined' ? self : this, function (Rules, Defaults) {
  'use strict';
  const st = (hp, str, mag, skl, spd, lck, def, res) => ({ hp, str, mag, skl, spd, lck, def, res });
  const CAPS1 = st(60, 20, 20, 20, 20, 30, 20, 20), CAPS2 = st(60, 26, 26, 26, 26, 30, 25, 26);

  // ------------------------------------------------------------------
  // Classes ajoutées par le pack (aucune n'a de sprite : jetons de couleur en attendant)
  // ------------------------------------------------------------------
  const k = (id, name, moveType, mov, weapons, base, growths, extra) => Object.assign({
    id, name, moveType, mov, weapons, base, growths, caps: Object.assign({}, CAPS1), tier: 1, promotesTo: '',
    defaultInventory: [], mapSprite: '', battler: '', fromPack: true
  }, extra || {});
  const t2 = (o) => Object.assign({ tier: 2, caps: Object.assign({}, CAPS2) }, o);
  const CLASSES = [
    k('fe_lord', 'Seigneur (épée)', 'foot', 5, ['sword'], st(18, 5, 0, 6, 7, 5, 5, 1), st(80, 45, 5, 50, 45, 50, 30, 25), { defaultInventory: ['w_iron_sword'] }),
    k('fe_lance_lord', 'Seigneur (lance)', 'foot', 5, ['lance'], st(19, 6, 0, 5, 6, 4, 6, 1), st(85, 50, 5, 45, 40, 40, 35, 20), { defaultInventory: ['w_iron_lance'] }),
    k('fe_axe_lord', 'Seigneur (hache)', 'foot', 5, ['axe'], st(20, 7, 2, 4, 5, 4, 6, 2), st(85, 55, 25, 40, 40, 35, 35, 25), { defaultInventory: ['w_iron_axe'] }),
    k('fe_bow_lord', 'Seigneur (arc)', 'foot', 5, ['bow', 'sword'], st(18, 5, 0, 7, 7, 6, 4, 2), st(75, 40, 10, 55, 55, 45, 25, 25), { defaultInventory: ['w_iron_bow'] }),
    k('fe_tactician', 'Tacticien', 'foot', 5, ['sword', 'anima'], st(18, 5, 4, 5, 5, 3, 5, 3), st(70, 40, 40, 40, 40, 40, 30, 30), { defaultInventory: ['w_iron_sword', 'w_fire'] }),
    k('fe_priestess', 'Prêtresse guerrière', 'foot', 5, ['sword', 'anima'], st(16, 4, 4, 6, 7, 6, 3, 5), st(60, 30, 45, 45, 50, 45, 15, 40), { defaultInventory: ['w_iron_sword', 'w_fire'] }),
    k('fe_myrmidon', 'Myrmidon', 'foot', 5, ['sword'], st(16, 4, 0, 9, 10, 0, 2, 0), st(70, 35, 0, 45, 55, 35, 15, 20), { defaultInventory: ['w_iron_sword'] }),
    k('fe_swordmaster', 'Bretteur', 'foot', 6, ['sword'], st(21, 7, 2, 13, 14, 0, 5, 2), st(70, 35, 0, 45, 55, 35, 15, 20), t2({ defaultInventory: ['w_killing_edge'] })),
    k('fe_wyvern', 'Chevalier wyverne', 'flier', 7, ['lance', 'axe'], st(20, 7, 0, 3, 5, 0, 8, 0), st(80, 50, 0, 35, 35, 30, 35, 5), { defaultInventory: ['w_iron_lance'] }),
    k('fe_wyvern_lord', 'Seigneur wyverne', 'flier', 8, ['lance', 'axe', 'sword'], st(24, 10, 0, 6, 7, 0, 11, 1), st(80, 50, 0, 35, 35, 30, 35, 5), t2({ defaultInventory: ['w_iron_axe'] })),
    k('fe_falcon', 'Chevalier faucon', 'flier', 8, ['lance', 'sword', 'staff'], st(20, 6, 3, 9, 12, 0, 5, 8), st(65, 35, 15, 45, 55, 40, 15, 40), t2({ defaultInventory: ['w_iron_lance'] })),
    k('fe_dancer', 'Danseuse', 'foot', 5, [], st(15, 1, 1, 3, 8, 5, 1, 3), st(65, 15, 15, 40, 60, 60, 15, 40), { dance: true }),
    k('fe_troubadour', 'Troubadour', 'horse', 7, ['staff'], st(15, 0, 3, 1, 3, 0, 2, 5), st(55, 5, 50, 30, 45, 50, 10, 55), { defaultInventory: ['w_heal'] }),
    k('fe_valkyrie', 'Valkyrie', 'horse', 8, ['anima', 'staff'], st(19, 0, 6, 5, 8, 0, 4, 8), st(55, 5, 55, 40, 45, 45, 10, 50), t2({ defaultInventory: ['w_fire'] })),
    k('fe_monk', 'Moine', 'foot', 5, ['light'], st(17, 0, 4, 2, 4, 0, 2, 5), st(55, 10, 50, 40, 40, 30, 10, 45), { defaultInventory: ['w_lightning'] }),
    k('fe_bishop', 'Évêque', 'foot', 6, ['light', 'staff'], st(21, 0, 7, 5, 6, 0, 4, 10), st(55, 10, 50, 40, 40, 30, 10, 45), t2({ defaultInventory: ['w_lightning', 'w_heal'] })),
    k('fe_shaman', 'Shaman', 'foot', 5, ['dark'], st(16, 0, 5, 3, 3, 0, 2, 3), st(55, 5, 55, 40, 35, 20, 15, 35), { defaultInventory: ['w_flux'] }),
    k('fe_druid', 'Druide', 'foot', 6, ['dark', 'staff'], st(21, 0, 8, 6, 5, 0, 5, 7), st(55, 5, 55, 40, 35, 20, 15, 35), t2({ defaultInventory: ['w_flux'] })),
    k('fe_sage', 'Sage', 'foot', 6, ['anima', 'staff'], st(20, 0, 8, 6, 7, 0, 4, 7), st(55, 5, 55, 40, 40, 25, 10, 40), t2({ defaultInventory: ['w_fire'] })),
    k('fe_sniper', 'Sniper', 'foot', 6, ['bow'], st(21, 7, 0, 9, 8, 0, 6, 3), st(70, 35, 0, 50, 40, 35, 20, 25), t2({ defaultInventory: ['w_iron_bow'] })),
    k('fe_nomad', 'Nomade', 'horse', 7, ['bow'], st(16, 4, 0, 5, 6, 0, 3, 0), st(65, 35, 0, 45, 50, 40, 15, 20), { defaultInventory: ['w_iron_bow'] }),
    k('fe_berserker', 'Berserker', 'foot', 6, ['axe'], st(26, 9, 0, 6, 8, 0, 6, 1), st(85, 55, 0, 35, 35, 25, 15, 10), t2({ defaultInventory: ['w_iron_axe'] })),
    k('fe_dark_knight', 'Chevalier noir', 'horse', 7, ['sword', 'dark'], st(23, 8, 6, 5, 6, 0, 9, 6), st(70, 40, 40, 35, 35, 30, 30, 30), t2({ defaultInventory: ['w_iron_sword', 'w_flux'] }))
  ];
  // Promotions entre classes du pack (avec un Sceau de promotion, comme les autres classes)
  const PROMOTIONS = [['fe_myrmidon', 'fe_swordmaster'], ['fe_wyvern', 'fe_wyvern_lord'], ['fe_monk', 'fe_bishop'], ['fe_shaman', 'fe_druid'], ['fe_troubadour', 'fe_valkyrie'], ['fe_nomad', 'fe_sniper']];

  // ------------------------------------------------------------------
  // Personnages : [nom, classe, niveau, rareté, genre (h / f), croissances « PV For Mag Tec Vit Cha Déf Rés », inventaire, bio]
  // Le premier (ou les deux premiers) d'un jeu sont mis en avant dans sa bannière.
  // ------------------------------------------------------------------
  const GAMES = [
    { id: 'fe1', series: 'Fire Emblem 1 & 3', title: 'Fire Emblem : Shadow Dragon / Mystery of the Emblem', focus: 1, characters: [
      ['Marth', 'fe_lord', 1, 5, 'h', '90 50 0 40 50 70 20 0', ['w_rapier'], "Prince d'Altea, il reprend son royaume et brandit Falchion contre le dragon noir."],
      ['Caeda', 'pegasus', 1, 4, 'f', '60 40 5 40 55 60 15 50', ['w_iron_lance', 'w_javelin'], 'Princesse de Talys, chevalière pégase au grand cœur.'],
      ['Jagen', 'paladin', 1, 3, 'h', '60 20 0 25 25 20 25 15', ['w_iron_lance', 'w_iron_sword'], 'Vieux chevalier qui a élevé Marth : précieux au début, vite dépassé.'],
      ['Cain', 'cavalier', 1, 3, 'h', '80 40 0 40 40 30 25 10', ['w_iron_sword', 'w_iron_lance'], 'Chevalier rouge d\'Altea, surnommé « le Taureau ».'],
      ['Abel', 'cavalier', 1, 3, 'h', '70 35 0 45 45 30 20 15', ['w_iron_lance', 'w_javelin'], 'Chevalier vert d\'Altea, « la Panthère ».'],
      ['Draug', 'knight', 1, 3, 'h', '80 40 0 30 20 20 40 5', ['w_iron_lance'], 'Chevalier en armure, rempart de l\'armée d\'Altea.'],
      ['Ogma', 'mercenary', 3, 4, 'h', '90 45 0 50 50 30 20 10', ['w_iron_sword', 'w_steel_sword'], 'Mercenaire balafré, loyal à Caeda jusqu\'à la mort.'],
      ['Navarre', 'fe_myrmidon', 4, 4, 'h', '80 30 0 55 55 30 20 10', ['w_killing_edge'], 'Épéiste solitaire au regard glacial, recruté par Caeda.'],
      ['Merric', 'mage', 1, 4, 'h', '90 5 50 60 50 40 15 50', ['w_fire'], 'Mage de Khadein, ami d\'enfance de Marth, maître du vent.'],
      ['Minerva', 'fe_wyvern', 4, 5, 'f', '75 40 5 50 50 40 25 15', ['w_iron_axe', 'w_iron_lance'], 'Princesse de Macedon, chevaucheuse de dragon redoutée.'],
      ['Lena', 'cleric', 1, 3, 'f', '50 5 45 30 40 60 10 60', ['w_heal'], 'Sœur dévouée aux blessés, sœur de Machis.'],
      ['Julian', 'thief', 1, 3, 'h', '60 30 0 50 60 60 10 5', ['w_iron_sword'], 'Ancien voleur qui a changé de vie pour Lena.'],
      ['Linde', 'mage', 1, 4, 'f', '50 5 55 40 60 40 10 40', ['w_fire'], 'Fille du sage Miloah, gardienne du sort Aura.'],
      ['Palla', 'pegasus', 3, 3, 'f', '70 40 5 50 50 30 15 35', ['w_iron_lance'], 'Aînée des sœurs pégases de Macedon.'],
      ['Catria', 'pegasus', 3, 3, 'f', '70 35 5 50 55 40 15 40', ['w_iron_lance'], 'Cadette des sœurs pégases, au cœur tourné vers Marth.'],
      ['Est', 'pegasus', 1, 4, 'f', '60 40 5 50 60 50 15 45', ['w_iron_lance'], 'Benjamine des sœurs pégases, au potentiel immense.']
    ] },
    { id: 'fe2', series: 'Fire Emblem 2', title: 'Fire Emblem Gaiden / Echoes : Shadows of Valentia', focus: 2, characters: [
      ['Alm', 'fe_lord', 1, 5, 'h', '90 60 0 45 45 45 40 10', ['w_iron_sword'], 'Jeune villageois de Ram qui mène la Délivrance de Zofia.'],
      ['Celica', 'fe_priestess', 1, 5, 'f', '40 30 50 40 45 35 20 40', ['w_iron_sword', 'w_fire'], 'Prêtresse au cœur de lionne, partie chercher la déesse Mila.'],
      ['Lukas', 'soldier', 3, 3, 'h', '55 45 0 40 40 30 50 10', ['w_iron_lance'], 'Soldat posé et stratège, le plus fiable de la Délivrance.'],
      ['Gray', 'mercenary', 1, 3, 'h', '50 40 0 45 45 30 25 10', ['w_iron_sword'], 'Ami d\'enfance d\'Alm, un peu trop sûr de lui.'],
      ['Tobin', 'archer', 1, 3, 'h', '60 40 0 50 50 40 20 5', ['w_iron_bow'], 'Ami d\'enfance d\'Alm, archer de Ram.'],
      ['Kliff', 'mage', 1, 3, 'h', '50 5 45 40 50 30 15 40', ['w_fire'], 'Jeune villageois au tempérament froid, doué pour la magie.'],
      ['Faye', 'pegasus', 1, 3, 'f', '50 35 15 40 50 40 15 40', ['w_iron_lance'], 'Amie d\'enfance d\'Alm, prête à le suivre n\'importe où.'],
      ['Silque', 'cleric', 1, 3, 'f', '50 5 50 40 40 60 15 55', ['w_heal'], 'Prêtresse douce et pieuse, rencontrée dans un sanctuaire.'],
      ['Mae', 'mage', 1, 4, 'f', '45 5 60 40 55 40 10 30', ['w_fire'], 'Mage enjouée et explosive, amie de Celica.'],
      ['Clive', 'cavalier', 3, 4, 'h', '60 40 0 40 40 30 25 15', ['w_iron_lance', 'w_iron_sword'], 'Chef de la Délivrance, noble chevalier de Zofia.'],
      ['Saber', 'mercenary', 5, 4, 'h', '60 45 0 50 45 25 25 10', ['w_steel_sword'], 'Mercenaire désabusé qui protège Celica… pour une bourse.']
    ] },
    { id: 'fe4', series: 'Fire Emblem 4', title: 'Fire Emblem : Genealogy of the Holy War', focus: 2, characters: [
      ['Sigurd', 'paladin', 5, 5, 'h', '100 40 10 30 30 30 30 5', ['w_iron_sword', 'w_iron_lance'], 'Chevalier de Chalphy, héros tragique de la première génération.'],
      ['Seliph', 'fe_lord', 1, 5, 'h', '80 40 10 30 40 50 25 25', ['w_iron_sword'], 'Fils de Sigurd, il rallume l\'espoir de Jugdral.'],
      ['Deirdre', 'fe_monk', 1, 4, 'f', '40 5 40 30 30 50 10 50', ['w_lightning'], 'Mystérieuse jeune femme de la forêt de Spirit, épouse de Sigurd.'],
      ['Ayra', 'fe_myrmidon', 3, 4, 'f', '120 50 0 50 60 25 20 5', ['w_killing_edge'], 'Princesse d\'Isaach, épéiste à la lame éclair.'],
      ['Lex', 'great_knight', 1, 3, 'h', '90 40 0 30 40 25 50 5', ['w_iron_axe'], 'Fils du duc de Dozel, ami fidèle de Sigurd.'],
      ['Azelle', 'mage', 1, 3, 'h', '80 10 40 30 40 25 20 30', ['w_fire'], 'Fils de Velthomer, timide mage de feu.'],
      ['Finn', 'cavalier', 1, 4, 'h', '70 35 0 40 40 60 30 15', ['w_iron_lance'], 'Chevalier de Leonster, la loyauté incarnée.'],
      ['Ethlyn', 'fe_troubadour', 1, 3, 'f', '70 25 20 30 40 40 15 30', ['w_heal'], 'Sœur de Sigurd, princesse chevalière de Leonster.'],
      ['Lachesis', 'fe_troubadour', 1, 4, 'f', '60 20 30 30 40 40 15 35', ['w_heal'], 'Princesse de Nordion, sœur d\'Eldigan.'],
      ['Sylvia', 'fe_dancer', 1, 4, 'f', '80 10 5 40 70 70 10 40', [], 'Danseuse insouciante dont les pas redonnent un tour aux alliés.'],
      ['Levin', 'mage', 1, 5, 'h', '90 30 50 40 50 30 20 40', ['w_fire'], 'Barde de Silesse, héritier du vent Forseti.'],
      ['Brigid', 'archer', 5, 4, 'f', '90 40 0 40 40 30 20 10', ['w_iron_bow'], 'Capitaine pirate d\'Orgahil, archère héritière d\'Ullr.']
    ] },
    { id: 'fe5', series: 'Fire Emblem 5', title: 'Fire Emblem : Thracia 776', focus: 1, characters: [
      ['Leif', 'fe_lord', 1, 5, 'h', '70 35 5 50 40 50 25 10', ['w_iron_sword'], 'Prince de Leonster en exil, qui refuse d\'abandonner son peuple.'],
      ['Nanna', 'fe_troubadour', 3, 4, 'f', '60 25 30 40 40 70 10 40', ['w_heal'], 'Princesse de Nordion, toujours aux côtés de Leif.'],
      ['Eyvel', 'mercenary', 13, 4, 'f', '40 20 5 30 30 30 15 10', ['w_slim_sword'], 'Mercenaire protectrice de Fiana, mère adoptive de Mareeta.'],
      ['Dagdar', 'fighter', 10, 3, 'h', '60 30 0 35 30 20 20 5', ['w_iron_axe'], 'Chef des « Pirates » de Fiana, père de Tanya.'],
      ['Osian', 'fighter', 5, 3, 'h', '60 50 0 30 45 30 25 10', ['w_iron_axe'], 'Fidèle combattant de Leif, au caractère bien trempé.'],
      ['Tanya', 'archer', 1, 3, 'f', '50 40 0 50 50 40 15 15', ['w_iron_bow'], 'Fille de Dagdar, archère espiègle.'],
      ['Safy', 'cleric', 1, 3, 'f', '50 5 50 40 40 50 10 60', ['w_heal'], 'Prêtresse de Thracia au service de Leif.'],
      ['Olwen', 'fe_valkyrie', 5, 5, 'f', '60 10 50 40 50 30 15 40', ['w_fire'], 'Chevalière-mage de Friege, sœur de Reinhardt.'],
      ['Reinhardt', 'paladin', 10, 5, 'h', '60 40 20 40 40 30 30 30', ['w_steel_sword'], 'Maître chevalier de Friege, la « Lame tonnerre ».'],
      ['Sara', 'cleric', 1, 4, 'f', '50 5 60 40 50 70 10 60', ['w_heal'], 'Petite-fille de Manfroy, prêtresse au pouvoir caché.'],
      ['Mareeta', 'fe_myrmidon', 1, 4, 'f', '70 40 0 60 60 50 15 20', ['w_iron_sword'], 'Fille adoptive d\'Eyvel, future épéiste légendaire.'],
      ['Lara', 'fe_dancer', 1, 4, 'f', '70 20 5 50 60 60 10 20', [], 'Voleuse devenue danseuse, au caractère vif.']
    ] },
    { id: 'fe6', series: 'Fire Emblem 6', title: 'Fire Emblem : The Binding Blade', focus: 1, characters: [
      ['Roy', 'fe_lord', 1, 5, 'h', '80 40 0 50 40 60 25 30', ['w_rapier'], 'Fils d\'Eliwood, jeune général de Lycia face à Bern.'],
      ['Lilina', 'mage', 1, 4, 'f', '45 5 75 20 35 50 10 30', ['w_fire'], 'Fille d\'Hector, mage au grand cœur.'],
      ['Marcus', 'paladin', 1, 3, 'h', '60 25 0 20 25 30 15 20', ['w_iron_lance', 'w_iron_sword'], 'Chevalier vétéran de Pherae, garde du corps de Roy.'],
      ['Alen', 'cavalier', 1, 3, 'h', '85 45 0 40 45 40 25 10', ['w_iron_sword', 'w_iron_lance'], 'Chevalier impétueux de Pherae.'],
      ['Lance', 'cavalier', 1, 3, 'h', '80 40 0 45 50 35 20 15', ['w_iron_lance', 'w_iron_sword'], 'Chevalier posé de Pherae, rival d\'Alen.'],
      ['Wolt', 'archer', 1, 3, 'h', '80 40 0 50 40 40 20 10', ['w_iron_bow'], 'Frère de lait de Roy, archer appliqué.'],
      ['Bors', 'knight', 1, 3, 'h', '90 30 0 40 20 30 30 5', ['w_iron_lance'], 'Chevalier d\'Ostia chargé de protéger Lilina.'],
      ['Ellen', 'cleric', 1, 3, 'f', '45 5 50 30 30 70 5 60', ['w_heal'], 'Prêtresse d\'Ilia, généreuse et maladroite.'],
      ['Dieck', 'mercenary', 5, 4, 'h', '90 40 0 40 40 35 20 15', ['w_iron_sword'], 'Chef de mercenaires bourru au grand cœur.'],
      ['Shanna', 'pegasus', 1, 4, 'f', '45 35 5 40 60 50 10 25', ['w_iron_lance'], 'Cadette des sœurs pégases d\'Ilia, rêveuse et vive.'],
      ['Rutger', 'fe_myrmidon', 4, 4, 'h', '80 30 0 60 50 30 20 20', ['w_iron_sword'], 'Épéiste taciturne en quête de vengeance.'],
      ['Sue', 'fe_nomad', 1, 3, 'f', '55 30 0 55 65 50 10 15', ['w_iron_bow'], 'Nomade de Sacae, petite-fille de Lyn par le sang des Lorca.'],
      ['Fir', 'fe_myrmidon', 1, 4, 'f', '65 35 0 40 55 50 15 25', ['w_iron_sword'], 'Jeune bretteuse qui voyage pour retrouver son frère.']
    ] },
    { id: 'fe7', series: 'Fire Emblem 7', title: 'Fire Emblem : The Blazing Blade', focus: 3, characters: [
      ['Eliwood', 'lord', 1, 5, 'h', '80 45 5 50 40 45 30 35', ['w_iron_sword'], 'Héritier de Pherae, doux mais inflexible.'],
      ['Lyn', 'lyn_lord', 1, 5, 'f', '70 40 5 60 60 55 20 30', ['w_iron_sword'], 'Guerrière de la plaine de Sacae.'],
      ['Hector', 'axe_lord', 1, 5, 'h', '90 60 5 45 35 30 50 25', ['w_iron_axe', 'w_hand_axe'], 'Frère cadet du marquis d\'Ostia.'],
      ['Florina', 'pegasus', 1, 4, 'f', '60 40 5 50 55 50 15 35', ['w_iron_lance'], 'Chevalière pégase d\'Ilia, terrifiée par les hommes.'],
      ['Kent', 'cavalier', 1, 3, 'h', '85 40 0 50 45 20 25 25', ['w_iron_sword', 'w_iron_lance'], 'Chevalier rouge de Caelin, sérieux jusqu\'au bout des ongles.'],
      ['Sain', 'cavalier', 1, 3, 'h', '80 60 0 35 40 35 20 20', ['w_iron_lance', 'w_iron_sword'], 'Chevalier vert de Caelin, coureur de jupons invétéré.'],
      ['Wil', 'archer', 2, 3, 'h', '75 50 0 50 40 40 20 25', ['w_iron_bow'], 'Archer jovial de Pherae, ami de Rebecca.'],
      ['Erk', 'mage', 1, 3, 'h', '65 5 40 40 50 30 20 40', ['w_fire'], 'Élève de Pent, mage sérieux et pincé.'],
      ['Raven', 'mercenary', 5, 4, 'h', '85 55 0 40 45 35 25 15', ['w_steel_sword'], 'Héritier déchu de Cornwell, mercenaire rancunier.'],
      ['Priscilla', 'fe_troubadour', 3, 4, 'f', '45 10 50 40 40 65 15 50', ['w_heal'], 'Sœur de Raven, élevée par une famille noble d\'Etruria.'],
      ['Ninian', 'fe_dancer', 1, 5, 'f', '85 5 5 70 70 80 30 70', [], 'Mystérieuse danseuse au destin lié à Eliwood.'],
      ['Nino', 'mage', 5, 4, 'f', '55 5 50 55 60 45 15 50', ['w_fire'], 'Jeune mage élevée par le Croc Noir.'],
      ['Karel', 'fe_swordmaster', 8, 5, 'h', '70 30 0 50 50 30 10 15', ['w_killing_edge'], 'Le « Démon de l\'épée », toujours en quête d\'un adversaire digne.'],
      ['Canas', 'fe_shaman', 8, 3, 'h', '70 10 45 40 35 25 25 45', ['w_flux'], 'Shaman érudit, passionné de magie ancienne.'],
      ['Heath', 'fe_wyvern', 7, 4, 'h', '80 50 0 50 45 20 30 20', ['w_iron_lance'], 'Chevalier wyverne de Bern, déserteur pour l\'honneur.'],
      ['Pent', 'fe_sage', 6, 5, 'h', '50 10 30 20 40 40 30 35', ['w_fire', 'w_heal'], 'Comte de Reglay, sage parmi les sages.'],
      ['Louise', 'fe_sniper', 4, 4, 'f', '60 40 0 40 40 30 20 30', ['w_iron_bow'], 'Épouse de Pent, archère d\'élite au sourire désarmant.']
    ] },
    { id: 'fe8', series: 'Fire Emblem 8', title: 'Fire Emblem : The Sacred Stones', focus: 2, characters: [
      ['Eirika', 'fe_lord', 1, 5, 'f', '70 40 5 60 60 60 30 30', ['w_rapier'], 'Princesse de Renais, épéiste gracieuse.'],
      ['Ephraim', 'fe_lance_lord', 4, 5, 'h', '80 55 5 55 45 50 35 25', ['w_iron_lance'], 'Prince de Renais, lancier intrépide, frère jumeau d\'Eirika.'],
      ['Seth', 'paladin', 1, 4, 'h', '90 50 0 45 45 25 40 30', ['w_steel_sword', 'w_iron_lance'], 'Chevalier argenté, commandant de Renais.'],
      ['Franz', 'cavalier', 1, 3, 'h', '80 40 0 40 50 40 25 20', ['w_iron_sword', 'w_iron_lance'], 'Jeune chevalier plein d\'ardeur, frère de Forde.'],
      ['Vanessa', 'pegasus', 1, 3, 'f', '50 35 5 55 60 50 10 30', ['w_iron_lance'], 'Chevalière pégase rigoureuse de Frelia.'],
      ['Neimi', 'archer', 1, 3, 'f', '55 45 0 50 60 50 15 35', ['w_iron_bow'], 'Archère timide qui pleure souvent… et vise juste.'],
      ['Colm', 'thief', 2, 3, 'h', '75 40 0 40 65 45 25 20', ['w_iron_sword'], 'Ami d\'enfance de Neimi, voleur un peu frimeur.'],
      ['Artur', 'fe_monk', 2, 3, 'h', '55 5 50 50 40 25 15 55', ['w_lightning'], 'Moine malchanceux et dévoué.'],
      ['Lute', 'mage', 1, 4, 'f', '45 5 65 30 45 45 15 40', ['w_fire'], 'Mage autoproclamée surdouée… et elle a raison.'],
      ['Joshua', 'fe_myrmidon', 5, 4, 'h', '80 35 0 55 55 30 20 20', ['w_iron_sword'], 'Épéiste joueur, prince de Jehanna incognito.'],
      ['Tethys', 'fe_dancer', 1, 4, 'f', '85 5 5 10 70 80 5 79', [], 'Danseuse de la troupe de Gerik, sœur d\'Ewan.'],
      ['Innes', 'fe_sniper', 1, 4, 'h', '75 40 0 45 45 45 20 25', ['w_iron_bow'], 'Prince de Frelia, archer fier rival d\'Ephraim.']
    ] },
    { id: 'fe9', series: 'Fire Emblem 9', title: 'Fire Emblem : Path of Radiance', focus: 1, characters: [
      ['Ike', 'mercenary', 1, 5, 'h', '75 50 0 50 50 40 40 25', ['w_iron_sword'], 'Fils de Greil, chef des Mercenaires de Greil.'],
      ['Titania', 'paladin', 1, 4, 'f', '75 40 10 35 35 40 25 20', ['w_iron_lance', 'w_iron_sword'], 'Bras droit de Greil, protectrice des mercenaires.'],
      ['Mist', 'cleric', 1, 3, 'f', '50 20 40 45 50 60 15 50', ['w_heal'], 'Petite sœur d\'Ike, soigneuse de la compagnie.'],
      ['Soren', 'mage', 1, 4, 'h', '45 25 60 55 40 15 15 55', ['w_fire'], 'Stratège glacial, entièrement dévoué à Ike.'],
      ['Oscar', 'cavalier', 1, 3, 'h', '70 45 10 45 45 30 25 15', ['w_iron_lance'], 'Lancier des mercenaires, frère aîné de Boyd et Rolf.'],
      ['Boyd', 'fighter', 2, 3, 'h', '90 60 0 45 40 30 25 10', ['w_iron_axe'], 'Combattant impulsif, frère d\'Oscar.'],
      ['Rhys', 'cleric', 4, 3, 'h', '40 10 50 40 40 35 10 55', ['w_heal'], 'Prêtre de la compagnie, de santé fragile.'],
      ['Shinon', 'fe_sniper', 1, 4, 'h', '75 50 0 60 45 25 20 15', ['w_iron_bow'], 'Archer d\'élite cynique, ancien des Mercenaires de Greil.'],
      ['Gatrie', 'knight', 6, 3, 'h', '90 50 0 35 30 30 50 10', ['w_iron_lance'], 'Chevalier en armure au cœur d\'artichaut.'],
      ['Mia', 'fe_myrmidon', 6, 4, 'f', '50 40 15 50 55 45 20 30', ['w_iron_sword'], 'Épéiste joyeuse en quête de sa rivale.'],
      ['Elincia', 'fe_falcon', 1, 5, 'f', '45 30 50 40 55 60 20 55', ['w_iron_sword', 'w_heal'], 'Princesse de Crimea, cachée pendant la guerre.'],
      ['Jill', 'fe_wyvern', 6, 4, 'f', '80 50 5 50 45 40 35 15', ['w_iron_axe'], 'Chevalière wyverne de Daein, fille de Shiharam.']
    ] },
    { id: 'fe10', series: 'Fire Emblem 10', title: 'Fire Emblem : Radiant Dawn', focus: 1, characters: [
      ['Micaiah', 'fe_monk', 1, 5, 'f', '40 5 80 40 40 90 10 60', ['w_lightning'], 'La « Vierge de l\'aube », voyante de la Brigade de l\'aube.'],
      ['Sothe', 'thief', 1, 4, 'h', '75 40 0 55 65 50 20 30', ['w_iron_sword'], 'Voleur protecteur de Micaiah.'],
      ['Edward', 'fe_myrmidon', 1, 3, 'h', '65 40 0 50 55 45 20 20', ['w_iron_sword'], 'Épéiste de la Brigade de l\'aube, toujours affamé.'],
      ['Nolan', 'fighter', 8, 3, 'h', '80 50 0 45 40 35 30 15', ['w_iron_axe'], 'Aîné de la Brigade de l\'aube, calme et protecteur.'],
      ['Leonardo', 'archer', 1, 3, 'h', '55 40 0 60 45 35 20 30', ['w_iron_bow'], 'Archer sérieux de la Brigade de l\'aube.'],
      ['Zihark', 'fe_myrmidon', 8, 4, 'h', '70 40 0 50 60 30 20 25', ['w_killing_edge'], 'Épéiste qui défend les laguz.'],
      ['Tormod', 'mage', 3, 3, 'h', '50 10 60 45 50 40 15 35', ['w_fire'], 'Jeune mage impétueux, libérateur des laguz.'],
      ['Haar', 'fe_wyvern_lord', 1, 4, 'h', '80 45 0 40 35 25 45 10', ['w_iron_axe'], 'Seigneur wyverne qui dort même en plein combat.'],
      ['Sanaki', 'mage', 1, 5, 'f', '30 5 70 45 50 40 10 70', ['w_fire'], 'Impératrice de Begnion, enfant au pouvoir immense.'],
      ['Nephenee', 'soldier', 9, 3, 'f', '65 40 10 50 50 30 30 30', ['w_iron_lance'], 'Soldate de Crimea, timide de son accent.'],
      ['Lucia', 'fe_swordmaster', 5, 4, 'f', '50 40 15 50 50 40 20 30', ['w_killing_edge'], 'Sœur de lait d\'Elincia, épéiste de la garde royale.'],
      ['Pelleas', 'fe_shaman', 1, 3, 'h', '55 10 55 40 35 25 25 45', ['w_flux'], 'Shaman qui se croit fils du roi fou de Daein.']
    ] },
    { id: 'fe13', series: 'Fire Emblem 13', title: 'Fire Emblem Awakening', focus: 2, characters: [
      ['Chrom', 'fe_lord', 1, 5, 'h', '85 60 10 60 55 60 45 20', ['w_iron_sword'], 'Prince d\'Ylisse, chef des Bergers.'],
      ['Lucina', 'fe_lord', 1, 5, 'f', '80 50 10 65 60 70 35 25', ['w_iron_sword'], 'Fille de Chrom venue d\'un futur condamné.'],
      ['Robin', 'fe_tactician', 1, 5, 'h', '40 40 40 40 40 40 40 40', ['w_iron_sword', 'w_fire'], 'Tacticien amnésique des Bergers.'],
      ['Frederick', 'great_knight', 1, 3, 'h', '20 15 0 15 10 15 20 5', ['w_iron_lance', 'w_iron_axe'], 'Chevalier dévoué, ramasse les cailloux sur le chemin de Chrom.'],
      ['Lissa', 'cleric', 1, 3, 'f', '45 30 60 25 45 60 20 40', ['w_heal'], 'Petite sœur de Chrom, prêtresse farceuse.'],
      ['Sully', 'cavalier', 1, 3, 'f', '70 40 25 50 55 45 35 30', ['w_iron_sword', 'w_iron_lance'], 'Chevalière fougueuse, rivale de Stahl.'],
      ['Virion', 'archer', 1, 3, 'h', '60 50 25 55 35 30 35 25', ['w_iron_bow'], 'Archer et noble poète autoproclamé.'],
      ['Stahl', 'cavalier', 1, 3, 'h', '90 45 5 45 30 30 35 20', ['w_iron_sword', 'w_iron_lance'], 'Chevalier affable, toujours un en-cas à la main.'],
      ['Vaike', 'fighter', 1, 3, 'h', '80 50 5 45 50 25 35 10', ['w_iron_axe'], 'Le « Vaike », qui se proclame rival de Chrom.'],
      ['Miriel', 'mage', 1, 3, 'f', '50 10 55 40 45 25 15 45', ['w_fire'], 'Mage scientifique qui explique tout.'],
      ['Sumia', 'pegasus', 1, 3, 'f', '50 30 15 50 55 40 10 35', ['w_iron_lance'], 'Chevalière pégase maladroite… sauf dans les airs.'],
      ['Cordelia', 'pegasus', 1, 4, 'f', '75 45 15 55 50 35 25 30', ['w_iron_lance'], 'Prodige des chevaliers pégases d\'Ylisse.'],
      ["Lon'qu", 'fe_myrmidon', 1, 4, 'h', '70 45 10 55 60 45 30 15', ['w_iron_sword'], 'Épéiste de Regna Ferox, terrifié par les femmes.'],
      ['Tharja', 'fe_shaman', 1, 4, 'f', '70 25 50 45 40 35 35 35', ['w_flux'], 'Sorcière ténébreuse obsédée par Robin.'],
      ['Olivia', 'fe_dancer', 1, 4, 'f', '65 45 15 50 70 45 25 20', [], 'Danseuse timide de Regna Ferox.']
    ] },
    { id: 'fe14', series: 'Fire Emblem 14', title: 'Fire Emblem Fates', focus: 2, characters: [
      ['Corrin', 'fe_lord', 1, 5, 'h', '45 45 30 40 45 45 35 25', ['w_iron_sword'], 'Prince élevé à Nohr, né à Hoshido, tiraillé entre deux familles.'],
      ['Azura', 'fe_dancer', 1, 5, 'f', '25 50 25 60 60 40 15 35', [], 'Chanteuse mystérieuse aux chants qui ravivent les alliés.'],
      ['Ryoma', 'fe_swordmaster', 4, 5, 'h', '50 45 0 50 45 40 35 25', ['w_killing_edge'], 'Prince héritier de Hoshido, maître du sabre Raijinto.'],
      ['Xander', 'paladin', 4, 5, 'h', '45 50 5 40 35 60 40 15', ['w_steel_sword', 'w_iron_lance'], 'Prince héritier de Nohr, chevalier de la Siegfried.'],
      ['Hinoka', 'pegasus', 8, 4, 'f', '45 45 15 40 45 40 35 40', ['w_iron_lance'], 'Princesse de Hoshido, cheffe des chevaliers célestes.'],
      ['Camilla', 'fe_wyvern', 10, 5, 'f', '40 50 25 50 55 25 35 45', ['w_iron_axe'], 'Princesse de Nohr, sœur protectrice et redoutable.'],
      ['Takumi', 'archer', 8, 4, 'h', '50 35 0 60 40 45 35 20', ['w_iron_bow'], 'Prince de Hoshido, archer du Fujin Yumi.'],
      ['Leo', 'fe_dark_knight', 2, 4, 'h', '45 25 55 35 45 45 30 45', ['w_flux', 'w_iron_sword'], 'Prince de Nohr, mage stratège et fier.'],
      ['Elise', 'fe_troubadour', 5, 4, 'f', '30 5 65 25 55 70 15 40', ['w_heal'], 'Benjamine de Nohr, adorée par tous ses frères.'],
      ['Sakura', 'cleric', 1, 3, 'f', '45 30 50 40 40 55 30 20', ['w_heal'], 'Princesse timide de Hoshido, prêtresse.'],
      ['Kaze', 'thief', 1, 3, 'h', '55 40 0 45 65 20 20 35', ['w_iron_sword'], 'Ninja loyal envers Corrin.'],
      ['Silas', 'cavalier', 6, 3, 'h', '40 45 5 50 40 40 40 25', ['w_iron_sword', 'w_iron_lance'], 'Ami d\'enfance de Corrin, chevalier de Nohr.']
    ] },
    { id: 'fe16', series: 'Fire Emblem 16', title: 'Fire Emblem : Three Houses', focus: 4, characters: [
      ['Byleth', 'mercenary', 1, 5, 'h', '45 45 35 45 45 45 35 30', ['w_iron_sword'], 'Mercenaire devenu professeur au monastère de Garreg Mach.'],
      ['Edelgard', 'fe_axe_lord', 1, 5, 'f', '40 55 45 45 40 30 35 35', ['w_iron_axe'], 'Héritière de l\'Empire d\'Adrestia, déléguée des Aigles de Jais.'],
      ['Dimitri', 'fe_lance_lord', 1, 5, 'h', '55 60 20 50 50 25 40 20', ['w_iron_lance'], 'Héritier du Royaume de Faerghus, délégué des Lions de Saphir.'],
      ['Claude', 'fe_bow_lord', 1, 5, 'h', '35 40 25 60 55 45 30 25', ['w_iron_bow'], 'Héritier de l\'Alliance de Leicester, délégué des Cerfs d\'Or.'],
      ['Hubert', 'fe_shaman', 1, 4, 'h', '35 30 55 45 45 35 25 40', ['w_flux'], 'Serviteur d\'Edelgard, à l\'ombre de l\'Empire.'],
      ['Dorothea', 'mage', 1, 3, 'f', '40 15 60 45 40 35 15 40', ['w_fire'], 'Ancienne diva de l\'opéra, mage talentueuse.'],
      ['Petra', 'fe_wyvern', 1, 4, 'f', '45 40 25 50 60 45 30 15', ['w_iron_axe'], 'Princesse de Brigid, otage fière de l\'Empire.'],
      ['Felix', 'fe_myrmidon', 1, 4, 'h', '45 55 30 45 55 40 30 20', ['w_iron_sword'], 'Épéiste obsédé par l\'entraînement, ami d\'enfance de Dimitri.'],
      ['Ashe', 'archer', 1, 3, 'h', '35 35 25 55 50 40 30 25', ['w_iron_bow'], 'Archer au cœur pur, fils adoptif de Lonato.'],
      ['Sylvain', 'cavalier', 1, 3, 'h', '55 45 30 35 45 30 35 25', ['w_iron_lance'], 'Héritier de Gautier, charmeur incorrigible.'],
      ['Mercedes', 'cleric', 1, 3, 'f', '30 25 50 45 40 30 25 45', ['w_heal'], 'Douce prêtresse, amie d\'Annette.'],
      ['Ingrid', 'pegasus', 1, 3, 'f', '40 35 35 40 60 45 30 40', ['w_iron_lance'], 'Chevalière pégase idéaliste de Faerghus.'],
      ['Lysithea', 'fe_shaman', 1, 4, 'f', '20 15 60 60 50 15 15 30', ['w_flux'], 'Prodige de la magie, pressée par le temps.'],
      ['Hilda', 'fighter', 1, 3, 'f', '50 45 25 30 50 35 35 20', ['w_iron_axe'], 'Héritière de Goneril, experte pour faire travailler les autres.']
    ] },
    { id: 'fe17', series: 'Fire Emblem 17', title: 'Fire Emblem Engage', focus: 1, characters: [
      ['Alear', 'fe_lord', 1, 5, 'h', '60 45 15 50 45 50 30 30', ['w_iron_sword'], 'Le Dragon Divin, réveillé après mille ans de sommeil.'],
      ['Vander', 'paladin', 1, 3, 'h', '60 30 15 35 25 30 30 20', ['w_iron_sword', 'w_iron_lance'], 'Garde fidèle d\'Alear, chevalier aguerri.'],
      ['Clanne', 'mage', 1, 3, 'h', '50 10 45 50 50 35 20 35', ['w_fire'], 'Mage sérieux, frère jumeau de Framme.'],
      ['Framme', 'fe_monk', 1, 3, 'f', '45 30 40 40 45 40 20 40', ['w_lightning'], 'Moine combattante au poing redoutable.'],
      ['Alfred', 'cavalier', 1, 4, 'h', '65 50 10 45 40 40 35 15', ['w_iron_lance'], 'Prince de Firene, à la santé fragile et à l\'entraînement acharné.'],
      ['Céline', 'mage', 1, 4, 'f', '50 35 45 45 40 40 25 40', ['w_fire'], 'Princesse de Firene, élégante et capable.'],
      ['Chloé', 'pegasus', 1, 4, 'f', '50 35 20 45 55 45 25 40', ['w_iron_lance'], 'Chevalière pégase rêveuse, amatrice de contes.'],
      ['Louis', 'knight', 1, 3, 'h', '70 50 5 35 20 30 50 25', ['w_iron_lance'], 'Chevalier en armure, doux comme un agneau.'],
      ['Diamant', 'hero', 1, 4, 'h', '60 50 10 45 35 40 40 20', ['w_steel_sword', 'w_iron_axe'], 'Prince de Brodia, guerrier honnête.'],
      ['Ivy', 'fe_wyvern', 1, 4, 'f', '50 30 50 40 35 30 30 40', ['w_iron_axe'], 'Princesse d\'Elusia, cavalière wyverne mélancolique.'],
      ['Timerra', 'mercenary', 1, 4, 'f', '50 40 15 50 60 45 25 25', ['w_iron_sword'], 'Princesse de Solm, au rire communicatif.'],
      ['Yunaka', 'thief', 1, 3, 'f', '45 30 15 50 65 50 20 30', ['w_iron_sword'], 'Ancienne espionne au double visage.'],
      ['Veyle', 'fe_shaman', 1, 5, 'f', '45 20 55 45 50 40 20 45', ['w_flux'], 'Sœur d\'Alear, dragon corrompu au cœur tendre.']
    ] }
  ];

  const GENDER = { h: 'homme', f: 'femme' };
  const STATS = ['hp', 'str', 'mag', 'skl', 'spd', 'lck', 'def', 'res'];
  const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  // Personnages du pack qui ont des ressources dans le projet (fournies avec les ressources de base)
  const RP = 'ressources/personnages/';
  const art = (who, cls) => ({ folder: who, portrait: RP + who + '/portrait.png', battler: RP + who + '/combat', mapSprite: RP + who + '/map_' + cls });
  const ART = {
    'fe7:Eliwood': art('Eliwood', 'Lord'),
    'fe7:Lyn': art('Lyn', 'Lord'),
    'fe7:Hector': art('Hector', 'Lord')
  };
  const artOf = (game, name) => ART[game.id + ':' + name] || null;
  /** Dossiers de ressources (ressources/personnages/<dossier>) utilisés par les jeux choisis. */
  function artFolders(gameIds) {
    const out = [];
    for (const game of GAMES.filter(g => gameIds.includes(g.id))) for (const row of game.characters) { const a = artOf(game, row[0]); if (a && !out.includes(a.folder)) out.push(a.folder); }
    return out;
  }
  /** Pose les ressources du pack sur une unité, champ par champ, seulement s'il est vide et si la ressource existe.
   *  Le sprite de map n'est posé que si la classe n'en a pas : sinon la promotion ne changerait plus le sprite. */
  function applyArt(unit, a, has, cls) {
    let n = 0;
    if (!a) return 0;
    for (const key of ['portrait', 'battler', 'mapSprite']) {
      if (unit[key] || (has && !has(key, a[key]))) continue;
      if (key === 'mapSprite' && cls && cls.mapSprite) continue;
      if (key === 'battler' && cls && cls.battler === a.battler) continue;
      unit[key] = a[key]; n++;
    }
    return n;
  }

  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  /** Toutes les classes que le pack peut ajouter (celles du pack + classes de base utilisées). */
  function classCatalogue() {
    const base = Defaults.classes();
    return CLASSES.map(c => JSON.parse(JSON.stringify(c))).concat(base.filter(c => !CLASSES.some(p => p.id === c.id)));
  }

  /** Fiche d'unité d'un personnage du pack. Stats : moyenne de la classe au niveau, plus la personnalité des croissances. */
  function unitOf(game, row, cls) {
    const [name, classId, level, rarity, gender, growthText, inventory, bio] = row;
    const g = growthText.split(/\s+/).map(Number), growths = {};
    STATS.forEach((s, i) => { growths[s] = g[i] || 0; });
    const stats = cls ? Rules.statsFromClass(cls, level) : {};
    for (const s of STATS) {
      const classGrowth = (cls && cls.growths && cls.growths[s]) || 0;
      const bias = Math.max(-3, Math.min(3, Math.round((growths[s] - classGrowth) / 15))); // personnalité : ±3 au plus
      stats[s] = Math.max(s === 'hp' ? 10 : 0, (stats[s] || 0) + bias);
    }
    return {
      id: `fe_${game.id}_${slug(name)}`, name, series: game.series, rarity, classId, level, isLord: false, color: '',
      gender: GENDER[gender] || '', protagonist: false, ending: '', bio, convoy: false,
      stats, growths, inventory: inventory.map(id => ({ id })), portrait: '', mapSprite: '', battler: '', movBonus: 0,
      personalSkill: '', learnedSkills: [], equippedSkills: [], skillLearning: [], fromPack: game.id
    };
  }

  /** Personnages d'un jeu déjà présents dans la base (même nom et même série, sans tenir compte des accents). */
  function existing(db, game, name) {
    return (db.units || []).find(u => fold(u.name) === fold(name) && fold(u.series) === fold(game.series)) || null;
  }

  /** Aperçu pour la fenêtre d'import : [{ id, title, series, total, already }]. */
  function summary(db) {
    return GAMES.map(game => ({ id: game.id, title: game.title, series: game.series, total: game.characters.length,
      already: game.characters.filter(row => existing(db, game, row[0])).length }));
  }

  /**
   * Installe les jeux choisis : classes manquantes, personnages absents, une bannière par jeu.
   * opts.has(champ, clé) : la ressource existe-t-elle dans le projet ? (sans has : supposée présente)
   * Renvoie { units, classes, banners, art } (nombres ajoutés ; art = images reliées).
   */
  function install(db, gameIds, opts) {
    const has = opts && opts.has;
    const out = { units: 0, classes: 0, banners: 0, art: 0 };
    const catalogue = classCatalogue();
    db.classes = db.classes || []; db.units = db.units || []; db.banners = db.banners || [];
    const ensureClass = (id) => {
      let c = db.classes.find(x => x.id === id);
      if (c) return c;
      c = catalogue.find(x => x.id === id);
      if (!c) return null;
      c = JSON.parse(JSON.stringify(c));
      c.promotions = (c.promotions || []).filter(p => db.classes.some(x => x.id === p.classId)); // seulement vers des classes présentes
      db.classes.push(c); out.classes++;
      return c;
    };
    for (const game of GAMES.filter(g => gameIds.includes(g.id))) {
      const ids = [];
      for (const row of game.characters) {
        const found = existing(db, game, row[0]);
        if (found) { out.art += applyArt(found, artOf(game, row[0]), has, db.classes.find(c => c.id === found.classId)); ids.push(found.id); continue; }
        const cls = ensureClass(row[1]);
        const unit = unitOf(game, row, cls);
        unit.inventory = unit.inventory.filter(s => (db.weapons || []).some(w => w.id === s.id) || (db.items || []).some(i => i.id === s.id));
        if (!unit.inventory.length && cls && cls.defaultInventory) unit.inventory = cls.defaultInventory.filter(id => (db.weapons || []).some(w => w.id === id)).map(id => ({ id }));
        out.art += applyArt(unit, artOf(game, row[0]), has, cls);
        db.units.push(unit); ids.push(unit.id); out.units++;
      }
      const bannerId = 'bn_' + game.id;
      if (!db.banners.some(b => b.id === bannerId)) {
        db.banners.push({ id: bannerId, name: game.title, description: `Personnages de ${game.title}.`,
          pool: ids.slice(), focus: ids.slice(0, game.focus || 1), rates: { 5: 6, 4: 58, 3: 36 }, focusShare: 50,
          unlock: { after: '', alive: [], from: '', to: '' } });
        out.banners++;
      }
    }
    // promotions entre classes du pack (si les deux classes sont dans la base)
    for (const [a, b] of PROMOTIONS) {
      const from = db.classes.find(c => c.id === a), to = db.classes.find(c => c.id === b);
      if (!from || !to || (from.promotions || []).some(p => p.classId === b)) continue;
      (from.promotions || (from.promotions = [])).push({ classId: b, minLevel: 10, itemId: (db.items || []).some(i => i.id === 'i_master_seal') ? 'i_master_seal' : '', resetLevel: true,
        bonuses: { hp: 3, str: 2, mag: 2, skl: 2, spd: 2, lck: 0, def: 2, res: 2, mov: 1 }, skills: [] });
    }
    return out;
  }

  const total = () => GAMES.reduce((n, g) => n + g.characters.length, 0);
  return { CLASSES, GAMES, PROMOTIONS, ART, artOf, artFolders, classCatalogue, unitOf, summary, install, total };
});
