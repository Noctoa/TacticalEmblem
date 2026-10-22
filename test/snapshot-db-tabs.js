/*
 * Base de données : onglet « Armes et objets » (une liste, deux types) et affinités réglées dans la fiche des unités.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-db-tabs.js npm start
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { app } = require('electron');
const io = require('../src/main/project-io');
module.exports = (editor) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], result = {}, wc = editor.webContents;
  wc.setBackgroundThrottling(false);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const js = code => wc.executeJavaScript(code, true);
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const shot = async (n) => { await js(`document.querySelectorAll('.modal-back').forEach(el => { el.style.animation = 'none'; })`); await wc.capturePage(); await wait(250); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
  const finish = () => { result.errors = errors; result.ok = !errors.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errors.push('délai global dépassé'); finish(); }, 90000);
  const until = async (code, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(code)) return; await wait(60); } throw new Error('Délai : ' + code); };
  wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
  wc.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-dbtabs-')), 'Jeu');
      io.createProject(dir, 'Onglets', 'sample', path.join(__dirname, '..', 'assets'));
      await js(`Editor.open(${JSON.stringify(dir)})`);
      await until(`!!Editor.db()`);
      await js(`DBEditor.open('weapons', 'w_fire')`);
      await until(`!!document.querySelector('#db-tabs button')`);
      result.onglets = await js(`[...document.querySelectorAll('#db-tabs button')].map(b => b.textContent)`);
      assert(result.onglets.includes('Armes et objets') && !result.onglets.includes('Objets') && !result.onglets.includes('Affinités') && !result.onglets.includes('Armes'), 'onglets : ' + result.onglets);

      // 1. Armes et objets : deux groupes dans une liste
      result.groupes = await js(`[...document.querySelectorAll('#db-body .db-group')].map(g => g.firstChild.textContent)`);
      assert(JSON.stringify(result.groupes) === '["Armes","Objets"]', 'groupes : ' + result.groupes);
      await wait(300); await shot('a_armes_objets');
      await js(`document.querySelector('#db-body .db-item[data-kind="items"][data-id="i_vulnerary"]').click()`);
      await until(`document.querySelector('.db-form h2') && document.querySelector('.db-form h2').textContent.startsWith('Potion')`);
      result.objetOnglet = await js(`document.querySelector('#db-tabs button.on').textContent`);
      assert(result.objetOnglet === 'Armes et objets', 'onglet surligné');
      assert(await js(`document.querySelector('.db-actions-kind').textContent === 'Objet'`), 'boutons sur les objets');
      const nItems = await js(`Editor.db().items.length`), nWeapons = await js(`Editor.db().weapons.length`);
      await js(`[...document.querySelectorAll('.db-list-actions button')].find(b => b.textContent.includes('Nouveau')).click()`);
      await until(`Editor.db().items.length === ${nItems + 1}`);
      await js(`document.querySelector('[data-armory-add="weapons"]').click()`);
      await until(`Editor.db().weapons.length === ${nWeapons + 1} && document.querySelector('.db-actions-kind').textContent === 'Arme'`);
      await shot('b_objet_puis_arme');

      // 2. affinités dans la fiche d'Eliwood
      const pair = await js(`Editor.db().supports[0]`);
      result.paire = pair.name;
      await js(`DBEditor.open('supports', ${JSON.stringify(pair.id)})`); // ancien lien : redirigé vers l'unité
      await until(`document.querySelector('#db-tabs button.on').textContent === 'Unités' && !!document.querySelector('[data-support="${pair.id}"][open]')`);
      result.unite = await js(`document.querySelector('.db-form h2').firstChild.textContent`);
      await js(`document.querySelector('[data-support="${pair.id}"]').scrollIntoView()`);
      await wait(300); await shot('c_unite_affinites');
      // points au départ : le résumé se met à jour
      await js(`(() => { const l = [...document.querySelectorAll('[data-support="${pair.id}"] .field-label')].find(l => l.textContent === 'Points au départ'); const i = l.parentElement.querySelector('input'); i.value = '55'; i.dispatchEvent(new Event('change')); })()`);
      result.resume = await js(`document.querySelector('[data-support="${pair.id}"] summary').textContent`);
      assert(/55 pts/.test(result.resume), 'résumé : ' + result.resume);
      assert(await js(`Editor.db().supports.find(p => p.id === ${JSON.stringify(pair.id)}).startPoints === 55`), 'points enregistrés');
      // nouvelle affinité puis suppression
      const before = await js(`Editor.db().supports.length`);
      const unitId = await js(`(() => { const u = Editor.db().units.find(x => x.name === ${JSON.stringify(result.unite)}); return u.id; })()`);
      await js(`(() => { const s = document.querySelector('[data-support-add]'); s.value = s.options[1].value; s.dispatchEvent(new Event('change')); })()`);
      await until(`Editor.db().supports.length === ${before + 1}`);
      result.nouvelle = await js(`Editor.db().supports.at(-1).name`);
      assert(await js(`Editor.db().supports.at(-1).a === ${JSON.stringify(unitId)}`), 'nouvelle paire liée à l’unité');
      const newId = await js(`Editor.db().supports.at(-1).id`);
      await js(`document.querySelector('[data-support="${newId}"] [data-support-delete]').click()`);
      await until(`!!document.querySelector('.modal-back')`);
      await js(`[...document.querySelectorAll('.modal-back button')].find(b => b.textContent === 'Supprimer').click()`);
      await until(`Editor.db().supports.length === ${before}`);
      await js(`DBEditor.close()`); wc.send('menu', 'save'); await until('!Editor.state.dirty');
      assert(io.loadProject(dir).db.supports.find(p => p.id === pair.id).startPoints === 55, 'sauvegarde');
    } catch (e) { errors.push(String(e && e.stack || e)); }
    finish();
  });
};
