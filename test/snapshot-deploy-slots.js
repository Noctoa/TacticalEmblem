/*
 * Déploiement : cases de départ libres posées dans l'éditeur (F3 › Case de départ) et limite d'unités indépendante des
 * personnages placés ; en jeu, les préparatifs proposent ces cases et les autres recrues complètent l'équipe.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-deploy-slots.js npm start
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { app } = require('electron'), io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], result = {}, wait = ms => new Promise(r => setTimeout(r, ms));
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const finish = () => { result.errors = errors; result.ok = !errors.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errors.push('délai global dépassé'); finish(); }, 120000);
  const mk = (wc) => ({ js: c => wc.executeJavaScript(c, true),
    until: async (c, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await wc.executeJavaScript(c, true)) return; await wait(80); } throw new Error('Délai : ' + c); },
    shot: async n => { await wc.capturePage(); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); } });
  const ewc = editor.webContents; ewc.setBackgroundThrottling(false);
  ewc.on('console-message', (e, level, message) => { if (level >= 3) errors.push('[éditeur] ' + message); });
  ewc.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-slots-')), 'Jeu');
      const p = io.createProject(dir, 'Cases', 'sample', path.join(__dirname, '..', 'assets'));
      p.meta.lobby.initialRoster = ['c_eliwood', 'c_lyn', 'c_hector', 'c_rebecca', 'c_oswin', 'c_matthew'];
      for (const u of p.db.units) if (['c_rebecca', 'c_oswin', 'c_matthew'].includes(u.id)) delete u.recruitAfter;
      const ch = p.db.chapters[0];
      ch.players = [{ id: 'p1', unitId: 'c_eliwood', x: 3, y: 3 }, { id: 'p2', unitId: 'c_lyn', x: 4, y: 3 }, { id: 'p3', unitId: 'c_hector', x: 5, y: 3 }];
      ch.requiredUnits = ['c_eliwood']; ch.deployment = { enabled: true, limit: 0, forcedUnits: [] };
      ch.objective = { type: 'survive', turns: 99 }; ch.events = [];
      ch.enemies = ch.enemies.filter(e => e.isBoss); ch.enemies[0].ai = 'stationary';
      io.saveProject(dir, p);
      const E = mk(ewc);
      await E.js(`Editor.open(${JSON.stringify(dir)})`); await E.until(`!!Editor.db()`);
      await E.js(`Editor.selectChapter('ch_1'); document.querySelector('[data-mode="units"]').click()`);
      await E.until(`!!document.querySelector('[data-place-slot]')`);
      // outil « Case de départ » : deux cases libres (clic), une retirée puis remise (clic droit / clic)
      await E.js(`document.querySelector('[data-place-slot]').click()`);
      const clickCell = (x, y, button = 0) => E.js(`(() => { const c = document.querySelector('#canvas-wrap canvas'), r = c.getBoundingClientRect(), m = Editor.project().maps.find(m => m.id === Editor.db().chapters[0].mapId);
        const cw = r.width / m.width, chh = r.height / m.height, o = { bubbles: true, clientX: r.left + (${x} + .5) * cw, clientY: r.top + (${y} + .5) * chh, button: ${button} };
        c.dispatchEvent(new MouseEvent('mousedown', o)); window.dispatchEvent(new MouseEvent('mouseup', o)); })()`);
      await clickCell(6, 3); await clickCell(7, 3); await clickCell(7, 3, 2); await clickCell(7, 3);
      await clickCell(3, 3); // personnage placé : refusé (déjà une case de départ)
      result.slots = await E.js(`JSON.stringify(Editor.db().chapters[0].deployment.slots)`);
      assert(result.slots === '[{"x":6,"y":3},{"x":7,"y":3}]', 'cases libres : ' + result.slots);
      result.resume = await E.js(`document.querySelector('[data-deploy-summary]').textContent`);
      assert(/5 case\(s\) de départ : 3 personnage\(s\) placé\(s\) \+ 2 case\(s\) libre\(s\)/.test(result.resume), 'résumé : ' + result.resume);
      // limite : 5 unités (plus que les 3 personnages placés)
      await E.js(`(() => { const f = [...document.querySelectorAll('#inspector .field')].find(f => /Nombre maximum d’unités/.test(f.textContent)); const i = f.querySelector('input'); i.value = '5'; i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      await E.until(`Editor.db().chapters[0].deployment.limit === 5`);
      await wait(300); await E.shot('a_editeur_cases');
      ewc.send('menu', 'save'); await E.until('!Editor.state.dirty');
      const saved = io.loadProject(dir).db.chapters[0].deployment;
      assert(saved.limit === 5 && saved.slots.length === 2 && saved.enabled === true, 'enregistré : ' + JSON.stringify(saved));

      // jeu : préparatifs avec 5 cases, Cloud et Rebecca complètent l'équipe
      const win = openPlaytest(dir, ''), wc = win.webContents; wc.setBackgroundThrottling(false); win.setSize(1200, 820);
      wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
      await new Promise(r => wc.once('did-finish-load', r));
      const G = mk(wc);
      await G.until(`!!document.querySelector('.choice-list')`);
      await G.js(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
      await G.until(`PlaytestState.mode === 'lobby' && !PlaytestState.busy`, 20000);
      await G.js(`PlaytestLobby.openMenu(); PlaytestState.menu.items.find(i => i.label === PlaytestLobby.state.cfg.board.label).action()`);
      await G.until(`!!document.querySelector('#lobby-panel .lp-go')`);
      await G.js(`[...document.querySelectorAll('#lobby-panel .lp-go')].find(b => b.textContent.includes('Partir')).click()`);
      await G.until(`!!document.querySelector('.modal-back')`);
      await G.js(`[...document.querySelectorAll('.modal-actions button')].find(b => b.textContent.includes('Partir')).click()`);
      await G.until(`PlaytestState.mode === 'preparation'`, 20000);
      result.cases = await G.js(`document.querySelectorAll('[data-deploy-slot]').length`);
      result.plan = await G.js(`PlaytestPreparation.plan().map(p => p.unitId + '@' + p.x + ',' + p.y)`);
      result.compte = await G.js(`document.querySelector('[data-deploy-count]').textContent`);
      assert(result.cases === 5 && result.plan.length === 5 && result.compte.startsWith('5/5'), 'préparatifs : ' + JSON.stringify(result));
      assert(result.plan.filter(s => !/^c_(eliwood|lyn|hector)@/.test(s)).length === 2, 'recrues en plus : ' + result.plan);
      await wait(400); await G.shot('b_preparatifs');
    } catch (e) { errors.push(String(e && e.stack || e)); }
    finish();
  });
};
