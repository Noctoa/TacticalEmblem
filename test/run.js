/* Tests Node (sans Electron) : `npm test` */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const R = require('../src/shared/rules.js');
const D = require('../src/shared/defaults.js');
const { importTiled } = require('../src/main/tiled.js');
const io = require('../src/main/project-io.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + (e.stack || e).toString().split('\n').slice(0, 3).join('\n    ')); }
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-test-'));
const terrains = D.terrains();

console.log('Import Tiled');
test('TMX + TSX externe + base64 zlib + CSV + objets', () => {
  const proj = path.join(tmp, 'p1'); fs.mkdirSync(proj);
  const r = importTiled(path.join(__dirname, '..', 'assets', 'sample', 'tiled', 'chapitre1_forteresse.tmx'), { projectDir: proj, terrains });
  assert.strictEqual(r.map.width, 24); assert.strictEqual(r.map.height, 16);
  assert.strictEqual(r.map.layers.length, 2);
  assert.strictEqual(r.map.layers[0].name, 'Sol');
  assert.strictEqual(r.map.layers[0].data.length, 24 * 16);
  assert.strictEqual(r.map.layers[0].data[0], 5); // pic = index 4 + firstgid 1
  assert.strictEqual(r.tilesets.length, 1);
  assert.strictEqual(r.tilesets[0].tileTerrain[2], 'forest');
  assert.strictEqual(r.tilesets[0].columns, 8);
  assert.ok(fs.existsSync(path.join(proj, r.tilesets[0].image)));
  assert.strictEqual(r.map.objects.length, 11);
  const boss = r.map.objects.find(o => o.type === 'boss');
  assert.deepStrictEqual([boss.x, boss.y], [20, 3]);
  assert.strictEqual(boss.properties.class, "brigand");
  assert.deepStrictEqual(r.warnings, []);
  // ré-import : l'image identique est réutilisée
  const r2 = importTiled(path.join(__dirname, '..', 'assets', 'sample', 'tiled', 'chapitre1_forteresse.tmx'), { projectDir: proj, terrains });
  assert.strictEqual(r2.tilesets[0].image, r.tilesets[0].image);
});

test('TMJ : tileset intégré, gzip, flips, groupes, map infinie', () => {
  const dir = path.join(tmp, 'tmj'); fs.mkdirSync(dir);
  fs.copyFileSync(path.join(__dirname, '..', 'assets', 'default', 'img', 'tilesets', 'plaines.png'), path.join(dir, 'tiles.png'));
  const chunkData = new Array(16 * 16).fill(1); chunkData[0] = 3 | 0x80000000; // flip H
  const buf = Buffer.alloc(chunkData.length * 4); chunkData.forEach((g, i) => buf.writeUInt32LE(g >>> 0, i * 4));
  const tmj = {
    orientation: 'orthogonal', infinite: true, width: 16, height: 16, tilewidth: 32, tileheight: 32,
    tilesets: [{ firstgid: 1, name: 'tiles', image: 'tiles.png', imagewidth: 256, imageheight: 64, tilewidth: 32, tileheight: 32, tilecount: 16, columns: 8,
      tiles: [{ id: 5, properties: [{ name: 'terrain', type: 'string', value: 'Eau' }] }, { id: 2, type: 'Forêt' }, { id: 7, properties: [{ name: 'terrain', value: 'lave' }] }] }],
    layers: [
      { type: 'group', name: 'G', visible: true, layers: [
        { type: 'tilelayer', name: 'sol', visible: true, encoding: 'base64', compression: 'gzip',
          chunks: [{ x: -16, y: 0, width: 16, height: 16, data: zlib.gzipSync(buf).toString('base64') }] },
        { type: 'tilelayer', name: 'deco', visible: false, chunks: [{ x: 0, y: 0, width: 16, height: 16, data: new Array(256).fill(0).map((_, i) => i === 0 ? 6 : 0) }] }
      ] },
      { type: 'objectgroup', name: 'obj', objects: [{ id: 1, name: 'A', type: 'player', x: 40, y: 40, width: 0, height: 0, point: true, properties: [{ name: 'unit', value: 'c_x' }] }] }
    ]
  };
  fs.writeFileSync(path.join(dir, 'm.tmj'), JSON.stringify(tmj));
  const proj = path.join(tmp, 'p2'); fs.mkdirSync(proj);
  const r = importTiled(path.join(dir, 'm.tmj'), { projectDir: proj, terrains });
  assert.strictEqual(r.map.width, 32); assert.strictEqual(r.map.height, 16);
  assert.strictEqual(r.map.layers[0].name, 'G/sol');
  assert.strictEqual(r.map.layers[1].visible, false);
  assert.strictEqual(r.map.layers[0].data[0] >>> 0, (3 | 0x80000000) >>> 0);
  assert.strictEqual(r.map.layers[1].data[16], 6); // chunk x=0 décalé de 16
  assert.strictEqual(r.tilesets[0].tileTerrain[5], 'water');
  assert.strictEqual(r.tilesets[0].tileTerrain[2], 'forest');
  assert.ok(r.warnings.some(w => w.includes('lave')));
  assert.deepStrictEqual([r.map.objects[0].x, r.map.objects[0].y], [1 + 16, 1]);
});

test('TMX zstd → message clair si non dispo', () => {
  const dir = path.join(tmp, 'zstd'); fs.mkdirSync(dir);
  const tmx = `<?xml version="1.0"?><map orientation="orthogonal" width="2" height="1" tilewidth="32" tileheight="32"><layer name="a" width="2" height="1"><data encoding="base64" compression="zstd">AAAA</data></layer></map>`;
  fs.writeFileSync(path.join(dir, 'z.tmx'), tmx);
  try { importTiled(path.join(dir, 'z.tmx'), { projectDir: dir, terrains }); }
  catch (e) { assert.ok(/zstd|Zstd|incorrect|unknown|invalid/i.test(e.message), e.message); }
});

console.log('Projet');
test('création / sauvegarde / rechargement', () => {
  const dir = path.join(tmp, 'Proj');
  const p = io.createProject(dir, 'Test', 'sample', path.join(__dirname, '..', 'assets'));
  assert.strictEqual(p.meta.name, 'Test');
  assert.strictEqual(p.maps.length, 1);
  // arborescence façon RPG Maker + ressources par défaut
  for (const d of ['data/maps', 'img/tilesets', 'img/characters', 'img/battlers', 'img/faces', 'img/system', 'audio/bgm', 'audio/se'])
    assert.ok(fs.existsSync(path.join(dir, d)), d);
  assert.ok(fs.existsSync(path.join(dir, 'data', 'maps', 'map_1.json')));
  assert.ok(p.resources.characters['img/characters/Eliwood_Lord']);
  assert.strictEqual(p.resources.battlers['img/battlers/Lyn'].facing, 'left');
  assert.strictEqual(p.resources.battlers['img/battlers/Brigand'].facing, 'right');
  assert.ok(p.resources.faces.includes('img/faces/Hector.png'));
  assert.deepStrictEqual(p.db.units.map(u => u.name), ['Eliwood', 'Lyn', 'Hector', 'Cloud']);
  // sprites propres à une unité (Cloud), convoi, musique, allié du chapitre d'exemple
  for (const u of p.db.units) {
    if (u.mapSprite) assert.ok(p.resources.characters[u.mapSprite], u.mapSprite);
    if (u.battler) assert.ok(p.resources.battlers[u.battler], u.battler);
  }
  assert.strictEqual(p.db.units.filter(u => u.convoy).map(u => u.name).join(), 'Eliwood');
  assert.ok(p.meta.convoy.items.length > 0);
  for (const k of ['playerPhase', 'enemyPhase', 'levelUp', 'gameOver']) assert.ok(fs.existsSync(path.join(dir, p.meta.audio[k])), k);
  assert.ok(p.resources.bgm.length === 2 && p.resources.me.length === 2);
  const ch = p.db.chapters[0];
  assert.strictEqual(ch.allies.length, 1);
  assert.ok(!ch.players.some(x => x.unitId === ch.allies[0].unitId));
  // chaque sprite / battler référencé existe
  for (const c of p.db.classes) {
    if (c.mapSprite) assert.ok(p.resources.characters[c.mapSprite], c.mapSprite);
    if (c.battler) assert.ok(p.resources.battlers[c.battler], c.battler);
  }
  for (const u of p.db.units) assert.ok(fs.existsSync(path.join(dir, u.portrait)), u.portrait);
  for (const ts of p.db.tilesets) assert.ok(fs.existsSync(path.join(dir, ts.image)), ts.image);
  p.maps.push(Object.assign(JSON.parse(JSON.stringify(p.maps[0])), { id: 'map_2', name: 'Copie' }));
  io.saveProject(dir, p);
  const q = io.loadProject(dir);
  assert.deepStrictEqual(q.maps.map(m => m.id), ['map_1', 'map_2']);
  q.maps.shift(); io.saveProject(dir, q);
  assert.ok(!fs.existsSync(path.join(dir, 'data', 'maps', 'map_1.json')));
});

test('migration d\'un projet à l\'ancienne arborescence (maps/ à la racine)', () => {
  const dir = path.join(tmp, 'Old');
  const p = io.createProject(dir, 'Ancien', 'sample', path.join(__dirname, '..', 'assets'));
  fs.mkdirSync(path.join(dir, 'maps'));
  fs.renameSync(path.join(dir, 'data', 'maps', 'map_1.json'), path.join(dir, 'maps', 'map_1.json'));
  const q = io.loadProject(dir);
  assert.strictEqual(q.maps.length, 1);
  io.saveProject(dir, q);
  assert.ok(fs.existsSync(path.join(dir, 'data', 'maps', 'map_1.json')));
  assert.ok(!fs.existsSync(path.join(dir, 'maps')));
});

console.log('Règles');
const proj = D.sampleProject();
const db = proj.db;
// personnages de test (indépendants du casting par défaut)
const st = (hp, str, mag, skl, spd, lck, def, res) => ({ hp, str, mag, skl, spd, lck, def, res });
const TEST_UNITS = [
  { id: 't_lord', name: 'Aldric', classId: 'lord', level: 1, isLord: true, stats: st(18, 5, 0, 7, 8, 7, 5, 1), growths: st(75, 45, 10, 55, 60, 55, 25, 25), inventory: [{ id: 'w_iron_sword' }, { id: 'w_slim_sword' }] },
  { id: 't_cav', name: 'Maëlle', classId: 'cavalier', level: 2, stats: st(21, 6, 0, 6, 7, 3, 6, 1), growths: st(80, 40, 5, 45, 45, 30, 25, 15), inventory: [{ id: 'w_iron_sword' }, { id: 'w_javelin' }] },
  { id: 't_fig', name: 'Bran', classId: 'fighter', level: 2, stats: st(25, 7, 0, 4, 5, 3, 3, 0), growths: st(90, 55, 0, 35, 35, 30, 15, 10), inventory: [{ id: 'w_iron_axe' }, { id: 'w_hand_axe' }] },
  { id: 't_cle', name: 'Iris', classId: 'cleric', level: 1, stats: st(16, 0, 4, 3, 5, 8, 1, 7), growths: st(50, 5, 55, 35, 45, 60, 10, 55), inventory: [{ id: 'w_heal' }] },
  { id: 't_arc', name: 'Soren', classId: 'archer', level: 3, stats: st(19, 5, 0, 7, 6, 4, 4, 1), growths: st(70, 40, 0, 50, 40, 35, 15, 20), inventory: [{ id: 'w_iron_bow' }] }
];
db.units = TEST_UNITS;
const map = proj.maps[0];
const grid = R.buildTerrainGrid(map, db.tilesets, 'plain');
const tAt = (x, y) => R.byId(db.terrains, grid[y * map.width + x]);

test('grille de terrain depuis le tileset', () => {
  assert.strictEqual(grid[0], 'peak');
  assert.strictEqual(grid[2 * 20 + 18], 'fort');
  assert.strictEqual(grid[6 * 20 + 11], 'bridge');
});

test('buissons et fourrés : bonus d\'esquive, coût de déplacement', () => {
  const bush = R.byId(db.terrains, 'bush'), thicket = R.byId(db.terrains, 'thicket');
  assert.ok(bush.avoid > 0 && thicket.avoid > bush.avoid);
  assert.strictEqual(R.moveCost(thicket, 'horse'), 99);
  assert.strictEqual(grid[9 * 20 + 8], 'bush');
  // l'esquive du terrain baisse la précision de l'attaquant
  const a = R.makeUnitFromCharacter(TEST_UNITS[2], db, { x: 7, y: 9 });
  const d1 = R.makeEnemyFromPlacement({ id: 'e', classId: 'brigand', level: 1, x: 8, y: 9 }, db);
  const d2 = R.makeEnemyFromPlacement({ id: 'f', classId: 'brigand', level: 1, x: 8, y: 9 }, db);
  const on = R.forecast(a, 0, d1, { db, settings: {}, terrainOf: () => bush });
  const off = R.forecast(a, 0, d2, { db, settings: {}, terrainOf: () => R.byId(db.terrains, 'plain') });
  assert.strictEqual(off.att.hit - on.att.hit, bush.avoid);
});

test('allié : même camp que le joueur, IA tournée vers les ennemis', () => {
  const ally = R.makeUnitFromCharacter(TEST_UNITS[1], db, { x: 6, y: 10 }, 'ally');
  const pl = R.makeUnitFromCharacter(TEST_UNITS[0], db, { x: 6, y: 9 });
  const foe = R.makeEnemyFromPlacement({ id: 'e', classId: 'brigand', level: 1, x: 6, y: 6 }, db);
  assert.ok(R.sameSide(ally, pl) && !R.sameSide(ally, foe));
  ally.ai = 'aggressive';
  const units = [ally, pl, foe];
  const plan = R.planEnemy(ally, [foe], { db, settings: {}, ctx: ctxWith(units), terrainOf: u => tAt(u.x, u.y) });
  assert.ok(plan && plan.target === foe);
});

test('affinités : rangs, bonus, attaque spéciale, attaque duo', () => {
  const cfg = R.DEFAULT_SUPPORT;
  const sdb = Object.assign({}, db, { supports: [
    { id: 's1', a: 't_lord', b: 't_fig', startPoints: 92, maxRank: 'S', special: { rank: 'B', name: 'Élan', chance: 100, dmg: 5, hit: 50 }, combo: { rank: 'A', name: 'Duo', chance: 100, might: 4 } },
    { id: 's2', a: 't_lord', b: 't_arc', startPoints: 0, maxRank: 'A' }
  ] });
  const st = R.initSupports(sdb, cfg);
  assert.strictEqual(st[R.pairKey('t_lord', 't_fig')].rank, 3); // A
  assert.strictEqual(R.rankForPoints(500, cfg, 'A'), 3);
  const lord = R.makeUnitFromCharacter(TEST_UNITS[0], db, { x: 5, y: 5 });
  const fig = R.makeUnitFromCharacter(TEST_UNITS[2], db, { x: 4, y: 5 });
  const foe = R.makeEnemyFromPlacement({ id: 'e', classId: 'soldier', level: 1, x: 6, y: 5 }, db);
  const friends = [lord, fig];
  const bonus = R.supportBonus(lord, friends, st, cfg);
  assert.deepStrictEqual([bonus.hit, bonus.avoid], [15, 15]);
  // les bonus entrent dans les prévisions
  const base = R.forecast(lord, 0, foe, { db, settings: {}, terrainOf: () => null });
  const withB = R.forecast(lord, 0, foe, { db, settings: {}, terrainOf: () => null, bonusOf: u => R.supportBonus(u, friends, st, cfg) });
  assert.ok(withB.att.hit >= base.att.hit && withB.att.crit === Math.min(100, base.att.crit + 9));
  // spécial (100 %) et duo (100 %) dans la résolution
  foe.hp = 99; foe.stats.hp = 99;
  const res = R.resolveCombat(lord, 0, foe, { db, settings: {}, terrainOf: () => null, rng: R.makeRng(3),
    specialOf: u => R.supportSpecial(u, friends, st, cfg), dual: R.supportDual(lord, friends, st, db) });
  assert.ok(res.strikes.some(x => x.special === 'Élan'));
  const duoStrike = res.strikes.find(x => x.dual);
  assert.ok(duoStrike && duoStrike.by === fig.uid && res.duo.partner === fig);
  // gain de points → nouveau rang à débloquer
  const e2 = st[R.pairKey('t_lord', 't_arc')];
  assert.strictEqual(R.addSupportPoints(st, 't_lord', 't_arc', 25, cfg), true);
  assert.strictEqual(R.pendingRank(e2, cfg), 1);
  // un seul rang S
  const e1 = st[R.pairKey('t_lord', 't_fig')]; e1.points = 200;
  assert.strictEqual(R.pendingRank(e1, cfg, () => true), 0);
  assert.strictEqual(R.pendingRank(e1, cfg, () => false), 4);
});

test('triangle des armes', () => {
  assert.strictEqual(R.triangle('sword', 'axe'), 1);
  assert.strictEqual(R.triangle('sword', 'lance'), -1);
  assert.strictEqual(R.triangle('anima', 'light'), 1);
  assert.strictEqual(R.triangle('bow', 'sword'), 0);
});

function ctxWith(units) {
  return { width: map.width, height: map.height, terrainAt: tAt, unitAt: (x, y) => units.find(u => u.x === x && u.y === y && u.hp > 0) || null };
}

test('prévisions de combat (épée vs hache, doublé, terrain)', () => {
  const ald = R.makeUnitFromCharacter(db.units[0], db, { x: 5, y: 5 });
  const brig = R.makeEnemyFromPlacement({ id: 'e', classId: 'brigand', level: 1, x: 6, y: 5 }, db);
  const fc = R.forecast(ald, 0, brig, { db, settings: proj.meta.settings, terrainOf: u => tAt(u.x, u.y) });
  // Aldric : For 5 + (5 + 1 triangle) = 11 - Déf 3 = 8
  assert.strictEqual(fc.att.dmg, 8);
  assert.strictEqual(fc.att.count, 2); // Vit 8 vs 3 - max(0,10-5)= -2
  assert.ok(fc.def); assert.strictEqual(fc.def.dmg, Math.max(0, 5 + (8 - 1) - 5));
  assert.ok(fc.att.hit > fc.def.hit);
});

test('arme efficace (arc vs volant)', () => {
  const sor = R.makeUnitFromCharacter(db.units[4], db, { x: 0, y: 0 });
  const peg = R.makeEnemyFromPlacement({ id: 'p', classId: 'pegasus', level: 1, x: 2, y: 0 }, db);
  const fc = R.forecast(sor, 0, peg, { db, settings: {}, terrainOf: () => null });
  assert.strictEqual(fc.att.dmg, 5 + 6 * 3 - 2);
  assert.strictEqual(fc.def, null); // pas de riposte à 2 cases avec une lance de fer
});

test('combat résolu, usure des armes, pas de PV négatifs', () => {
  const rng = R.makeRng(42);
  const a = R.makeUnitFromCharacter(db.units[2], db, { x: 0, y: 0 });
  const b = R.makeEnemyFromPlacement({ id: 'e', classId: 'soldier', level: 1, x: 1, y: 0 }, db);
  const uses = a.inventory[0].uses;
  const res = R.resolveCombat(a, 0, b, { db, settings: {}, terrainOf: () => null, rng });
  assert.ok(res.strikes.length >= 1);
  assert.ok(a.hp >= 0 && b.hp >= 0);
  assert.strictEqual(a.inventory[0].uses, uses - res.strikes.filter(s => s.by === a.uid).length);
});

test('déplacement : coûts, eau infranchissable, ennemis bloquants', () => {
  const u = R.makeUnitFromCharacter(db.units[0], db, { x: 6, y: 12 });
  const reach = R.reachable(u, ctxWith([u]));
  assert.ok(reach.has('6,7'));   // 5 cases de route
  assert.ok(!reach.has('6,6'));  // 6 cases
  assert.ok(!reach.has('10,12') || reach.get('10,12').cost <= 5);
  for (const n of reach.values()) assert.notStrictEqual(grid[n.y * 20 + n.x], 'water');
  const foe = R.makeEnemyFromPlacement({ id: 'e', classId: 'brigand', level: 1, x: 6, y: 10 }, db);
  const reach2 = R.reachable(u, ctxWith([u, foe]));
  assert.ok(!reach2.has('6,10'));
  const cav = R.makeUnitFromCharacter(db.units[1], db, { x: 1, y: 2 });
  const r3 = R.reachable(cav, ctxWith([cav]));
  assert.ok(!r3.has('0,2')); // montagne interdite à cheval
});

test('IA : attaque la cible à portée, sinon avance', () => {
  const p = R.makeUnitFromCharacter(db.units[3], db, { x: 8, y: 12 }); // Iris, fragile
  const e = R.makeEnemyFromPlacement({ id: 'e', classId: 'brigand', level: 1, x: 8, y: 9, ai: 'aggressive' }, db);
  const units = [p, e];
  const opts = { db, settings: {}, ctx: ctxWith(units), terrainOf: u => tAt(u.x, u.y) };
  const plan = R.planEnemy(e, [p], opts);
  assert.ok(plan && plan.target === p);
  assert.strictEqual(R.dist(plan.moveTo, p), 1);
  const far = R.makeEnemyFromPlacement({ id: 'f', classId: 'brigand', level: 1, x: 17, y: 12, ai: 'aggressive' }, db);
  const plan2 = R.planEnemy(far, [p], Object.assign({}, opts, { ctx: ctxWith([p, far]) }));
  assert.ok(plan2 && !plan2.target);
  assert.ok(R.dist(plan2.moveTo, p) < R.dist(far, p));
  const st = R.makeEnemyFromPlacement({ id: 's', classId: 'soldier', level: 1, x: 8, y: 10, ai: 'stationary' }, db);
  assert.strictEqual(R.planEnemy(st, [p], Object.assign({}, opts, { ctx: ctxWith([p, st]) })), null);
});

test('expérience et montée de niveau', () => {
  const u = R.makeUnitFromCharacter(db.units[0], db, { x: 0, y: 0 });
  const foe = { level: 1, classId: 'brigand', isBoss: false };
  const xpKill = R.combatExp(u, foe, true, true, db);
  assert.ok(xpKill > 20 && xpKill <= 100);
  assert.strictEqual(R.combatExp(u, foe, false, false, db), 1);
  const before = Object.assign({}, u.stats);
  const ups = R.gainExp(u, 250, db, R.makeRng(1));
  assert.strictEqual(ups.length, 2); assert.strictEqual(u.level, 3); assert.strictEqual(u.exp, 50);
  assert.ok(R.STATS.some(k => u.stats[k] > before[k]));
});

test('zone de danger', () => {
  const e = R.makeEnemyFromPlacement({ id: 'a', classId: 'archer', level: 1, x: 13, y: 5 }, db);
  const z = R.threatTiles(e, ctxWith([e]), db, true);
  assert.ok(z.has('13,7') && z.has('15,5') && !z.has('13,6'));
});

console.log(`\n${pass} ok, ${fail} échec(s)`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
