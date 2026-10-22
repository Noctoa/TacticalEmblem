/*
 * Invocations : autel du camp, bannière, cercle de 5 pierres, révélation, recrutement / fusion, séance gardée.
 * TF_SNAPSHOT=dossier TF_SNAPSHOT_SCRIPT=$PWD/test/snapshot-invocation.js npm start
 */
'use strict';
require('./auto-deploy.js'); // écran des préparatifs validé avec la sélection par défaut
const path = require('path'), fs = require('fs'), os = require('os');
const { app } = require('electron');
const io = require(path.join(__dirname, '..', 'src/main/project-io.js'));
module.exports = (win, openPlaytest) => {
  const out = process.env.TF_SNAPSHOT; fs.mkdirSync(out, { recursive: true });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const errs = [], result = {};
  const finish = () => { result.errors = errs; result.ok = !errs.length; fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(0); };
  setTimeout(() => { errs.push('délai global dépassé'); finish(); }, 150000);
  win.webContents.once('did-finish-load', async () => {
    try {
      const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-summon-')), 'Jeu');
      io.createProject(dir, 'Invocations', 'sample', path.join(__dirname, '..', 'assets'));
      require('./fixtures/plugin-host').installBundled(dir, 'invocations'); // les invocations sont un plugin
      const pw = openPlaytest(dir, ''); const wc = pw.webContents;
      wc.setBackgroundThrottling(false);
      wc.on('console-message', (e, l, m) => { if (l >= 2) errs.push('playtest: ' + m); });
      await new Promise(r => wc.once('did-finish-load', r)); pw.setSize(1100, 800); pw.show();
      const js = c => wc.executeJavaScript(c, true);
      const until = async (c, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(c)) return true; await wait(100); } throw new Error('Délai : ' + c); };
      const shot = async n => { wc.invalidate(); await js('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); await wait(350); fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG()); };
      const assert = (c, m) => { if (!c) throw new Error(m); };
      await until(`!!document.querySelector('.choice-list')`);
      await js(`[...document.querySelectorAll('.choice-list button')].find(b => b.textContent.includes('Classique')).click()`);
      await until(`PlaytestState.mode === 'lobby' && !PlaytestState.busy`);
      await wait(1800); await shot('a_camp_autel');
      result.depart = await js(`({ orbes: PlaytestState.campaign.orbs, hud: document.querySelector('#objective').textContent })`);
      assert(result.depart.orbes === 20, 'orbes de départ');
      // aller à l'autel en cliquant dessus
      await js(`PlaytestLobby.click(PlaytestLobby.state.cfg.summon.x, PlaytestLobby.state.cfg.summon.y)`);
      await until(`!document.querySelector('#lobby-panel').classList.contains('hidden')`, 20000);
      await wait(400); await shot('b_banniere');
      result.banniere = await js(`document.querySelector('#lobby-panel .sm-banner').textContent`);
      await js(`document.querySelector('#lobby-panel .sm-start').click()`); await wait(400);
      const stones = await js(`[...document.querySelectorAll('#lobby-panel .sm-stone')].map(b => b.dataset.color)`);
      result.pierres = stones;
      assert(stones.length === 5, '5 pierres');
      await shot('c_cercle');
      // refermer sans ouvrir : la séance est gardée
      await js(`PlaytestLobby.closePanel()`); await wait(200);
      await js(`PlaytestLobby.openPlace('summon')`); await wait(300);
      result.memeCercle = JSON.stringify(await js(`[...document.querySelectorAll('#lobby-panel .sm-stone')].map(b => b.dataset.color)`)) === JSON.stringify(stones);
      assert(result.memeCercle, 'séance gardée');
      // ouvrir les 5 pierres
      const pulls = [];
      for (let i = 0; i < 5; i++) {
        await js(`document.querySelector('#lobby-panel button.sm-stone').click()`); await wait(500);
        if (i === 0) await shot('d_revelation');
        pulls.push(await js(`({ texte: document.querySelector('#lobby-panel .sm-reveal').textContent, orbes: PlaytestState.campaign.orbs })`));
        await js(`document.querySelector('#lobby-panel .sm-ok').click()`); await wait(250);
      }
      result.tirages = pulls;
      assert(pulls.map(p => p.orbes).join() === '15,11,7,3,0', 'coûts 5/4/4/4/3 : ' + pulls.map(p => p.orbes).join());
      await shot('e_cercle_ouvert');
      result.campagne = await js(`({ recrutes: PlaytestState.campaign.recruited, fusions: PlaytestState.campaign.merges, pitie: PlaytestState.campaign.summons.pity, total: PlaytestState.campaign.summons.total })`);
      await js(`document.querySelector('#lobby-panel .sm-end').click()`); await wait(300);
      result.apresSeance = await js(`!!document.querySelector('#lobby-panel .sm-banner') && !PlaytestState.campaign.summons.session`);
      await shot('f_banniere_apres');
      // l'équipe contient les nouvelles recrues
      await js(`PlaytestLobby.closePanel()`); await wait(200);
      await js(`PlaytestLobby.openTeam()`); await wait(500);
      result.equipe = await js(`[...document.querySelectorAll('[data-team-unit]')].map(e => e.dataset.teamUnit)`);
      await shot('g_equipe');
      for (const id of result.campagne.recrutes) assert(result.equipe.includes(id), 'recrue dans l’équipe : ' + id);
      // fusions appliquées : stats d'un fusionné > stats de base
      result.fusionStats = await js(`(() => { const out = {}; for (const [id, n] of Object.entries(PlaytestState.campaign.merges || {})) { const m = PlaytestLobby.state.members.find(u => u.sourceId === id); const base = Rules.makeUnitFromCharacter(PlaytestState.db.units.find(u => u.id === id), PlaytestState.db, { x: 0, y: 0 }); out[id] = { n, gain: Rules.STATS.reduce((a, k) => a + m.stats[k] - base.stats[k], 0), merges: m.merges }; } return out; })()`);
      for (const [id, f] of Object.entries(result.fusionStats)) assert(f.gain >= 2 * f.n && f.merges === f.n, 'fusion ' + id);
      // une séance forcée sur le 5★ mis en avant (Rebecca) : révélation dorée
      await js(`PlaytestLobby.closePanel()`); await wait(200);
      await js(`(() => { const G = PlaytestState; G.campaign.orbs += 10; G.campaign.summons.session = Summon.circle(G.db.banners[0], G.db, G.campaign, G.project.meta, () => 0.01); })()`);
      await js(`PlaytestLobby.openPlace('summon')`); await wait(300);
      await js(`document.querySelector('#lobby-panel button.sm-stone').click()`); await wait(700);
      result.cinqEtoiles = await js(`document.querySelector('#lobby-panel .sm-reveal').className + ' ' + document.querySelector('#lobby-panel .sm-reveal h2').textContent`);
      assert(/r5/.test(result.cinqEtoiles) && /Rebecca/.test(result.cinqEtoiles), '5★ Rebecca');
      await shot('h_revelation_5');
      result.pitie = await js(`PlaytestState.campaign.summons.pity`);
    } catch (e) { errs.push(String(e.stack || e)); }
    finish();
  });
};
