'use strict';
/* Icônes des armes et objets (pixel art 16 × 16) : planche img/items, icônes des fiches de base, ancien projet. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ArmoryIcons = require('../src/shared/armory-icons');
const D = require('../src/shared/defaults');
const Arsenal = require('../src/shared/fe-arsenal');

const dir = path.join(__dirname, '..', 'src', 'renderer', 'img', 'items');
const icons = () => { const ctx = { self: {} }; vm.runInNewContext(fs.readFileSync(path.join(dir, 'index.js'), 'utf8'), ctx); return ctx.self.ITEM_ICONS; };
const pngSize = (f) => { const b = fs.readFileSync(path.join(dir, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('planche : icônes 16 × 16 rangées par groupe, identifiants uniques', () => {
  const meta = icons();
  assert.equal(meta.cell, 16); assert.equal(meta.cols, 16);
  assert.ok(meta.list.length > 200, 'plus de 200 icônes');
  assert.deepEqual(pngSize('icons.png'), [16 * 16, Math.ceil(meta.list.length / 16) * 16]);
  assert.equal(new Set(meta.list.map(e => e.id)).size, meta.list.length);
  assert.equal(new Set(meta.list.map(e => e.label)).size, meta.list.length, 'noms distincts');
  for (const e of meta.list) assert.match(e.id, /^[a-z0-9-]+$/);
  const groups = new Set(meta.list.map(e => e.group));
  for (const g of ['Épées', 'Lances', 'Haches', 'Arcs et balistes', 'Magie anima', 'Bâtons', 'Clés et cartes']) assert.ok(groups.has(g), g);
  assert.ok(!groups.has('Divers'), 'toutes les icônes ont un groupe');
});

test('armes et objets de base : une icône existante chacun (projet d’exemple et pack de la série)', () => {
  const ids = new Set(icons().list.map(e => 'item:' + e.id));
  for (const id of Object.values(ArmoryIcons.NAMES)) assert.ok(ids.has('item:' + id), id);
  const db = D.sampleProject('Jeu').db;
  for (const e of [...db.weapons, ...db.items]) assert.ok(ids.has(e.image), e.name + ' → ' + e.image);
  assert.equal(db.weapons.find(w => w.id === 'w_iron_sword').image, 'item:iron-sword');
  const pack = { weapons: [], items: [], skills: [] };
  Arsenal.install(pack, Arsenal.GROUPS.map(g => g.id));
  const withIcon = [...pack.weapons, ...pack.items].filter(e => e.image);
  assert.ok(withIcon.length > 80, 'pack : ' + withIcon.length);
  assert.ok(withIcon.every(e => ids.has(e.image)));
  assert.ok(pack.skills.every(s => !/^item:/.test(s.image || '')));
});

test('ancien projet : les armes et objets de base reçoivent leur icône, une icône retirée reste retirée', () => {
  const db = { weapons: [{ name: 'Épée de fer', type: 'sword' }, { name: 'Lame maison', type: 'sword' }, { name: 'Javelot', image: '' }],
    items: [{ name: 'Potion' }, { name: 'Clé de coffre', image: 'item:silver-key' }] };
  assert.equal(ArmoryIcons.fill(db), 2);
  assert.deepEqual(db.weapons.map(w => w.image), ['item:iron-sword', undefined, '']);
  assert.deepEqual(db.items.map(i => i.image), ['item:vulnerary', 'item:silver-key']);
  assert.equal(ArmoryIcons.fill(db), 0);
  assert.ok(ArmoryIcons.isImage('item:iron-sword') && !ArmoryIcons.isImage('icon:luna'));
  assert.equal(ArmoryIcons.defaultImage({ name: 'EPEE DE FER' }), 'item:iron-sword', 'sans accents ni majuscules');
});
