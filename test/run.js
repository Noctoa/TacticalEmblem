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
  fs.copyFileSync(path.join(__dirname, '..', 'assets', 'default', 'ressources', 'tilesets', 'plaines.png'), path.join(dir, 'tiles.png'));
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
  assert.deepStrictEqual(p.maps.map(m => m.id), ['map_1', 'map_camp']); // chapitre + lobby
  // arborescence façon RPG Maker + ressources par défaut
  for (const d of ['data/maps', 'ressources/personnages', 'ressources/tilesets', 'ressources/interface', 'ressources/musiques', 'ressources/jingles', 'ressources/sons'])
    assert.ok(fs.existsSync(path.join(dir, d)), d);
  assert.ok(fs.existsSync(path.join(dir, 'ressources', 'LISEZMOI.txt')));
  assert.ok(fs.existsSync(path.join(dir, 'data', 'maps', 'map_1.json')));
  // un dossier par personnage : sprites de map, animation de combat, portrait
  assert.deepStrictEqual(p.resources.owners, ['Brigand', 'Cloud', 'Eliwood', 'Hector', 'Lyn', 'Xarrin']);
  assert.ok(p.resources.characters['ressources/personnages/Eliwood/map_Lord']);
  assert.strictEqual(p.resources.characters['ressources/personnages/Eliwood/map_Lord'].owner, 'Eliwood');
  assert.strictEqual(p.resources.battlers['ressources/personnages/Lyn/combat'].facing, 'left');
  assert.strictEqual(p.resources.battlers['ressources/personnages/Lyn/combat'].projectiles.arrow, 'ressources/personnages/Lyn/combat_arrow.png');
  assert.strictEqual(p.resources.battlers['ressources/personnages/Brigand/combat'].facing, 'right');
  assert.ok(p.resources.faces.includes('ressources/personnages/Hector/portrait.png'));
  assert.ok(!p.resources.faces.some(f => /combat_arrow/.test(f)), 'un projectile n\'est pas un portrait');
  // une seule palette (couleurs d'origine) : plus de planche à 4 blocs
  for (const m of Object.values(p.resources.characters)) assert.ok(!m.palettes && Array.isArray(m.teamColors), m.image);
  assert.deepStrictEqual(p.db.units.map(u => u.name), ['Xarrin', 'Eliwood', 'Lyn', 'Hector', 'Cloud', 'Rebecca', 'Oswin', 'Matthew', 'Serra', 'Dorcas']);
  // sprites propres à une unité (Cloud), convoi, musique, allié du chapitre d'exemple
  for (const u of p.db.units) {
    if (u.mapSprite) assert.ok(p.resources.characters[u.mapSprite], u.mapSprite);
    if (u.battler) assert.ok(p.resources.battlers[u.battler], u.battler);
  }
  assert.strictEqual(p.db.units.filter(u => u.convoy).map(u => u.name).join(), 'Xarrin');
  assert.ok(p.meta.convoy.items.length > 0);
  for (const k of ['playerPhase', 'enemyPhase', 'levelUp', 'gameOver']) assert.ok(fs.existsSync(path.join(dir, p.meta.audio[k])), k);
  assert.ok(p.resources.bgm.length === 2 && p.resources.me.length === 2);
  assert.ok(p.resources.bgm.every(f => f.startsWith('ressources/musiques/')));
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
  assert.deepStrictEqual(q.maps.map(m => m.id), ['map_1', 'map_camp', 'map_2']);
  // lobby et conversations relus (game.tfproj, data/talks.json)
  assert.strictEqual(q.meta.lobby.mapId, 'map_camp');
  assert.ok(q.db.talks.length >= 4 && q.db.chapters.some(c => c.kind === 'event'));
  assert.deepStrictEqual(require('../src/shared/lobby.js').validate(q.meta.lobby, q.db, q.maps), []);
  q.maps.shift(); io.saveProject(dir, q);
  assert.ok(!fs.existsSync(path.join(dir, 'data', 'maps', 'map_1.json')));
});

test('migration d\'un projet à l\'ancienne arborescence (maps/ à la racine)', () => {
  const dir = path.join(tmp, 'Old');
  const p = io.createProject(dir, 'Ancien', 'sample', path.join(__dirname, '..', 'assets'));
  fs.mkdirSync(path.join(dir, 'maps'));
  fs.renameSync(path.join(dir, 'data', 'maps', 'map_1.json'), path.join(dir, 'maps', 'map_1.json'));
  const q = io.loadProject(dir);
  assert.strictEqual(q.maps.length, 2);
  io.saveProject(dir, q);
  assert.ok(fs.existsSync(path.join(dir, 'data', 'maps', 'map_1.json')));
  assert.ok(!fs.existsSync(path.join(dir, 'maps')));
});

test('migration des ressources img/ + audio/ vers ressources/', () => {
  const Layout = require('../src/main/resources-layout.js');
  const dir = path.join(tmp, 'OldRes');
  io.createProject(dir, 'Ancien', 'sample', path.join(__dirname, '..', 'assets'));
  // reconstitue l'ancienne arborescence (img/characters, img/battlers, img/faces, img/tilesets, audio/…)
  const P = 'ressources/personnages/';
  const back = new Map();
  const mv = (from, to) => {
    fs.mkdirSync(path.dirname(path.join(dir, to)), { recursive: true });
    fs.renameSync(path.join(dir, from), path.join(dir, to));
    back.set(from, to);
  };
  const sheets = { 'Eliwood/map_Lord': 'img/characters/Eliwood_Lord', 'Eliwood/map_KnightLord': 'img/characters/Eliwood_KnightLord', 'Lyn/map_Lord': 'img/characters/Lyn_Lord',
    'Lyn/map_BladeLord': 'img/characters/Lyn_BladeLord', 'Hector/map_Lord': 'img/characters/Hector_Lord', 'Hector/map_GreatLord': 'img/characters/Hector_GreatLord',
    'Brigand/map': 'img/characters/Brigand', 'Cloud/map': 'img/characters/Cloud',
    'Eliwood/combat': 'img/battlers/Eliwood', 'Lyn/combat': 'img/battlers/Lyn', 'Hector/combat': 'img/battlers/Hector', 'Brigand/combat': 'img/battlers/Brigand', 'Cloud/combat': 'img/battlers/Cloud', 'Xarrin/combat': 'img/battlers/Xarrin' };
  for (const [n, old] of Object.entries(sheets)) { mv(P + n + '.png', old + '.png'); mv(P + n + '.json', old + '.json'); back.set(P + n, old); }
  mv(P + 'Lyn/combat_arrow.png', 'img/battlers/Lyn_arrow.png');
  const lyn = JSON.parse(fs.readFileSync(path.join(dir, 'img/battlers/Lyn.json'), 'utf8'));
  lyn.projectiles = { arrow: 'img/battlers/Lyn_arrow.png' };
  fs.writeFileSync(path.join(dir, 'img/battlers/Lyn.json'), JSON.stringify(lyn));
  for (const n of ['Eliwood', 'Lyn', 'Hector', 'Brigand', 'Cloud', 'Xarrin']) mv(P + n + '/portrait.png', 'img/faces/' + n + '.png');
  mv('ressources/tilesets/plaines.png', 'img/tilesets/plaines.png');
  mv('ressources/tilesets/village.png', 'img/tilesets/village.png');
  for (const f of ['Advance', 'Winning_Road']) mv('ressources/musiques/' + f + '.mp3', 'audio/bgm/' + f + '.mp3');
  for (const f of ['Level_Up', 'Game_Over']) mv('ressources/jingles/' + f + '.mp3', 'audio/me/' + f + '.mp3');
  fs.rmSync(path.join(dir, 'ressources'), { recursive: true });
  const toOld = new Map([...back].map(([n, o]) => [n, o]));
  for (const k of io.DB_KEYS) {
    const f = path.join(dir, 'data', k + '.json');
    fs.writeFileSync(f, JSON.stringify(Layout.rewrite(JSON.parse(fs.readFileSync(f, 'utf8')), toOld)));
  }
  const metaFile = path.join(dir, 'game.tfproj');
  fs.writeFileSync(metaFile, JSON.stringify(Object.assign(Layout.rewrite(JSON.parse(fs.readFileSync(metaFile, 'utf8')), toOld), { layout: 2 })));
  assert.ok(JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir, 'data', 'units.json'), 'utf8'))).includes('img/faces/Lyn.png'));
  // ouverture : conversion
  const cloudJson = path.join(dir, 'img/battlers/Cloud.json');
  const cloudMeta = JSON.parse(fs.readFileSync(cloudJson, 'utf8')); delete cloudMeta.teamColors;
  fs.writeFileSync(cloudJson, JSON.stringify(cloudMeta)); // comme une planche d'avant les couleurs d'équipe
  const q = io.loadProject(dir, path.join(__dirname, '..', 'assets'));
  assert.ok(q.migration && q.migration.moved > 20, JSON.stringify(q.migration));
  assert.deepStrictEqual(q.resources.battlers[P + 'Cloud/combat'].teamColors, ['#42384a', '#635163', '#736973'], 'couleurs reprises des ressources par défaut');
  assert.ok(!fs.existsSync(path.join(dir, 'img')) && !fs.existsSync(path.join(dir, 'audio')));
  assert.ok(fs.existsSync(path.join(dir, Layout.BACKUP, 'data', 'units.json')));
  assert.strictEqual(q.meta.layout, Layout.LAYOUT);
  const lynU = q.db.units.find(u => u.name === 'Lyn');
  assert.strictEqual(lynU.portrait, P + 'Lyn/portrait.png');
  assert.strictEqual(q.db.units.find(u => u.name === 'Cloud').mapSprite, P + 'Cloud/map');
  assert.strictEqual(q.db.classes.find(c => c.id === 'blade_lord').mapSprite, P + 'Lyn/map_BladeLord');
  assert.strictEqual(q.db.classes.find(c => c.id === 'brigand').battler, P + 'Brigand/combat');
  assert.strictEqual(q.db.tilesets[0].image, 'ressources/tilesets/plaines.png');
  assert.strictEqual(q.meta.audio.enemyPhase, 'ressources/musiques/Advance.mp3');
  assert.strictEqual(q.meta.audio.levelUp, 'ressources/jingles/Level_Up.mp3');
  assert.strictEqual(q.resources.battlers[P + 'Lyn/combat'].projectiles.arrow, P + 'Lyn/combat_arrow.png');
  for (const c of q.db.classes) {
    if (c.mapSprite) assert.ok(q.resources.characters[c.mapSprite], c.mapSprite);
    if (c.battler) assert.ok(q.resources.battlers[c.battler], c.battler);
  }
  for (const u of q.db.units) if (u.portrait) assert.ok(fs.existsSync(path.join(dir, u.portrait)), u.portrait); // les personnages à invoquer n'ont pas de portrait
  // ressources par défaut sur un projet converti : rien en double, seuls les effets sonores (absents de l'ancienne version) arrivent
  const sons = fs.readdirSync(path.join(__dirname, '..', 'assets', 'default', 'ressources', 'sons')).filter(f => !f.startsWith('.')).length;
  assert.strictEqual(io.installDefaults(dir, path.join(__dirname, '..', 'assets')).added, sons);
  // réouverture : plus rien à convertir
  assert.ok(!io.loadProject(dir).migration);
});

test('restes d\'une ancienne version dans assets/default (img/, audio/) ignorés', () => {
  const assets = path.join(tmp, 'assets-mixte');
  fs.cpSync(path.join(__dirname, '..', 'assets'), assets, { recursive: true });
  fs.mkdirSync(path.join(assets, 'default', 'img', 'faces'), { recursive: true });
  fs.writeFileSync(path.join(assets, 'default', 'img', 'faces', 'Lyn.png'), 'x');
  const dir = path.join(tmp, 'Mixte');
  const p = io.createProject(dir, 'Mixte', 'sample', assets);
  assert.ok(!fs.existsSync(path.join(dir, 'img')));
  assert.ok(!io.loadProject(dir, assets).migration);
  assert.strictEqual(io.installDefaults(dir, assets).added, 0);
  assert.ok(p.resources.faces.length === 6);
});

test('couleurs d\'équipe enregistrées dans le .json de la planche', () => {
  const dir = path.join(tmp, 'Proj');
  const key = 'ressources/personnages/Brigand/map';
  assert.deepStrictEqual(io.setTeamColors(dir, key, ['#FF0000', '#00ff00', 'nope', '#ff0000']), ['#00ff00', '#ff0000']);
  assert.deepStrictEqual(io.scanResources(dir).characters[key].teamColors, ['#00ff00', '#ff0000']);
  assert.strictEqual(io.setTeamColors(dir, key, null), null);
  assert.ok(!('teamColors' in io.scanResources(dir).characters[key]));
  assert.throws(() => io.setTeamColors(dir, '../../etc/passwd', []));
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

test('attaque spéciale d\'affinité : le coup indique le partenaire qui y participe', () => {
  const pdb = D.sampleProject().db;
  const e = R.makeUnitFromCharacter(pdb.units[0], pdb, { x: 5, y: 5 });
  const l = R.makeUnitFromCharacter(pdb.units[1], pdb, { x: 4, y: 5 });
  const foe = R.makeEnemyFromPlacement({ id: 'f', classId: 'brigand', level: 1, x: 6, y: 5 }, pdb);
  const sup = R.initSupports(pdb, R.DEFAULT_SUPPORT);
  sup[R.pairKey('c_eliwood', 'c_lyn')].rank = 3;
  const sp = R.supportSpecial(e, [e, l], sup, R.DEFAULT_SUPPORT);
  assert.strictEqual(sp.partnerUid, l.uid);
  sp.chance = 100;
  const res = R.resolveCombat(e, 0, foe, { db: pdb, settings: {}, terrainOf: () => null, rng: R.makeRng(1), specialOf: (u) => (u === e ? sp : null) });
  const first = res.strikes[0];
  assert.strictEqual(first.special, sp.name);
  assert.strictEqual(first.partner, l.uid);
  assert.ok(res.strikes.filter(s => !s.special).every(s => s.partner === null));
});

test('debug : une unité protégée ne perd pas de PV', () => {
  for (let seed = 1; seed < 30; seed++) {
    const a = R.makeUnitFromCharacter(db.units[2], db, { x: 0, y: 0 });
    const b = R.makeEnemyFromPlacement({ id: 'e', classId: 'warrior', level: 10, x: 1, y: 0 }, db);
    const hp = a.hp;
    const res = R.resolveCombat(a, 0, b, { db, settings: {}, terrainOf: () => null, rng: R.makeRng(seed), protect: (u) => u === a });
    assert.strictEqual(a.hp, hp, 'seed ' + seed);
    assert.ok(res.strikes.filter(s => s.target === a.uid && s.hit).every(s => s.dmg === 0));
  }
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
