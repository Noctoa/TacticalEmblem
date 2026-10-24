/*
 * Générateur de personnage : fenêtre de l'éditeur (pièces, couleurs, position), portrait et sprite de map écrits
 * dans ressources/personnages/<Nom>/ ; protagoniste créé par le joueur à la nouvelle partie (nom, apparence,
 * sauvegarde et reprise).
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-generator.js npm start
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { app } = require('electron');
const io = require('../src/main/project-io');
module.exports = (editor, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const errors = [], result = {};
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const finish = () => { result.errors = errors; result.ok = !errors.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errors.push('délai global dépassé'); finish(); }, 150000);
  const ewc = editor.webContents;
  ewc.on('console-message', (e, level, message) => { if (level >= 3) errors.push('[éditeur] ' + message); });
  const mk = (wc) => ({
    js: c => wc.executeJavaScript(c, true),
    until: async (c, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await wc.executeJavaScript(c, true)) return; await wait(80); } throw new Error('Délai : ' + c); },
    shot: async n => { await wc.capturePage(); await wait(300); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); }
  });
  ewc.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-gen-')), 'Jeu');
      const p = io.createProject(dir, 'Générateur', 'sample', path.join(__dirname, '..', 'assets'));
      io.saveProject(dir, p);
      const E = mk(ewc);
      await E.js(`Editor.open(${JSON.stringify(dir)})`);
      await E.until(`!!Editor.db()`);
      // ---- 1. éditeur : Unités › Lyn › Créer avec le générateur
      await E.js(`DBEditor.open('units', 'c_lyn')`);
      await E.until(`!!document.querySelector('[data-generator-open]')`);
      await E.js(`document.querySelector('[data-generator-open]').click()`);
      await E.until(`!!document.querySelector('.cg-win [data-cg-label="hair"]') && document.querySelector('[data-cg-label="hair"]').textContent !== ''`, 20000);
      result.defaut = await E.js(`({ cheveux: document.querySelector('[data-cg-label="hair"]').textContent, visage: document.querySelector('[data-cg-label="face"]').textContent })`);
      assert(result.defaut.cheveux === 'Lyn' && result.defaut.visage === 'Lyn', 'pièces de départ du même nom : ' + JSON.stringify(result.defaut));
      await wait(300); await E.shot('a_generateur');
      // choisir des cheveux dans la grille, une couleur, décaler le visage
      await E.js(`document.querySelector('[data-cg-choose="hair"]').click()`);
      await E.until(`document.querySelectorAll('[data-cg-picker="hair"] .cg-cell').length > 100`);
      await E.js(`(() => { const s = document.querySelector('[data-cg-picker="hair"] .cg-search'); s.value = 'ninian'; s.dispatchEvent(new Event('input')); })()`);
      await E.until(`document.querySelectorAll('[data-cg-picker="hair"] .cg-cell').length === 1`);
      await wait(200); await E.shot('b_grille');
      await E.js(`document.querySelector('[data-cg-picker="hair"] .cg-cell').click()`);
      await E.until(`document.querySelector('[data-cg-label="hair"]').textContent === 'Ninian'`);
      // portrait : 225 dégradés pour chaque teinte (cheveux, yeux, métal…), 34 pour la peau (du plus clair au plus foncé)
      const pick = async (sel) => { await E.js(`document.querySelector('${sel}').click()`); await wait(60); };
      assert(await E.js(`document.querySelectorAll('[data-cg-ramp^="hair:"]').length === 225`), 'nuancier cheveux');
      await pick('[data-cg-ramp="hair:120"]');
      await pick('[data-cg-group="skin"]');
      assert(await E.js(`document.querySelectorAll('[data-cg-ramp^="skin:"]').length === 34`), 'nuancier peau');
      await pick('[data-cg-ramp="skin:9"]');
      await pick('[data-cg-group="eyes"]'); await pick('[data-cg-ramp="eyes:30"]');
      assert(await E.js(`document.querySelector('[data-cg-ramp="eyes:30"]').classList.contains('on') && !document.querySelector('[data-cg-eyes-hair]').classList.contains('on')`), 'sélection visible');
      await pick('[data-cg-group="trim"]'); assert(await E.js(`document.querySelectorAll('[data-cg-ramp^="trim:"]').length === 225`), 'nuancier ornements');
      await wait(200); await E.shot('c1_couleurs_portrait');
      // carte : couleurs propres (tissu)
      await pick('[data-cg-tab="map"]');
      assert(await E.js(`document.querySelector('[data-cg-map-linked]').checked && !document.querySelector('[data-cg-ramp]')`), 'carte liée au portrait');
      await pick('[data-cg-map-linked]'); await pick('[data-cg-group="cloth"]'); await pick('[data-cg-ramp="cloth:5"]');
      await wait(200); await E.shot('c2_couleurs_carte');
      // combat : tenue de l'animation de la classe
      await pick('[data-cg-tab="battle"]');
      assert(await E.js(`!!document.querySelector('[data-cg-battler]') && document.querySelector('[data-cg-battle-origin]').classList.contains('on')`), 'combat : aperçu, couleurs d’origine');
      await pick('[data-cg-ramp="battle:10"]');
      await wait(200); await E.shot('c3_couleurs_combat');
      await pick('[data-cg-tab="portrait"]');
      await E.js(`document.querySelector('[data-cg-offset="face:1"]').nextElementSibling.click()`);
      assert(await E.js(`document.querySelector('[data-cg-offset="face:1"]').textContent === '1'`), 'décalage');
      await wait(200); await E.shot('c_retouche');
      await E.js(`document.querySelector('[data-cg-ok]').click()`);
      await E.until(`(Editor.db().units.find(u => u.id === 'c_lyn').generator || {}).hair === 'Ninian'`, 20000);
      result.unite = await E.js(`(() => { const u = Editor.db().units.find(u => u.id === 'c_lyn'); return { portrait: u.portrait, sprite: u.mapSprite, couleur: u.generator.colors.hair, rampes: u.generator.ramps, yeux: u.generator.colors.eyes, carte: u.generator.map, combat: u.battleColors, decalage: u.generator.offsets.face, enRessources: !!Editor.resources().characters[u.mapSprite] }; })()`);
      assert(result.unite.portrait === 'ressources/personnages/Lyn/portrait_genere.png' && result.unite.sprite === 'ressources/personnages/Lyn/map_genere' && result.unite.enRessources, 'unité : ' + JSON.stringify(result.unite));
      const R = require('../src/shared/char-gen');
      assert(result.unite.rampes.hair.join() === R.HAIR_RAMPS[120].join() && result.unite.rampes.skin.join() === R.SKIN_RAMPS[9].join(), 'dégradés : ' + JSON.stringify(result.unite.rampes));
      assert(result.unite.couleur === R.HAIR_RAMPS[120][1] && result.unite.yeux === R.HAIR_RAMPS[30][1] && result.unite.rampes.eyes.join() === R.HAIR_RAMPS[30].join() && result.unite.decalage[1] === 1, 'recette');
      assert(result.unite.carte && result.unite.carte.ramps.cloth.join() === R.HAIR_RAMPS[5].join() && !(result.unite.rampes.cloth || []).length, 'carte : ' + JSON.stringify(result.unite.carte));
      assert(result.unite.combat === 'custom:' + R.HAIR_RAMPS[10].join(','), 'combat : ' + result.unite.combat);
      const png = fs.readFileSync(path.join(dir, 'ressources/personnages/Lyn/portrait_genere.png'));
      assert(png.readUInt32BE(16) === 128 && png.readUInt32BE(20) === 112, 'face set 128 × 112');
      const sheet = JSON.parse(fs.readFileSync(path.join(dir, 'ressources/personnages/Lyn/map_genere.json'), 'utf8'));
      assert(sheet.type === 'mapsprite' && sheet.base === 32 && sheet.anims.left && sheet.teamColors.join() === R.HAIR_RAMPS[5].join(), 'sprite de map (couleurs d’équipe = tissu de la carte)');
      await E.until(`!!document.querySelector('[data-generator-open]') && /Retoucher/.test(document.querySelector('[data-generator-open]').textContent)`);
      await E.js(`document.querySelector('[data-generator-open]').scrollIntoView({ block: 'center' })`);
      await wait(400); await E.shot('d_fiche_unite');
      // ---- 2. Système : protagoniste créé par le joueur
      await E.js(`DBEditor.open('system')`);
      await E.until(`[...document.querySelectorAll('.field-label, label')].some(l => /crée l’apparence de son protagoniste/.test(l.textContent))`);
      await E.js(`(() => { const l = [...document.querySelectorAll('label')].find(l => /crée l’apparence de son protagoniste/.test(l.textContent)); const c = l.querySelector('input') || l.parentElement.querySelector('input[type=checkbox]'); c.click(); })()`);
      await E.until(`Editor.project().meta.avatar.enabled === true && Editor.project().meta.avatar.unitId === 'c_eliwood'`);
      await E.js(`DBEditor.close()`); ewc.send('menu', 'save'); await E.until('!Editor.state.dirty');
      const saved = io.loadProject(dir);
      assert(saved.db.units.find(u => u.id === 'c_lyn').generator.hair === 'Ninian' && saved.meta.avatar.enabled, 'projet enregistré');

      // ---- 3. jeu : nouvelle partie → création du protagoniste
      const start = async (choice) => {
        const win = openPlaytest(dir, ''), wc = win.webContents; wc.setBackgroundThrottling(false); win.setSize(1200, 820);
        wc.on('console-message', (e, level, message) => { if (level >= 3) errors.push(message); });
        await new Promise(r => wc.once('did-finish-load', r));
        const G = mk(wc);
        await G.until(`!!document.querySelector('.choice-list')`);
        await G.js(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes(${JSON.stringify(choice)})).click()`);
        return { win, wc, G };
      };
      const first = await start('Classique'), G = first.G;
      await G.until(`!!document.querySelector('.cg-back.cg-game [data-cg-name]')`, 20000);
      result.nomDefaut = await G.js(`document.querySelector('[data-cg-name]').value`);
      assert(result.nomDefaut === 'Eliwood', 'nom proposé : ' + result.nomDefaut);
      await G.js(`(() => { const i = document.querySelector('[data-cg-name]'); i.value = 'Kael'; i.dispatchEvent(new Event('input')); })()`);
      await G.js(`document.querySelector('[data-cg-random]').click()`);
      // sprite de map animé tiré de la bibliothèque FE : filtre par catégorie + recherche
      await G.js(`document.querySelector('[data-cg-choose="sprite"]').click()`);
      await G.until(`document.querySelectorAll('[data-cg-picker="sprite"] .cg-cell').length > 500`);
      await G.js(`(() => { const s = document.querySelector('[data-cg-sprite-group]'); s.value = [...s.options].find(o => /Myrms and Swordmasters/.test(o.value)).value; s.dispatchEvent(new Event('change')); })()`);
      await G.until(`document.querySelectorAll('[data-cg-picker="sprite"] .cg-cell').length > 5 && document.querySelectorAll('[data-cg-picker="sprite"] .cg-cell').length < 200`);
      await wait(300); await G.shot('e0_jeu_sprites_fe');
      await G.js(`(() => { const s = document.querySelector('[data-cg-picker="sprite"] input.cg-search'); s.value = 'swordmaster'; s.dispatchEvent(new Event('input')); })()`);
      await G.until(`document.querySelectorAll('[data-cg-picker="sprite"] .cg-cell').length >= 1`);
      result.spriteFE = await G.js(`document.querySelector('[data-cg-picker="sprite"] .cg-cell').dataset.cgPart`);
      await G.js(`document.querySelector('[data-cg-picker="sprite"] .cg-cell').click()`);
      await G.until(`document.querySelector('[data-cg-row="token"]').classList.contains('cg-unused')`);
      await wait(400); await G.shot('e_jeu_creation');
      assert(await G.js(`!document.querySelector('[data-cg-cancel]')`), 'pas d’annulation en jeu');
      await G.js(`document.querySelector('[data-cg-ok]').click()`);
      await G.until(`PlaytestState.mode === 'lobby' && !PlaytestState.busy`, 25000);
      result.jeu = await G.js(`(() => { const S = PlaytestState, u = S.db.units.find(u => u.id === 'c_eliwood'); return { nom: u.name, avatar: S.campaign.avatar && S.campaign.avatar.name, portrait: u.portrait.slice(0, 22), sprite: u.mapSprite, meta: !!S.resources.characters[u.mapSprite] }; })()`);
      assert(result.jeu.nom === 'Kael' && result.jeu.avatar === 'Kael' && result.jeu.portrait.startsWith('data:image/png') && result.jeu.sprite === 'avatar:c_eliwood' && result.jeu.meta, 'avatar : ' + JSON.stringify(result.jeu));
      result.jeuSprite = await G.js(`(() => { const m = PlaytestState.resources.characters['avatar:c_eliwood']; return { base: m.base, frame: m.frame, source: m.source, recette: PlaytestState.campaign.avatar.recipe.sprite }; })()`);
      assert(result.jeuSprite.base === 16 && result.jeuSprite.frame[0] === 32 && /^FE-Repo/.test(result.jeuSprite.source) && result.jeuSprite.recette === result.spriteFE, 'sprite FE : ' + JSON.stringify(result.jeuSprite));
      await wait(500); await G.shot('f_camp');
      // équipe : portrait et nom
      await G.js('PlaytestLobby.openTeam()');
      await G.until(`!!document.querySelector('.tb-card .tb-name')`);
      assert(await G.js(`[...document.querySelectorAll('.tb-uname')].some(e => e.textContent === 'Kael')`), 'équipe');
      await wait(400); await G.shot('g_equipe');
      await G.js('PlaytestLobby.closePanel()');
      // sauvegarde puis reprise : le protagoniste revient tel quel
      await G.js(`PlaytestSettings.open('save')`); await G.until(`!!document.querySelector('#settings .st-slot button')`);
      await G.js(`document.querySelector('#settings .st-slot button').click()`);
      await G.until(`!!document.querySelector('#settings .st-slot:not(.empty)')`);
      const save = JSON.parse(fs.readFileSync(path.join(dir, 'saves/slot-1.json'), 'utf8'));
      assert(save.campaign.avatar && save.campaign.avatar.name === 'Kael' && save.campaign.avatar.recipe.hair, 'sauvegarde');
      first.win.close();
      const again = await start('Continuer');
      await again.G.until(`PlaytestState.mode === 'lobby' && !PlaytestState.busy`, 25000);
      result.reprise = await again.G.js(`(() => { const u = PlaytestState.db.units.find(u => u.id === 'c_eliwood'); return { nom: u.name, sprite: u.mapSprite, base: PlaytestState.resources.characters[u.mapSprite].base }; })()`);
      assert(result.reprise.nom === 'Kael' && result.reprise.sprite === 'avatar:c_eliwood' && result.reprise.base === 16, 'reprise : ' + JSON.stringify(result.reprise));
      await wait(400); await again.G.shot('h_reprise');
    } catch (e) { errors.push(String(e && e.stack || e)); }
    finish();
  });
};
