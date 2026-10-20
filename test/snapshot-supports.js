const path = require('path'), fs = require('fs'), os = require('os');
const { app } = require('electron');
require('./auto-deploy.js'); // écran des préparatifs validé avec la sélection par défaut
const ROOT = path.join(__dirname, '..');
const io = require(ROOT + '/src/main/project-io.js');
module.exports = (win, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const errs = [], log = (...a) => fs.appendFileSync(path.join(out, 'log.txt'), a.join(' ') + '\n');
  win.webContents.on('console-message', (e, l, m) => { if (l >= 2) errs.push('editor: ' + m); });
  win.webContents.once('did-finish-load', async () => {
    try {
      win.setSize(1440, 900);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-sup-')), 'Jeu');
      io.createProject(dir, 'Test', 'sample', ROOT + '/assets');
      { const q = io.loadProject(dir); q.meta.lobby.enabled = false; q.db.chapters.find(c => c.id === 'ch_1').final = true; io.saveProject(dir, q); } // le scénario va jusqu'à l'épilogue après le 1er acte // ce scénario ne teste pas le lobby : la partie démarre directement au chapitre
      const ejs = c => win.webContents.executeJavaScript(c, true);
      const eshot = async n => fs.writeFileSync(path.join(out, n + '.png'), (await win.webContents.capturePage()).toPNG());
      await ejs(`Editor.open(${JSON.stringify(dir)})`); await wait(800);
      await ejs(`DBEditor.open('supports')`); await wait(500); await eshot('a_bdd_affinites');
      await ejs(`DBEditor.open('units')`); await wait(400);
      await ejs(`document.querySelector('.db-form').scrollTop = 600`); await wait(200); await eshot('b_bdd_unite');
      await ejs(`DBEditor.close()`);

      const pw = openPlaytest(dir, 'ch_1'); const wc = pw.webContents;
      wc.setBackgroundThrottling(false); pw.show(); // les animations de combat avancent au rythme de l'affichage : fenêtre visible
      wc.on('console-message', (e, l, m) => { if (l >= 2) errs.push('playtest: ' + m); });
      await new Promise(r => wc.once('did-finish-load', r)); pw.setSize(1100, 780);
      const js = c => wc.executeJavaScript(c, true);
      const shot = async n => fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG());
      const key = async (k, n) => { for (let i = 0; i < (n || 1); i++) { wc.sendInputEvent({ type: 'keyDown', keyCode: k }); wc.sendInputEvent({ type: 'keyUp', keyCode: k }); await wait(90); } };
      const idle = async () => { for (let i = 0; i < 120 && await js(`BattleScene.isActive() || PlaytestState.busy || !!PlaytestState.dialogue || !!PlaytestState.waitClick`); i++) { await js(`PlaytestState.waitClick && PlaytestState.waitClick(); PlaytestState.dialogue && PlaytestState.dialogue.skip()`); await wait(200); } };
      await wait(2200);
      await js(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
      await wait(2200);
      await js(`document.querySelector('.dlg-skip').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`); await wait(1800);
      log('rangs', await js(`JSON.stringify(Object.values(PlaytestState.sup).map(e => [e.def.name || e.def.id, e.points, e.rank]))`));

      // 1) attaque duo : Hector attaque le brigand (8,9), Eliwood adjacent (affinité A), chance forcée à 100 %
      await js(`(() => { const G = PlaytestState;
        const h = G.units.find(u => u.name === 'Hector'), e = G.units.find(u => u.name === 'Eliwood');
        h.x = h.rx = 7; h.y = h.ry = 9; e.x = e.rx = 7; e.y = e.ry = 10;
        Object.values(G.sup).forEach(s => { if (s.def.combo) s.def.combo.chance = 100; });
        G.cursor = { x: 7, y: 9 }; })()`);
      await key('Z'); await wait(300); await key('Z'); await wait(700);
      await js(`PlaytestState.menu.items.find(i => i.label === 'Attaquer').action()`); await wait(500);
      await shot('c_previsions_duo');
      await key('Z');
      let gotDuo = false;
      for (let i = 0; i < 80; i++) {
        await wait(150);
        if (!gotDuo && await js(`!!document.querySelector('#battle') && PlaytestState && (() => { try { return true; } catch (e) { return false; } })()`)) {
          // capture quand le partenaire est visible
        }
        if (!(await js(`BattleScene.isActive()`))) break;
        if (i >= 12 && i <= 21 && i % 3 === 0) await shot('d_combat_' + i);
      }
      await idle(); await shot('d_after');
      log('état', await js(`JSON.stringify({busy: PlaytestState.busy, dlg: !!PlaytestState.dialogue, wc: !!PlaytestState.waitClick, phase: PlaytestState.phase, menu: !!PlaytestState.menu})`));
      log('après duo', await js(`JSON.stringify(PlaytestState.units.filter(u => ['Hector','Eliwood'].includes(u.name) || (u.x===8&&u.y===9)).map(u => [u.name, u.hp, u.dead, u.exp]))`));

      // 2) conversation de soutien : Eliwood et Lyn passent au rang A
      await js(`(() => { const G = PlaytestState;
        const e = G.units.find(u => u.name === 'Eliwood'), l = G.units.find(u => u.name === 'Lyn');
        l.x = l.rx = 6; l.y = l.ry = 10; e.done = false;
        const s = G.sup['c_eliwood|c_lyn']; s.points = 95;
        G.cursor = { x: 7, y: 10 }; })()`);
      await key('Z'); await wait(300); await key('Z'); await wait(700);
      const menu = await js(`PlaytestState.menu ? PlaytestState.menu.items.map(i => i.label).join(',') : ''`);
      log('menu Eliwood', menu);
      await js(`void PlaytestState.menu.items.find(i => i.label === 'Soutien').action()`); await wait(1500);
      await shot('e_conversation_soutien');
      await idle();
      log('rang Eliwood-Lyn', await js(`PlaytestState.sup['c_eliwood|c_lyn'].rank`));

      // 3) victoire forcée → épilogue
      await js(`(() => { const G = PlaytestState; G.units.filter(u => u.name === 'Batta').forEach(u => { u.hp = 0; u.dead = true; }); })()`);
      await js(`(() => { const G = PlaytestState; const l = G.units.find(u => u.name === 'Lyn'); l.done = false; G.cursor = { x: l.x, y: l.y }; })()`);
      await key('Z'); await wait(300); await key('Z'); await wait(600);
      await js(`void (PlaytestState.menu && PlaytestState.menu.items.find(i => i.label === 'Attendre').action())`);
      await idle(); await wait(800); await idle();
      log('fin', await js(`document.querySelector('#end h1') ? document.querySelector('#end h1').textContent : '?'`));
      await js(`[...document.querySelectorAll('#end button')].find(b => b.textContent === 'Épilogue').click()`); await wait(500);
      await shot('f_epilogue_choix');
      await js(`(() => { const card = [...document.querySelectorAll('.ep-card')].find(c => c.textContent.includes('Eliwood')); [...card.querySelectorAll('.ep-cand')].find(b => b.textContent.includes('Lyn')).click(); })()`); await wait(300);
      await shot('g_epilogue_choisi');
      await js(`[...document.querySelectorAll('#epilogue button')].find(b => b.textContent === 'Voir les fins').click()`); await wait(400);
      await shot('h_fin_couple');
      log('fin affichée', await js(`document.querySelector('#epilogue h2').textContent`));
    } catch (e) { errs.push(String(e.stack || e)); }
    log('ERREURS', JSON.stringify(errs)); app.exit(0);
  });
};
