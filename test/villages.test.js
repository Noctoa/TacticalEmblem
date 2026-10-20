'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const V = require('../src/shared/villages'), D = require('../src/shared/defaults'), R = require('../src/shared/rules');
const C = require('../src/shared/campaign'), io = require('../src/main/project-io');
function fixture() {
  const p = D.sampleProject('Villages'), db = p.db, ch = db.chapters[0], map = p.maps.find(m => m.id === ch.mapId);
  const village = { id: 'v_test', name: 'Village du pont', x: 3, y: 3, script: 'Villageois: Merci !', reward: { gold: 120, itemId: 'w_iron_sword', uses: 7 }, allowedUnits: [] };
  ch.villages = [village];
  const unit = R.makeUnitFromCharacter(db.units.find(u => u.id === 'c_eliwood'), db, village);
  const state = { campaign: C.create('classic'), visited: new Set(), convoy: [], capacity: 2, units: [unit] };
  return { p, db, ch, map, village, unit, state };
}
test('anciens actes et sauvegardes sans villages : comportement inchangé', () => {
  const { ch, db, map, state } = fixture(); delete ch.villages;
  assert.deepEqual(V.list(ch), []); assert.equal(V.at(ch, 3, 3), undefined); assert.deepEqual(V.validate(ch, db, map), []);
  assert.doesNotThrow(() => C.validate(C.checkpoint(ch.id, state.campaign, [], {})));
});
test('visiteur : case exacte, joueur vivant disponible et autorisations', () => {
  const { ch, db, village, unit, state } = fixture();
  const no = patch => { const u = { ...unit, ...patch }; assert.equal(V.offer(ch, village, u, state, db).ok, false); };
  no({ x: 4 }); no({ team: 'ally' }); no({ team: 'enemy' }); no({ hp: 0 }); no({ dead: true }); no({ done: true });
  village.allowedUnits = ['c_lyn']; assert.equal(V.offer(ch, village, unit, state, db).ok, false);
  village.allowedUnits = [unit.sourceId]; assert.ok(V.offer(ch, village, unit, state, db).ok);
});
test('récompenses atomiques : or, objet avec usages, offre sans mutation et visite unique', () => {
  const { ch, db, village, unit, state } = fixture(), initial = JSON.stringify([state.campaign, unit.inventory]);
  const before = unit.inventory.length; assert.ok(V.offer(ch, village, unit, state, db).ok);
  assert.equal(JSON.stringify([state.campaign, unit.inventory]), initial);
  assert.ok(V.claim(ch, village, unit, state, db).ok);
  assert.equal(state.campaign.gold, 120); assert.equal(unit.inventory.length, before + 1);
  assert.deepEqual(unit.inventory.at(-1), { id: 'w_iron_sword', uses: 7 });
  assert.deepEqual(state.campaign.villageVisits, [{ chapterId: ch.id, villageId: village.id }]);
  assert.equal(V.claim(ch, village, unit, state, db).ok, false); assert.equal(state.campaign.gold, 120);
});
test('inventaire plein : convoi, ou refus sans perte ni récompense partielle quand tout est plein', () => {
  const { ch, db, village, unit, state } = fixture(); village.recruitUnitId = 'c_cloud';
  unit.inventory = Array.from({ length: 5 }, () => ({ id: 'i_vulnerary', uses: 2 }));
  state.capacity = 0; const before = JSON.stringify([unit, state.campaign, state.convoy]);
  assert.equal(V.claim(ch, village, unit, state, db).ok, false);
  assert.equal(JSON.stringify([unit, state.campaign, state.convoy]), before); assert.equal(state.visited.size, 0);
  state.capacity = 1; assert.equal(V.claim(ch, village, unit, state, db).destination, 'convoy');
  assert.equal(unit.inventory.length, 5); assert.deepEqual(state.convoy, [{ id: 'w_iron_sword', uses: 7 }]);
});
test('répétition : une fois par campagne par défaut, option par acte rejoué, jamais deux fois dans la tentative', () => {
  const { ch, db, village, unit, state } = fixture(); village.reward = { gold: 10 };
  V.claim(ch, village, unit, state, db); state.visited.clear();
  assert.ok(V.closed(ch, village, state)); assert.equal(V.offer(ch, village, unit, state, db).ok, false);
  village.repeatOnReplay = true; assert.ok(V.claim(ch, village, unit, state, db).ok);
  assert.equal(state.campaign.gold, 20); assert.equal(state.campaign.villageVisits.length, 1);
  assert.equal(V.claim(ch, village, unit, state, db).ok, false);
  const another = { ...ch, id: 'another' }; state.visited.clear(); village.repeatOnReplay = false;
  assert.equal(V.closed(another, village, state), false);
});
test('recommencer annule visites, or, objets et recrutements de la tentative', () => {
  const { ch, db, village, unit, state } = fixture(); village.recruitUnitId = 'c_cloud';
  C.commit(state.campaign, [unit]); const before = C.checkpoint(ch.id, state.campaign, [], {});
  V.claim(ch, village, unit, state, db); assert.ok(state.campaign.recruited.includes('c_cloud'));
  const restored = C.restore(before, {});
  assert.equal(restored.campaign.gold, 0); assert.equal(restored.campaign.villageVisits, undefined);
  const fresh = C.apply(restored.campaign, R.makeUnitFromCharacter(db.units.find(u => u.id === unit.sourceId), db, village), db);
  const next = { ...state, ...restored, units: [fresh], visited: new Set() };
  assert.ok(V.claim(ch, village, fresh, next, db).ok); assert.equal(restored.campaign.gold, 120);
  assert.equal(fresh.inventory.length, before.campaign.units[unit.sourceId].inventory.length + 1);
});
test('recrutement : nouveau, allié existant, déjà recruté ou mort, sans doublons ni résurrection', () => {
  const { ch, db, village, unit, state } = fixture(); village.recruitUnitId = 'c_cloud';
  assert.equal(V.offer(ch, village, unit, state, db).recruit.kind, 'new');
  const ally = R.makeUnitFromCharacter(db.units.find(u => u.id === 'c_cloud'), db, { x: 8, y: 8 }, 'ally'); ally.hp = 3;
  state.units.push(ally); assert.equal(V.offer(ch, village, unit, state, db).recruit.kind, 'ally');
  assert.strictEqual(V.offer(ch, village, unit, state, db).recruit.unit, ally);
  ally.dead = true; assert.equal(V.offer(ch, village, unit, state, db).recruit.kind, 'unavailable');
  ally.dead = false; state.campaign.dead.push('c_cloud'); assert.equal(V.claim(ch, village, unit, state, db).recruit.kind, 'unavailable');
  assert.equal(state.campaign.recruited, undefined); assert.equal(ally.hp, 3);
  state.visited.clear(); state.campaign.villageVisits = []; state.campaign.dead = []; state.units.pop(); state.campaign.recruited = ['c_cloud'];
  assert.equal(V.claim(ch, village, unit, state, db).recruit.kind, 'already'); assert.deepEqual(state.campaign.recruited, ['c_cloud']);
});
test('validation des positions, récompenses, visiteurs et références, avant écriture', t => {
  const { p, ch, db, map, village } = fixture(); assert.deepEqual(V.validate(ch, db, map), []);
  const bad = mutate => { const copy = JSON.parse(JSON.stringify(ch)); mutate(copy); assert.ok(V.validate(copy, db, map).length); };
  bad(c => c.villages = {}); bad(c => c.villages = [null]); bad(c => c.villages.push(c.villages[0]));
  bad(c => c.villages[0].x = map.width); bad(c => c.villages[0].y = -1); bad(c => c.villages[0].id = '');
  bad(c => c.villages[0].reward.gold = -1); bad(c => c.villages[0].reward.gold = 0.5); bad(c => c.villages[0].reward.itemId = 'missing');
  bad(c => c.villages[0].reward.uses = 999); bad(c => c.villages[0].reward = []); bad(c => c.villages[0].script = {});
  bad(c => c.villages[0].recruitUnitId = 'missing'); bad(c => c.villages[0].allowedUnits = ['missing']); bad(c => c.villages[0].repeatOnReplay = 'oui');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-village-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  io.saveProject(dir, p); assert.deepEqual(io.loadProject(dir).db.chapters[0].villages, ch.villages);
  const before = fs.readFileSync(path.join(dir, 'data', 'chapters.json'), 'utf8');
  village.reward.itemId = 'missing'; assert.throws(() => io.saveProject(dir, p), /récompense introuvable/);
  assert.equal(fs.readFileSync(path.join(dir, 'data', 'chapters.json'), 'utf8'), before);
});
test('visites sauvegardées : compatibilité, détection des doublons et références protégées', () => {
  const { ch, db, village, unit, state } = fixture(); village.recruitUnitId = 'c_cloud'; village.allowedUnits = ['c_eliwood'];
  assert.equal(V.references(db, 'units', 'c_cloud').length, 1); assert.equal(V.references(db, 'units', 'c_eliwood').length, 1);
  assert.equal(V.references(db, 'weapons', 'w_iron_sword').length, 1); assert.equal(V.references(db, 'items', 'missing').length, 0);
  V.claim(ch, village, unit, state, db); C.commit(state.campaign, state.units);
  const saved = C.checkpoint(ch.id, state.campaign, state.convoy, {}), restored = C.restore(JSON.parse(JSON.stringify(saved)), {});
  assert.ok(V.visited(restored.campaign, ch, village));
  saved.campaign.villageVisits.push(saved.campaign.villageVisits[0]); assert.throws(() => C.validate(saved), /Visites de villages invalides/);
  saved.campaign.villageVisits = [{}]; assert.throws(() => C.validate(saved), /Visites de villages invalides/);
});
