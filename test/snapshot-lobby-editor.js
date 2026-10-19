/*
 * Édition du lobby : onglets Lobby (placement à la souris), Conversations, Chapitres (évènement), prix, bourse d'un ennemi.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-lobby-editor.js npm start
 */
'use strict';
const path = require('path'), fs = require('fs'), os = require('os');
const { app } = require('electron');
const io = require(path.join(__dirname, '..', 'src/main/project-io.js'));
module.exports = (win, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const errs = [], result = {};
  win.webContents.on('console-message', (e, l, m) => { if (l >= 2) errs.push('editor: ' + m); });
  const finish = () => { result.errors = errs; result.ok = !errs.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errs.push('délai global dépassé'); finish(); }, 120000);
  win.webContents.once('did-finish-load', async () => {
    try {
      win.setSize(1440, 900);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-lobby-ed-')), 'Jeu');
      io.createProject(dir, 'Lobby', 'sample', path.join(__dirname, '..', 'assets'));
      const ejs = c => win.webContents.executeJavaScript(c, true);
      const shot = async n => { win.show(); win.webContents.invalidate(); await ejs('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await win.webContents.capturePage()).toPNG()); };
      await ejs(`Editor.open(${JSON.stringify(dir)})`); await wait(1000);
      await ejs(`DBEditor.open('lobby')`); await wait(800);
      await shot('a_onglet_lobby');
      // placer Lyn ailleurs en cliquant sur l'aperçu
      await ejs(`[...document.querySelectorAll('#db-body .chip')].find(b => b.textContent === 'Lyn').click()`); await wait(300);
      await ejs(`(() => { const cv = document.querySelector('.lobby-map'); const r = cv.getBoundingClientRect(); const m = Editor.project().maps.find(m => m.id === 'map_camp');
        cv.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + (6.5 / m.width) * r.width, clientY: r.top + (3.5 / m.height) * r.height })); })()`); await wait(400);
      result.lyn = await ejs(`Editor.project().meta.lobby.spots.find(s => s.unitId === 'c_lyn')`);
      await ejs(`document.querySelector('.lobby-spots').scrollIntoView()`); await wait(200);
      await shot('b_lobby_personnages');
      await ejs(`DBEditor.open('talks')`); await wait(600); await shot('c_conversations');
      await ejs(`DBEditor.open('chapters', 'ch_ev_1')`); await wait(600);
      await ejs(`[...document.querySelectorAll('#db-body .form-heading')].find(e => e.textContent.startsWith('Lobby')).scrollIntoView()`); await wait(200);
      await shot('d_chapitre_evenement');
      await ejs(`DBEditor.open('weapons', 'w_iron_sword')`); await wait(500); await shot('e_prix_arme');
      await ejs(`DBEditor.close()`); await wait(300);
      win.webContents.send('menu', 'mode-units'); await wait(600);
      await ejs(`(() => { Editor.state.selected = { kind: 'enemies', id: 'e7' }; })()`);
      await ejs(`Editor.selectChapter('ch_1')`); await wait(300);
      await ejs(`(() => { Editor.state.selected = { kind: 'enemies', id: 'e7' }; Editor.refresh(); })()`); await wait(500);
      result.bourse = await ejs(`[...document.querySelectorAll('.field-label')].some(l => l.textContent.startsWith('Bourse'))`);
      await shot('f_bourse_ennemi');
    } catch (e) { errs.push(String(e.stack || e)); }
    finish();
  });
};
