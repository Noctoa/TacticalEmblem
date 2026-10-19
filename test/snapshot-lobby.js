/*
 * Lobby de bout en bout : nouvelle partie au camp, déplacements, conversation, boutique (achat / vente),
 * table des chapitres, départ en chapitre, victoire, retour au camp (or, Cloud arrivé, évènement débloqué).
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-lobby.js npm start
 */
'use strict';
const path = require('path'), fs = require('fs'), os = require('os');
const { app } = require('electron');
const io = require(path.join(__dirname, '..', 'src/main/project-io.js'));

module.exports = (win, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const errs = [], result = {}, log = (k, v) => { result[k] = v; };
  const finish = () => { result.errors = errs; result.ok = !errs.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errs.push('délai global dépassé'); finish(); }, 150000);
  win.webContents.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-lobby-')), 'Jeu');
      io.createProject(dir, 'Lobby', 'sample', path.join(__dirname, '..', 'assets'));
      const pw = openPlaytest(dir, ''); const wc = pw.webContents;
      wc.setBackgroundThrottling(false);
      wc.on('console-message', (e, l, m) => { if (l >= 2) errs.push('playtest: ' + m); });
      await new Promise(r => wc.once('did-finish-load', r)); pw.setSize(1100, 780);
      const js = c => wc.executeJavaScript(c, true);
      const until = async (c, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(c)) return true; await wait(100); } throw new Error('Délai : ' + c); };
      const shot = async n => { pw.show(); wc.invalidate(); await js('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); await wait(250); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
      const key = async (k, hold) => { wc.sendInputEvent({ type: 'keyDown', keyCode: k }); if (hold) await wait(hold); wc.sendInputEvent({ type: 'keyUp', keyCode: k }); await wait(120); };
      const clickText = (sel, text) => js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.includes(${JSON.stringify(text)})); if (b) b.click(); return !!b; })()`);

      await until(`!!document.querySelector('.choice-list')`);
      log('choix', await js(`[...document.querySelectorAll('.choice-list button')].map(b => b.textContent).join(' | ')`));
      await js(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
      await until(`PlaytestState.mode === 'lobby' && !PlaytestState.busy`);
      await wait(400); await shot('a_camp');
      const S = 'PlaytestLobby.state';
      log('départ', await js(`({ hero: ${S}.hero.name, pos: [${S}.hero.x, ${S}.hero.y], npcs: ${S}.npcs.map(u => u.name), or: PlaytestState.campaign.gold })`));
      // déplacement au clavier : deux pas vers le haut
      await key('Up', 300);
      await until(`!${S}.moving`);
      log('après flèche', await js(`[${S}.hero.x, ${S}.hero.y, ${S}.facing]`));
      // conversation avec Lyn (clic sur elle : on y va puis on parle)
      await js(`(() => { const l = ${S}.npcs.find(u => u.name === 'Lyn'); PlaytestLobby.click(l.x, l.y); })()`);
      await until(`!!PlaytestState.dialogue`);
      await wait(500); await shot('b_conversation_lyn');
      for (let i = 0; i < 12 && await js(`!!PlaytestState.dialogue`); i++) { await js(`PlaytestState.dialogue.next()`); await wait(80); }
      await until(`!PlaytestState.dialogue`);
      log('conversations vues', await js(`PlaytestState.campaign.talks`));
      log('affinité Eliwood-Lyn', await js(`PlaytestState.sup[Rules.pairKey('c_eliwood', 'c_lyn')].points`));
      // boutique : on y va, achat d'une potion pour le convoi puis vente
      await js(`PlaytestLobby.click(PlaytestLobby.state.cfg.shop.x, PlaytestLobby.state.cfg.shop.y)`);
      await until(`!document.querySelector('#lobby-panel').classList.contains('hidden')`);
      const convoyBefore = await js(`PlaytestState.convoy.length`);
      await js(`[...document.querySelectorAll('#lobby-panel .lp-row')].find(r => r.textContent.includes('Potion')).querySelector('button').click()`); await wait(300);
      await shot('c_boutique_achat');
      log('achat', { or: await js(`PlaytestState.campaign.gold`), convoi: [convoyBefore, await js(`PlaytestState.convoy.length`)] });
      await clickText('#lobby-panel .lp-tab', 'Vendre'); await wait(300);
      await js(`[...document.querySelectorAll('#lobby-panel .lp-row')].find(r => r.textContent.includes('Épée de fer') && !r.classList.contains('off')).querySelector('button').click()`);
      await until(`!!document.querySelector('.modal-back')`);
      await shot('d_boutique_vente');
      await js(`[...document.querySelectorAll('.modal-back button')].find(b => b.textContent.includes('Vendre')).click()`); await wait(400);
      log('vente', await js(`PlaytestState.campaign.gold`));
      await key('Escape'); await wait(200);
      // table des chapitres
      await js(`PlaytestLobby.click(PlaytestLobby.state.cfg.board.x, PlaytestLobby.state.cfg.board.y)`);
      await until(`!document.querySelector('#lobby-panel').classList.contains('hidden')`);
      await wait(300); await shot('e_table_chapitres');
      log('chapitres', await js(`[...document.querySelectorAll('#lobby-panel .lp-row')].map(r => r.textContent).join(' || ')`));
      await clickText('#lobby-panel .lp-go', 'Partir');
      await until(`!!document.querySelector('.modal-back')`);
      await js(`[...document.querySelectorAll('.modal-back button')].find(b => b.textContent.includes('Partir')).click()`);
      await until(`PlaytestState.mode === 'chapter' && !!PlaytestState.chapter`);
      for (let i = 0; i < 40 && !(await js(`PlaytestState.phase === 'player' && !PlaytestState.busy && !PlaytestState.dialogue`)); i++) {
        await js(`PlaytestState.dialogue && PlaytestState.dialogue.skip()`); await wait(200);
      }
      log('chapitre', await js(`({ nom: PlaytestState.chapter.name, inventaires: PlaytestState.units.filter(u => u.team === 'player').map(u => u.name + ':' + u.inventory.map(s => s.id).join('+')), convoi: PlaytestState.convoy.length })`));
      await shot('f_chapitre');
      // victoire forcée : Batta vaincu (son or est ramassé), les autres disparaissent
      await js(`(() => { (async () => { const G = PlaytestState; const b = G.units.find(u => u.isBoss); await PlaytestDebug.killUnit(b, true); for (const u of G.units) if (u.team === 'enemy') u.dead = true; G.pending = []; await PlaytestDebug.checkEnd(); })(); return true; })()`);
      for (let i = 0; i < 80 && !(await js(`document.querySelector('#end').classList.contains('win-screen')`)); i++) { await js(`PlaytestState.dialogue && PlaytestState.dialogue.skip()`); await wait(150); }
      await wait(400); await shot('g_victoire');
      log('fin', await js(`document.querySelector('#end').textContent`));
      await clickText('#end button', 'Retour au camp');
      await until(`PlaytestState.mode === 'lobby' && !PlaytestState.busy`);
      await wait(600); await shot('h_retour_camp');
      log('retour', await js(`({ or: PlaytestState.campaign.gold, terminés: PlaytestState.campaign.cleared, npcs: ${S}.npcs.map(u => u.name), conversations: Lobby.talks(${S}.cfg, PlaytestState.db, PlaytestState.campaign).map(t => t.talk.name) })`));
      await js(`PlaytestLobby.click(PlaytestLobby.state.cfg.board.x, PlaytestLobby.state.cfg.board.y)`);
      await until(`!document.querySelector('#lobby-panel').classList.contains('hidden')`);
      await clickText('#lobby-panel .lp-tab', 'Évènements'); await wait(300);
      await shot('i_evenements');
      log('évènements', await js(`[...document.querySelectorAll('#lobby-panel .lp-row')].map(r => r.textContent).join(' || ')`));
      // sauvegarde au camp puis relecture
      await key('Escape'); await wait(200);
      await js(`PlaytestLobby.openMenu()`); await wait(200);
      await js(`PlaytestState.menu.items.find(i => i.label === 'Sauvegarder').action()`);
      await wait(800);
      const save = JSON.parse(fs.readFileSync(path.join(dir, 'saves', 'campaign.json'), 'utf8'));
      log('sauvegarde', { chapitre: save.chapterId, or: save.campaign.gold, terminés: save.campaign.cleared, conversations: save.campaign.talks });
    } catch (e) { errs.push(String(e.stack || e)); }
    finish();
  });
};
