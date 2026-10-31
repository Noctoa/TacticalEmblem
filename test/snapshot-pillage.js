'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict');
const { app } = require('electron'), io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], delay = ms => new Promise(r => setTimeout(r, ms));
  const js = (wc, code) => { fs.writeFileSync(path.join(out, 'progress.json'), JSON.stringify({ code, errors })); return wc.executeJavaScript(code, true); };
  const finish = value => { fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(value, null, 2)); app.exit(value.ok ? 0 : 1); };
  const watchdog = setTimeout(() => finish({ ok: false, error: 'Délai global dépassé', errors }), 180000);
  const until = async (wc, code) => { const end = Date.now() + 25000; while (Date.now() < end) { if (await js(wc, code)) return; await wc.capturePage(); await delay(60); } throw new Error('Délai dépassé : ' + code + '\n' + await js(wc, 'document.body.innerText.slice(-1600)')); };
  const click = (wc, selector, text = '') => js(wc, `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find(el => el.textContent.includes(${JSON.stringify(text)})); if (!b) throw new Error('Bouton absent : ' + ${JSON.stringify(text)}); b.click(); })()`);
  const shot = async (wc, name) => { await js(wc, `document.querySelectorAll('.modal-back').forEach(el => el.style.animation = 'none')`); await wc.capturePage(); await delay(180); fs.writeFileSync(path.join(out, name + '.png'), (await wc.capturePage()).toPNG()); };
  const watch = wc => { wc.setBackgroundThrottling(false); wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); }); };
  editor.webContents.once('did-finish-load', async () => {
    try {
      editor.setSize(1440, 950); const ew = editor.webContents; watch(ew);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'te-pillage-ui-')), 'Jeu');
      const p = io.createProject(dir, 'Sauver les villages', 'sample', path.join(__dirname, '..', 'assets'));
      const ch = p.db.chapters[0], map = p.maps.find(m => m.id === ch.mapId);
      Object.assign(map, { width: 15, height: 9, terrain: Array(135).fill('plain') });
      map.layers.forEach((l, i) => l.data = Array(135).fill(i ? 0 : 18));
      for (const pos of [[2, 4], [8, 3], [6, 6]]) { const i = pos[1] * 15 + pos[0]; map.layers[2].data[i] = 27; map.terrain[i] = 'village'; }
      Object.assign(ch, { players: [{ id: 'p1', unitId: 'c_eliwood', x: 2, y: 4 }, { id: 'p2', unitId: 'c_lyn', x: 2, y: 5 }], allies: [],
        requiredUnits: ['c_eliwood'], objective: { type: 'survive', turns: 99 }, gold: 0, orbs: 0, final: false, chests: [], doors: [],
        villages: [{ id: 'saved', name: 'Village sauvé', x: 2, y: 4, reward: { gold: 50 } },
          { id: 'ruin', name: 'Village de l’est', x: 8, y: 3, reward: { gold: 700, itemId: 'i_vulnerary', uses: 3 }, recruitUnitId: 'c_cloud' },
          { id: 'repeat', name: 'Village reconstruit', x: 6, y: 6, reward: { gold: 400 }, repeatOnReplay: true }],
        enemies: [{ id: 'raider', classId: 'brigand', name: 'Pillard de l’est', level: 1, x: 7, y: 3, ai: 'aggressive' },
          { id: 'south', classId: 'brigand', name: 'Pillard du sud', level: 1, x: 6, y: 5, ai: 'aggressive' },
          { id: 'boss', classId: 'brigand', name: 'Guetteur', level: 1, x: 13, y: 1, ai: 'stationary', isBoss: true }],
        secondaryObjectives: [{ id: 'visit', type: 'village', target: 'ruin', reward: { gold: 500 } }],
        events: [{ id: 'burnt', trigger: { type: 'villagePillaged', target: 'ruin' }, once: true, actions: [{ type: 'flag', key: 'east_burnt', value: true }] }] });
      p.meta.lobby.initialRoster = ch.players.map(u => u.unitId); p.meta.startChapter = ch.id;
      io.saveProject(dir, p); await js(ew, `Editor.open(${JSON.stringify(dir)});`); await js(ew, `DBEditor.open('chapters', ${JSON.stringify(ch.id)})`);
      const pick = async (id, kind, x1, y1, x2 = x1, y2 = y1) => {
        await js(ew, `(() => { const card = document.querySelector('[data-village-id="${id}"]'); card.closest('details').open = true; card.querySelector('[data-village-appearances]').open = true; card.querySelector('[data-village-pick="${kind}"]').click(); })()`);
        await until(ew, `document.querySelector('[data-village-tiles]')?.width > 0 && !document.querySelector('[data-village-tiles-apply]').disabled`);
        await js(ew, `(() => { const cv = document.querySelector('[data-village-tiles]'); const r = cv.getBoundingClientRect(); const zoom = cv.width / 256; const point = (x, y, type) => cv.dispatchEvent(new PointerEvent(type, { pointerId: 1, button: 0, bubbles: true, clientX: r.left + (x + .5) * 16 * zoom, clientY: r.top + (y + .5) * 16 * zoom })); point(${x1}, ${y1}, 'pointerdown'); point(${x2}, ${y2}, 'pointermove'); point(${x2}, ${y2}, 'pointerup'); })()`);
        assert.equal(await js(ew, `document.querySelector('[data-village-tiles-apply]').disabled`), false);
        await shot(ew, 'picker-' + kind); await click(ew, '[data-village-tiles-apply]');
      };
      await pick('saved', 'visited', 11, 1);
      await pick('ruin', 'ruined', 10, 2, 11, 3);
      await js(ew, `tf.saveProject(Editor.dir(), Editor.project())`);
      const project = io.loadProject(dir), ruined = project.db.chapters[0].villages[1];
      assert.equal(ruined.appearance.ruined.width, 2); assert.equal(ruined.appearance.ruined.height, 2);
      const originalMap = JSON.stringify(project.maps.find(m => m.id === ch.mapId));
      const start = async choice => { const win = openPlaytest(dir, ''), wc = win.webContents; watch(wc); await new Promise(r => wc.once('did-finish-load', r)); await until(wc, `!!document.querySelector('.choice-list')`); await click(wc, '.choice-list button', choice); return { win, wc }; };
      const depart = async wc => {
        await until(wc, `PlaytestState.mode === 'lobby' && !PlaytestState.busy`);
        await js(wc, `PlaytestLobby.openMenu(); PlaytestState.menu.items.find(i => i.label === PlaytestLobby.state.cfg.board.label).action()`);
        await click(wc, '#lobby-panel .lp-go'); await until(wc, `!!document.querySelector('.modal-back')`); await click(wc, '.modal-actions button', 'Partir');
        await until(wc, `PlaytestState.mode === 'preparation'`);
      };
      const begin = async wc => { await click(wc, '[data-deploy-start]'); await until(wc, `PlaytestState.mode === 'chapter' && !PlaytestState.busy`); await js(wc, `PlaytestState.fast = true; PlaytestState.debug.god = true`); };
      const menu = async (wc, id) => { await js(wc, `(() => { const u = PlaytestState.units.find(u => u.sourceId === ${JSON.stringify(id)}); PlaytestState.cursor = { x: u.x, y: u.y }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); })()`); await until(wc, `PlaytestState.ui === 'menu' && !PlaytestState.busy`); };
      const action = (wc, label) => js(wc, `void PlaytestState.menu.items.find(i => i.label === ${JSON.stringify(label)}).action()`);
      const mapMenu = wc => js(wc, `PlaytestState.cursor = { x: 0, y: 0 }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))`);
      const state = `({ campaign: PlaytestState.campaign, visited: PlaytestState.visitedVillages, ruined: PlaytestState.ruinedVillages })`;
      const first = await start('Détente'), wc = first.wc; await depart(wc); await begin(wc);
      const initialGold = await js(wc, 'PlaytestState.campaign.gold');
      const playRound = async () => {
        await menu(wc, 'c_eliwood'); await action(wc, 'Visiter'); await until(wc, `!!document.querySelector('.modal-back')`); await click(wc, '.modal-actions button', 'OK'); await until(wc, `!PlaytestState.busy`);
        assert.equal(await js(wc, `Villages.status(PlaytestState.chapter, PlaytestState.chapter.villages[0], ${state})`), 'visited');
        await shot(wc, 'visited-village');
        await mapMenu(wc); await action(wc, 'Fin du tour');
        await until(wc, `PlaytestState.turn === 2 && PlaytestState.phase === 'player' && !PlaytestState.busy`);
        assert.equal(await js(wc, `PlaytestState.ruinedVillages.size`), 2);
        assert.equal(await js(wc, `PlaytestState.campaign.gold`), initialGold + 50);
        assert.equal(await js(wc, `PlaytestState.campaign.scenario.flags.east_burnt`), true);
        assert.equal(await js(wc, `PlaytestState.secondaryProgress.visit.status`), 'failed');
        assert.equal(await js(wc, `PlaytestState.campaign.recruited.includes('c_cloud')`), false);
        assert.equal(await js(wc, `Villages.terrainAt(PlaytestState.chapter, PlaytestState.db, 8, 3, ${state}, { id: 'village' }).id`), 'plain');
        assert.equal(await js(wc, `JSON.stringify(PlaytestState.map)`), originalMap);
        await js(wc, `PlaytestState.cursor = { x: 8, y: 3 }`); await delay(150);
        assert.match(await js(wc, `document.querySelector('#terrain-win').textContent`), /pillé/);
        await shot(wc, 'pillaged-villages');
      };
      await playRound(); await js(wc, 'PlaytestDebug.saveSlot(1)');
      const checkpoint = await js(wc, `tf.loadCampaign(new URLSearchParams(location.search).get('dir'), 1)`);
      assert.equal(checkpoint.campaign.villageRuins, undefined); assert.equal(checkpoint.campaign.gold, initialGold);
      await mapMenu(wc); await action(wc, 'Recommencer'); await until(wc, `!!document.querySelector('.modal-back')`); await click(wc, '.modal-actions button', 'OK');
      await until(wc, `PlaytestState.mode === 'preparation'`); await begin(wc);
      assert.equal(await js(wc, `PlaytestState.ruinedVillages.size`), 0); assert.equal(await js(wc, `PlaytestState.campaign.villageRuins`), undefined);
      await playRound();
      await js(wc, `void (async () => { for (const u of PlaytestState.units.filter(u => u.team === 'enemy')) await PlaytestDebug.killUnit(u, true); PlaytestState.turn = 100; await PlaytestDebug.checkEnd(); })()`);
      await until(wc, `!!document.querySelector('#end button')`);
      await click(wc, '#end button', 'Retour au camp'); await until(wc, `PlaytestState.mode === 'lobby' && !PlaytestState.busy`); await js(wc, 'PlaytestDebug.saveSlot(2)');
      const saved = await js(wc, `tf.loadCampaign(new URLSearchParams(location.search).get('dir'), 2)`);
      assert.equal(saved.campaign.villageRuins.length, 2); assert.equal(saved.campaign.villageVisits.length, 1); assert.equal(saved.campaign.gold, initialGold + 50);
      first.win.close(); const resumed = await start('Continuer'), rwc = resumed.wc; await depart(rwc);
      assert.equal(await js(rwc, `Villages.status(PlaytestState.chapter, PlaytestState.chapter.villages[1], ${state})`), 'ruined');
      assert.equal(await js(rwc, `Villages.status(PlaytestState.chapter, PlaytestState.chapter.villages[2], ${state})`), 'open');
      await shot(rwc, 'persistent-ruins-preparation'); await begin(rwc);
      await menu(rwc, 'c_eliwood'); assert.equal(await js(rwc, `PlaytestState.menu.items.some(i => i.label === 'Visiter')`), false);
      assert.equal(JSON.stringify(io.loadProject(dir).maps.find(m => m.id === ch.mapId)), originalMap);
      assert.deepEqual(errors, []); clearTimeout(watchdog); finish({ ok: true, tilePicker: true, multipleTiles: true, playerClosure: true, raiderMovement: true, pillage: true, noRewardOrRecruit: true, ruinedTerrain: true, optionalObjectiveFailed: true, scenarioTrigger: true, restart: true, checkpoint: true, campaignPersistence: true, replayOption: true, projectMapUnchanged: true, errors });
    } catch (error) { clearTimeout(watchdog); finish({ ok: false, error: error.stack, errors }); }
  });
};
