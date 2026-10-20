/*
 * Base de données : onglet unique « Chapitres et actes » (arbre, actes en sous-cases) et tri des ressources graphiques.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-chapitres-actes.js npm start
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
  setTimeout(() => { errs.push('délai global dépassé'); finish(); }, 150000);
  win.webContents.once('did-finish-load', async () => {
    try {
      win.setSize(1440, 900);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-chap-')), 'Jeu');
      io.createProject(dir, 'Chapitres', 'sample', path.join(__dirname, '..', 'assets'));
      const ejs = c => win.webContents.executeJavaScript(c, true);
      const shot = async n => { win.show(); win.webContents.invalidate(); await ejs('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await win.webContents.capturePage()).toPNG()); };
      const tree = `[...document.querySelectorAll('#db-body .ch-tree > *')].map(e => (e.classList.contains('db-group') ? '# ' : e.classList.contains('ch-arc') ? '> ' : e.classList.contains('ch-new') ? '  ' : '  - ') + e.textContent.replace('▾', '').replace('▸', '').trim() + (e.classList.contains('on') ? ' *' : ''))`;
      const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
      await ejs(`Editor.open(${JSON.stringify(dir)})`); await wait(1000);
      await ejs(`DBEditor.open('arcs')`); await wait(600);
      result.onglets = await ejs(`[...document.querySelectorAll('#db-tabs button')].map(b => b.textContent)`);
      assert(!result.onglets.includes('Actes') && result.onglets.includes('Chapitres et actes'), 'un seul onglet');
      result.arbre = await ejs(tree);
      await shot('a_arbre_chapitre');
      // un acte en sous-case : sa fiche, l'onglet reste « Chapitres et actes »
      await ejs(`document.querySelector('#db-body [data-act="ch_1_2"]').click()`); await wait(400);
      result.acte = await ejs(`({ titre: document.querySelector('#db-body h2').textContent, onglet: document.querySelector('#db-tabs button.on').textContent })`);
      assert(result.acte.titre.startsWith('Les renforts') && result.acte.onglet === 'Chapitres et actes', 'fiche de l’acte');
      await shot('b_fiche_acte');
      // replier le chapitre 2, nouvel acte dans le chapitre 1
      await ejs(`document.querySelector('#db-body [data-arc="arc_2"] .ch-toggle').click()`); await wait(200);
      result.replie = await ejs(`!document.querySelector('#db-body [data-act="ch_2_1"]')`);
      await ejs(`[...document.querySelectorAll('#db-body .ch-new')][0].click()`); await wait(400);
      result.nouvelActe = await ejs(`(() => { const a = Editor.db().arcs.find(a => a.id === 'arc_1'); return { actes: a.acts, titre: document.querySelector('#db-body h2').textContent }; })()`);
      assert(result.nouvelActe.actes.length === 3, 'acte ajouté au chapitre 1');
      result.arbre2 = await ejs(tree);
      await shot('c_nouvel_acte');
      // suppression de l'acte ajouté (confirmation)
      await ejs(`document.querySelector('#db-body .db-list-actions .danger').click()`); await wait(300);
      await ejs(`[...document.querySelectorAll('.modal-back button')].find(b => b.textContent === 'Supprimer').click()`); await wait(400);
      result.apresSuppression = await ejs(`({ actes: Editor.db().arcs.find(a => a.id === 'arc_1').acts, total: Editor.db().chapters.length, titre: document.querySelector('#db-body h2').textContent })`);
      assert(result.apresSuppression.actes.length === 2, 'acte supprimé');
      // retour au chapitre, recherche
      await ejs(`document.querySelector('#db-body [data-arc="arc_1"]').click()`); await wait(300);
      result.chapitre = await ejs(`document.querySelector('#db-body h2').textContent`);
      await ejs(`(() => { const s = document.querySelector('#db-body .roster-search'); s.value = 'zagan'; s.dispatchEvent(new Event('input')); })()`); await wait(200);
      result.recherche = await ejs(tree);
      await shot('d_recherche');
      // ressources graphiques : tri par série, arme, type ; recherche
      await ejs(`DBEditor.open('resources')`); await wait(800);
      const resList = `[...document.querySelectorAll('#db-body .db-list-items > *')].map(e => e.classList.contains('pick-group') ? '## ' + e.firstChild.textContent : e.classList.contains('res-owner') ? '# ' + e.firstChild.textContent : (e.querySelector('span:nth-child(2)') || e).textContent)`;
      const sortRes = v => ejs(`(() => { const s = document.querySelector('#db-body .roster-sort'); s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('change')); })()`);
      result.resDefaut = await ejs(resList);
      await sortRes('series'); await wait(300); result.resSerie = await ejs(resList); await shot('e_ressources_serie');
      await sortRes('weapon'); await wait(300); result.resArme = await ejs(resList); await shot('f_ressources_arme');
      await sortRes('type'); await wait(300); result.resType = await ejs(resList); await shot('g_ressources_type');
      await ejs(`(() => { const s = document.querySelector('#db-body .roster-search'); s.value = 'final fantasy'; s.dispatchEvent(new Event('input')); })()`); await wait(300);
      result.resRecherche = await ejs(resList); await shot('h_ressources_recherche');
      await ejs(`[...document.querySelectorAll('#db-body .db-item')].find(e => e.title.endsWith('Cloud/combat')).click()`); await wait(500);
      result.resSelection = await ejs(`document.querySelector('#db-body h2') && document.querySelector('#db-body h2').textContent`);
    } catch (e) { errs.push(String(e.stack || e)); }
    finish();
  });
};
