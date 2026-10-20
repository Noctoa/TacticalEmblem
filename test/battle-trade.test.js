'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Trade = require('../src/shared/battle-trade'), D = require('../src/shared/defaults'), R = require('../src/shared/rules'), C = require('../src/shared/campaign');
function fixture() {
  const db = D.sampleProject('Échanges').db;
  const actor = R.makeUnitFromCharacter(db.units[0], db, { x: 1, y: 1 });
  const partner = R.makeUnitFromCharacter(db.units[1], db, { x: 2, y: 1 });
  actor.inventory = [{ id: 'i_vulnerary', uses: 2 }]; partner.inventory = [{ id: 'w_iron_sword', uses: 7 }];
  const state = { units: [actor, partner], mode: 'chapter', phase: 'player', busy: false, over: false };
  return { db, actor, partner, state };
}
test('échange : joueurs adjacents, partenaire ayant déjà joué et transfert dans les deux sens', () => {
  const { actor, partner, state } = fixture(); partner.done = true;
  assert.deepEqual(Trade.partners(state, actor), [partner]);
  assert.ok(Trade.transfer(state, actor, partner, partner, 0).ok);
  assert.equal(actor.inventory[1].uses, 7); assert.equal(partner.inventory.length, 0);
  assert.ok(actor.tradeLocked); assert.equal(actor.done, false); assert.equal(partner.done, true);
  assert.ok(Trade.transfer(state, actor, partner, actor, 0).ok);
  assert.deepEqual(partner.inventory, [{ id: 'i_vulnerary', uses: 2 }]);
});
test('refus hors bataille, hors tour et pour une unité occupée, morte, ennemie, verte ou distante', () => {
  for (const alter of [f => f.state.mode = 'lobby', f => f.state.phase = 'ally', f => f.state.busy = true, f => f.state.over = true,
    f => f.actor.done = true, f => f.actor.hp = 0, f => f.actor.dead = true, f => f.actor.team = 'ally',
    f => f.partner.team = 'enemy', f => f.partner.team = 'ally', f => f.partner.dead = true, f => f.partner.hp = 0,
    f => f.partner.x = 3, f => { f.partner.x = 2; f.partner.y = 2; }, f => f.state.units.pop()]) {
    const f = fixture(); alter(f); const before = JSON.stringify(f.state);
    assert.equal(Trade.transfer(f.state, f.actor, f.partner, f.actor, 0).ok, false);
    assert.equal(JSON.stringify(f.state), before);
  }
});
test('inventaires pleins : échange atomique, usages et nombre total conservés', () => {
  const { actor, partner, state } = fixture();
  actor.inventory.push(...Array.from({ length: 4 }, () => ({ id: 'i_chest_key', uses: 3 })));
  partner.inventory.push(...Array.from({ length: 4 }, () => ({ id: 'i_door_key', uses: 1 })));
  const contents = () => [...actor.inventory, ...partner.inventory].map(s => s.id + ':' + s.uses).sort();
  const before = contents(); assert.equal(Trade.transfer(state, actor, partner, actor, 0).ok, false); assert.ok(!actor.tradeLocked);
  assert.ok(Trade.transfer(state, actor, partner, actor, 0, 0).ok);
  assert.equal(actor.inventory[0].id, 'w_iron_sword'); assert.equal(actor.inventory[0].uses, 7);
  assert.deepEqual(contents(), before); assert.equal(actor.inventory.length, 5); assert.equal(partner.inventory.length, 5);
});
test('indices invalides, auto-échange, source extérieure et convoi refusés sans mutation', () => {
  const { actor, partner, state } = fixture();
  for (const args of [[actor, -1], [actor, 0.5], [actor, 9], [actor, 0, -1], [actor, 0, 5], [{ sourceId: '@convoy' }, 0]]) {
    const before = JSON.stringify(state); assert.equal(Trade.transfer(state, actor, partner, ...args).ok, false); assert.equal(JSON.stringify(state), before);
  }
  assert.equal(Trade.transfer(state, actor, actor, actor, 0).ok, false);
  actor.inventory = []; partner.inventory = []; assert.deepEqual(Trade.partners(state, actor), []);
});
test('première arme utilisable recalculée pour les deux personnages après échange', () => {
  const { actor, partner, state, db } = fixture();
  actor.inventory = [{ id: 'w_iron_sword', uses: 11 }]; partner.inventory = [{ id: 'w_iron_bow', uses: 6 }];
  assert.ok(R.equipped(actor, db));
  Trade.transfer(state, actor, partner, actor, 0, 0);
  assert.equal(R.equipped(actor, db), null); assert.equal(R.equipped(partner, db).weapon.id, 'w_iron_sword');
});
test('recommencer restaure les inventaires ; victoire et sauvegarde conservent les échanges sans verrou de tour', () => {
  const { actor, partner, state, db } = fixture(), campaign = C.create('classic');
  C.commit(campaign, state.units); const checkpoint = C.checkpoint('ch_1', campaign, [], {});
  Trade.transfer(state, actor, partner, partner, 0);
  C.commit(campaign, state.units); assert.equal(campaign.units[actor.sourceId].tradeLocked, undefined);
  const next = C.apply(campaign, R.makeUnitFromCharacter(db.units[0], db, { x: 0, y: 0 }), db);
  assert.equal(next.inventory[1].uses, 7); assert.ok(!next.tradeLocked);
  const retry = C.restore(checkpoint, {}).campaign;
  assert.deepEqual(retry.units[actor.sourceId].inventory, [{ id: 'i_vulnerary', uses: 2 }]);
  assert.deepEqual(retry.units[partner.sourceId].inventory, [{ id: 'w_iron_sword', uses: 7 }]);
});
