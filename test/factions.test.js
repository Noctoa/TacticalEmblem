'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const F = require('../src/shared/factions'), R = require('../src/shared/rules'), M = require('../src/shared/mission'), P = require('../src/shared/palettes');
const W = require('../src/shared/weather');

test('factions : 4 par défaut (armée jaune hostile à tous), 2 personnalisées au plus, hostilité symétrique', () => {
  F.configure(undefined);
  assert.deepEqual(F.all().map(f => f.id), ['player', 'ally', 'enemy', 'yellow']);
  assert.equal(F.hostile('yellow', 'enemy'), true); assert.equal(F.hostile('enemy', 'yellow'), true);
  assert.equal(F.hostile('player', 'ally'), false); assert.equal(F.hostile('ally', 'enemy'), true);
  const list = F.normalize([{ id: 'yellow', name: 'Nomades', foes: ['player'] }]);
  const a = F.create(list, 'Pirates'); list.push(a);
  const b = F.create(list, 'Mages'); list.push(b);
  assert.equal(F.create(list), null, '6 factions au plus');
  assert.notEqual(a.color, b.color);
  a.foes = ['player']; b.foes = [];
  F.configure(list);
  assert.equal(F.all().length, 6);
  assert.equal(F.hostile('yellow', 'enemy'), false, 'les nomades ignorent les rouges');
  assert.equal(F.hostile(a.id, 'yellow'), false);
  b.foes = [a.id]; F.configure(list);
  assert.equal(F.hostile(a.id, b.id), true); assert.equal(F.hostile(b.id, a.id), true, 'symétrique');
  assert.equal(P.teamPalette('yellow'), 'yellow'); assert.equal(P.teamPalette(a.id), a.color);
  assert.ok(F.validate([{ id: 'player' }]).some(e => /réservé/.test(e)));
  assert.equal(F.validate(list).length, 0);
  assert.equal(F.ofPlacement({ faction: 'nope' }), 'enemy'); assert.equal(F.ofPlacement({ faction: 'ally' }), 'ally'); assert.equal(F.ofPlacement({ faction: 'player' }), 'enemy');
  F.configure(undefined);
});

test('factions en jeu : même camp, unités génériques, déroute, vision, pillage', () => {
  F.configure(undefined);
  const p = (team) => ({ team, dead: false, hp: 10, x: 0, y: 0 });
  assert.equal(R.sameSide(p('player'), p('ally')), true);
  assert.equal(R.sameSide(p('yellow'), p('enemy')), false);
  F.configure([{ id: 'yellow', foes: ['player'] }]);
  assert.equal(R.sameSide(p('yellow'), p('enemy')), true, 'jaune et rouge en paix : même camp au sens large');
  F.configure(undefined);
  const db = { classes: [{ id: 'c', name: 'Soldat', mov: 5, moveType: 'foot', base: { hp: 10 }, growths: {} }], units: [], weapons: [], items: [], skills: [] };
  const y = R.makeEnemyFromPlacement({ id: 'y1', classId: 'c', level: 1, faction: 'yellow', x: 1, y: 1 }, db);
  const g = R.makeEnemyFromPlacement({ id: 'g1', classId: 'c', level: 1, faction: 'ally', x: 2, y: 1 }, db);
  assert.equal(y.team, 'yellow'); assert.equal(y.placementId, 'y1'); assert.equal(g.team, 'ally');
  // déroute : l'armée jaune hostile au joueur compte
  const ch = { objective: { type: 'rout' }, players: [{ unitId: 'h' }] };
  const hero = { team: 'player', sourceId: 'h', hp: 10, stats: { hp: 10 } };
  const state = (units) => ({ units, pending: [], turn: 1 });
  assert.notEqual(M.evaluate(ch, { units: [] }, state([hero, y])).outcome, 'victory');
  y.hp = 0; y.dead = true;
  assert.equal(M.evaluate(ch, { units: [] }, state([hero, y, g])).outcome, 'victory', 'un allié générique ne bloque pas la déroute');
  // vision partagée par les camps qui ne se battent pas
  const vis = W.visibleTiles({ type: 'fog', vision: 1 }, [{ team: 'ally', x: 0, y: 0, hp: 5 }], 'player', 5, 5);
  if (vis) assert.ok(vis.has('0,0'));
});

test('affinités : un rang verrouillé jusqu’à un chapitre bloque aussi les suivants', () => {
  const def = { a: 'x', b: 'y', maxRank: 'S', startPoints: 0, locks: { B: 'arc_2', S: 'arc_4' } };
  const st = R.initSupports({ supports: [def] }, R.DEFAULT_SUPPORT), e = Object.values(st)[0];
  const reached = (max) => (id) => Number(id.split('_')[1]) <= max;
  assert.equal(R.supportCap(def, reached(1)), 1); assert.equal(R.supportCap(def, reached(3)), 3); assert.equal(R.supportCap(def, reached(4)), 4);
  R.applySupportLocks(st, reached(1));
  R.addSupportPoints(st, 'x', 'y', 100, R.DEFAULT_SUPPORT); // assez pour A
  e.rank = 1; // conversation C vue
  R.applySupportLocks(st, reached(1));
  const pending = () => R.pendingRank(e, R.DEFAULT_SUPPORT) > 0;
  assert.equal(pending(), false, 'B verrouillé avant le chapitre 2');
  R.applySupportLocks(st, reached(2));
  assert.equal(pending(), true, 'B disponible au chapitre 2');
});
