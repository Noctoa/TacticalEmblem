'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const M = require('../src/shared/mission');
const C = require('../src/shared/campaign');
const IO = require('../src/main/campaign-io');
const D = require('../src/shared/defaults');
const R = require('../src/shared/rules');
const db = { units: [{ id: 'hero', name: 'Héros', isLord: true }, { id: 'friend', name: 'Allié' }], classes: [{ id: 'base' }, { id: 'promoted', mapSprite: 'new-sprite', battler: 'new-battle' }] };
const map = { width: 10, height: 10 };
const chapter = () => ({ id: 'ch1', objective: { type: 'rout' }, players: [{ unitId: 'hero' }], allies: [{ unitId: 'friend' }], enemies: [{ id: 'boss', isBoss: true }] });
const unit = (id = 'hero', team = 'player') => ({ sourceId: id, team, hp: 20, stats: { hp: 20, str: 5 }, growths: {}, inventory: [{ id: 'sword', uses: 12 }], classId: 'base', level: 3, exp: 20, mov: 5, moveType: 'foot', x: 1, y: 1 });
const enemy = () => Object.assign(unit('boss', 'enemy'), { isBoss: true });
const state = () => ({ units: [unit(), unit('friend', 'ally'), enemy()], pending: [], turn: 1, seized: [] });

test('anciens chapitres : protection et prise de point héritées des seigneurs, sans mutation', () => {
  const ch = chapter(), before = JSON.stringify(ch);
  assert.deepEqual(M.required(ch, db), ['hero']);
  assert.deepEqual(M.seizers(ch, db), ['hero']);
  assert.deepEqual(M.validate(ch, db, map), []);
  assert.equal(JSON.stringify(ch), before);
});
test('protection explicite : un allié peut être requis, un seigneur sacrifiable', () => {
  const ch = chapter(), s = state(); ch.requiredUnits = ['friend']; ch.defeatAll = false;
  s.units[0].dead = true;
  assert.equal(M.evaluate(ch, db, s).outcome, null);
  s.units[1].hp = 0;
  assert.equal(M.evaluate(ch, db, s).outcome, 'defeat');
  ch.requiredUnits = [];
  assert.equal(M.evaluate(ch, db, s).outcome, null);
});
test('la défaite du héros requis prime sur la victoire du même combat', () => {
  const s = state(); s.units[0].hp = 0; s.units[2].dead = true;
  assert.equal(M.evaluate(chapter(), db, s).outcome, 'defeat');
});
test('un héros requis déjà perdu ne réapparaît pas et provoque une défaite explicite', () => {
  const s = state(); s.units.shift();
  assert.match(M.evaluate(chapter(), db, s).reason, /Héros/);
});
test('survie : fin de cycles complets, objectifs ET et OU', () => {
  const ch = chapter(), s = state(); ch.extraObjectives = [{ type: 'survive', turns: 2 }];
  ch.victoryMode = 'any'; s.turn = 2;
  assert.equal(M.evaluate(ch, db, s).outcome, null);
  s.turn = 3; assert.equal(M.evaluate(ch, db, s).outcome, 'victory');
  ch.victoryMode = 'all'; assert.equal(M.evaluate(ch, db, s).outcome, null);
  s.units[2].dead = true; assert.equal(M.evaluate(ch, db, s).outcome, 'victory');
});
test('un ennemi précis doit exister et être vaincu, même en renfort', () => {
  const ch = chapter(), s = state(); ch.objective = { type: 'target', target: 'boss' };
  s.pending.push(s.units.pop());
  assert.equal(M.evaluate(ch, db, s).outcome, null);
  s.pending[0].dead = true; assert.equal(M.evaluate(ch, db, s).outcome, 'victory');
  s.pending = []; assert.equal(M.evaluate(ch, db, s).outcome, null);
});
test('les renforts bloquent la déroute tant qu’ils restent à déployer', () => {
  const ch = chapter(), s = state(); s.pending.push(s.units.pop());
  assert.equal(M.evaluate(ch, db, s).outcome, null);
  ch.objective.includeReinforcements = false;
  assert.equal(M.evaluate(ch, db, s).outcome, 'victory');
});
test('prise de point par un allié autorisé, indépendante du statut Seigneur', () => {
  const ch = chapter(), s = state(); ch.objective = { type: 'seize', x: 1, y: 1 }; ch.seizeUnits = ['friend'];
  assert.equal(M.canSeize(ch, db, s.units[0]), false);
  assert.equal(M.canSeize(ch, db, s.units[1]), true);
  assert.equal(M.evaluate(ch, db, s).outcome, null);
  s.seized.push('1,1'); assert.equal(M.evaluate(ch, db, s).outcome, 'victory');
});
test('limite de tours, pertes et zone : seuils exacts et unités alliées', () => {
  const ch = chapter(), s = state(); ch.turnLimit = 2;
  s.turn = 2; assert.equal(M.evaluate(ch, db, s).outcome, null);
  s.turn = 3; assert.match(M.evaluate(ch, db, s).reason, /tours/);
  s.units[2].dead = true; assert.equal(M.evaluate(ch, db, s).outcome, 'victory');
  ch.lossLimit = 1; s.units[1].dead = true; assert.match(M.evaluate(ch, db, s).reason, /perte/);
  ch.lossLimit = 0; s.turn = 1; s.units[2].dead = false;
  ch.defendZone = { enabled: true, x: 1, y: 1, w: 2, h: 2 };
  assert.match(M.evaluate(ch, db, s).reason, /zone/);
  s.units[2].x = 3; assert.equal(M.evaluate(ch, db, s).outcome, null);
});
test('validation : héros absent, boss absent, cible absente et zone hors map', () => {
  const ch = chapter(); ch.requiredUnits = ['absent']; ch.enemies = [];
  ch.objective = { type: 'boss' }; ch.extraObjectives = [{ type: 'target', target: 'missing' }];
  ch.defendZone = { enabled: true, x: 9, y: 0, w: 2, h: 1 };
  assert.equal(M.validate(ch, db, map).length, 4);
});
test('les projets de démonstration conservent des conditions valides', () => {
  const p = D.sampleProject('Test');
  for (const ch of p.db.chapters) assert.deepEqual(M.validate(ch, p.db, p.maps.find(m => m.id === ch.mapId)), []);
});
test('Classique : mort définitive du joueur et des alliés, exception de retraite', () => {
  const c = C.create('classic'), a = unit(), b = unit('friend', 'ally'); a.dead = b.dead = true;
  C.commit(c, [a, b, enemy()]); assert.deepEqual(c.dead, ['hero', 'friend']);
  const c2 = C.create('classic'); a.deathPolicy = 'retreat'; C.commit(c2, [a]);
  assert.deepEqual(c2.dead, []); assert.equal(c2.units.hero.level, 3);
});
test('Détente : retour au prochain chapitre avec expérience et inventaire actuels', () => {
  const c = C.create('casual'), u = unit(); u.hp = 0; u.dead = true; u.exp = 77; u.inventory[0].uses = 8;
  C.commit(c, [u]); const next = C.apply(c, unit(), db);
  assert.equal(next.hp, 20); assert.equal(next.exp, 77); assert.equal(next.inventory[0].uses, 8); assert.deepEqual(c.dead, []);
  next.inventory[0].uses = 1; assert.equal(c.units.hero.inventory[0].uses, 8);
});
test('classe, déplacement et compétences acquis restent dans la campagne', () => {
  const c = C.create('classic'), u = unit(); u.classId = 'promoted'; u.moveType = 'horse'; u.mov = 8;
  u.learnedSkills = ['luna']; u.equippedSkills = ['luna'];
  C.commit(c, [u]); const next = C.apply(c, unit(), db);
  assert.equal(next.classId, 'promoted'); assert.equal(next.moveType, 'horse'); assert.equal(next.mov, 8);
  assert.equal(next.mapSprite, 'new-sprite'); assert.deepEqual(next.equippedSkills, ['luna']);
});
test('recommencer restaure le checkpoint, le convoi, les soutiens et annule les pertes', () => {
  const c = C.create('classic'), supports = { pair: { def: { id: 'pair' }, points: 12, rank: 1 } };
  C.commit(c, [unit()]); const save = C.checkpoint('ch2', c, [{ id: 'potion', uses: 2 }], supports);
  const u = unit(); u.dead = true; C.commit(c, [u]); supports.pair.points = 90;
  const restored = C.restore(save, supports);
  assert.deepEqual(restored.campaign.dead, []); assert.equal(supports.pair.points, 12);
  assert.equal(restored.convoy[0].uses, 2); assert.equal(save.campaign.units.hero.exp, 20);
});
test('sauvegarde disque indépendante du projet, sauvegarde de secours et fichier corrompu explicite', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-campaign-'));
  // Suppression limitée au dossier temporaire créé par ce test.
  try {
    assert.equal(IO.load(dir), null);
    const save = C.checkpoint('ch2', C.create('casual'), [], {});
    IO.save(dir, save); assert.equal(IO.load(dir).chapterId, 'ch2'); assert.equal(IO.load(dir).slot, 1);
    save.chapterId = 'ch3'; IO.save(dir, save);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'saves/slot-1.json.bak'))).chapterId, 'ch2');
    assert.equal(fs.existsSync(path.join(dir, 'game.tfproj')), false);
    fs.writeFileSync(path.join(dir, 'saves/slot-1.json'), '{broken');
    assert.throws(() => IO.load(dir), /Impossible de lire/);
    assert.throws(() => IO.save(dir, { version: 99 }), /invalide/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('emplacements de sauvegarde : liste, plus récente, effacement, ancienne sauvegarde unique', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-slots-'));
  try {
    // ancienne sauvegarde unique : reprise comme emplacement 1
    fs.mkdirSync(path.join(dir, 'saves'));
    fs.writeFileSync(path.join(dir, 'saves/campaign.json'), JSON.stringify(C.checkpoint('ch1', C.create('classic'), [], {})));
    let list = IO.list(dir);
    assert.equal(list.length, IO.SLOTS);
    assert.deepEqual(list.filter(s => s.exists).map(s => [s.slot, s.chapterId, s.mode]), [[1, 'ch1', 'classic']]);
    assert.ok(!fs.existsSync(path.join(dir, 'saves/campaign.json')));
    const camp = C.create('casual', 300); camp.cleared.push('ch1');
    const save = Object.assign(C.checkpoint('@lobby', camp, [], {}), { info: { place: 'Camp de Varenne' } });
    assert.equal(IO.save(dir, save, 3), 3);
    list = IO.list(dir);
    assert.deepEqual([list[2].chapterId, list[2].mode, list[2].gold, list[2].info.place], ['@lobby', 'casual', 300, 'Camp de Varenne']);
    assert.ok(list[2].info.savedAt);
    // la plus récente
    const t = Date.now() / 1000;
    fs.utimesSync(path.join(dir, 'saves/slot-1.json'), t - 100, t - 100);
    assert.equal(IO.load(dir).slot, 3);
    assert.equal(IO.load(dir, 1).chapterId, 'ch1');
    assert.equal(IO.load(dir, 2), null);
    IO.remove(dir, 3);
    assert.equal(IO.list(dir)[2].exists, false);
    assert.ok(fs.existsSync(path.join(dir, 'saves/slot-3.json.bak')));
    assert.throws(() => IO.save(dir, save, 9), /invalide/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
