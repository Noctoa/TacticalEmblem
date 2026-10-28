/*
 * Pack « Armes, objets et compétences de la série Fire Emblem » : fiches (stats, prix, effets). Les armes et objets reçoivent
 * l'icône de la planche img/items qui porte leur nom (armory-icons.js), sinon celle de leur type.
 * Les valeurs sont celles de l'ère GBA / Tellius quand elles existent, arrondies au moteur de Tactical Emblem.
 * Les effets que le moteur ne gère pas sont simplifiés (expliqué dans la description des compétences).
 *
 * install(db, ['swords', 'skills', ...]) ajoute les fiches absentes (même nom = déjà là, sans tenir compte
 * des accents ni des majuscules) et renvoie { weapons, items, skills } (nombres ajoutés).
 */
(function (root, factory) {
  const common = typeof module !== 'undefined' && module.exports;
  const api = factory(common ? require('./skills.js') : root.Skills, common ? require('./armory-icons.js') : root.ArmoryIcons);
  if (common) module.exports = api; else root.FEArsenal = api;
})(typeof self !== 'undefined' ? self : this, function (Skills, ArmoryIcons) {
  'use strict';
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const slug = (s) => fold(s).replace(/ /g, '_');

  // ------------------------------------------------------------------
  // Armes : [nom, type, puissance, précision, critique, poids, portée min, portée max, utilisations (0 = incassable), prix, options]
  // options : effective (types de déplacement : horse, armor, flier, foot), brave (frappe deux fois), magic (dégâts magiques),
  //           drain (soigne des dégâts infligés), heal (bâton : PV rendus)
  // ------------------------------------------------------------------
  const W = (name, type, might, hit, crit, weight, minRange, maxRange, uses, price, opts) => Object.assign(
    { name, type, might, hit, crit, weight, minRange, maxRange, uses, price, effective: [], heal: 0 }, opts || {});
  const WEAPON_GROUPS = [
    { id: 'swords', name: 'Épées', list: [
      W('Épée de bronze', 'sword', 3, 100, 0, 3, 1, 1, 50, 350),
      W('Épée de fer', 'sword', 5, 90, 0, 5, 1, 1, 46, 460),
      W('Épée fine', 'sword', 3, 100, 5, 2, 1, 1, 30, 480),
      W('Épée d\'acier', 'sword', 8, 75, 0, 10, 1, 1, 30, 600),
      W('Épée d\'argent', 'sword', 13, 80, 0, 8, 1, 1, 20, 1500),
      W('Lame tueuse', 'sword', 9, 75, 30, 7, 1, 1, 20, 1300),
      W('Épée brave', 'sword', 9, 75, 0, 12, 1, 1, 30, 3000, { brave: true }),
      W('Estoc anti-armure', 'sword', 8, 80, 0, 11, 1, 1, 18, 1260, { effective: ['armor'] }),
      W('Tueuse de cheval', 'sword', 7, 80, 0, 9, 1, 1, 18, 1300, { effective: ['horse'] }),
      W('Lame du tonnerre', 'sword', 10, 70, 0, 9, 1, 2, 25, 1500, { magic: true }),
      W('Lame du vent', 'sword', 9, 70, 0, 9, 1, 2, 40, 0, { magic: true, effective: ['flier'] }),
      W('Lame de feu', 'sword', 11, 70, 0, 9, 1, 2, 30, 0, { magic: true }),
      W('Lame runique', 'sword', 12, 65, 0, 11, 1, 2, 15, 0, { magic: true, drain: true }),
      W('Épée courte', 'sword', 6, 85, 5, 4, 1, 1, 40, 500),
      W('Wo Dao', 'sword', 8, 75, 35, 5, 1, 1, 20, 1200)
    ] },
    { id: 'lances', name: 'Lances', list: [
      W('Lance de bronze', 'lance', 3, 90, 0, 6, 1, 1, 50, 280),
      W('Lance de fer', 'lance', 7, 80, 0, 8, 1, 1, 45, 360),
      W('Lance fine', 'lance', 4, 85, 5, 4, 1, 1, 30, 450),
      W('Lance d\'acier', 'lance', 10, 70, 0, 13, 1, 1, 30, 480),
      W('Lance d\'argent', 'lance', 14, 75, 0, 10, 1, 1, 20, 1200),
      W('Lance tueuse', 'lance', 10, 70, 30, 9, 1, 1, 20, 1300),
      W('Lance brave', 'lance', 10, 70, 0, 14, 1, 1, 30, 7500, { brave: true }),
      W('Javelot', 'lance', 6, 65, 0, 11, 1, 2, 20, 400),
      W('Lance courte', 'lance', 9, 60, 0, 12, 1, 2, 18, 900),
      W('Épieu', 'lance', 12, 70, 5, 10, 1, 2, 15, 0),
      W('Lance anti-cheval', 'lance', 7, 70, 0, 13, 1, 1, 16, 1040, { effective: ['horse'] }),
      W('Lance de feu', 'lance', 11, 70, 0, 10, 1, 2, 30, 0, { magic: true })
    ] },
    { id: 'axes', name: 'Haches', list: [
      W('Hache de bronze', 'axe', 4, 75, 0, 8, 1, 1, 50, 270),
      W('Hache de fer', 'axe', 8, 75, 0, 10, 1, 1, 45, 270),
      W('Hache d\'acier', 'axe', 11, 65, 0, 15, 1, 1, 30, 360),
      W('Hache d\'argent', 'axe', 15, 70, 0, 12, 1, 1, 20, 1000),
      W('Hache tueuse', 'axe', 11, 65, 30, 11, 1, 1, 20, 1250),
      W('Hache brave', 'axe', 10, 65, 0, 16, 1, 1, 30, 2250, { brave: true }),
      W('Hachette', 'axe', 7, 60, 0, 12, 1, 2, 20, 300),
      W('Tomahawk', 'axe', 13, 65, 0, 14, 1, 2, 15, 3000),
      W('Marteau', 'axe', 10, 55, 0, 15, 1, 1, 20, 800, { effective: ['armor'] }),
      W('Hallebarde', 'axe', 10, 60, 0, 15, 1, 1, 20, 1000, { effective: ['horse'] }),
      W('Hache-éclair', 'axe', 14, 60, 5, 14, 1, 2, 30, 0, { magic: true }),
      W('Hache du bûcheron', 'axe', 6, 80, 0, 7, 1, 1, 40, 300)
    ] },
    { id: 'bows', name: 'Arcs', list: [
      W('Arc de bronze', 'bow', 4, 90, 0, 5, 2, 2, 50, 300),
      W('Arc de fer', 'bow', 6, 85, 0, 5, 2, 2, 45, 540),
      W('Arc court', 'bow', 5, 85, 10, 3, 2, 2, 22, 760),
      W('Arc d\'acier', 'bow', 9, 70, 0, 9, 2, 2, 30, 720),
      W('Arc d\'argent', 'bow', 13, 75, 0, 6, 2, 2, 20, 1600),
      W('Arc tueur', 'bow', 9, 75, 30, 7, 2, 2, 20, 1400),
      W('Arc brave', 'bow', 10, 70, 0, 12, 2, 2, 30, 7500, { brave: true }),
      W('Arc long', 'bow', 5, 65, 0, 10, 2, 3, 20, 2000),
      W('Baliste', 'bow', 8, 60, 0, 20, 3, 10, 5, 0)
    ] },
    { id: 'anima', name: 'Magie anima', list: [
      W('Feu', 'anima', 5, 90, 0, 4, 1, 2, 40, 560),
      W('Tonnerre', 'anima', 8, 80, 5, 6, 1, 2, 35, 700),
      W('Vent', 'anima', 4, 100, 0, 2, 1, 2, 40, 600, { effective: ['flier'] }),
      W('Elfeu', 'anima', 10, 85, 0, 10, 1, 2, 30, 1200),
      W('Bolganone', 'anima', 12, 80, 0, 12, 1, 2, 20, 2500),
      W('Fimbulvetr', 'anima', 13, 80, 0, 12, 1, 2, 20, 6000),
      W('Excalibur', 'anima', 13, 90, 10, 13, 1, 2, 25, 0, { effective: ['flier'] }),
      W('Météore', 'anima', 11, 60, 0, 12, 3, 10, 5, 0)
    ] },
    { id: 'light', name: 'Magie de lumière', list: [
      W('Éclair', 'light', 4, 95, 5, 6, 1, 2, 35, 630),
      W('Lueur', 'light', 6, 90, 8, 8, 1, 2, 30, 900),
      W('Divine', 'light', 8, 85, 10, 12, 1, 2, 25, 2500),
      W('Purge', 'light', 10, 75, 5, 20, 3, 10, 5, 0),
      W('Aura', 'light', 15, 85, 5, 12, 1, 2, 20, 0),
      W('Nosferatu', 'light', 10, 70, 0, 14, 1, 2, 20, 3200, { drain: true })
    ] },
    { id: 'dark', name: 'Magie noire', list: [
      W('Flux', 'dark', 7, 80, 0, 8, 1, 2, 45, 900),
      W('Luna', 'dark', 0, 95, 20, 12, 1, 2, 35, 0),
      W('Fenrir', 'dark', 15, 70, 0, 18, 1, 2, 20, 0),
      W('Éclipse', 'dark', 12, 30, 0, 12, 3, 10, 5, 0),
      W('Miasme', 'dark', 9, 75, 0, 10, 1, 2, 30, 1600)
    ] },
    { id: 'staves', name: 'Bâtons', list: [
      W('Soin', 'staff', 0, 100, 0, 2, 1, 1, 30, 600, { heal: 10 }),
      W('Guérison', 'staff', 0, 100, 0, 4, 1, 1, 20, 1000, { heal: 20 }),
      W('Récupération', 'staff', 0, 100, 0, 6, 1, 1, 15, 2250, { heal: 99 }),
      W('Physique', 'staff', 0, 100, 0, 6, 1, 5, 15, 3750, { heal: 10 }),
      W('Rétablissement', 'staff', 0, 100, 0, 8, 1, 3, 10, 0, { heal: 30 })
    ] },
    { id: 'legendary', name: 'Armes légendaires', list: [
      W('Falchion', 'sword', 16, 90, 10, 5, 1, 1, 0, 0, { effective: ['flier'] }),
      W('Durandal', 'sword', 17, 90, 0, 16, 1, 1, 0, 0),
      W('Sol Katti', 'sword', 12, 95, 25, 14, 1, 1, 0, 0, { effective: ['armor', 'horse'] }),
      W('Mani Katti', 'sword', 8, 80, 20, 3, 1, 1, 0, 0, { effective: ['armor', 'horse'] }),
      W('Ragnell', 'sword', 18, 80, 5, 20, 1, 2, 0, 0, { magic: true }),
      W('Tyrfing', 'sword', 17, 90, 10, 8, 1, 1, 0, 0),
      W('Balmung', 'sword', 15, 100, 50, 8, 1, 1, 0, 0),
      W('Sigrun', 'sword', 14, 85, 5, 7, 1, 1, 0, 0),
      W('Épée du Créateur', 'sword', 12, 85, 10, 10, 1, 2, 0, 0, { magic: true }),
      W('Raijinto', 'sword', 16, 85, 5, 8, 1, 2, 0, 0, { magic: true }),
      W('Siegfried', 'sword', 15, 85, 5, 10, 1, 2, 0, 0, { magic: true }),
      W('Gungnir', 'lance', 16, 70, 5, 16, 1, 1, 0, 0),
      W('Gáe Bolg', 'lance', 18, 80, 0, 14, 1, 1, 0, 0),
      W('Siegmund', 'lance', 17, 85, 5, 15, 1, 1, 0, 0),
      W('Vidofnir', 'lance', 16, 85, 10, 15, 1, 1, 0, 0),
      W('Lance de Lúin', 'lance', 15, 80, 5, 12, 1, 2, 0, 0),
      W('Armads', 'axe', 18, 85, 0, 18, 1, 1, 0, 0),
      W('Garm', 'axe', 16, 85, 10, 15, 1, 1, 0, 0),
      W('Urvan', 'axe', 19, 80, 5, 18, 1, 1, 0, 0),
      W('Aymr', 'axe', 18, 75, 10, 16, 1, 1, 0, 0),
      W('Swanchika', 'axe', 15, 85, 10, 14, 1, 1, 0, 0),
      W('Parthia', 'bow', 14, 95, 5, 7, 2, 2, 0, 0, { effective: ['flier'] }),
      W('Mulagir', 'bow', 16, 85, 10, 10, 2, 2, 0, 0, { effective: ['flier'] }),
      W('Nidhogg', 'bow', 15, 85, 10, 11, 2, 2, 0, 0, { effective: ['flier'] }),
      W('Fujin Yumi', 'bow', 14, 90, 10, 6, 2, 2, 0, 0, { effective: ['flier'] }),
      W('Failnaught', 'bow', 16, 80, 10, 10, 2, 3, 0, 0, { effective: ['flier'] }),
      W('Forseti', 'anima', 15, 95, 10, 7, 1, 2, 0, 0),
      W('Mjöllnir', 'anima', 18, 90, 10, 10, 1, 2, 0, 0),
      W('Valflame', 'anima', 16, 80, 5, 12, 1, 2, 0, 0),
      W('Rexcalibur', 'anima', 14, 95, 15, 8, 1, 2, 0, 0, { effective: ['flier'] }),
      W('Naga', 'light', 17, 95, 10, 12, 1, 2, 0, 0),
      W('Rexaura', 'light', 16, 90, 5, 12, 1, 2, 0, 0),
      W('Gleipnir', 'dark', 18, 80, 10, 14, 1, 2, 0, 0),
      W('Apocalypse', 'dark', 20, 75, 10, 16, 1, 2, 0, 0),
      W('Thoron', 'anima', 14, 85, 10, 12, 1, 3, 0, 0)
    ] }
  ];

  // ------------------------------------------------------------------
  // Objets : [nom, effet, valeur, stat, utilisations, prix]
  // effets du moteur : heal (soin), boost (stat définitive), promotion (sceau), key (clé : keyType chest / door / both)
  // ------------------------------------------------------------------
  const I = (name, effect, amount, stat, uses, price, extra) => Object.assign({ name, effect, uses, price },
    effect === 'heal' || effect === 'boost' ? { amount, stat } : {}, extra || {});
  const ITEM_GROUPS = [
    { id: 'healing', name: 'Soins', list: [
      I('Potion', 'heal', 10, 'hp', 3, 300),
      I('Concoction', 'heal', 20, 'hp', 3, 600),
      I('Élixir', 'heal', 99, 'hp', 3, 3000),
      I('Remède', 'heal', 5, 'hp', 5, 150)
    ] },
    { id: 'boosters', name: 'Objets de stats', list: [
      I('Robe séraphique', 'boost', 7, 'hp', 1, 8000),
      I('Bague de force', 'boost', 2, 'str', 1, 8000),
      I('Poudre spirituelle', 'boost', 2, 'mag', 1, 8000),
      I('Livre secret', 'boost', 2, 'skl', 1, 8000),
      I('Aile vive', 'boost', 2, 'spd', 1, 8000),
      I('Icône de la déesse', 'boost', 2, 'lck', 1, 8000),
      I('Bouclier draconique', 'boost', 2, 'def', 1, 8000),
      I('Talisman', 'boost', 2, 'res', 1, 8000),
      I('Bottes', 'boost', 2, 'mov', 1, 8000)
    ] },
    { id: 'seals', name: 'Sceaux et emblèmes', list: [
      I('Sceau de promotion', 'promotion', 0, '', 1, 2500),
      I('Emblème du héros', 'promotion', 0, '', 1, 10000),
      I('Bouclier de chevalier', 'promotion', 0, '', 1, 10000),
      I('Guide céleste', 'promotion', 0, '', 1, 10000),
      I('Rouleau de la guilde', 'promotion', 0, '', 1, 10000),
      I('Sceau de l\'Arche', 'promotion', 0, '', 1, 20000)
    ] },
    { id: 'keys', name: 'Clés', list: [
      I('Clé de coffre', 'key', 0, '', 5, 300, { keyType: 'chest' }),
      I('Clé de porte', 'key', 0, '', 1, 100, { keyType: 'door' }),
      I('Passe-partout', 'key', 0, '', 15, 1200, { keyType: 'both' })
    ] }
  ];

  // ------------------------------------------------------------------
  // Compétences : [nom, symbole, effet du moteur, valeur, réglages, description]
  // Effets du moteur : hit, avoid, damage, guard, auraAvoid, renewal, luna, sol, vantage, miracle, lockpick.
  // ------------------------------------------------------------------
  const K = (name, icon, effect, amount, opts, description) => ({ name, icon, effect, amount, description,
    activation: 'always', chance: 0, phase: 'any', hpCondition: 'any', hpThreshold: 50, weaponType: '', adjacentAlly: false, range: 1, ...(opts || {}) });
  const SKL = { activation: 'skl' }, LCK = { activation: 'lck' };
  const SKILL_GROUPS = [
    { id: 'skills-proc', name: 'Déclenchements', list: [
      K('Luna', '☾', 'luna', 50, SKL, 'Taux = Technique %. Ignore la moitié de la Défense / Résistance ennemie.'),
      K('Sol', '☀', 'sol', 50, SKL, 'Taux = Technique %. Soigne la moitié des dégâts infligés.'),
      K('Lune céleste', '◐', 'luna', 100, { activation: 'fixed', chance: 15 }, '15 % : ignore toute la protection ennemie (version simplifiée de Lethality / Ignis).'),
      K('Miracle', '✚', 'miracle', 0, LCK, 'Taux = Chance %. Survit avec 1 PV à un coup mortel.'),
      K('Vantage', '⚡', 'vantage', 0, { hpCondition: 'below', hpThreshold: 50 }, 'Sous 50 % des PV : attaqué, le porteur frappe en premier.'),
      K('Renouveau', '♻', 'renewal', 10, {}, 'Récupère 10 % des PV au début de chaque tour.'),
      K('Crochetage', '🗝', 'lockpick', 0, {}, 'Ouvre coffres et portes sans clé.')
    ] },
    { id: 'skills-stats', name: 'Bonus permanents', list: [
      K('Précision +20', '◎', 'hit', 20, {}, 'Précision +20.'),
      K('Esquive +20', '≈', 'avoid', 20, {}, 'Esquive +20.'),
      K('Force +2', '✊', 'damage', 2, {}, 'Dégâts +2.'),
      K('Défense +2', '⛨', 'guard', 2, {}, 'Dégâts reçus −2.'),
      K('Vie ou mort', '☠', 'damage', 10, {}, 'Dégâts +10 (dans les jeux, le porteur en reçoit aussi davantage).'),
      K('Espace vital', '◇', 'damage', 3, {}, 'Dégâts +3 (simplifié : toujours actif).'),
      K('Agresseur', '⚔', 'damage', 10, { phase: 'initiate' }, 'Dégâts +10 quand le porteur attaque.')
    ] },
    { id: 'skills-blows', name: 'Coups et postures', list: [
      K('Coup mortel', '✸', 'damage', 6, { phase: 'initiate' }, 'En attaquant : dégâts +6.'),
      K('Coup éclair', '➹', 'avoid', 12, { phase: 'initiate' }, 'En attaquant : esquive +12 (Vitesse +6).'),
      K('Coup cuirassé', '⛨', 'guard', 4, { phase: 'initiate' }, 'En attaquant : dégâts reçus −4.'),
      K('Coup certain', '◎', 'hit', 40, { phase: 'initiate' }, 'En attaquant : précision +40.'),
      K('Coup du duelliste', '≈', 'avoid', 30, { phase: 'initiate' }, 'En attaquant : esquive +30.'),
      K('Prescience', '◎', 'hit', 15, { phase: 'initiate' }, 'En attaquant : précision +15.'),
      K('Posture solide', '⛨', 'guard', 3, { phase: 'defend' }, 'Attaqué : dégâts reçus −3.'),
      K('Patience', '≈', 'avoid', 10, { phase: 'defend' }, 'Attaqué : esquive +10.'),
      K('Riposte féroce', '✊', 'damage', 4, { phase: 'defend' }, 'Attaqué : dégâts +4.')
    ] },
    { id: 'skills-hp', name: 'Selon les PV', list: [
      K('Résolution', '❗', 'damage', 5, { hpCondition: 'below', hpThreshold: 50 }, 'Sous 50 % des PV : dégâts +5 (simplifié).'),
      K('Vengeance', '🔥', 'damage', 6, { hpCondition: 'below', hpThreshold: 50 }, 'Sous 50 % des PV : dégâts +6 (simplifié).'),
      K('Courroux', '⚡', 'hit', 20, { hpCondition: 'below', hpThreshold: 50 }, 'Sous 50 % des PV : précision +20 (le moteur n\'a pas de bonus de critique).'),
      K('Défiance', '≈', 'avoid', 30, { hpCondition: 'below', hpThreshold: 30 }, 'Sous 30 % des PV : esquive +30.'),
      K('Bravoure', '✊', 'damage', 3, { hpCondition: 'full' }, 'PV au maximum : dégâts +3.')
    ] },
    { id: 'skills-weapons', name: 'Maîtrises d\'armes', list: [
      K('Maîtrise de l\'épée', '⚔', 'damage', 5, { weaponType: 'sword' }, 'Avec une épée : dégâts +5.'),
      K('Maîtrise de la lance', '⚔', 'damage', 5, { weaponType: 'lance' }, 'Avec une lance : dégâts +5.'),
      K('Maîtrise de la hache', '⚔', 'damage', 5, { weaponType: 'axe' }, 'Avec une hache : dégâts +5.'),
      K('Maîtrise de l\'arc', '➹', 'damage', 5, { weaponType: 'bow' }, 'Avec un arc : dégâts +5.'),
      K('Maîtrise des tomes', '✦', 'damage', 5, { weaponType: 'anima' }, 'Avec un tome anima : dégâts +5.')
    ] },
    { id: 'skills-team', name: 'Soutien d\'équipe', list: [
      K('Charme', '♥', 'auraAvoid', 10, { range: 2 }, 'Alliés à 2 cases ou moins : esquive +10 (simplifié).'),
      K('Demoiselle', '♥', 'auraAvoid', 10, { range: 1 }, 'Alliés adjacents : esquive +10 (simplifié).'),
      K('Camaraderie', '♻', 'renewal', 10, { adjacentAlly: true }, 'Avec un allié adjacent : récupère 10 % des PV au début du tour.'),
      K('Duo', '⚔', 'damage', 3, { adjacentAlly: true }, 'Avec un allié adjacent : dégâts +3.'),
      K('Garde rapprochée', '⛨', 'guard', 3, { adjacentAlly: true }, 'Avec un allié adjacent : dégâts reçus −3.')
    ] }
  ];

  const GROUPS = [
    ...WEAPON_GROUPS.map(g => ({ ...g, kind: 'weapons' })),
    ...ITEM_GROUPS.map(g => ({ ...g, kind: 'items' })),
    ...SKILL_GROUPS.map(g => ({ ...g, kind: 'skills' }))
  ];
  const PREFIX = { weapons: 'w_fe_', items: 'i_fe_', skills: 'skill_fe_' };

  function listOf(db, kind) { return db[kind] || (db[kind] = []); }
  function existing(db, kind, name) { return listOf(db, kind).find(e => fold(e.name) === fold(name)) || null; }

  /** Aperçu pour la fenêtre d'import : [{ id, kind, name, total, already, sample }]. */
  function summary(db) {
    return GROUPS.map(g => ({ id: g.id, kind: g.kind, name: g.name, total: g.list.length,
      already: g.list.filter(e => existing(db, g.kind, e.name)).length, sample: g.list.slice(0, 4).map(e => e.name).join(', ') }));
  }

  /** Ajoute les fiches absentes des groupes choisis. */
  function install(db, groupIds) {
    const out = { weapons: 0, items: 0, skills: 0 };
    for (const g of GROUPS.filter(x => groupIds.includes(x.id))) {
      const list = listOf(db, g.kind);
      for (const e of g.list) {
        if (existing(db, g.kind, e.name)) continue;
        let id = PREFIX[g.kind] + slug(e.name), n = 2;
        while (list.some(x => x.id === id)) id = PREFIX[g.kind] + slug(e.name) + '_' + n++;
        const entry = Object.assign({ id }, JSON.parse(JSON.stringify(e)), { fromPack: 'fe' });
        if (g.kind !== 'skills' && entry.image === undefined && ArmoryIcons) { const im = ArmoryIcons.defaultImage(entry); if (im) entry.image = im; }
        list.push(entry); out[g.kind]++;
      }
    }
    return out;
  }

  const total = (kind) => GROUPS.filter(g => !kind || g.kind === kind).reduce((n, g) => n + g.list.length, 0);
  return { WEAPON_GROUPS, ITEM_GROUPS, SKILL_GROUPS, GROUPS, summary, install, total, fold };
});
