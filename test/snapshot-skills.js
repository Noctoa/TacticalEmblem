/* Test Electron du catalogue : anciens projets, création, édition, duplication et sauvegarde. */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const assert = require('assert/strict');
const { app } = require('electron');
const io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT;
  fs.mkdirSync(out, { recursive: true });
  const errors = [], wc = editor.webContents;
  wc.setBackgroundThrottling(false);
  const js = code => wc.executeJavaScript(code, true);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const shot = async (contents, name) => {
    // Éviter une capture au milieu du fondu lorsque la fenêtre reste masquée.
    await contents.executeJavaScript(`document.querySelectorAll('.modal-back').forEach(el => { el.style.animation = 'none'; })`, true);
    // La première capture réveille le compositeur d'une fenêtre masquée.
    await contents.capturePage(); await wait(250);
    fs.writeFileSync(path.join(out, name + '.png'), (await contents.capturePage()).toPNG());
  };
  const finish = result => { fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(result.ok ? 0 : 1); };
  const watchdog = setTimeout(() => finish({ ok: false, error: 'Délai global dépassé', errors }), 90000);
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
      const project = io.createProject(dir, 'Test des compétences', 'sample', path.join(__dirname, '..', 'assets'));
      const heroId = project.db.units[0].id;
      const chapter = project.db.chapters[0];
      Object.assign(chapter, { events: [], requiredUnits: [], objective: { type: 'survive', turns: 1 }, next: 'ch_2', final: false });
      const second = JSON.parse(JSON.stringify(chapter));
      Object.assign(second, { id: 'ch_2', name: 'Suite des compétences', next: '', objective: { type: 'survive', turns: 99 } });
      project.db.chapters.push(second); io.saveProject(dir, project);
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
      await shot(wc, 'skills');
      // Attribution réelle dans la fiche du personnage.
      const learned = ['esquive', 'offensive', 'garde', 'presence', 'regeneration', 'luna'].map(id => 'skill_' + id);
      await js(`DBEditor.open('units', ${JSON.stringify(heroId)})`);
      const personal = id => js(`(() => { const s = document.querySelector('[data-skill-personal]'); s.value = ${JSON.stringify(id)}; s.dispatchEvent(new Event('change')); })()`);
      const learn = id => js(`document.querySelector('[data-skill-learn="${id}"]').click()`);
      const equip = (index, id) => js(`(() => { const s = document.querySelector('[data-skill-slot="${index}"]'); s.value = ${JSON.stringify(id)}; s.dispatchEvent(new Event('change')); })()`);
      await personal('skill_precision');
      for (const id of learned) await learn(id);
      for (let i = 0; i < 5; i++) await equip(i, learned[i]);
      assert.equal(await js('Editor.db().units[0].equippedSkills.length'), 5);
      assert.equal(await js(`document.querySelectorAll('[data-skill-slot]').length`), 5);
      assert.equal(await js(`[...document.querySelectorAll('[data-skill-slot] option')].some(o => o.value === 'skill_precision')`), false);
      await learn('skill_garde');
      assert.equal(await js(`Editor.db().units[0].equippedSkills.includes('skill_garde')`), false);
      await learn('skill_garde');
      await personal('skill_esquive');
      assert.equal(await js(`Editor.db().units[0].equippedSkills.includes('skill_esquive')`), false);
      await personal('skill_precision');
      while (await js('Editor.db().units[0].equippedSkills.length')) await equip(0, '');
      for (let i = 0; i < 5; i++) await equip(i, learned[i]);
      // Une compétence utilisée ne peut pas être supprimée du catalogue.
      await js(`DBEditor.open('skills', 'skill_precision')`);
      await js(`document.querySelector('.db-list-actions button[title="Supprimer"]').click()`);
      await until(`!!document.querySelector('.modal-back')`);
      assert.match(await js(`document.querySelector('.modal-back').textContent`), /Compétence utilisée/);
      await click('.modal-actions button', 'OK');
      assert.equal(await js('Editor.db().skills.length'), 11);
      await js(`DBEditor.open('units', ${JSON.stringify(heroId)})`);
      await js(`document.querySelector('.unit-skills').scrollIntoView({ block: 'start' })`);
      await wait(1300);
      await shot(wc, 'assignments');
      await js('DBEditor.close()'); wc.send('menu', 'save'); await until('!Editor.state.dirty');
      await js(`Editor.open(${JSON.stringify(dir)})`);
      assert.equal(await js('Editor.db().units[0].personalSkill'), 'skill_precision');
      assert.deepEqual(await js('Editor.db().units[0].equippedSkills'), learned.slice(0, 5));

      const untilGame = async (contents, code) => {
        const end = Date.now() + 15000;
        while (Date.now() < end) { if (await contents.executeJavaScript(code, true)) return; await wait(70); }
        throw new Error('Délai jeu dépassé : ' + code);
      };
      const startGame = async mode => {
        const win = openPlaytest(dir, 'ch_1'), contents = win.webContents;
        contents.setBackgroundThrottling(false);
        contents.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
        await new Promise(resolve => contents.once('did-finish-load', resolve));
        await untilGame(contents, `!!document.querySelector('.choice-list')`);
        await contents.executeJavaScript(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes(${JSON.stringify(mode)})).click()`, true);
        await untilGame(contents, '!!PlaytestState.map && !PlaytestState.busy');
        return win;
      };
      const game = await startGame('Classique'), gwc = game.webContents;
      const gj = code => gwc.executeJavaScript(code, true);
      await untilGame(gwc, `!!document.querySelector('.u-skill-button')`);
      await gj(`document.querySelector('.u-skill-button').click()`);
      await untilGame(gwc, `!!document.querySelector('.skill-details-modal')`);
      assert.equal(await gj(`document.querySelectorAll('.game-skill-card').length`), 6);
      assert.equal(await gj(`document.querySelectorAll('.skill-details-modal select').length`), 0);
      assert.match(await gj(`document.querySelector('.game-skill-card').textContent`), /Personnelle \(fixe\).*Précision/);
      await wait(1300);
      await shot(gwc, 'skills-game');
      await gj(`document.querySelector('.skill-details-modal .modal-actions button').click()`);
      await untilGame(gwc, '!PlaytestState.busy');
      await gj('PlaytestState.turn = 2');
      const key = async k => { gwc.sendInputEvent({ type: 'keyDown', keyCode: k }); gwc.sendInputEvent({ type: 'keyUp', keyCode: k }); await wait(120); };
      await key('Z'); await untilGame(gwc, `PlaytestState.ui === 'moving'`);
      await key('Z'); await untilGame(gwc, `PlaytestState.ui === 'menu'`);
      await gj(`PlaytestState.menu.items.find(i => i.label === 'Attendre').action()`);
      await untilGame(gwc, 'PlaytestState.over');
      await gj(`[...document.querySelectorAll('#end button')].find(b => b.textContent.includes('Chapitre suivant')).click()`);
      await untilGame(gwc, `PlaytestState.chapter.id === 'ch_2' && !PlaytestState.busy`);
      const checkHero = contents => contents.executeJavaScript(`(() => { const hero = PlaytestState.units.find(u => u.sourceId === ${JSON.stringify(heroId)}); return { personalSkill: hero.personalSkill, equippedSkills: hero.equippedSkills }; })()`, true);
      const expected = { personalSkill: 'skill_precision', equippedSkills: learned.slice(0, 5) };
      assert.deepEqual(await checkHero(gwc), expected);
      await gj('PlaytestState.cursor = { x: 0, y: 0 }'); await key('Z');
      await untilGame(gwc, `PlaytestState.ui === 'mapmenu'`);
      await gj(`PlaytestState.menu.items.find(i => i.label === 'Sauvegarder').action()`);
      await untilGame(gwc, '!PlaytestState.busy');
      assert.ok(fs.existsSync(path.join(dir, 'saves', 'campaign.json'))); game.close();
      const resumed = await startGame('Continuer');
      assert.equal(await resumed.webContents.executeJavaScript('PlaytestState.chapter.id', true), 'ch_2');
      assert.deepEqual(await checkHero(resumed.webContents), expected); resumed.close();
      assert.deepEqual(errors, []);
      clearTimeout(watchdog); finish({ ok: true, skills: 11, equipped: 5, personal: 1, campaignRestored: true, errors });
    } catch (e) { clearTimeout(watchdog); finish({ ok: false, error: e.stack, errors }); }
  });
};
