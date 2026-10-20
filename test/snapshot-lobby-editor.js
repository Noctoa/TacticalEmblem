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
      // le camp se règle sur sa map, en mode Unités
      result.arbre = await ejs(`[...document.querySelectorAll('#tree-list .tree-group, #tree-list .tree-item')].map(e => e.textContent)`);
      await ejs(`Editor.selectCamp('map_camp')`); await wait(800);
      await shot('a_camp_editeur');
      result.reperes = await ejs(`[...document.querySelectorAll('[data-lobby-pick]')].map(e => e.textContent)`);
      // placer Lyn ailleurs : la choisir dans la palette, puis cliquer sur la map
      await ejs(`[...document.querySelectorAll('[data-lobby-pick]')].find(e => e.textContent.includes('Lyn')).click()`); await wait(300);
      const clickCell = (x, y, button = 0) => ejs(`(() => { const cv = document.querySelector('#canvas-wrap canvas'); const r = cv.getBoundingClientRect(); const m = Editor.project().maps.find(m => m.id === 'map_camp');
        const cw = r.width / m.width, ch = r.height / m.height;
        cv.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: ${button}, clientX: r.left + (${x} + 0.5) * cw, clientY: r.top + (${y} + 0.5) * ch })); window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); })()`);
      await clickCell(6, 3); await wait(400);
      result.lyn = await ejs(`Editor.project().meta.lobby.spots.find(s => s.unitId === 'c_lyn')`);
      if (!result.lyn || result.lyn.x !== 6 || result.lyn.y !== 3) errs.push('Lyn non déplacée : ' + JSON.stringify(result.lyn));
      await shot('b_lyn_deplacee');
      // ajouter un personnage, le retirer d'un clic droit
      await ejs(`(() => { const s = document.querySelector('[data-lobby-add-unit]'); s.value = 'c_rebecca'; s.dispatchEvent(new Event('change')); document.querySelector('[data-lobby-add]').click(); })()`); await wait(400);
      const reb = await ejs(`Editor.project().meta.lobby.spots.find(s => s.unitId === 'c_rebecca')`);
      result.rebecca = reb;
      if (!reb) errs.push('Rebecca non ajoutée');
      else { await clickCell(reb.x, reb.y, 2); await wait(300); if (await ejs(`!!Editor.project().meta.lobby.spots.find(s => s.unitId === 'c_rebecca')`)) errs.push('Rebecca non retirée'); }
      // conversations : liste dans l'inspecteur, édition dans une fenêtre
      result.conversations = await ejs(`[...document.querySelectorAll('[data-talk]')].map(e => e.textContent)`);
      await ejs(`document.querySelector('[data-talk="t_lyn_1"]').click()`); await wait(400);
      await ejs(`(() => { const t = [...document.querySelectorAll('.modal .field-label')].find(l => l.textContent.startsWith('Titre')).parentElement.querySelector('input'); t.value = 'Les guetteurs (modifié)'; t.dispatchEvent(new Event('change')); })()`);
      await shot('c_conversation');
      await ejs(`document.querySelector('[data-talk-ok]').click()`); await wait(300);
      result.titre = await ejs(`Editor.db().talks.find(t => t.id === 't_lyn_1').name`);
      if (result.titre !== 'Les guetteurs (modifié)') errs.push('conversation non modifiée');
      await ejs(`document.querySelector('[data-new-talk]').click()`); await wait(300);
      await ejs(`document.querySelector('[data-talk-ok]').click()`); await wait(300);
      result.nbConversations = await ejs(`Editor.db().talks.length`);
      // anciens liens vers les onglets Lobby / Conversations : ouvrent la map de camp
      await ejs(`DBEditor.open('units')`); await wait(300);
      await ejs(`DBEditor.open('lobby')`); await wait(500);
      result.redirection = await ejs(`({ db: !document.querySelector('#db').classList.contains('hidden'), map: Editor.state.mapId, mode: Editor.state.mode })`);
      await shot('d_inspecteur_camp');
      // undo : le déplacement de Lyn est annulable
      win.webContents.send('menu', 'undo'); await wait(200);
      await ejs(`DBEditor.open('chapters', 'ch_ev_1')`); await wait(600);
      await ejs(`[...document.querySelectorAll('#db-body .form-heading')].find(e => e.textContent.startsWith('Lobby')).scrollIntoView()`); await wait(200);
      await shot('e_chapitre_evenement');
      await ejs(`DBEditor.open('weapons', 'w_iron_sword')`); await wait(500); await shot('f_prix_arme');
      await ejs(`DBEditor.close()`); await wait(300);
      win.webContents.send('menu', 'mode-units'); await wait(600);
      await ejs(`(() => { Editor.state.selected = { kind: 'enemies', id: 'e7' }; })()`);
      await ejs(`Editor.selectChapter('ch_1')`); await wait(300);
      await ejs(`(() => { Editor.state.selected = { kind: 'enemies', id: 'e7' }; Editor.refresh(); })()`); await wait(500);
      result.bourse = await ejs(`[...document.querySelectorAll('.field-label')].some(l => l.textContent.startsWith('Bourse'))`);
      await shot('g_bourse_ennemi');
    } catch (e) { errs.push(String(e.stack || e)); }
    finish();
  });
};
