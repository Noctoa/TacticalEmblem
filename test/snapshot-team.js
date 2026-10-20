/* Camp : membre hors map, compétences, échanges pleins, promotion, sauvegarde et départ. */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict');
const { app } = require('electron');
const io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const js = (wc, code) => wc.executeJavaScript(code, true);
  const finish = result => { fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(result.ok ? 0 : 1); };
  const watchdog = setTimeout(() => finish({ ok: false, error: 'Délai global dépassé', errors }), 120000);
  const until = async (wc, code) => {
    const end = Date.now() + 18000;
    while (Date.now() < end) { if (await js(wc, code)) return; await delay(80); }
    throw new Error('Délai dépassé : ' + code);
  };
  const click = (wc, selector, text) => js(wc, `(() => {
    const button = [...document.querySelectorAll(${JSON.stringify(selector)})].find(el => el.textContent.includes(${JSON.stringify(text)}));
    if (!button) throw new Error('Bouton absent : ' + ${JSON.stringify(text)}); button.click();
  })()`);
  const set = (wc, selector, value) => js(wc, `(() => { const input = document.querySelector(${JSON.stringify(selector)}); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const shot = async (wc, name) => {
    await js(wc, `document.querySelectorAll('.modal-back').forEach(el => { el.style.animation = 'none'; })`);
    await wc.capturePage(); await delay(250); fs.writeFileSync(path.join(out, name + '.png'), (await wc.capturePage()).toPNG());
  };
  const watch = wc => { wc.setBackgroundThrottling(false); wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); }); };
  editor.webContents.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-team-ui-')), 'Jeu');
      const p = io.createProject(dir, 'Préparer l’équipe', 'sample', path.join(__dirname, '..', 'assets'));
      const hero = p.db.units.find(u => u.id === 'c_eliwood'), hector = p.db.units.find(u => u.id === 'c_hector');
      p.meta.lobby.initialRoster = [hero.id, hector.id];
      p.meta.lobby.spots = [{ unitId: 'c_lyn', x: 8, y: 8 }]; // PNJ présent, non recruté.
      hero.personalSkill = 'skill_precision';
      hero.learnedSkills = ['skill_sol', 'skill_luna', 'skill_garde', 'skill_esquive', 'skill_offensive', 'skill_miracle'];
      hero.equippedSkills = hero.learnedSkills.slice(0, 5);
      hero.inventory = [{ id: 'w_iron_sword', uses: 7 }, { id: 'i_vulnerary', uses: 2 }];
      hector.level = 10; hector.inventory = [{ id: 'w_iron_axe', uses: 4 }, { id: 'w_hand_axe', uses: 6 }, { id: 'i_vulnerary', uses: 2 }, { id: 'w_iron_sword', uses: 8 }, { id: 'w_iron_sword', uses: 9 }];
      p.db.classes.find(c => c.id === hector.classId).promotions[0].skills = ['skill_garde'];
      p.meta.convoy = { capacity: 2, items: [{ id: 'i_master_seal', uses: 1 }, { id: 'w_iron_sword', uses: 3 }] };
      const chapter = p.db.chapters[0];
      Object.assign(chapter, { objective: { type: 'survive', turns: 99 }, requiredUnits: [], events: [], allies: [], final: false });
      chapter.players = [{ unitId: hero.id, x: 3, y: 3 }, { unitId: hector.id, x: 3, y: 4 }];
      chapter.enemies = chapter.enemies.filter(e => e.isBoss); chapter.enemies[0].ai = 'stationary';
      io.saveProject(dir, p);
      // Les réglages de recrutement sont également manipulables dans l'éditeur.
      const ewc = editor.webContents; watch(ewc);
      await js(ewc, `Editor.open(${JSON.stringify(dir)})`);
      await until(ewc, `!!Editor.project()`);
      await js(ewc, `DBEditor.open('lobby')`);
      assert.equal(await js(ewc, `(() => {
        const form = [...document.querySelectorAll('#db-body .form')].find(el => el.textContent.includes('Effectif recruté au début'));
        const chips = [...form.querySelectorAll('.chip')];
        const hero = chips.find(el => el.textContent === 'Eliwood'), lyn = chips.find(el => el.textContent === 'Lyn');
        if (!hero.disabled || !hero.classList.contains('on') || lyn.classList.contains('on')) return false;
        lyn.click(); const added = Editor.project().meta.lobby.initialRoster.includes('c_lyn');
        lyn.click(); return added && !Editor.project().meta.lobby.initialRoster.includes('c_lyn');
      })()`), true);
      await js(ewc, `DBEditor.open('units', 'c_cloud')`);
      assert.equal(await js(ewc, `(() => {
        const label = [...document.querySelectorAll('#db-body .field-label')].find(el => el.textContent === 'Rejoint l’effectif après');
        const select = label.parentElement.querySelector('select'); if (select.value !== 'ch_1') return false;
        select.value = ''; select.dispatchEvent(new Event('change', { bubbles: true }));
        return Editor.project().db.units.find(u => u.id === 'c_cloud').recruitAfter === '';
      })()`), true);
      await js(ewc, `DBEditor.close()`);
      const start = async choice => {
        const win = openPlaytest(dir, ''); const wc = win.webContents; watch(wc);
        await new Promise(resolve => wc.once('did-finish-load', resolve)); await until(wc, `!!document.querySelector('.choice-list')`);
        await click(wc, '.choice-list button', choice); await until(wc, `PlaytestState.mode === 'lobby' && !PlaytestState.busy`);
        return { win, wc };
      };
      const first = await start('Classique'), wc = first.wc;
      assert.deepEqual(await js(wc, 'PlaytestState.units.map(u => u.sourceId)'), ['c_eliwood', 'c_lyn']);
      await js(wc, 'PlaytestLobby.openMenu()');
      await js(wc, `PlaytestState.menu.items.find(i => i.label === 'Équipe').action()`);
      await until(wc, `!!document.querySelector('[data-team-unit="c_hector"]')`);
      assert.equal(await js(wc, `!!document.querySelector('[data-team-unit="c_lyn"]')`), false);
      assert.equal(await js(wc, `document.querySelectorAll('[data-team-skill-slot] option[value="skill_precision"]').length`), 0);
      await set(wc, '[data-team-skill-slot="0"]', 'skill_miracle');
      assert.equal(await js(wc, `PlaytestLobby.state.members[0].equippedSkills[0]`), 'skill_miracle');
      assert.equal(await js(wc, `PlaytestLobby.state.members[0].learnedSkills.includes('skill_sol')`), true);
      assert.equal(await js(wc, `PlaytestLobby.state.members[0].personalSkill`), 'skill_precision');
      await shot(wc, 'team-skills');
      await js(wc, `document.querySelector('[data-team-tab="items"]').click()`);
      // Potion vers le convoi plein : annuler ne déplace rien, puis échanger contre l'épée usée.
      const before = await js(wc, 'JSON.stringify([PlaytestLobby.state.members.map(u => u.inventory), PlaytestState.convoy])');
      await js(wc, `document.querySelector('[data-team-transfer="c_eliwood:1"]').click()`);
      await click(wc, '.choice-list button', 'Convoi'); await until(wc, `document.querySelector('.modal-back').textContent.includes('Échanger avec')`);
      await click(wc, '.modal-actions button', 'Annuler'); await until(wc, '!PlaytestState.busy');
      assert.equal(await js(wc, 'JSON.stringify([PlaytestLobby.state.members.map(u => u.inventory), PlaytestState.convoy])'), before);
      await js(wc, `document.querySelector('[data-team-transfer="c_eliwood:1"]').click()`);
      await click(wc, '.choice-list button', 'Convoi'); await until(wc, `document.querySelector('.modal-back').textContent.includes('Échanger avec')`);
      await click(wc, '.choice-list button', 'Épée de fer'); await until(wc, '!PlaytestState.busy');
      assert.equal(await js(wc, 'PlaytestLobby.state.members[0].inventory[1].uses'), 3);
      assert.equal(await js(wc, `PlaytestState.convoy.find(s => s.id === 'i_vulnerary').uses`), 2);
      await js(wc, `document.querySelector('[data-item-move="-1:1"]').click()`);
      assert.equal(await js(wc, 'PlaytestLobby.state.members[0].inventory[0].uses'), 3);
      // Sceau du convoi vers Hector (absent de la map et inventaire plein).
      await js(wc, `document.querySelector('[data-team-transfer="@convoy:0"]').click()`);
      await click(wc, '.choice-list button', 'Hector'); await until(wc, `document.querySelector('.modal-back').textContent.includes('Échanger avec')`);
      await click(wc, '.choice-list button', 'Hache de fer'); await until(wc, '!PlaytestState.busy');
      await shot(wc, 'team-inventory');
      await js(wc, `document.querySelector('[data-team-unit="c_hector"]').click(); document.querySelector('[data-team-tab="promotions"]').click(); document.querySelector('[data-team-promote]').click()`);
      await until(wc, `!!document.querySelector('[data-promote-to="great_lord"]')`); await shot(wc, 'team-promotion');
      assert.equal(await js(wc, `document.querySelector('.promotion-choices').textContent.includes('consomme l’action')`), false);
      await js(wc, `document.querySelector('[data-promote-to="great_lord"]').click()`);
      await until(wc, `document.querySelector('.modal-back').textContent.includes('Confirmer la promotion')`); await click(wc, '.modal-actions button', 'Promouvoir');
      await until(wc, `document.querySelector('.modal-back').textContent.includes('Promotion réussie')`); await click(wc, '.modal-actions button', 'OK');
      await until(wc, `document.querySelector('.modal-back').textContent.includes('Compétence apprise')`); await click(wc, '.modal-actions button', 'OK');
      await until(wc, '!PlaytestState.busy && !document.querySelector(".modal-back")');
      assert.equal(await js(wc, `PlaytestLobby.state.members.find(u => u.sourceId === 'c_hector').classId`), 'great_lord');
      assert.equal(await js(wc, `PlaytestLobby.state.members.find(u => u.sourceId === 'c_hector').done`), false);
      assert.equal(await js(wc, 'PlaytestState.mode'), 'lobby');
      await js(wc, `document.querySelector('[data-team-save]').click()`); await until(wc, `!!document.querySelector('#settings .st-slot button')`);
      await js(wc, `document.querySelector('#settings .st-slot button').click()`);
      await until(wc, `!!document.querySelector('#settings .st-slot:not(.empty)')`);
      const saved = JSON.parse(fs.readFileSync(path.join(dir, 'saves/slot-1.json'), 'utf8'));
      assert.deepEqual(saved.campaign.recruited, ['c_eliwood', 'c_hector']);
      assert.equal(saved.campaign.units.c_hector.classId, 'great_lord'); assert.ok(!saved.campaign.units.c_lyn);
      const expected = saved.campaign.units; first.win.close();
      const resumed = await start('Continuer'), rwc = resumed.wc;
      assert.deepEqual(await js(rwc, 'PlaytestState.campaign.units'), expected);
      assert.equal(await js(rwc, 'PlaytestLobby.state.members.length'), 2);
      await js(rwc, 'PlaytestLobby.openTeam()'); await shot(rwc, 'team-restored');
      await js(rwc, 'PlaytestLobby.closePanel(); PlaytestLobby.openMenu(); PlaytestState.menu.items.find(i => i.label === PlaytestLobby.state.cfg.board.label).action()');
      await click(rwc, '#lobby-panel .lp-go', 'Partir'); await until(rwc, `!!document.querySelector('.modal-back')`); await click(rwc, '.modal-actions button', 'Partir');
      await until(rwc, `PlaytestState.mode === 'chapter' && !PlaytestState.busy && PlaytestState.phase === 'player'`);
      const deployed = await js(rwc, `PlaytestState.units.filter(u => u.team === 'player').map(u => ({ id: u.sourceId, classId: u.classId, equippedSkills: u.equippedSkills, inventory: u.inventory }))`);
      for (const unit of deployed) {
        assert.equal(unit.classId, expected[unit.id].classId); assert.deepEqual(unit.equippedSkills, expected[unit.id].equippedSkills); assert.deepEqual(unit.inventory, expected[unit.id].inventory);
      }
      await js(rwc, 'PlaytestState.turn = 100; void PlaytestDebug.checkEnd()'); await until(rwc, 'PlaytestState.over');
      await click(rwc, '#end button', 'Retour au camp'); await until(rwc, `PlaytestState.mode === 'lobby' && !PlaytestState.busy`);
      assert.equal(await js(rwc, `PlaytestLobby.state.members.some(u => u.sourceId === 'c_cloud')`), true);
      assert.equal(await js(rwc, `PlaytestState.units.some(u => u.sourceId === 'c_cloud')`), false);
      assert.deepEqual(errors, []); clearTimeout(watchdog);
      finish({ ok: true, reserveMember: true, npcExcluded: true, skills: true, fullConvoySwap: true, fullInventorySwap: true, cancellation: true, reorder: true,
        campPromotion: true, noTurnConsumed: true, saveAndLoad: true, deployedState: true, milestoneRecruit: true, editorRecruitment: true, errors });
    } catch (e) { clearTimeout(watchdog); finish({ ok: false, error: e.stack, errors }); }
  });
};
