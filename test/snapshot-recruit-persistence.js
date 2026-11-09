'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('node:assert/strict');
const { app } = require('electron'), io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], result = {}, wait = ms => new Promise(r => setTimeout(r, ms));
  const finish = () => { clearTimeout(watchdog); result.errors = errors; result.ok = !errors.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(result.ok ? 0 : 1); };
  const watchdog = setTimeout(() => { errors.push('Délai global dépassé'); finish(); }, 120000);
  editor.webContents.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-recruit-keep-')), 'Jeu');
      const p = io.createProject(dir, 'Recrues permanentes', 'sample', path.join(__dirname, '..', 'assets')), ch = p.db.chapters[0];
      p.meta.avatar = { enabled: false }; p.meta.lobby.enabled = true;
      p.meta.lobby.heroId = 'c_eliwood'; p.meta.lobby.initialRoster = ['c_lyn', 'c_hector']; p.meta.lobby.spots = [];
      p.db.talks = []; for (const unit of p.db.units) delete unit.recruitAfter;
      p.db.units.find(u => u.id === 'c_matthew').inventory = [{ id: 'w_iron_sword', uses: 7 }];
      p.db.units.find(u => u.id === 'c_serra').inventory = [{ id: 'w_heal', uses: 11 }];
      Object.assign(ch, { name: 'Recrutement', players: [{ unitId: 'c_lyn', x: 4, y: 13 }, { unitId: 'c_hector', x: 6, y: 13 }],
        objective: { type: 'survive', turns: 99 }, requiredUnits: [], extraObjectives: [], events: [], villages: [], chests: [], doors: [], final: false,
        deployment: { slots: [{ x: 5, y: 13 }, { x: 3, y: 13 }] },
        allies: [{ id: 'serra', unitId: 'c_serra', x: 7, y: 13, control: 'ai', talk: { enabled: true, with: [] } }],
        enemies: [{ id: 'recruit', name: 'Voleur masqué', classId: 'brigand', level: 1, x: 4, y: 12, ai: 'stationary', talk: { enabled: true, with: ['c_lyn'], joinAs: 'c_matthew' } }] });
      const next = JSON.parse(JSON.stringify(ch)); next.id = 'recruit_next'; next.name = 'Après le recrutement'; next.enemies = [];
      ch.next = next.id; p.db.chapters = [ch, next];
      p.db.arcs = [{ id: 'recruit_arc', name: 'Deux actes', kind: 'story', acts: [ch.id, next.id] }];
      p.meta.startChapter = ch.id; io.saveProject(dir, p);
      const open = async choice => {
        const win = openPlaytest(dir, ''), wc = win.webContents; wc.setBackgroundThrottling(false); win.setSize(1200, 850);
        wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
        await new Promise(r => wc.once('did-finish-load', r));
        const js = code => wc.executeJavaScript(code, true);
        const until = async code => { const end = Date.now() + 25000; while (Date.now() < end) { if (await js(code)) return; await wait(80); } throw new Error('Délai : ' + code); };
        const click = (selector, text = '') => js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find(b => !b.disabled && b.textContent.includes(${JSON.stringify(text)})); if (!b) throw new Error('Bouton absent'); b.click(); })()`);
        await until(`!!document.querySelector('.choice-list')`); await click('.choice-list button', choice);
        await until(`PlaytestState.mode === 'lobby' && !PlaytestState.busy`);
        return { win, wc, js, until, click };
      };
      const depart = async game => {
        await game.js(`PlaytestLobby.openMenu(); PlaytestState.menu.items.find(i => i.label === PlaytestLobby.state.cfg.board.label).action()`);
        await game.click('#lobby-panel .lp-go', 'Partir');
        await game.until(`!!document.querySelector('.modal-back')`); await game.click('.modal-actions button', 'Partir');
        await game.until(`PlaytestState.mode === 'preparation'`);
      };
      const shot = async (game, name) => { await game.wc.capturePage(); await wait(200); fs.writeFileSync(path.join(out, name + '.png'), (await game.wc.capturePage()).toPNG()); };
      const game = await open('Classique');
      assert.deepEqual(await game.js(`PlaytestState.campaign.recruited`), ['c_lyn', 'c_hector']);
      await depart(game);
      assert.deepEqual(await game.js(`PlaytestPreparation.plan().map(p => p.unitId)`), ['c_lyn', 'c_hector']);
      assert.equal(await game.js(`document.querySelectorAll('[data-deploy-slot]').length`), 4);
      await shot(game, 'a_deux_persos_quatre_cases');
      await game.click('[data-deploy-start]'); await game.until(`!PlaytestState.busy && PlaytestState.mode === 'chapter'`);
      const talk = async id => {
        await game.js(`(() => { const u = PlaytestState.units.find(u => u.sourceId === ${JSON.stringify(id)}); PlaytestState.ui = 'idle'; PlaytestState.sel = null; PlaytestState.cursor = { x: u.x, y: u.y }; document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); document.querySelector('#game').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); })()`);
        await game.until(`PlaytestState.ui === 'menu' && !PlaytestState.busy`);
        await game.js(`void PlaytestState.menu.items.find(i => i.label === 'Parler').action()`);
        await game.until(`(PlaytestState.dialogue && PlaytestState.dialogue.skip(), !PlaytestState.busy && PlaytestState.ui === 'idle')`);
      };
      await talk('c_lyn'); await talk('c_hector');
      assert.equal(await game.js(`PlaytestState.campaign.units.c_matthew.inventory[0].uses`), 7, 'inventaire mémorisé dès le recrutement');
      assert.equal(await game.js(`PlaytestState.campaign.units.c_serra.inventory[0].uses`), 11);
      await game.js(`PlaytestState.units.find(u => u.sourceId === 'c_matthew').inventory[0].uses = 3; PlaytestState.units.find(u => u.sourceId === 'c_serra').inventory[0].uses = 9; PlaytestState.turn = 100; void PlaytestDebug.checkEnd()`);
      await game.until(`!!document.querySelector('#end button')`); await game.click('#end button', 'Retour au camp');
      await game.until(`PlaytestState.mode === 'lobby' && !PlaytestState.busy`);
      const recruited = ['c_lyn', 'c_hector', 'c_matthew', 'c_serra'];
      assert.deepEqual(await game.js(`PlaytestLobby.state.members.map(u => u.sourceId)`), recruited);
      assert.equal(await game.js(`PlaytestLobby.state.members.find(u => u.sourceId === 'c_matthew').inventory[0].uses`), 3);
      await game.js(`PlaytestLobby.openTeam()`); await shot(game, 'b_recrues_au_camp'); await game.js(`PlaytestLobby.closePanel()`);
      await game.js(`PlaytestDebug.saveSlot(1)`); game.win.close();
      const resumed = await open('Continuer');
      assert.deepEqual(await resumed.js(`PlaytestState.campaign.recruited`), recruited, 'recrues conservées après rechargement');
      assert.equal(await resumed.js(`PlaytestLobby.state.members.find(u => u.sourceId === 'c_serra').inventory[0].uses`), 9);
      await depart(resumed);
      assert.equal(await resumed.js(`PlaytestState.chapter.id`), next.id);
      assert.deepEqual(await resumed.js(`PlaytestPreparation.plan().map(p => p.unitId)`), recruited);
      assert.equal(await resumed.js(`PlaytestState.chapter.allies.length`), 0, 'Serra ne redevient pas une alliée verte exclue des préparatifs');
      await shot(resumed, 'c_quatre_recrues_map_suivante'); await resumed.click('[data-deploy-start]');
      await resumed.until(`!PlaytestState.busy && PlaytestState.mode === 'chapter'`);
      assert.deepEqual(await resumed.js(`PlaytestState.units.filter(u => u.team === 'player').map(u => u.sourceId)`), recruited);
      assert.equal(await resumed.js(`PlaytestState.units.find(u => u.sourceId === 'c_matthew').inventory[0].uses`), 3);
      assert.equal(await resumed.js(`PlaytestState.units.filter(u => u.sourceId === 'c_serra').length`), 1);
      result.effectifConserve = true; result.inventairesConserves = true; result.reprise = true; result.mapSuivante = true; result.aucunEliwoodAjoute = true;
    } catch (e) { errors.push(e.stack || String(e)); }
    finish();
  });
};
