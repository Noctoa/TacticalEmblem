/* Parcours Electron : édition, choix du mode, victoire, chapitre suivant, sauvegarde et reprise. */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert/strict');
const { app } = require('electron');
const io = require('../src/main/project-io');
const saves = require('../src/main/campaign-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT;
  fs.mkdirSync(out, { recursive: true });
  const errors = [];
  const watchdog = setTimeout(() => {
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ ok: false, error: 'Délai global de 90 secondes dépassé', errors }, null, 2));
    app.exit(1);
  }, 90000);
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const js = (wc, code) => wc.executeJavaScript(code, true);
  const watch = wc => wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
  const until = async (wc, condition) => {
    const end = Date.now() + 15000;
    while (Date.now() < end) { if (await js(wc, condition)) return; await delay(60); }
    throw new Error('Délai dépassé : ' + condition);
  };
  const click = (wc, selector, text) => js(wc, `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find(b => b.textContent.includes(${JSON.stringify(text)})); if (!b) throw new Error('Bouton absent : ' + ${JSON.stringify(text)}); b.click(); })()`);
  const key = async (wc, k) => { wc.sendInputEvent({ type: 'keyDown', keyCode: k }); wc.sendInputEvent({ type: 'keyUp', keyCode: k }); await delay(100); };
  const shot = async (wc, name) => fs.writeFileSync(path.join(out, name + '.png'), (await wc.capturePage()).toPNG());
  const start = async (dir, mode) => {
    const win = openPlaytest(dir, 'ch_1'), wc = win.webContents; watch(wc);
    await new Promise(resolve => wc.once('did-finish-load', resolve));
    await until(wc, `!!document.querySelector('.choice-list')`);
    await click(wc, '.choice-list button', mode);
    await until(wc, '!!PlaytestState.map && !PlaytestState.busy');
    return win;
  };
  editor.webContents.once('did-finish-load', async () => {
    watch(editor.webContents);
    try {
      for (const mode of ['Classique', 'Détente']) {
        const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-campaign-ui-')), 'Jeu');
        const p = io.createProject(dir, 'Campagne de test', 'sample', path.join(__dirname, '..', 'assets'));
        p.meta.lobby.enabled = false; io.saveProject(dir, p); // ce scénario ne teste pas le lobby : la partie démarre directement au chapitre
        const ch = p.db.chapters[0]; ch.events = []; ch.requiredUnits = []; ch.objective = { type: 'survive', turns: 1 };
        ch.next = 'ch_2'; ch.final = false;
        const next = JSON.parse(JSON.stringify(ch)); next.id = 'ch_2'; next.name = 'Deuxième chapitre'; next.objective.turns = 99; next.next = '';
        p.db.chapters.push(next); io.saveProject(dir, p);
        await js(editor.webContents, `Editor.open(${JSON.stringify(dir)})`);
        await js(editor.webContents, `DBEditor.open('chapters', 'ch_1')`);
        await until(editor.webContents, `document.querySelector('#db-body').textContent.includes('Personnages devant survivre')`);
        // Modifier réellement les protections dans le formulaire et vérifier la persistance.
        await js(editor.webContents, `(() => {
          const label = [...document.querySelectorAll('.field-label')].find(e => e.textContent.startsWith('Personnages devant survivre'));
          const chip = label.parentElement.querySelector('.chip'); chip.click(); chip.click();
        })()`);
        assert.deepEqual(await js(editor.webContents, 'Editor.db().chapters[0].requiredUnits'), []);
        await js(editor.webContents, `document.querySelector('.db-form').scrollTop = 320`);
        await shot(editor.webContents, 'conditions-' + mode);
        await js(editor.webContents, `DBEditor.close()`);
        editor.webContents.send('menu', 'save');
        await until(editor.webContents, '!Editor.state.dirty');
        const win = await start(dir, mode), wc = win.webContents;
        const removed = await js(wc, `(() => { const G = PlaytestState; const victim = G.units.filter(u => u.team === 'player')[1]; victim.dead = true; victim.hp = 0; victim.exp = 73; G.turn = 2; return victim.sourceId; })()`);
        await key(wc, 'Z'); await until(wc, `PlaytestState.ui === 'moving'`);
        await key(wc, 'Z'); await until(wc, `PlaytestState.ui === 'menu'`);
        // Les menus de jeu utilisent mousedown, pas click.
        await js(wc, `PlaytestState.menu.items.find(i => i.label === 'Attendre').action()`);
        await until(wc, `PlaytestState.over && document.querySelector('#end').textContent.includes('Victoire')`);
        await click(wc, '#end button', 'Chapitre suivant');
        await until(wc, `PlaytestState.chapter.id === 'ch_2' && !PlaytestState.busy`);
        const hasVictim = await js(wc, `PlaytestState.units.some(u => u.sourceId === ${JSON.stringify(removed)})`);
        assert.equal(hasVictim, mode === 'Détente');
        if (hasVictim) assert.equal(await js(wc, `PlaytestState.units.find(u => u.sourceId === ${JSON.stringify(removed)}).exp`), 73);
        await shot(wc, 'chapitre-suivant-' + mode);
        // Menu de map, sauvegarde réelle via IPC.
        await js(wc, `PlaytestState.cursor = { x: 0, y: 0 }`); await key(wc, 'Z');
        await until(wc, `PlaytestState.ui === 'mapmenu'`);
        await js(wc, `PlaytestState.menu.items.find(i => i.label === 'Sauvegarder').action()`);
        await until(wc, `!PlaytestState.busy`);
        assert.equal(saves.load(dir).chapterId, 'ch_2');
        // Recommencer restaure aussi le convoi et les classes, sans repartir du chapitre 1.
        await js(wc, `PlaytestState.units.find(u => u.team === 'player').stats.str = 99; PlaytestState.convoy = []; PlaytestState.cursor = { x: 0, y: 0 }`);
        await key(wc, 'Z');
        await js(wc, `PlaytestState.menu.items.find(i => i.label === 'Recommencer').action()`);
        await until(wc, `!!document.querySelector('.modal-back')`); await click(wc, '.modal-actions button', 'OK');
        await until(wc, `!PlaytestState.busy && !document.querySelector('.modal-back')`);
        assert.equal(await js(wc, 'PlaytestState.chapter.id'), 'ch_2');
        assert.notEqual(await js(wc, `PlaytestState.units.find(u => u.team === 'player').stats.str`), 99);
        assert.ok(await js(wc, 'PlaytestState.convoy.length > 0'));
        win.close();
        const resumed = await start(dir, 'Continuer');
        assert.equal(await js(resumed.webContents, 'PlaytestState.chapter.id'), 'ch_2');
        assert.equal(await js(resumed.webContents, 'PlaytestState.campaign.mode'), mode === 'Classique' ? 'classic' : 'casual');
        assert.equal(await js(resumed.webContents, `PlaytestState.units.some(u => u.sourceId === ${JSON.stringify(removed)})`), hasVictim);
        resumed.close();
      }
      assert.deepEqual(errors, []);
      fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ ok: true, scenarios: ['Classique', 'Détente'], errors }, null, 2));
      clearTimeout(watchdog);
      app.exit(0);
    } catch (e) {
      fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ ok: false, error: e.stack, errors }, null, 2));
      clearTimeout(watchdog);
      app.exit(1);
    }
  });
};
