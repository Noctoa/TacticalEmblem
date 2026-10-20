'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict');
const { app } = require('electron'), io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], delay = ms => new Promise(r => setTimeout(r, ms));
  const js = (wc, code) => { fs.writeFileSync(path.join(out, 'progress.json'), JSON.stringify({ code, errors })); return wc.executeJavaScript(code, true); };
  const finish = value => { fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(value, null, 2)); app.exit(value.ok ? 0 : 1); };
  const watchdog = setTimeout(() => finish({ ok: false, error: 'Délai global dépassé', errors }), 150000);
  const until = async (wc, code) => { const end = Date.now() + 20000; while (Date.now() < end) { if (await js(wc, code)) return; await wc.capturePage(); await delay(60); } throw new Error('Délai dépassé : ' + code + '\n' + await js(wc, 'document.body.innerText.slice(-1800)')); };
  const click = (wc, selector, text = '') => js(wc, `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find(el => el.textContent.includes(${JSON.stringify(text)})); if (!b) throw new Error('Bouton absent : ' + ${JSON.stringify(text)}); b.click(); })()`);
  const key = (wc, value) => js(wc, `document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(value)}, bubbles: true, cancelable: true }))`);
  const shot = async (wc, name) => { await wc.capturePage(); await delay(120); fs.writeFileSync(path.join(out, name + '.png'), (await wc.capturePage()).toPNG()); };
  const watch = wc => { wc.setBackgroundThrottling(false); wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); }); };
  editor.webContents.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-trade-ui-')), 'Jeu'), p = io.createProject(dir, 'Échanges', 'sample', path.join(__dirname, '..', 'assets'));
      const ch = p.db.chapters[0], map = p.maps.find(m => m.id === ch.mapId);
      Object.assign(map, { width: 8, height: 6, terrain: Array(48).fill('plain') }); map.layers.forEach((l, i) => l.data = Array(48).fill(i ? 0 : 1));
      Object.assign(ch, { players: [{ id: 'p1', unitId: 'c_eliwood', x: 1, y: 2 }, { id: 'p2', unitId: 'c_lyn', x: 3, y: 2 }, { id: 'p3', unitId: 'c_hector', x: 2, y: 3 }],
        objective: { type: 'survive', turns: 99 }, requiredUnits: ['c_eliwood'], villages: [], allies: [], events: [], startScript: '', gold: 0, final: false });
      ch.enemies = [{ id: 'boss', name: 'Gardien', classId: 'brigand', level: 1, x: 2, y: 1, ai: 'stationary', isBoss: true, inventory: [{ id: 'w_iron_axe', uses: 20 }] }];
      p.meta.settings.battleAnims = false; p.meta.lobby.initialRoster = ch.players.map(pl => pl.unitId);
      const eliwood = p.db.units.find(u => u.id === 'c_eliwood'), lyn = p.db.units.find(u => u.id === 'c_lyn'), hector = p.db.units.find(u => u.id === 'c_hector');
      eliwood.inventory = [{ id: 'i_vulnerary', uses: 2 }];
      lyn.inventory = [{ id: 'w_iron_sword', uses: 7 }, { id: 'i_chest_key', uses: 3 }, { id: 'w_iron_bow', uses: 9 }, { id: 'i_door_key', uses: 1 }, { id: 'i_vulnerary', uses: 1 }];
      hector.inventory = []; io.saveProject(dir, p);
      const start = async choice => { const win = openPlaytest(dir, ''), wc = win.webContents; watch(wc); win.setSize(1080, 760); await new Promise(r => wc.once('did-finish-load', r)); await until(wc, `!!document.querySelector('.choice-list')`); await click(wc, '.choice-list button', choice); return { win, wc }; };
      const begin = async wc => { await until(wc, `PlaytestState.mode === 'preparation'`); await click(wc, '[data-deploy-start]'); await until(wc, `PlaytestState.mode === 'chapter' && !PlaytestState.busy`); };
      const depart = async wc => { await until(wc, `PlaytestState.mode === 'lobby' && !PlaytestState.busy`); await js(wc, `PlaytestLobby.openMenu(); PlaytestState.menu.items.find(i => i.label === PlaytestLobby.state.cfg.board.label).action()`); await click(wc, '#lobby-panel .lp-go'); await until(wc, `!!document.querySelector('.modal-back')`); await click(wc, '.modal-actions button', 'Partir'); await begin(wc); };
      const menu = async (wc, id, x, y) => {
        await js(wc, `(() => { const u = PlaytestState.units.find(u => u.sourceId === ${JSON.stringify(id)}); PlaytestState.cursor = { x: u.x, y: u.y }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); PlaytestState.cursor = { x: ${x}, y: ${y} }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); })()`);
        await until(wc, `PlaytestState.ui === 'menu' && !PlaytestState.busy`);
      };
      const action = (wc, label) => js(wc, `void PlaytestState.menu.items.find(i => i.label === ${JSON.stringify(label)}).action()`);
      const choosePartner = async (wc, name) => { await action(wc, 'Échanger'); await action(wc, name); await until(wc, `PlaytestState.ui === 'trade'`); };
      const inv = (wc, id) => js(wc, `PlaytestState.units.find(u => u.sourceId === ${JSON.stringify(id)}).inventory`);
      const first = await start('Classique'), wc = first.wc; await depart(wc);
      await menu(wc, 'c_lyn', 3, 2); await action(wc, 'Attendre'); await until(wc, `PlaytestState.ui === 'idle'`);
      await menu(wc, 'c_eliwood', 2, 2); assert.equal(await js(wc, `PlaytestState.menu.items.some(i => i.label === 'Attaquer')`), false);
      await choosePartner(wc, 'Lyn'); await click(wc, '[data-trade-slot="1:0"]'); await key(wc, 'x');
      assert.equal(await js(wc, `document.querySelectorAll('.trade-slot.selected').length`), 0); await key(wc, 'x'); await key(wc, 'x');
      assert.equal(await js(wc, `PlaytestState.sel.x`), 1); assert.equal(await js(wc, `PlaytestState.ui`), 'moving'); await key(wc, 'x');
      const exchange = async () => {
        await menu(wc, 'c_eliwood', 2, 2); await choosePartner(wc, 'Lyn');
        await click(wc, '[data-trade-slot="0:0"]'); await click(wc, '[data-trade-slot="1:0"]');
        assert.equal((await inv(wc, 'c_eliwood'))[0].id, 'w_iron_sword'); assert.equal((await inv(wc, 'c_eliwood'))[0].uses, 7);
        assert.equal((await inv(wc, 'c_lyn')).length, 5); assert.equal((await inv(wc, 'c_lyn'))[0].uses, 2);
        // Clavier : prendre une clé chez Lyn et la transférer vers une place libre chez Eliwood.
        await key(wc, 'ArrowDown'); await key(wc, 'Enter'); await key(wc, 'ArrowLeft'); await key(wc, 'Enter');
        assert.equal((await inv(wc, 'c_eliwood'))[1].id, 'i_chest_key'); assert.equal((await inv(wc, 'c_eliwood'))[1].uses, 3);
        assert.equal(await js(wc, `PlaytestState.units.find(u => u.sourceId === 'c_lyn').done`), true);
        assert.equal(await js(wc, `PlaytestState.sel.done`), false);
        await shot(wc, 'exchange'); await click(wc, '[data-trade-close]'); await key(wc, 'x');
        assert.equal(await js(wc, `PlaytestState.ui`), 'menu'); assert.equal(await js(wc, `PlaytestState.sel.x`), 2);
        assert.equal(await js(wc, `PlaytestState.menu.items.some(i => i.label === 'Attaquer')`), true);
      };
      await exchange();
      // L'autre voisin a un inventaire vide et reste disponible.
      await choosePartner(wc, 'Hector'); await click(wc, '[data-trade-slot="0:1"]'); await click(wc, '[data-trade-slot="1:0"]');
      assert.equal((await inv(wc, 'c_hector'))[0].uses, 3); await click(wc, '[data-trade-close]');
      await js(wc, 'PlaytestDebug.saveSlot(1)'); const checkpoint = await js(wc, `tf.loadCampaign(new URLSearchParams(location.search).get('dir'), 1)`);
      assert.deepEqual(checkpoint.campaign.units.c_eliwood.inventory, eliwood.inventory);
      // Recommencer via le menu Debug n'est pas nécessaire : fin d'action puis menu de map.
      await action(wc, 'Attendre'); await until(wc, `PlaytestState.ui === 'idle'`);
      await js(wc, `PlaytestState.cursor = { x: 0, y: 0 }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); void PlaytestState.menu.items.find(i => i.label === 'Recommencer').action()`);
      await until(wc, `!!document.querySelector('.modal-back')`); await click(wc, '.modal-actions button', 'OK'); await begin(wc);
      assert.deepEqual(await inv(wc, 'c_eliwood'), eliwood.inventory); assert.deepEqual(await inv(wc, 'c_lyn'), lyn.inventory);
      await menu(wc, 'c_lyn', 3, 2); await action(wc, 'Attendre'); await until(wc, `PlaytestState.ui === 'idle'`); await exchange();
      // L'arme reçue sert immédiatement à attaquer, sans tour supplémentaire.
      await action(wc, 'Attaquer'); await key(wc, 'Enter'); await until(wc, `!PlaytestState.busy && PlaytestState.ui === 'idle'`);
      assert.equal((await inv(wc, 'c_eliwood'))[0].uses < 7, true); assert.equal(await js(wc, `PlaytestState.units.find(u => u.sourceId === 'c_eliwood').done`), true);
      // Nouveau tour : le verrou de déplacement disparaît.
      await menu(wc, 'c_hector', 2, 3); await action(wc, 'Attendre'); await until(wc, `PlaytestState.turn === 2 && PlaytestState.phase === 'player' && !PlaytestState.busy`);
      assert.equal(await js(wc, `PlaytestState.units.find(u => u.sourceId === 'c_eliwood').tradeLocked`), false);
      const expected = await inv(wc, 'c_eliwood');
      await js(wc, 'PlaytestState.turn = 100; void PlaytestDebug.checkEnd()'); await until(wc, `!!document.querySelector('#end button')`); await click(wc, '#end button', 'Retour au camp'); await until(wc, `PlaytestState.mode === 'lobby'`); await js(wc, 'PlaytestDebug.saveSlot(2)');
      first.win.close(); const resumed = await start('Continuer'), rwc = resumed.wc; await until(rwc, `PlaytestState.mode === 'lobby'`);
      assert.deepEqual(await js(rwc, `PlaytestState.campaign.units.c_eliwood.inventory`), expected);
      await depart(rwc); assert.deepEqual(await inv(rwc, 'c_eliwood'), expected);
      resumed.win.setSize(620, 660); await menu(rwc, 'c_eliwood', 2, 2); await choosePartner(rwc, 'Lyn'); await shot(rwc, 'exchange-small');
      assert.equal(await js(rwc, `(() => { const r = document.querySelector('#trade').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })()`), true);
      assert.deepEqual(errors, []); clearTimeout(watchdog); finish({ ok: true, partnerChoice: true, fullSwap: true, keyboardTransfer: true, emptyInventory: true, cancellation: true, movementCommitted: true, partnerTurnPreserved: true, attackAfterTrade: true, nextTurn: true, checkpoint: true, restart: true, saveAndLoad: true, smallWindow: true, errors });
    } catch (error) { clearTimeout(watchdog); finish({ ok: false, error: error.stack, errors }); }
  });
};
