/*
 * Icônes de compétences (img/skills) : ancien projet complété, liste et fiche, fenêtre de choix, retrait.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-skill-icons.js npm start
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { app } = require('electron');
const io = require('../src/main/project-io');
module.exports = (editor) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], result = {}, wc = editor.webContents;
  wc.setBackgroundThrottling(false);
  const js = c => wc.executeJavaScript(c, true);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const shot = async (n) => { await js(`document.querySelectorAll('.modal-back').forEach(el => { el.style.animation = 'none'; })`); await wc.capturePage(); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
  const finish = () => { result.errors = errors; result.ok = !errors.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errors.push('délai global dépassé'); finish(); }, 90000);
  const until = async (c, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(c)) return; await wait(80); } throw new Error('Délai : ' + c); };
  // planches chargées : on attend que le navigateur ait décodé les images utilisées
  const loaded = (sheets) => until(`Promise.all(${JSON.stringify(sheets)}.map(n => new Promise(r => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = new URL('img/skills/skills-' + n + '.png', document.baseURI).href; }))).then(a => a.every(Boolean))`);
  wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
  wc.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-skill-icons-')), 'Jeu');
      const p = io.createProject(dir, 'Icônes', 'sample', path.join(__dirname, '..', 'assets'));
      // projet d'avant les icônes : pas de champ « image » ; une compétence maison sans icône
      p.db.skills.forEach(s => { delete s.image; });
      p.db.skills.push(Object.assign({}, p.db.skills[0], { id: 'skill_maison', name: 'Maison', icon: '♣' }));
      io.saveProject(dir, p);
      await js(`Editor.open(${JSON.stringify(dir)})`);
      await until(`Editor.db() && Editor.db().skills.length === 12`);
      await wait(400);
      result.migration = await js(`Editor.db().skills.map(s => [s.id, s.image === undefined ? null : s.image])`);
      assert(result.migration.filter(([id, im]) => id !== 'skill_maison').every(([, im]) => /^feh:/.test(im)), 'icônes des compétences de base');
      assert(result.migration.find(([id]) => id === 'skill_maison')[1] === null, 'compétence maison inchangée');
      await loaded([1, 2, 3]);
      await js(`DBEditor.open('skills')`);
      await until(`!!document.querySelector('.db-item .skill-symbol .skill-icon.img')`);
      await wait(500); await shot('a_liste');
      result.liste = await js(`[...document.querySelectorAll('.db-item .skill-symbol')].map(e => e.querySelector('.img') ? 'image' : e.textContent)`);
      assert(result.liste.filter(x => x === 'image').length === 11 && result.liste.includes('♣'), 'liste : ' + result.liste);
      // fiche de la compétence maison : choisir une icône de la planche 5
      await js(`[...document.querySelectorAll('.db-item')].find(e => e.textContent.includes('Maison')).click()`);
      await until(`!!document.querySelector('[data-skill-image]')`);
      await js(`document.querySelector('[data-skill-image]').click()`);
      await until(`!!document.querySelector('.skill-image-cell')`);
      result.planches = await js(`document.querySelectorAll('.skill-image-tabs button').length`);
      assert(result.planches === 9, 'neuf planches');
      await js(`[...document.querySelectorAll('.skill-image-tabs button')].find(b => b.textContent === 'Planche 5').click()`);
      await loaded([5]); await wait(300);
      result.cases5 = await js(`document.querySelectorAll('.skill-image-cell').length`);
      await shot('b_choix');
      await js(`document.querySelector('.skill-image-cell[data-icon="feh:5-20"]').click()`);
      await until(`!document.querySelector('.skill-image-grid')`);
      result.choisi = await js(`Editor.db().skills.find(s => s.id === 'skill_maison').image`);
      assert(result.choisi === 'feh:5-20', 'icône choisie : ' + result.choisi);
      await wait(300); await shot('c_fiche');
      // Retirer : retour au symbole, et la migration ne la remet pas
      await js(`[...document.querySelectorAll('.skill-image-row button')].find(b => b.textContent === 'Retirer').click()`);
      result.retire = await js(`Editor.db().skills.find(s => s.id === 'skill_maison').image`);
      assert(result.retire === '', 'icône retirée');
    } catch (e) { errors.push(String(e && e.stack || e)); }
    finish();
  });
};
