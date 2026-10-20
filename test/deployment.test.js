'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const D = require('../src/shared/deployment'), Defaults = require('../src/shared/defaults'), R = require('../src/shared/rules');
const C = require('../src/shared/campaign'), Team = require('../src/shared/team'), io = require('../src/main/project-io');
function fixture() {
  const p = Defaults.sampleProject('Déploiement'), db = p.db, ch = db.chapters[0], map = p.maps.find(m => m.id === ch.mapId);
  ch.requiredUnits = ['c_eliwood']; ch.deployment = { limit: 2, forcedUnits: [] }; ch.allies = [];
  ch.players = [{ unitId: 'c_eliwood', x: 2, y: 2 }, { unitId: 'c_lyn', x: 3, y: 2 }, { unitId: 'c_hector', x: 4, y: 2 }];
  const campaign = C.create('classic'); Team.sync(campaign, db, p.meta); Team.recruit(campaign, ['c_cloud']);
  const members = campaign.recruited.map(id => C.apply(campaign, R.makeUnitFromCharacter(db.units.find(u => u.id === id), db, { x: 0, y: 0 }), db));
  const terrain = () => ({ cost: { foot: 1, horse: 1, flier: 1 } });
  return { p, db, ch, map, campaign, members, terrain };
}
test('préparatifs activés par défaut, limites et personnages protégés imposés sans modifier le projet', () => {
  const { ch, db, members, map, terrain } = fixture(), before = JSON.stringify(ch);
  assert.equal(D.enabled(ch), true); assert.deepEqual(D.validate(ch, db, map), []);
  const plan = D.initial(ch, db, members, terrain);
  assert.deepEqual(plan.map(p => p.unitId), ['c_eliwood', 'c_lyn']);
  assert.deepEqual(plan.map(p => [p.x, p.y]), [[2, 2], [3, 2]]);
  assert.deepEqual(D.errors(ch, db, members, plan, terrain), []); assert.equal(JSON.stringify(ch), before);
  delete ch.deployment; assert.equal(D.limit(ch), 3);
  ch.deployment = { enabled: false }; assert.equal(D.enabled(ch), false);
});
test('effectif : les réservistes sont sélectionnables, pas les morts ni les alliés verts de cet acte', () => {
  const { ch, db, members, terrain } = fixture();
  ch.allies = [{ unitId: 'c_cloud', x: 8, y: 8 }];
  let plan = D.initial(ch, db, members, terrain);
  assert.equal(D.toggle(ch, db, members, plan, 'c_cloud', terrain).ok, false);
  assert.equal(D.toggle(ch, db, members, plan, 'missing', terrain).ok, false);
  plan = D.toggle(ch, db, members, plan, 'c_lyn', terrain).plan;
  plan = D.toggle(ch, db, members, plan, 'c_hector', terrain).plan;
  assert.deepEqual(plan.map(p => p.unitId), ['c_eliwood', 'c_hector']);
  const live = members.filter(u => u.sourceId !== 'c_hector');
  assert.ok(D.errors(ch, db, live, plan, terrain).some(e => e.includes('indisponible')));
});
test('limite, sélection vide, personnages imposés et protection alliée vérifiés avant le départ', () => {
  const { ch, db, members, terrain, map } = fixture(), plan = D.initial(ch, db, members, terrain), before = JSON.stringify(plan);
  assert.equal(D.toggle(ch, db, members, plan, 'c_hector', terrain).ok, false);
  assert.equal(D.toggle(ch, db, members, plan, 'c_eliwood', terrain).ok, false);
  assert.equal(JSON.stringify(plan), before);
  assert.ok(D.errors(ch, db, members, [], terrain).length >= 2);
  assert.ok(D.errors(ch, db, members.filter(u => u.sourceId !== 'c_eliwood'), plan, terrain).length);
  ch.deployment.forcedUnits = ['c_lyn']; ch.deployment.limit = 1;
  assert.ok(D.validate(ch, db, map).some(e => e.includes('imposés')));
  ch.deployment.limit = 3; ch.allies = [{ unitId: 'c_cloud', x: 8, y: 8 }]; ch.requiredUnits.push('c_cloud');
  assert.deepEqual(D.forced(ch, db), ['c_lyn', 'c_eliwood']);
  assert.ok(D.errors(ch, db, members.filter(u => u.sourceId !== 'c_cloud'), plan, terrain).some(e => e.includes('allié à protéger')));
});
test('positions : échanges atomiques, case libre, apparence de la case et refus hors zone', () => {
  const { ch, db, members, terrain } = fixture();
  ch.players[0].colors = 'original';
  let plan = D.initial(ch, db, members, terrain), before = JSON.stringify(plan);
  const swapped = D.move(ch, members, plan, 'c_eliwood', ch.players[1], terrain);
  assert.ok(swapped.ok); assert.equal(JSON.stringify(plan), before); plan = swapped.plan;
  assert.equal(plan.find(p => p.unitId === 'c_lyn').colors, 'original');
  assert.equal(plan.find(p => p.unitId === 'c_eliwood').x, 3);
  plan = D.move(ch, members, plan, 'c_eliwood', ch.players[2], terrain).plan;
  assert.equal(plan.find(p => p.unitId === 'c_eliwood').x, 4);
  assert.equal(D.move(ch, members, plan, 'c_eliwood', { x: 1, y: 1 }, terrain).ok, false);
  assert.equal(D.move(ch, members, plan, 'missing', ch.players[0], terrain).ok, false);
  assert.deepEqual(D.errors(ch, db, members, plan.concat(plan[0]), terrain).some(e => e.includes('plusieurs fois')), true);
});
test('terrain selon la classe actuelle : répartition accessible et échange refusé sans mutation', () => {
  const { ch, db, members } = fixture();
  const hero = members.find(u => u.sourceId === 'c_eliwood'), lyn = members.find(u => u.sourceId === 'c_lyn'); hero.moveType = 'horse'; lyn.moveType = 'foot';
  const terrain = x => ({ cost: { horse: x === 2 ? 99 : 1, foot: 1 } });
  const plan = D.initial(ch, db, members, terrain);
  assert.deepEqual(D.errors(ch, db, members, plan, terrain), []);
  assert.notEqual(plan.find(p => p.unitId === hero.sourceId).x, 2);
  const before = JSON.stringify(plan);
  assert.equal(D.move(ch, members, plan, hero.sourceId, ch.players[0], terrain).ok, false);
  assert.equal(JSON.stringify(plan), before);
  assert.equal(D.canPlace(ch, hero, ch.players[1], () => ({ cost: { horse: Infinity } })), false);
});
test('appariement : plusieurs types de mouvement et conservation des positions lors d’un ajout', () => {
  const { ch, db, members, terrain } = fixture(); ch.deployment.limit = 3;
  let plan = D.initial(ch, db, members, terrain);
  plan = D.toggle(ch, db, members, plan, 'c_lyn', terrain).plan;
  const before = plan.map(p => ({ ...p })); plan = D.toggle(ch, db, members, plan, 'c_cloud', terrain).plan;
  for (const p of before) assert.deepEqual(plan.find(q => q.unitId === p.unitId), p);
  members.find(u => u.sourceId === 'c_eliwood').moveType = 'flier';
  members.find(u => u.sourceId === 'c_lyn').moveType = 'horse';
  members.find(u => u.sourceId === 'c_hector').moveType = 'foot';
  const tricky = x => ({ cost: { flier: 1, horse: x === 2 ? 1 : 99, foot: x === 3 ? 1 : 99 } });
  plan = D.initial(ch, db, members, tricky);
  assert.deepEqual(D.errors(ch, db, members, plan, tricky), []);
  assert.equal(plan.find(p => p.unitId === 'c_lyn').x, 2); assert.equal(plan.find(p => p.unitId === 'c_hector').x, 3);
});
test('prise de point : un personnage autorisé doit participer, exception des objectifs OU et des alliés fixes', () => {
  const { ch, db, members, terrain } = fixture(); ch.objective = { type: 'seize', x: 5, y: 5 }; ch.seizeUnits = ['c_hector'];
  let plan = D.initial(ch, db, members, terrain);
  assert.ok(D.errors(ch, db, members, plan, terrain).some(e => e.includes('prendre les points')));
  plan = D.toggle(ch, db, members, plan, 'c_lyn', terrain).plan;
  plan = D.toggle(ch, db, members, plan, 'c_hector', terrain).plan;
  assert.deepEqual(D.errors(ch, db, members, plan, terrain), []);
  ch.seizeUnits = ['c_cloud']; ch.allies = [{ unitId: 'c_cloud', x: 8, y: 8 }];
  assert.deepEqual(D.errors(ch, db, members, plan, terrain), []);
  ch.allies = []; ch.extraObjectives = [{ type: 'boss' }]; ch.victoryMode = 'any';
  assert.deepEqual(D.errors(ch, db, members, plan, terrain), []);
});
test('reprise : sélection et positions sauvegardées, adaptation si le chapitre ou l’effectif change', () => {
  const { ch, db, members, terrain, campaign } = fixture();
  let plan = D.initial(ch, db, members, terrain); plan = D.move(ch, members, plan, 'c_eliwood', ch.players[2], terrain).plan;
  const save = { ...C.checkpoint(ch.id, campaign, [], {}), deployment: plan };
  C.validate(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(D.initial(ch, db, members, terrain, save.deployment), plan);
  ch.deployment.limit = 1;
  const adapted = D.initial(ch, db, members, terrain, save.deployment); assert.equal(adapted.length, 1); assert.deepEqual(D.errors(ch, db, members, adapted, terrain), []);
  save.deployment = [plan[0], plan[0]]; assert.throws(() => C.validate(save), /Déploiement invalide/);
  save.deployment = [{ unitId: 'c_eliwood', x: -1, y: 0 }]; assert.throws(() => C.validate(save), /Déploiement invalide/);
  delete save.deployment; assert.doesNotThrow(() => C.validate(save));
});
test('validation éditeur : coordonnées, doublons, occupants, limite et références invalides', () => {
  const { ch, db, map } = fixture();
  const bad = mutate => { const copy = JSON.parse(JSON.stringify(ch)); mutate(copy); assert.ok(D.validate(copy, db, map).length); };
  bad(c => c.deployment = []); bad(c => c.deployment.limit = 5); bad(c => c.deployment.limit = -1); bad(c => c.deployment.limit = 1.5);
  bad(c => c.deployment.enabled = 'oui'); bad(c => c.deployment.forcedUnits = 'c_lyn'); bad(c => c.deployment.forcedUnits = ['c_cloud']);
  bad(c => c.players[0].x = map.width); bad(c => c.players[1].x = 2); bad(c => c.players[1].unitId = c.players[0].unitId);
  bad(c => c.players = []); bad(c => c.enemies.push({ id: 'eX', x: 2, y: 2 })); bad(c => c.allies.push({ unitId: 'c_cloud', x: 2, y: 2 }));
});
test('enregistrement du projet : réglages conservés et échec avant écriture si invalides', t => {
  const { p, ch } = fixture(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-deploy-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  io.saveProject(dir, p); assert.deepEqual(io.loadProject(dir).db.chapters[0].deployment, ch.deployment);
  const before = fs.readFileSync(path.join(dir, 'data', 'chapters.json'), 'utf8');
  ch.deployment.forcedUnits = ['missing']; assert.throws(() => io.saveProject(dir, p), /unités imposées/);
  assert.equal(fs.readFileSync(path.join(dir, 'data', 'chapters.json'), 'utf8'), before);
});

test('tous les actes de démonstration ont une sélection et des cases de départ valides', () => {
  const p = Defaults.sampleProject('Exemples');
  for (const ch of p.db.chapters) {
    const map = p.maps.find(m => m.id === ch.mapId), campaign = C.create('classic');
    Team.sync(campaign, p.db, p.meta, ch.id); Team.recruit(campaign, ch.players.map(p => p.unitId));
    const ids = [...new Set([...campaign.recruited, ...(ch.allies || []).map(p => p.unitId)])];
    const members = ids.map(id => C.apply(campaign, R.makeUnitFromCharacter(p.db.units.find(u => u.id === id), p.db, { x: 0, y: 0 }), p.db));
    const grid = R.buildTerrainGrid(map, p.db.tilesets, p.meta.defaultTerrain), terrain = (x, y) => p.db.terrains.find(t => t.id === grid[y * map.width + x]);
    assert.deepEqual(D.validate(ch, p.db, map), [], ch.id);
    assert.deepEqual(D.errors(ch, p.db, members, D.initial(ch, p.db, members, terrain), terrain), [], ch.id);
  }
});
