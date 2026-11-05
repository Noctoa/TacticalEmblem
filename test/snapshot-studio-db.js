/*
 * Interface « studio » (inspirée de Pokémon Studio) : barre d'icônes, base de données en pleine page (catégories,
 * barre du haut, sélecteur en menu déroulant ou liste épinglée), fiches en cartes.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-studio-db.js npm start
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
  const shot = async (n) => { await wc.capturePage(); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
  const finish = () => { result.errors = errors; result.ok = !errors.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errors.push('délai global dépassé'); finish(); }, 90000);
  const until = async (code, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(code)) return; await wait(60); } throw new Error('Délai : ' + code); };
  wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
  wc.once('did-finish-load', async () => {
    try {
      editor.setSize(1600, 1000);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-studio-')), 'Jeu');
      io.createProject(dir, 'Studio', 'sample', path.join(__dirname, '..', 'assets'));
      await js(`localStorage.removeItem('tf.dbPinned')`);
      await js(`Editor.open(${JSON.stringify(dir)})`);
      await until(`!!Editor.db()`);
      await wait(500); await shot('a_carte');
      assert(await js(`document.body.dataset.view === 'map'`), 'vue map');
      // base de données depuis la barre d'icônes
      await js(`document.querySelector('[data-rail="db"]').click()`);
      await until(`!document.querySelector('#db').classList.contains('hidden') && !!document.querySelector('.studio-hero')`);
      result.vue = await js(`document.body.dataset.view`);
      assert(result.vue === 'db', 'vue db');
      result.groupes = await js(`[...document.querySelectorAll('.db-nav-group')].map(g => g.textContent)`);
      result.cartes = await js(`[...document.querySelectorAll('.studio-card-title')].map(t => t.textContent)`);
      assert(result.cartes.includes('Stats de base') && result.cartes.includes('Général'), 'cartes : ' + result.cartes);
      result.selecteur = await js(`document.querySelector('.studio-picker').textContent`);
      await shot('b_unite');
      // menu déroulant
      await js(`document.querySelector('[data-db-picker]').click()`);
      await until(`!!document.querySelector('.studio-pop.open')`);
      await shot('c_menu');
      await js(`[...document.querySelectorAll('#db-body .db-item')].find(e => e.textContent.includes('Lyn')).click()`);
      await until(`document.querySelector('.studio-hero h2').firstChild.textContent === 'Lyn' && !document.querySelector('.studio-pop.open')`);
      // classes, armes, compétences, système
      for (const [t, n] of [['classes', 'd_classe'], ['weapons', 'e_arme'], ['skills', 'f_competence'], ['arcs', 'g_chapitres'], ['resources', 'h_ressources'], ['system', 'i_systeme']]) {
        await js(`document.querySelector('#db-tabs button[data-tab="${t}"]').click()`);
        await wait(700); await shot(n);
      }
      assert(await js(`document.body.dataset.view === 'system'`), 'vue système');
      // onglet Son : écouter une musique, l'utiliser comme musique de phase ennemie
      await js(`document.querySelector('#db-tabs button[data-tab="sounds"]').click()`);
      await until(`!!document.querySelector('[data-sound]')`);
      result.sons = await js(`document.querySelectorAll('[data-sound]').length`);
      assert(result.sons >= 70, 'sons : ' + result.sons);
      await js(`[...document.querySelectorAll('[data-sound]')].find(e => e.dataset.sound.includes('Boss Battle')).click()`); await wait(300);
      await js(`document.querySelector('.snd-big').click()`); await wait(1500);
      result.lecture = await js(`!!document.querySelector('.snd-big.on')`);
      result.usage = await js(`[...document.querySelectorAll('.snd-usage li')].map(l => l.textContent)`);
      assert(result.usage.some(u => /boss/.test(u)), 'usage : ' + result.usage);
      await js(`document.querySelector('[data-sound-assign="enemyPhase"]').click()`); await wait(300);
      assert(await js(`Editor.project().meta.audio.enemyPhase.includes('Boss Battle')`), 'affectation');
      await shot('k_son');
      await js(`document.querySelector('.snd-big').click()`);
      // animations : rendu en combat
      await js(`document.querySelector('#db-tabs button[data-tab="animations"]').click()`);
      await until(`!!document.querySelector('[data-anim-scene]')`);
      await js(`[...document.querySelectorAll('#db-body .db-item')].find(e => e.textContent.includes('Feu')).click()`);
      await until(`!!document.querySelector('[data-anim-scene-play]')`);
      await wait(800);
      await js(`document.querySelector('[data-anim-scene-play]').click()`);
      await until(`document.querySelector('[data-anim-scene-play]').classList.contains('on')`);
      await wait(450); await shot('l_animation');
      await until(`!document.querySelector('[data-anim-scene-play]').classList.contains('on')`, 15000);
      // affinités (Données)
      await js(`document.querySelector('#db-tabs button[data-tab="supports"]').click()`);
      await until(`!!document.querySelector('.hero-pair')`);
      await wait(400); await shot('m_affinites');
      // descriptions affichées en jeu : armes, objets, compétences, classes
      result.descriptions = {};
      for (const t of ['weapons', 'items', 'skills', 'classes']) {
        await js(`DBEditor.open('${t}')`); await wait(300);
        result.descriptions[t] = await js(`[...document.querySelectorAll('#db-body .field-label')].some(l => /Description \\(affichée en jeu\\)/.test(l.textContent))`);
        assert(result.descriptions[t], 'description : ' + t);
      }
      await js(`document.querySelector('#db-tabs button[data-tab="weapons"]').click()`); await wait(300);
      await js(`(() => { const a = [...document.querySelectorAll('#db-body .field')].find(f => /Description \\(affichée/.test(f.textContent)).querySelector('textarea'); a.value = 'Une épée de fer, simple et fiable.'; a.dispatchEvent(new Event('input')); a.dispatchEvent(new Event('change')); })()`); await wait(300);
      result.arme = await js(`(() => { const w = Editor.db().weapons.find(w => w.description); return w && w.description; })()`);
      assert(result.arme === 'Une épée de fer, simple et fiable.', 'description enregistrée : ' + result.arme);
      await wait(200); await shot('n_description');
      // liste épinglée
      await js(`document.querySelector('#db-tabs button[data-tab="units"]').click()`); await wait(300);
      await js(`document.querySelector('.studio-pin').click()`);
      await until(`document.querySelector('#db-body').classList.contains('docked')`);
      await shot('j_epinglee');
      await js(`document.querySelector('.studio-pin').click()`);
      // retour à la carte
      await js(`document.querySelector('[data-rail="map"]').click()`);
      await until(`document.querySelector('#db').classList.contains('hidden') && document.body.dataset.view === 'map'`);
    } catch (e) { errors.push(String(e && e.stack || e)); }
    finish();
  });
};
