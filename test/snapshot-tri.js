/*
 * Tri des personnages : Base de données › Unités (recherche, Trier par série / arme), champ Série, palette de placement.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-tri.js npm start
 */
'use strict';
const path = require('path'), fs = require('fs'), os = require('os');
const { app } = require('electron');
const io = require(path.join(__dirname, '..', 'src/main/project-io.js'));
module.exports = (win) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const errs = [], result = {};
  win.webContents.on('console-message', (e, l, m) => { if (l >= 2) errs.push('editor: ' + m); });
  const finish = () => { result.errors = errs; result.ok = !errs.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errs.push('délai global dépassé'); finish(); }, 120000);
  win.webContents.once('did-finish-load', async () => {
    try {
      win.setSize(1440, 900);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-tri-')), 'Jeu');
      const p = io.createProject(dir, 'Tri', 'sample', path.join(__dirname, '..', 'assets'));
      // quelques personnages de plus pour que le tri ait du sens
      const extra = [['Roy', 'Fire Emblem 6', 'lord'], ['Ike', 'Fire Emblem 9', 'axe_lord'], ['Tifa', 'Final Fantasy VII', 'mercenary'], ['Nyx', '', 'lord']];
      for (const [name, series, classId] of extra) p.db.units.push(Object.assign(JSON.parse(JSON.stringify(p.db.units[1])), { id: 'c_' + name.toLowerCase(), name, series, classId, protagonist: false }));
      io.saveProject(dir, p);
      const ejs = c => win.webContents.executeJavaScript(c, true);
      const shot = async n => { win.show(); win.webContents.invalidate(); await ejs('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await win.webContents.capturePage()).toPNG()); };
      const listText = `[...document.querySelectorAll('#db-body .db-list-items > *')].map(e => e.classList.contains('db-group') ? '# ' + e.firstChild.textContent : e.querySelector('span:nth-child(2)') ? e.querySelector('span:nth-child(2)').textContent : e.textContent)`;
      const sortBy = v => ejs(`(() => { const s = document.querySelector('#db-body .roster-sort'); s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('change')); })()`);
      const search = v => ejs(`(() => { const s = document.querySelector('#db-body .roster-search'); s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('input')); })()`);
      await ejs(`Editor.open(${JSON.stringify(dir)})`); await wait(1000);
      await ejs(`DBEditor.open('units')`); await wait(600);
      result.base = await ejs(listText);
      await sortBy('series'); await wait(200); result.serie = await ejs(listText); await shot('a_tri_serie');
      await sortBy('weapon'); await wait(200); result.arme = await ejs(listText); await shot('b_tri_arme');
      await search('final'); await wait(200); result.recherche = await ejs(listText); await shot('c_recherche');
      result.focusGarde = await ejs(`document.activeElement === document.querySelector('#db-body .roster-search') || 'n/a'`);
      // champ Série : suggestions des séries existantes, modification
      await search(''); await sortBy('series'); await wait(200);
      await ejs(`[...document.querySelectorAll('#db-body .db-item')].find(e => e.textContent.includes('Nyx')).click()`); await wait(400);
      result.suggestions = await ejs(`(() => { const label = [...document.querySelectorAll('#db-body .field-label')].find(l => l.textContent.startsWith('Série'));
        const input = label.parentElement.querySelector('input'); return [...document.getElementById(input.getAttribute('list')).options].map(o => o.value); })()`);
      await ejs(`(() => { const label = [...document.querySelectorAll('#db-body .field-label')].find(l => l.textContent.startsWith('Série'));
        const input = label.parentElement.querySelector('input'); input.value = 'Fire Emblem 6'; input.dispatchEvent(new Event('change')); })()`); await wait(400);
      result.nyx = await ejs(`Editor.project().db.units.find(u => u.id === 'c_nyx').series`); result.groupeDirect = await ejs(listText);
      await ejs(`DBEditor.open('units', 'c_nyx')`); await wait(400);
      result.apresEdition = await ejs(listText);
      result.triGarde = await ejs(`document.querySelector('#db-body .roster-sort').value`);
      await shot('d_fiche_serie');
      await ejs(`DBEditor.close()`); await wait(300);
      // palette de placement (mode Unités)
      win.webContents.send('menu', 'mode-units'); await wait(600);
      await ejs(`(() => { const s = document.querySelector('.pick-list .roster-sort'); s.value = 'weapon'; s.dispatchEvent(new Event('change')); })()`); await wait(300);
      result.palette = await ejs(`[...document.querySelectorAll('.pick-units > *')].map(e => e.classList.contains('pick-subgroup') || e.classList.contains('pick-group') ? '# ' + e.textContent : e.querySelector('span:nth-child(2)').textContent)`);
      await shot('e_palette_arme');
      await ejs(`(() => { const s = document.querySelector('.pick-list .roster-search'); s.value = 'ike'; s.dispatchEvent(new Event('input')); })()`); await wait(300);
      await ejs(`document.querySelector('[data-pick-unit="players:c_ike"]').click()`); await wait(300);
      result.outil = await ejs(`JSON.stringify(EditorState.placeTool)`);
      await shot('f_palette_recherche');
      win.webContents.send('menu', 'save'); await wait(1200);
      result.sauve = io.loadProject(dir).db.units.find(u => u.id === 'c_nyx').series;
    } catch (e) { errs.push(String(e.stack || e)); }
    finish();
  });
};
