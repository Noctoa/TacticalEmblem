'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = require('../src/shared/palettes.js');
const R = require('../src/shared/rules.js');
const D = require('../src/shared/defaults.js');

// petite planche : tenue bleue (2 tons), peau, cheveux bruns, transparent
const px = (hex, a = 255) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255, a]; };
const sheet = new Uint8Array([
  ...px('#2850c8'), ...px('#2850c8'), ...px('#5078e8'), ...px('#f8c090'),
  ...px('#2850c8'), ...px('#784020'), ...px('#000000', 0), ...px('#5078e8')
]);

test('détection : la tenue, pas la peau ni les cheveux', () => {
  const team = P.detect(P.countColors(sheet));
  assert.deepStrictEqual(team, ['#2850c8', '#5078e8']);
});

test('rouge et vert : seules les couleurs d\'équipe changent, luminosité gardée', () => {
  for (const [pal, hue] of [['red', 2], ['green', 118]]) {
    const d = new Uint8Array(sheet);
    P.apply(d, pal, ['#2850c8', '#5078e8']);
    const [h, , v] = P.toHsv(d[0], d[1], d[2]);
    assert.ok(Math.min(Math.abs(h - hue), 360 - Math.abs(h - hue)) < 12, pal + ' ' + h);
    assert.ok(Math.abs(v - P.toHsv(0x28, 0x50, 0xc8)[2]) < 0.02);
    assert.deepStrictEqual([...d.slice(12, 16)], px('#f8c090'), 'peau inchangée');
    assert.deepStrictEqual([...d.slice(20, 24)], px('#784020'), 'cheveux inchangés');
    assert.strictEqual(d[27], 0, 'transparent inchangé');
  }
});

test('bleu sur une tenue déjà bleue : identique à l\'origine', () => {
  const d = new Uint8Array(sheet);
  P.apply(d, 'blue', ['#2850c8', '#5078e8']);
  assert.deepStrictEqual([...d], [...sheet]);
});

test('gris : tout en niveaux de gris', () => {
  const d = new Uint8Array(sheet);
  P.apply(d, 'gray', []);
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) assert.ok(d[i] === d[i + 1] && d[i + 1] === d[i + 2]);
});

test('liste vide dans le .json : aucune couleur d\'équipe (pas de détection)', () => {
  assert.deepStrictEqual(P.teamColorsOf({ teamColors: [] }, P.countColors(sheet)), []);
  assert.deepStrictEqual(P.teamColorsOf({}, P.countColors(sheet)), ['#2850c8', '#5078e8']);
});

test('palette selon le camp et le réglage', () => {
  assert.strictEqual(P.paletteFor('player', 'team', 'map'), 'blue');
  assert.strictEqual(P.paletteFor('enemy', 'team', 'battle'), 'red');
  assert.strictEqual(P.paletteFor('ally', 'team', 'map'), 'green');
  assert.strictEqual(P.paletteFor('enemy', 'map', 'map'), 'red');
  assert.strictEqual(P.paletteFor('enemy', 'map', 'battle'), 'original');
  assert.strictEqual(P.paletteFor('player', 'original', 'map'), 'original');
  assert.strictEqual(P.paletteFor('player', 'team', 'map', true), 'gray');
  assert.strictEqual(P.paletteFor('player', 'team', 'battle', true), 'blue', 'jamais gris en combat');
  // héritage : placement › unité › classe › projet
  assert.strictEqual(P.resolveMode('', 'original', 'team', 'map'), 'original');
  assert.strictEqual(P.resolveMode('', '', '', undefined), P.DEFAULT_MODE);
  assert.strictEqual(P.resolveMode('n\'importe quoi', 'team'), 'team');
});

test('le réglage suit l\'unité en jeu (personnage, classe, placement)', () => {
  const p = D.sampleProject();
  const lyn = p.db.units.find(u => u.name === 'Lyn');
  lyn.colors = 'original';
  const cls = p.db.classes.find(c => c.id === 'brigand'); cls.colors = 'team';
  const u = R.makeUnitFromCharacter(lyn, p.db, { x: 0, y: 0, colors: 'team' });
  assert.strictEqual(u.colors, 'original');
  assert.strictEqual(u.colorsOverride, 'team');
  const e = R.makeEnemyFromPlacement({ id: 'e', classId: 'brigand', x: 1, y: 1, level: 1 }, p.db);
  assert.strictEqual(e.colors, 'team');
  const e2 = R.makeEnemyFromPlacement({ id: 'e2', classId: 'brigand', x: 1, y: 1, level: 1, colors: 'original' }, p.db);
  assert.strictEqual(e2.colors, 'original');
});
