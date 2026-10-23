'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const S = require('../src/shared/side-objectives'), C = require('../src/shared/campaign'), M = require('../src/shared/mission');
const IO = require('../src/main/project-io'), fs = require('fs'), os = require('os'), path = require('path');
function fixture(objectives = []) {
  const db = { units: [{ id: 'hero', name: 'Héros' }, { id: 'ally', name: 'Allié' }], weapons: [{ id: 'sword', name: 'Épée', uses: 30 }], items: [{ id: 'potion', name: 'Potion', uses: 3 }] };
  const ch = { id: 'act', name: 'Acte', players: [{ unitId: 'hero' }], allies: [{ unitId: 'ally' }], enemies: [{ id: 'boss', name: 'Chef' }],
    villages: [{ id: 'v', name: 'Village' }], chests: [{ id: 'c', name: 'Coffre' }], secondaryObjectives: objectives };
  const hero = { sourceId: 'hero', name: 'Héros', team: 'player', hp: 20, inventory: [] }, ally = { sourceId: 'ally', team: 'ally', hp: 15, inventory: [] }, boss = { sourceId: 'boss', team: 'enemy', hp: 20 };
  const state = { turn: 1, units: [hero, ally, boss], pending: [], campaign: C.create('casual', 10), convoy: [], convoyCap: 2, visitedVillages: new Set(), openedChests: new Set(), secondaryPaid: new Set() };
  return { db, ch, state, hero, ally, boss };
}
const objective = (type, rest = {}) => ({ id: type, type, ...rest });
test('anciens actes et sauvegardes : aucun défi ajouté implicitement', () => {
  const f = fixture(); delete f.ch.secondaryObjectives;
  assert.deepEqual(S.list(f.ch), []); assert.deepEqual(S.validate(f.ch, f.db), []);
  assert.equal(Object.keys(S.advance(f.ch, f.state)).length, 0);
  assert.doesNotThrow(() => C.validate(C.checkpoint('act', f.state.campaign, [], {})));
});
test('victoire au dernier tour inclus, échec facultatif après le délai', () => {
  const f = fixture([objective('turn', { turns: 3 })]);
  f.state.turn = 3;
  assert.equal(S.advance(f.ch, f.state).turn.status, 'pending');
  assert.equal(S.advance(f.ch, f.state, {}, true).turn.status, 'success');
  f.state.turn = 4; const progress = S.advance(f.ch, f.state);
  assert.equal(progress.turn.status, 'failed');
  f.state.turn = 2; assert.equal(S.advance(f.ch, f.state, progress, true).turn.status, 'failed');
  f.ch.objective = { type: 'rout' }; f.boss.hp = 0;
  assert.equal(M.evaluate(f.ch, f.db, f.state).outcome, 'victory');
});
test('victoire de survie à la fin d’un tour : le tour complet compte avant le changement de phase', () => {
  const f = fixture([objective('turn', { turns: 3 })]);
  f.state.turn = 4; f.state.secondaryTurn = 3;
  assert.equal(S.advance(f.ch, f.state, {}, true).turn.status, 'success');
});
test('protection jusqu’à la victoire, retrait Détente et absence échouent sans imposer le déploiement', () => {
  const f = fixture([objective('protect', { target: 'ally' })]);
  assert.equal(S.advance(f.ch, f.state).protect.status, 'pending');
  assert.equal(S.advance(f.ch, f.state, {}, true).protect.status, 'success');
  f.ally.hp = 0; const failed = S.advance(f.ch, f.state);
  assert.equal(failed.protect.status, 'failed');
  f.ally.hp = 20; assert.equal(S.advance(f.ch, f.state, failed, true).protect.status, 'failed');
  f.state.units.splice(1, 1); assert.equal(S.advance(f.ch, f.state, {}, true).protect.status, 'failed');
});
test('cible : succès au dernier tour, gardé après le délai ; un renfort en attente ne compte pas vaincu', () => {
  const f = fixture([objective('target', { target: 'boss', turns: 2 })]);
  f.state.pending.push(f.state.units.pop());
  assert.equal(S.advance(f.ch, f.state).target.status, 'pending');
  f.state.units.push(f.state.pending.pop()); f.state.turn = 2; f.boss.dead = true;
  const progress = S.advance(f.ch, f.state); assert.equal(progress.target.status, 'success');
  f.state.turn = 8; assert.equal(S.advance(f.ch, f.state, progress, true).target.status, 'success');
  assert.equal(S.advance(f.ch, f.state, {}, true).target.status, 'failed');
});
test('villages/coffres : interactions de la tentative et première réussite différée après un rejeu', () => {
  const f = fixture([objective('village', { target: 'v' }), objective('chest', { target: 'c' })]);
  f.state.visitedVillages.add('v'); f.state.openedChests.add('c');
  const progress = S.advance(f.ch, f.state); assert.equal(progress.village.status, 'success'); assert.equal(progress.chest.status, 'success');
  f.state.visitedVillages.clear(); f.state.openedChests.clear();
  f.state.campaign.villageVisits = [{ chapterId: 'act', villageId: 'v' }];
  f.state.campaign.chestVisits = [{ chapterId: 'act', chestId: 'c' }];
  assert.equal(S.advance(f.ch, f.state).village.status, 'success'); assert.equal(S.advance(f.ch, f.state).chest.status, 'success');
  f.ch.secondaryObjectives.forEach(o => o.repeatOnReplay = true);
  assert.equal(S.advance(f.ch, f.state).village.status, 'pending'); assert.equal(S.advance(f.ch, f.state).chest.status, 'pending');
});
test('conditions de scénario vraies/fausses, succès conservé et défis non accomplis échoués à la victoire', () => {
  const f = fixture([objective('flag', { flag: 'rescued', value: true }), objective('flag', { id: 'false', flag: 'alarm', value: false })]);
  let progress = S.advance(f.ch, f.state); assert.equal(progress.flag.status, 'pending'); assert.equal(progress.false.status, 'success');
  f.state.campaign.scenario = { flags: { rescued: true }, events: [] };
  progress = S.advance(f.ch, f.state, progress); f.state.campaign.scenario.flags.rescued = false;
  assert.equal(S.advance(f.ch, f.state, progress, true).flag.status, 'success');
  assert.equal(S.advance(f.ch, f.state, {}, true).flag.status, 'failed');
});
test('convoi plein : reprise défi par défi, sans payer l’or d’un objet bloqué ni dupliquer les gains', () => {
  const f = fixture([objective('turn', { id: 'gold', turns: 5, reward: { gold: 50 } }),
    objective('turn', { id: 'item', turns: 5, reward: { gold: 100, itemId: 'sword', uses: 7 } }),
    objective('turn', { id: 'other', turns: 5, reward: { itemId: 'potion' } })]);
  f.state.convoyCap = 1; f.state.convoy.push({ id: 'potion', uses: 1 }); const progress = S.advance(f.ch, f.state, {}, true);
  assert.equal(S.grant(f.ch, f.db, f.state, progress).ok, false);
  assert.equal(f.state.campaign.gold, 60); assert.equal(f.state.convoy.length, 1); assert.equal(f.state.secondaryPaid.size, 1); assert.equal(f.state.campaign.secondaryClaims.length, 1);
  f.state.convoy.splice(0); assert.equal(S.grant(f.ch, f.db, f.state, progress).ok, false);
  assert.equal(f.state.campaign.gold, 160); assert.deepEqual(f.state.convoy, [{ id: 'sword', uses: 7 }]);
  f.state.convoy.splice(0); assert.equal(S.grant(f.ch, f.db, f.state, progress).ok, true);
  assert.deepEqual(f.state.convoy, [{ id: 'potion', uses: 3 }]);
  assert.equal(S.grant(f.ch, f.db, f.state, progress).awarded.length, 0); assert.equal(f.state.campaign.gold, 160);
});
test('récompenses destinées à une unité : inventaire, débordement au convoi et destinataire absent/vaincu', () => {
  const f = fixture(Array.from({ length: 3 }, (_, i) => objective('turn', { id: String(i), turns: 3, reward: { itemId: 'potion', unitId: 'hero' } })));
  f.hero.inventory = Array.from({ length: 4 }, () => ({ id: 'sword', uses: 1 }));
  assert.equal(S.grant(f.ch, f.db, f.state, S.advance(f.ch, f.state, {}, true)).ok, true);
  assert.equal(f.hero.inventory.length, 5); assert.equal(f.state.convoy.length, 2);
  const g = fixture([objective('turn', { turns: 3, reward: { itemId: 'sword', unitId: 'hero' } })]);
  g.hero.hp = 0; assert.equal(S.grant(g.ch, g.db, g.state, S.advance(g.ch, g.state, {}, true)).ok, true);
  assert.equal(g.hero.inventory.length, 0); assert.equal(g.state.convoy.length, 1);
});
test('rejouer : un défi manqué reste récompensable, un défi payé ne l’est plus, répétition explicite une fois par tentative', () => {
  const f = fixture([objective('turn', { turns: 3, reward: { gold: 20 } })]); f.state.campaign.cleared = ['act'];
  assert.equal(S.grant(f.ch, f.db, f.state, S.advance(f.ch, f.state, {}, true)).awarded.length, 1);
  f.state.secondaryPaid = new Set();
  assert.equal(S.grant(f.ch, f.db, f.state, S.advance(f.ch, f.state, {}, true)).awarded.length, 0);
  f.ch.secondaryObjectives[0].repeatOnReplay = true;
  assert.equal(S.grant(f.ch, f.db, f.state, S.advance(f.ch, f.state, {}, true)).awarded.length, 1);
  assert.equal(S.grant(f.ch, f.db, f.state, S.advance(f.ch, f.state, {}, true)).awarded.length, 0);
  assert.equal(f.state.campaign.secondaryClaims.length, 1); assert.equal(f.state.campaign.gold, 50);
});
test('checkpoint et sauvegarde : abandon annule les récompenses, camp conserve l’historique isolé par acte', () => {
  const f = fixture([objective('turn', { turns: 3, reward: { gold: 100, itemId: 'sword' } })]);
  const checkpoint = C.checkpoint('act', f.state.campaign, f.state.convoy, {});
  S.grant(f.ch, f.db, f.state, S.advance(f.ch, f.state, {}, true));
  const save = JSON.parse(JSON.stringify(C.checkpoint('@lobby', f.state.campaign, f.state.convoy, {})));
  assert.doesNotThrow(() => C.validate(save)); assert.equal(S.claimed(save.campaign, f.ch, f.ch.secondaryObjectives[0]), true);
  assert.equal(S.claimed(save.campaign, { id: 'act2' }, f.ch.secondaryObjectives[0]), false);
  const reset = C.restore(checkpoint, {}); assert.equal(reset.campaign.gold, 10); assert.equal(reset.convoy.length, 0); assert.equal(reset.campaign.secondaryClaims, undefined);
  save.campaign.secondaryClaims.push(save.campaign.secondaryClaims[0]); assert.throws(() => C.validate(save), /secondaires/);
});
test('validation : données malformées, références, récompenses et mémoire', () => {
  const f = fixture([objective('target', { target: 'boss', turns: 4, reward: { gold: 30, itemId: 'sword', uses: 7, unitId: 'hero' } })]);
  assert.deepEqual(S.validate(f.ch, f.db), []);
  for (const ob of [null, [], {}, objective('unknown'), objective('protect', { target: 'missing' }), objective('target', { target: 'missing' }),
    objective('chest', { target: 'missing' }), objective('village', { target: 'missing' }), objective('flag', { flag: '__bad', value: true }),
    objective('flag', { flag: 'good', value: 'yes' }), objective('turn', { turns: 0 }), objective('turn', { turns: 2.5 }),
    objective('turn', { turns: 2, reward: { gold: -1 } }), objective('turn', { turns: 2, reward: { itemId: 'missing' } }),
    objective('turn', { turns: 2, reward: { itemId: 'potion', uses: 4 } }), objective('turn', { turns: 2, reward: { unitId: 'missing' } })]) {
    assert.ok(S.validate({ ...f.ch, secondaryObjectives: [ob] }, f.db).length, JSON.stringify(ob));
  }
  assert.ok(S.validate({ ...f.ch, secondaryObjectives: {} }, f.db).length);
  assert.ok(S.validate({ ...f.ch, secondaryObjectives: [f.ch.secondaryObjectives[0], f.ch.secondaryObjectives[0]] }, f.db).length);
  for (const memory of [{}, ['bad'], [JSON.stringify(['act'])], [JSON.stringify(['', 'id'])]]) assert.equal(S.validateMemory(memory), false);
});
test('projet disque : conservation des défis et refus d’une référence cassée avant écriture', () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'te-secondary-')), 'Jeu');
  const p = IO.createProject(dir, 'Défis', 'sample', path.join(__dirname, '..', 'assets'));
  p.db.chapters[0].secondaryObjectives = [objective('turn', { turns: 5, reward: { gold: 200, itemId: 'w_iron_sword', uses: 10 } })];
  IO.saveProject(dir, p); assert.deepEqual(IO.loadProject(dir).db.chapters[0].secondaryObjectives, p.db.chapters[0].secondaryObjectives);
  p.db.chapters[0].secondaryObjectives[0].reward.itemId = 'missing';
  assert.throws(() => IO.saveProject(dir, p), /introuvable/);
  assert.equal(IO.loadProject(dir).db.chapters[0].secondaryObjectives[0].reward.itemId, 'w_iron_sword');
});
test('libellés et références : cibles, délais, récompenses et protection des suppressions', () => {
  const f = fixture([objective('protect', { target: 'ally', reward: { itemId: 'sword', unitId: 'hero' } })]); f.db.chapters = [f.ch];
  assert.match(S.label(f.ch.secondaryObjectives[0], f.ch, f.db), /Allié/);
  assert.match(S.description(f.ch.secondaryObjectives[0], f.ch, f.db), /jusqu’à la victoire/);
  assert.match(S.rewardText(f.ch.secondaryObjectives[0], f.db), /Épée/);
  assert.equal(S.references(f.db, 'units', 'ally').length, 1); assert.equal(S.references(f.db, 'units', 'hero').length, 1); assert.equal(S.references(f.db, 'weapons', 'sword').length, 1);
});
