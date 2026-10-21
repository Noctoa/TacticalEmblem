'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict');
const { app } = require('electron'), io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], delay = ms => new Promise(r => setTimeout(r, ms));
  const js = (wc, code) => { fs.writeFileSync(path.join(out, 'progress.json'), JSON.stringify({ code, errors })); return wc.executeJavaScript(code, true); };
  const finish = value => { fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(value, null, 2)); app.exit(value.ok ? 0 : 1); };
  const watchdog = setTimeout(() => finish({ ok: false, error: 'Délai global dépassé', errors }), 180000);
  const until = async (wc, code) => { const end = Date.now() + 20000; while (Date.now() < end) { if (await js(wc, code)) return; await wc.capturePage(); await delay(60); } throw new Error('Délai dépassé : ' + code + '\n' + await js(wc, 'document.body.innerText.slice(-1800)')); };
  const click = (wc, selector, text = '') => js(wc, `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find(el => el.textContent.includes(${JSON.stringify(text)})); if (!b) throw new Error('Bouton absent : ' + ${JSON.stringify(text)}); b.click(); })()`);
  const shot = async (wc, name) => { await js(wc, `document.querySelectorAll('.modal-back').forEach(el => el.style.animation = 'none')`); await wc.capturePage(); await delay(130); fs.writeFileSync(path.join(out, name + '.png'), (await wc.capturePage()).toPNG()); };
  const watch = wc => { wc.setBackgroundThrottling(false); wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); }); };
  editor.webContents.once('did-finish-load', async () => {
    try {
      editor.setSize(1440, 900); const ew = editor.webContents; watch(ew);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-scenario-ui-')), 'Jeu'), p = io.createProject(dir, 'Embuscade', 'sample', path.join(__dirname, '..', 'assets'));
      const ch = p.db.chapters[0], map = p.maps.find(m => m.id === ch.mapId);
      Object.assign(map, { width: 9, height: 6, terrain: Array(54).fill('wall') }); map.layers.forEach((l, i) => l.data = Array(54).fill(i ? 0 : 12));
      for (let x = 1; x <= 7; x++) { map.terrain[2 * 9 + x] = 'floor'; map.layers[0].data[2 * 9 + x] = 13; }
      map.terrain[3 * 9 + 1] = 'floor'; map.layers[0].data[3 * 9 + 1] = 13;
      Object.assign(ch, { players: [{ id: 'p1', unitId: 'c_eliwood', x: 2, y: 2 }, { id: 'p2', unitId: 'c_lyn', x: 1, y: 2 }, { id: 'p3', unitId: 'c_hector', x: 1, y: 3 }], objective: { type: 'survive', turns: 99 }, requiredUnits: ['c_eliwood'], villages: [], allies: [], events: [], gold: 0, orbs: 0, final: false });
      ch.enemies = [{ id: 'guard', name: 'Gardien', classId: 'brigand', level: 1, x: 7, y: 2, ai: 'stationary', isBoss: true }, { id: 'ambush', name: 'Embuscade', classId: 'brigand', level: 1, x: 6, y: 2, ai: 'stationary', eventOnly: true }];
      ch.chests = [{ id: 'treasure', name: 'Coffre piégé', x: 2, y: 2, locked: false, reward: {} }];
      ch.doors = [{ id: 'exit', name: 'Sortie du fort', x: 4, y: 2, openTerrainId: 'floor', locked: false }];
      p.meta.lobby.initialRoster = ch.players.map(pl => pl.unitId); p.meta.convoy = { capacity: 1, items: [{ id: 'i_vulnerary', uses: 1 }] };
      p.db.units.find(u => u.id === 'c_eliwood').inventory = Array.from({ length: 5 }, () => ({ id: 'i_vulnerary', uses: 2 }));
      p.db.units.find(u => u.id === 'c_lyn').inventory = [{ id: 'w_iron_sword', uses: 7 }];
      p.db.units.find(u => u.id === 'c_hector').inventory = [{ id: 'w_iron_axe', uses: 45 }];
      io.saveProject(dir, p); await js(ew, `Editor.open(${JSON.stringify(dir)});`); await js(ew, `DBEditor.open('chapters', 'ch_1')`);
      const field = async (selector, label, value) => js(ew, `(() => { const box = document.querySelector(${JSON.stringify(selector)}), label = [...box.querySelectorAll('.field-label'), ...box.querySelectorAll('.checkbox')].find(el => el.textContent === ${JSON.stringify(label)} || el.textContent === ${JSON.stringify(label)} + '?'); if (!label) throw new Error('Champ absent : ' + ${JSON.stringify(label)}); const input = label.matches('.checkbox') ? label.querySelector('input') : label.parentElement.querySelector('input,textarea,select'); ${typeof value === 'boolean' ? `input.checked = ${value};` : `input.value = ${JSON.stringify(value)};`} input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      const add = async name => { await click(ew, '[data-event-add]'); const id = await js(ew, `Editor.db().chapters[0].events.at(-1).id`); await field(`[data-event-id="${id}"]`, 'Nom de l’événement', name); return id; };
      const trigger = (id, type) => field(`[data-event-id="${id}"]`, 'Déclenchement', type);
      const addAction = async (id, type, values) => {
        await click(ew, `[data-event-add-action="${id}"]`);
        const index = await js(ew, `Editor.db().chapters[0].events.find(e => e.id === ${JSON.stringify(id)}).actions.length - 1`), selector = `[data-event-id="${id}"] [data-event-action="${index}"]`;
        await js(ew, `(() => { const select = document.querySelector(${JSON.stringify(selector)} + ' [data-action-type]'); select.value = ${JSON.stringify(type)}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
        for (const [label, value] of values) await field(selector, label, value);
      };
      const choice = await add('Le marché du fort'); await field(`[data-event-id="${choice}"]`, 'Une seule fois dans toute la campagne (prioritaire)', true);
      await addAction(choice, 'choice', [['Question', 'Accepter le marché ?'], ['Information mémorisée', 'deal'], ['Réponse qui mémorise vrai', 'Accepter'], ['Réponse qui mémorise faux', 'Refuser']]);
      const open = await add('Ouvrir la sortie'); await addAction(open, 'door', [['Porte', 'exit'], ['Ouvrir (décoché = fermer)', true]]);
      const gift = await add('Orbes du marché'); await trigger(gift, 'condition'); await field(`[data-event-id="${gift}"]`, 'Une seule fois dans toute la campagne (prioritaire)', true);
      await click(ew, `[data-event-add-condition="${gift}"]`); await field(`[data-event-id="${gift}"]`, 'Information requise', 'deal');
      // Condition de présence réglée depuis le même formulaire que le créateur utilise.
      await js(ew, `(() => { const box = document.querySelector('[data-event-id="${gift}"]'); const chip = [...box.querySelectorAll('.chips button')].find(el => el.textContent === 'Eliwood'); if (!chip) throw new Error('Condition de présence absente'); chip.click(); })()`);
      await addAction(gift, 'orbs', [['Orbes donnés', '3']]);
      const trap = await add('Embuscade du coffre'); await trigger(trap, 'chest'); await field(`[data-event-id="${trap}"]`, 'Interaction', 'treasure');
      await addAction(trap, 'gold', [['Or donné', '100']]); await addAction(trap, 'item', [['Arme ou objet', 'i_chest_key'], ['Utilisations (0 = toutes)', '2'], ['Destinataire (vide = convoi)', 'c_eliwood']]);
      await addAction(trap, 'reinforcement', [['Renfort placé sur la map', 'ambush']]); await addAction(trap, 'door', [['Porte', 'exit'], ['Ouvrir (décoché = fermer)', false]]);
      await addAction(trap, 'objective', [['Nouvel objectif', 'survive'], ['Tours à survivre à partir du tour actuel', '5']]); await addAction(trap, 'flag', [['Information mémorisée', 'trap'], ['Valeur vraie (décoché = faux)', true]]);
      const win = await add('Récompense de victoire'); await trigger(win, 'victory'); await field(`[data-event-id="${win}"]`, 'Une seule fois dans toute la campagne (prioritaire)', true); await addAction(win, 'orbs', [['Orbes donnés', '2']]);
      await addAction(win, 'item', [['Arme ou objet', 'i_door_key'], ['Utilisations (0 = toutes)', '1'], ['Destinataire (vide = convoi)', 'c_eliwood']]);
      await addAction(win, 'flag', [['Information mémorisée', 'winGift'], ['Valeur vraie (décoché = faux)', true]]);
      await js(ew, `document.querySelector('[data-event-id="${trap}"]').scrollIntoView()`); await shot(ew, 'editor-events');
      await js(ew, `tf.saveProject(Editor.dir(), Editor.project())`); const savedProject = io.loadProject(dir); assert.equal(savedProject.db.chapters[0].events.length, 5); assert.equal(savedProject.db.chapters[0].events[3].actions.length, 6);
      const start = async value => { const win = openPlaytest(dir, ''), wc = win.webContents; watch(wc); await new Promise(r => wc.once('did-finish-load', r)); await until(wc, `!!document.querySelector('.choice-list')`); await click(wc, '.choice-list button', value); return { win, wc }; };
      const begin = async (wc, answer) => {
        await until(wc, `PlaytestState.mode === 'preparation'`); await click(wc, '[data-deploy-start]');
        if (answer !== undefined) { await until(wc, `!!document.querySelector('[data-scenario-choice]')`); await shot(wc, 'choice'); await click(wc, `[data-scenario-choice="${answer}"]`); }
        await until(wc, `PlaytestState.mode === 'chapter' && !PlaytestState.busy`);
      };
      const depart = async (wc, answer) => { await until(wc, `PlaytestState.mode === 'lobby' && !PlaytestState.busy`); await js(wc, `PlaytestLobby.openMenu(); PlaytestState.menu.items.find(i => i.label === PlaytestLobby.state.cfg.board.label).action()`); await click(wc, '#lobby-panel .lp-go'); await until(wc, `!!document.querySelector('.modal-back')`); await click(wc, '.modal-actions button', 'Partir'); await begin(wc, answer); };
      const key = (wc, key) => js(wc, `document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true }))`);
      const menu = async (wc, id) => { await js(wc, `(() => { const u = PlaytestState.units.find(u => u.sourceId === ${JSON.stringify(id)}); PlaytestState.cursor = { x: u.x, y: u.y }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); })()`); await until(wc, `PlaytestState.ui === 'menu' && !PlaytestState.busy`); };
      const action = (wc, label) => js(wc, `void PlaytestState.menu.items.find(i => i.label === ${JSON.stringify(label)}).action()`);
      const first = await start('Classique'), wc = first.wc; await depart(wc, false);
      assert.equal(await js(wc, `PlaytestState.campaign.scenario.flags.deal`), false); const initialOrbs = await js(wc, `PlaytestState.campaign.orbs`);
      const springTrap = async () => {
        assert.equal(await js(wc, `PlaytestState.units.some(u => u.sourceId === 'ambush')`), false); assert.equal(await js(wc, `PlaytestState.openedDoors.has('exit')`), true);
        await menu(wc, 'c_eliwood'); await action(wc, 'Ouvrir le coffre'); await until(wc, `!!document.querySelector('.modal-back')`); await click(wc, '.modal-actions button', 'OK'); await until(wc, `!PlaytestState.busy`);
        assert.equal(await js(wc, `PlaytestState.campaign.gold`), 600); assert.equal(await js(wc, `PlaytestState.chapter.objective.turns`), 99); assert.equal(await js(wc, `PlaytestState.units.some(u => u.sourceId === 'ambush')`), false);
        await menu(wc, 'c_lyn'); await action(wc, 'Échanger'); await action(wc, 'Eliwood'); await until(wc, `PlaytestState.ui === 'trade'`);
        await click(wc, '[data-trade-slot="1:0"]'); await click(wc, '[data-trade-slot="0:1"]'); await click(wc, '[data-trade-close]'); await action(wc, 'Attendre'); await until(wc, `!PlaytestState.busy && PlaytestState.ui === 'idle'`);
        assert.equal(await js(wc, `PlaytestState.campaign.gold`), 600); assert.equal(await js(wc, `PlaytestState.campaign.scenario.flags.trap`), true); assert.equal(await js(wc, `PlaytestState.openedDoors.has('exit')`), false);
        assert.equal(await js(wc, `PlaytestState.units.filter(u => u.sourceId === 'ambush').length`), 1); assert.equal(await js(wc, `PlaytestState.units.find(u => u.sourceId === 'c_eliwood').inventory.at(-1).uses`), 2);
        assert.equal(await js(wc, `PlaytestState.chapter.objective.turns`), 5); assert.equal(await js(wc, `PlaytestState.db.chapters[0].objective.turns`), 99);
        await menu(wc, 'c_hector'); assert.equal(await js(wc, `PlaytestState.reach.has(Rules.key(5, 2))`), false); await shot(wc, 'ambush'); await key(wc, 'x'); await key(wc, 'x');
      };
      await springTrap(); await js(wc, `PlaytestDebug.saveSlot(1)`); const checkpoint = await js(wc, `tf.loadCampaign(new URLSearchParams(location.search).get('dir'), 1)`); assert.equal(checkpoint.campaign.scenario, undefined); assert.equal(checkpoint.campaign.gold, 500);
      await js(wc, `PlaytestState.cursor = { x: 0, y: 0 }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); void PlaytestState.menu.items.find(i => i.label === 'Recommencer').action()`); await until(wc, `!!document.querySelector('.modal-back')`); await click(wc, '.modal-actions button', 'OK'); await begin(wc, true);
      assert.equal(await js(wc, `PlaytestState.campaign.orbs`), initialOrbs + 3); assert.equal(await js(wc, `PlaytestState.campaign.scenario.flags.trap`), undefined); await springTrap();
      await js(wc, `PlaytestState.turn = 6; void PlaytestDebug.checkEnd()`); await until(wc, `PlaytestState.victoryStarted && !PlaytestState.busy`);
      assert.equal(await js(wc, `PlaytestState.over`), false); assert.equal(await js(wc, `PlaytestState.campaign.orbs`), initialOrbs + 5);
      // La victoire attend sa récompense sans refaire les actions déjà terminées.
      await js(wc, `(() => { const u = PlaytestState.units.find(u => u.sourceId === 'c_hector'); PlaytestState.cursor = { x: u.x, y: u.y }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); PlaytestState.cursor = { x: 3, y: 2 }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); })()`); await until(wc, `PlaytestState.ui === 'menu' && !PlaytestState.busy`);
      await action(wc, 'Échanger'); await until(wc, `PlaytestState.ui === 'trade'`); await click(wc, '[data-trade-slot="1:0"]'); await click(wc, '[data-trade-slot="0:2"]'); await click(wc, '[data-trade-close]'); await action(wc, 'Attendre');
      await until(wc, `!!document.querySelector('#end button')`); assert.equal(await js(wc, `PlaytestState.campaign.scenario.flags.winGift`), true);
      await click(wc, '#end button', 'Retour au camp'); await until(wc, `PlaytestState.mode === 'lobby' && !PlaytestState.busy`); await js(wc, `PlaytestDebug.saveSlot(2)`);
      const save = await js(wc, `tf.loadCampaign(new URLSearchParams(location.search).get('dir'), 2)`); assert.equal(save.campaign.scenario.flags.deal, true); assert.equal(save.campaign.orbs, initialOrbs + 5);
      first.win.close(); const resumed = await start('Continuer'), rwc = resumed.wc; await depart(rwc);
      assert.equal(await js(rwc, `PlaytestState.campaign.orbs`), initialOrbs + 5); assert.equal(await js(rwc, `PlaytestState.campaign.scenario.flags.deal`), true); assert.equal(await js(rwc, `PlaytestState.chapter.objective.turns`), 99);
      assert.equal(await js(rwc, `PlaytestState.openedDoors.has('exit')`), true); assert.equal(await js(rwc, `PlaytestState.units.some(u => u.sourceId === 'ambush')`), false);
      await menu(rwc, 'c_eliwood'); assert.equal(await js(rwc, `PlaytestState.menu.items.some(i => i.label === 'Ouvrir le coffre')`), false);
      assert.deepEqual(errors, []); clearTimeout(watchdog); finish({ ok: true, editor: true, choiceBranches: true, deployedCondition: true, blockedRewardResumed: true, pendingVictoryReward: true, noDuplicateGold: true, chestTrigger: true, ambush: true, doorClosure: true, dynamicObjective: true, checkpoint: true, restart: true, persistentChoice: true, campaignOnce: true, saveAndLoad: true, errors });
    } catch (error) { clearTimeout(watchdog); finish({ ok: false, error: error.stack, errors }); }
  });
};
