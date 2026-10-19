/*
 * Vérification de bout en bout : conversion d'un ancien projet (img/, audio/) vers ressources/,
 * onglet Ressources (par personnage, couleurs d'équipe), fiche d'unité, map de l'éditeur, playtest et combat.
 *
 * TF_OLD_PROJECT=dossier d'un projet à l'ancienne arborescence (sinon un projet neuf est créé)
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-ressources.js npm start
 */
'use strict';
const path = require('path'), fs = require('fs'), os = require('os');
const { app } = require('electron');
const ROOT = path.join(__dirname, '..');
const io = require(ROOT + '/src/main/project-io.js');

module.exports = (win, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const errs = [], log = (...a) => fs.appendFileSync(path.join(out, 'log.txt'), a.join(' ') + '\n');
  win.webContents.on('console-message', (e, l, m) => { if (l >= 2) errs.push('editor: ' + m); });
  const watchdog = setTimeout(() => { log('ERREURS', JSON.stringify(errs.concat('délai global dépassé'))); app.exit(1); }, 150000);
  win.webContents.once('did-finish-load', async () => {
    try {
      win.setSize(1440, 900);
      let dir = process.env.TF_OLD_PROJECT;
      if (!dir) { dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-res-')), 'Jeu'); io.createProject(dir, 'Test', 'sample', ROOT + '/assets'); }
      const ejs = c => win.webContents.executeJavaScript(c, true);
      const eshot = async n => { win.show(); win.focus(); win.webContents.invalidate(); await ejs('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await win.webContents.capturePage()).toPNG()); };
      const click = (sel, text) => ejs(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.trim() === ${JSON.stringify(text)}); if (b) b.click(); return !!b; })()`);

      await ejs(`Editor.open(${JSON.stringify(dir)})`); await wait(1200);
      await eshot('a_conversion');
      log('alerte', await ejs(`(document.querySelector('.modal') || {}).textContent || 'aucune'`));
      await ejs(`(() => { const b = document.querySelector('.modal button'); b && b.click(); })()`); await wait(300);
      log('dossiers', JSON.stringify(fs.readdirSync(dir).sort()), JSON.stringify(fs.readdirSync(path.join(dir, 'ressources')).sort()));
      log('personnages', JSON.stringify(fs.readdirSync(path.join(dir, 'ressources', 'personnages')).sort()));
      log('Lyn', JSON.stringify(fs.readdirSync(path.join(dir, 'ressources', 'personnages', 'Lyn')).sort()));

      // Ressources : sprite de map de Lyn en rouge, nuancier des couleurs d'équipe
      await ejs(`DBEditor.open('resources')`); await wait(600);
      await ejs(`[...document.querySelectorAll('#db-body .db-item')].find(e => (e.title || '').endsWith('Lyn/map_Lord')).click()`); await wait(400);
      await click('#db-body .chip', 'Rouge (ennemi)'); await wait(900);
      await eshot('b_ressources_lyn_rouge');
      log('nuancier', await ejs(`document.querySelectorAll('.swatch').length + ' couleurs, ' + document.querySelectorAll('.swatch.on').length + ' cochées'`));
      // Cloud en combat, en vert ; puis on décoche / recoche une couleur (écrit dans le .json)
      await ejs(`[...document.querySelectorAll('#db-body .db-item')].find(e => (e.title || '').endsWith('Cloud/combat')).click()`); await wait(400);
      await click('#db-body .chip', 'Vert (allié)'); await wait(900);
      await eshot('c_ressources_cloud_combat_vert');
      const before = await ejs(`document.querySelectorAll('.swatch.on').length`);
      await ejs(`document.querySelector('.swatch:not(.on)').click()`); await wait(700);
      const after = await ejs(`document.querySelectorAll('.swatch.on').length`);
      const json = JSON.parse(fs.readFileSync(path.join(dir, 'ressources/personnages/Cloud/combat.json'), 'utf8'));
      log('clic nuancier', before, '->', after, 'json', JSON.stringify(json.teamColors));
      await ejs(`[...document.querySelectorAll('.swatch.on')].pop().click()`); await wait(500);

      // fiche d'unité : réglage Couleurs + aperçus
      const lyn = await ejs(`Editor.db().units.find(u => u.name === 'Lyn').id`);
      await ejs(`DBEditor.open('units', ${JSON.stringify(lyn)})`); await wait(700);
      await ejs(`document.querySelector('.appear').scrollIntoView()`); await wait(200);
      await eshot('d_fiche_lyn');
      await ejs(`DBEditor.open('system')`); await wait(500);
      await ejs(`(() => { const s = [...document.querySelectorAll('#db-body select')].find(s => [...s.options].some(o => o.value === 'team')); s.scrollIntoView(); })()`); await wait(200);
      await eshot('e_systeme');
      await ejs(`DBEditor.close()`); await wait(300);
      win.webContents.send('menu', 'mode-units'); await wait(800);
      await eshot('f_map_editeur');
      await ejs(`Editor.save ? Editor.save() : null`); await wait(300);

      // playtest : couleurs d'équipe partout ; un ennemi « Hector » pour voir le rouge en combat
      const p = io.loadProject(dir);
      p.meta.settings = Object.assign({}, p.meta.settings, { colors: 'team', battleAnims: true });
      const ch = p.db.chapters[0];
      const eli = p.db.units.find(u => u.name === 'Eliwood');
      ch.events = []; ch.objective = { type: 'survive', turns: 99 };
      const ep = ch.players.find(x => x.unitId === eli.id);
      ch.enemies = [{ id: 'e_hector', classId: 'axe_lord', name: 'Hector ennemi', level: 1, x: ep.x + 1, y: ep.y, ai: 'stationary' }]
        .concat(ch.enemies.filter(e => Math.abs(e.x - ep.x) + Math.abs(e.y - ep.y) > 3).slice(0, 3));
      ch.players = ch.players.filter(x => !(x.x === ep.x + 1 && x.y === ep.y));
      io.saveProject(dir, p);
      const pw = openPlaytest(dir, ch.id); const wc = pw.webContents;
      wc.setBackgroundThrottling(false);
      wc.on('console-message', (e, l, m) => { if (l >= 2) errs.push('playtest: ' + m); });
      await new Promise(r => wc.once('did-finish-load', r)); pw.setSize(1100, 780);
      const js = c => wc.executeJavaScript(c, true);
      const shot = async n => { pw.show(); pw.focus(); wc.invalidate(); await js('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
      for (let i = 0; i < 40 && !(await js(`!!document.querySelector('.choice-list')`)); i++) await wait(150);
      await js(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
      for (let i = 0; i < 60 && !(await js(`!!PlaytestState.map && !PlaytestState.busy`)); i++) await wait(150);
      await js(`(() => { const G = PlaytestState; window.H = G.units.find(u => u.sourceId === ${JSON.stringify(eli.id)});
        G.cursor = { x: H.x, y: H.y }; const L = G.units.find(u => u.name === 'Lyn'); if (L) L.done = true; })()`);
      await wait(600); await shot('g_playtest_map');
      log('palettes map', await js(`PlaytestState.units.map(u => u.name + ':' + u.team + ':' + Palettes.paletteFor(u.team, Palettes.resolveMode(u.colorsOverride, u.colors, PlaytestState.settings.colors), 'map', u.done && u.team === 'player')).join(' ')`));
      const key = async k => { wc.sendInputEvent({ type: 'keyDown', keyCode: k }); wc.sendInputEvent({ type: 'keyUp', keyCode: k }); await wait(120); };
      await js(`PlaytestState.cursor = { x: H.x, y: H.y }`); await wait(150);
      log('avant', await js(`JSON.stringify({ ui: PlaytestState.ui, busy: PlaytestState.busy, phase: PlaytestState.phase, cur: PlaytestState.cursor, H: [H.x, H.y, H.done], dlg: !document.querySelector('#dialogue').classList.contains('hidden') })`));
      await key('Z'); for (let i = 0; i < 30 && !(await js(`PlaytestState.ui === 'moving'`)); i++) await wait(100);
      log('après Z', await js(`JSON.stringify({ ui: PlaytestState.ui, busy: PlaytestState.busy })`));
      await key('Z'); for (let i = 0; i < 30 && !(await js(`PlaytestState.ui === 'menu'`)); i++) await wait(100);
      await js(`PlaytestState.menu.items.find(i => i.label === 'Attaquer').action()`); await wait(500);
      await key('Z');
      for (let i = 0; i < 60 && !(await js(`document.body.classList.contains('in-battle')`)); i++) await wait(100);
      await wait(900); await shot('h_combat');
      log('combat', await js(`document.body.classList.contains('in-battle')`));
    } catch (e) { errs.push(String(e.stack || e)); }
    clearTimeout(watchdog);
    log('ERREURS', JSON.stringify(errs)); app.exit(0);
  });
};
