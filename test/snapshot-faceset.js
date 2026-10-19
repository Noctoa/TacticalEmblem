// Test de bout en bout des face sets (portrait d'Eliwood) : Ressources, fiche d'unité, dialogue, fenêtre d'unité.
// TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-faceset.js npm start
const path = require('path'), fs = require('fs'), os = require('os');
const { app } = require('electron');
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
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-face-')), 'Jeu');
      io.createProject(dir, 'Test', 'sample', ROOT + '/assets');
      const ejs = c => win.webContents.executeJavaScript(c, true);
      const eshot = async n => { win.show(); win.focus(); win.webContents.invalidate(); await ejs('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); await wait(250); fs.writeFileSync(path.join(out, n + '.png'), (await win.webContents.capturePage()).toPNG()); };
      await ejs(`Editor.open(${JSON.stringify(dir)})`); await wait(800);
      await ejs(`DBEditor.open('resources')`); await wait(600);
      await ejs(`(() => { const it = [...document.querySelectorAll('#db-body .db-item')].find(e => e.textContent.trim().endsWith('Eliwood.png')); it && it.click(); })()`); await wait(800);
      log('items', await ejs(`[...document.querySelectorAll('#db-body .db-item')].map(e => e.textContent.trim()).join('/')`));
      log('analyse', await ejs(`document.querySelector('.faceset-demo') ? [...document.querySelectorAll('#db-body .form-info')].map(p => p.textContent).join(' | ') : 'pas de démo'`));
      await ejs(`(() => { const b = [...document.querySelectorAll('#db-body button')].find(b => b.textContent === 'Faire parler'); b && b.click(); })()`);
      await wait(130); await eshot('a_ressource_faceset');
      await ejs(`DBEditor.open('units')`); await wait(600); await eshot('b_fiche_unite');
      await ejs(`DBEditor.close()`);

      const pw = openPlaytest(dir, 'ch_1'); const wc = pw.webContents;
      wc.on('console-message', (e, l, m) => { if (l >= 2) errs.push('playtest: ' + m); });
      await new Promise(r => wc.once('did-finish-load', r)); pw.setSize(1100, 780);
      const js = c => wc.executeJavaScript(c, true);
      const shot = async n => { pw.show(); pw.focus(); wc.invalidate(); await js('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); await wait(250); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
      await wait(1500);
      await js(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`); await wait(1500);
      // avance jusqu'à la première réplique d'Eliwood, capture pendant qu'il parle
      for (let i = 0; i < 30; i++) {
        if (await js(`document.querySelector('#dialogue .dlg-name').textContent === 'Eliwood'`)) break;
        await js(`PlaytestState.dialogue && PlaytestState.dialogue.next()`); await wait(120);
      }
      await wait(200);
      log('dialogue visible', await js(`!document.querySelector('#dialogue').classList.contains('hidden')`));
      log('parle', await js(`(() => { const c = document.querySelector('.dlg-portrait canvas.faceset'); return c ? 'faceset talking=' + c.face.talking + ' bouche=' + c.face.sheet.mouth + ' yeux=' + c.face.sheet.eyes : 'pas de face set'; })()`));
      await wait(600); await shot('c_dialogue_eliwood');
      await js(`document.querySelector('.dlg-skip').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`); await wait(1500);
      await js(`(() => { const e = PlaytestState.units.find(u => u.name === 'Eliwood'); PlaytestState.cursor = { x: e.x, y: e.y }; })()`);
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Left' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Left' }); await wait(150);
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Right' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Right' }); await wait(600);
      await shot('d_fenetre_unite');
    } catch (e) { errs.push(String(e.stack || e)); }
    log('ERREURS', JSON.stringify(errs)); app.exit(0);
  });
};
