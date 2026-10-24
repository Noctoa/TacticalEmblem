/*
 * Ultimes (Base de données › Ultimes) : une action spéciale par personnage, utilisable une fois puis rechargée
 * pendant un certain nombre de tours (1 à 9, affiché sur la carte avec les chiffres de img/ui/ultimate).
 *
 *   { id, name, icon, image, description,
 *     cooldown: 3,            tours de recharge après utilisation (1 à 9)
 *     ready: true,            prêt dès le premier tour (sinon il commence en recharge)
 *     effect: 'strike' | 'heal' | 'blast' | 'rally',
 *     castAnimation: 'anim_…', animation de lancement, jouée sur le lanceur quand il lance l'ultime
 *     animation: 'anim_…',    animation d'impact (frappe : remplace celle de l'arme ; zone : sur chaque unité touchée)
 *     strike : power (% des dégâts), sureHit (touche assurée), noCounter (pas de riposte)
 *     heal   : amount (% des PV max), radius, self (le lanceur aussi), cure (dissipe les altérations)
 *     blast  : area ('self' autour du lanceur | 'tile' case choisie), range (portée de la case), radius,
 *              stat ('str' | 'mag' | 'best'), power (% de la stat), lethal (peut vaincre ; sinon laisse 1 PV)
 *     rally  : radius, self, dmg / hit / avoid (bonus), duration (tours), refresh (les alliés ayant joué rejouent) }
 *
 * Un personnage a au plus un ultime : champ « ultimate » de sa fiche (Unités). La recharge baisse d'un tour
 * au début de chaque phase de son camp ; l'ultime est prêt à 0.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Ultimates = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const EFFECTS = [
    { id: 'strike', name: 'Frappe ultime — attaque une cible' },
    { id: 'heal', name: 'Soin de zone' },
    { id: 'blast', name: 'Dégâts de zone' },
    { id: 'rally', name: 'Renfort d’alliés' }
  ];
  const STATS = [{ value: 'best', label: 'La plus haute (For ou Mag)' }, { value: 'str', label: 'Force (contre la Défense)' }, { value: 'mag', label: 'Magie (contre la Résistance)' }];
  const AREAS = [{ value: 'self', label: 'Autour du lanceur' }, { value: 'tile', label: 'Autour d’une case choisie' }];
  const ID = /^[A-Za-z0-9_-]{1,64}$/;
  const ICON = 'ultimate'; // image par défaut : img/ui/ultimate/icon.png (voir skill-icons.js)
  const byId = (list, id) => (list || []).find(x => x && x.id === id) || null;
  const effectOf = (u) => EFFECTS.find(e => e.id === (u && u.effect)) || null;

  function parameters(effect) {
    switch (effect) {
      case 'strike': return { power: 200, sureHit: true, noCounter: false };
      case 'heal': return { amount: 50, radius: 2, self: true, cure: false };
      case 'blast': return { area: 'tile', range: 3, radius: 1, stat: 'best', power: 100, lethal: true };
      case 'rally': return { radius: 2, self: false, dmg: 3, hit: 10, avoid: 10, duration: 1, refresh: false };
      default: throw new Error('Effet d’ultime inconnu.');
    }
  }
  const PARAM_KEYS = ['power', 'sureHit', 'noCounter', 'amount', 'radius', 'self', 'cure', 'area', 'range', 'stat', 'lethal', 'dmg', 'hit', 'avoid', 'duration', 'refresh'];
  /** Remplace les réglages propres à l'effet (changement de type). */
  function setEffect(u, effect) {
    for (const k of PARAM_KEYS) delete u[k];
    return Object.assign(u, { effect }, parameters(effect));
  }
  const create = (effect = 'strike') => Object.assign({ name: 'Nouvel ultime', icon: '✹', image: ICON, description: '', cooldown: 3, ready: true, castAnimation: '', animation: '', effect }, parameters(effect));

  function samples() {
    return [
      Object.assign(create('strike'), { id: 'ult_assaut', name: 'Assaut fulgurant', description: 'Un coup assuré qui inflige le double des dégâts.', cooldown: 3, castAnimation: 'anim_sol', animation: 'anim_luna' }),
      Object.assign(create('heal'), { id: 'ult_aurore', name: 'Aurore', description: 'Rend la moitié de leurs PV aux alliés proches et dissipe leurs altérations.', cooldown: 4, cure: true, castAnimation: 'anim_heal', animation: 'anim_heal' }),
      Object.assign(create('blast'), { id: 'ult_meteore', name: 'Météore', description: 'Une pluie de feu sur une zone choisie à 3 cases.', cooldown: 4, ready: false, castAnimation: 'anim_thunder', animation: 'anim_fire_hit' }),
      Object.assign(create('rally'), { id: 'ult_cri', name: 'Cri de ralliement', description: 'Les alliés proches gagnent des bonus et ceux qui ont déjà agi rejouent.', cooldown: 5, refresh: true, castAnimation: 'anim_sol' })
    ];
  }
  /** Ultimes des personnages de l'exemple (sampleProject). */
  const SAMPLE_UNITS = { c_eliwood: 'ult_cri', c_lyn: 'ult_assaut', c_hector: 'ult_meteore', c_serra: 'ult_aurore', c_cloud: 'ult_assaut' };

  function validate(u, list) {
    const errors = [], who = u && u.name ? `Ultime « ${u.name} »` : 'Ultime';
    if (!u || typeof u !== 'object' || Array.isArray(u)) return ['Un ultime doit être une fiche.'];
    if (typeof u.id !== 'string' || !ID.test(u.id)) errors.push(`${who} : identifiant invalide.`);
    if (typeof u.name !== 'string' || !u.name.trim()) errors.push(`${who} : nom manquant.`);
    const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
    if (!int(u.cooldown, 1, 9)) errors.push(`${who} : recharge entre 1 et 9 tours.`);
    if (!effectOf(u)) { errors.push(`${who} : effet inconnu.`); return errors; }
    if (u.effect === 'strike' && !int(u.power, 100, 500)) errors.push(`${who} : dégâts entre 100 et 500 %.`);
    if (u.effect === 'heal' && !int(u.amount, 1, 100)) errors.push(`${who} : soin entre 1 et 100 % des PV.`);
    if (['heal', 'blast', 'rally'].includes(u.effect) && !int(u.radius, u.effect === 'blast' ? 0 : 1, 6)) errors.push(`${who} : rayon entre ${u.effect === 'blast' ? 0 : 1} et 6 cases.`);
    if (u.effect === 'blast') {
      if (!AREAS.some(a => a.value === u.area)) errors.push(`${who} : zone inconnue.`);
      if (u.area === 'tile' && !int(u.range, 1, 9)) errors.push(`${who} : portée entre 1 et 9 cases.`);
      if (u.area === 'self' && u.radius < 1) errors.push(`${who} : rayon d’au moins 1 case autour du lanceur.`);
      if (!STATS.some(s => s.value === u.stat)) errors.push(`${who} : statistique inconnue.`);
      if (!int(u.power, 10, 500)) errors.push(`${who} : puissance entre 10 et 500 %.`);
    }
    if (u.effect === 'rally') {
      for (const k of ['dmg', 'hit', 'avoid']) if (!int(u[k], 0, 99)) errors.push(`${who} : bonus entre 0 et 99.`);
      if (!int(u.duration, 1, 9)) errors.push(`${who} : durée entre 1 et 9 tours.`);
      if (!u.dmg && !u.hit && !u.avoid && !u.refresh) errors.push(`${who} : aucun effet (bonus à 0 et sans nouveau tour).`);
    }
    return errors;
  }
  function validateAll(list) {
    if (list === undefined) return [];
    if (!Array.isArray(list)) return ['Les ultimes doivent être une liste.'];
    const ids = new Set(), errors = [];
    for (const u of list) {
      errors.push(...validate(u, list));
      if (u && ids.has(u.id)) errors.push(`Ultime : identifiant en double (${u.id}).`);
      if (u) ids.add(u.id);
    }
    return errors;
  }
  /** Personnages → ultimes existants ; ultimes → animations existantes. */
  function validateLinks(db) {
    const list = (db && db.ultimates) || [], errors = [];
    for (const c of (db && db.units) || []) if (c && c.ultimate && !byId(list, c.ultimate)) errors.push(`Unité « ${c.name} » : ultime introuvable.`);
    for (const u of list) for (const [k, what] of [['animation', 'animation d’impact'], ['castAnimation', 'animation de lancement']])
      if (u && u[k] && db && Array.isArray(db.animations) && !byId(db.animations, u[k])) errors.push(`Ultime « ${u.name} » : ${what} introuvable.`);
    return errors;
  }
  const usersOf = (db, id) => ((db && db.units) || []).filter(c => c.ultimate === id).map(c => 'Unité « ' + c.name + ' »');
  function forget(db, id) { for (const c of (db && db.units) || []) if (c.ultimate === id) c.ultimate = ''; }

  // ---------------------------------------------------------------- en jeu
  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  /** Recharge au début de la bataille. */
  const initialCharge = (u) => (!u ? 0 : u.ready === false ? u.cooldown : 0);
  /** Cases à distance ≤ r d'un centre (dans la carte si width / height sont donnés). */
  function area(center, r, width, height) {
    const out = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > r) continue;
      const x = center.x + dx, y = center.y + dy;
      if (width !== undefined && (x < 0 || y < 0 || x >= width || y >= height)) continue;
      out.push({ x, y });
    }
    return out;
  }
  /** Centre de la zone (lanceur, ou case choisie pour une zone à distance). */
  const centerOf = (ult, caster, tile) => (ult.effect === 'blast' && ult.area === 'tile' ? tile : caster);
  /** Unités touchées : alliés (soin, renfort) ou adversaires (dégâts) dans la zone. */
  function affected(ult, caster, units, tile) {
    const c = centerOf(ult, caster, tile); if (!c) return [];
    const r = ult.radius || 0, alive = units.filter(o => o && !o.dead && o.hp > 0 && dist(o, c) <= r);
    const friend = (o) => (caster.team === 'enemy') === (o.team === 'enemy');
    if (ult.effect === 'blast') return alive.filter(o => !friend(o));
    return alive.filter(o => friend(o) && (o !== caster || ult.self));
  }
  const healAmount = (ult, target) => Math.min(target.stats.hp - target.hp, Math.max(1, Math.floor(target.stats.hp * ult.amount / 100)));
  /** Dégâts de zone : stat du lanceur × puissance − Déf (For) ou Rés (Mag) ; sans « peut vaincre », laisse 1 PV. */
  function blastDamage(ult, caster, target) {
    const magic = ult.stat === 'mag' || (ult.stat === 'best' && caster.stats.mag > caster.stats.str);
    const power = Math.floor((magic ? caster.stats.mag : caster.stats.str) * ult.power / 100);
    const dmg = Math.max(0, power - (magic ? target.stats.res : target.stats.def));
    return ult.lethal ? Math.min(dmg, target.hp) : Math.min(dmg, Math.max(0, target.hp - 1));
  }
  /** Réglages de la frappe pour Rules.resolveCombat (opts.ultimate). */
  const strikeOpts = (ult) => ({ id: ult.id, name: ult.name, castAnimation: ult.castAnimation || '', icon: ult.icon || '✹', image: ult.image || ICON, animation: ult.animation || '',
    power: ult.power, sureHit: !!ult.sureHit, noCounter: !!ult.noCounter });
  /** Dégâts d'un coup d'ultime (après protection et critique). */
  const strikeDamage = (damage, ult) => Math.floor(damage * ((ult && ult.power) || 100) / 100);
  /** Bonus de renfort encore actifs sur une unité : { dmg, hit, avoid } (cumul du meilleur de chaque). */
  function rallyBonus(unit) {
    const list = (unit && unit.rally) || [];
    if (!list.length) return null;
    const b = { dmg: 0, hit: 0, avoid: 0, crit: 0, critAvoid: 0 };
    for (const r of list) for (const k of ['dmg', 'hit', 'avoid']) b[k] = Math.max(b[k], r[k] || 0);
    return b;
  }
  /** Début de phase du camp : recharge −1, renforts expirés. Renvoie les unités dont l'ultime vient d'être prêt. */
  function beginPhase(units) {
    const ready = [];
    for (const u of units) {
      if (u.ultCharge > 0) { u.ultCharge--; if (u.ultCharge === 0) ready.push(u); }
      if (u.rally && u.rally.length) u.rally = u.rally.map(r => ({ ...r, turns: r.turns - 1 })).filter(r => r.turns > 0);
    }
    return ready;
  }
  function describe(u) {
    if (!u) return '';
    const parts = [];
    if (u.effect === 'strike') parts.push(`Attaque une cible : dégâts ×${(u.power / 100).toLocaleString('fr-FR')}`, u.sureHit ? 'touche assurée' : '', u.noCounter ? 'sans riposte' : '');
    if (u.effect === 'heal') parts.push(`Soigne ${u.amount} % des PV des alliés à ${u.radius} case(s)${u.self ? ', lanceur compris' : ''}`, u.cure ? 'dissipe les altérations' : '');
    if (u.effect === 'blast') parts.push(`Dégâts de zone (rayon ${u.radius}) ${u.area === 'tile' ? `sur une case à ${u.range} case(s) maximum` : 'autour du lanceur'} : ${u.power} % de ${u.stat === 'str' ? 'la Force' : u.stat === 'mag' ? 'la Magie' : 'la meilleure stat (For / Mag)'}`, u.lethal ? '' : 'laisse au moins 1 PV');
    if (u.effect === 'rally') parts.push(`Alliés à ${u.radius} case(s)${u.self ? ', lanceur compris' : ''} : ` + [u.dmg ? `dégâts +${u.dmg}` : '', u.hit ? `précision +${u.hit}` : '', u.avoid ? `esquive +${u.avoid}` : ''].filter(Boolean).join(', ') + (u.dmg || u.hit || u.avoid ? ` pendant ${u.duration} tour(s)` : ''), u.refresh ? 'ceux qui ont déjà agi rejouent' : '');
    return parts.filter(Boolean).join(' · ') + ` · recharge ${u.cooldown} tour(s)${u.ready === false ? ' (en recharge au départ)' : ''}.`;
  }

  /** Animations (lancement, impact) d'exemple absentes du projet : retirées de ces ultimes. */
  function dropMissingAnimations(list, animations) {
    for (const u of list) for (const k of ['animation', 'castAnimation']) if (u[k] && !(animations || []).some(a => a.id === u[k])) u[k] = '';
    return list;
  }

  return { dropMissingAnimations, EFFECTS, STATS, AREAS, ICON, effectOf, parameters, setEffect, create, samples, SAMPLE_UNITS, validate, validateAll, validateLinks,
    usersOf, forget, initialCharge, area, centerOf, affected, healAmount, blastDamage, strikeOpts, strikeDamage, rallyBonus, beginPhase, describe, byId };
});
