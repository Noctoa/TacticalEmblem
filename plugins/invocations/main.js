/*
 * Plugin Invocations (gacha façon Fire Emblem Heroes) : branche summon.js et summon-panel.js sur le noyau.
 *
 * Ajouts (voir shared/extensions.js) :
 *   éditeur  onglet Base de données › Invocations (bannières), rareté sur la fiche des unités, orbes gagnées sur
 *            les actes et les conversations, section Système › Invocations, bannière par jeu du pack de personnages
 *   jeu      autel au camp (lieu « summon »), orbes (monnaie, récompenses, action d'événement, bouton Debug),
 *            fusions appliquées aux stats des unités
 *
 * Données dans le projet (gardées si le plugin est désactivé ou désinstallé) : data/banners.json, meta.summon,
 * meta.lobby.summon (l'autel), champs « rarity » des unités et « orbs » des actes / conversations.
 * Dans la campagne : orbs, summons (pitié, séance en cours), merges.
 */
(function () {
  'use strict';
  const ORB_ICON = 'plugins/invocations/img/orb.png'; // icône des orbes (chemin dans le projet)
  const ID = 'invocations';
  const pct = v => (Math.round(v * 100) / 100).toLocaleString('fr-FR') + ' %';
  const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
  const altarOn = (meta, cfg) => !!(cfg && cfg.summon && cfg.summon.enabled) && Summon.settings(meta).enabled !== false;

  // ------------------------------------------------------------------
  // Commun (éditeur et jeu)
  // ------------------------------------------------------------------
  function setup(api) {
    // autel du camp : réglé sur la map de camp (mode Unités), ouvert au jeu comme la boutique
    api.extend('lobbyPlace', 'summon', {
      key: 'summon', name: 'Autel d\'invocation', label: 'Autel d’invocation', color: '#d6a8ff',
      help: 'Bannières : Base de données › Invocations. Coûts, orbes de départ et pitié : Système › Invocations.',
      enabled: (meta) => Summon.settings(meta).enabled !== false,
      menuSub: (ctx) => plural((ctx.G.campaign.orbs || 0), 'orbe'),
      open: openAltar
    });
    // action d'événement « Donner des orbes »
    api.extend('action', 'orbs', {
      type: 'orbs', plugin: ID, label: 'Donner des orbes', defaults: { amount: 1 },
      fields: () => [{ key: 'amount', label: 'Orbes donnés', type: 'number', min: 1, max: 999999 }],
      validate: (a) => (!Number.isInteger(a.amount) || a.amount < 1 || a.amount > 999999 ? ['montant de récompense invalide.'] : []),
      run: (a, ctx) => { Summon.addOrbs(ctx.G.campaign, a.amount); ctx.toast(`+${a.amount} orbes`); if (ctx.refreshHud) ctx.refreshHud(); }
    });
    // fusions : +1 à deux stats par fusion, appliquées au chargement des unités
    api.extend('unitModifier', 'merges', (unit, character, campaign) => {
      const n = campaign && campaign.merges && campaign.merges[unit.sourceId];
      if (n) Summon.applyMerges(unit, character, n);
    });
    // orbes à la première victoire d'un acte (champ « orbs » de l'acte)
    api.extend('chapterReward', 'orbs', {
      amount: (ch, already) => Summon.orbsFor(ch, already),
      grant: (campaign, n) => Summon.addOrbs(campaign, n),
      text: (n) => '+' + plural(n, 'orbe')
    });
  }

  // ------------------------------------------------------------------
  // Jeu
  // ------------------------------------------------------------------
  function game(api) {
    api.extend('currency', 'orbs', {
      name: 'Orbes', icon: ORB_ICON, amount: (campaign) => campaign.orbs || 0, // orbe d'invocation de Heroes (img/orb.png)
      label: (campaign) => `Orbes : ${(campaign.orbs || 0).toLocaleString('fr-FR')}`,
      enabled: (meta, cfg) => altarOn(meta, cfg)
    });
    api.extend('debug', 'orbs', {
      label: '+50 orbes',
      run: (ctx) => { Summon.ensure(ctx.G.campaign, ctx.G.project.meta); Summon.addOrbs(ctx.G.campaign, 50); ctx.toast('+50 orbes'); }
    });
    // orbes de départ : nouvelle partie, ou ancienne sauvegarde qui n'a jamais vu l'autel
    api.on('campaign:new', (e) => Summon.ensure(e.campaign, api.meta));
    api.on('lobby:enter', (e) => { if (altarOn(api.meta, Lobby.defaults(api.meta.lobby))) Summon.ensure(e.campaign, api.meta); });
    // orbes gagnées en parlant aux compagnons du camp
    api.on('lobby:talk', (e) => {
      const n = Math.max(0, Math.floor(Number(e.talk && e.talk.orbs) || 0));
      if (!n) return;
      Summon.addOrbs(e.campaign, n);
      if (e.float) e.float('+' + plural(n, 'orbe'), '#d6a8ff');
    });
  }

  // un panneau par partie : l'onglet choisi et la révélation en cours restent d'une ouverture à l'autre
  let panel = null, panelFor = null;
  function openAltar(ctx) {
    const G = ctx.G;
    Summon.ensure(G.campaign, G.project.meta);
    if (!panel || panelFor !== G.campaign) {
      panelFor = G.campaign;
      panel = SummonPanel.create({
        G, h: ctx.h, Music: ctx.Music, portrait: ctx.portrait,
        rerender: () => ctx.rerender(),
        changed: () => ctx.changed(),
        // personnage invoqué : nouvelle recrue, ou fusion appliquée tout de suite aux unités déjà chargées
        received: (res) => {
          const def = G.db.units.find(u => u.id === res.unitId);
          ctx.changed();
          for (const u of ctx.units()) if (u.sourceId === res.unitId && def) Summon.applyMerges(u, def, (G.campaign.merges || {})[res.unitId] || 0);
          ctx.refreshUnits();
        }
      });
    }
    ctx.openPanel(ctx.name, panel.render, 'summon-panel');
  }

  // ------------------------------------------------------------------
  // Éditeur
  // ------------------------------------------------------------------
  function editor(api) {
    const db = () => api.db;
    const project = () => api.project;
    seed(project());
    /** Choix « après… » : un chapitre entier ou un acte précis. */
    const doneOpts = () => (db().arcs || []).map(a => ({ value: a.id, label: 'Chapitre : ' + (a.name || a.id) }))
      .concat(db().chapters.map(c => ({ value: c.id, label: 'Acte : ' + Lobby.actLabel(db(), c.id) })));

    api.extend('dbTab', 'banners', {
      key: 'banners', label: 'Invocations', after: 'arcs', prefix: 'bn_',
      list: () => db().banners || (db().banners = []),
      sub: (b) => `${[...new Set([...(b.pool || []), ...(b.focus || [])])].length} perso.` + ((b.unlock && (b.unlock.after || b.unlock.from)) ? ' · conditions' : ''),
      create: () => {
        const hero = Lobby.heroOf(Lobby.defaults(project().meta.lobby), db());
        return { name: 'Nouvelle bannière', description: '', pool: db().units.filter(u => !hero || u.id !== hero.id).map(u => u.id), focus: [],
          rates: Object.assign({}, Summon.DEFAULT_RATES), focusShare: 50, unlock: { after: '', alive: [], from: '', to: '' } };
      },
      rerenderOn: ['pool', 'focus', 'rates.5', 'rates.4', 'rates.3', 'focusShare'],
      fields: (b) => {
        const nb = Summon.normalizeBanner(b); Object.assign(b, { rates: nb.rates, unlock: nb.unlock, pool: nb.pool, focus: nb.focus });
        const cfg = Lobby.defaults(project().meta.lobby), set = Summon.settings(project().meta);
        const units = () => db().units.map(u => ({ value: u.id, label: `${u.name} ${'★'.repeat(Summon.rarityOf(u))}` }));
        const eff = Summon.rates(b, db(), { dead: [] }, project().meta);
        const errors = Summon.validate({ units: db().units, banners: [b] });
        return [
          !cfg.enabled || !cfg.summon.enabled || set.enabled === false ? { type: 'info', text: '⚠ L’autel d’invocation n’est pas actif : coche « Autel d’invocation » sur la map de camp (mode Unités) et dans Système › Invocations.' } : null,
          ...errors.map(e => ({ type: 'info', text: '⚠ ' + e })),
          { key: 'name', label: 'Nom de la bannière', type: 'text' },
          { key: 'description', label: 'Description (affichée à l’autel)', type: 'text' },
          { type: 'heading', label: 'Personnages' },
          { key: 'pool', label: 'Personnages possibles', type: 'multicheck', options: units },
          { key: 'focus', label: 'Mis en avant (ils se partagent une partie du taux 5★)', type: 'multicheck', options: units },
          { type: 'info', text: 'La rareté de chaque personnage se règle sur sa fiche (onglet Unités › Rareté). Un personnage déjà recruté qui sort à nouveau gagne une fusion (+1 à deux stats, jusqu’à +10). La couleur de sa pierre vient de son arme : rouge épée / anima, bleu lance / lumière, vert hache / ténèbres, incolore arc / bâton.' },
          { type: 'heading', label: 'Taux d’apparition (%)' },
          { type: 'row', fields: [
            { key: 'rates.5', label: '5★', type: 'number', min: 0, max: 100 },
            { key: 'rates.4', label: '4★', type: 'number', min: 0, max: 100 },
            { key: 'rates.3', label: '3★', type: 'number', min: 0, max: 100 },
            { key: 'focusShare', label: 'Part des 5★ pour les mis en avant (%)', type: 'number', min: 0, max: 100 }] },
          { type: 'info', text: `Taux réels avec ces personnages : ${[eff.focus ? '5★ mis en avant ' + pct(eff.focus) : '', eff[5] ? '5★ ' + pct(eff[5]) : '', eff[4] ? '4★ ' + pct(eff[4]) : '', eff[3] ? '3★ ' + pct(eff[3]) : ''].filter(Boolean).join(' · ') || '—'}. Une rareté sans personnage rend son taux aux autres. Pitié : +${String(set.pityStep).replace('.', ',')} % de 5★ toutes les ${set.pityEvery} invocations sans 5★ (Système › Invocations).` },
          { type: 'heading', label: 'Disponibilité' },
          { key: 'unlock.after', label: 'Disponible après', type: 'select', empty: '— dès le début —', options: doneOpts },
          { type: 'row', fields: [
            { key: 'unlock.from', label: 'Du (date réelle)', type: 'date' },
            { key: 'unlock.to', label: 'au (inclus) — ensuite la bannière disparaît', type: 'date' }] }
        ].filter(Boolean);
      }
    });

    api.extend('fields', 'rarity', { tab: 'units', after: 'series', fields: () => [
      { key: 'rarity', label: 'Rareté (invocations)', type: 'select', numeric: true, empty: '★★★ (3★, par défaut)', options: [{ value: 5, label: '★★★★★ (5★)' }, { value: 4, label: '★★★★ (4★)' }],
        help: 'Décide seulement de la probabilité de l’obtenir à l’autel d’invocation (taux réglés dans l’onglet Invocations). Les stats ne changent pas.' }] });
    api.extend('fields', 'talk-orbs', { tab: 'talks', after: 'points', fields: () => [
      { key: 'orbs', label: 'Orbes gagnées', type: 'number', min: 0, max: 99, help: 'Monnaie des invocations (autel du camp).' }] });
    api.extend('fields', 'chapter-orbs', { tab: 'chapters', after: 'gold', fields: () => [
      { key: 'orbs', label: 'Orbes (1re victoire)', type: 'number', min: 0, max: 999, help: 'Monnaie des invocations, donnée à la première victoire seulement.' }] });

    api.extend('system', 'summon', {
      label: 'Invocations',
      prepare: (meta) => { meta.summon = Summon.settings(meta); },
      fields: () => [
        { type: 'row', fields: [
          { key: 'summon.enabled', label: 'Invocations (autel du camp)', type: 'checkbox' },
          { key: 'summon.startOrbs', label: 'Orbes au début de la partie', type: 'number', min: 0, max: 9999 }] },
        { type: 'row', fields: [0, 1, 2, 3, 4].map(i => ({ key: 'summon.costs.' + i, label: `Pierre ${i + 1} (orbes)`, type: 'number', min: 0, max: 99 })) },
        { type: 'row', fields: [
          { key: 'summon.pityEvery', label: 'Pitié : toutes les N invocations sans 5★', type: 'number', min: 0, max: 100 },
          { key: 'summon.pityStep', label: '… taux 5★ augmenté de (%)', type: 'number', min: 0, max: 10, step: 0.5 }] },
        { type: 'info', text: 'Une séance d’invocation ouvre un cercle de 5 pierres : la 1re coûte le plus cher, il faut en ouvrir au moins une. Les bannières se règlent dans l’onglet Invocations, l’autel sur la map de camp (mode Unités), les orbes gagnées sur les actes et les conversations. (Plugin « Invocations »)' }
      ]
    });

    // pack « Personnages de la série » : une bannière par jeu importé
    api.extend('hook', 'fe-pack', { name: 'fePack:installed', fn: ({ db: base, games }) => {
      base.banners = base.banners || [];
      let n = 0;
      for (const g of games || []) {
        const id = 'bn_' + g.id;
        if (base.banners.some(b => b.id === id) || !g.unitIds.length) continue;
        base.banners.push({ id, name: g.title, description: `Personnages de ${g.title}.`, pool: g.unitIds.slice(), focus: g.unitIds.slice(0, g.focus || 1),
          rates: Object.assign({}, Summon.DEFAULT_RATES), focusShare: 50, unlock: { after: '', alive: [], from: '', to: '' } });
        n++;
      }
      return n ? plural(n, 'bannière') + ' d’invocation' : '';
    } });
    // personnage supprimé de la base : retiré des bannières
    api.extend('hook', 'unit-deleted', { name: 'db:deleted', fn: ({ db: base, tab, id }) => {
      if (tab !== 'units') return;
      for (const b of base.banners || []) { b.pool = (b.pool || []).filter(x => x !== id); b.focus = (b.focus || []).filter(x => x !== id); }
    } });
  }

  /**
   * Premier ajout du plugin dans un projet (meta.summon absent) : réglages par défaut, autel au camp,
   * une bannière, orbes sur les actes et les conversations qui n'en ont pas.
   */
  function seed(p) {
    if (!p || p.meta.summon) return;
    const meta = p.meta, base = p.db;
    meta.summon = Summon.settings(meta);
    const lobby = meta.lobby;
    if (lobby && !lobby.summon) {
      const map = (p.maps || []).find(m => m.id === lobby.mapId);
      const sample = lobby.mapId === 'map_camp' && map && map.width > 9 && map.height > 7; // le puits du camp d'exemple
      const b = lobby.board || { x: 0, y: 0 };
      const x = sample ? 9 : Math.min((map ? map.width : 1) - 1, b.x + 2), y = sample ? 7 : b.y;
      lobby.summon = { enabled: true, x, y, name: 'Autel d\'invocation' };
    }
    if (!(base.banners || []).length) base.banners = defaultBanners(base, lobby);
    for (const ch of base.chapters || []) if (ch.orbs === undefined) ch.orbs = ch.kind === 'event' ? 2 : 3;
    for (const t of base.talks || []) if (t.orbs === undefined && t.once !== false) t.orbs = 1;
    if (typeof Editor !== 'undefined' && Editor.markDirty) Editor.markDirty();
  }
  /** Bannières de départ : celles du projet d'exemple si ses personnages sont là, sinon une bannière avec tout le monde. */
  function defaultBanners(base, lobby) {
    const has = id => (base.units || []).some(u => u.id === id);
    const unlock = { after: '', alive: [], from: '', to: '' };
    const lycia = ['c_eliwood', 'c_lyn', 'c_hector', 'c_rebecca', 'c_oswin', 'c_matthew', 'c_serra', 'c_dorcas'].filter(has);
    if (lycia.length >= 4 && has('c_rebecca')) {
      const out = [{ id: 'bn_lycia', name: 'Héros de Lycia', description: 'Les seigneurs de Lycia et leurs compagnons. Rebecca est mise en avant.',
        pool: lycia, focus: ['c_rebecca'], rates: Object.assign({}, Summon.DEFAULT_RATES), focusShare: 50, unlock: Object.assign({}, unlock) }];
      const mercs = ['c_cloud', 'c_oswin', 'c_matthew', 'c_serra', 'c_dorcas'].filter(has);
      if (has('c_cloud')) out.push({ id: 'bn_mercs', name: 'Mercenaires de passage', description: 'Après le chapitre 1, des épées à louer passent au camp. Cloud est mis en avant.',
        pool: mercs, focus: ['c_cloud'], rates: Object.assign({}, Summon.DEFAULT_RATES), focusShare: 50,
        unlock: Object.assign({}, unlock, { after: (base.arcs || []).some(a => a.id === 'arc_1') ? 'arc_1' : '' }) });
      return out;
    }
    const hero = Lobby.heroOf(Lobby.defaults(lobby), base);
    const pool = (base.units || []).filter(u => !hero || u.id !== hero.id).map(u => u.id);
    return pool.length ? [{ id: 'bn_1', name: 'Invocation', description: 'Tous les personnages du jeu.', pool, focus: [],
      rates: Object.assign({}, Summon.DEFAULT_RATES), focusShare: 50, unlock: Object.assign({}, unlock) }] : [];
  }

  TacticalEmblem.register(ID, { setup, game, editor });
})();
