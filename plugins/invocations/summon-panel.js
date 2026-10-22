/*
 * Plugin Invocations — autel du camp (jeu) : bannières, cercle de 5 pierres de couleur, révélation.
 * La logique (taux, pitié, coûts, recrutement / fusion) est dans summon.js.
 * Une séance commencée sans pierre ouverte est gardée dans la campagne : refermer l'autel ne relance pas les couleurs.
 */
(function (root) {
  'use strict';

  function create(api) {
    const { G, h, Music } = api;
    const S = { tab: null, reveal: null };
    const meta = () => G.project.meta;
    const stars = (n) => '★'.repeat(n);
    const colorOf = (id) => Summon.COLORS.find(c => c.id === id) || Summon.COLORS[3];
    const unitDef = (id) => G.db.units.find(u => u.id === id);
    const fakeUnit = (c) => ({ sourceId: c.id, name: c.name, team: 'player', color: c.color, portrait: c.portrait });
    const pct = (v) => (Math.round(v * 100) / 100).toLocaleString('fr-FR') + ' %';
    const session = () => G.campaign.summons && G.campaign.summons.session;
    const recruited = () => Team.sync(G.campaign, G.db, meta());
    // icônes de types d'arme façon Heroes (img/weapons.png du plugin, tools/build_ui_feh.py) ; pastille de couleur sinon
    const ICONS = ['sword', 'lance', 'axe', 'bow', 'anima', 'light', 'dark', 'staff'];
    const iconUrl = G.baseUrl + 'plugins/invocations/img/weapons.png';
    function weaponIcon(u) {
      const type = Roster.weaponTypesOf(u, G.db)[0], i = ICONS.indexOf(type), col = Summon.colorOf(u, G.db);
      if (i < 0) return h('i', { class: 'sm-dot', title: col.name, style: { background: col.css } });
      return h('i', { class: 'sm-wicon', title: (Rules.WEAPON_TYPES.find(w => w.id === type) || {}).name || type,
        style: { backgroundImage: `url("${iconUrl}")`, backgroundPosition: `${i * 100 / (ICONS.length - 1)}% 0` } });
    }

    function render(body) {
      Summon.ensure(G.campaign, meta());
      if (S.reveal) return renderReveal(body);
      if (session()) return renderCircle(body);
      renderBanners(body);
    }

    // ------------------------------------------------------------------
    // Bannières
    // ------------------------------------------------------------------
    function renderBanners(body) {
      const list = Summon.banners(G.db, G.campaign);
      if (!list.length) { body.append(h('p', { class: 'lp-empty' }, 'Aucune bannière d\'invocation pour le moment.')); return; }
      if (!list.find(b => b.banner.id === S.tab)) S.tab = (list.find(b => b.open) || list[0]).banner.id;
      if (list.length > 1) body.append(h('div', { class: 'lp-tabs' }, list.map(b => h('button', { class: 'lp-tab lp-focus' + (b.banner.id === S.tab ? ' on' : ''),
        onclick: () => { S.tab = b.banner.id; api.rerender(); } }, b.banner.name + (b.open ? '' : ' 🔒')))));
      const entry = list.find(b => b.banner.id === S.tab), b = entry.banner;
      const rates = Summon.rates(b, G.db, G.campaign, meta());
      const team = recruited();
      const focus = entry.pool.filter(u => b.focus.includes(u.id));
      const cost = Summon.settings(meta()).costs[0];
      const card = h('div', { class: 'sm-banner' },
        h('div', { class: 'sm-title' }, b.name),
        b.description ? h('div', { class: 'lp-sub' }, b.description) : null,
        focus.length ? h('div', { class: 'sm-focus' }, focus.map(u => h('div', { class: 'sm-hero' }, api.portrait(fakeUnit(u), 'bust'),
          h('div', {}, h('b', {}, weaponIcon(u), ' ', u.name), h('div', { class: 'sm-stars r' + Summon.rarityOf(u) }, stars(Summon.rarityOf(u))),
            h('div', { class: 'lp-sub' }, team.includes(u.id) ? `Dans l'équipe${mergeTag(u.id)}` : 'Nouveau'))))) : null,
        h('div', { class: 'sm-rates' },
          rates.focus ? h('span', { class: 'r5' }, `5★ mis en avant ${pct(rates.focus)}`) : null,
          rates[5] ? h('span', { class: 'r5' }, `5★ ${pct(rates[5])}`) : null,
          rates[4] ? h('span', { class: 'r4' }, `4★ ${pct(rates[4])}`) : null,
          rates[3] ? h('span', { class: 'r3' }, `3★ ${pct(rates[3])}`) : null),
        rates.pity ? h('div', { class: 'lp-sub sm-pity' }, `Pitié : +${pct(rates.pity)} de 5★ (aucun 5★ depuis ${(G.campaign.summons.pity || {})[b.id] || 0} invocation(s) sur cette bannière)`) : null,
        entry.reasons.length ? h('div', { class: 'lp-why' }, entry.reasons.join(' · ')) : null,
        h('div', { class: 'sm-actions' },
          h('span', { class: 'sm-orbs' }, orbLabel()),
          h('button', { class: 'lp-go lp-focus sm-start', disabled: !entry.open || G.campaign.orbs < cost, onclick: () => start(b) }, `Invoquer (${cost} orbes)`)),
        G.campaign.orbs < cost && entry.open ? h('div', { class: 'lp-why' }, 'Pas assez d\'orbes : termine des actes ou parle à tes compagnons au camp.') : null);
      body.append(card);
      // liste des personnages possibles
      body.append(h('div', { class: 'lp-group' }, `Personnages (${entry.pool.length})`));
      const sorted = entry.pool.slice().sort((a, c) => Summon.rarityOf(c) - Summon.rarityOf(a) || a.name.localeCompare(c.name, 'fr'));
      for (const u of sorted) {
        body.append(h('div', { class: 'lp-row sm-unit' },
          weaponIcon(u),
          h('div', { class: 'lp-main' }, h('div', { class: 'lp-name' }, u.name, b.focus.includes(u.id) ? h('span', { class: 'lp-badge new' }, 'Mis en avant') : null),
            h('div', { class: 'lp-sub' }, [(G.db.classes.find(c => c.id === u.classId) || {}).name, u.series].filter(Boolean).join(' · '))),
          h('span', { class: 'sm-stars r' + Summon.rarityOf(u) }, stars(Summon.rarityOf(u))),
          h('span', { class: 'lp-price' }, team.includes(u.id) ? 'Équipe' + mergeTag(u.id) : '')));
      }
    }
    const mergeTag = (id) => { const n = (G.campaign.merges || {})[id] || 0; return n ? ` +${n}` : ''; };
    const orbLabel = () => `Orbes : ${(G.campaign.orbs || 0).toLocaleString('fr-FR')}`;

    function start(banner) {
      G.campaign.summons.session = Summon.circle(banner, G.db, G.campaign, meta(), Math.random);
      api.changed();
      Music.se('confirm');
      api.rerender();
    }

    // ------------------------------------------------------------------
    // Cercle de pierres
    // ------------------------------------------------------------------
    function renderCircle(body) {
      const ses = session();
      const banner = (G.db.banners || []).find(b => b.id === ses.bannerId) || { name: 'Invocation' };
      const cost = Summon.nextCost(ses, meta());
      const ring = h('div', { class: 'sm-circle' }, h('div', { class: 'sm-center' }, h('b', {}, banner.name), h('small', {}, `${ses.pulled}/5 ouvertes`)));
      ses.stones.forEach((st, i) => {
        const angle = -Math.PI / 2 + i * 2 * Math.PI / 5;
        const pos = { left: `calc(50% + ${Math.cos(angle) * 39}% - 37px)`, top: `calc(50% + ${Math.sin(angle) * 39}% - 37px)` };
        const col = colorOf(st.color);
        if (st.opened) {
          const u = unitDef(st.result.unitId) || { id: st.result.unitId, name: '?' };
          ring.append(h('div', { class: 'sm-stone opened', style: pos, title: u.name },
            api.portrait(fakeUnit(u), 'bust'), h('span', { class: 'sm-stars r' + st.result.rarity }, stars(st.result.rarity)), h('span', { class: 'sm-name' }, u.name)));
        } else {
          ring.append(h('button', { class: 'sm-stone lp-focus', 'data-stone': i, title: `Pierre ${col.name.toLowerCase()} — ${cost} orbe(s)`, 'data-color': st.color, style: pos,
            disabled: G.campaign.orbs < cost, onclick: () => pull(i) },
            h('span', { class: 'sm-gem', style: { background: `radial-gradient(circle at 35% 30%, #fff 0, ${col.css} 32%, rgba(0,0,0,.55) 100%)`, boxShadow: `0 0 14px ${col.css}` } }),
            h('span', { class: 'sm-cost' }, `${cost}`)));
        }
      });
      body.append(ring);
      const done = ses.pulled >= 5;
      body.append(h('div', { class: 'sm-actions' },
        h('span', { class: 'sm-orbs' }, orbLabel() + (done ? '' : ` · prochaine pierre : ${cost} orbe(s)`)),
        h('button', { class: 'lp-go lp-focus sm-end', disabled: ses.pulled === 0, title: ses.pulled === 0 ? 'Ouvre au moins une pierre' : '', onclick: finish }, done ? 'Terminer' : 'Arrêter là')));
      if (ses.pulled === 0) body.append(h('p', { class: 'lp-sub' }, 'Choisis une pierre : sa couleur indique l\'arme du personnage (rouge : épée / anima, bleu : lance / lumière, vert : hache / ténèbres, incolore : arc / bâton). Il faut en ouvrir au moins une.'));
      else if (!done && G.campaign.orbs < cost) body.append(h('p', { class: 'lp-why' }, 'Plus assez d\'orbes pour la pierre suivante.'));
    }

    function pull(i) {
      const ses = session();
      const r = Summon.open(ses, i, G.campaign, G.db, meta());
      if (!r.ok) { UI.toast(r.error); return; }
      api.received(r.result);
      Music.se(r.result.rarity === 5 ? 'crit' : 'confirm');
      S.reveal = r.result;
      api.changed();
      api.rerender();
    }
    function finish() {
      if (!session() || session().pulled === 0) return;
      delete G.campaign.summons.session;
      api.changed();
      api.rerender();
    }

    // ------------------------------------------------------------------
    // Révélation
    // ------------------------------------------------------------------
    function renderReveal(body) {
      const r = S.reveal, u = unitDef(r.unitId) || { id: r.unitId, name: r.unitId };
      const cls = G.db.classes.find(c => c.id === u.classId);
      const tag = r.isNew ? h('span', { class: 'sm-tag new' }, 'Nouveau !') : r.maxed ? h('span', { class: 'sm-tag max' }, 'Fusion maximale (+10)') : h('span', { class: 'sm-tag merge' }, `Fusion +${r.merges}`);
      body.append(h('div', { class: 'sm-reveal r' + r.rarity },
        h('div', { class: 'sm-rays' }),
        api.portrait(fakeUnit(u), 'bust'),
        h('div', { class: 'sm-stars big r' + r.rarity }, stars(r.rarity)),
        h('h2', {}, weaponIcon(u), ' ', u.name),
        h('div', { class: 'lp-sub' }, [cls && cls.name, u.series, r.focus ? 'mis en avant' : ''].filter(Boolean).join(' · ')),
        tag,
        r.isNew ? h('p', { class: 'lp-sub' }, `${u.name} rejoint l'équipe (menu Équipe du camp).`) : !r.maxed ? h('p', { class: 'lp-sub' }, 'Ses stats augmentent (+1 à deux stats).') : null,
        h('button', { class: 'lp-go lp-focus sm-ok', onclick: () => { S.reveal = null; api.rerender(); } }, 'Continuer')));
    }

    return { render, get state() { return S; }, orbLabel };
  }

  root.SummonPanel = { create };
})(self);
