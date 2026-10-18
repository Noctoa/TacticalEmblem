/* État de campagne indépendant du rendu. Les sauvegardes sont des débuts de chapitre. */
(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./skills.js') : root.Skills);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Campaign = api;
})(typeof self !== 'undefined' ? self : this, function (Skills) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const FIELDS = ['classId', 'level', 'exp', 'stats', 'growths', 'inventory', 'mov', 'moveType', 'personalSkill', 'learnedSkills', 'equippedSkills', 'effectiveLevel'];
  const create = mode => ({ mode: mode === 'casual' ? 'casual' : 'classic', dead: [], units: {} });
  const permanent = (campaign, unit) => campaign.mode === 'classic' && unit.deathPolicy !== 'retreat';
  function commit(campaign, units) {
    for (const u of units) {
      if (u.team === 'enemy') continue;
      if ((u.dead || u.hp <= 0) && permanent(campaign, u)) {
        if (!campaign.dead.includes(u.sourceId)) campaign.dead.push(u.sourceId);
        delete campaign.units[u.sourceId];
        continue;
      }
      const saved = {};
      for (const k of FIELDS) if (u[k] !== undefined) saved[k] = clone(u[k]);
      campaign.units[u.sourceId] = saved;
    }
  }
  function apply(campaign, unit, db) {
    const saved = campaign.units[unit.sourceId];
    if (saved) for (const k of FIELDS) if (saved[k] !== undefined) unit[k] = clone(saved[k]);
    const cls = db.classes.find(c => c.id === unit.classId);
    const character = db.units.find(c => c.id === unit.sourceId) || {};
    unit.mapSprite = character.mapSprite || (cls && cls.mapSprite) || '';
    unit.battler = character.battler || (cls && cls.battler) || '';
    unit.deathPolicy = character.deathPolicy || 'mode';
    Object.assign(unit, Skills.loadout(unit, db.skills));
    Skills.learnThroughLevel(unit, cls, db.skills || [], character);
    unit.hp = unit.stats.hp;
    return unit;
  }
  function checkpoint(chapterId, campaign, convoy, supports) {
    const supportState = {};
    for (const [id, s] of Object.entries(supports)) supportState[id] = { points: s.points, rank: s.rank };
    return clone({ version: 1, chapterId, campaign, convoy, supports: supportState });
  }
  function validate(save) {
    if (!save || save.version !== 1 || typeof save.chapterId !== 'string' || !save.chapterId ||
      !save.campaign || !['classic', 'casual'].includes(save.campaign.mode) ||
      !Array.isArray(save.campaign.dead) || !save.campaign.units || typeof save.campaign.units !== 'object' || Array.isArray(save.campaign.units) ||
      !Array.isArray(save.convoy) || !save.supports || typeof save.supports !== 'object') throw new Error('Sauvegarde de campagne invalide ou version non prise en charge.');
    for (const u of Object.values(save.campaign.units)) if (!u || !u.stats || !Number.isFinite(u.stats.hp) || !Array.isArray(u.inventory)) throw new Error('Une unité de la sauvegarde est illisible.');
    for (const u of Object.values(save.campaign.units)) {
      const errors = Skills.validateAssignment(u);
      if (errors.length) throw new Error('Compétences invalides dans la campagne : ' + errors.join(' '));
    }
    return save;
  }
  function restore(save, supports) {
    validate(save);
    for (const [id, s] of Object.entries(supports)) {
      const old = save.supports[id];
      if (old) { s.points = old.points; s.rank = old.rank; }
    }
    return { campaign: clone(save.campaign), convoy: clone(save.convoy) };
  }
  return { create, permanent, commit, apply, checkpoint, validate, restore };
});
