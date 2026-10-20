'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict');
const { app } = require('electron'), io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], delay = ms => new Promise(r => setTimeout(r, ms));
  const js = (wc, code) => { fs.writeFileSync(path.join(out, 'progress.json'), JSON.stringify({ code, errors })); return wc.executeJavaScript(code, true); };
  const finish = value => { fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(value, null, 2)); app.exit(value.ok ? 0 : 1); };
  const watchdog = setTimeout(() => finish({ ok: false, error: 'Délai global dépassé', errors }), 120000);
  const until = async (wc, code) => { const end = Date.now() + 16000; while (Date.now() < end) { if (await js(wc, code)) return; await wc.capturePage(); await delay(70); } throw new Error('Délai dépassé : ' + code + '\n' + await js(wc, `document.body.innerText.slice(-1600)`)); };
  const click = (wc, selector, text) => js(wc, `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find(el => el.textContent.includes(${JSON.stringify(text)})); if (!b) throw new Error('Bouton absent : ' + ${JSON.stringify(text)}); b.click(); })()`);
  const shot = async (wc, name) => { await js(wc, `document.querySelectorAll('.modal-back').forEach(el => el.style.animation = 'none')`); await wc.capturePage(); await delay(160); fs.writeFileSync(path.join(out, name + '.png'), (await wc.capturePage()).toPNG()); };
  const watch = wc => { wc.setBackgroundThrottling(false); wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); }); };
  editor.webContents.once('did-finish-load', async () => {
    try {
      editor.setSize(1440, 900); const ew = editor.webContents; watch(ew);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-village-ui-')), 'Jeu');
      const p = io.createProject(dir, 'Villages', 'sample', path.join(__dirname, '..', 'assets')), ch = p.db.chapters[0];
      p.meta.lobby.initialRoster = ['c_eliwood', 'c_lyn']; p.meta.convoy = { capacity: 1, items: [{ id: 'w_iron_sword', uses: 4 }] };
      const hero = p.db.units.find(u => u.id === 'c_eliwood'); hero.inventory = Array.from({ length: 5 }, () => ({ id: 'i_vulnerary', uses: 2 }));
      const guest = JSON.parse(JSON.stringify(p.db.units.find(u => u.id === 'c_hector'))); guest.id = 'c_guest'; guest.name = 'Voyageur'; p.db.units.push(guest);
      Object.assign(ch, { players: [{ id: 'p1', unitId: 'c_eliwood', x: 3, y: 3 }, { id: 'p2', unitId: 'c_lyn', x: 4, y: 3 }], objective: { type: 'survive', turns: 99 }, requiredUnits: ['c_eliwood'], events: [], gold: 0, final: false });
      ch.enemies = ch.enemies.filter(e => e.isBoss); ch.enemies[0].ai = 'stationary';
      ch.villages = [
        { id: 'v_green', name: 'Le mercenaire', x: 4, y: 3, script: 'Cloud: Je vous accompagne.', reward: { gold: 40 }, recruitUnitId: 'c_cloud' },
        { id: 'v_repeat', name: 'Village rejouable', x: 5, y: 3, reward: { gold: 5 }, recruitUnitId: 'c_hector', repeatOnReplay: true },
        { id: 'v_space', name: 'Le voyageur', x: 6, y: 3, reward: { gold: 99 }, recruitUnitId: 'c_guest' }
      ]; io.saveProject(dir, p);
      await js(ew, `Editor.open(${JSON.stringify(dir)})`); await until(ew, `!!Editor.project()`);
      await js(ew, `DBEditor.open('chapters', 'ch_1'); document.querySelector('[data-db-place-village]').click()`);
      await until(ew, `Editor.state.placeTool && Editor.state.placeTool.kind === 'villages'`);
      const cell = async (x, y, type = 'mousedown') => js(ew, `(() => { const cv = document.querySelector('#map-canvas'), r = cv.getBoundingClientRect(), m = Editor.project().maps.find(m => m.id === Editor.state.mapId), z = Editor.state.zoom; cv.dispatchEvent(new MouseEvent(${JSON.stringify(type)}, { button: 0, bubbles: true, clientX: r.left + ${x + .5} * m.tileWidth * z, clientY: r.top + ${y + .5} * m.tileHeight * z })); })()`);
      await cell(3, 3); assert.equal(await js(ew, `Editor.project().db.chapters[0].villages.length`), 4);
      const villageId = await js(ew, 'Editor.state.selected.id');
      await cell(3, 3); await cell(2, 3, 'mousemove'); await js(ew, `window.dispatchEvent(new MouseEvent('mouseup'))`);
      assert.equal(await js(ew, `Editor.project().db.chapters[0].villages.find(v => v.id === ${JSON.stringify(villageId)}).x`), 2);
      ew.send('menu', 'undo'); await until(ew, `Editor.project().db.chapters[0].villages.find(v => v.id === ${JSON.stringify(villageId)}).x === 3`);
      const field = async (label, value, inputEvent = false) => js(ew, `(() => {
        const box = document.querySelector('[data-village-id=${JSON.stringify(villageId)}]'), label = [...box.querySelectorAll('.field-label')].find(el => el.textContent === ${JSON.stringify(label)});
        const input = label.parentElement.querySelector('input,textarea,select'); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event(${JSON.stringify(inputEvent ? 'input' : 'change')}, { bubbles: true }));
      })()`);
      await field('Nom du village', 'Village du pont'); await field('Dialogue de visite (Nom: texte)', 'Villageois: Prenez cette épée !', true);
      await field('Or offert', '120'); await field('Arme ou objet offert', 'w_iron_sword'); await field('Utilisations de l’objet (0 = toutes)', '7');
      await field('Or offert', '321'); await field('Utilisations de l’objet (0 = toutes)', '6');
      ew.send('menu', 'undo'); await until(ew, `Editor.project().db.chapters[0].villages.find(v => v.id === ${JSON.stringify(villageId)}).reward.uses === 7`);
      assert.equal(await js(ew, `Editor.project().db.chapters[0].villages.find(v => v.id === ${JSON.stringify(villageId)}).reward.gold`), 321);
      ew.send('menu', 'undo'); await until(ew, `Editor.project().db.chapters[0].villages.find(v => v.id === ${JSON.stringify(villageId)}).reward.gold === 120`);
      await field('Personnage recruté', 'c_hector');
      await js(ew, `document.querySelector('[data-village-id=${JSON.stringify(villageId)}]').scrollIntoView()`); await shot(ew, 'editor-village');
      await js(ew, `tf.saveProject(Editor.dir(), Editor.project())`);
      assert.equal(io.loadProject(dir).db.chapters[0].villages.find(v => v.id === villageId).reward.gold, 120);
      const start = async choice => { const win = openPlaytest(dir, ''), wc = win.webContents; watch(wc); await new Promise(r => wc.once('did-finish-load', r)); await until(wc, `!!document.querySelector('.choice-list')`); await click(wc, '.choice-list button', choice); return { win, wc }; };
      const depart = async wc => {
        await until(wc, `PlaytestState.mode === 'lobby' && !PlaytestState.busy`);
        await js(wc, `PlaytestLobby.openMenu(); PlaytestState.menu.items.find(i => i.label === PlaytestLobby.state.cfg.board.label).action()`);
        await click(wc, '#lobby-panel .lp-go', ''); await until(wc, `!!document.querySelector('.modal-back')`); await click(wc, '.modal-actions button', 'Partir');
        await until(wc, `PlaytestState.mode === 'preparation'`); await js(wc, `document.querySelector('[data-deploy-start]').click()`);
        await until(wc, `PlaytestState.mode === 'chapter' && !PlaytestState.busy`);
      };
      const menu = async (wc, id, position) => {
        await js(wc, `(() => { const u = PlaytestState.units.find(u => u.sourceId === ${JSON.stringify(id)}); ${position ? `Object.assign(u, ${JSON.stringify(position)}, { rx: ${position.x}, ry: ${position.y} });` : ''} PlaytestState.cursor = { x: u.x, y: u.y }; PlaytestState.ui = 'idle'; PlaytestState.sel = null; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); })()`);
        await until(wc, `PlaytestState.ui === 'menu' && !PlaytestState.busy`);
      };
      const visit = async (wc, title, dialogue) => {
        await js(wc, `void PlaytestState.menu.items.find(i => i.label === 'Visiter').action()`);
        if (dialogue) { await until(wc, `!!PlaytestState.dialogue`); await shot(wc, 'village-dialogue'); await js(wc, 'PlaytestState.dialogue.skip()'); }
        await until(wc, `!!document.querySelector('.modal-back') && document.querySelector('.modal-back h3').textContent === ${JSON.stringify(title)}`);
        await shot(wc, 'village-reward'); await click(wc, '.modal-actions button', 'OK'); await until(wc, '!PlaytestState.busy');
      };
      const first = await start('Classique'), wc = first.wc; await depart(wc); await menu(wc, 'c_eliwood');
      assert.equal(await js(wc, `PlaytestState.menu.items.find(i => i.label === 'Visiter').disabled`), true);
      assert.equal(await js(wc, 'PlaytestState.campaign.gold'), 500); assert.equal(await js(wc, 'PlaytestState.visitedVillages.size'), 0);
      await js(wc, 'PlaytestState.convoyCap = 2'); await menu(wc, 'c_eliwood'); await visit(wc, 'Village du pont', true);
      assert.equal(await js(wc, `PlaytestState.units.find(u => u.sourceId === 'c_eliwood').done`), true);
      assert.equal(await js(wc, 'PlaytestState.campaign.gold'), 620); assert.equal(await js(wc, 'PlaytestState.convoy.at(-1).uses'), 7);
      assert.equal(await js(wc, `PlaytestState.units.filter(u => u.sourceId === 'c_hector').length`), 1); assert.equal(await js(wc, `PlaytestState.units.find(u => u.sourceId === 'c_hector').done`), false);
      const greenUid = await js(wc, `PlaytestState.units.find(u => u.sourceId === 'c_cloud').uid`);
      await js(wc, `const green = PlaytestState.units.find(u => u.sourceId === 'c_cloud'); green.hp = 9; green.inventory[0].uses = 5`);
      await menu(wc, 'c_lyn'); await visit(wc, 'Le mercenaire', true);
      assert.deepEqual(await js(wc, `(() => { const u = PlaytestState.units.find(u => u.sourceId === 'c_cloud'); return [u.uid, u.team, u.hp, u.inventory[0].uses, u.done]; })()`), [greenUid, 'player', 9, 5, false]);
      await menu(wc, 'c_hector', { x: 5, y: 3 }); await visit(wc, 'Village rejouable', false);
      assert.equal(await js(wc, `PlaytestState.units.filter(u => u.sourceId === 'c_hector').length`), 1);
      await js(wc, `PlaytestState.units.find(u => u.sourceId === 'c_hector').done = false`); await menu(wc, 'c_hector');
      assert.equal(await js(wc, `PlaytestState.menu.items.some(i => i.label === 'Visiter')`), false);
      await menu(wc, 'c_cloud', { x: 6, y: 3 }); const terrain = await js(wc, 'PlaytestState.tgrid.slice()');
      await js(wc, `PlaytestState.terrains.no_spawn = { cost: Object.fromEntries(Rules.MOVE_TYPES.map(t => [t.id, 99])) }; PlaytestState.tgrid.fill('no_spawn'); void PlaytestState.menu.items.find(i => i.label === 'Visiter').action()`);
      await until(wc, `!!document.querySelector('.modal-back')`); assert.equal(await js(wc, `document.querySelector('.modal-back h3').textContent`), 'Pas de place pour la recrue');
      assert.equal(await js(wc, `PlaytestState.visitedVillages.has('v_space')`), false); assert.equal(await js(wc, 'PlaytestState.campaign.gold'), 665);
      await click(wc, '.modal-actions button', 'OK'); await js(wc, `PlaytestState.tgrid = ${JSON.stringify(terrain)}; PlaytestDebug.saveSlot(1)`);
      const beforeBattle = await js(wc, `tf.loadCampaign(new URLSearchParams(location.search).get('dir'), 1)`);
      assert.equal(beforeBattle.campaign.gold, 500); assert.equal(beforeBattle.campaign.villageVisits, undefined);
      await js(wc, 'PlaytestState.turn = 100; void PlaytestDebug.checkEnd()'); await until(wc, `!!document.querySelector('#end button')`); await click(wc, '#end button', 'Retour au camp');
      await until(wc, `PlaytestState.mode === 'lobby' && !PlaytestState.busy`); await js(wc, 'PlaytestDebug.saveSlot(2)');
      const saved = await js(wc, `tf.loadCampaign(new URLSearchParams(location.search).get('dir'), 2)`);
      assert.equal(saved.campaign.villageVisits.length, 3); assert.ok(saved.campaign.recruited.includes('c_hector')); assert.ok(saved.campaign.recruited.includes('c_cloud'));
      first.win.close(); const resumed = await start('Continuer'), rwc = resumed.wc; await depart(rwc); await menu(rwc, 'c_eliwood');
      assert.equal(await js(rwc, `PlaytestState.menu.items.some(i => i.label === 'Visiter')`), false);
      await menu(rwc, 'c_eliwood', { x: 5, y: 3 }); await visit(rwc, 'Village rejouable', false);
      assert.equal(await js(rwc, 'PlaytestState.campaign.gold'), saved.campaign.gold + 5); assert.equal(await js(rwc, 'PlaytestState.campaign.villageVisits.length'), 3);
      assert.deepEqual(errors, []); clearTimeout(watchdog); finish({ ok: true, editorPlacement: true, dragAndUndo: true, editorSave: true, dialogue: true, inventoryFull: true, convoy: true, newRecruit: true, greenRecruit: true, noDuplicateRecruit: true, noSpawnSpace: true, actionConsumed: true, checkpoint: true, persistenceAndReplay: true, errors });
    } catch (error) { clearTimeout(watchdog); finish({ ok: false, error: error.stack, errors }); }
  });
};
