'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/shared/summon');
const C = require('../src/shared/campaign');
const R = require('../src/shared/rules');
const D = require('../src/shared/defaults');

const fresh = () => { const p = D.sampleProject('Invocations'); const c = C.create('classic', 0); S.ensure(c, p.meta); return { p, db: p.db, meta: p.meta, c }; };
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };
const lycia = (db) => db.banners.find(b => b.id === 'bn_lycia');

test('orbes de départ données une seule fois, anciennes sauvegardes comprises', () => {
  const { meta, c } = fresh();
  assert.equal(c.orbs, 20);
  S.ensure(c, meta); assert.equal(c.orbs, 20);
  const old = { mode: 'classic', dead: [], units: {}, gold: 0, cleared: [], talks: [], orbs: 6 }; // orbes gagnées avant l'autel
  S.ensure(old, meta); assert.equal(old.orbs, 26);
});

test('taux : 5★ mis en avant / 5★ / 4★ / 3★, somme 100 ; rareté sans personnage redistribuée', () => {
  const { db, meta, c } = fresh();
  const r = S.rates(lycia(db), db, c, meta);
  assert.deepEqual([r.focus, r[5], r[4], r[3]], [3, 3, 58, 36]);
  const mercs = db.banners.find(b => b.id === 'bn_mercs');
  const m = S.rates(mercs, db, c, meta); // Cloud seul 5★, mis en avant : il prend tout le taux 5★
  assert.deepEqual([m.focus, m[5]], [6, 0]);
  const only3 = { id: 'b3', pool: ['c_serra', 'c_dorcas'], focus: [], rates: { 5: 6, 4: 58, 3: 36 } };
  const o = S.rates(only3, db, c, meta);
  assert.equal(Math.round(o[3]), 100);
});

test('pitié : +0,5 % de 5★ toutes les 5 invocations sans 5★, retirés des 4★ / 3★ ; remise à zéro sur un 5★', () => {
  const { db, meta, c } = fresh();
  c.summons.pity.bn_lycia = 12;
  const r = S.rates(lycia(db), db, c, meta);
  assert.equal(r.pity, 1);
  assert.ok(Math.abs(r.focus + r[5] - 7) < 1e-9);
  assert.ok(Math.abs(r[4] + r[3] - 93) < 1e-9);
  const session = S.circle(lycia(db), db, c, meta, seq(0.01, 0)); // tous des 5★ mis en avant
  c.orbs = 100;
  S.open(session, 0, c, db, meta);
  assert.equal(c.summons.pity.bn_lycia, 0);
});

test('cercle : 5 pierres dont la couleur vient de l’arme ; coûts 5, 4, 4, 4, 3', () => {
  const { db, meta, c } = fresh();
  const session = S.circle(lycia(db), db, c, meta, R.makeRng(7));
  assert.equal(session.stones.length, 5);
  for (const st of session.stones) assert.equal(st.color, S.colorOf(db.units.find(u => u.id === st.unitId), db).id);
  c.orbs = 100;
  const costs = [0, 1, 2, 3, 4].map(i => { const cost = S.nextCost(session, meta); assert.ok(S.open(session, i, c, db, meta).ok); return cost; });
  assert.deepEqual(costs, [5, 4, 4, 4, 3]);
  assert.equal(c.orbs, 80);
  assert.equal(c.summons.total, 5);
  assert.equal(S.open(session, 0, c, db, meta).ok, false); // déjà ouverte
});

test('pas assez d’orbes : rien ne change', () => {
  const { db, meta, c } = fresh();
  c.orbs = 4;
  const session = S.circle(lycia(db), db, c, meta, R.makeRng(3));
  const r = S.open(session, 0, c, db, meta);
  assert.equal(r.ok, false);
  assert.equal(c.orbs, 4);
  assert.equal(session.pulled, 0);
});

test('nouveau personnage : recruté ; déjà dans l’équipe : fusion +1, jusqu’à +10', () => {
  const { db, meta, c } = fresh();
  const a = S.receive(c, db, meta, 'c_rebecca');
  assert.ok(a.isNew && c.recruited.includes('c_rebecca'));
  const b = S.receive(c, db, meta, 'c_rebecca');
  assert.deepEqual([b.isNew, b.merges], [false, 1]);
  const lyn = S.receive(c, db, meta, 'c_lyn'); // dans l'équipe de départ
  assert.deepEqual([lyn.isNew, lyn.merges], [false, 1]);
  for (let i = 0; i < 12; i++) S.receive(c, db, meta, 'c_rebecca');
  assert.equal(c.merges.c_rebecca, 10);
  assert.ok(S.receive(c, db, meta, 'c_rebecca').maxed);
});

test('fusions : +1 à deux stats par fusion (les plus hautes d’abord), appliquées une seule fois', () => {
  const { db, meta, c } = fresh();
  const lyn = db.units.find(u => u.id === 'c_lyn');
  assert.deepEqual(S.mergeOrder(lyn).slice(0, 2), ['hp', 'spd']);
  c.merges.c_lyn = 3;
  const unit = C.apply(c, R.makeUnitFromCharacter(lyn, db, { x: 0, y: 0 }), db);
  const base = R.makeUnitFromCharacter(lyn, db, { x: 0, y: 0 });
  const diff = Object.fromEntries(R.STATS.map(k => [k, unit.stats[k] - base.stats[k]]));
  assert.equal(Object.values(diff).reduce((a, b) => a + b, 0), 6);
  assert.equal(diff.hp, 1); assert.equal(diff.spd, 1);
  assert.equal(unit.merges, 3);
  // sauvegarde puis rechargement : pas de double comptage
  C.commit(c, [Object.assign(unit, { team: 'player' })]);
  const again = C.apply(c, R.makeUnitFromCharacter(lyn, db, { x: 0, y: 0 }), db);
  assert.deepEqual(again.stats, unit.stats);
  c.merges.c_lyn = 4;
  const more = C.apply(c, R.makeUnitFromCharacter(lyn, db, { x: 0, y: 0 }), db);
  assert.equal(R.STATS.reduce((a, k) => a + more.stats[k] - unit.stats[k], 0), 2);
});

test('bannières : conditions de déblocage, dates, morts exclus en Classique', () => {
  const { db, c } = fresh();
  const list = S.banners(db, c, new Date('2026-10-20'));
  assert.deepEqual(list.map(b => [b.banner.id, b.open]), [['bn_lycia', true], ['bn_mercs', false]]);
  c.cleared.push('ch_1', 'ch_1_2');
  assert.ok(S.banners(db, c, new Date('2026-10-20')).find(b => b.banner.id === 'bn_mercs').open);
  db.banners[0].unlock.to = '2026-01-01';
  assert.ok(!S.banners(db, c, new Date('2026-10-20')).some(b => b.banner.id === 'bn_lycia')); // terminée : retirée
  c.dead.push('c_rebecca');
  assert.ok(!S.poolOf(S.normalizeBanner(db.banners[0]), db, c).some(u => u.id === 'c_rebecca'));
});

test('récompenses : orbes à la première victoire d’un acte seulement', () => {
  const { db, c } = fresh();
  const L = require('../src/shared/lobby');
  const ch = db.chapters.find(x => x.id === 'ch_1');
  L.completeChapter(c, ch); assert.equal(c.orbs, 23);
  L.completeChapter(c, ch); assert.equal(c.orbs, 23);
});

test('validation des bannières', () => {
  const { db } = fresh();
  assert.deepEqual(S.validate(db), []);
  db.banners.push({ id: 'x', name: 'Vide', pool: [], focus: [], rates: { 5: 0, 4: 0, 3: 0 } });
  db.banners[0].pool.push('c_inconnu');
  const e = S.validate(db).join('\n');
  assert.match(e, /Vide.*aucun personnage/);
  assert.match(e, /taux sont à 0/);
  assert.match(e, /supprimé \(c_inconnu\)/);
});

test('tirage : répartition conforme aux taux sur beaucoup d’invocations', () => {
  const { db, meta, c } = fresh();
  const rng = R.makeRng(42), count = { 5: 0, 4: 0, 3: 0 };
  for (let i = 0; i < 20000; i++) count[S.roll(lycia(db), db, c, meta, rng).rarity]++;
  assert.ok(Math.abs(count[5] / 200 - 6) < 1, JSON.stringify(count));
  assert.ok(Math.abs(count[4] / 200 - 58) < 2, JSON.stringify(count));
});
