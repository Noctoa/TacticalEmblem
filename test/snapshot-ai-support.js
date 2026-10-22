/* TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=chemin/absolu/test/snapshot-ai-support.js npm start */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict');
const { app } = require('electron'), io = require('../src/main/project-io');
const S = require('../src/shared/statuses');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], delay = ms => new Promise(r => setTimeout(r, ms));
  const js = (wc, code) => { fs.writeFileSync(path.join(out, 'progress.json'), JSON.stringify({ code, errors })); return wc.executeJavaScript(code, true); };
  const finish = value => { fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(value, null, 2)); app.exit(value.ok ? 0 : 1); };
  const watchdog = setTimeout(() => finish({ ok: false, error: 'Délai global dépassé', errors }), 180000);
  const until = async (wc, code) => { const end = Date.now() + 30000; while (Date.now() < end) { if (await js(wc, code)) return; await wc.capturePage(); await delay(70); } throw new Error('Délai dépassé : ' + code); };
  const click = (wc, selector, text = '') => js(wc, `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find(el => el.textContent.includes(${JSON.stringify(text)})); if (!b) throw new Error('Bouton absent : ' + ${JSON.stringify(text)}); b.click(); })()`);
  const shot = async (wc, name) => { await wc.capturePage(); await delay(150); fs.writeFileSync(path.join(out, name + '.png'), (await wc.capturePage()).toPNG()); };
  const watch = wc => { wc.setBackgroundThrottling(false); wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); }); };
  editor.webContents.once('did-finish-load', async () => {
    try {
      editor.setSize(1440, 900); const ew = editor.webContents; watch(ew);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'te-ai-ui-')), 'Jeu');
      const p = io.createProject(dir, 'Soigneurs IA', 'sample', path.join(__dirname, '..', 'assets'));
      const ch = p.db.chapters[0], map = p.maps.find(m => m.id === ch.mapId);
      Object.assign(map, { width: 12, height: 8, terrain: Array(96).fill('plain') });
      map.layers.forEach((l, i) => l.data = Array(96).fill(i ? 0 : 1));
      const examples = S.examples(); p.db.weapons.push(...examples.weapons); p.db.items.push(...examples.items);
      const cleric = p.db.units.find(u => u.id === 'c_serra').classId;
      Object.assign(ch, { players: [{ id: 'p1', unitId: 'c_eliwood', x: 1, y: 6 }],
        allies: [{ id: 'a1', unitId: 'c_hector', x: 3, y: 6, control: 'ai', ai: 'range' },
          { id: 'a2', unitId: 'c_serra', x: 2, y: 6, control: 'ai', ai: 'support' }],
        objective: { type: 'survive', turns: 99 }, requiredUnits: ['c_eliwood'], villages: [], events: [], gold: 0, final: false,
        enemies: [
          { id: 'guard', name: 'Blessé', classId: 'brigand', level: 1, x: 9, y: 1, ai: 'stationary', inventory: [{ id: 'w_iron_axe' }] },
          { id: 'healer', name: 'Soigneur', classId: cleric, level: 1, x: 6, y: 1, ai: 'support', inventory: [{ id: 'w_heal', uses: 1 }] },
          { id: 'item', name: 'Porteur', classId: 'brigand', level: 1, x: 10, y: 2, ai: 'stationary', inventory: [{ id: 'i_status_antidote', uses: 1 }] }
        ] });
      p.db.units.find(u => u.id === 'c_serra').inventory = [{ id: 'w_status_restore', uses: 1 }, { id: 'w_heal', uses: 3 }];
      p.db.units.find(u => u.id === 'c_hector').inventory = [{ id: 'i_vulnerary', uses: 1 }];
      p.meta.lobby.enabled = false; p.meta.startChapter = ch.id; p.meta.settings.aiDifficulty = 'easy';
      io.saveProject(dir, p); await js(ew, `Editor.open(${JSON.stringify(dir)})`);
      await js(ew, `DBEditor.open('system')`);
      assert.equal(await js(ew, `!![...document.querySelectorAll('select')].find(s => s.value === 'easy' && [...s.options].some(o => o.value === 'hard'))`), true);
      await js(ew, `document.querySelector('.db-form select option[value="easy"]').parentElement.scrollIntoView({ block: 'center' })`);
      await shot(ew, 'editor-difficulty');
      await js(ew, `DBEditor.close()`);
      await js(ew, `Editor.selectChapter(${JSON.stringify(ch.id)}); Editor.state.mode = 'units'; Editor.state.selected = { kind: 'enemies', id: 'healer' }; Editor.refresh()`);
      assert.equal(await js(ew, `!!document.querySelector('option[value="support"]')`), true);
      await shot(ew, 'editor-support');
      const win = openPlaytest(dir, ''), wc = win.webContents; watch(wc);
      await new Promise(r => wc.once('did-finish-load', r));
      await until(wc, `!!document.querySelector('.choice-list')`); await click(wc, '.choice-list button', 'Classique');
      const begin = async () => { await until(wc, `PlaytestState.mode === 'preparation'`); await click(wc, '[data-deploy-start]'); await until(wc, `PlaytestState.mode === 'chapter' && !PlaytestState.busy`); await js(wc, `PlaytestState.fast = true`); };
      await begin();
      const unit = id => `PlaytestState.units.find(u => u.sourceId === ${JSON.stringify(id)})`;
      assert.equal(await js(wc, 'PlaytestState.settings.aiDifficulty'), 'easy');
      await js(wc, `PlaytestSettings.open('game')`);
      await js(wc, `(() => { const s = document.querySelector('[data-ai-difficulty]'); s.value = 'hard'; s.dispatchEvent(new Event('change')); })()`);
      assert.equal(await js(wc, 'PlaytestState.settings.aiDifficulty'), 'hard');
      await shot(wc, 'difficulty'); await js(wc, `PlaytestSettings.close(); PlaytestDebug.saveSlot(1)`);
      const save = await js(wc, `tf.loadCampaign(new URLSearchParams(location.search).get('dir'), 1)`);
      assert.equal(save.aiDifficulty, 'hard');
      await js(wc, `PlaytestState.settings.aiDifficulty = 'easy'; PlaytestSettings.open('load')`);
      await click(wc, '.sv-row button', '');
      await until(wc, `!!document.querySelector('.modal-back')`); await click(wc, '.modal-actions button', 'Charger');
      await begin(); assert.equal(await js(wc, 'PlaytestState.settings.aiDifficulty'), 'hard');
      await js(wc, `(() => { ${unit('guard')}.hp = 1; Statuses.apply(${unit('item')}, 'poison', 3);
        ${unit('c_hector')}.hp = 1; Statuses.apply(${unit('c_hector')}, 'sleep', 3); })()`);
      const nextTurn = async turn => {
        await js(wc, `PlaytestState.cursor = { x: 0, y: 7 }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); void PlaytestState.menu.items.find(i => i.label.includes('Fin du tour')).action()`);
        await until(wc, `PlaytestState.turn === ${turn} && PlaytestState.phase === 'player' && !PlaytestState.busy`);
      };
      await nextTurn(2);
      assert.ok(await js(wc, `${unit('guard')}.hp > 1`));
      assert.equal(await js(wc, `${unit('healer')}.inventory.length`), 0);
      assert.equal(await js(wc, `${unit('item')}.inventory.length`), 0);
      assert.equal(await js(wc, `Statuses.active(${unit('item')}, 'poison')`), false);
      assert.equal(await js(wc, `Statuses.active(${unit('c_hector')}, 'sleep')`), false);
      assert.equal(await js(wc, `${unit('c_hector')}.inventory.length`), 0); // réveillé APRÈS sa place dans la liste, puis utilise sa potion
      assert.ok(await js(wc, `${unit('c_hector')}.hp > 1`));
      assert.ok(await js(wc, `${unit('c_serra')}.exp > 0`));
      assert.equal(await js(wc, `${unit('c_serra')}.inventory.some(s => s.id === 'w_status_restore')`), false);
      await js(wc, `(() => { ${unit('c_eliwood')}.hp = 1; ${unit('c_hector')}.hp = ${unit('c_hector')}.stats.hp; })()`);
      await nextTurn(3);
      assert.ok(await js(wc, `${unit('c_eliwood')}.hp > 1`));
      assert.equal(await js(wc, `${unit('c_serra')}.inventory.find(s => s.id === 'w_heal').uses`), 2);
      await shot(wc, 'after-healing');
      assert.deepEqual(errors, []); clearTimeout(watchdog);
      finish({ ok: true, editorDifficulty: true, editorSupport: true, changeDifficulty: true, saveAndReloadDifficulty: true,
        enemyStaff: true, brokenStaff: true, enemyAntidote: true, alliedRestore: true, awakenedAiActs: true, alliedPotion: true, alliedHealsPlayer: true, staffExp: true, errors });
    } catch (error) { clearTimeout(watchdog); finish({ ok: false, error: error.stack, errors }); }
  });
};
