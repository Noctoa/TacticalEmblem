/* Parcours réel : programmer une classe et un personnage, apprendre par soin, conserver les acquis. */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const assert = require('assert/strict');
const { app } = require('electron');
const io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], ew = editor.webContents;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const js = (wc, code) => wc.executeJavaScript(code, true);
  const watch = wc => { wc.setBackgroundThrottling(false); wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); }); };
  const finish = result => { fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(result.ok ? 0 : 1); };
  const watchdog = setTimeout(() => finish({ ok: false, error: 'Délai global dépassé', errors }), 90000);
  const until = async (wc, condition) => {
    const end = Date.now() + 15000;
    while (Date.now() < end) { if (await js(wc, condition)) return; await delay(70); }
    throw new Error('Délai dépassé : ' + condition);
  };
  const click = (wc, selector, text) => js(wc, `(() => {
    const button = [...document.querySelectorAll(${JSON.stringify(selector)})].find(b => b.textContent.includes(${JSON.stringify(text)}));
    if (!button) throw new Error('Bouton absent : ' + ${JSON.stringify(text)}); button.click();
  })()`);
  const set = (wc, selector, value) => js(wc, `(() => { const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) throw new Error('Champ absent : ' + ${JSON.stringify(selector)}); input.value = ${JSON.stringify(value)};
    input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const shot = async (wc, name) => {
    await js(wc, `document.querySelectorAll('.modal-back').forEach(el => { el.style.animation = 'none'; })`);
    await wc.capturePage(); await delay(250);
    fs.writeFileSync(path.join(out, name + '.png'), (await wc.capturePage()).toPNG());
  };
  watch(ew);
  ew.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-learning-ui-')), 'Jeu');
      const p = io.createProject(dir, 'Apprentissage des compétences', 'sample', path.join(__dirname, '..', 'assets'));
      p.meta.lobby.enabled = false; io.saveProject(dir, p); // ce scénario ne teste pas le lobby : la partie démarre directement au chapitre
      const hero = p.db.units[0], cls = p.db.classes.find(c => c.id === hero.classId);
      hero.level = 1; hero.personalSkill = 'skill_esquive';
      hero.learnedSkills = ['skill_offensive', 'skill_garde', 'skill_presence', 'skill_regeneration']; hero.equippedSkills = hero.learnedSkills.slice();
      hero.inventory = [{ id: 'w_heal' }]; cls.weapons = ['sword', 'staff'];
      const ch = p.db.chapters[0];
      Object.assign(ch, { objective: { type: 'survive', turns: 99 }, events: [], requiredUnits: [], next: 'ch_2', final: false });
      ch.players[0].x = 3; ch.players[0].y = 3; ch.players[1].x = 4; ch.players[1].y = 3; ch.players[2].x = 2; ch.players[2].y = 3;
      const next = JSON.parse(JSON.stringify(ch)); Object.assign(next, { id: 'ch_2', name: 'Compétences conservées', next: '' }); p.db.chapters.push(next);
      io.saveProject(dir, p);
      await js(ew, `Editor.open(${JSON.stringify(dir)})`);
      await js(ew, `DBEditor.open('classes', ${JSON.stringify(cls.id)})`);
      const program = ['skill_precision', 'skill_luna', 'skill_sol', 'skill_miracle'];
      for (const [index, skillId] of program.slice(0, 2).entries()) {
        await js(ew, `document.querySelector('[data-add-learning]').click()`);
        await set(ew, `[data-learning-level="${index}"]`, index + 2);
        await set(ew, `[data-learning-skill="${index}"]`, skillId);
      }
      await js(ew, `document.querySelector('.class-learning').scrollIntoView({ block: 'start' })`); await shot(ew, 'class-program');
      await js(ew, `DBEditor.open('skills', 'skill_luna'); document.querySelector('.db-list-actions button[title="Supprimer"]').click()`);
      await until(ew, `!!document.querySelector('.modal-back')`);
      assert.match(await js(ew, `document.querySelector('.modal-back').textContent`), /Classes/);
      await click(ew, '.modal-actions button', 'OK');
      await js(ew, `DBEditor.open('units', ${JSON.stringify(hero.id)})`);
      const characterProgram = [{ level: 4, skillId: 'skill_sol' }, { level: 5, skillId: 'skill_miracle' }, { level: 3, skillId: 'skill_precision' }];
      for (const [index, row] of characterProgram.entries()) {
        await js(ew, `document.querySelector('.unit-learning [data-add-learning]').click()`);
        await set(ew, `.unit-learning [data-learning-level="${index}"]`, row.level);
        await set(ew, `.unit-learning [data-learning-skill="${index}"]`, row.skillId);
      }
      assert.equal(await js(ew, `document.querySelector('[data-skill-learn="skill_sol"]').getAttribute('aria-pressed')`), 'false');
      await js(ew, `document.querySelector('.unit-learning').scrollIntoView({ block: 'start' })`); await shot(ew, 'character-program');
      await js(ew, `DBEditor.open('skills', 'skill_sol'); document.querySelector('.db-list-actions button[title="Supprimer"]').click()`);
      await until(ew, `!!document.querySelector('.modal-back')`);
      assert.match(await js(ew, `document.querySelector('.modal-back').textContent`), /Personnages/);
      await click(ew, '.modal-actions button', 'OK');
      await js(ew, `DBEditor.open('units', ${JSON.stringify(hero.id)})`);
      await js(ew, `(() => { const label = [...document.querySelectorAll('.db-form .field-label')].find(el => el.textContent === 'Niveau'); const input = label.parentElement.querySelector('input'); input.value = 4; input.dispatchEvent(new Event('change')); })()`);
      assert.equal(await js(ew, `document.querySelector('[data-skill-learn="skill_sol"]').disabled`), true);
      await js(ew, `(() => { const label = [...document.querySelectorAll('.db-form .field-label')].find(el => el.textContent === 'Niveau'); const input = label.parentElement.querySelector('input'); input.value = 1; input.dispatchEvent(new Event('change')); })()`);
      await js(ew, 'DBEditor.close()'); ew.send('menu', 'save'); await until(ew, '!Editor.state.dirty');
      const loaded = io.loadProject(dir);
      assert.deepEqual(loaded.db.classes.find(c => c.id === cls.id).skillLearning, program.slice(0, 2).map((skillId, index) => ({ level: index + 2, skillId })));
      assert.deepEqual(loaded.db.units.find(u => u.id === hero.id).skillLearning, characterProgram);
      const win = openPlaytest(dir, 'ch_1'), wc = win.webContents; watch(wc);
      await new Promise(resolve => wc.once('did-finish-load', resolve));
      await until(wc, `!!document.querySelector('.choice-list')`); await click(wc, '.choice-list button', 'Classique');
      await until(wc, '!!PlaytestState.map && !PlaytestState.busy');
      const key = async k => { wc.sendInputEvent({ type: 'keyDown', keyCode: k }); wc.sendInputEvent({ type: 'keyUp', keyCode: k }); await delay(110); };
      const heroCode = `PlaytestState.units.find(u => u.sourceId === ${JSON.stringify(hero.id)})`;
      for (const [index, skillId] of program.entries()) {
        await js(wc, `(() => { const G = PlaytestState, hero = ${heroCode}; hero.done = false; hero.exp = 99; G.cursor = { x: hero.x, y: hero.y };
          const target = G.units.find(u => u.team === 'player' && u !== hero); target.hp = target.stats.hp - 5; })()`);
        await key('Z'); await until(wc, `PlaytestState.ui === 'moving'`);
        await key('Z'); await until(wc, `PlaytestState.ui === 'menu'`);
        await js(wc, `PlaytestState.menu.items.find(i => i.label === 'Bâton').action()`);
        await until(wc, `PlaytestState.ui === 'staff'`); await key('Z');
        await until(wc, '!!PlaytestState.waitClick'); await js(wc, 'PlaytestState.waitClick()');
        await until(wc, `!!document.querySelector('.modal-back')`);
        assert.match(await js(wc, `document.querySelector('.modal-back').textContent`), /Compétence apprise/);
        assert.equal(await js(wc, `${heroCode}.level`), index + 2);
        assert.equal(await js(wc, `${heroCode}.learnedSkills.includes(${JSON.stringify(skillId)})`), true);
        if (index === 0) {
          assert.match(await js(wc, `document.querySelector('.modal-back').textContent`), /emplacement libre/);
          assert.equal(await js(wc, `${heroCode}.equippedSkills.includes('skill_precision')`), true);
          await shot(wc, 'learn-free-slot'); await click(wc, '.modal-actions button', 'OK');
        } else {
          assert.equal(await js(wc, `document.querySelectorAll('.choice-list button').length`), 6);
          assert.equal(await js(wc, `[...document.querySelectorAll('.choice-list button')].some(b => b.textContent.includes('Remplacer Esquive'))`), false);
          if (index === 1) {
            await shot(wc, 'learn-full-slots'); await click(wc, '.choice-list button', 'Remplacer Offensive');
          } else if (index === 2) await click(wc, '.choice-list button', 'Garder dans le répertoire');
          else await key('Escape');
        }
        await until(wc, `!PlaytestState.busy && PlaytestState.ui === 'idle' && !document.querySelector('.modal-back')`);
        assert.equal(await js(wc, `${heroCode}.personalSkill`), 'skill_esquive');
        assert.equal(await js(wc, `${heroCode}.equippedSkills.length`), 5);
      }
      const learned = await js(wc, `${heroCode}.learnedSkills`), equipped = await js(wc, `${heroCode}.equippedSkills`);
      assert.ok(equipped.includes('skill_luna')); assert.ok(!equipped.includes('skill_offensive'));
      assert.ok(!equipped.includes('skill_sol')); assert.ok(!equipped.includes('skill_miracle'));
      await js(wc, `PlaytestState.turn = 100; ${heroCode}.done = false`);
      await key('Z'); await key('Z'); await until(wc, `PlaytestState.ui === 'menu'`);
      await js(wc, `PlaytestState.menu.items.find(i => i.label === 'Attendre').action()`); await until(wc, 'PlaytestState.over');
      await click(wc, '#end button', 'Chapitre suivant'); await until(wc, `PlaytestState.chapter.id === 'ch_2' && !PlaytestState.busy`);
      assert.deepEqual(await js(wc, `${heroCode}.learnedSkills`), learned); assert.deepEqual(await js(wc, `${heroCode}.equippedSkills`), equipped);
      await js(wc, 'PlaytestState.cursor = { x: 0, y: 0 }'); await key('Z');
      await js(wc, `(() => { if (PlaytestState.menu) { document.querySelector('#menu').classList.add('hidden'); PlaytestState.menu = null; PlaytestState.ui = 'idle'; } return PlaytestDebug.saveSlot(1); })()`); await until(wc, '!PlaytestState.busy'); win.close();
      const resumed = openPlaytest(dir, 'ch_1'), rwc = resumed.webContents; watch(rwc);
      await new Promise(resolve => rwc.once('did-finish-load', resolve)); await until(rwc, `!!document.querySelector('.choice-list')`);
      await click(rwc, '.choice-list button', 'Continuer'); await until(rwc, '!!PlaytestState.map && !PlaytestState.busy');
      assert.equal(await js(rwc, `${heroCode}.level`), 5);
      assert.deepEqual(await js(rwc, `${heroCode}.learnedSkills`), learned); assert.deepEqual(await js(rwc, `${heroCode}.equippedSkills`), equipped); resumed.close();
      assert.deepEqual(errors, []); clearTimeout(watchdog);
      finish({ ok: true, levelsGained: 4, classAndCharacterPrograms: true, duplicateLearnedOnce: true, automaticEquip: true, replacement: true, reserve: true, escapeKeepsSkill: true, campaignRestored: true, errors });
    } catch (e) { clearTimeout(watchdog); finish({ ok: false, error: e.stack, errors }); }
  });
};
