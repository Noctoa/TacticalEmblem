/* Parcours réel : éditer deux branches, consulter l'arbre, annuler puis promouvoir et recharger. */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const assert = require('assert/strict');
const { app } = require('electron');
const io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], ew = editor.webContents, delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const js = async (wc, code) => {
    fs.writeFileSync(path.join(out, 'step.txt'), code);
    return wc.executeJavaScript(code, true);
  };
  const watch = wc => { wc.setBackgroundThrottling(false); wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); }); };
  const finish = result => { fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(result.ok ? 0 : 1); };
  const watchdog = setTimeout(() => finish({ ok: false, error: 'Délai global dépassé', errors }), 120000);
  const until = async (wc, condition) => {
    const end = Date.now() + 18000;
    while (Date.now() < end) { if (await js(wc, condition)) return; await delay(80); }
    throw new Error('Délai dépassé : ' + condition);
  };
  const click = (wc, selector, text) => js(wc, `(() => { const button = [...document.querySelectorAll(${JSON.stringify(selector)})].find(b => b.textContent.includes(${JSON.stringify(text)})); if (!button) throw new Error('Bouton absent : ' + ${JSON.stringify(text)}); button.click(); })()`);
  const setField = (index, label, value) => js(ew, `(() => {
    const root = document.querySelector('[data-promotion-index="${index}"]');
    const field = [...root.querySelectorAll('.field-label')].find(el => el.textContent === ${JSON.stringify(label)});
    const input = field.parentElement.querySelector('input,select'); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const shot = async (wc, name) => {
    await js(wc, `document.querySelectorAll('.modal-back').forEach(el => { el.style.animation = 'none'; })`);
    await wc.capturePage(); await delay(250); fs.writeFileSync(path.join(out, name + '.png'), (await wc.capturePage()).toPNG());
  };
  watch(ew);
  ew.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-promotions-ui-')), 'Jeu');
      const p = io.createProject(dir, 'Promotions à embranchements', 'sample', path.join(__dirname, '..', 'assets'));
      p.meta.lobby.enabled = false; io.saveProject(dir, p); // ce scénario ne teste pas le lobby : la partie démarre directement au chapitre
      p.db.supports = [];
      const hero = p.db.units[0], cls = p.db.classes.find(c => c.id === hero.classId), ch = p.db.chapters[0];
      hero.level = 10; hero.personalSkill = 'skill_precision'; hero.learnedSkills = ['skill_sol']; hero.equippedSkills = ['skill_sol'];
      hero.inventory = [{ id: 'w_iron_sword' }, { id: 'i_master_seal', uses: 2 }]; cls.promotions = [];
      Object.assign(ch, { objective: { type: 'survive', turns: 99 }, events: [], requiredUnits: [], allies: [], next: 'ch_2', final: false });
      ch.players = [{ unitId: hero.id, x: 3, y: 3 }, { unitId: p.db.units[1].id, x: 3, y: 4 }];
      ch.enemies = ch.enemies.filter(e => e.isBoss); ch.enemies[0].ai = 'stationary';
      const next = JSON.parse(JSON.stringify(ch)); Object.assign(next, { id: 'ch_2', name: 'Promotion conservée', next: '' }); p.db.chapters.push(next);
      io.saveProject(dir, p); await js(ew, `Editor.open(${JSON.stringify(dir)})`);
      await js(ew, `DBEditor.open('classes', ${JSON.stringify(cls.id)})`);
      for (const [index, destination] of ['hero', 'paladin'].entries()) {
        await js(ew, `document.querySelector('[data-add-promotion]').click()`);
        await setField(index, 'Classe de destination', destination);
        await setField(index, 'Niveau minimum', index === 0 ? 10 : 15);
        await setField(index, 'Objet requis (dans l’inventaire)', 'i_master_seal');
      }
      await js(ew, `(() => {
        const row = document.querySelector('[data-promotion-index="0"]'); row.open = true;
        [...row.querySelectorAll('button.chip')].find(b => b.textContent.includes('Luna')).click();
        const cell = [...row.querySelectorAll('.stat-cell')].find(el => el.querySelector('span').textContent === 'PV');
        cell.querySelector('input').value = 3; cell.querySelector('input').dispatchEvent(new Event('change'));
        row.scrollIntoView({ block: 'start' });
      })()`); await shot(ew, 'editor-branches');
      await js(ew, `DBEditor.open('classes', 'recruit'); document.querySelector('[data-promotion-tree]').click()`);
      await until(ew, `!!document.querySelector('.promotion-tree-modal')`);
      assert.equal(await js(ew, `document.querySelectorAll('[data-tree-class="great_knight"]').length`), 1);
      assert.ok(await js(ew, `document.querySelectorAll('.promotion-link').length >= 6`));
      assert.equal(await js(ew, `document.querySelectorAll('.promotion-link[aria-label$="vers great_knight"]').length`), 2);
      await shot(ew, 'evolution-tree');
      await js(ew, `document.querySelector('.promotion-link').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
      await until(ew, `!document.querySelector('.promotion-tree-modal')`);
      assert.equal(await js(ew, `!!document.querySelector('[data-promotion-index="0"][open]')`), true);
      await js(ew, `DBEditor.open('skills', 'skill_luna'); document.querySelector('.db-list-actions button[title="Supprimer"]').click()`);
      await until(ew, `!!document.querySelector('.modal-back')`); assert.match(await js(ew, `document.querySelector('.modal-back').textContent`), /Classes/);
      await click(ew, '.modal-actions button', 'OK');
      await js(ew, 'DBEditor.close()'); ew.send('menu', 'save'); await until(ew, '!Editor.state.dirty');
      const saved = io.loadProject(dir).db.classes.find(c => c.id === cls.id);
      assert.equal(saved.promotions.length, 2); assert.equal(saved.promotions[0].classId, 'hero'); assert.deepEqual(saved.promotions[0].skills, ['skill_luna']);
      const win = openPlaytest(dir, ch.id), wc = win.webContents; watch(wc);
      await new Promise(resolve => wc.once('did-finish-load', resolve)); await until(wc, `!!document.querySelector('.choice-list')`);
      await click(wc, '.choice-list button', 'Classique'); await until(wc, '!!PlaytestState.map && !PlaytestState.busy');
      const key = async k => { wc.sendInputEvent({ type: 'keyDown', keyCode: k }); wc.sendInputEvent({ type: 'keyUp', keyCode: k }); await delay(110); };
      await js(wc, `window.H = PlaytestState.units.find(u => u.sourceId === ${JSON.stringify(hero.id)}); H.hp -= 5; PlaytestState.cursor = { x: H.x, y: H.y }`);
      await key('Z'); await until(wc, `PlaytestState.ui === 'moving'`); await key('Z'); await until(wc, `PlaytestState.ui === 'menu'`);
      await js(wc, `void PlaytestState.menu.items.find(i => i.label === 'Promotion').action()`);
      await until(wc, `!!document.querySelector('.promotion-choices')`);
      assert.equal(await js(wc, `document.querySelector('[data-promote-to="paladin"]').disabled`), true);
      assert.match(await js(wc, `document.querySelector('[data-promote-to="paladin"]').textContent`), /Niveau 15 requis/);
      await shot(wc, 'promotion-choice');
      const before = await js(wc, 'JSON.stringify(H)');
      await key('Escape'); await until(wc, `PlaytestState.ui === 'menu' && !PlaytestState.busy`);
      assert.equal(await js(wc, 'JSON.stringify(H)'), before);
      // Passage par l'objet, puis refus de la confirmation finale.
      await js(wc, `PlaytestState.menu.items.find(i => i.label === 'Objet').action(); void PlaytestState.menu.items.find(i => i.label === 'Sceau de promotion').action()`);
      await until(wc, `!!document.querySelector('.promotion-choices')`); await js(wc, `document.querySelector('[data-promote-to="hero"]').click()`);
      await until(wc, `document.querySelector('.modal-back').textContent.includes('Confirmer la promotion')`);
      await click(wc, '.modal-actions button', 'Annuler'); await until(wc, `PlaytestState.ui === 'menu' && !PlaytestState.busy`);
      assert.equal(await js(wc, 'JSON.stringify(H)'), before);
      await js(wc, `void PlaytestState.menu.items.find(i => i.label === 'Promotion').action()`);
      await until(wc, `!!document.querySelector('.promotion-choices')`); await js(wc, `document.querySelector('[data-promote-to="hero"]').click()`);
      await until(wc, `document.querySelector('.modal-back').textContent.includes('Confirmer la promotion')`); await click(wc, '.modal-actions button', 'Promouvoir');
      await until(wc, `document.querySelector('.modal-back').textContent.includes('Promotion réussie')`); await shot(wc, 'promotion-result');
      await click(wc, '.modal-actions button', 'OK'); await until(wc, `document.querySelector('.modal-back').textContent.includes('Compétence apprise')`);
      await click(wc, '.modal-actions button', 'OK'); await until(wc, '!PlaytestState.busy && H.done');
      assert.equal(await js(wc, 'H.classId'), 'hero'); assert.equal(await js(wc, 'H.level'), 1); assert.equal(await js(wc, 'H.effectiveLevel'), 21);
      assert.equal(await js(wc, 'H.stats.hp - H.hp'), 5); assert.equal(await js(wc, `H.inventory.find(s => s.id === 'i_master_seal').uses`), 1);
      assert.equal(await js(wc, `H.equippedSkills.includes('skill_luna')`), true); assert.equal(await js(wc, 'H.personalSkill'), 'skill_precision');
      const state = await js(wc, `({ classId: H.classId, level: H.level, stats: H.stats, inventory: H.inventory, effectiveLevel: H.effectiveLevel, equippedSkills: H.equippedSkills })`);
      await js(wc, `PlaytestState.turn = 100; H.done = false; PlaytestState.cursor = { x: H.x, y: H.y }`);
      await key('Z'); await key('Z'); await until(wc, `PlaytestState.ui === 'menu'`);
      await js(wc, `PlaytestState.menu.items.find(i => i.label === 'Attendre').action()`); await until(wc, 'PlaytestState.over');
      await click(wc, '#end button', 'Acte suivant'); await until(wc, `PlaytestState.chapter.id === 'ch_2' && !PlaytestState.busy`);
      const readState = `(() => { const u = PlaytestState.units.find(u => u.sourceId === ${JSON.stringify(hero.id)}); return { classId: u.classId, level: u.level, stats: u.stats, inventory: u.inventory, effectiveLevel: u.effectiveLevel, equippedSkills: u.equippedSkills }; })()`;
      assert.deepEqual(await js(wc, readState), state);
      await js(wc, `PlaytestState.cursor = { x: 0, y: 0 }`); await key('Z'); await js(wc, `(() => { if (PlaytestState.menu) { document.querySelector('#menu').classList.add('hidden'); PlaytestState.menu = null; PlaytestState.ui = 'idle'; } return PlaytestDebug.saveSlot(1); })()`);
      await until(wc, '!PlaytestState.busy'); win.close();
      const resumed = openPlaytest(dir, ch.id), rwc = resumed.webContents; watch(rwc);
      await new Promise(resolve => rwc.once('did-finish-load', resolve)); await until(rwc, `!!document.querySelector('.choice-list')`);
      await click(rwc, '.choice-list button', 'Continuer'); await until(rwc, '!!PlaytestState.map && !PlaytestState.busy');
      assert.deepEqual(await js(rwc, readState), state); resumed.close();
      assert.deepEqual(errors, []); clearTimeout(watchdog);
      finish({ ok: true, editorBranches: true, sharedDestinationTree: true, lockedBranch: true, cancellationAndItemPreserved: true, itemRoute: true, promotion: true, skillGranted: true, actionConsumed: true, campaignRestored: true, errors });
    } catch (e) { clearTimeout(watchdog); finish({ ok: false, error: e.stack, errors }); }
  });
};
