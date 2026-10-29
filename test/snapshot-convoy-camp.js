/* Camp : menu du camp › Convoi — déposer, prendre, catégories, échange quand l'inventaire est plein, convoi plein. */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict');
const { app } = require('electron');
const io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], result = {}, delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const js = (wc, code) => wc.executeJavaScript(code, true);
  const finish = () => { result.errors = errors; result.ok = !errors.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errors.push('délai global dépassé'); finish(); }, 120000);
  const until = async (wc, code) => {
    const end = Date.now() + 18000;
    while (Date.now() < end) { if (await js(wc, code)) return; await delay(80); }
    throw new Error('Délai dépassé : ' + code);
  };
  const shot = async (wc, name) => {
    await js(wc, `document.querySelectorAll('.modal-back').forEach(el => { el.style.animation = 'none'; })`);
    await wc.capturePage(); await delay(250); fs.writeFileSync(path.join(out, name + '.png'), (await wc.capturePage()).toPNG());
  };
  editor.webContents.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-convoy-camp-')), 'Jeu');
      const p = io.createProject(dir, 'Convoi du camp', 'sample', path.join(__dirname, '..', 'assets'));
      const hero = p.db.units.find(u => u.id === 'c_eliwood'), hector = p.db.units.find(u => u.id === 'c_hector');
      p.meta.lobby.initialRoster = [hero.id, hector.id];
      hero.inventory = [{ id: 'w_iron_sword', uses: 7 }, { id: 'i_vulnerary', uses: 2 }];
      hector.inventory = [{ id: 'w_iron_axe', uses: 4 }, { id: 'w_hand_axe', uses: 6 }, { id: 'i_vulnerary', uses: 2 }, { id: 'w_iron_axe', uses: 8 }, { id: 'w_iron_axe', uses: 9 }];
      p.meta.convoy = { capacity: 5, items: [{ id: 'i_master_seal', uses: 1 }, { id: 'w_steel_sword', uses: 30 }, { id: 'w_iron_lance', uses: 20 }, { id: 'w_fire', uses: 40 }] };
      io.saveProject(dir, p);
      const win = openPlaytest(dir, ''); const wc = win.webContents;
      wc.setBackgroundThrottling(false); win.setSize(1100, 760);
      wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
      await new Promise(resolve => wc.once('did-finish-load', resolve)); await until(wc, `!!document.querySelector('.choice-list')`);
      await js(wc, `[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
      await until(wc, `PlaytestState.mode === 'lobby' && !PlaytestState.busy`);
      // menu du camp : entrée « Convoi »
      await js(wc, 'PlaytestLobby.openMenu()');
      result.menu = await js(wc, `PlaytestState.menu.items.map(i => i.label + (i.sub ? ' (' + i.sub + ')' : ''))`);
      assert.ok(result.menu.includes('Convoi (4/5 objets)'), 'menu : ' + result.menu);
      await js(wc, `PlaytestState.menu.items.find(i => i.label === 'Convoi').action()`);
      await until(wc, `!!document.querySelector('#lobby-panel.convoy-panel [data-convoy-list]')`);
      const view = () => js(wc, `({ inv: [...document.querySelectorAll('[data-convoy-inventory] .cvp-name')].map(e => e.textContent),
        conv: [...document.querySelectorAll('[data-convoy-list] .cvp-name')].map(e => e.textContent),
        cats: [...document.querySelectorAll('[data-convoy-cat]')].map(e => e.textContent), convoy: PlaytestState.convoy.length })`);
      result.debut = await view();
      assert.deepEqual(result.debut.inv, ['Épée de ferE', 'Potion']);
      assert.equal(result.debut.conv.length, 4);
      await delay(400); await shot(wc, 'a_convoi');
      // déposer la Potion d'Eliwood
      await js(wc, `document.querySelector('[data-convoy-deposit="1"]').click()`);
      result.depot = await view();
      assert.deepEqual(result.depot.inv, ['Épée de ferE']); assert.equal(result.depot.convoy, 5);
      // convoi plein : « Déposer » désactivé
      assert.equal(await js(wc, `document.querySelector('[data-convoy-deposit="0"]').disabled`), true, 'convoi plein');
      // catégorie Épées puis prendre l'Épée d'acier
      await js(wc, `document.querySelector('[data-convoy-cat="sword"]').click()`);
      result.epees = await view();
      assert.deepEqual(result.epees.conv, ["Épée d'acier"]);
      await js(wc, `document.querySelector('[data-convoy-list] [data-convoy-take]').click()`);
      result.pris = await view();
      assert.deepEqual(result.pris.inv, ['Épée de ferE', "Épée d'acier"]); assert.equal(result.pris.convoy, 4);
      // Hector (inventaire plein) : prendre la Lance de fer → échange avec une de ses haches
      await js(wc, `document.querySelector('[data-convoy-unit="c_hector"]').click()`);
      await js(wc, `document.querySelector('[data-convoy-cat="lance"]').click()`);
      assert.match(await js(wc, `document.querySelector('[data-convoy-list] [data-convoy-take]').textContent`), /Échanger/);
      await js(wc, `document.querySelector('[data-convoy-list] [data-convoy-take]').click()`);
      await until(wc, `!!document.querySelector('.choice-list')`);
      await delay(300); await shot(wc, 'b_echange');
      await js(wc, `[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Hachette')).click()`);
      await until(wc, `!document.querySelector('.choice-list')`);
      result.echange = await view();
      assert.ok(result.echange.inv.includes('Lance de fer') && !result.echange.inv.includes('Hachette'), 'échange : ' + result.echange.inv);
      assert.equal(result.echange.convoy, 4);
      result.campagne = await js(wc, `PlaytestState.campaign.roster ? Object.keys(PlaytestState.campaign.roster) : null`);
      await delay(300); await shot(wc, 'c_apres');
    } catch (e) { errors.push(String(e && e.stack || e)); }
    finish();
  });
};
