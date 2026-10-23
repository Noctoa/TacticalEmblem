'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict');
const { app } = require('electron'), io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], delay = ms => new Promise(r => setTimeout(r, ms));
  const js = (wc, code) => { fs.writeFileSync(path.join(out, 'progress.json'), JSON.stringify({ code, errors })); return wc.executeJavaScript(code, true); };
  const finish = value => { fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(value, null, 2)); app.exit(value.ok ? 0 : 1); };
  const watchdog = setTimeout(() => finish({ ok: false, error: 'Délai global dépassé', errors }), 180000);
  const until = async (wc, code) => { const end = Date.now() + 30000; while (Date.now() < end) { if (await js(wc, code)) return; await wc.capturePage(); await delay(70); } throw new Error('Délai dépassé : ' + code); };
  const click = (wc, selector, text = '') => js(wc, `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find(el => el.textContent.includes(${JSON.stringify(text)})); if (!b) throw new Error('Bouton absent : ' + ${JSON.stringify(text)}); b.click(); })()`);
  const key = (wc, value) => js(wc, `document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(value)}, bubbles: true, cancelable: true }))`);
  const shot = async (wc, name) => { await wc.capturePage(); await delay(150); fs.writeFileSync(path.join(out, name + '.png'), (await wc.capturePage()).toPNG()); };
  const watch = wc => { wc.setBackgroundThrottling(false); wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); }); };
  editor.webContents.once('did-finish-load', async () => {
    try {
      editor.setSize(1440, 900); const ew = editor.webContents; watch(ew);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'te-weather-ui-')), 'Jeu');
      const p = io.createProject(dir, 'Les brumes de Varenne', 'sample', path.join(__dirname, '..', 'assets'));
      const ch = p.db.chapters[0], pos = ch.players.find(pl => pl.unitId === 'c_eliwood') || ch.players[0], map = p.maps.find(m => m.id === ch.mapId);
      const foePos = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: pos.x + dx, y: pos.y + dy }))
        .find(q => q.x >= 0 && q.y >= 0 && q.x < map.width && q.y < map.height && !ch.players.some(pl => pl.x === q.x && pl.y === q.y));
      Object.assign(ch, { objective: { type: 'survive', turns: 99 }, villages: [], allies: [], events: [
        { id: 'storm', trigger: { type: 'turn', turn: 2 }, once: true, actions: [{ type: 'dialogue', text: '' }] },
        { id: 'clear', trigger: { type: 'turn', turn: 3 }, once: true, actions: [{ type: 'weather', weather: { type: 'none' } }] }
      ], final: false });
      ch.enemies = [{ id: 'guard', name: 'Gardien', classId: 'brigand', level: 1, ...foePos,
        ai: 'stationary', inventory: [{ id: 'w_iron_axe', uses: 20 }], statBonus: { hp: 100, def: 20 } }];
      p.meta.lobby.enabled = false; p.meta.startChapter = ch.id; p.meta.settings.battleAnims = true;
      io.saveProject(dir, p); await js(ew, `Editor.open(${JSON.stringify(dir)})`);
      await js(ew, `Editor.selectChapter(${JSON.stringify(ch.id)}); Editor.state.mode = 'units'; Editor.refresh()`);
      const field = (selector, label, value) => js(ew, `(() => { const box = document.querySelector(${JSON.stringify(selector)}); const l = [...box.querySelectorAll('.field-label')].find(el => el.textContent === ${JSON.stringify(label)}); if (!l) throw new Error('Champ absent : ' + ${JSON.stringify(label)}); const input = l.parentElement.querySelector('input,select'); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      await field('[data-weather-fields]', 'Météo', 'fog');
      await field('[data-weather-fields]', 'Intensité', '3'); await field('[data-weather-fields]', 'Direction du vent', 'left');
      assert.deepEqual(await js(ew, `Editor.db().chapters[0].weather`), { type: 'fog', intensity: 3, direction: 'left', tactical: false });
      await js(ew, `document.querySelector('[data-weather-fields]').scrollIntoView({ block: 'center' })`);
      await shot(ew, 'editor-fog');
      await js(ew, `DBEditor.open('chapters', ${JSON.stringify(ch.id)})`);
      await field('[data-weather-fields]', 'Météo', 'sand'); await field('[data-weather-fields]', 'Intensité', '2');
      await field('[data-weather-fields]', 'Direction du vent', 'right');
      await js(ew, `(() => { const s = document.querySelector('[data-event-id="storm"] [data-action-type]'); s.value = 'weather'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      const action = '[data-event-id="storm"] [data-event-action="0"]';
      await field(action, 'Météo', 'snow'); await field(action, 'Intensité (1 légère, 2 modérée, 3 forte)', '3');
      await field(action, 'Direction du vent', 'left');
      await js(ew, `document.querySelector('[data-event-id="storm"]').scrollIntoView({ block: 'center' })`); await shot(ew, 'editor-event');
      await js(ew, `DBEditor.close(); tf.saveProject(Editor.dir(), Editor.project())`);
      const disk = io.loadProject(dir); assert.equal(disk.db.chapters[0].weather.type, 'sand'); assert.equal(disk.db.chapters[0].events[0].actions[0].weather.type, 'snow');
      const win = openPlaytest(dir, ''), wc = win.webContents; watch(wc); await new Promise(r => wc.once('did-finish-load', r));
      await until(wc, `!!document.querySelector('.choice-list')`); await click(wc, '.choice-list button', 'Classique');
      const begin = async () => { await until(wc, `PlaytestState.mode === 'preparation'`); await click(wc, '[data-deploy-start]'); await until(wc, `PlaytestState.mode === 'chapter' && !PlaytestState.busy`); await js(wc, `PlaytestState.fast = true; PlaytestState.debug.passive = true`); };
      await begin();
      // Le rendu ne consomme aucun tirage de combat ; il s'anime et restaure son contexte.
      assert.equal(await js(wc, `(() => {
        const c = document.createElement('canvas'); c.width = 400; c.height = 240; const g = c.getContext('2d');
        const old = Math.random; Math.random = () => { throw new Error('La météo consomme le hasard du combat'); };
        try { for (const type of ['fog', 'sand', 'snow']) {
          g.clearRect(0, 0, 400, 240); g.globalAlpha = .8; g.fillStyle = '#ff0000';
          WeatherFX.draw(g, { type, intensity: 3 }, { x: 30, y: 20, width: 340, height: 200 }, 1000);
          if (g.globalAlpha < .799 || g.fillStyle !== '#ff0000' || g.getImageData(0, 0, 1, 1).data[3]) throw new Error('Contexte ou découpage altéré');
          const first = g.getImageData(0, 0, 400, 240).data; g.clearRect(0, 0, 400, 240);
          WeatherFX.draw(g, { type, intensity: 3 }, { x: 30, y: 20, width: 340, height: 200 }, 2500);
          if (g.getImageData(0, 0, 400, 240).data.every((channel, i) => channel === first[i])) throw new Error('Effet non animé');
        } return true; } finally { Math.random = old; }
      })()`), true);
      const before = await js(wc, 'JSON.stringify(PlaytestState.units)');
      for (const type of ['fog', 'sand', 'snow']) {
        await js(wc, `PlaytestState.weather = { type: ${JSON.stringify(type)}, intensity: 3, direction: 'right' }`);
        await shot(wc, 'map-' + type);
      }
      assert.equal(await js(wc, 'JSON.stringify(PlaytestState.units)'), before);
      await js(wc, `PlaytestSettings.open('game'); document.querySelector('[data-weather-effects]').click(); PlaytestSettings.close(); PlaytestDebug.saveSlot(1)`);
      assert.equal(await js(wc, 'PlaytestState.settings.weatherEffects'), false);
      const save = await js(wc, `tf.loadCampaign(new URLSearchParams(location.search).get('dir'), 1)`); assert.equal(save.weatherEffects, false);
      await js(wc, `PlaytestState.settings.weatherEffects = true; PlaytestSettings.open('load')`);
      await click(wc, '.sv-row button'); await until(wc, `!!document.querySelector('.modal-back')`); await click(wc, '.modal-actions button', 'Charger'); await begin();
      assert.equal(await js(wc, 'PlaytestState.settings.weatherEffects'), false);
      assert.equal(await js(wc, 'PlaytestState.weather.type'), 'sand');
      await js(wc, `PlaytestSettings.open('game'); document.querySelector('[data-weather-effects]').click(); PlaytestSettings.close()`);
      const endTurn = async turn => {
        await js(wc, `PlaytestState.cursor = { x: 0, y: 0 }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); void PlaytestState.menu.items.find(i => i.label.includes('Fin du tour')).action()`);
        await until(wc, `PlaytestState.turn === ${turn} && PlaytestState.phase === 'player' && !PlaytestState.busy`);
      };
      await endTurn(2); assert.equal(await js(wc, 'PlaytestState.weather.type'), 'snow');
      assert.equal(await js(wc, 'PlaytestState.db.chapters[0].weather.type'), 'sand');
      // Vérifie l'effet dans la vraie scène de combat, avec les textes et le HUD au premier plan.
      await js(wc, `window.weatherBattleFrames = 0; const weatherDraw = WeatherFX.draw; WeatherFX.draw = function(ctx, config, rect, t) { if (ctx.canvas.closest('#battle') && config && config.type === 'snow') weatherBattleFrames++; return weatherDraw(ctx, config, rect, t); }; true`);
      const hero = pos.unitId;
      await js(wc, `(() => { const u = PlaytestState.units.find(u => u.sourceId === ${JSON.stringify(hero)}); PlaytestState.cursor = { x: u.x, y: u.y }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); })()`);
      await until(wc, `PlaytestState.ui === 'menu' && !PlaytestState.busy`);
      await js(wc, `void PlaytestState.menu.items.find(i => i.label === 'Attaquer').action()`);
      await key(wc, 'Enter'); await until(wc, 'BattleScene.isActive()'); await delay(450); await shot(wc, 'battle-snow');
      assert.ok(await js(wc, 'weatherBattleFrames > 0'));
      await until(wc, '!BattleScene.isActive() && !PlaytestState.busy');
      await endTurn(3); assert.equal(await js(wc, 'PlaytestState.weather.type'), 'none');
      await js(wc, `PlaytestState.cursor = { x: 0, y: 0 }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); void PlaytestState.menu.items.find(i => i.label === 'Recommencer').action()`);
      await until(wc, `!!document.querySelector('.modal-back')`); await click(wc, '.modal-actions button', 'OK'); await begin();
      assert.equal(await js(wc, 'PlaytestState.weather.type'), 'sand');
      assert.deepEqual(errors, []); clearTimeout(watchdog); finish({ ok: true, editorFields: true, eventFields: true, roundtrip: true,
        allThreeEffects: true, noCombatRng: true, contextAndClipping: true, noUnitChanges: true,
        hideEffectsSaved: true, eventChange: true, eventClear: true, battleWeather: true, restart: true, errors });
    } catch (error) { clearTimeout(watchdog); finish({ ok: false, error: error.stack, errors }); }
  });
};
