'use strict';
/* Générateur de personnage : palette, recette, composition, face set, sprite de map, protagoniste du joueur. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const C = require('../src/shared/char-gen');

const GEN = path.join(__dirname, '..', 'src', 'renderer', 'img', 'generator');
function parts() { const ctx = { self: {} }; vm.runInNewContext(fs.readFileSync(path.join(GEN, 'parts.js'), 'utf8'), ctx); return ctx.self.GENERATOR_PARTS; }
const pngSize = (f) => { const b = fs.readFileSync(path.join(GEN, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
/** Case 96 × 96 vide, avec quelques pixels indexés (r = indice × 10). */
function layer(pixels, size = 96) {
  const d = new Uint8ClampedArray(size * size * 4);
  for (const [x, y, idx] of pixels) { const i = (y * size + x) * 4; d[i] = idx * 10 + 3; d[i + 3] = 255; }
  return d;
}
const at = (d, x, y, size = 96) => Array.from(d.slice((y * size + x) * 4, (y * size + x) * 4 + 4));

test('pièces : index et planches cohérents (cheveux avant / arrière alignés)', () => {
  const P = parts();
  assert.ok(P.hair.length > 200 && P.face.length > 200 && P.armor.length > 200 && P.token.length > 200);
  for (const [kind, sheet, cell] of [['hair', 'hair.png', 96], ['hair', 'hairb.png', 96], ['face', 'face.png', 96], ['armor', 'armor.png', 96], ['token', 'token.png', 64]]) {
    const [w, h] = pngSize(sheet);
    assert.equal(w, P.cols * cell, sheet);
    assert.equal(h, Math.ceil(P[kind].length / P.cols) * cell, sheet);
  }
  assert.ok(P.hair.find(p => p.id === 'Eliwood').back);
  assert.equal(P.token.find(p => p.id === 'BowKnightAltIscaneus').label, 'Bow Knight Alt (Iscaneus)');
  assert.ok(new Set(P.face.map(p => p.id)).size === P.face.length);
});

test('palette : 21 teintes façon générateur d’origine (contour, cheveux, peau, métal, ornements, tissu, cuir)', () => {
  const pal = C.palette(C.DEFAULT_COLORS);
  assert.equal(pal.length, 21);
  assert.deepEqual(pal[0], [0, 0, 0]);
  assert.deepEqual(pal[2], [64, 50, 25]);           // cheveux
  assert.deepEqual(pal[3], C.darker([64, 50, 25])); // cheveux, ombre
  assert.deepEqual(C.darker([64, 50, 25]), [44, 35, 17]);
  assert.deepEqual(C.brighter([64, 50, 25]), [91, 71, 35]); // java.awt.Color.brighter
  assert.ok(C.brighter([248, 216, 184]).some(v => v < 250), 'une couleur claire ne vire pas au blanc');
  assert.deepEqual(pal[8], C.darker(C.darker(C.darker([192, 140, 110])))); // peau, 3 crans plus sombre
  assert.deepEqual(C.shade(pal, 255, 255), [255, 255, 255]); // au-delà : blanc (yeux)
  assert.equal(C.shade(pal, 20, 0), null);
});

test('recette : normalisation, validation, pièces par défaut du même nom, aléatoire reproductible', () => {
  const P = parts();
  const r = C.normalize({ hair: 'Lyn', face: 'Inconnu', colors: { hair: '#AbCdEf', skin: 'rouge' }, offsets: { face: [99, -3.6] } }, P);
  assert.equal(r.hair, 'Lyn'); assert.equal(r.face, '');
  assert.equal(r.colors.hair, '#abcdef'); assert.equal(r.colors.skin, C.DEFAULT_COLORS.skin);
  assert.deepEqual(r.offsets.face, [48, -4]); assert.deepEqual(r.offsets.armor, [0, 0]);
  assert.deepEqual(C.validate(C.normalize({}, P), P), ['Choisis au moins un visage, des cheveux ou une tenue.']);
  assert.match(C.validate({ hair: 'Nope', colors: {} }, P).join(), /Pièce inconnue/);
  const d = C.defaults(P, 'Lyn');
  assert.deepEqual([d.hair, d.face, d.armor, d.token], ['Lyn', 'Lyn', 'Lyn', 'Lyn']);
  assert.equal(C.defaults(P, 'Personne').token, 'Lord');
  let seed = 1; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const a = C.random(P, rng); seed = 1; const b = C.random(P, rng);
  assert.deepEqual(a, b);
  assert.deepEqual(C.validate(a, P), []);
});

test('composition : ordre cheveux arrière < tenue < visage < cheveux, décalages, recoloration', () => {
  const recipe = C.normalize({ colors: { hair: '#ff0000', skin: '#00ff00', cloth: '#0000ff' }, offsets: { face: [2, 1] } });
  const L = { hairb: layer([[10, 10, 2], [11, 10, 2]]), armor: layer([[10, 10, 16], [12, 10, 16]]), face: layer([[8, 9, 5]]), hair: layer([[11, 10, 2]]) };
  const p = C.composePortrait(L, recipe);
  assert.deepEqual(at(p, 10, 10), [0, 255, 0, 255]); // le visage (décalé de 2, 1 depuis 8, 9) passe devant la tenue
  assert.deepEqual(at(p, 12, 10), [0, 0, 255, 255]); // tenue (tissu)
  assert.deepEqual(at(p, 11, 10), [255, 0, 0, 255]); // cheveux devant
  assert.deepEqual(at(p, 0, 0), [0, 0, 0, 0]);
});

test('face set 128 × 112 : portrait recadré (lignes 16 à 95), mini-portrait, fond à couleur clé', () => {
  const recipe = C.normalize({ colors: { skin: '#00ff00' } });
  const face = layer([[40, 40, 5], [50, 50, 5]]);
  const p = C.composePortrait({ face }, recipe);
  const fsx = C.faceset(p, face);
  assert.equal(fsx.width, 128); assert.equal(fsx.height, 112);
  assert.deepEqual(at(fsx.data, 0, 0, 128).slice(0, 3), C.FACESET.key); // pixel (0,0) = fond transparent en jeu
  // le pixel (40, 40) du portrait est en (40, 24) dans le face set
  assert.deepEqual(at(fsx.data, 40, 24, 128), [0, 255, 0, 255]);
  // le mini-portrait (96,16)-(128,48) contient le visage
  let found = false;
  for (let y = 16; y < 48; y++) for (let x = 96; x < 128; x++) if (at(fsx.data, x, y, 128)[1] === 255 && at(fsx.data, x, y, 128)[0] === 0) found = true;
  assert.ok(found);
});

test('sprite de map : 6 animations × 4 images de 64, pieds au centre, miroir, couleurs d’équipe = tissu', () => {
  const tok = new Uint8ClampedArray(64 * 64 * 4);
  for (let y = 20; y <= 50; y++) for (let x = 20; x <= 26; x++) { const i = (y * 64 + x) * 4; tok[i] = 200; tok[i + 3] = 255; }
  const m = C.mapSprite(tok, { name: 'Test', teamColors: C.teamColors(C.normalize({})) });
  assert.equal(m.width, 256); assert.equal(m.height, 384);
  assert.equal(m.meta.base, 32); assert.deepEqual(m.meta.frame, [64, 64]); assert.deepEqual(m.meta.anchor, [32, 51]);
  for (const k of ['idle', 'left', 'right', 'down', 'up', 'focus']) assert.ok(m.meta.anims[k], k);
  assert.equal(m.meta.teamColors.length, 3);
  // pieds (x 20-26, centre 23) recentrés en 32 : la colonne 29 est pleine sur la première image
  assert.equal(m.data[((50 * 256) + 29) * 4 + 3], 255);
  // ligne « droite » (2) : miroir autour du même centre
  const row = 2 * 64;
  assert.equal(m.data[(((row + 50) * 256) + 32) * 4 + 3], 255);
});

test('protagoniste du joueur : réglage, renommage dans les textes, validation', () => {
  const db = { units: [{ id: 'c_lyn', name: 'Lyn' }, { id: 'c_eliwood', name: 'Eliwood', protagonist: true }] };
  assert.deepEqual(C.avatarConfig({}, db), { enabled: false, unitId: 'c_eliwood', rename: true });
  assert.equal(C.avatarConfig({ avatar: { enabled: true }, lobby: { heroId: 'c_lyn' } }, db).unitId, 'c_lyn');
  assert.equal(C.avatarConfig({ avatar: { enabled: true, unitId: 'absent' } }, { units: [] }).enabled, false);
  assert.equal(C.renameText('Eliwood: Lyn, regarde ! — Eliwood ?', 'Eliwood', 'Kael'), 'Kael: Lyn, regarde ! — Kael ?');
  assert.equal(C.renameText('Eliwoodien', 'Eliwood', 'Kael'), 'Eliwoodien');
  assert.equal(C.renameText('Bravo, {héros} !', '', 'Eliwood'), 'Bravo, Eliwood !');
  assert.deepEqual(C.validateAvatar(undefined), []);
  assert.match(C.validateAvatar({ unitId: 'c_lyn', name: 'x'.repeat(30), recipe: { face: 'Lyn', colors: {} } }).join(), /20 caractères/);
});

test('nuanciers détaillés : 225 dégradés (cheveux, yeux, métal, ornements, tissu, cuir), 34 de peau triés, appliqués tels quels', () => {
  assert.equal(C.HAIR_RAMPS.length, C.HAIR_LAYOUT.rows * (C.HAIR_LAYOUT.columns[0] + C.HAIR_LAYOUT.columns[1]));
  assert.ok(C.HAIR_RAMPS.every(r => r.length === 3 && r.every(c => C.rgb(c))));
  assert.equal(C.SKIN_RAMPS.length, 34); // 35 de la planche, un doublon retiré
  const L = (r) => r.reduce((n, c) => { const v = C.rgb(c); return n + 0.3 * v[0] + 0.59 * v[1] + 0.11 * v[2]; }, 0);
  assert.ok(C.SKIN_RAMPS.every((r, i, all) => i === 0 || L(all[i - 1]) >= L(r)), 'du plus clair au plus foncé');
  assert.equal(new Set(C.SKIN_RAMPS.map(r => r.join())).size, 34);
  assert.ok(C.SKIN_RAMPS.every(r => r.length === 5 && r.every(c => C.rgb(c))));
  const hair = C.HAIR_RAMPS[50], skin = C.SKIN_RAMPS[3];
  const pal = C.palette(C.DEFAULT_COLORS, { hair, skin });
  assert.deepEqual(pal.slice(1, 4), hair.map(C.rgb));
  assert.deepEqual(pal.slice(4, 9), skin.map(C.rgb));
  // recette : dégradés valides gardés, invalides retirés ou signalés
  assert.deepEqual(C.normalize({ ramps: { hair, skin: ['#ffffff'] } }).ramps, { hair });
  assert.match(C.validate({ face: 'x', colors: {}, ramps: { skin: ['#fff'] } }).join(), /Nuancier invalide/);
  const r = C.random(parts(), (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })());
  assert.ok(C.HAIR_RAMPS.some(x => x.join() === r.ramps.hair.join()) && C.SKIN_RAMPS.some(x => x.join() === r.ramps.skin.join()));
});

test('yeux : couleur propre (iris dessiné en teinte « cheveux » près du blanc de l’œil), barbe épargnée', () => {
  // œil : blanc (indice 25) en (30,40), iris (indice 2) en (31,40) ; barbe (indice 2) en (30,70), loin du blanc
  const face = layer([[30, 40, 25], [31, 40, 2], [32, 40, 3], [30, 70, 2]]);
  const mask = C.eyeMask(face);
  assert.equal(mask[40 * 96 + 31], 1); assert.equal(mask[40 * 96 + 32], 1); assert.equal(mask[70 * 96 + 30], 0);
  assert.equal(C.eyePalette({ eyes: '' }), null); // comme les cheveux
  const recipe = C.normalize({ colors: { hair: '#ff0000', eyes: '#00ff00' } });
  assert.equal(recipe.colors.eyes, '#00ff00');
  const p = C.composePortrait({ face }, recipe);
  assert.deepEqual(at(p, 31, 40), [0, 255, 0, 255]);   // iris : couleur des yeux
  assert.deepEqual(at(p, 30, 70), [255, 0, 0, 255]);   // barbe : couleur des cheveux
  const same = C.composePortrait({ face }, C.normalize({ colors: { hair: '#ff0000' } }));
  assert.deepEqual(at(same, 31, 40), [255, 0, 0, 255]); // sans couleur d'yeux : comme les cheveux
  assert.deepEqual(C.validate({ face: 'x', colors: { eyes: '' } }), []);
});

test('couleurs séparées : sprite de map, sprite de combat et tenue de l’animation de combat', () => {
  const metal = C.HAIR_RAMPS[3], cloth = C.HAIR_RAMPS[100], mapCloth = C.HAIR_RAMPS[7], battle = C.HAIR_RAMPS[150];
  const pal = C.palette(C.DEFAULT_COLORS, { metal, cloth });
  assert.deepEqual(pal.slice(9, 12), metal.map(C.rgb)); assert.deepEqual(pal.slice(15, 18), cloth.map(C.rgb));
  const r = C.normalize({ ramps: { cloth }, map: { colors: {}, ramps: { cloth: mapCloth } }, battle: { ramp: battle } });
  assert.deepEqual(C.teamColors(r), mapCloth);                  // sprite de map : ses propres couleurs
  assert.deepEqual(C.teamColors(Object.assign({}, r, { map: null })), cloth); // sinon celles du portrait
  assert.equal(C.battlePalette(r), 'custom:' + battle.join(','));
  assert.equal(C.battlePalette(C.normalize({ ramps: { cloth } })), 'custom:' + cloth.join(','), 'sans couleurs de combat : le tissu du portrait');
  assert.equal(C.battlePalette(null), '');
  // couleurs du sprite de combat : les siennes (l'ancienne tenue « battle » y est reprise comme tissu)
  assert.deepEqual(r.combat.ramps.cloth, battle); assert.equal(r.battle, undefined);
  const r2 = C.normalize({ ramps: { cloth }, combat: { colors: {}, ramps: { cloth: metal } } });
  assert.equal(C.battlePalette(r2), 'custom:' + metal.join(','));
  const tk = new Uint8ClampedArray(64 * 64 * 4); tk[0] = 163; tk[3] = 255;
  assert.deepEqual(Array.from(C.composeToken(tk, { map: C.combatColors(r2) }).slice(0, 3)), C.rgb(metal[1]), 'sprite de combat recoloré');
  const tok = new Uint8ClampedArray(64 * 64 * 4); tok[0] = 163; tok[3] = 255; // indice 16 : tissu de base
  assert.deepEqual(Array.from(C.composeToken(tok, r).slice(0, 3)), C.rgb(mapCloth[1]));
  // l'animation de combat : couleurs d'équipe de la planche remplacées par le dégradé, de la plus claire à la plus foncée
  const P = require('../src/shared/palettes');
  const t = P.table(C.battlePalette(r), ['#3060c0', '#203060', '#90b0f0']);
  assert.deepEqual(t.get(0x90b0f0), C.rgb(battle[0])); assert.deepEqual(t.get(0x203060), C.rgb(battle[2]));
  assert.equal(P.norm('custom:#zzzzzz'), 'original');
});

test('bibliothèque de sprites FE : liste, planches, vignettes et crédits cohérents', () => {
  const ctx = { self: {} }; vm.runInNewContext(fs.readFileSync(path.join(GEN, 'sprites.js'), 'utf8'), ctx);
  const S = ctx.self.GENERATOR_SPRITES;
  assert.ok(S.list.length > 100, 'une centaine de sprites');
  const ids = new Set();
  for (const e of S.list) {
    assert.match(e.id, /^[a-z0-9-]+$/); assert.ok(!ids.has(e.id), 'id unique : ' + e.id); ids.add(e.id);
    assert.ok(e.label && e.group && Array.isArray(e.credits) && e.f.length === 3);
    assert.ok(!e.credits.some(c => /^[MFU]$/.test(c)), 'pas de (M)/(F)/(U) dans les crédits : ' + e.id);
  }
  const files = fs.readdirSync(path.join(GEN, 'sprites'));
  assert.equal(files.length, S.list.length);
  for (const e of S.list.slice(0, 40)) assert.deepEqual(pngSize(path.join('sprites', e.id + '.png')), [128, 192]);
  const [tw, th] = pngSize('sprites-thumbs.png');
  assert.equal(tw, S.cols * 32); assert.equal(th, Math.ceil(S.list.length / S.cols) * 32);
  // sélection : un sprite (M) et un (F) au plus par classe ; personnages de la série qui ont un visage dans le générateur
  const perClass = {};
  for (const e of S.list.filter(e => e.group !== 'Personnages de la série')) {
    const m = /^(.*?)\s*\(([MFU])\)\s*(.*)$/.exec(e.label), key = m[1] + (m[1] === 'Pegasi' ? m[3].split(' ')[0] : '') + ':' + (m[2] === 'F' ? 'F' : 'M');
    assert.ok(!perClass[key], 'un seul sprite par classe et par sexe : ' + key); perClass[key] = true;
  }
  assert.ok(perClass['Soldier:M'] && perClass['Soldier:F'] && perClass['Paladin:M'] && perClass['Paladin:F']);
  const chars = S.list.filter(e => e.group === 'Personnages de la série').map(e => e.label);
  for (const n of ['Eliwood', 'Hector', 'Lyn', 'Serra']) assert.ok(chars.some(l => l.includes(n)), n);
  assert.ok(!chars.some(l => /Marth|Celica|Edelgard/.test(l)), 'pas de personnage sans visage dans le générateur');
  const credits = fs.readFileSync(path.join(__dirname, '..', 'tools', 'map-sprites', 'CREDITS.txt'), 'utf8');
  for (const c of new Set(S.list.flatMap(e => e.credits))) assert.ok(credits.includes(c), 'crédit listé : ' + c);
});

test('recette : sprite FE gardé, vérifié et décrit (.json base 16, cases 32 × 32)', () => {
  const p = Object.assign({}, parts(), { sprite: [{ id: 'soldier-m', label: 'Soldier (M)', group: 'x', credits: ['IS', 'Blood'], f: [3, 4, 3] }] });
  assert.equal(C.normalize({ sprite: 'soldier-m' }, p).sprite, 'soldier-m');
  assert.equal(C.normalize({ sprite: 'inconnu' }, p).sprite, '');
  assert.equal(C.normalize({}).sprite, '');
  const face = p.face[0].id;
  assert.deepEqual(C.validate({ face, sprite: 'inconnu' }, p), ['Sprite de map inconnu (inconnu).']);
  assert.deepEqual(C.validate({ face, sprite: 'soldier-m' }, p), []);
  const m = C.spriteMeta(p.sprite[0], 'Garde');
  assert.deepEqual([m.type, m.name, m.frame, m.anchor, m.base], ['mapsprite', 'Garde', [32, 32], [16, 32], 16]);
  assert.equal(m.source, 'FE-Repo — IS, Blood');
  assert.deepEqual(Object.keys(m.anims), ['idle', 'left', 'right', 'down', 'up', 'focus']);
  for (const a of Object.values(m.anims)) { assert.equal(a.frames.length, a.durations.length); assert.ok(a.frames.every(f => f >= 0 && f < 4)); }
  const still = C.spriteMeta({ f: [1, 3, 3] });
  assert.deepEqual(still.anims.idle.frames, [0]); assert.deepEqual(still.anims.down.frames, [0, 1, 2]);
});

test('sprite de map FE recoloré avec les couleurs de la carte (palette commune GBA)', () => {
  const px = (hex) => [...C.rgb(hex), 255];
  const data = new Uint8ClampedArray([...px('#3850e0'), ...px('#f8f8d0'), ...px('#403838'), ...px('#808870'), ...px('#3a52e2'), 0, 0, 0, 0]);
  const cloth = ['#d04c38', '#a03040', '#6c2034'], skin = ['#f8de8b', '#eeac5a', '#cd7b4a', '#885a41', '#604848'];
  const r = C.normalize({ ramps: { cloth, skin } });
  C.recolorFeSprite(data, r);
  const at = (i) => C.hex([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
  assert.equal(at(0), cloth[1]); assert.equal(at(1), skin[0]);
  assert.equal(at(2), '#403838', 'contour gardé'); assert.equal(at(3), '#808870', 'ombre au sol gardée');
  assert.equal(at(4), cloth[1], 'couleur presque identique : recolorée aussi');
  assert.equal(data[23], 0, 'transparent intact');
  // couleurs propres à la carte, et couleurs d'équipe pour le jeu
  const m = C.normalize({ ramps: { cloth }, map: { colors: {}, ramps: { cloth: ['#40c040', '#208020', '#104010'] } } });
  assert.deepEqual(C.feTeamColors(m).slice(1, 4), ['#40c040', '#208020', '#104010']);
});

test('sprites retirés du générateur (tools/map-sprites/exclus.txt) absents de la liste et des planches', () => {
  const ctx = { self: {} }; vm.runInNewContext(fs.readFileSync(path.join(GEN, 'sprites.js'), 'utf8'), ctx);
  const ids = new Set(ctx.self.GENERATOR_SPRITES.list.map(e => e.id));
  const ex = fs.readFileSync(path.join(__dirname, '..', 'tools', 'map-sprites', 'exclus.txt'), 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  assert.ok(ex.length > 0);
  for (const id of ex) { assert.ok(!ids.has(id), id); assert.ok(!fs.existsSync(path.join(GEN, 'sprites', id + '.png')), id); }
});

test('sprite de combat monté : la monture prend les teintes du cuir, la mèche du cavalier garde celles des cheveux', () => {
  const F = C.TOKEN, tok = new Uint8ClampedArray(F * F * 4);
  const put = (x, y, idx) => { const i = (y * F + x) * 4; tok[i] = idx * 10 + 3; tok[i + 3] = 255; };
  for (let x = 30; x < 34; x++) put(x, 10, 2);                 // cheveux du cavalier (en haut)
  for (let y = 11; y < 20; y++) put(31, y, 16);                // corps (tissu)
  for (let x = 20; x < 44; x++) for (let y = 30; y < 40; y++) put(x, y, 7); // cheval (peau / robe)
  for (let x = 40; x < 46; x++) put(x, 26, 1);                 // crinière (teinte cheveux)
  for (let y = 32; y < 42; y++) put(18, y, 3);                 // queue
  const mask = C.mountMask(tok);
  assert.equal(mask[10 * F + 31], 0, 'mèche du cavalier'); assert.equal(mask[26 * F + 42], 1, 'crinière'); assert.equal(mask[35 * F + 18], 1, 'queue');
  const leather = ['#c08850', '#906030', '#603818'], r = C.normalize({ ramps: { leather, hair: ['#ff80ff', '#ff00ff', '#800080'] } });
  const out = C.composeToken(tok, r, { mount: true }), at = (x, y) => C.hex(Array.from(out.slice((y * F + x) * 4, (y * F + x) * 4 + 3)));
  assert.equal(at(42, 26), leather[0]); assert.equal(at(18, 35), leather[2]); assert.equal(at(31, 10), '#ff00ff');
  assert.equal(C.hex(Array.from(C.composeToken(tok, r).slice((26 * F + 42) * 4, (26 * F + 42) * 4 + 3))), '#ff80ff', 'sans monture : cheveux');
  // les figurines montées sont repérées par build_generator_parts.py (parts.js : mount)
  const ctx = { self: {} }; vm.runInNewContext(fs.readFileSync(path.join(GEN, 'parts.js'), 'utf8'), ctx);
  const tk = ctx.self.GENERATOR_PARTS.token, isM = (n) => !!(tk.find(p => p.label === n) || {}).mount;
  assert.ok(isM('Cavalier') && isM('Paladin Female') && isM('Falcon Knight (Iscaneus)') && !isM('Soldier') && !isM('Myrmidon'));
});

test('animations de combat FE des sprites de combat : liste, planches et animations cohérentes', () => {
  const ctx = { self: {} };
  vm.runInNewContext(fs.readFileSync(path.join(GEN, 'battlers.js'), 'utf8'), ctx);
  vm.runInNewContext(fs.readFileSync(path.join(GEN, 'parts.js'), 'utf8'), ctx);
  const B = ctx.self.GENERATOR_BATTLERS, P = ctx.self.GENERATOR_PARTS;
  assert.ok(B.list.length > 50, 'des dizaines d’animations');
  const ids = new Set(B.list.map(b => b.id));
  for (const [tok, id] of Object.entries(B.tokens)) { assert.ok(P.token.some(p => p.id === tok), 'sprite de combat ' + tok); assert.ok(ids.has(id), id); }
  assert.ok(Object.keys(B.tokens).length >= P.token.length - 5, 'presque tous les sprites de combat sont animés');
  for (const b of B.list) {
    const m = b.meta, [w, h] = pngSize(path.join('battlers', b.id + '.png'));
    assert.equal(m.type, 'battler'); assert.equal(m.facing, 'left');
    assert.equal(w, m.columns * m.cell[0]); assert.equal(h, Math.ceil(m.count / m.columns) * m.cell[1]);
    assert.ok(m.anims.stance && m.anims.stance.loop && (m.anims.attack || m.anims.bow), 'garde et attaque : ' + b.id);
    for (const [k, a] of Object.entries(m.anims)) {
      assert.equal(a.frames.length, a.durations.length, b.id + ' ' + k);
      assert.ok(a.frames.every(f => f >= 0 && f < m.count), b.id + ' ' + k);
      if (a.hit !== undefined) assert.ok(a.hit >= 0 && a.hit < a.frames.length, b.id + ' ' + k + ' hit');
      if (a.release !== undefined) assert.ok(a.release < a.frames.length && a.projectile === 'arrow', b.id + ' ' + k + ' flèche');
    }
    assert.ok(/^FE-Repo/.test(m.source));
  }
  assert.ok(fs.existsSync(path.join(GEN, 'battlers', 'arrow.png')));
  // personnages et classes de base
  const lab = (tok) => (B.list.find(b => b.id === B.tokens[tok]) || {}).label || '';
  assert.match(lab('Eliwood'), /Eliwood/); assert.match(lab('Hector'), /Hector/); assert.match(lab('Soldier'), /Soldier/); assert.match(lab('ArcherFemale'), /\[F\]/);
});
