'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict');
const { app } = require('electron'), io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], delay = ms => new Promise(r => setTimeout(r, ms));
  const js = (wc, code) => { fs.writeFileSync(path.join(out, 'progress.json'), JSON.stringify({ code, errors })); return wc.executeJavaScript(code, true); };
  const finish = value => { fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(value, null, 2)); app.exit(value.ok ? 0 : 1); };
  const watchdog = setTimeout(() => finish({ ok: false, error: 'Délai global dépassé', errors }), 180000);
  const until = async (wc, code) => { const end = Date.now() + 25000; while (Date.now() < end) { if (await js(wc, code)) return; await wc.capturePage(); await delay(60); } throw new Error('Délai dépassé : ' + code + '\n' + await js(wc, 'document.body.innerText.slice(-1400)')); };
  const click = (wc, selector, text = '') => js(wc, `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find(el => el.textContent.includes(${JSON.stringify(text)})); if (!b) throw new Error('Bouton absent : ' + ${JSON.stringify(text)}); b.click(); })()`);
  const key = (wc, value) => js(wc, `document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(value)}, bubbles: true }))`);
  const shot = async (wc, name) => { await js(wc, `document.querySelectorAll('.modal-back').forEach(el => el.style.animation = 'none')`); await wc.capturePage(); await delay(150); fs.writeFileSync(path.join(out, name + '.png'), (await wc.capturePage()).toPNG()); };
  const watch = wc => { wc.setBackgroundThrottling(false); wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); }); };
  editor.webContents.once('did-finish-load', async () => {
    try {
      editor.setSize(1440, 950); const ew = editor.webContents; watch(ew);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'te-secondary-ui-')), 'Jeu');
      const p = io.createProject(dir, 'Défis facultatifs', 'sample', path.join(__dirname, '..', 'assets'));
      const ch = p.db.chapters[0], map = p.maps.find(m => m.id === ch.mapId);
      Object.assign(map, { width: 10, height: 7, terrain: Array(70).fill('plain') });
      map.layers.forEach((l, i) => l.data = Array(70).fill(i ? 0 : 1));
      Object.assign(ch, { objective: { type: 'boss' }, requiredUnits: ['c_eliwood'], gold: 0, orbs: 0, final: false,
        players: [{ id: 'p1', unitId: 'c_eliwood', x: 2, y: 2 }, { id: 'p2', unitId: 'c_lyn', x: 2, y: 3 }, { id: 'p3', unitId: 'c_hector', x: 1, y: 2 }], allies: [],
        enemies: [{ id: 'captain', name: 'Capitaine', classId: 'brigand', level: 1, isBoss: true, x: 8, y: 2, ai: 'stationary' }, { id: 'courier', name: 'Messager', classId: 'brigand', level: 1, x: 8, y: 4, ai: 'stationary' }],
        villages: [{ id: 'v', name: 'Village protégé', x: 2, y: 2, reward: {} }], chests: [{ id: 'c', name: 'Coffre ancien', x: 1, y: 2, locked: false, reward: {} }], doors: [],
        events: [{ id: 'rescue', trigger: { type: 'death', target: 'courier' }, once: true, actions: [{ type: 'flag', key: 'rescued', value: true }] }] });
      p.meta.startChapter = ch.id; p.meta.lobby.initialRoster = ch.players.map(u => u.unitId);
      p.meta.convoy = { capacity: 1, items: [{ id: 'i_vulnerary', uses: 2 }] };
      io.saveProject(dir, p); await js(ew, `Editor.open(${JSON.stringify(dir)})`); await js(ew, `DBEditor.open('chapters', ${JSON.stringify(ch.id)})`);
      const field = (id, label, value) => js(ew, `(() => { const box = document.querySelector('[data-secondary-id="${id}"]'); const label = [...box.querySelectorAll('.field-label,.checkbox')].find(el => el.textContent === ${JSON.stringify(label)}); if (!label) throw new Error('Champ absent : ' + ${JSON.stringify(label)}); const input = label.matches('.checkbox') ? label.querySelector('input') : label.parentElement.querySelector('input,select'); ${typeof value === 'boolean' ? `input.checked = ${value};` : `input.value = ${JSON.stringify(value)};`} input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      const ids = {};
      const add = async (type, fields) => {
        await click(ew, '[data-secondary-add]'); const id = await js(ew, `Editor.db().chapters[0].secondaryObjectives.at(-1).id`); ids[type] = id;
        if (type !== 'turn') await field(id, 'Défi', type);
        for (const [name, value] of fields) await field(id, name, value);
      };
      await add('turn', [['Nom du défi (facultatif)', 'Victoire rapide'], ['Dernier tour autorisé (inclus)', 3], ['Or offert à la victoire', 100]]);
      await add('protect', [['Personnage à protéger', 'c_lyn'], ['Or offert à la victoire', 80]]);
      await add('target', [['Ennemi à vaincre', 'courier'], ['À accomplir avant la fin du tour (0 = sans délai)', 1], ['Or offert à la victoire', 40], ['Arme ou objet offert à la victoire', 'i_vulnerary'], ['Utilisations de la récompense (0 = toutes)', 1]]);
      await add('village', [['Village à visiter', 'v'], ['Or offert à la victoire', 30]]);
      await add('chest', [['Coffre à ouvrir', 'c'], ['Or offert à la victoire', 20]]);
      await add('flag', [['Information de scénario', 'rescued'], ['Or offert à la victoire', 10]]);
      await js(ew, `document.querySelector('[data-secondary-editor]').scrollIntoView({ block: 'start' })`); await shot(ew, 'editor-secondary');
      assert.equal(await js(ew, `document.querySelector('[data-secondary-editor]').textContent.includes('null')`), false);
      await js(ew, `tf.saveProject(Editor.dir(), Editor.project())`); assert.equal(io.loadProject(dir).db.chapters[0].secondaryObjectives.length, 6);
      const start = async choice => { const win = openPlaytest(dir, ''), wc = win.webContents; watch(wc); await new Promise(r => wc.once('did-finish-load', r)); await until(wc, `!!document.querySelector('.choice-list')`); await click(wc, '.choice-list button', choice); return { win, wc }; };
      const depart = async wc => {
        await until(wc, `PlaytestState.mode === 'lobby' && !PlaytestState.busy`);
        await js(wc, `PlaytestLobby.openMenu(); PlaytestState.menu.items.find(i => i.label === PlaytestLobby.state.cfg.board.label).action()`);
        await click(wc, '#lobby-panel .lp-go'); await until(wc, `!!document.querySelector('.modal-back')`); await click(wc, '.modal-actions button', 'Partir');
        await until(wc, `PlaytestState.mode === 'preparation'`);
      };
      const begin = async wc => { await click(wc, '[data-deploy-start]'); await until(wc, `PlaytestState.mode === 'chapter' && !PlaytestState.busy`); await js(wc, `PlaytestState.fast = true; PlaytestState.debug.passive = true`); };
      const menu = async (wc, id) => { await js(wc, `(() => { const u = PlaytestState.units.find(u => u.sourceId === ${JSON.stringify(id)}); PlaytestState.cursor = { x: u.x, y: u.y }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); })()`); await until(wc, `PlaytestState.ui === 'menu' && !PlaytestState.busy`); };
      const action = (wc, label) => js(wc, `void PlaytestState.menu.items.find(i => i.label === ${JSON.stringify(label)}).action()`);
      const mapMenu = wc => js(wc, `PlaytestState.cursor = { x: 0, y: 0 }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))`);
      const kill = (wc, id) => js(wc, `void (async () => { await PlaytestDebug.killUnit(PlaytestState.units.find(u => u.sourceId === ${JSON.stringify(id)}), true); await PlaytestDebug.checkEnd(); })()`);
      const first = await start('Détente'), wc = first.wc; await depart(wc);
      assert.equal(await js(wc, `document.querySelectorAll('[data-prep-secondary]').length`), 6);
      await click(wc, '[data-deploy-formation]'); await click(wc, '[data-deploy-toggle="c_lyn"]'); assert.match(await js(wc, `document.querySelector('[data-prep-secondary="${ids.protect}"]').textContent`), /absent des participants/);
      assert.equal(await js(wc, `document.querySelector('[data-deploy-start]').disabled`), false); await click(wc, '[data-deploy-toggle="c_lyn"]'); await click(wc, '[data-formation-close]');
      await shot(wc, 'preparation-secondary'); await begin(wc);
      const initialGold = await js(wc, 'PlaytestState.campaign.gold');
      await kill(wc, 'courier'); await until(wc, `PlaytestState.secondaryProgress['${ids.target}']?.status === 'success'`);
      assert.equal(await js(wc, `PlaytestState.secondaryProgress['${ids.flag}'].status`), 'success');
      await js(wc, 'PlaytestDebug.saveSlot(1)'); const checkpoint = await js(wc, `tf.loadCampaign(new URLSearchParams(location.search).get('dir'), 1)`);
      assert.equal(checkpoint.campaign.secondaryClaims, undefined); assert.equal(checkpoint.campaign.scenario, undefined);
      await mapMenu(wc); await action(wc, 'Recommencer'); await until(wc, `!!document.querySelector('.modal-back')`); await click(wc, '.modal-actions button', 'OK');
      await until(wc, `PlaytestState.mode === 'preparation'`); await begin(wc);
      assert.equal(await js(wc, `PlaytestState.secondaryProgress['${ids.target}'].status`), 'pending');
      await menu(wc, 'c_eliwood'); await action(wc, 'Visiter'); await until(wc, `!!document.querySelector('.modal-back')`); await click(wc, '.modal-actions button', 'OK'); await until(wc, `!PlaytestState.busy`);
      await menu(wc, 'c_hector'); await action(wc, 'Ouvrir le coffre'); await until(wc, `!!document.querySelector('.modal-back')`); await click(wc, '.modal-actions button', 'OK'); await until(wc, `!PlaytestState.busy`);
      await kill(wc, 'courier'); await kill(wc, 'c_lyn'); await until(wc, `PlaytestState.secondaryProgress['${ids.protect}'].status === 'failed'`);
      assert.equal(await js(wc, 'PlaytestState.over'), false); assert.equal(await js(wc, 'PlaytestState.campaign.gold'), initialGold);
      await mapMenu(wc); await action(wc, 'Fin du tour'); await until(wc, `PlaytestState.turn === 2 && PlaytestState.phase === 'player' && !PlaytestState.busy`);
      await shot(wc, 'battle-secondary'); await kill(wc, 'captain'); await until(wc, `PlaytestState.secondaryRewardPending && !PlaytestState.busy`);
      assert.equal(await js(wc, 'PlaytestState.over'), false); assert.equal(await js(wc, 'PlaytestState.campaign.gold'), initialGold + 100);
      assert.equal(await js(wc, 'PlaytestState.campaign.secondaryClaims.length'), 1);
      await click(wc, '[data-secondary-collect]'); await until(wc, `!!document.querySelector('[data-secondary-collection]')`);
      await shot(wc, 'collection-secondary'); await click(wc, '[data-secondary-transfer="0"]');
      await click(wc, '[data-secondary-receive]'); await until(wc, `!!document.querySelector('#end .end-secondary')`);
      assert.equal(await js(wc, `document.querySelectorAll('#end [data-secondary-status="success"]').length`), 5);
      assert.equal(await js(wc, `document.querySelectorAll('#end [data-secondary-status="failed"]').length`), 1);
      assert.equal(await js(wc, 'PlaytestState.campaign.gold'), initialGold + 200); assert.equal(await js(wc, 'PlaytestState.convoy[0].uses'), 1);
      assert.equal(await js(wc, 'PlaytestState.campaign.secondaryClaims.length'), 5); await shot(wc, 'victory-secondary');
      await js(wc, 'PlaytestDebug.checkEnd()'); assert.equal(await js(wc, 'PlaytestState.campaign.gold'), initialGold + 200);
      await click(wc, '#end button', 'Retour au camp'); await until(wc, `PlaytestState.mode === 'lobby' && !PlaytestState.busy`); await js(wc, 'PlaytestDebug.saveSlot(2)');
      first.win.close(); const second = await start('Continuer'), rwc = second.wc; await depart(rwc);
      assert.match(await js(rwc, `document.querySelector('[data-prep-secondary="${ids.target}"]').textContent`), /déjà obtenue/);
      await begin(rwc); await js(rwc, `PlaytestState.turn = 4`); await kill(rwc, 'captain'); await until(rwc, `!!document.querySelector('#end .end-secondary')`);
      assert.equal(await js(rwc, 'PlaytestState.campaign.gold'), initialGold + 280);
      assert.equal(await js(rwc, `PlaytestState.secondaryProgress['${ids.turn}'].status`), 'failed');
      assert.equal(await js(rwc, `PlaytestState.secondaryProgress['${ids.protect}'].status`), 'success');
      assert.equal(await js(rwc, 'PlaytestState.campaign.secondaryClaims.length'), 6); assert.equal(await js(rwc, 'PlaytestState.convoy.length'), 1);
      second.win.close();
      const boundaryProject = io.loadProject(dir); boundaryProject.meta.lobby.enabled = false;
      boundaryProject.db.chapters[0].objective = { type: 'survive', turns: 1 };
      boundaryProject.db.chapters[0].secondaryObjectives = [{ id: 'boundary', type: 'turn', turns: 1, reward: { gold: 1 } }];
      io.saveProject(dir, boundaryProject);
      const third = await start('Détente'), twc = third.wc;
      await until(twc, `PlaytestState.mode === 'preparation'`); await begin(twc);
      await mapMenu(twc); await action(twc, 'Fin du tour'); await until(twc, `!!document.querySelector('#end .end-secondary')`);
      assert.equal(await js(twc, 'PlaytestState.turn'), 2);
      assert.equal(await js(twc, `PlaytestState.secondaryProgress.boundary.status`), 'success');
      assert.deepEqual(errors, []); clearTimeout(watchdog); finish({ ok: true, editor: true, preparation: true, optionalDeployment: true, targetAndScenario: true, villageAndChest: true, casualRetreat: true, deadline: true, blockedRewards: true, convoyResume: true, victorySummary: true, restart: true, checkpoint: true, saveAndLoad: true, noDuplicateRewards: true, firstSuccessOnReplay: true, errors });
    } catch (error) { clearTimeout(watchdog); finish({ ok: false, error: error.stack, errors }); }
  });
};
