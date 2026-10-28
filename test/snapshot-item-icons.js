/*
 * Icônes des armes et objets (img/items) : ancien projet complété, liste « Armes et objets », fenêtre de choix, retour à l'icône du type.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-item-icons.js npm start
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
  const loaded = () => until(`new Promise(r => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = new URL('img/items/icons.png', document.baseURI).href; })`);
  wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
  wc.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-item-icons-')), 'Jeu');
      const p = io.createProject(dir, 'Icônes', 'sample', path.join(__dirname, '..', 'assets'));
      // projet d'avant les icônes : pas de champ « image » ; une arme et un objet maison
      [...p.db.weapons, ...p.db.items].forEach(e => { delete e.image; });
      p.db.weapons.push(Object.assign({}, p.db.weapons[0], { id: 'w_maison', name: 'Lame maison' }));
      p.db.items.push(Object.assign({}, p.db.items[0], { id: 'i_maison', name: 'Tisane' }));
      io.saveProject(dir, p);
      await js(`Editor.open(${JSON.stringify(dir)})`);
      await until(`Editor.db() && Editor.db().weapons.length === 18`);
      await wait(400);
      result.migration = await js(`[...Editor.db().weapons, ...Editor.db().items].map(e => [e.id, e.image === undefined ? null : e.image])`);
      assert(result.migration.filter(([id]) => !/maison/.test(id)).every(([, im]) => /^item:/.test(im)), 'icônes de base : ' + JSON.stringify(result.migration));
      assert(result.migration.filter(([id]) => /maison/.test(id)).every(([, im]) => im === null), 'fiches maison inchangées');
      await loaded();
      await js(`DBEditor.open('weapons')`);
      await until(`!!document.querySelector('.db-item .item-icon')`);
      await wait(500); await shot('a_liste');
      result.liste = await js(`[...document.querySelectorAll('.db-list-items .db-item')].map(e => e.querySelector('.item-icon') ? 'image' : e.querySelector('.armory-icon') ? 'type' : e.querySelector('.n').textContent)`);
      assert(result.liste.filter(x => x === 'image').length === 24 && result.liste.includes('type') && result.liste.includes('✚'), 'liste : ' + result.liste);
      // fiche de l'arme maison : choisir une icône (onglet Lances, puis recherche)
      await js(`[...document.querySelectorAll('.db-item')].find(e => e.textContent.includes('Lame maison')).click()`);
      await until(`!!document.querySelector('[data-item-image]')`);
      await js(`document.querySelector('[data-item-image]').click()`);
      await until(`!!document.querySelector('.skill-image-cell')`);
      result.toutes = await js(`document.querySelectorAll('.skill-image-cell').length`);
      assert(result.toutes > 200, 'toutes les icônes : ' + result.toutes);
      await js(`[...document.querySelectorAll('.skill-image-tabs button')].find(b => b.textContent === 'Épées').click()`);
      result.groupe = await js(`document.querySelectorAll('.skill-image-cell').length`);
      assert(result.groupe > 30 && result.groupe < result.toutes, 'groupe Épées : ' + result.groupe);
      await loaded(); await wait(300);
      await shot('b_choix');
      await js(`(() => { const s = document.querySelector('[data-icon-search]'); s.value = 'silver'; s.dispatchEvent(new Event('input')); })()`);
      result.recherche = await js(`[...document.querySelectorAll('.skill-image-cell')].map(b => b.dataset.icon)`);
      assert(result.recherche.includes('item:silver-sword') && !result.recherche.includes('item:silver-lance'), 'recherche : ' + result.recherche);
      await js(`document.querySelector('.skill-image-cell[data-icon="item:silver-sword"]').click()`);
      await until(`!document.querySelector('.skill-image-grid')`);
      result.choisi = await js(`Editor.db().weapons.find(w => w.id === 'w_maison').image`);
      assert(result.choisi === 'item:silver-sword', 'icône choisie : ' + result.choisi);
      await wait(300); await shot('c_fiche');
      // retour à l'icône du type ; la migration ne la remet pas
      await js(`[...document.querySelectorAll('.skill-image-row button')].find(b => b.textContent === 'Icône du type').click()`);
      result.retire = await js(`Editor.db().weapons.find(w => w.id === 'w_maison').image`);
      assert(result.retire === '', 'icône retirée');
      // fiche d'un objet : le champ existe aussi
      await js(`[...document.querySelectorAll('.db-item')].find(e => e.textContent.includes('Potion')).click()`);
      await until(`!!document.querySelector('[data-item-image]') && !!document.querySelector('.skill-image-prev .item-icon')`);
      await wait(300); await shot('d_objet');
    } catch (e) { errors.push(String(e && e.stack || e)); }
    finish();
  });
};
