'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict');
const { app } = require('electron'), io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], delay = ms => new Promise(r => setTimeout(r, ms));
  const js = (wc, code) => { fs.writeFileSync(path.join(out, 'progress.json'), JSON.stringify({ code, errors })); return wc.executeJavaScript(code, true); };
  const finish = value => { fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(value, null, 2)); app.exit(value.ok ? 0 : 1); };
  const watchdog = setTimeout(() => finish({ ok: false, error: 'Délai global dépassé', errors }), 180000);
  const until = async (wc, code) => { const end = Date.now() + 30000; while (Date.now() < end) { if (await js(wc, code)) return; await wc.capturePage(); await delay(60); } throw new Error('Délai dépassé : ' + code); };
  const click = (wc, selector, text = '') => js(wc, `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find(el => el.textContent.includes(${JSON.stringify(text)})); if (!b) throw new Error('Bouton absent : ' + ${JSON.stringify(text)}); b.click(); })()`);
  const key = (wc, value) => js(wc, `document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(value)}, bubbles: true, cancelable: true }))`);
  const shot = async (wc, name) => { await wc.capturePage(); await delay(150); fs.writeFileSync(path.join(out, name + '.png'), (await wc.capturePage()).toPNG()); };
  const watch = wc => { wc.setBackgroundThrottling(false); wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); }); };
  editor.webContents.once('did-finish-load', async () => {
    try {
      editor.setSize(1440, 900); const ew = editor.webContents; watch(ew);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'te-climate-ui-')), 'Jeu');
      const p = io.createProject(dir, 'Climats tactiques', 'sample', path.join(__dirname, '..', 'assets'));
      const ch = p.db.chapters[0], map = p.maps.find(m => m.id === ch.mapId);
      Object.assign(map, { width: 12, height: 6, terrain: Array(72).fill('wall') });
      map.layers.forEach((l, i) => l.data = Array(72).fill(i ? 0 : 13));
      for (let x = 0; x < 12; x++) map.terrain[24 + x] = 'plain'; map.terrain[37] = 'plain';
      const climate = type => ({ type, intensity: 3, direction: 'right', tactical: true });
      Object.assign(ch, { players: [{ id: 'p1', unitId: 'c_eliwood', x: 1, y: 2 }, { id: 'p2', unitId: 'c_lyn', x: 1, y: 3 }], allies: [], villages: [],
        weather: { ...climate('fog'), tactical: false }, objective: { type: 'survive', turns: 99 }, requiredUnits: ['c_eliwood'], final: false,
        events: ['sand', 'snow', 'fog', 'none'].map((type, i) => ({ id: 'climate_' + i, trigger: { type: 'turn', turn: i + 2 }, once: true,
          actions: [{ type: 'weather', weather: climate(type) }] })),
        enemies: [{ id: 'guard', name: 'Éclaireur caché', classId: 'brigand', level: 1, x: 5, y: 2, ai: 'stationary', inventory: [{ id: 'w_iron_axe', uses: 20 }] },
          { id: 'far', name: 'Archer lointain', classId: 'archer', level: 1, x: 9, y: 2, ai: 'stationary', inventory: [{ id: 'climate_bow', uses: 20 }] }] });
      p.db.weapons.push({ id: 'climate_bow', name: 'Arc de test', type: 'bow', might: 1, hit: 55, crit: 0, weight: 0, minRange: 1, maxRange: 8, uses: 20 });
      p.db.classes.push({ ...p.db.classes.find(c => c.id === 'lord'), id: 'climate_hybrid', name: 'Éclaireur', weapons: ['sword', 'bow'], mov: 5, moveType: 'foot', skillLearning: [], promotions: [] });
      const hero = p.db.units.find(u => u.id === 'c_eliwood'); hero.classId = 'climate_hybrid'; hero.inventory = [{ id: 'climate_bow', uses: 20 }];
      hero.personalSkill = ''; hero.learnedSkills = []; hero.equippedSkills = []; hero.skillLearning = [];
      Object.assign(hero.stats, { skl: 0, lck: 0, spd: 0 });
      p.meta.lobby.enabled = false; p.meta.startChapter = ch.id; p.meta.settings.trueHit = false; p.meta.settings.battleAnims = false;
      io.saveProject(dir, p); await js(ew, `Editor.open(${JSON.stringify(dir)})`);
      await js(ew, `DBEditor.open('chapters', ${JSON.stringify(ch.id)})`);
      await js(ew, `(() => { const label = [...document.querySelectorAll('[data-weather-fields] .checkbox')].find(l => l.textContent.includes('Activer les effets tactiques')); if (!label) throw new Error('Case climat absente'); const input = label.querySelector('input'); input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('[data-weather-fields]').scrollIntoView({ block: 'center' }); })()`);
      assert.equal(await js(ew, `Editor.db().chapters[0].weather.tactical`), true);
      await shot(ew, 'editor-climate'); await js(ew, `tf.saveProject(Editor.dir(), Editor.project())`);
      assert.equal(io.loadProject(dir).db.chapters[0].weather.tactical, true);
      const win = openPlaytest(dir, ''), wc = win.webContents; watch(wc); await new Promise(r => wc.once('did-finish-load', r));
      await until(wc, `!!document.querySelector('.choice-list')`); await click(wc, '.choice-list button', 'Classique');
      const begin = async () => {
        await until(wc, `PlaytestState.mode === 'preparation'`);
        assert.equal(await js(wc, `document.querySelector('.prep-objective').textContent.includes('0 ennemi(s) repéré(s)')`), true);
        await shot(wc, 'preparation-fog'); await click(wc, '[data-deploy-start]');
        await until(wc, `PlaytestState.mode === 'chapter' && !PlaytestState.busy`);
        await js(wc, `PlaytestState.fast = true; PlaytestState.debug.passive = true`);
      };
      await begin();
      const unit = id => `PlaytestState.units.find(u => u.sourceId === ${JSON.stringify(id)})`;
      await js(wc, `PlaytestSettings.open('game'); document.querySelector('[data-weather-effects]').click(); PlaytestSettings.close()`);
      assert.equal(await js(wc, `PlaytestState.settings.weatherEffects`), false);
      await js(wc, `PlaytestState.cursor = { x: 9, y: 2 }`); await delay(150);
      assert.equal(await js(wc, `document.querySelector('#unit-win').textContent.includes('Archer lointain')`), false);
      await key(wc, 'r'); assert.equal(await js(wc, `!!document.querySelector('#unit-sheet')`), false);
      await js(wc, `document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))`);
      assert.equal(await js(wc, `PlaytestState.enemyView`), null); await key(wc, 'x');
      await key(wc, 'd'); assert.equal(await js(wc, `PlaytestState.dangerSet.size`), 0);
      const select = async id => {
        await js(wc, `(() => { const u = ${unit(id)}; PlaytestState.cursor = { x: u.x, y: u.y }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); })()`);
        await until(wc, `PlaytestState.ui === 'moving'`);
      };
      const menu = async id => {
        await select(id); await js(wc, `document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))`);
        await until(wc, `PlaytestState.ui === 'menu' && !PlaytestState.busy`);
      };
      const action = label => js(wc, `void PlaytestState.menu.items.find(i => i.label === ${JSON.stringify(label)}).action()`);
      await menu('c_eliwood'); assert.equal(await js(wc, `PlaytestState.menu.items.some(i => i.label === 'Attaquer')`), false);
      await key(wc, 'x'); assert.equal(await js(wc, `PlaytestState.reach.has('6,2')`), true);
      await js(wc, `PlaytestState.cursor = { x: 6, y: 2 }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))`);
      await until(wc, `PlaytestState.ui === 'menu' && !PlaytestState.busy`);
      assert.equal(await js(wc, `${unit('c_eliwood')}.x`), 4); assert.equal(await js(wc, `${unit('c_eliwood')}.fogMoved`), true);
      assert.equal(await js(wc, `PlaytestState.menu.items.some(i => i.label === 'Attaquer')`), true);
      await key(wc, 'x'); assert.equal(await js(wc, `${unit('c_eliwood')}.x`), 4);
      await shot(wc, 'fog-discovery');
      await js(wc, `Object.assign(${unit('guard')}.stats, { spd: 0, lck: 0, skl: 0 }); ${unit('c_eliwood')}.stats.def = 99`);
      await js(wc, `const climateForecast = Rules.forecast; Rules.forecast = (...args) => {
        window.climateLastForecast = climateForecast(...args);
        window.climateClearHit = climateForecast(args[0], args[1], args[2], { ...args[3], weather: { type: 'none' } }).att.hit;
        return climateLastForecast;
      }; true`);
      await action('Attaquer');
      assert.equal(await js(wc, `document.querySelector('[data-climate-avoid]').textContent.includes('esquive +15')`), true);
      assert.equal(await js(wc, `Number(document.querySelector('#forecast .fc-side.p .fc-val > div:nth-child(3)').textContent)`), await js(wc, 'climateClearHit - 15'));
      await shot(wc, 'fog-forecast');
      await js(wc, `const climateResolve = Rules.resolveCombat; Rules.resolveCombat = (...args) => { const result = climateResolve(...args); window.climateCombat = result; return result; }; window.climateRandom = Math.random; Math.random = () => .5; true`);
      await key(wc, 'Enter'); await until(wc, `!PlaytestState.busy && PlaytestState.ui === 'idle'`);
      assert.equal(await js(wc, `climateCombat.forecast.att.hit`), await js(wc, 'climateLastForecast.att.hit')); assert.equal(await js(wc, `climateCombat.strikes[0].hit`), false);
      await js(wc, `Math.random = climateRandom; true`);
      await js(wc, `PlaytestState.cursor = { x: 5, y: 2 }`); await key(wc, 'r');
      assert.equal(await js(wc, `!!document.querySelector('#unit-sheet')`), true);
      await key(wc, 'ArrowDown');
      assert.equal(await js(wc, `document.querySelector('#unit-sheet').textContent.includes('Archer lointain')`), false);
      await key(wc, 'x'); await until(wc, '!PlaytestState.sheetOpen');
      const endTurn = async turn => {
        await js(wc, `PlaytestState.cursor = { x: 0, y: 0 }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); void PlaytestState.menu.items.find(i => i.label.includes('Fin du tour')).action()`);
        await until(wc, `PlaytestState.turn === ${turn} && PlaytestState.phase === 'player' && !PlaytestState.busy`);
      };
      await endTurn(2); assert.equal(await js(wc, `PlaytestState.weather.type`), 'sand');
      await js(wc, `PlaytestState.cursor = { x: 9, y: 2 }`); await delay(150);
      assert.equal(await js(wc, `document.querySelector('#unit-win').textContent.includes('Archer lointain')`), false);
      await select('c_eliwood'); assert.equal(await js(wc, `PlaytestState.reach.has('2,2')`), true); assert.equal(await js(wc, `PlaytestState.reach.has('1,2')`), false);
      await shot(wc, 'sand-movement'); await js(wc, `document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))`);
      await until(wc, `PlaytestState.ui === 'menu' && !PlaytestState.busy`); await action('Attaquer');
      assert.equal(await js(wc, `PlaytestState.targets.some(t => t.sourceId === 'far')`), false);
      assert.equal(await js(wc, `!!document.querySelector('[data-climate-avoid]')`), false);
      assert.equal(await js(wc, `Number(document.querySelector('#forecast .fc-side.p .fc-val > div:nth-child(3)').textContent)`), await js(wc, 'climateClearHit'));
      await key(wc, 'x'); await action('Attendre');
      await endTurn(3); assert.equal(await js(wc, `PlaytestState.weather.type`), 'snow');
      await select('c_eliwood'); assert.equal(await js(wc, `PlaytestState.reach.has('2,2')`), true); assert.equal(await js(wc, `PlaytestState.reach.has('1,2')`), false);
      await shot(wc, 'snow-movement'); await key(wc, 'x');
      await endTurn(4); assert.equal(await js(wc, `PlaytestState.weather.type`), 'fog');
      await js(wc, `PlaytestState.cursor = { x: 9, y: 2 }`); await delay(160);
      assert.equal(await js(wc, `document.querySelector('#unit-win').textContent.includes('Archer lointain')`), false);
      await endTurn(5); assert.equal(await js(wc, `PlaytestState.weather.type`), 'none');
      await js(wc, `PlaytestDebug.saveSlot(1);`);
      const save = await js(wc, `tf.loadCampaign(new URLSearchParams(location.search).get('dir'), 1)`); assert.equal(save.weatherEffects, false);
      await js(wc, `PlaytestSettings.open('load')`); await click(wc, '.sv-row button');
      await until(wc, `!!document.querySelector('.modal-back')`); await click(wc, '.modal-actions button', 'Charger'); await begin();
      assert.equal(await js(wc, `PlaytestState.weather.type`), 'fog'); assert.equal(await js(wc, `${unit('c_eliwood')}.x`), 1);
      assert.equal(await js(wc, `PlaytestState.settings.weatherEffects`), false);
      assert.deepEqual(errors, []); clearTimeout(watchdog); finish({ ok: true, editorActivation: true, roundtrip: true, preparationHidesEnemies: true,
        hiddenInfo: true, hiddenTarget: true, hiddenDanger: true, noMovementLeak: true, collision: true, scoutingCommitsMovement: true,
        fogForecast: true, fogResolution: true, sandVisionAndMovement: true, sandAccuracyUnchanged: true, snowReach: true,
        fogReturns: true, clearWeather: true, effectsIndependentOfAnimation: true, reload: true, errors });
    } catch (error) { clearTimeout(watchdog); finish({ ok: false, error: error.stack, errors }); }
  });
};
