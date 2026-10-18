/* Catalogue de compétences. Les effets seront raccordés au moteur de combat séparément. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Skills = api;
})(typeof self !== 'undefined' ? self : this, function () {
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
    { id: 'miracle', name: 'Miracle — survit à un coup mortel', combat: true, proc: true }
  ];
  const effectOf = skill => EFFECTS.find(e => e.id === skill.effect);
  function parameters(effect) {
    const spec = EFFECTS.find(e => e.id === effect);
    if (!spec) throw new Error('Effet de compétence inconnu.');
    return { effect, amount: spec.value || 0, activation: spec.proc ? (effect === 'miracle' ? 'lck' : 'skl') : 'always',
      chance: 20, phase: 'any', hpCondition: effect === 'vantage' ? 'below' : 'any', hpThreshold: 50,
      weaponType: '', adjacentAlly: false, range: 1 };
  }
  const create = (effect = 'hit') => Object.assign({ name: 'Nouvelle compétence', icon: '✦', description: '' }, parameters(effect));
  function presets() {
    return [
      ['precision', 'Précision', '◎', 'hit', {}], ['esquive', 'Esquive', '◇', 'avoid', {}],
      ['offensive', 'Offensive', '⚔', 'damage', { phase: 'initiate' }], ['garde', 'Garde', '▣', 'guard', { phase: 'defend' }],
      ['presence', 'Présence rassurante', '✧', 'auraAvoid', {}], ['regeneration', 'Régénération', '✚', 'renewal', {}],
      ['luna', 'Luna', '☾', 'luna', {}], ['sol', 'Sol', '☀', 'sol', {}],
      ['vantage', 'Vantage', '↶', 'vantage', {}], ['miracle', 'Miracle', '☆', 'miracle', {}]
    ].map(([id, name, icon, effect, values]) => Object.assign(create(effect), values, { id: 'skill_' + id, name, icon }));
  }
  function validate(s) {
    const errors = [], spec = s && effectOf(s);
    if (!s || typeof s !== 'object' || Array.isArray(s)) return ['La compétence doit être une fiche.'];
    if (typeof s.id !== 'string' || !s.id.trim()) errors.push('Identifiant manquant.');
    if (typeof s.name !== 'string' || !s.name.trim()) errors.push('Le nom est obligatoire.');
    if (typeof s.icon !== 'string' || !s.icon.trim() || [...s.icon].length > 6) errors.push('Le symbole doit contenir un à six caractères.');
    if (typeof s.description !== 'string') errors.push('La description doit être du texte.');
    if (!spec) errors.push('Effet inconnu.');
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
      miracle: 'Survit à un coup mortel avec 1 PV si l’unité possédait plus de 1 PV avant ce coup.'
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
  function validateAssignment(unit, catalogue) {
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
        if (Array.isArray(learned) && !learned.includes(id)) errors.push('Une compétence doit être apprise avant d’être équipée : ' + id + '.');
      }
    }
    return errors;
  }
  function validateAssignments(db) {
    return (db.units || []).flatMap(u => validateAssignment(u, db.skills || []).map(e => `${u.name || u.id} : ${e}`));
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
      (Array.isArray(u.learnedSkills) && u.learnedSkills.includes(id)) || (Array.isArray(u.equippedSkills) && u.equippedSkills.includes(id)));
  }
  return { EFFECTS, effectOf, parameters, create, presets, validate, validateAll, describe,
    EQUIPPED_SLOTS, validateAssignment, validateAssignments, loadout, assigned, usersOf };
});
