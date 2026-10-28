'use strict';
/* Icônes de compétences (pixel art 16 × 16) : planche img/skills, icône des compétences de base, validation, ancien format. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Skills = require('../src/shared/skills');
const D = require('../src/shared/defaults');

const dir = path.join(__dirname, '..', 'src', 'renderer', 'img', 'skills');
const icons = () => { const ctx = { self: {} }; vm.runInNewContext(fs.readFileSync(path.join(dir, 'index.js'), 'utf8'), ctx); return ctx.self.SKILL_ICONS; };
const pngSize = (f) => { const b = fs.readFileSync(path.join(dir, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('planche : icônes 16 × 16 listées dans index.js, identifiants uniques, crédits', () => {
  const meta = icons();
  assert.equal(meta.cell, 16); assert.equal(meta.cols, 16);
  assert.ok(meta.list.length > 150, 'plus de 150 icônes');
  assert.deepEqual(pngSize('icons.png'), [16 * 16, Math.ceil(meta.list.length / 16) * 16]);
  assert.equal(new Set(meta.list.map(e => e.id)).size, meta.list.length);
  for (const e of meta.list) { assert.match(e.id, /^[a-z0-9-]+$/); assert.ok(e.label && e.group && e.credits.length, e.id); }
  assert.ok(!fs.readdirSync(dir).some(f => /^skills-\d+\.png$/.test(f)), 'anciennes planches façon Heroes retirées');
  const credits = fs.readFileSync(path.join(__dirname, '..', 'tools', 'skill-icons', 'CREDITS.txt'), 'utf8');
  assert.ok(credits.includes('Jeorge Reds') && credits.includes('icon:luna'));
});

test('compétences de base : une icône existante chacune, gardée par la validation', () => {
  const ids = new Set(icons().list.map(e => 'icon:' + e.id));
  for (const s of Skills.presets()) {
    assert.ok(ids.has(s.image), s.id + ' → ' + s.image);
    assert.equal(Skills.presetImage(s.id), s.image);
    assert.deepEqual(Skills.validate(s, []).filter(e => /Icône/.test(e)), []);
  }
  assert.equal(Skills.presetImage('skill_maison'), '');
  assert.ok(D.sampleProject('Jeu').db.skills.every(s => /^icon:/.test(s.image)));
});

test('validation et ancien format « feh: » : remplacé par l’icône de base ou par le symbole', () => {
  const s = Skills.presets()[0];
  assert.ok(!Skills.validate(Object.assign({}, s, { image: '' }), []).some(e => /Icône/.test(e)));
  assert.ok(Skills.validate(Object.assign({}, s, { image: 'luna.png' }), []).some(e => /Icône/.test(e)));
  assert.ok(Skills.isLegacyImage('feh:2-45') && !Skills.isLegacyImage('icon:luna'));
  assert.equal(Skills.upgradeImage({ id: 'skill_luna', image: 'feh:2-45' }), 'icon:luna');
  assert.equal(Skills.upgradeImage({ id: 'skill_maison', image: 'feh:5-20' }), '');
  assert.equal(Skills.upgradeImage({ id: 'skill_maison', image: 'icon:astra' }), 'icon:astra');
});
