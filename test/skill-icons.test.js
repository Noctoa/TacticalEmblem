'use strict';
/* Icônes de compétences façon Heroes : planches img/skills, icône des compétences de base, validation. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Skills = require('../src/shared/skills');
const D = require('../src/shared/defaults');

const dir = path.join(__dirname, '..', 'src', 'renderer', 'img', 'skills');
const sheets = () => { const ctx = { self: {} }; vm.runInNewContext(fs.readFileSync(path.join(dir, 'index.js'), 'utf8'), ctx); return ctx.self.SKILL_ICON_SHEETS; };

test('planches : 9 images de 1024 px, cases utilisées listées dans index.js', () => {
  const meta = sheets();
  assert.equal(meta.cell, 76); assert.equal(meta.cols, 13);
  for (let n = 1; n <= 9; n++) {
    assert.ok(fs.existsSync(path.join(dir, `skills-${n}.png`)), 'planche ' + n);
    assert.ok(meta.sheets[n].length > 0 && meta.sheets[n].every(i => i >= 0 && i < 169));
  }
  assert.ok(Object.values(meta.sheets).flat().length > 1300);
});

test('compétences de base : une icône existante chacune, gardée par la validation', () => {
  const meta = sheets();
  for (const s of Skills.presets()) {
    const m = /^feh:(\d+)-(\d+)$/.exec(s.image);
    assert.ok(m && meta.sheets[m[1]].includes(+m[2]), s.id + ' → ' + s.image);
    assert.equal(Skills.presetImage(s.id), s.image);
    assert.deepEqual(Skills.validate(s, []).filter(e => /Icône/.test(e)), []);
  }
  assert.equal(Skills.presetImage('skill_maison'), '');
  assert.ok(D.sampleProject('Jeu').db.skills.every(s => s.image));
});

test('validation : icône vide acceptée, identifiant inconnu refusé', () => {
  const s = Skills.presets()[0];
  assert.ok(!Skills.validate(Object.assign({}, s, { image: '' }), []).some(e => /Icône/.test(e)));
  assert.ok(Skills.validate(Object.assign({}, s, { image: 'luna.png' }), []).some(e => /Icône/.test(e)));
});
