/* Échanges en bataille : le partenaire garde son action, l'initiateur valide son déplacement. */
(function (root, factory) {
  const common = typeof module !== 'undefined' && module.exports;
  const api = factory(common ? require('./rules.js') : root.Rules, common ? require('./team.js') : root.Team);
  if (common) module.exports = api; else root.BattleTrade = api;
})(typeof self !== 'undefined' ? self : this, function (R, Team) {
  'use strict';
  const alivePlayer = u => u && u.team === 'player' && !u.dead && u.hp > 0;
  function available(state, actor, partner) {
    return state.mode === 'chapter' && state.phase === 'player' && !state.busy && !state.over &&
      state.units.includes(actor) && state.units.includes(partner) && actor !== partner &&
      alivePlayer(actor) && !actor.done && alivePlayer(partner) && R.dist(actor, partner) === 1;
  }
  function partners(state, actor) { return state.units.filter(u => available(state, actor, u) && (actor.inventory.length || u.inventory.length)); }
  function transfer(state, actor, partner, source, index, swapIndex) {
    if (!available(state, actor, partner) || ![actor, partner].includes(source)) return { ok: false, error: 'Choisis un personnage du joueur adjacent et vivant pendant ton tour.' };
    const target = source === actor ? partner : actor;
    const result = Team.transfer({ members: [actor, partner] }, source.sourceId, target.sourceId, index, swapIndex);
    if (result.ok) actor.tradeLocked = true;
    return result;
  }
  return { available, partners, transfer };
});
