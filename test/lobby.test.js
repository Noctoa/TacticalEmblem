'use strict';
const test = require('node:test');
const assert = require('node:assert');
const L = require('../src/shared/lobby.js');
const Campaign = require('../src/shared/campaign.js');

const db = () => ({
  units: [
    { id: 'hero', name: 'Eliwood', protagonist: true },
    { id: 'lyn', name: 'Lyn' },
    { id: 'hec', name: 'Hector' }
  ],
  chapters: [
    { id: 'c1', name: 'Prologue', next: 'c2', gold: 500 },
    { id: 'c2', name: 'Chapitre 1', next: 'c3', gold: 800, replay: false },
    { id: 'c3', name: 'Chapitre 2' },
    { id: 'ev1', name: 'Escarmouche', kind: 'event', unlock: { after: 'c1' }, gold: 300, goldEachClear: true },
    { id: 'ev2', name: 'Halloween', kind: 'event', unlock: { from: '2026-10-25', to: '2026-11-02' } },
    { id: 'ev3', name: 'Souvenir de Lyn', kind: 'event', unlock: { alive: ['lyn'] } }
  ],
  weapons: [{ id: 'w_sword', name: 'Épée de fer', uses: 40, price: 460 }, { id: 'w_relic', name: 'Relique', uses: 0 }],
  items: [{ id: 'i_pot', name: 'Potion', uses: 3, price: 300 }],
  talks: [
    { id: 't1', name: 'Premier soir', unitId: 'lyn', script: 'Lyn: Bonsoir.', points: 10 },
    { id: 't2', name: 'Après le pont', unitId: 'lyn', script: 'Lyn: Merci.', after: 'c2' },
    { id: 't3', name: 'Toujours là', unitId: 'hec', script: 'Hector: Encore toi.', once: false },
    { id: 't4', name: 'Vide', unitId: 'hec', script: '   ' }
  ]
});
const meta = { startChapter: 'c1' };
const ids = (list) => list.map(e => e.ch ? e.ch.id : e.talk.id);
const NOW = new Date(2026, 9, 19); // 19/10/2026

test('nouvelle partie : seul le chapitre de départ et les évènements sans condition', () => {
  const c = Campaign.create('classic', 1000);
  assert.strictEqual(c.gold, 1000);
  const list = L.chapters(db(), meta, c, NOW);
  assert.deepStrictEqual(ids(list), ['c1', 'ev2', 'ev3']);
  assert.ok(list[0].playable && list[0].state === 'new');
  const hw = list.find(e => e.ch.id === 'ev2');
  assert.ok(!hw.playable && hw.upcoming, 'évènement daté à venir : listé mais verrouillé');
  assert.match(hw.reasons[0], /25\/10\/2026/);
});

test('victoire : or, chapitre suivant et évènement débloqués', () => {
  const c = Campaign.create('classic');
  const d = db();
  assert.strictEqual(L.completeChapter(c, d.chapters[0]), 500);
  assert.strictEqual(c.gold, 500);
  const list = L.chapters(d, meta, c, NOW);
  assert.deepStrictEqual(ids(list), ['c1', 'c2', 'ev1', 'ev2', 'ev3']);
  assert.strictEqual(list[0].state, 'cleared');
  assert.ok(list[0].playable, 'rejouable par défaut');
  assert.strictEqual(list[0].gold, 0, 'pas d\'or en le rejouant');
  // rejouer ne redonne pas l'or ; l'évènement « à chaque victoire » si
  assert.strictEqual(L.completeChapter(c, d.chapters[0]), 0);
  assert.strictEqual(L.completeChapter(c, d.chapters[3]), 300);
  assert.strictEqual(L.completeChapter(c, d.chapters[3]), 300);
  assert.strictEqual(c.gold, 1100);
  // chapitre non rejouable
  L.completeChapter(c, d.chapters[1]);
  const c2 = L.chapters(d, meta, c, NOW).find(e => e.ch.id === 'c2');
  assert.ok(c2.state === 'cleared' && !c2.playable);
});

test('dates réelles et personnages vivants', () => {
  const c = Campaign.create('classic');
  const during = L.chapters(db(), meta, c, new Date(2026, 9, 31)).find(e => e.ch.id === 'ev2');
  assert.ok(during.playable);
  const after = L.chapters(db(), meta, c, new Date(2026, 10, 3)).find(e => e.ch.id === 'ev2');
  assert.strictEqual(after, undefined, 'évènement fini : plus listé');
  c.dead.push('lyn');
  assert.ok(!L.chapters(db(), meta, c, NOW).some(e => e.ch.id === 'ev3'));
});

test('personnages présents et conversations', () => {
  const d = db();
  const cfg = L.defaults({ spots: [{ unitId: 'lyn', x: 2, y: 2 }, { unitId: 'hec', x: 3, y: 2, after: 'c1' }, { unitId: 'hero', x: 1, y: 1 }] });
  const c = Campaign.create('classic');
  assert.strictEqual(L.heroOf(cfg, d).id, 'hero');
  assert.deepStrictEqual(L.present(cfg, d, c).map(p => p.unit.id), ['lyn'], 'Hector arrive après le prologue ; le héros n\'est pas un PNJ');
  assert.deepStrictEqual(ids(L.talks(cfg, d, c)), ['t1']);
  L.markTalk(c, d.talks[0]);
  assert.deepStrictEqual(ids(L.talks(cfg, d, c)), []);
  L.completeChapter(c, d.chapters[0]); L.completeChapter(c, d.chapters[1]);
  assert.deepStrictEqual(ids(L.talks(cfg, d, c)), ['t2', 't3']);
  L.markTalk(c, d.talks[2]);
  assert.deepStrictEqual(ids(L.talks(cfg, d, c)), ['t2', 't3'], 'once: false — rejouable');
  c.dead.push('lyn');
  assert.deepStrictEqual(ids(L.talks(cfg, d, c)), ['t3']);
});

test('boutique : achat, revente au prorata, objets sans prix', () => {
  const d = db();
  const c = Campaign.create('classic', 500);
  const cfg = L.defaults({ shop: { stock: ['w_sword', 'i_pot', 'w_relic', 'inconnu'] } });
  assert.deepStrictEqual(L.stock(cfg, d).map(e => [e.id, e.price]), [['w_sword', 460], ['i_pot', 300]]);
  const r = L.buy(c, d, 'w_sword');
  assert.ok(r.ok); assert.deepStrictEqual(r.slot, { id: 'w_sword', uses: 40 }); assert.strictEqual(c.gold, 40);
  assert.strictEqual(L.buy(c, d, 'i_pot').ok, false);
  assert.strictEqual(c.gold, 40);
  assert.strictEqual(L.sellPrice(d.weapons[0], 40), 230);
  assert.strictEqual(L.sellPrice(d.weapons[0], 20), 115);
  assert.strictEqual(L.sellPrice(d.weapons[1], 0), 0);
  assert.strictEqual(L.sell(c, d, { id: 'i_pot', uses: 1 }).amount, 50);
  assert.strictEqual(c.gold, 90);
  assert.strictEqual(L.sell(c, d, { id: 'w_relic' }).ok, false);
});

test('sauvegarde : or et progression gardés, anciennes sauvegardes complétées', () => {
  const c = Campaign.create('casual', 250);
  c.cleared.push('c1'); c.talks.push('t1');
  const save = Campaign.checkpoint(L.LOBBY_SAVE, c, [{ id: 'i_pot', uses: 3 }], {});
  const back = Campaign.restore(JSON.parse(JSON.stringify(save)), {});
  assert.strictEqual(back.campaign.gold, 250);
  assert.deepStrictEqual(back.campaign.cleared, ['c1']);
  assert.deepStrictEqual(back.campaign.talks, ['t1']);
  const old = { version: 1, chapterId: 'c2', campaign: { mode: 'classic', dead: [], units: {} }, convoy: [], supports: {} };
  const r = Campaign.restore(old, {});
  assert.deepStrictEqual([r.campaign.gold, r.campaign.cleared, r.campaign.talks], [0, [], []]);
});

test('validation de la configuration', () => {
  const d = db();
  const maps = [{ id: 'camp', width: 10, height: 8 }];
  assert.deepStrictEqual(L.validate({ enabled: false }, d, maps), []);
  assert.match(L.validate({ enabled: true }, d, maps)[0], /map/);
  const ok = { enabled: true, mapId: 'camp', start: { x: 1, y: 1 }, board: { x: 5, y: 1 }, shop: { x: 8, y: 6 }, spots: [{ unitId: 'lyn', x: 2, y: 2 }] };
  assert.deepStrictEqual(L.validate(ok, d, maps), []);
  const bad = Object.assign({}, ok, { board: { x: 12, y: 1 }, spots: [{ unitId: 'lyn', x: 1, y: 1 }, { unitId: 'nope', x: 0, y: 0 }] });
  const errors = L.validate(bad, d, maps);
  assert.ok(errors.some(e => /table des chapitres/.test(e)));
  assert.ok(errors.some(e => /déjà occupée/.test(e)));
  assert.ok(errors.some(e => /inconnu/.test(e)));
});
