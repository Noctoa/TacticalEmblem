/* Copie d’événements entre actes : TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=... npm start */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict');
const { app } = require('electron'), io = require('../src/main/project-io');
module.exports = editor => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const wc = editor.webContents, errors = [], result = {}, wait = ms => new Promise(r => setTimeout(r, ms));
  const js = code => wc.executeJavaScript(code, true);
  const finish = () => { clearTimeout(watchdog); result.errors = errors; result.ok = !errors.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(result.ok ? 0 : 1); };
  const watchdog = setTimeout(() => { errors.push('Délai global dépassé'); finish(); }, 90000);
  const shot = async name => { await js(`document.querySelector('#toast-root').replaceChildren()`); await wc.capturePage(); await wait(150); fs.writeFileSync(path.join(out, name + '.png'), (await wc.capturePage()).toPNG()); };
  wc.setBackgroundThrottling(false);
  wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
  wc.once('did-finish-load', async () => {
    try {
      editor.setSize(1440, 900);
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-event-clipboard-')), 'Jeu');
      io.createProject(dir, 'Copier les événements', 'sample', path.join(__dirname, '..', 'assets'));
      await js(`Editor.open(${JSON.stringify(dir)})`);
      await js(`(() => {
        const db = Editor.db(), source = db.chapters[0];
        source.name = 'Acte source';
        source.chests = [{ id: 'coffre', name: 'Coffre source', x: 1, y: 1 }];
        source.doors = [{ id: 'porte', name: 'Porte source', x: 2, y: 1, openTerrainId: 'floor' }];
        source.enemies.push({ id: 'renfort', name: 'Renfort source', eventOnly: true, classId: db.classes[0].id, x: 3, y: 1 });
        source.events = [{ id: 'ev3', name: 'Piège du coffre', once: false, campaignOnce: true,
          trigger: { type: 'chest', target: 'coffre' }, script: 'Eliwood: Attention !',
          conditions: { present: ['c_eliwood'], flags: [{ key: 'porteOuverte', value: true }] },
          actions: [{ type: 'dialogue', text: '@dialogues#piege' }, { type: 'gold', amount: 300 },
            { type: 'reinforcement', target: 'renfort', count: 3 }, { type: 'door', target: 'porte', open: false },
            { type: 'status', target: 'renfort', statusId: 'poison', turns: 3, remove: false },
            { type: 'status', target: 'unit:c_eliwood', statusId: 'poison', turns: 2, remove: false },
            { type: 'objective', objective: { type: 'target', target: 'renfort', text: 'Arrêtez-le !' } },
            { type: 'custom', plugin: 'absent', settings: { values: [1, 2] } }] }];
        const target = JSON.parse(JSON.stringify(source)); target.id = 'clipboard_target'; target.name = 'Acte d’arrivée'; delete target.events;
        db.chapters.push(target); window.clipboardSourceId = source.id;
        DBEditor.open('chapters', source.id);
      })()`);
      assert.equal(await js(`document.querySelector('[data-event-paste]').disabled`), true);
      // Copier depuis une fiche repliée ne la déplie pas et ne modifie pas le projet.
      await js(`document.querySelector('[data-event-id]').open = false; EditorState.dirty = false; document.querySelector('[data-event-copy]').click()`);
      assert.equal(await js(`document.querySelector('[data-event-id]').open`), false);
      assert.equal(await js(`EditorState.dirty`), false);
      assert.match(await js(`document.querySelector('[data-event-clipboard]').textContent`), /Piège du coffre.*Acte source/);
      // Une modification de la source après copie ne modifie pas le presse-papiers.
      await js(`Editor.db().chapters[0].events[0].actions[1].amount = 999; document.querySelector('[data-event-paste]').click()`);
      const same = await js(`Editor.db().chapters[0].events.at(-1)`);
      assert.notEqual(same.id, 'ev3'); assert.equal(same.actions[1].amount, 300);
      assert.equal(same.trigger.target, 'coffre'); assert.equal(same.actions[2].target, 'renfort');
      // Acte d’arrivée sans events ; les identifiants locaux identiques ne sont pas réutilisés.
      await js(`DBEditor.open('units'); DBEditor.open('chapters', 'clipboard_target'); document.querySelector('[data-event-paste="bottom"]').click()`);
      const first = await js(`Editor.db().chapters.at(-1).events[0]`);
      assert.notEqual(first.id, 'ev3'); assert.equal(first.name, 'Piège du coffre (copie)');
      assert.equal(first.trigger.target, '');
      for (const i of [2, 3, 4]) assert.equal(first.actions[i].target, '');
      assert.equal(first.actions[6].objective.target, '');
      assert.equal(first.actions[5].target, 'unit:c_eliwood');
      assert.equal(first.actions[0].text, '@dialogues#piege');
      assert.deepEqual(first.conditions, same.conditions);
      assert.deepEqual(first.actions[7], same.actions[7]);
      assert.equal(first.once, false); assert.equal(first.campaignOnce, true);
      assert.equal(await js(`EditorState.dirty`), true);
      assert.ok(await js(`document.querySelectorAll('[data-scenario-editor] .note').length > 0`));
      assert.equal(await js(`document.activeElement.tagName`), 'SUMMARY');
      await shot('a_evenement_colle');
      // Coller plusieurs fois produit des copies indépendantes et des identifiants uniques.
      await js(`document.querySelector('[data-event-paste]').click(); Editor.db().chapters.at(-1).events[0].actions[7].settings.values.push(3)`);
      const copies = await js(`Editor.db().chapters.at(-1).events`);
      assert.notEqual(copies[0].id, copies[1].id);
      assert.deepEqual(copies[1].actions[7].settings.values, [1, 2]);
      // Les déclencheurs par zone et mort, ainsi que leurs coordonnées, sont conservés.
      for (const [trigger, expected] of [
        [{ type: 'area', who: 'enemy:renfort', x: 1, y: 2, w: 2, h: 1 }, { type: 'area', who: '', x: 1, y: 2, w: 2, h: 1 }],
        [{ type: 'death', target: 'renfort' }, { type: 'death', target: '' }],
        [{ type: 'death', target: 'unit:c_eliwood' }, { type: 'death', target: 'unit:c_eliwood' }]
      ]) {
        await js(`Editor.db().chapters[0].events[0].trigger = ${JSON.stringify(trigger)}; DBEditor.open('chapters', window.clipboardSourceId); document.querySelector('[data-event-copy]').click(); DBEditor.open('chapters', 'clipboard_target'); document.querySelector('[data-event-paste]').click()`);
        assert.deepEqual(await js(`Editor.db().chapters.at(-1).events.at(-1).trigger`), expected);
      }
      // Rechoisir les cibles dans les vrais formulaires avant sauvegarde.
      await js(`(() => {
        const select = (parent, key, value) => {
          const label = [...parent.querySelectorAll('.field-label')].find(el => el.textContent === key || el.textContent === key + '?');
          if (!label) throw new Error('Champ absent : ' + key);
          const input = label.parentElement.querySelector('select'); input.value = value;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        };
        for (const card of document.querySelectorAll('[data-event-id]')) {
          const ev = Editor.db().chapters.at(-1).events.find(ev => ev.id === card.dataset.eventId);
          if (ev.trigger.type === 'chest') select(card, 'Interaction', 'coffre');
          if (ev.trigger.type === 'death' && ev.trigger.target === '') select(card, 'Unité vaincue', 'renfort');
          if (ev.trigger.type === 'area') select(card, 'Déclenché par', 'enemy:renfort');
          select(card.querySelector('[data-event-action="2"]'), 'Renfort placé sur la map', 'renfort');
          select(card.querySelector('[data-event-action="3"]'), 'Porte', 'porte');
          select(card.querySelector('[data-event-action="4"]'), 'Unité ciblée', 'renfort');
          select(card.querySelector('[data-event-action="6"]'), 'Cible', 'renfort');
        }
      })()`);
      assert.equal(await js(`document.querySelectorAll('[data-event-validation] .note').length`), 0);
      await js(`Editor.command('save')`);
      const saved = io.loadProject(dir).db.chapters.at(-1).events;
      assert.equal(saved.length, 5); assert.equal(new Set(saved.map(e => e.id)).size, 5);
      result.copiesEnregistrees = saved.length;
      editor.setSize(1024, 700);
      await js(`document.querySelector('[data-scenario-editor]').scrollIntoView({ block: 'start' }); document.querySelectorAll('[data-event-id]').forEach(card => card.open = false)`);
      await shot('b_fiches_repliees');
      // Un autre projet ne reçoit pas le presse-papiers du précédent.
      const otherDir = path.join(path.dirname(dir), 'Autre'); io.createProject(otherDir, 'Autre', 'sample', path.join(__dirname, '..', 'assets'));
      await js(`Editor.open(${JSON.stringify(otherDir)});`);
      await js(`DBEditor.open('chapters', Editor.db().chapters[0].id)`);
      assert.equal(await js(`document.querySelector('[data-event-paste]').disabled`), true);
    } catch (e) { errors.push(e.stack || String(e)); }
    finish();
  });
};
