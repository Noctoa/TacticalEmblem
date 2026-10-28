/* Catalogue, attribution, apprentissage et conditions des compétences. */
(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./statuses.js') : root.Statuses);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Skills = api;
})(typeof self !== 'undefined' ? self : this, function (Statuses) {
  'use strict';
  const EFFECTS = [
    { id: 'hit', name: 'Bonus de précision', amount: 'Précision +', value: 10, max: 100, combat: true },
    { id: 'avoid', name: 'Bonus d’esquive', amount: 'Esquive +', value: 10, max: 100, combat: true },
    { id: 'damage', name: 'Bonus de dégâts', amount: 'Dégâts +', value: 3, max: 99, combat: true },
    { id: 'guard', name: 'Réduction des dégâts', amount: 'Dégâts reçus −', value: 2, max: 99, combat: true },
    { id: 'auraAvoid', name: 'Aura d’esquive', amount: 'Esquive des alliés +', value: 10, max: 100 },
    { id: 'renewal', name: 'Régénération', amount: 'PV maximum rendus (%)', value: 10, max: 100 },
    { id: 'luna', name: 'Luna — ignore une partie de la protection', amount: 'Défense / Résistance ignorée (%)', value: 50, max: 100, combat: true, proc: true },
    { id: 'sol', name: 'Sol — soin lié aux dégâts', amount: 'Dégâts réels convertis en soin (%)', value: 50, max: 100, combat: true, proc: true },
    { id: 'vantage', name: 'Vantage — riposte en premier', combat: true },
    { id: 'miracle', name: 'Miracle — survit à un coup mortel', combat: true, proc: true },
    { id: 'lockpick', name: 'Crochetage — ouvre les coffres et les portes', utility: true },
    { id: 'inflictStatus', name: 'Inflige une altération après un coup réussi', combat: true, proc: true }
  ];
  const effectOf = skill => EFFECTS.find(e => e.id === skill.effect);
  function parameters(effect) {
    const spec = EFFECTS.find(e => e.id === effect);
    if (!spec) throw new Error('Effet de compétence inconnu.');
    return { effect, amount: spec.value || 0, activation: spec.proc ? (effect === 'miracle' ? 'lck' : 'skl') : 'always',
      chance: 20, phase: 'any', hpCondition: effect === 'vantage' ? 'below' : 'any', hpThreshold: 50,
      weaponType: '', adjacentAlly: false, range: 1,
      ...(effect === 'inflictStatus' ? { statusId: 'poison', statusTurns: 3, activation: 'fixed', chance: 30 } : {}) };
  }
  const create = (effect = 'hit') => Object.assign({ name: 'Nouvelle compétence', icon: '✦', description: '' }, parameters(effect));
  function presets() {
    return [
      ['precision', 'Précision', '◎', 'hit', {}], ['esquive', 'Esquive', '◇', 'avoid', {}],
      ['offensive', 'Offensive', '⚔', 'damage', { phase: 'initiate' }], ['garde', 'Garde', '▣', 'guard', { phase: 'defend' }],
      ['presence', 'Présence rassurante', '✧', 'auraAvoid', {}], ['regeneration', 'Régénération', '✚', 'renewal', {}],
      ['luna', 'Luna', '☾', 'luna', {}], ['sol', 'Sol', '☀', 'sol', {}],
      ['vantage', 'Vantage', '↶', 'vantage', {}], ['miracle', 'Miracle', '☆', 'miracle', {}],
      ['lockpick', 'Crochetage', '⚿', 'lockpick', {}]
    ].map(([id, name, icon, effect, values]) => Object.assign(create(effect), values, { id: 'skill_' + id, name, icon, image: PRESET_IMAGES[id] || '' }));
  }
  // icônes des compétences de base (img/skills, « icon:<id> », pixel art 16 × 16) ; le symbole reste en secours
  const PRESET_IMAGES = { precision: 'icon:critical', esquive: 'icon:awareness', offensive: 'icon:wrath', garde: 'icon:great-shield', presence: 'icon:charm',
    regeneration: 'icon:renewal', luna: 'icon:luna', sol: 'icon:sol', vantage: 'icon:vantage', miracle: 'icon:miracle-fe5-recolor', lockpick: 'icon:steal' };
  /** Icône par défaut d'une compétence de base (« skill_luna » → « icon:luna »), '' sinon. */
  const presetImage = (id) => PRESET_IMAGES[String(id || '').replace(/^skill_/, '')] || '';
  /** Ancienne icône façon Heroes (« feh:<planche>-<case> ») : retirée, remplacée à l'ouverture du projet (voir upgradeImage). */
  const isLegacyImage = (img) => /^feh:\d+-\d+$/.test(String(img || ''));
  /** Icône d'une compétence d'un ancien projet : « feh:… » → icône de la compétence de base de même id, sinon '' (symbole). */
  const upgradeImage = (s) => (s && isLegacyImage(s.image) ? presetImage(s.id) : s && s.image);
  function validate(s) {
    const errors = [], spec = s && effectOf(s);
    if (!s || typeof s !== 'object' || Array.isArray(s)) return ['La compétence doit être une fiche.'];
    if (typeof s.id !== 'string' || !s.id.trim()) errors.push('Identifiant manquant.');
    if (typeof s.name !== 'string' || !s.name.trim()) errors.push('Le nom est obligatoire.');
    if (typeof s.icon !== 'string' || !s.icon.trim() || [...s.icon].length > 6) errors.push('Le symbole doit contenir un à six caractères.');
    if (typeof s.description !== 'string') errors.push('La description doit être du texte.');
    if (s.image !== undefined && s.image !== '' && !/^icon:[a-z0-9-]+$/.test(String(s.image)) && !isLegacyImage(s.image)) errors.push('Icône inconnue.');
    if (!spec) errors.push('Effet inconnu.');
    if (s.effect === 'inflictStatus' && (!Statuses.get(s.statusId) || !Number.isInteger(s.statusTurns) || s.statusTurns < 1 || s.statusTurns > 9)) errors.push('Altération ou durée invalide (1 à 9 phases).');
    if (spec && spec.utility && (s.phase !== 'any' || s.hpCondition !== 'any' || s.weaponType || s.adjacentAlly)) errors.push('Crochetage est disponible sans condition de combat, de PV ou d’adjacence.');
    if (spec && spec.amount && (!Number.isInteger(s.amount) || s.amount < 1 || s.amount > spec.max)) errors.push(`La valeur doit être un entier de 1 à ${spec.max}.`);
    if (!['any', 'initiate', 'defend'].includes(s.phase)) errors.push('Phase de combat inconnue.');
    if (!['any', 'below', 'above', 'full'].includes(s.hpCondition)) errors.push('Condition de PV inconnue.');
    if (!Number.isInteger(s.hpThreshold) || s.hpThreshold < 1 || s.hpThreshold > 100) errors.push('Le seuil de PV doit être compris entre 1 et 100 %.');
    if (!['always', 'fixed', 'skl', 'lck'].includes(s.activation) || (spec && !spec.proc && s.activation !== 'always')) errors.push('Déclenchement incompatible avec cet effet.');
    if (!Number.isInteger(s.chance) || s.chance < 0 || s.chance > 100) errors.push('La probabilité doit être comprise entre 0 et 100 %.');
    if (!['', 'sword', 'lance', 'axe', 'bow', 'anima', 'light', 'dark', 'staff'].includes(s.weaponType)) errors.push('Type d’arme inconnu.');
    if (typeof s.adjacentAlly !== 'boolean') errors.push('La condition d’adjacence est invalide.');
    if (!Number.isInteger(s.range) || s.range < 1 || s.range > 10) errors.push('Le rayon doit être compris entre 1 et 10 cases.');
    return errors;
  }
  function validateAll(list) {
    if (!Array.isArray(list)) return ['Le catalogue de compétences doit être une liste.'];
    const ids = new Set(), errors = [];
    for (const [i, s] of list.entries()) {
      const prefix = `Compétence ${s && s.name || i + 1} : `;
      errors.push(...validate(s).map(e => prefix + e));
      if (s && ids.has(s.id)) errors.push(prefix + 'identifiant déjà utilisé.');
      if (s) ids.add(s.id);
    }
    return errors;
  }
  function describe(s) {
    const spec = effectOf(s);
    if (!spec) return 'Choisir un effet pour décrire la compétence.';
    const text = {
      hit: `Précision +${s.amount}.`, avoid: `Esquive +${s.amount}.`, damage: `Dégâts +${s.amount}.`, guard: `Dégâts reçus réduits de ${s.amount}, sans descendre sous zéro.`,
      auraAvoid: `Les autres alliés à ${s.range} case(s) ou moins gagnent ${s.amount} d’esquive. Les auras identiques ne se cumulent pas.`,
      renewal: `Rend ${s.amount} % des PV maximum au début de la phase de l’unité, sans dépasser ses PV maximum.`,
      luna: `Ignore ${s.amount} % de la Défense ou de la Résistance applicable à ce coup.`,
      sol: `Rend des PV à hauteur de ${s.amount} % des PV réellement retirés à la cible, sans dépasser les PV maximum.`,
      vantage: 'Riposte avant le premier coup adverse si une riposte est possible.',
      miracle: 'Survit à un coup mortel avec 1 PV si l’unité possédait plus de 1 PV avant ce coup.',
      lockpick: 'Ouvre les coffres et les portes sans clé, sauf serrure interdisant le crochetage. Doit être personnelle ou équipée. L’ouverture consomme l’action.',
      inflictStatus: `Après un coup réussi sur une cible survivante : ${(Statuses.get(s.statusId) || {}).name || 'altération'} pendant ${s.statusTurns} phase(s) de la cible. Ne se cumule pas avec le même effet ; prolonge une durée plus courte.`
    }[s.effect];
    const conditions = [];
    if (spec.combat && s.phase !== 'any') conditions.push(s.phase === 'initiate' ? 'l’unité engage le combat' : 'l’ennemi engage le combat');
    if (s.hpCondition !== 'any') conditions.push(s.hpCondition === 'full' ? 'PV au maximum' : `PV ${s.hpCondition === 'below' ? '≤' : '≥'} ${s.hpThreshold} %`);
    if (spec.combat && s.weaponType) conditions.push('arme : ' + ({ sword: 'épée', lance: 'lance', axe: 'hache', bow: 'arc', anima: 'anima', light: 'lumière', dark: 'ténèbres', staff: 'bâton' }[s.weaponType] || s.weaponType));
    if (s.adjacentAlly) conditions.push('au moins un allié adjacent');
    const activation = !spec.proc || s.activation === 'always' ? '' : s.activation === 'fixed' ? ` Activation : ${s.chance} % par coup.` : ` Activation : ${s.activation === 'skl' ? 'Technique' : 'Chance'} %, plafonnée à 100 %, par coup.`;
    return text + (conditions.length ? ' Conditions : ' + conditions.join(' ; ') + '.' : '') + activation;
  }
  const EQUIPPED_SLOTS = 5;
  function validateAssignment(unit, catalogue, classSkills = []) {
    const errors = [], personal = unit.personalSkill === undefined ? '' : unit.personalSkill;
    const learned = unit.learnedSkills === undefined ? [] : unit.learnedSkills;
    const equipped = unit.equippedSkills === undefined ? [] : unit.equippedSkills;
    const known = catalogue && new Set(catalogue.map(s => s.id));
    if (typeof personal !== 'string') errors.push('La compétence personnelle doit être un identifiant.');
    else if (personal && known && !known.has(personal)) errors.push('Compétence personnelle introuvable : ' + personal + '.');
    for (const [label, ids] of [['apprises', learned], ['équipées', equipped]]) {
      if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !id)) { errors.push('La liste des compétences ' + label + ' est invalide.'); continue; }
      if (new Set(ids).size !== ids.length) errors.push('Une compétence apparaît plusieurs fois dans les compétences ' + label + '.');
      if (known) for (const id of ids) if (!known.has(id)) errors.push('Compétence ' + label + ' introuvable : ' + id + '.');
    }
    if (Array.isArray(equipped)) {
      if (equipped.length > EQUIPPED_SLOTS) errors.push('Une unité peut équiper au maximum cinq compétences en plus de sa personnelle.');
      for (const id of equipped) {
        if (id === personal) errors.push('La personnelle ne doit pas occuper un emplacement équipable.');
        if (Array.isArray(learned) && !learned.includes(id) && !classSkills.includes(id)) errors.push('Une compétence doit être apprise avant d’être équipée : ' + id + '.');
      }
    }
    return errors;
  }
  function validateAssignments(db) {
    return (db.units || []).flatMap(u => validateAssignment(u, db.skills || [],
      combinedLearning(u, (db.classes || []).find(c => c.id === u.classId), u.level || 1, db.skills || []).map(row => row.skillId))
      .map(e => `${u.name || u.id} : ${e}`));
  }
  function loadout(unit, catalogue) {
    const known = catalogue && new Set(catalogue.map(s => s.id));
    const exists = id => typeof id === 'string' && !!id && (!known || known.has(id));
    const personalSkill = exists(unit.personalSkill) ? unit.personalSkill : '';
    const learnedSkills = [...new Set((Array.isArray(unit.learnedSkills) ? unit.learnedSkills : []).filter(exists))];
    const equippedSkills = [...new Set((Array.isArray(unit.equippedSkills) ? unit.equippedSkills : [])
      .filter(id => id !== personalSkill && learnedSkills.includes(id)))].slice(0, EQUIPPED_SLOTS);
    return { personalSkill, learnedSkills, equippedSkills };
  }
  function assigned(unit, catalogue) {
    const set = loadout(unit, catalogue);
    return [{ id: set.personalSkill, origin: 'personal' }, ...set.equippedSkills.map(id => ({ id, origin: 'equipped' }))]
      .filter(entry => entry.id).map(entry => Object.assign({}, entry, { skill: catalogue.find(s => s.id === entry.id) })).filter(entry => entry.skill);
  }
  function usersOf(db, id) {
    return (db.units || []).filter(u => u.personalSkill === id ||
      (Array.isArray(u.learnedSkills) && u.learnedSkills.includes(id)) || (Array.isArray(u.equippedSkills) && u.equippedSkills.includes(id)) ||
      (Array.isArray(u.skillLearning) && u.skillLearning.some(row => row && row.skillId === id)));
  }
  function classUsersOf(db, id) {
    return (db.classes || []).filter(c => Array.isArray(c.skillLearning) && c.skillLearning.some(row => row && row.skillId === id));
  }
  function validateLearning(db) {
    const known = new Set((db.skills || []).map(s => s.id)), errors = [];
    for (const [kind, owner] of [...(db.classes || []).map(c => ['Classe', c]), ...(db.units || []).map(u => ['Personnage', u])]) {
      if (owner.skillLearning === undefined) continue;
      const prefix = `${kind} ${owner.name || owner.id} : `;
      if (!Array.isArray(owner.skillLearning)) { errors.push(prefix + 'le programme de compétences doit être une liste.'); continue; }
      const seen = new Set();
      for (const row of owner.skillLearning) {
        if (!row || !Number.isInteger(row.level) || row.level < 1 || row.level > 99) errors.push(prefix + 'le niveau d’apprentissage doit être un entier de 1 à 99.');
        if (!row || !known.has(row.skillId)) errors.push(prefix + 'compétence à apprendre introuvable.');
        if (row && seen.has(row.skillId)) errors.push(prefix + 'une compétence ne peut apparaître qu’une fois dans le programme.');
        if (row) seen.add(row.skillId);
      }
    }
    return errors;
  }
  function availableLearning(owner, level, catalogue = []) {
    const known = new Set(catalogue.map(s => s.id));
    return (owner && Array.isArray(owner.skillLearning) ? owner.skillLearning : [])
      .filter(row => row && Number.isInteger(row.level) && row.level >= 1 && row.level <= level && known.has(row.skillId))
      .slice().sort((a, b) => a.level - b.level);
  }
  function initialLoadout(unit, cls, catalogue) {
    const automatic = combinedLearning(unit, cls, unit.level || 1, catalogue || []).map(row => row.skillId);
    const learnedSkills = [...new Set([...(Array.isArray(unit.learnedSkills) ? unit.learnedSkills : []), ...automatic])];
    const equippedSkills = Array.isArray(unit.equippedSkills) ? unit.equippedSkills : automatic.filter(id => id !== unit.personalSkill).slice(0, EQUIPPED_SLOTS);
    return loadout(Object.assign({}, unit, { learnedSkills, equippedSkills }), catalogue);
  }
  /** Les deux programmes se complètent ; le premier palier d'une compétence suffit. */
  function combinedLearning(character, cls, level, catalogue = []) {
    const rows = [...availableLearning(cls, level, catalogue), ...availableLearning(character, level, catalogue)]
      .sort((a, b) => a.level - b.level);
    const seen = new Set();
    return rows.filter(row => { if (seen.has(row.skillId)) return false; seen.add(row.skillId); return true; });
  }
  /** Apprend les paliers atteints ; l'interface traite ensuite chaque équipement, dans l'ordre. */
  function learnThroughLevel(unit, cls, catalogue = [], character = unit) {
    Object.assign(unit, loadout(unit));
    const acquired = [];
    for (const row of combinedLearning(character, cls, unit.level || 1, catalogue)) {
      if (row.skillId === unit.personalSkill || unit.learnedSkills.includes(row.skillId)) continue;
      unit.learnedSkills.push(row.skillId); acquired.push(row.skillId);
    }
    return acquired;
  }
  function equipLearned(unit, id, slot) {
    if (id === unit.personalSkill || !(unit.learnedSkills || []).includes(id)) return false;
    const equipped = (unit.equippedSkills || []).slice();
    if (equipped.includes(id)) return false;
    if (slot === undefined) {
      if (equipped.length >= EQUIPPED_SLOTS) return false;
      equipped.push(id);
    } else {
      if (!Number.isInteger(slot) || slot < 0 || slot >= EQUIPPED_SLOTS || slot > equipped.length) return false;
      equipped[slot] = id;
    }
    unit.equippedSkills = equipped; return true;
  }
  function chance(skill, unit) {
    const value = skill.activation === 'always' ? 100 : skill.activation === 'fixed' ? skill.chance : (unit.stats || {})[skill.activation];
    return Math.max(0, Math.min(100, Number(value) || 0));
  }
  /** Conditions lues sur l'état courant ; aucun tirage aléatoire ici. */
  function active(unit, catalogue, context = {}) {
    if (unit.dead || unit.hp <= 0) return [];
    const allied = other => other !== unit && !other.dead && other.hp > 0 &&
      (other.team === 'enemy') === (unit.team === 'enemy');
    return assigned(unit, catalogue).map(entry => entry.skill).filter(skill => {
      const spec = effectOf(skill);
      if (!spec || spec.utility) return false;
      if (spec.combat && skill.phase !== 'any' && (context.initiating === undefined ||
          (skill.phase === 'initiate') !== context.initiating)) return false;
      if (spec.combat && skill.weaponType && (!context.weapon || context.weapon.type !== skill.weaponType)) return false;
      const hp = unit.hp * 100, max = unit.stats.hp;
      if (skill.hpCondition === 'below' && hp > max * skill.hpThreshold) return false;
      if (skill.hpCondition === 'above' && hp < max * skill.hpThreshold) return false;
      if (skill.hpCondition === 'full' && unit.hp !== max) return false;
      if (skill.adjacentAlly && !(context.units || []).some(other => allied(other) && Math.abs(unit.x - other.x) + Math.abs(unit.y - other.y) === 1)) return false;
      return true;
    });
  }
  return { EFFECTS, effectOf, parameters, create, presets, presetImage, isLegacyImage, upgradeImage, validate, validateAll, describe,
    EQUIPPED_SLOTS, validateAssignment, validateAssignments, loadout, assigned, usersOf,
    classUsersOf, validateLearning, availableLearning, combinedLearning, initialLoadout, learnThroughLevel, equipLearned, chance, active };
});
