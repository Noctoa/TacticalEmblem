'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Roster = require('../src/shared/roster');
const D = require('../src/shared/defaults');

// les cinq personnages de l'histoire (sans ceux à invoquer)
const db = () => { const d = D.sampleProject('Tri').db; d.units = d.units.filter(u => ['c_xarrin', 'c_eliwood', 'c_lyn', 'c_hector', 'c_cloud'].includes(u.id)); return d; };
const names = groups => groups.map(g => [g.label, g.units.map(u => u.name)]);

test('ordre de la base et tri par nom', () => {
  const d = db();
  assert.deepEqual(names(Roster.arrange(d.units, d, {})), [['', ['Xarrin', 'Eliwood', 'Lyn', 'Hector', 'Cloud']]]);
  assert.deepEqual(names(Roster.arrange(d.units, d, { by: 'name' })), [['', ['Cloud', 'Eliwood', 'Hector', 'Lyn', 'Xarrin']]]);
});

test('par série : ordre alphabétique, personnages sans série à la fin', () => {
  const d = db();
  d.units.push(Object.assign({}, d.units[0], { id: 'c_x', name: 'Anonyme', series: '  ' }));
  d.units.push(Object.assign({}, d.units[0], { id: 'c_y', name: 'Roy', series: 'fire emblem 7' })); // même série, casse différente
  assert.deepEqual(names(Roster.arrange(d.units, d, { by: 'series' })), [
    ['Final Fantasy VII', ['Cloud']], ['Fire Emblem 7', ['Eliwood', 'Hector', 'Lyn', 'Roy']], ['Original', ['Xarrin']], [Roster.NO_SERIES, ['Anonyme']]]);
  assert.deepEqual(Roster.seriesList(d), ['Final Fantasy VII', 'Fire Emblem 7', 'Original']);
});

test('par arme : armes de la classe, dans l’ordre des types ; plusieurs armes = plusieurs groupes', () => {
  const d = db();
  const lyn = d.units.find(u => u.id === 'c_lyn');
  assert.deepEqual(Roster.weaponTypesOf(lyn, d), d.classes.find(c => c.id === lyn.classId).weapons.slice().sort((a, b) => ['sword', 'lance', 'axe', 'bow'].indexOf(a) - ['sword', 'lance', 'axe', 'bow'].indexOf(b)));
  const groups = Roster.arrange(d.units, d, { by: 'weapon' });
  assert.equal(groups[0].label, 'Épée');
  assert.ok(groups.find(g => g.key === 'axe').units.some(u => u.name === 'Hector'));
  for (const id of Roster.weaponTypesOf(lyn, d)) assert.ok(groups.find(g => g.key === id).units.includes(lyn));
  // classe sans arme : armes de l'inventaire, sinon « Aucune arme »
  d.classes.push({ id: 'cls_vide', name: 'Civil', weapons: [] });
  d.units.push({ id: 'c_civil', name: 'Civil', classId: 'cls_vide', inventory: [{ id: 'w_iron_bow' }] });
  d.units.push({ id: 'c_rien', name: 'Rien', classId: 'cls_vide', inventory: [] });
  const g2 = Roster.arrange(d.units, d, { by: 'weapon' });
  assert.ok(g2.find(g => g.key === 'bow').units.some(u => u.id === 'c_civil'));
  assert.deepEqual(g2[g2.length - 1].units.map(u => u.id), ['c_rien']);
  assert.equal(g2[g2.length - 1].label, Roster.NO_WEAPON);
});

test('par classe, dans l’ordre des classes de la base', () => {
  const d = db();
  const groups = Roster.arrange(d.units, d, { by: 'class' });
  const order = d.classes.map(c => c.id);
  assert.deepEqual(groups.map(g => g.key), groups.map(g => g.key).slice().sort((a, b) => order.indexOf(a) - order.indexOf(b)));
  assert.deepEqual(groups.find(g => g.key === 'lord').units.map(u => u.name), ['Eliwood', 'Xarrin']);
});

test('recherche : nom, classe, arme ou série, sans accents ni casse', () => {
  const d = db();
  const find = q => Roster.arrange(d.units, d, { query: q })[0].units.map(u => u.name);
  assert.deepEqual(find('lyn'), ['Lyn']);
  assert.deepEqual(find('final'), ['Cloud']);
  assert.deepEqual(find('EPEE fire'), ['Eliwood', 'Lyn']);
  assert.deepEqual(find('hache'), ['Hector']);
  assert.deepEqual(find('zzz'), []);
  assert.deepEqual(names(Roster.arrange(d.units, d, { by: 'series', query: 'xar' })), [['Original', ['Xarrin']]]);
});
