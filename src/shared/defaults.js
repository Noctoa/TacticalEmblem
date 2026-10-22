/*
 * Base de données par défaut + projet d'exemple ("Prologue — L'embuscade").
 */
(function (root, factory) {
  const node = typeof module !== 'undefined' && module.exports;
  const api = factory(node ? require('./skills.js') : root.Skills, node ? require('./promotions.js') : root.Promotions,
    node ? require('./animations.js') : root.Animations);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Defaults = api;
})(typeof self !== 'undefined' ? self : this, function (Skills, Promotions, Animations) {
  'use strict';

  const st = (hp, str, mag, skl, spd, lck, def, res) => ({ hp, str, mag, skl, spd, lck, def, res });
  const caps = st(60, 20, 20, 20, 20, 30, 20, 20);
  const T = (foot, horse, armor, flier) => ({ foot, horse, armor, flier });

  // fonds de combat de base (ressources/fonds-combat, décors de Fire Emblem 6) : un par terrain
  const BB = 'ressources/fonds-combat/';
  const BATTLEBACKS = {
    plain: 'fe6-plaine.png', road: 'fe6-plaine.png', bush: 'fe6-plaine.png', forest: 'fe6-foret.png', thicket: 'fe6-foret-ancienne.png',
    mountain: 'fe6-montagne.png', peak: 'fe6-montagne.png', water: 'fe6-mer.png', bridge: 'fe6-riviere.png', sand: 'fe6-desert.png',
    fort: 'fe6-fort.png', village: 'fe6-village.png', wall: 'fe6-rempart.png', floor: 'fe6-chateau.png', throne: 'fe6-salle-du-trone.png', gate: 'fe6-rempart.png'
  };
  /** Fond de combat par défaut d'un terrain de base ('' si aucun). */
  const battlebackOf = (id) => (BATTLEBACKS[id] ? BB + BATTLEBACKS[id] : '');
  function terrains() {
    return withBattlebacks([
      { id: 'plain', name: 'Plaine', avoid: 0, def: 0, heal: 0, color: '#9ccc65', cost: T(1, 1, 1, 1) },
      { id: 'forest', name: 'Forêt', avoid: 20, def: 1, heal: 0, color: '#2e7d32', cost: T(2, 3, 2, 1) },
      { id: 'bush', name: 'Buisson', avoid: 10, def: 0, heal: 0, color: '#66bb6a', cost: T(1, 2, 2, 1) },
      { id: 'thicket', name: 'Fourré', avoid: 40, def: 1, heal: 0, color: '#1b5e20', cost: T(3, 99, 99, 1) },
      { id: 'mountain', name: 'Montagne', avoid: 30, def: 2, heal: 0, color: '#8d6e63', cost: T(4, 99, 99, 1) },
      { id: 'peak', name: 'Pic', avoid: 40, def: 2, heal: 0, color: '#5d4037', cost: T(99, 99, 99, 1) },
      { id: 'water', name: 'Eau', avoid: 0, def: 0, heal: 0, color: '#1e88e5', cost: T(99, 99, 99, 1) },
      { id: 'road', name: 'Route', avoid: 0, def: 0, heal: 0, color: '#d7b77a', cost: T(1, 1, 1, 1) },
      { id: 'bridge', name: 'Pont', avoid: 0, def: 0, heal: 0, color: '#a1887f', cost: T(1, 1, 1, 1) },
      { id: 'sand', name: 'Sable', avoid: 5, def: 0, heal: 0, color: '#fff176', cost: T(2, 3, 3, 1) },
      { id: 'fort', name: 'Fort', avoid: 20, def: 2, heal: 20, color: '#90a4ae', cost: T(2, 2, 2, 1) },
      { id: 'village', name: 'Village', avoid: 10, def: 0, heal: 0, color: '#ef9a9a', cost: T(1, 1, 1, 1) },
      { id: 'wall', name: 'Mur', avoid: 0, def: 0, heal: 0, color: '#424242', cost: T(99, 99, 99, 99) },
      { id: 'floor', name: 'Sol', avoid: 0, def: 0, heal: 0, color: '#bcaaa4', cost: T(1, 1, 1, 1) },
      { id: 'throne', name: 'Trône', avoid: 30, def: 3, heal: 10, color: '#c62828', cost: T(1, 1, 1, 1) },
      { id: 'gate', name: 'Portail', avoid: 20, def: 3, heal: 10, color: '#6d4c41', cost: T(1, 1, 1, 1) }
    ]);
  }
  function withBattlebacks(list) { for (const t of list) t.battleback = battlebackOf(t.id); return list; }

  // prix en boutique (0 ou absent : ne se vend pas) ; la revente rapporte la moitié, au prorata des utilisations
  const PRICES = {
    w_iron_sword: 460, w_slim_sword: 480, w_rapier: 0, w_steel_sword: 600, w_killing_edge: 1300, w_wind_sword: 0,
    w_iron_lance: 360, w_javelin: 400, w_horseslayer: 1040, w_iron_axe: 270, w_hand_axe: 300, w_iron_bow: 540,
    w_fire: 560, w_lightning: 630, w_flux: 900, w_heal: 600, w_mend: 1000,
    i_vulnerary: 300, i_elixir: 3000, i_energy_ring: 8000, i_speedwing: 8000, i_master_seal: 2500, i_chest_key: 300, i_door_key: 100
  };
  const priced = (list) => list.map(e => Object.assign(e, { price: PRICES[e.id] || 0 }));

  function weapons() {
    return priced([
      { id: 'w_iron_sword', name: 'Épée de fer', type: 'sword', might: 5, hit: 90, crit: 0, weight: 5, minRange: 1, maxRange: 1, uses: 46, effective: [], heal: 0 },
      { id: 'w_slim_sword', name: 'Épée fine', type: 'sword', might: 3, hit: 100, crit: 5, weight: 2, minRange: 1, maxRange: 1, uses: 30, effective: [], heal: 0 },
      { id: 'w_rapier', name: 'Rapière', type: 'sword', might: 7, hit: 95, crit: 10, weight: 5, minRange: 1, maxRange: 1, uses: 40, effective: ['horse', 'armor'], heal: 0 },
      { id: 'w_steel_sword', name: "Épée d'acier", type: 'sword', might: 8, hit: 75, crit: 0, weight: 10, minRange: 1, maxRange: 1, uses: 30, effective: [], heal: 0 },
      { id: 'w_killing_edge', name: 'Lame tueuse', type: 'sword', might: 9, hit: 75, crit: 30, weight: 7, minRange: 1, maxRange: 1, uses: 20, effective: [], heal: 0 },
      { id: 'w_wind_sword', name: 'Lame du vent', type: 'sword', might: 9, hit: 75, crit: 5, weight: 9, minRange: 1, maxRange: 2, uses: 40, effective: [], heal: 0 },
      { id: 'w_iron_lance', name: 'Lance de fer', type: 'lance', might: 7, hit: 80, crit: 0, weight: 8, minRange: 1, maxRange: 1, uses: 45, effective: [], heal: 0 },
      { id: 'w_javelin', name: 'Javelot', type: 'lance', might: 6, hit: 65, crit: 0, weight: 11, minRange: 1, maxRange: 2, uses: 20, effective: [], heal: 0 },
      { id: 'w_horseslayer', name: 'Lance anti-cheval', type: 'lance', might: 7, hit: 70, crit: 0, weight: 13, minRange: 1, maxRange: 1, uses: 16, effective: ['horse'], heal: 0 },
      { id: 'w_iron_axe', name: 'Hache de fer', type: 'axe', might: 8, hit: 75, crit: 0, weight: 10, minRange: 1, maxRange: 1, uses: 45, effective: [], heal: 0 },
      { id: 'w_hand_axe', name: 'Hachette', type: 'axe', might: 7, hit: 60, crit: 0, weight: 12, minRange: 1, maxRange: 2, uses: 20, effective: [], heal: 0 },
      { id: 'w_iron_bow', name: 'Arc de fer', type: 'bow', might: 6, hit: 85, crit: 0, weight: 5, minRange: 2, maxRange: 2, uses: 45, effective: ['flier'], heal: 0 },
      { id: 'w_fire', name: 'Feu', type: 'anima', might: 5, hit: 90, crit: 0, weight: 4, minRange: 1, maxRange: 2, uses: 40, effective: [], heal: 0 },
      { id: 'w_lightning', name: 'Éclair', type: 'light', might: 4, hit: 95, crit: 5, weight: 6, minRange: 1, maxRange: 2, uses: 35, effective: [], heal: 0 },
      { id: 'w_flux', name: 'Flux', type: 'dark', might: 7, hit: 80, crit: 0, weight: 8, minRange: 1, maxRange: 2, uses: 45, effective: [], heal: 0 },
      { id: 'w_heal', name: 'Soin', type: 'staff', might: 0, hit: 100, crit: 0, weight: 2, minRange: 1, maxRange: 1, uses: 30, effective: [], heal: 10 },
      { id: 'w_mend', name: 'Guérison', type: 'staff', might: 0, hit: 100, crit: 0, weight: 4, minRange: 1, maxRange: 1, uses: 20, effective: [], heal: 20 }
    ]);
  }

  function items() {
    return priced([
      { id: 'i_vulnerary', name: 'Potion', effect: 'heal', amount: 10, stat: 'hp', uses: 3 },
      { id: 'i_elixir', name: 'Élixir', effect: 'heal', amount: 99, stat: 'hp', uses: 1 },
      { id: 'i_energy_ring', name: 'Bague de force', effect: 'boost', amount: 2, stat: 'str', uses: 1 },
      { id: 'i_speedwing', name: 'Aile vive', effect: 'boost', amount: 2, stat: 'spd', uses: 1 },
      { id: 'i_master_seal', name: 'Sceau de promotion', effect: 'promotion', uses: 1 },
      { id: 'i_chest_key', name: 'Clé de coffre', effect: 'key', keyType: 'chest', uses: 5, price: 300 },
      { id: 'i_door_key', name: 'Clé de porte', effect: 'key', keyType: 'door', uses: 1, price: 100 }
    ]);
  }

  // ressources rangées par personnage : ressources/personnages/<Perso>/map_<classe> | combat | portrait.png
  const P = 'ressources/personnages/';
  const CH = (n) => { const [who, cls] = n.split('_'); return P + who + '/map' + (cls ? '_' + cls : ''); };
  const BT = (n) => P + n + '/combat';
  const FACE = (n) => P + n + '/portrait.png';

  function classes() {
    const c = (id, name, moveType, mov, weaponsList, base, growths, extra) => Object.assign({
      id, name, moveType, mov, weapons: weaponsList, base, growths, caps: Object.assign({}, caps), tier: 1, promotesTo: '',
      defaultInventory: [], mapSprite: '', battler: ''
    }, extra || {});
    return [
      // Seigneurs (sprites et animations fournis dans ressources/personnages/)
      c('lord', 'Seigneur', 'foot', 5, ['sword'], st(18, 5, 0, 5, 7, 7, 5, 0), st(80, 45, 5, 50, 40, 45, 30, 35),
        { defaultInventory: ['w_iron_sword'], mapSprite: CH('Eliwood_Lord'), battler: BT('Eliwood') }),
      c('knight_lord', 'Chevalier-Seigneur', 'horse', 7, ['sword', 'lance'], st(21, 7, 0, 7, 8, 7, 7, 3), st(80, 45, 5, 50, 40, 45, 30, 35),
        { tier: 2, caps: st(60, 24, 20, 23, 24, 30, 22, 25), defaultInventory: ['w_iron_sword'], mapSprite: CH('Eliwood_KnightLord') }),
      c('lyn_lord', 'Seigneur (Lyn)', 'foot', 5, ['sword'], st(16, 4, 0, 7, 9, 5, 2, 0), st(70, 40, 5, 60, 60, 55, 20, 30),
        { defaultInventory: ['w_iron_sword'], mapSprite: CH('Lyn_Lord'), battler: BT('Lyn') }),
      c('blade_lord', 'Lame-Seigneur', 'foot', 6, ['sword', 'bow'], st(19, 6, 0, 9, 11, 5, 4, 3), st(70, 40, 5, 60, 60, 55, 20, 30),
        { tier: 2, caps: st(60, 24, 20, 29, 30, 30, 22, 22), defaultInventory: ['w_iron_sword'], mapSprite: CH('Lyn_BladeLord'), battler: BT('Lyn') }),
      c('axe_lord', 'Seigneur (hache)', 'foot', 5, ['axe'], st(19, 7, 0, 4, 5, 3, 8, 0), st(90, 60, 5, 45, 35, 30, 50, 25),
        { defaultInventory: ['w_iron_axe'], mapSprite: CH('Hector_Lord'), battler: BT('Hector') }),
      c('great_lord', 'Grand Seigneur', 'armor', 5, ['axe', 'sword'], st(22, 11, 0, 7, 7, 3, 12, 2), st(90, 60, 5, 45, 35, 30, 50, 25),
        { tier: 2, caps: st(60, 30, 20, 24, 24, 30, 30, 25), defaultInventory: ['w_iron_axe'], mapSprite: CH('Hector_GreatLord'), battler: BT('Hector') }),
      // Classes génériques (pas encore de sprites : affichées en jetons)
      c('thief', 'Voleur', 'foot', 6, ['sword'], st(16, 3, 0, 4, 9, 3, 1, 0), st(65, 30, 0, 50, 65, 45, 15, 20),
        { defaultInventory: ['w_iron_sword'], skillLearning: [{ level: 1, skillId: 'skill_lockpick' }] }),
      c('cavalier', 'Cavalier', 'horse', 7, ['sword', 'lance'], st(20, 5, 0, 2, 5, 0, 6, 0), st(75, 35, 0, 40, 40, 30, 25, 15), { defaultInventory: ['w_iron_lance'] }),
      c('knight', 'Chevalier', 'armor', 4, ['lance'], st(17, 5, 0, 2, 0, 0, 9, 0), st(80, 40, 0, 30, 15, 25, 55, 10), { defaultInventory: ['w_iron_lance'] }),
      c('fighter', 'Guerrier', 'foot', 5, ['axe'], st(20, 5, 0, 2, 4, 0, 2, 0), st(85, 55, 0, 30, 30, 15, 15, 5), { defaultInventory: ['w_iron_axe'] }),
      c('mercenary', 'Mercenaire', 'foot', 5, ['sword'], st(18, 4, 0, 8, 8, 0, 4, 0), st(80, 40, 0, 40, 32, 30, 18, 20), { defaultInventory: ['w_iron_sword'] }),
      c('archer', 'Archer', 'foot', 5, ['bow'], st(17, 4, 0, 3, 3, 0, 3, 0), st(70, 35, 0, 40, 32, 35, 15, 20), { defaultInventory: ['w_iron_bow'] }),
      c('mage', 'Mage', 'foot', 5, ['anima'], st(16, 0, 4, 2, 3, 0, 1, 3), st(55, 5, 55, 40, 35, 20, 5, 30), { defaultInventory: ['w_fire'] }),
      c('cleric', 'Prêtresse', 'foot', 5, ['staff'], st(16, 0, 3, 1, 2, 0, 1, 6), st(50, 5, 50, 30, 40, 50, 10, 55), { defaultInventory: ['w_heal'] }),
      c('pegasus', 'Chevalière Pégase', 'flier', 7, ['lance'], st(14, 4, 0, 5, 7, 0, 2, 4), st(65, 35, 10, 40, 50, 40, 12, 35), { defaultInventory: ['w_iron_lance'] }),
      // Ennemi générique avec sprites
      c('brigand', 'Brigand', 'foot', 5, ['axe'], st(20, 5, 0, 1, 3, 0, 3, 0), st(82, 50, 0, 30, 20, 15, 10, 13),
        { defaultInventory: ['w_iron_axe'], mapSprite: CH('Brigand'), battler: BT('Brigand') }),
      c('soldier', 'Soldat', 'foot', 5, ['lance'], st(20, 3, 0, 0, 1, 0, 0, 0), st(80, 50, 0, 30, 20, 25, 12, 15), { defaultInventory: ['w_iron_lance'] }),
      c('warrior', 'Chef de guerre', 'foot', 6, ['axe', 'bow'], st(28, 8, 0, 5, 6, 0, 5, 0), st(90, 45, 0, 20, 15, 15, 10, 15), { tier: 2, defaultInventory: ['w_iron_axe'] }),
      c('hero', 'Héros', 'foot', 6, ['sword', 'axe'], st(22, 7, 0, 10, 10, 0, 6, 2), st(80, 40, 0, 40, 32, 30, 18, 20), { tier: 2 }),
      c('paladin', 'Paladin', 'horse', 8, ['sword', 'lance'], st(23, 7, 0, 5, 7, 0, 8, 3), st(75, 35, 0, 40, 40, 30, 25, 15), { tier: 2 }),
      c('great_knight', 'Grand chevalier', 'horse', 6, ['sword', 'lance', 'axe'], st(25, 8, 0, 4, 3, 0, 12, 2), st(80, 40, 0, 30, 15, 25, 55, 10), { tier: 2, effectiveTypes: ['horse', 'armor'] }),
      c('general', 'Général', 'armor', 5, ['lance', 'axe'], st(24, 8, 0, 5, 2, 0, 14, 3), st(80, 40, 0, 30, 15, 25, 55, 10), { tier: 2 }),
      c('recruit', 'Recrue', 'foot', 4, ['lance'], st(14, 3, 0, 1, 2, 0, 3, 0), st(80, 40, 0, 35, 35, 40, 30, 20), { tier: 0 })
    ];
  }
  // Promotions
  function linkPromotions(list) {
    const set = (a, b) => {
      const c = list.find(x => x.id === a), target = list.find(x => x.id === b);
      const row = Promotions.create(c, target); row.itemId = 'i_master_seal';
      (c.promotions || (c.promotions = [])).push(row);
    };
    set('lord', 'knight_lord'); set('lyn_lord', 'blade_lord'); set('axe_lord', 'great_lord');
    set('fighter', 'warrior'); set('brigand', 'warrior');
    set('mercenary', 'hero'); set('mercenary', 'warrior');
    set('recruit', 'cavalier'); set('recruit', 'knight');
    set('cavalier', 'paladin'); set('cavalier', 'great_knight');
    set('knight', 'general'); set('knight', 'great_knight');
    return list;
  }

  function characters() {
    const u = (o) => Object.assign({ isLord: true, mapSprite: '', battler: '', portrait: '', movBonus: 0, gender: '', protagonist: false, ending: '', series: '' }, o);
    return [
      // protagoniste : héros du camp, chef d'escouade (convoi). Il a son propre sprite de map (pose unique, ressources/personnages/Xarrin).
      u({ id: 'c_xarrin', name: 'Xarrin', series: 'Original', rarity: 5, classId: 'lord', level: 1, color: '#2f7d4f', convoy: true, gender: 'homme', protagonist: true,
        ending: "Xarrin ne posa jamais vraiment son épée. Mais ceux qui l'avaient suivi savaient qu'il reviendrait toujours au camp, là où tout avait commencé.",
        stats: st(19, 6, 0, 6, 8, 6, 5, 1), growths: st(80, 50, 5, 50, 50, 45, 30, 30),
        inventory: [{ id: 'w_iron_sword' }, { id: 'w_slim_sword' }, { id: 'i_vulnerary' }],
        mapSprite: CH('Xarrin_Lord'), battler: BT('Xarrin'), portrait: FACE('Xarrin'),
        bio: "Épéiste au manteau vert qui mène la compagnie. Rapide, direct, et toujours le premier à charger." }),
      u({ id: 'c_eliwood', name: 'Eliwood', series: 'Fire Emblem 7', rarity: 5, classId: 'lord', level: 1, color: '#c0392b', convoy: false, gender: 'homme', protagonist: true,
        ending: "Eliwood rentra à Pherae et succéda à son père. On dit qu'il gouverna avec douceur, et qu'il n'oublia jamais ceux qui s'étaient battus à ses côtés.",
        stats: st(18, 5, 0, 5, 7, 7, 5, 0), growths: st(80, 45, 5, 50, 40, 45, 30, 35),
        inventory: [{ id: 'w_rapier' }, { id: 'w_iron_sword' }, { id: 'i_vulnerary' }],
        portrait: FACE('Eliwood'), bio: "Fils du marquis de Pherae. Calme, loyal, et plus têtu qu'il n'en a l'air." }),
      u({ id: 'c_lyn', name: 'Lyn', series: 'Fire Emblem 7', rarity: 5, classId: 'blade_lord', level: 1, color: '#16a34a', gender: 'femme', protagonist: true,
        ending: "Lyn retourna dans les plaines de Sacae. Les nomades parlent encore de la cavalière qui chevauchait plus vite que le vent.",
        stats: st(19, 6, 0, 9, 11, 5, 4, 3), growths: st(70, 40, 5, 60, 60, 55, 20, 30),
        inventory: [{ id: 'w_iron_sword' }, { id: 'w_iron_bow' }, { id: 'i_vulnerary' }],
        portrait: FACE('Lyn'), bio: "Guerrière de la plaine de Sacae. Rapide à l'épée comme à l'arc." }),
      u({ id: 'c_hector', name: 'Hector', series: 'Fire Emblem 7', rarity: 5, classId: 'axe_lord', level: 1, color: '#2563eb', gender: 'homme', protagonist: true,
        ending: "Hector devint marquis d'Ostia. Il garda la même hache, le même caractère, et une fâcheuse tendance à régler les conflits lui-même.",
        stats: st(19, 7, 0, 4, 5, 3, 8, 0), growths: st(90, 60, 5, 45, 35, 30, 50, 25),
        inventory: [{ id: 'w_iron_axe' }, { id: 'w_hand_axe' }, { id: 'i_vulnerary' }],
        portrait: FACE('Hector'), bio: "Frère cadet du marquis d'Ostia. Fonce d'abord, réfléchit ensuite." }),
      // Allié (unité verte) : classe générique, sprites propres à l'unité
      u({ id: 'c_cloud', name: 'Cloud', series: 'Final Fantasy VII', rarity: 5, classId: 'mercenary', level: 8, isLord: false, color: '#ca8a04', gender: 'homme', recruitAfter: 'ch_1',
        ending: "Cloud reprit la route aussi silencieusement qu'il était arrivé. Personne ne sut jamais vraiment d'où il venait.",
        stats: st(28, 10, 0, 12, 11, 6, 8, 2), growths: st(80, 50, 5, 50, 45, 30, 30, 15),
        inventory: [{ id: 'w_iron_sword' }, { id: 'w_wind_sword' }, { id: 'i_vulnerary' }, { id: 'i_master_seal' }],
        mapSprite: CH('Cloud'), battler: BT('Cloud'),
        portrait: FACE('Cloud'), bio: "Mercenaire de passage. Il ne combat que pour lui-même… en théorie." }),
      // personnages à invoquer (autel du camp) : pas de sprites propres, ils prennent ceux de leur classe
      u({ id: 'c_rebecca', name: 'Rebecca', series: 'Fire Emblem 7', rarity: 5, classId: 'archer', level: 1, isLord: false, color: '#65a30d', gender: 'femme',
        stats: st(17, 4, 0, 4, 6, 4, 3, 1), growths: st(60, 40, 5, 50, 60, 50, 15, 30), inventory: [{ id: 'w_iron_bow' }, { id: 'i_vulnerary' }],
        bio: "Chasseresse du village de Pherae. Elle ne rate jamais un lapin… ni un brigand." }),
      u({ id: 'c_oswin', name: 'Oswin', series: 'Fire Emblem 7', rarity: 4, classId: 'knight', level: 9, isLord: false, color: '#64748b', gender: 'homme',
        stats: st(28, 13, 0, 9, 5, 3, 13, 3), growths: st(90, 40, 0, 30, 30, 35, 55, 30), inventory: [{ id: 'w_iron_lance' }, { id: 'w_javelin' }],
        bio: "Chevalier d'Ostia, fidèle à Hector. Lent, mais rien ne passe." }),
      u({ id: 'c_matthew', name: 'Matthew', series: 'Fire Emblem 7', rarity: 4, classId: 'thief', level: 2, isLord: false, color: '#a16207', gender: 'homme',
        stats: st(18, 4, 0, 4, 11, 2, 2, 0), growths: st(75, 30, 0, 40, 70, 50, 25, 20), inventory: [{ id: 'w_iron_sword' }, { id: 'i_chest_key' }],
        bio: "Espion d'Ostia, toujours une plaisanterie aux lèvres." }),
      u({ id: 'c_serra', name: 'Serra', series: 'Fire Emblem 7', classId: 'cleric', level: 1, isLord: false, color: '#f472b6', gender: 'femme',
        stats: st(17, 2, 5, 8, 6, 6, 2, 5), growths: st(50, 5, 50, 30, 50, 60, 15, 55), inventory: [{ id: 'w_heal' }],
        bio: "Prêtresse d'Ostia. Elle soigne vite, et parle encore plus vite." }),
      u({ id: 'c_dorcas', name: 'Dorcas', series: 'Fire Emblem 7', classId: 'fighter', level: 3, isLord: false, color: '#78350f', gender: 'homme',
        stats: st(30, 7, 0, 7, 6, 3, 3, 0), growths: st(80, 60, 0, 40, 20, 45, 25, 15), inventory: [{ id: 'w_iron_axe' }],
        bio: "Guerrier de Bern parti gagner de quoi soigner sa femme." })
    ];
  }

  // Map d'exemple : un caractère par case -> terrain de jeu (le décor est dessiné avec le tileset « Village »)
  const LEGEND = { '.': 'plain', ',': 'plain', T: 'forest', M: 'mountain', '^': 'peak', '~': 'water', '=': 'road', B: 'bridge', s: 'sand',
    F: 'fort', V: 'village', '#': 'wall', _: 'floor', K: 'throne', H: 'wall', G: 'gate', b: 'bush', D: 'thicket' };

  const SAMPLE_ASCII = [
    '^^MMM..TT..~~...TMM^',
    '^MM..D.TT..~~..,.TM^',
    'MM..,....,.~~.....FM',
    'M.....T......b.TT..M',
    '..TT.......~~~.b...T',
    '.TTT..H...s~~s..V...',
    '..T...=====BB=====..',
    '...b..=...s~~s..=...',
    '..V...=....~~.b.=.TT',
    '.....,=.b..~~..T==TT',
    '..TT..=.b..~~....==.',
    '.TTT..=...~~~..MM.=.',
    '..T..F=...~~..MMM...',
    'MM....=...~~....M..^',
    '^MM..,=,..~~.....M^^'
  ];

  /**
   * Map d'exemple dessinée avec le tileset « Village » (16 px, agrandi ×2) sur trois calques : sol (herbe, eau,
   * terre), chemins (raccordés automatiquement) et décor (arbres, rochers, maisons, pont). Le terrain de jeu de
   * chaque case suit SAMPLE_ASCII : là où le tile n'a pas déjà le bon terrain, la case est peinte en surcharge.
   */
  function sampleMap() {
    const rows = SAMPLE_ASCII, h = rows.length, w = rows[0].length;
    for (const row of rows) if (row.length !== w) throw new Error('Ligne de map invalide : ' + row);
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? null : rows[y][x];
    const wet = (c) => c === '~' || c === 'B';
    const way = (c) => c === '=' || c === 'B';
    const sol = [], paths = [], decor = [], terrain = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = rows[y][x], i = y * w + x, alt = (x * 7 + y * 3) % 2;
      // sol
      let g = 17;
      if (wet(c)) {
        const L = !wet(at(x - 1, y)) && at(x - 1, y) !== null, R = !wet(at(x + 1, y)) && at(x + 1, y) !== null;
        const D = at(x, y + 1) !== null && !wet(at(x, y + 1));
        g = D ? (L && R ? 101 : L ? 96 : R ? 98 : 97) : (L && R ? 86 : L ? 80 : R ? 82 : 81);
      } else if (c === 's') g = 129;
      sol[i] = g + 1;
      // chemins (le pont relie les deux rives)
      let r = 0;
      if (c === '=') {
        const u = way(at(x, y - 1)), d = way(at(x, y + 1)), l = way(at(x - 1, y)), rt = way(at(x + 1, y));
        const k = (u ? 1 : 0) + (d ? 2 : 0) + (l ? 4 : 0) + (rt ? 8 : 0);
        r = { 1: 30, 2: 15, 3: 44, 4: 31, 8: 14, 12: 45, 5: 29, 9: 28, 6: 13, 10: 12, 7: 47, 11: 62, 13: 46, 14: 63, 15: 61 }[k] || 45;
      }
      paths[i] = r ? r + 1 : 0;
      // décor
      const dec = { T: alt ? 22 : 38, D: alt ? 24 : 40, b: alt ? 23 : 39, M: alt ? 54 : 55, '^': alt ? 56 : 72, V: 26, F: 58, H: 105, ',': alt ? 7 : 8,
        B: way(at(x - 1, y)) && way(at(x + 1, y)) ? 91 : way(at(x - 1, y)) ? 92 : 90 }[c];
      decor[i] = dec !== undefined ? dec + 1 : 0;
      // terrain : surcharge seulement si le tile du dessus ne le donne pas déjà
      const top = decor[i] || paths[i] || sol[i];
      const want = LEGEND[c] || 'plain';
      terrain[i] = VILLAGE_TERRAIN[top - 1] === want ? '' : want;
    }
    return {
      id: 'map_1', name: 'Plaine de Varenne', width: w, height: h, tileWidth: 32, tileHeight: 32,
      tilesets: [{ tilesetId: 'ts_village', firstgid: 1 }],
      layers: [
        { id: 'l1', name: 'Sol', visible: true, data: sol },
        { id: 'l2', name: 'Chemins', visible: true, data: paths },
        { id: 'l3', name: 'Décor', visible: true, data: decor }
      ],
      terrain,
      objects: []
    };
  }

  // ------------------------------------------------------------------
  // Tileset « Village » (16 px, agrandi ×2 sur les maps en 32 px, comme les sprites de map)
  // ------------------------------------------------------------------
  const VILLAGE_TERRAIN = (() => {
    const t = {};
    const set = (terrain, ...ids) => ids.forEach(i => { t[i] = terrain; });
    set('plain', 0, 1, 2, 3, 4, 5, 16, 17, 18, 19, 21, 32, 33, 34, 35, 36, 37);
    set('plain', 112, 113, 114, 115, 128, 130, 131, 133, 134, 144, 145, 146, 147, 150); // plateau de terre
    set('floor', 129); // terre battue : sol (portes ouvertes, intérieurs)
    set('wall', 48, 49, 50, 51, 52, 53, 64, 65, 66, 67, 68, 69, 116, 117, 118, 132, 148, 149, 160, 161, 162, 163, 164, 165); // falaises
    set('water', 70, 80, 81, 82, 83, 84, 85, 86, 96, 97, 98, 99, 100, 101, 102);
    set('road', 12, 13, 14, 15, 28, 29, 30, 31, 44, 45, 46, 47, 61, 62, 63);
    set('forest', 22, 24, 38, 39, 40);
    set('bush', 7, 23);
    set('village', 10, 26, 27, 42, 43, 58);
    set('mountain', 9, 54, 55, 56, 71, 72);
    set('wall', 25, 74, 75, 88, 103, 105, 106); // puits, panneau, étal, charrette, caisses, tas de pierres
    set('bridge', 76, 90, 91, 92, 108);
    return t;
  })();
  function villageTileset() {
    return {
      id: 'ts_village', name: 'Village', image: 'ressources/tilesets/village.png', tileWidth: 16, tileHeight: 16,
      columns: 16, tileCount: 256, margin: 0, spacing: 0, imageWidth: 256, imageHeight: 256,
      tileTerrain: Object.assign({}, VILLAGE_TERRAIN)
    };
  }

  function sampleChapter() {
    const brig = (id, x, y, level, extra) => Object.assign({ id, name: 'Brigand', classId: 'brigand', level, x, y, ai: 'aggressive', appearTurn: 0, isBoss: false, inventory: [] }, extra || {});
    return {
      id: 'ch_1', name: 'Le fort de Batta', mapId: 'map_1', // chapitre 1, acte 1
      objective: { type: 'boss', turns: 10, x: 18, y: 2, text: 'Vaincre Batta' },
      next: 'ch_1_2', final: false, // sans lobby : les actes s'enchaînent par « Acte suivant »
      kind: 'story', gold: 600, // or gagné à la première victoire (lobby)
      villages: [{ id: 'v_south', name: 'Village du sud', x: 2, y: 8, script: 'Villageois: Ces brigands nous empêchent de quitter nos maisons. Prenez cette potion et ces pièces pour vous aider !', reward: { gold: 250, itemId: 'i_vulnerary', uses: 0 } }],
      players: [
        { id: 'p0', unitId: 'c_xarrin', x: 5, y: 13 },
        { id: 'p1', unitId: 'c_eliwood', x: 5, y: 12 },
        { id: 'p2', unitId: 'c_lyn', x: 4, y: 13 },
        { id: 'p3', unitId: 'c_hector', x: 6, y: 13 }
      ],
      // unités vertes : jouent après la phase du joueur ; « control » = 'player' (jouable) ou 'ai'
      allies: [
        { id: 'a1', unitId: 'c_cloud', x: 17, y: 13, control: 'player', ai: 'aggressive' }
      ],
      enemies: [
        brig('e1', 2, 4, 1),
        brig('e2', 8, 9, 2),
        brig('e3', 13, 5, 1, { ai: 'range', inventory: [{ id: 'w_hand_axe' }] }),
        brig('e4', 14, 6, 2, { ai: 'range' }),
        brig('e5', 15, 8, 2, { ai: 'range', inventory: [{ id: 'w_iron_axe' }, { id: 'w_hand_axe' }], gold: 100 }),
        brig('e6', 17, 3, 3, { ai: 'stationary' }),
        { id: 'e7', name: 'Batta', classId: 'brigand', level: 5, x: 18, y: 2, ai: 'stationary', appearTurn: 0, isBoss: true,
          inventory: [{ id: 'w_iron_axe' }, { id: 'w_hand_axe' }], statBonus: { hp: 6, str: 2, def: 2 }, gold: 300 },
        brig('e8', 19, 12, 1, { appearTurn: 3 }),
        brig('e9', 18, 11, 2, { appearTurn: 3, inventory: [{ id: 'w_hand_axe' }] })
      ],
      events: [
        { id: 'ev1', trigger: { type: 'start' }, once: true, script:
          "Lyn: Les brigands tiennent le vieux fort depuis l'aube. Ils pillent tout ce qui traverse la rivière.\n" +
          "Hector: Parfait. Ça fait trois jours que ma hache s'ennuie.\n" +
          "Xarrin: Doucement, Hector. Leur chef, Batta, ne quittera pas le fort : on avance ensemble.\n" +
          "Eliwood: Je reste à côté de toi, Xarrin. Si l'un de nous est encerclé, l'autre le dégage.\n" +
          "Lyn: Je couvre le flanc gauche. Mon arc portera plus loin que leurs hachettes.\n" +
          "Cloud: … Ces brigands bloquent ma route. Je m'en occupe, mais je ne travaille pas pour vous.\n" +
          "Xarrin: Un mercenaire ? Tant qu'il vise les brigands, il est le bienvenu.\n" +
          "Xarrin: Si quelqu'un a besoin d'une arme ou d'une potion, venez me voir : j'ai le convoi." },
        { id: 'ev2', trigger: { type: 'turn', turn: 3 }, once: true, script:
          "Lyn: Xarrin ! D'autres brigands descendent des collines, au sud-est.\n" +
          "Hector: Tant mieux. Plus on est de fous…" },
        { id: 'ev3', trigger: { type: 'death', target: 'e7' }, once: true, script:
          "Batta: Grr… battu par trois gamins…" },
        { id: 'ev4', trigger: { type: 'victory' }, once: true, script:
          "Xarrin: Le fort est libre. Les villageois vont pouvoir rentrer chez eux.\n" +
          "Hector: Déjà fini ? J'espérais mieux de ce Batta.\n" +
          "Lyn: Ne te plains pas, Hector. Personne n'est blessé." }
      ]
    };
  }

  // ------------------------------------------------------------------
  // Lobby d'exemple : le camp entre deux chapitres
  // ------------------------------------------------------------------
  // Camp : 3 calques (sol, chemins, décor) avec le tileset Village. Une lettre = une tuile (index dans le tileset).
  const CAMP = {
    sol: [ // . herbe, étang en bas à gauche (falaise / eau)
      '..............',
      '..............',
      '..............',
      '..............',
      '..............',
      '..............',
      '.abc..........',
      '.def..........',
      '.ghi..........',
      '..............'],
    chemins: [ // | vertical  - horizontal  + croisement  v bout haut  ^ bout bas  L coin haut-droite  J coin haut-gauche
      '..............',
      '.......v......',
      '..v....|..v...',
      '..|....|..|...',
      '..L----+--J...',
      '.......|......',
      '.......|......',
      '.......|......',
      '.......|......',
      '.......^......'],
    decor: [ // P/p sapins, C/c bosquets, B buisson, H/h maisons, Q panneau des quêtes, W puits, F fleurs, g herbes, X/x caisses, A charrette, N fanions, o caillou
      'PpCPpC..cPpCpP',
      'P.....N.N....p',
      'cxH.F.....QA.C',
      'P...........gp',
      'B............B',
      'g...F.....F...',
      '..........o..c',
      '.....F...W...P',
      '............Xp',
      'PpC.F...cPpCpP']
  };
  const CAMP_TILES = {
    sol: { '.': 17, a: 67, b: 68, c: 69, d: 80, e: 81, f: 82, g: 96, h: 97, i: 101 },
    chemins: { '|': 44, '-': 45, '+': 61, v: 30, '^': 15, L: 28, J: 29 },
    decor: { P: 22, p: 39, C: 24, c: 40, B: 23, H: 26, h: 42, Q: 74, W: 25, F: 8, g: 7, X: 103, x: 107, A: 88, N: 11, o: 57 }
  };
  function lobbyMap() {
    const h = CAMP.sol.length, w = CAMP.sol[0].length;
    const layer = (id, name, key) => {
      const rows = CAMP[key], map = CAMP_TILES[key], data = [];
      for (const row of rows) {
        if (row.length !== w) throw new Error('Ligne de camp invalide : ' + row);
        for (const ch of row) data.push(map[ch] !== undefined ? map[ch] + 1 : 0);
      }
      return { id, name, visible: true, data };
    };
    return { id: 'map_camp', name: 'Camp de Varenne', kind: 'lobby', width: w, height: h, tileWidth: 32, tileHeight: 32,
      tilesets: [{ tilesetId: 'ts_village', firstgid: 1 }],
      layers: [layer('l1', 'Sol', 'sol'), layer('l2', 'Chemins', 'chemins'), layer('l3', 'Décor', 'decor')],
      terrain: new Array(w * h).fill(''), objects: [] };
  }
  function lobby() {
    return {
      enabled: true, name: 'Camp de Varenne', mapId: 'map_camp', heroId: 'c_xarrin', startGold: 500, music: '',
      start: { x: 7, y: 8 },
      board: { x: 10, y: 2, label: 'Tableau des quêtes' },
      shop: { enabled: true, x: 2, y: 2, name: 'Marchand', stock: ['w_iron_sword', 'w_steel_sword', 'w_iron_lance', 'w_javelin', 'w_iron_axe', 'w_hand_axe', 'w_iron_bow', 'w_heal', 'i_vulnerary', 'i_elixir', 'i_master_seal', 'i_chest_key', 'i_door_key'] },
      spots: [
        { unitId: 'c_eliwood', x: 5, y: 7, after: '' },
        { unitId: 'c_lyn', x: 5, y: 5, after: '' },
        { unitId: 'c_hector', x: 9, y: 5, after: '' },
        { unitId: 'c_cloud', x: 11, y: 8, after: 'arc_1' } // rejoint le camp après le chapitre 1
      ]
    };
  }
  // conversations du lobby : avec un personnage présent, débloquées par la progression
  function talks() {
    return [
      { id: 't_eli_1', name: 'Un second', unitId: 'c_eliwood', after: '', alive: [], points: 10, once: true, script:
        "Eliwood: Xarrin. Les autres t'attendent pour décider de la route.\nXarrin: Et toi, tu en penses quoi ?\nEliwood: Que tu ne demandes l'avis de personne… mais que tu as souvent raison.\nXarrin: Souvent ?\nEliwood: Je reste poli." },
      { id: 't_lyn_1', name: 'Les guetteurs', unitId: 'c_lyn', after: '', alive: [], points: 10, once: true, script:
        "Lyn: Xarrin. Le fort des brigands est juste au nord de la rivière.\nXarrin: Tu as repéré leurs guetteurs ?\nLyn: Trois. Et ils dorment mal." },
      { id: 't_hec_1', name: 'Une bourse vide', unitId: 'c_hector', after: '', alive: [], points: 10, once: true, script:
        "Hector: Le marchand a des haches d'acier. Tu me prêtes un peu d'or ?\nXarrin: Tu as ta propre bourse, Hector.\nHector: Elle est vide. Comme d'habitude." },
      { id: 't_lyn_2', name: 'Après le fort', unitId: 'c_lyn', after: 'arc_1', alive: [], points: 15, once: true, script:
        "Lyn: Tu t'es bien battu, au fort.\nXarrin: Grâce à ton arc.\nLyn: Je sais. Mais c'est gentil de le dire." },
      { id: 't_cloud_1', name: 'Un camp calme', unitId: 'c_cloud', after: 'arc_1', alive: [], points: 0, once: true, script:
        "Cloud: … Ton camp est calme.\nXarrin: Tu peux rester, si tu veux.\nCloud: Je reste. Pour l'instant." }
    ];
  }
  // ------------------------------------------------------------------
  // Actes d'exemple : chapitre 1 (2 actes), chapitre 2 (2 actes), évènement (2 actes)
  // ------------------------------------------------------------------
  const foe = (id, x, y, level, extra) => Object.assign({ id, name: 'Brigand', classId: 'brigand', level, x, y, ai: 'aggressive', appearTurn: 0, isBoss: false, inventory: [] }, extra || {});
  const act = (o) => Object.assign({ mapId: 'map_1', kind: 'story', unlock: { after: '', alive: [], from: '', to: '' }, gold: 0, goldEachClear: false, replay: true,
    next: '', final: false, allies: [], events: [] }, o);
  const say = (id, script, trigger) => ({ id, trigger: trigger || { type: 'start' }, once: true, script });
  const trio = (e, l, h, x) => [{ id: 'p0', unitId: 'c_xarrin', x: x[0], y: x[1] }, { id: 'p1', unitId: 'c_eliwood', x: e[0], y: e[1] }, { id: 'p2', unitId: 'c_lyn', x: l[0], y: l[1] }, { id: 'p3', unitId: 'c_hector', x: h[0], y: h[1] }];

  function extraActs() {
    return [
      act({ id: 'ch_1_2', name: 'Les renforts des collines', next: 'ch_2_1', gold: 600,
        objective: { type: 'rout', turns: 10, x: 0, y: 0 },
        players: trio([17, 2], [16, 2], [18, 3], [17, 3]),
        enemies: [foe('r1', 8, 10, 2), foe('r2', 13, 10, 2, { ai: 'range', inventory: [{ id: 'w_hand_axe' }] }), foe('r3', 14, 9, 3, { gold: 100 }),
          foe('r4', 0, 7, 2, { appearTurn: 2 }), foe('r5', 1, 8, 3, { appearTurn: 2, gold: 100 })],
        events: [say('ev1', "Lyn: Le fort est à nous… mais regardez les collines.\nHector: Des renforts ! Ils arrivent trop tard pour sauver Batta.\nXarrin: Pas trop tard pour nous causer des ennuis. On les repousse !")] }),
      act({ id: 'ch_2_1', name: "L'embuscade", next: 'ch_2_2', gold: 800,
        objective: { type: 'survive', turns: 5, x: 0, y: 0 },
        players: trio([16, 6], [17, 7], [16, 7], [17, 6]),
        enemies: [foe('m1', 12, 3, 3, { name: 'Mercenaire', classId: 'mercenary', inventory: [{ id: 'w_iron_sword' }] }), foe('m2', 19, 9, 3), foe('m3', 13, 12, 3, { ai: 'range', inventory: [{ id: 'w_hand_axe' }] }),
          foe('m4', 18, 12, 2, { gold: 150 }), foe('m5', 19, 4, 3, { appearTurn: 2 }), foe('m6', 19, 10, 3, { appearTurn: 3 }), foe('m7', 15, 13, 2, { appearTurn: 3 })],
        events: [say('ev1', "Eliwood: La route de Pherae passe par ce pont.\nLyn: Attention… on nous attendait. Ils sont partout !\nXarrin: On serre les rangs. Tenez bon jusqu'à ce qu'ils se lassent : cinq tours, pas plus !")] }),
      act({ id: 'ch_2_2', name: 'Le fort de Zagan', final: true, gold: 1200, // dernier acte de l'histoire : la victoire ouvre l'épilogue
        objective: { type: 'seize', turns: 10, x: 5, y: 12, text: 'Prendre le fort du sud-ouest' },
        players: trio([17, 2], [16, 2], [18, 3], [17, 3]),
        enemies: [{ id: 'z1', name: 'Zagan', classId: 'brigand', level: 6, x: 5, y: 12, ai: 'stationary', appearTurn: 0, isBoss: true,
          inventory: [{ id: 'w_iron_axe' }, { id: 'w_hand_axe' }], statBonus: { hp: 8, str: 2, def: 3 }, gold: 500 },
          foe('z2', 4, 11, 3), foe('z3', 6, 11, 3, { ai: 'range' }), foe('z4', 3, 10, 2, { inventory: [{ id: 'w_hand_axe' }] }), foe('z5', 7, 9, 3), foe('z6', 9, 4, 2)],
        events: [say('ev1', "Eliwood: Le fort du sud-ouest garde l'entrée de Pherae.\nHector: Et son chef, Zagan, n'a pas l'air de vouloir nous laisser passer.\nXarrin: Alors on le prend. Ensemble."),
          say('ev2', "Zagan: Pherae ne vous… attendra pas…", { type: 'death', target: 'z1' })] }),
      // évènement : deux actes
      act({ id: 'ch_ev_1', name: 'Les pillards', kind: 'event', next: 'ch_ev_2', gold: 300, goldEachClear: true,
        objective: { type: 'rout', turns: 10, x: 0, y: 0 },
        players: trio([5, 12], [4, 13], [6, 13], [5, 13]),
        enemies: [foe('ev_e1', 8, 9, 2, { name: 'Pillard', gold: 100 }), foe('ev_e2', 10, 6, 2, { name: 'Pillard' }), foe('ev_e3', 13, 6, 3, { name: 'Pillard', ai: 'range', gold: 100 })],
        events: [say('ev1', "Lyn: Des pillards au gué. Ils ont vu passer nos chariots.\nXarrin: Alors chassons-les avant qu'ils reviennent en nombre.")] }),
      act({ id: 'ch_ev_2', name: 'Le chef des pillards', kind: 'event', gold: 500, goldEachClear: true,
        objective: { type: 'boss', turns: 10, x: 13, y: 5, text: 'Vaincre Kord' },
        players: trio([5, 12], [4, 13], [6, 13], [5, 13]),
        enemies: [{ id: 'k1', name: 'Kord', classId: 'brigand', level: 5, x: 13, y: 5, ai: 'stationary', appearTurn: 0, isBoss: true, inventory: [{ id: 'w_iron_axe' }], statBonus: { hp: 5, str: 1 }, gold: 300 },
          foe('k2', 10, 5, 3, { name: 'Pillard' }), foe('k3', 12, 3, 2, { name: 'Pillard', ai: 'range', inventory: [{ id: 'w_hand_axe' }] }), foe('k4', 8, 10, 2, { name: 'Pillard' })],
        events: [say('ev1', "Hector: Leur chef s'est retranché sur le banc de sable.\nXarrin: Sans lui, les pillards se disperseront. Allons-y.")] })
    ];
  }
  /** Chapitres : groupes d'actes, joués dans l'ordre (data/arcs.json). */
  function arcs() {
    return [
      { id: 'arc_1', name: 'Chapitre 1 — Les brigands du fort', kind: 'story', description: 'Libérer le fort tenu par Batta et ses brigands.',
        unlock: { after: '', alive: [], from: '', to: '' }, acts: ['ch_1', 'ch_1_2'] },
      { id: 'arc_2', name: 'Chapitre 2 — La route de Pherae', kind: 'story', description: 'Rejoindre Pherae malgré les embuscades.',
        unlock: { after: '', alive: [], from: '', to: '' }, acts: ['ch_2_1', 'ch_2_2'] },
      { id: 'arc_ev_1', name: 'Évènement — Pillards au gué', kind: 'event', description: 'Des pillards rôdent autour du gué. Rejouable : l\'or est gagné à chaque victoire.',
        unlock: { after: 'arc_1', alive: [], from: '', to: '' }, acts: ['ch_ev_1', 'ch_ev_2'] }
    ];
  }

  // Affinités : paires de personnages, conversations par rang, attaques débloquées, fin à deux
  function supports() {
    const conv = (C, B, A, S) => ({ C, B, A, S: S || '' });
    return [
      { id: 'sp_xar_eli', a: 'c_xarrin', b: 'c_eliwood', startPoints: 60, maxRank: 'A',
        special: { rank: 'B', name: 'Lames jumelles', chance: 25, dmg: 3, hit: 10, crit: 5 },
        combo: { rank: 'A', name: 'Charge des deux épées', chance: 40, might: 3, hit: 10 },
        conversations: conv(
          "Eliwood: Tu fonces toujours le premier.\nXarrin: Quelqu'un doit bien ouvrir la voie.\nEliwood: Alors je fermerai la marche derrière toi.",
          "Xarrin: Tu as paré ce coup qui m'était destiné.\nEliwood: Tu aurais fait pareil.\nXarrin: … Oui. Mais je ne l'aurais pas fait aussi proprement.",
          "Eliwood: Quand tout sera fini, Pherae aura besoin d'épées comme la tienne.\nXarrin: Pherae, ou toi ?\nEliwood: Les deux, mon ami."),
        ending: "Xarrin et Eliwood restèrent liés comme des frères d'armes. On dit que la garde de Pherae porte encore un manteau vert en son honneur." },
      { id: 'sp_xar_lyn', a: 'c_xarrin', b: 'c_lyn', startPoints: 20, maxRank: 'S',
        special: { rank: 'B', name: 'Vent et acier', chance: 20, dmg: 3, hit: 15, crit: 0 },
        combo: { rank: 'A', name: 'Tempête des plaines', chance: 35, might: 4, hit: 5 },
        conversations: conv(
          "Lyn: Tu marches comme quelqu'un qui a grandi sur les routes.\nXarrin: Et toi, comme quelqu'un qui n'a jamais vu de murs.",
          "Xarrin: Ton arc m'a sauvé, au gué.\nLyn: Tu comptes ?\nXarrin: Je note. C'est différent.",
          "Lyn: Le vent tourne, Xarrin. Il tourne toujours vers toi.\nXarrin: C'est bon signe ?\nLyn: Chez moi, oui.",
          "Xarrin: Les plaines de Sacae… tu m'y emmènerais ?\nLyn: Seulement si tu restes.\nXarrin: Alors je reste."),
        ending: "Xarrin suivit Lyn jusqu'aux plaines de Sacae. Les nomades l'appelèrent « l'épée verte », et il ne repartit jamais." },
      { id: 'sp_eli_lyn', a: 'c_eliwood', b: 'c_lyn', startPoints: 70, maxRank: 'S',
        special: { rank: 'B', name: 'Lame inspirée', chance: 25, dmg: 3, hit: 10, crit: 0 },
        combo: { rank: 'A', name: 'Danse des deux lames', chance: 40, might: 3, hit: 10 },
        conversations: conv(
          "Lyn: Eliwood, tu tiens ton épée comme un noble.\nEliwood: Je suis un noble.\nLyn: Justement. On va corriger ça.",
          "Eliwood: Tu m'as couvert au pont. Merci.\nLyn: Tu m'aurais couverte aussi. C'est comme ça qu'on survit.",
          "Lyn: Quand tout ça sera fini… tu rentreras à Pherae ?\nEliwood: Je crois. Et toi ?\nLyn: Je ne sais pas encore. C'est la première fois que je n'ai pas envie de partir seule.",
          "Eliwood: Lyn. Viens à Pherae avec moi. Pas comme invitée.\nLyn: … Tu as mis du temps à le dire.\nEliwood: J'ai mis du temps à oser."),
        ending: "Eliwood et Lyn partirent ensemble pour Pherae. Chaque été, ils retournaient dans les plaines de Sacae, où Lyn apprit à Eliwood à monter sans selle." },
      { id: 'sp_eli_hec', a: 'c_eliwood', b: 'c_hector', startPoints: 90, maxRank: 'A',
        special: { rank: 'B', name: 'Serment de frères', chance: 20, dmg: 4, hit: 0, crit: 10 },
        combo: { rank: 'A', name: 'Assaut des marquis', chance: 50, might: 4, hit: 15 },
        conversations: conv(
          "Hector: Tu frappes trop poliment, Eliwood.\nEliwood: Et toi, tu frappes tout ce qui bouge.\nHector: Ça marche, non ?",
          "Eliwood: Tu t'es jeté devant cette hache pour moi.\nHector: J'avais rien de mieux à faire.",
          "Hector: Quoi qu'il arrive à nos maisons, toi et moi, on reste frères d'armes.\nEliwood: Je n'en ai jamais douté."),
        ending: "Pherae et Ostia ne connurent jamais la guerre entre elles. Il paraît que les deux marquis réglaient leurs désaccords à l'entraînement, à l'aube." },
      { id: 'sp_hec_lyn', a: 'c_hector', b: 'c_lyn', startPoints: 20, maxRank: 'S',
        special: { rank: 'B', name: 'Coup de grâce', chance: 20, dmg: 5, hit: 0, crit: 0 },
        combo: { rank: 'A', name: 'Hache et vent', chance: 35, might: 3, hit: 5 },
        conversations: conv(
          "Hector: T'es rapide, pour une fille de la plaine.\nLyn: Et toi, bruyant, pour un noble.",
          "Lyn: Tu as encore foncé tout seul.\nHector: Je savais que tu me suivrais.\nLyn: … Ne compte pas trop là-dessus.",
          "Hector: Lyn. Je ne sais pas faire de beaux discours.\nLyn: Alors n'en fais pas. Je suis là.",
          "Hector: Ostia a besoin d'une marquise qui sait se battre.\nLyn: Ostia, ou toi ?\nHector: … Les deux. Surtout moi."),
        ending: "Hector et Lyn se marièrent à Ostia, au grand désespoir des conseillers. Leur fille apprit l'arc avant de savoir marcher." },
      { id: 'sp_lyn_cloud', a: 'c_lyn', b: 'c_cloud', startPoints: 0, maxRank: 'A',
        special: { rank: 'B', name: 'Lame silencieuse', chance: 20, dmg: 4, hit: 10, crit: 0 },
        combo: { rank: 'A', name: 'Tempête croisée', chance: 30, might: 5, hit: 0 },
        conversations: conv(
          "Lyn: Tu ne parles jamais ?\nCloud: … Pas besoin.",
          "Cloud: Ton arc. Tu tires mieux que les soldats que j'ai connus.\nLyn: C'est un compliment ?\nCloud: … Oui.",
          "Lyn: Tu repartiras, après ?\nCloud: Sûrement. Mais je saurai où revenir."),
        ending: "Lyn et Cloud parcoururent ensemble les routes de l'ouest. Ils ne restaient jamais longtemps au même endroit, mais toujours au même côté du feu de camp." }
    ];
  }

  /** Effets sonores par défaut (ressources/sons, générés par tools/build_default_sounds.py). */
  function defaultSounds() {
    const S = (n) => 'ressources/sons/' + n + '.wav';
    return { cursor: S('curseur'), confirm: S('valider'), cancel: S('annuler'), hit: S('coup'), crit: S('critique'), miss: S('esquive'), death: S('defaite') };
  }

  function emptyDatabase() {
    return { terrains: terrains(), weapons: weapons(), items: items(), classes: linkPromotions(classes()), skills: Skills.presets(), units: [], tilesets: [], chapters: [], talks: [], arcs: [] };
  }

  // crédits du projet d'exemple (Système › Écran titre et crédits ; écran titre › Crédits)
  const SAMPLE_CREDITS = ['Tactical Emblem :', 'EdnidCorp.', 'Xarrin', 'Noctoa', 'Reito', 'Ota', '',
    'Assets d’exemple :', 'Lexou', 'LS', 'Grim', 'Bonzai', 'Lord Zymeth', 'Cynon', 'OurBoiRoy', 'TheNinjaGuy914', 'trainboy2019', 'Maelstrom210', '',
    'Musiques :', 'Yuka Tsujiyoko (Fire Emblem 6, Enhanced Soundtrack)', '',
    'Game Company :', 'Nintendo', 'Square-Enix'].join('\n');
  // ancien texte d'exemple : remplacé par le nouveau à l'ouverture d'un projet qui l'a gardé tel quel
  const OLD_SAMPLE_CREDITS = 'Histoire et cartes :\nProjet d’exemple de Tactical Emblem\n\nGraphismes :\nSprites de Fire Emblem 7 : Lexou, Grim & Bonzai\nCloud (édition FE) : Lord Zymeth\n\nMusiques :\nFire Emblem 6 (Enhanced Soundtrack) : Yuka Tsujiyoko\n\nDroits :\nFire Emblem : Nintendo / Intelligent Systems\nCloud (Final Fantasy VII) : Square Enix';
  function sampleProject(name) {
    const db = emptyDatabase();
    db.units = characters();
    db.tilesets = [villageTileset()];
    db.chapters = [sampleChapter(), ...extraActs()];
    db.arcs = arcs();
    db.supports = supports();
    db.talks = talks();
    // animations d'attaque (Base de données › Animations) : exemples sur les planches de ressources/animations
    db.animations = Animations.samples();
    for (const sk of db.skills) if (Animations.SAMPLE_SKILLS[sk.id]) sk.animation = Animations.SAMPLE_SKILLS[sk.id];
    return {
      meta: {
        format: 'tactics-forge', version: 1, name: name || 'Mon Tactical RPG',
        // lobby : le jeu commence au camp, on y choisit les chapitres, on achète, on parle aux alliés
        lobby: lobby(),
        // systèmes devenus des plugins : un projet neuf ne les reçoit pas automatiquement (Base de données › Plugins)
        pluginMigrations: ['invocations', 'fonds-combat', 'animations'],
        // animation jouée par défaut pour chaque type d'arme (une arme peut choisir la sienne)
        animationDefaults: Object.assign({}, Animations.SAMPLE_DEFAULTS),
        author: '', startChapter: 'ch_1', defaultTerrain: 'plain',
        // écran titre : sous-titre, fond, musique, mode d'une nouvelle partie ; crédits (bouton Crédits)
        title: { subtitle: 'Les héros de Varenne', background: '', music: '', newGameMode: 'classic' },
        credits: SAMPLE_CREDITS,
        settings: {
          trueHit: true, doubleThreshold: 4, triangleDmg: 1, triangleHit: 15,
          effectiveMult: 3, critMult: 3, maxLevel: 20, battleAnims: true, overkill: true, overkillExp: 30,
          debugMenu: true, // onglet Debug dans les paramètres du playtest (Échap)
          aiDifficulty: 'normal'
        },
        // convoi (cargaison) : accessible au chef d'escouade, et aux unités adjacentes à lui
        convoy: { capacity: 100, items: [
          { id: 'i_vulnerary' }, { id: 'i_vulnerary' }, { id: 'i_elixir' }, { id: 'w_javelin' },
          { id: 'w_hand_axe' }, { id: 'w_steel_sword' }, { id: 'w_iron_bow' }, { id: 'w_heal' }
        ] },
        // affinités : seuils C/B/A/S, gains, bonus par rang, rang requis pour finir ensemble
        supports: { thresholds: [20, 50, 90, 140], range: 3, gainAdjacent: 3, gainCombat: 2, bonus: { hit: 5, avoid: 5, crit: 3, critAvoid: 3 }, endingRank: 'A' },
        audio: {
          volume: 0.6,
          playerPhase: 'ressources/musiques/Winning_Road.mp3', allyPhase: 'ressources/musiques/Winning_Road.mp3', enemyPhase: 'ressources/musiques/Advance.mp3',
          levelUp: 'ressources/jingles/Level_Up.mp3', gameOver: 'ressources/jingles/Game_Over.mp3', victory: '',
          se: defaultSounds()
        }
      },
      db,
      maps: [sampleMap(), lobbyMap()]
    };
  }

  return { SAMPLE_CREDITS, OLD_SAMPLE_CREDITS, terrains, battlebackOf, BATTLEBACKS, weapons, items, classes: () => linkPromotions(classes()), characters, supports, talks, lobby, defaultSounds, lobbyMap, villageTileset, VILLAGE_TERRAIN, extraActs, arcs, PRICES, emptyDatabase, sampleProject, sampleMap, sampleChapter, SAMPLE_ASCII };
});
