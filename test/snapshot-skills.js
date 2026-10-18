/* Test Electron du catalogue : anciens projets, création, édition, duplication et sauvegarde. */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const assert = require('assert/strict');
const { app } = require('electron');
const io = require('../src/main/project-io');
module.exports = editor => {
  const out = process.env.TF_SNAPSHOT;
  fs.mkdirSync(out, { recursive: true });
  const errors = [], wc = editor.webContents;
  wc.setBackgroundThrottling(false);
  const js = code => wc.executeJavaScript(code, true);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const finish = result => { fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(result.ok ? 0 : 1); };
  const watchdog = setTimeout(() => finish({ ok: false, error: 'Délai global dépassé', errors }), 45000);
  const until = async code => {
    const end = Date.now() + 10000;
    while (Date.now() < end) { if (await js(code)) return; await wait(60); }
    throw new Error('Délai dépassé : ' + code);
  };
  const click = (selector, text) => js(`(() => {
    const button = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.textContent.includes(${JSON.stringify(text)}));
    if (!button) throw new Error('Bouton absent : ' + ${JSON.stringify(text)}); button.click();
  })()`);
  const edit = (label, value) => js(`(() => {
    const label = [...document.querySelectorAll('.db-form .field-label')].find(e => e.textContent === ${JSON.stringify(label)});
    if (!label) throw new Error('Champ absent : ' + ${JSON.stringify(label)});
    const input = label.parentElement.querySelector('input,select,textarea');
    input.value = ${JSON.stringify(value)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
  wc.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-skills-ui-')), 'Jeu');
      io.createProject(dir, 'Test des compétences', 'sample', path.join(__dirname, '..', 'assets'));
      // Représente un projet créé avant l'ajout des compétences.
      fs.unlinkSync(path.join(dir, 'data', 'skills.json'));
      await js(`Editor.open(${JSON.stringify(dir)})`);
      await js(`DBEditor.open('skills')`);
      assert.equal(await js('Editor.db().skills.length'), 0);
      await click('.db-form button', 'Ajouter les exemples');
      assert.equal(await js('Editor.db().skills.length'), 10);
      await click('.db-list-actions button', 'Nouveau');
      await edit('Nom', 'Soleil du test');
      await edit('Type d’effet', 'sol');
      await edit('Dégâts réels convertis en soin (%)', 35);
      await edit('Probabilité de déclenchement', 'fixed');
      await edit('Chance de déclenchement (%)', 25);
      await edit('État des PV du porteur', 'below');
      await edit('Seuil (% des PV maximum)', 40);
      await edit('Description du créateur (facultative)', 'Une fiche créée et conservée depuis l’interface.');
      assert.match(await js(`document.querySelector('.skill-summary').textContent`), /35 %/);
      assert.match(await js(`document.querySelector('.skill-summary').textContent`), /≤ 40 %/);
      assert.equal(await js(`document.querySelector('.skill-validation').textContent`), '');
      await edit('Dégâts réels convertis en soin (%)', 999);
      assert.match(await js(`document.querySelector('.skill-validation').textContent`), /1 à 100/);
      await edit('Dégâts réels convertis en soin (%)', 35);
      await js(`document.querySelector('.db-list-actions button[title="Dupliquer"]').click()`);
      assert.equal(await js('Editor.db().skills.length'), 12);
      await edit('Nom', 'Copie indépendante');
      await edit('Dégâts réels convertis en soin (%)', 60);
      assert.equal(await js('Editor.db().skills[10].amount'), 35);
      await js(`document.querySelector('.db-list-actions button[title="Supprimer"]').click()`);
      await until(`!!document.querySelector('.modal-back')`);
      await click('.modal-actions button', 'Annuler');
      assert.equal(await js('Editor.db().skills.length'), 12);
      await js(`document.querySelector('.db-list-actions button[title="Supprimer"]').click()`);
      await click('.modal-actions button', 'Supprimer');
      assert.equal(await js('Editor.db().skills.length'), 11);
      await js(`DBEditor.close()`);
      wc.send('menu', 'save'); await until('!Editor.state.dirty');
      assert.equal(io.loadProject(dir).db.skills[10].amount, 35);
      await js(`Editor.open(${JSON.stringify(dir)})`);
      await js(`DBEditor.open('skills', 'skill_11')`);
      assert.equal(await js('Editor.db().skills[10].name'), 'Soleil du test');
      assert.equal(await js(`document.querySelectorAll('.db-item').length`), 11);
      assert.match(await js(`document.querySelector('.db-form h2').textContent`), /Soleil du test/);
      // Les fenêtres masquées ont un rafraîchissement réduit : laisser le compositeur peindre.
      await wait(1300);
      fs.writeFileSync(path.join(out, 'skills.png'), (await wc.capturePage()).toPNG());
      assert.deepEqual(errors, []);
      clearTimeout(watchdog); finish({ ok: true, skills: 11, errors });
    } catch (e) { clearTimeout(watchdog); finish({ ok: false, error: e.stack, errors }); }
  });
};
