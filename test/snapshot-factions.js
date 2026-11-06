/*
 * Factions : armée jaune (hostile à tous) qui joue sa phase après la phase ennemie et combat les ennemis rouges,
 * alliés génériques (classe + niveau) en IA, événements « début du tour » par faction, onglet Base de données › Factions.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-factions.js npm start
 */
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
  const result = {};
  editor.webContents.once('did-finish-load', async () => {
    try {
      editor.setSize(1440, 950); const ew = editor.webContents; watch(ew);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'te-factions-')), 'Jeu');
      const p = io.createProject(dir, 'Factions', 'sample', path.join(__dirname, '..', 'assets'));
      const ch = p.db.chapters[0], map = p.maps.find(m => m.id === ch.mapId);
      Object.assign(map, { width: 15, height: 9, terrain: Array(135).fill('plain') });
      map.layers.forEach((l, i) => l.data = Array(135).fill(i ? 0 : 18));
      Object.assign(ch, { players: [{ id: 'p1', unitId: 'c_eliwood', x: 1, y: 4 }, { id: 'p2', unitId: 'c_lyn', x: 1, y: 6 }], allies: [],
        requiredUnits: ['c_eliwood'], objective: { type: 'survive', turns: 99 }, gold: 0, orbs: 0, final: false, chests: [], doors: [], villages: [], secondaryObjectives: [],
        enemies: [
          { id: 'red', classId: 'fighter', name: 'Pillard rouge', level: 5, x: 10, y: 4, ai: 'aggressive' },
          { id: 'gold', classId: 'mercenary', name: 'Mercenaire jaune', level: 8, x: 11, y: 4, ai: 'aggressive', faction: 'yellow' },
          { id: 'green', classId: 'knight', name: 'Garde allié', level: 3, x: 3, y: 1, ai: 'aggressive', faction: 'ally', control: 'ai' },
          { id: 'wave', classId: 'soldier', name: 'Vague jaune', level: 1, x: 12, y: 7, ai: 'stationary', faction: 'yellow', eventOnly: true }],
        events: [
          { id: 'rf', trigger: { type: 'start' }, once: true, actions: [{ type: 'reinforcement', target: 'wave', count: 5 }] },
          { id: 'ey', trigger: { type: 'factionTurn', turn: 1, faction: 'yellow' }, once: true, actions: [{ type: 'flag', key: 'yellow_turn', value: true }] },
          { id: 'ee', trigger: { type: 'enemyTurn', turn: 1 }, once: true, actions: [{ type: 'flag', key: 'enemy_turn', value: true }] },
          { id: 'ea', trigger: { type: 'allyTurn', turn: 1 }, once: true, actions: [{ type: 'flag', key: 'ally_turn', value: true }] }] });
      p.meta.lobby.initialRoster = ch.players.map(u => u.unitId); p.meta.startChapter = ch.id;
      p.meta.factions = [{ id: 'yellow', name: 'Armée jaune', color: 'yellow', foes: ['player', 'ally', 'enemy'] }];
      io.saveProject(dir, p);
      // éditeur : onglet Factions, création d'une faction violette, puis suppression ; placement jaune sur la map
      await js(ew, `Editor.open(${JSON.stringify(dir)});`);
      await until(ew, `!!Editor.db()`);
      await js(ew, `DBEditor.open('factions')`);
      await until(ew, `!!document.querySelector('[data-faction="yellow"]')`);
      await click(ew, '[data-faction-new]');
      await until(ew, `!!document.querySelector('[data-faction="f_1"].on')`);
      await click(ew, '[data-faction-color="cyan"]');
      await js(ew, `(() => { const b = document.querySelector('[data-faction-foe="enemy"]'); b.checked = false; b.dispatchEvent(new Event('change')); })()`);
      const custom = await js(ew, `JSON.stringify(Editor.project().meta.factions)`);
      assert.match(custom, /"id":"f_1".*"color":"cyan"/);
      assert.equal(await js(ew, `Factions.hostile('f_1', 'enemy')`), false);
      assert.equal(await js(ew, `Factions.hostile('f_1', 'player')`), true);
      await js(ew, `(() => { const b = document.querySelector('[data-faction-foe="yellow"]'); b.checked = true; b.dispatchEvent(new Event('change')); })()`);
      assert.equal(await js(ew, `Factions.hostile('yellow', 'f_1')`), true);
      await delay(300); await shot(ew, 'a_factions');
      await click(ew, '[data-faction-new]');
      assert.equal(await js(ew, `Factions.all().length`), 6);
      assert.equal(await js(ew, `document.querySelector('[data-faction-new]').disabled`), true, '6 factions au plus');
      await click(ew, '[data-faction="f_2"]'); await click(ew, '[data-faction-delete]');
      await until(ew, `!!document.querySelector('.modal .danger')`); await click(ew, '.modal .danger');
      await until(ew, `Factions.all().length === 5`);
      await click(ew, '[data-faction="f_1"]'); await click(ew, '[data-faction-delete]');
      await until(ew, `!!document.querySelector('.modal .danger')`); await click(ew, '.modal .danger');
      await until(ew, `Factions.all().length === 4`);
      // éditeur de map : unités génériques pour l'armée jaune
      await js(ew, `DBEditor.close()`); await delay(300);
      await js(ew, `document.querySelector('[data-mode="units"]') && document.querySelector('[data-mode="units"]').click()`); await delay(300);
      const chip = await js(ew, `!!document.querySelector('[data-place-faction="yellow"]')`);
      if (chip) { await click(ew, '[data-place-faction="yellow"]'); await delay(200); await shot(ew, 'b_palette'); }
      result.palette = chip;
      await js(ew, `tf.saveProject(Editor.dir(), Editor.project())`);
      // jeu
      const start = async choice => { const win = openPlaytest(dir, ''), wc = win.webContents; watch(wc); await new Promise(r => wc.once('did-finish-load', r)); await until(wc, `!!document.querySelector('.choice-list')`); await click(wc, '.choice-list button', choice); return { win, wc }; };
      const depart = async wc => {
        await until(wc, `PlaytestState.mode === 'lobby' && !PlaytestState.busy`);
        await js(wc, `PlaytestLobby.openMenu(); PlaytestState.menu.items.find(i => i.label === PlaytestLobby.state.cfg.board.label).action()`);
        await click(wc, '#lobby-panel .lp-go'); await until(wc, `!!document.querySelector('.modal-back')`); await click(wc, '.modal-actions button', 'Partir');
        await until(wc, `PlaytestState.mode === 'preparation'`);
      };
      const { wc } = await start('Détente'); await depart(wc);
      await click(wc, '[data-deploy-start]'); await until(wc, `PlaytestState.mode === 'chapter' && !PlaytestState.busy`);
      await js(wc, `PlaytestState.debug.god = true; window.__fights = []; TacticalEmblem.on('combat:end', e => __fights.push(e.attacker.team + '>' + e.defender.team)); window.__phases = []; TacticalEmblem.on('turn:start', e => __phases.push(e.phase))`);
      result.teams = await js(wc, `PlaytestState.units.map(u => u.name + ':' + u.team + (u.placementId ? '*' : ''))`);
      result.vague = await js(wc, `PlaytestState.units.filter(u => u.sourceId === 'wave').map(u => u.x + ',' + u.y)`);
      assert.equal(result.vague.length, 5, 'renfort ×5 : ' + result.vague);
      assert.equal(new Set(result.vague).size, 5, 'cases distinctes');
      assert.ok(result.teams.includes('Mercenaire jaune:yellow*') && result.teams.includes('Garde allié:ally*'), 'équipes : ' + result.teams);
      await shot(wc, 'c_map');
      await js(wc, `PlaytestState.cursor = { x: 0, y: 0 }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))`);
      await until(wc, `!!PlaytestState.menu && PlaytestState.menu.items.some(i => i.label === 'Fin du tour')`);
      await js(wc, `void PlaytestState.menu.items.find(i => i.label === 'Fin du tour').action()`);
      await until(wc, `PlaytestState.phase === 'yellow'`);
      await delay(250); await shot(wc, 'd_phase_jaune');
      await until(wc, `PlaytestState.turn === 2 && PlaytestState.phase === 'player' && !PlaytestState.busy`);
      result.phases = await js(wc, `__phases`);
      result.fights = await js(wc, `__fights`);
      result.flags = await js(wc, `PlaytestState.campaign.scenario && PlaytestState.campaign.scenario.flags`);
      result.after = await js(wc, `PlaytestState.units.map(u => u.name + ':' + u.team + ':' + u.hp + (u.dead ? ':mort' : '') + '@' + u.x + ',' + u.y)`);
      assert.deepEqual(result.phases.slice(0, 4), ['ally', 'enemy', 'yellow', 'player']);
      assert.ok(result.fights.some(f => f === 'yellow>enemy' || f === 'enemy>yellow'), 'rouge et jaune se battent : ' + result.fights);
      assert.ok(result.flags.yellow_turn && result.flags.enemy_turn && result.flags.ally_turn, 'événements : ' + JSON.stringify(result.flags));
      await shot(wc, 'e_tour2');
      result.ok = errors.length === 0; result.errors = errors;
      finish(result);
    } catch (e) { finish({ ok: false, error: String(e && e.stack || e), errors, result }); }
  });
};
