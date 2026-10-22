'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict');
const { app } = require('electron'), io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], delay = ms => new Promise(r => setTimeout(r, ms));
  const js = (wc, code) => { fs.writeFileSync(path.join(out, 'progress.json'), JSON.stringify({ code, errors })); return wc.executeJavaScript(code, true); };
  const finish = value => { fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(value, null, 2)); app.exit(value.ok ? 0 : 1); };
  const watchdog = setTimeout(() => finish({ ok: false, error: 'Délai global dépassé', errors }), 180000);
  const until = async (wc, code) => { const end = Date.now() + 30000; while (Date.now() < end) { if (await js(wc, code)) return; await wc.capturePage(); await delay(70); } throw new Error('Délai dépassé : ' + code + '\n' + await js(wc, 'document.body.innerText.slice(-1800)')); };
  const click = (wc, selector, text = '') => js(wc, `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find(el => el.textContent.includes(${JSON.stringify(text)})); if (!b) throw new Error('Bouton absent : ' + ${JSON.stringify(text)}); b.click(); })()`);
  const key = (wc, value) => js(wc, `document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(value)}, bubbles: true, cancelable: true }))`);
  const shot = async (wc, name) => { await wc.capturePage(); await delay(150); fs.writeFileSync(path.join(out, name + '.png'), (await wc.capturePage()).toPNG()); };
  const watch = wc => { wc.setBackgroundThrottling(false); wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); }); };
  editor.webContents.once('did-finish-load', async () => {
    try {
      editor.setSize(1440, 900); const ew = editor.webContents; watch(ew);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'te-status-ui-')), 'Jeu'), p = io.createProject(dir, 'Altérations', 'sample', path.join(__dirname, '..', 'assets'));
      const ch = p.db.chapters[0], map = p.maps.find(m => m.id === ch.mapId);
      Object.assign(map, { width: 10, height: 7, terrain: Array(70).fill('plain') }); map.layers.forEach((l, i) => l.data = Array(70).fill(i ? 0 : 1));
      Object.assign(ch, { players: [{ id: 'p1', unitId: 'c_eliwood', x: 2, y: 2 }, { id: 'p2', unitId: 'c_lyn', x: 1, y: 2 }, { id: 'p3', unitId: 'c_hector', x: 2, y: 3 }, { id: 'p4', unitId: 'c_serra', x: 1, y: 3 }],
        objective: { type: 'survive', turns: 99 }, requiredUnits: ['c_eliwood'], villages: [], allies: [], events: [{ id: 'initial_status', trigger: { type: 'start' }, once: true, actions: [
          { type: 'status', target: 'unit:c_eliwood', statusId: 'poison', turns: 3, remove: false },
          { type: 'status', target: 'unit:c_lyn', statusId: 'silence', turns: 1, remove: false },
          { type: 'status', target: 'unit:c_hector', statusId: 'sleep', turns: 1, remove: false }
        ] }], gold: 0, orbs: 0, final: false });
      ch.enemies = [{ id: 'guard', name: 'Gardien', classId: 'brigand', level: 1, x: 3, y: 2, ai: 'stationary', isBoss: true, inventory: [{ id: 'w_iron_axe', uses: 30 }], statBonus: { hp: 120, def: 10, lck: 0 } }];
      p.meta.lobby.enabled = false; p.meta.settings.battleAnims = true; p.meta.startChapter = ch.id;
      p.db.classes.push({ ...p.db.classes.find(c => c.id === 'mage'), id: 'status_hybrid', name: 'Mage épéiste', weapons: ['sword', 'anima', 'staff'], promotions: [] });
      p.db.units.find(u => u.id === 'c_lyn').classId = 'status_hybrid';
      io.saveProject(dir, p); await js(ew, `Editor.open(${JSON.stringify(dir)})`);
      for (const tab of ['weapons', 'items', 'skills']) { await js(ew, `DBEditor.open(${JSON.stringify(tab)})`); await click(ew, `[data-add-status-examples="${tab}"]`); }
      await js(ew, `DBEditor.open('weapons', 'w_status_poison_sword')`);
      const field = (label, value) => js(ew, `(() => { const label = [...document.querySelectorAll('.db-form .field-label'), ...document.querySelectorAll('.db-form .checkbox')].find(el => el.textContent === ${JSON.stringify(label)} || el.textContent === ${JSON.stringify(label)} + '?'); if (!label) throw new Error('Champ absent : ' + ${JSON.stringify(label)}); const input = label.matches('.checkbox') ? label.querySelector('input') : label.parentElement.querySelector('input,textarea,select'); ${typeof value === 'boolean' ? `input.checked = ${value};` : `input.value = ${JSON.stringify(value)};`} input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      await field('Chance après un coup réussi (%)', '100'); await field('Durée (phases de la cible)', '3'); await shot(ew, 'editor-weapon');
      await js(ew, `DBEditor.open('skills', 'skill_status_sleep')`); await field('Chance de déclenchement (%)', '100'); await field('Durée (phases de la cible)', '3'); await shot(ew, 'editor-skill');
      await js(ew, `(() => { const db = Editor.db(); db.weapons.find(w => w.id === 'w_status_poison_sword').hit = 200;
        const a = db.units.find(u => u.id === 'c_eliwood'); a.inventory = [{ id: 'w_status_poison_sword', uses: 30 }, { id: 'i_status_antidote', uses: 3 }]; a.learnedSkills = ['skill_status_sleep']; a.equippedSkills = ['skill_status_sleep'];
        db.units.find(u => u.id === 'c_lyn').inventory = [{ id: 'w_fire', uses: 40 }, { id: 'w_iron_sword', uses: 40 }, { id: 'w_heal', uses: 20 }, { id: 'i_status_remedy', uses: 1 }];
        db.units.find(u => u.id === 'c_serra').inventory = [{ id: 'w_heal', uses: 20 }, { id: 'w_status_restore', uses: 10 }]; })()`);
      await js(ew, `tf.saveProject(Editor.dir(), Editor.project())`); const disk = io.loadProject(dir); assert.equal(disk.db.skills.find(s => s.id === 'skill_status_sleep').chance, 100); assert.equal(disk.db.weapons.find(w => w.id === 'w_status_poison_sword').inflict.turns, 3);
      const win = openPlaytest(dir, ''), wc = win.webContents; watch(wc); await new Promise(r => wc.once('did-finish-load', r)); await until(wc, `!!document.querySelector('.choice-list')`); await click(wc, '.choice-list button', 'Classique');
      const begin = async () => { await until(wc, `PlaytestState.mode === 'preparation'`); await click(wc, '[data-deploy-start]'); await until(wc, `PlaytestState.mode === 'chapter' && !PlaytestState.busy`); await js(wc, `PlaytestState.debug.passive = true; PlaytestState.fast = true`); };
      await begin();
      const unit = id => `PlaytestState.units.find(u => u.sourceId === ${JSON.stringify(id)})`;
      const menu = async id => { await js(wc, `(() => { const u = ${unit(id)}; PlaytestState.cursor = { x: u.x, y: u.y }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); })()`); await until(wc, `PlaytestState.ui === 'menu' && !PlaytestState.busy`); };
      const action = label => js(wc, `void PlaytestState.menu.items.find(i => i.label === ${JSON.stringify(label)}).action()`);
      assert.equal(await js(wc, `${unit('c_eliwood')}.hp`), await js(wc, `${unit('c_eliwood')}.stats.hp - Math.ceil(${unit('c_eliwood')}.stats.hp / 10)`));
      await js(wc, `PlaytestState.cursor = { x: 2, y: 3 }`); await delay(180); await shot(wc, 'sleeping-unit'); assert.equal(await js(wc, `!!document.querySelector('[data-unit-status="sleep"]')`), true);
      await key(wc, 'Enter'); assert.notEqual(await js(wc, `PlaytestState.ui`), 'moving'); await key(wc, 'x');
      await menu('c_eliwood'); await action('Objet'); await action('Antidote'); await until(wc, `PlaytestState.ui === 'idle' && !PlaytestState.busy`);
      assert.equal(await js(wc, `Statuses.active(${unit('c_eliwood')}, 'poison')`), false); assert.equal(await js(wc, `${unit('c_eliwood')}.inventory.find(i => i.id === 'i_status_antidote').uses`), 2);
      await menu('c_lyn'); assert.equal(await js(wc, `Rules.equipped(${unit('c_lyn')}, PlaytestState.db).weapon.id`), 'w_iron_sword'); assert.equal(await js(wc, `Rules.staves(${unit('c_lyn')}, PlaytestState.db).length`), 0);
      await action('Objet'); await action('Remède universel'); await until(wc, `PlaytestState.ui === 'idle' && !PlaytestState.busy`); assert.equal(await js(wc, `Statuses.active(${unit('c_lyn')}, 'silence')`), false);
      await js(wc, `${unit('c_hector')}.hp--`);
      await menu('c_serra'); await action('Bâton'); await js(wc, `PlaytestState.cursor = { x: 2, y: 3 }`); await key(wc, 'Enter'); await until(wc, `PlaytestState.ui === 'items' && !!PlaytestState.menu`);
      assert.equal(await js(wc, `PlaytestState.menu.items.length`), 2); await action('Rétablissement'); await until(wc, `PlaytestState.ui === 'idle' && !PlaytestState.busy`);
      assert.equal(await js(wc, `Statuses.canAct(${unit('c_hector')})`), true); assert.equal(await js(wc, `${unit('c_hector')}.done`), false); assert.equal(await js(wc, `${unit('c_serra')}.inventory.find(s => s.id === 'w_status_restore').uses`), 9);
      await menu('c_hector'); await action('Attendre'); await until(wc, `PlaytestState.turn === 2 && PlaytestState.phase === 'player' && !PlaytestState.busy`);
      const combat = async animated => {
        await js(wc, `PlaytestState.settings.battleAnims = ${animated}`); await menu('c_eliwood'); await action('Attaquer');
        assert.equal(await js(wc, `document.querySelector('#forecast').textContent.includes('Sommeil 100 %')`), true);
        const hp = await js(wc, `${unit('c_eliwood')}.hp`); await shot(wc, animated ? 'forecast' : 'forecast-map'); await key(wc, 'Enter');
        if (animated) { await until(wc, `BattleScene.isActive()`); await shot(wc, 'animated'); }
        await until(wc, `PlaytestState.ui === 'idle' && !PlaytestState.busy`);
        assert.equal(await js(wc, `${unit('c_eliwood')}.hp`), hp); assert.equal(await js(wc, `Statuses.active(${unit('guard')}, 'sleep') && Statuses.active(${unit('guard')}, 'poison')`), true);
        assert.equal(await js(wc, `Rules.threatTiles(${unit('guard')}, { width: 10, height: 7, terrainAt: () => null, unitAt: () => null }, PlaytestState.db).size`), 0);
      };
      await combat(true);
      const afterCombat = await js(wc, `${unit('guard')}.hp`), poisonDamage = await js(wc, `Math.ceil(${unit('guard')}.stats.hp / 10)`);
      const endTurn = async expected => { await js(wc, `PlaytestState.cursor = { x: 0, y: 0 }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); void PlaytestState.menu.items.find(i => i.label.includes('Fin du tour')).action()`); await until(wc, `PlaytestState.turn === ${expected} && PlaytestState.phase === 'player' && !PlaytestState.busy`); };
      await endTurn(3); assert.equal(await js(wc, `${unit('guard')}.hp`), afterCombat - poisonDamage); assert.equal(await js(wc, `${unit('guard')}.statuses.sleep.turns`), 2);
      await endTurn(4); await endTurn(5); assert.equal(await js(wc, `Statuses.list(${unit('guard')}).length`), 0); assert.equal(await js(wc, `${unit('guard')}.hp`), afterCombat - poisonDamage * 3);
      await js(wc, `PlaytestDebug.saveSlot(1)`); const save = await js(wc, `tf.loadCampaign(new URLSearchParams(location.search).get('dir'), 1)`); assert.ok(Object.values(save.campaign.units).every(u => u.statuses === undefined));
      await js(wc, `PlaytestState.cursor = { x: 0, y: 0 }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); void PlaytestState.menu.items.find(i => i.label === 'Recommencer').action()`); await until(wc, `!!document.querySelector('.modal-back')`); await click(wc, '.modal-actions button', 'OK'); await begin();
      assert.equal(await js(wc, `${unit('c_eliwood')}.inventory.find(i => i.id === 'i_status_antidote').uses`), 3); await combat(false); await js(wc, `PlaytestState.cursor = { x: 3, y: 2 }`); await delay(180); await shot(wc, 'map-statuses');
      assert.deepEqual(errors, []); clearTimeout(watchdog); finish({ ok: true, editorExamples: true, editorWeaponAndSkill: true, eventApplication: true, poisonTick: true, sleepBlocksAction: true, silenceBlocksMagic: true, antidote: true, universalRemedy: true, restoreStaff: true, curePreservesAction: true, forecast: true, animatedCombat: true, mapCombat: true, riposteInterrupted: true, phaseDurations: true, expiry: true, restart: true, checkpoint: true, errors });
    } catch (error) { clearTimeout(watchdog); finish({ ok: false, error: error.stack, errors }); }
  });
};
