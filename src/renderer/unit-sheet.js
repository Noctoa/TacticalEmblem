/*
 * Fiche de personnage façon Fire Emblem : Radiant Dawn (fond img/ui/radiant/status.png, 240 × 160 px affichés
 * à l'échelle entière --s) : portrait, nom sur le parchemin, classe / niveau / PV sur le bois, sprite de map,
 * et trois pages à droite (Stats, Objets, Compétences).
 *
 *   UnitSheet.element(unit, ctx, { page, scale })  → élément (fiche intégrée, ex. l'équipe au camp)
 *   UnitSheet.open(unit, ctx, { list })            → fiche plein écran (map) ; ↑ ↓ : personnage suivant, ← → : page,
 *                                                     X / Échap / clic droit : fermer. Renvoie une promesse.
 *   ctx : { G, R, baseUrl, mapSpriteOf(u), paletteOf(u), supportsOf(u) → [{ name, rank }] }
 */
(function (root) {
  'use strict';
  const { h } = UI;
  const PAGES = [['stats', 'Stats'], ['items', 'Objets'], ['skills', 'Compétences']];
  const W = 240, H = 160;
  // positions dans l'image de fond (pixels de la planche)
  const BARS = [35, 53, 68, 84, 100, 116, 132, 147];   // traits des stats (colonne de gauche)
  const LINES = [48, 64, 80, 96];                      // lignes de la colonne de droite
  const WICONS = ['sword', 'lance', 'axe', 'bow', 'anima', 'light', 'dark', 'staff']; // img/ui/weapon-icons.png
  const CAPS = { hp: 60, str: 20, mag: 20, skl: 20, spd: 20, lck: 30, def: 20, res: 20 };

  const box = (x, y, w, hh, cls, ...children) => h('div', { class: 'rd-abs' + (cls ? ' ' + cls : ''),
    style: { left: `calc(var(--s) * ${x}px)`, top: `calc(var(--s) * ${y}px)`, width: `calc(var(--s) * ${w}px)`, height: `calc(var(--s) * ${hh}px)` } }, ...children);

  function weaponIcon(type) {
    const i = WICONS.indexOf(type);
    return i < 0 ? h('span', { class: 'rd-icon rd-icon-txt' }, '✚') : h('span', { class: 'rd-icon', style: { backgroundPosition: `calc(var(--s) * ${-i * 10}px) 0` } });
  }

  function combat(u, ctx) {
    const { G, R } = ctx;
    const eq = R.equipped(u, G.db), w = eq && eq.weapon;
    const avo = (w ? R.attackSpeed(u, w) : u.stats.spd) * 2 + u.stats.lck;
    if (!w) return { atk: '--', hit: '--', avo, crit: '--', eq: null };
    return { atk: (R.isMagic(w) ? u.stats.mag : u.stats.str) + (w.might || 0), hit: (w.hit || 0) + u.stats.skl * 2 + Math.floor(u.stats.lck / 2),
      avo, crit: (w.crit || 0) + Math.floor(u.stats.skl / 2), eq };
  }

  function portrait(u, ctx) {
    const { G, R } = ctx;
    const def = R.byId(G.db.units, u.sourceId), src = (def && def.portrait) || u.portrait;
    const frame = box(8, 4, 78, 71, 'rd-portrait');
    if (!src) { frame.append(h('span', { class: 'rd-initial' }, u.name.slice(0, 1))); return frame; }
    const face = Faces.element(Render.readyImage(ctx.baseUrl, src), Render.imageUrl(ctx.baseUrl, src), 'main');
    if (face) { face.classList.add('rd-face'); frame.append(face); }
    if (!Render.readyImage(ctx.baseUrl, src)) Render.loadImage(ctx.baseUrl, src); // une autre fois : planche analysée
    return frame;
  }

  function sprite(u, ctx) {
    const cell = box(68, 109, 26, 41, 'rd-sprite');
    const sp = ctx.mapSpriteOf && ctx.mapSpriteOf(u);
    if (!sp) return cell;
    const cv = h('canvas', { class: 'rd-sprite-cv' });
    cell.append(cv);
    const draw = () => {
      if (!cv.isConnected) return;
      const s = Math.max(1, Math.round(cv.clientWidth / 26)) || 1, dpr = window.devicePixelRatio || 1;
      const cw = Math.round(26 * s * dpr), ch = Math.round(41 * s * dpr);
      if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
      const g = cv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cw, ch); g.imageSmoothingEnabled = false;
      const k = cw / 26 * 16 / (sp.meta.base || 16) * 1.25;
      Sprites.drawMapSprite(g, sp.meta, sp.img, cw / 2, ch * 0.86, k, { anim: 'idle', t: performance.now(), palette: ctx.paletteOf ? ctx.paletteOf(u) : 'original' });
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
    return cell;
  }

  /** Taux de croissance (%) : ceux de l'unité, sinon de son personnage, sinon de sa classe. */
  function growthsOf(u, ctx) {
    const { G, R } = ctx;
    const def = R.byId(G.db.units, u.sourceId), cl = R.byId(G.db.classes, u.classId);
    return Object.assign({}, cl && cl.growths, def && def.growths, u.growths);
  }
  function statsPage(u, ctx, panel, growths, toggle) {
    const { G, R } = ctx;
    const cl = R.byId(G.db.classes, u.classId) || {};
    if (growths) {
      // croissances : PV et les 7 stats, jauge sur 100 %
      const gr = growthsOf(u, ctx);
      ['hp', 'str', 'mag', 'skl', 'spd', 'lck', 'def', 'res'].forEach((k, i) => {
        const v = Number(gr[k]) || 0, y = BARS[i];
        panel.append(box(116, y - 11, 44, 10, 'rd-row rd-growth', h('span', { class: 'rd-lbl' }, R.STAT_LABELS[k] || 'PV'), h('b', {}, v + '%')));
        if (v > 0) panel.append(box(119, y, Math.max(1, Math.round(39 * Math.min(1, v / 100))), 2, 'rd-gauge growth'));
      });
    } else {
      const keys = ['str', 'mag', 'skl', 'spd', 'lck', 'def', 'res'];
      keys.forEach((k, i) => {
        const v = u.stats[k], cap = (cl.caps && cl.caps[k]) || CAPS[k];
        const y = BARS[i];
        panel.append(box(116, y - 11, 44, 10, 'rd-row', h('span', { class: 'rd-lbl' }, R.STAT_LABELS[k]), h('b', { class: v >= cap ? 'rd-max' : '' }, String(v))));
        if (v > 0) panel.append(box(119, y, Math.max(1, Math.round(39 * Math.min(1, v / cap))), 2, 'rd-gauge' + (v >= cap ? ' max' : '')));
      });
      panel.append(box(116, BARS[7] - 11, 44, 10, 'rd-row', h('span', { class: 'rd-lbl' }, 'Dép'), h('b', {}, String(u.mov))));
    }
    // bascule stats / croissances (touche C)
    panel.append(box(166, 23, 64, 11, 'rd-growth-toggle', h('button', { class: 'rd-tab' + (growths ? ' on' : ''), 'data-sheet-growth': growths ? 'on' : 'off', title: 'Afficher les taux de croissance (C)',
      onclick: (e) => { e.stopPropagation(); toggle(); } }, growths ? 'Croissances' : '% Croissances')));
    const c = combat(u, ctx);
    [['Attaque', c.atk], ['Précision', c.hit], ['Esquive', c.avo], ['Critique', c.crit]].forEach(([label, v], i) => {
      panel.append(box(166, LINES[i] - 11, 57, 10, 'rd-row', h('span', { class: 'rd-lbl' }, label), h('b', {}, String(v))));
    });
    // altérations (poison, sommeil, silence : src/shared/statuses.js)
    const sts = self.Statuses ? Statuses.list(u) : [];
    panel.append(box(166, 101, 64, 12, 'rd-row rd-status', h('span', { class: 'rd-lbl' }, 'État'),
      sts.length ? h('span', { class: 'rd-status-list' }, sts.map(st => h('span', { class: 'rd-st', title: `${st.name} : ${st.description}`, 'data-sheet-status': st.id, style: { color: st.color } }, `${st.icon}${st.turns}`)))
        : h('b', {}, 'Normal')));
    // encadré : arme équipée
    const eq = c.eq;
    panel.append(box(169, 120, 61, 33, 'rd-boxed', eq
      ? [h('div', { class: 'rd-boxed-title' }, weaponIcon(eq.weapon.type), h('span', {}, eq.weapon.name)),
        h('div', { class: 'rd-boxed-sub' }, `Portée ${eq.weapon.minRange || 1}${(eq.weapon.maxRange || 1) > (eq.weapon.minRange || 1) ? '-' + eq.weapon.maxRange : ''} · ${u.inventory[eq.index].uses || '∞'}`)]
      : h('div', { class: 'rd-boxed-sub' }, 'Aucune arme équipée')));
  }

  function itemsPage(u, ctx, panel) {
    const { G, R } = ctx;
    const eq = R.equipped(u, G.db);
    const list = h('div', { class: 'rd-list' });
    (u.inventory || []).forEach((slot, i) => {
      const e = R.getEntry(G.db, slot.id), d = e ? e.def : null;
      const isW = e && e.kind === 'weapon';
      list.append(h('div', { class: 'rd-item' + (eq && eq.index === i ? ' eq' : '') },
        isW ? weaponIcon(d.type) : h('span', { class: 'rd-icon rd-icon-txt' }, '✚'),
        h('span', { class: 'rd-item-name' }, d ? d.name : slot.id), eq && eq.index === i ? h('i', {}, 'E') : null,
        h('b', {}, slot.uses ? String(slot.uses) : '∞')));
    });
    if (!(u.inventory || []).length) list.append(h('div', { class: 'rd-empty' }, 'Inventaire vide'));
    panel.append(box(104, 26, 124, 90, '', list));
    const w = eq && eq.weapon;
    panel.append(box(169, 120, 61, 33, 'rd-boxed', w
      ? [h('div', { class: 'rd-boxed-title' }, weaponIcon(w.type), h('span', {}, w.name)),
        h('div', { class: 'rd-boxed-sub' }, `Puis ${w.might} · Préc ${w.hit}`), h('div', { class: 'rd-boxed-sub' }, `Crit ${w.crit || 0} · Poids ${w.weight || 0}`)]
      : h('div', { class: 'rd-boxed-sub' }, 'Aucune arme équipée')));
  }

  function skillsPage(u, ctx, panel) {
    const { G, R } = ctx;
    const catalogue = G.db.skills || [];
    const ids = [u.personalSkill, ...(u.equippedSkills || [])].filter(Boolean);
    const list = h('div', { class: 'rd-list' });
    ids.forEach((id, i) => {
      const s = R.byId(catalogue, id); if (!s) return;
      list.append(h('div', { class: 'rd-item' + (i === 0 && id === u.personalSkill ? ' personal' : ''), title: Skills.describe(s) },
        self.SkillIcons ? h('span', { class: 'rd-skillbox' }, SkillIcons.element(s, 32, 'rd-skill')) : h('span', { class: 'rd-icon rd-icon-txt' }, s.icon || '✦'),
        h('span', { class: 'rd-item-name' }, s.name), i === 0 && id === u.personalSkill ? h('i', {}, 'P') : null));
    });
    if (!ids.length) list.append(h('div', { class: 'rd-empty' }, 'Aucune compétence'));
    panel.append(box(104, 26, 124, 90, '', list));
    const sup = (ctx.supportsOf ? ctx.supportsOf(u) : []) || [];
    panel.append(box(169, 120, 61, 33, 'rd-boxed', h('div', { class: 'rd-boxed-title' }, h('span', {}, '♥ Affinités')),
      sup.length ? sup.slice(0, 3).map(p => h('div', { class: 'rd-boxed-sub rd-sup' }, h('span', {}, p.name), h('b', {}, p.rank))) : h('div', { class: 'rd-boxed-sub' }, 'Aucune')));
  }

  /** Fiche d'une unité (élément). opts.page : 'stats' | 'items' | 'skills' ; opts.scale : taille d'un pixel (sinon --s du parent). */
  function element(u, ctx, opts = {}) {
    const state = { page: PAGES.some(p => p[0] === opts.page) ? opts.page : 'stats', growths: !!opts.growths };
    const el = h('div', { class: 'rd-sheet', 'data-unit-sheet': u.uid || u.sourceId || '' });
    if (opts.scale) el.style.setProperty('--s', String(opts.scale));
    const { G, R } = ctx;
    const render = () => {
      el.dataset.page = state.page;
      el.classList.toggle('blank', state.page !== 'stats');
      el.replaceChildren();
      const cl = R.byId(G.db.classes, u.classId);
      const r = Math.max(0, Math.min(1, u.hp / u.stats.hp));
      el.append(portrait(u, ctx),
        box(18, 81, 72, 14, 'rd-name', u.name),
        box(4, 106, 61, 12, 'rd-wood', cl ? cl.name : '—'),
        box(4, 121, 61, 12, 'rd-wood rd-split', h('span', {}, 'Nv ', h('b', {}, String(u.level))), u.team !== 'enemy' ? h('span', {}, 'EXP ', h('b', {}, String(u.exp || 0))) : null),
        box(4, 137, 61, 12, 'rd-wood rd-split', h('span', {}, 'PV'), h('b', {}, `${u.hp}/${u.stats.hp}`)),
        box(4, 150, 60, 2, 'rd-hp' + (r <= 0.3 ? ' low' : ''), h('i', { style: { width: (r * 100) + '%' } })),
        sprite(u, ctx));
      const panel = h('div', { class: 'rd-panel' });
      panel.append(box(102, 7, 128, 13, 'rd-tabs', PAGES.map(([id, label]) => h('button', { class: 'rd-tab' + (state.page === id ? ' on' : ''), 'data-sheet-page': id,
        onclick: (e) => { e.stopPropagation(); state.page = id; render(); } }, label))));
      if (state.page === 'stats') statsPage(u, ctx, panel, state.growths, () => el.toggleGrowths());
      else if (state.page === 'items') itemsPage(u, ctx, panel);
      else skillsPage(u, ctx, panel);
      el.append(panel);
    };
    el.page = (d) => { const i = PAGES.findIndex(p => p[0] === state.page); state.page = PAGES[(i + d + PAGES.length) % PAGES.length][0]; render(); };
    el.getPage = () => state.page;
    /** Stats ⇄ taux de croissance (repasse sur la page Stats). */
    el.toggleGrowths = () => { state.growths = !state.growths; state.page = 'stats'; render(); if (opts.onGrowths) opts.onGrowths(state.growths); };
    el.getGrowths = () => state.growths;
    render();
    return el;
  }

  /**
   * Fiche plein écran : promesse résolue à la fermeture.
   * ← → (ou les flèches de chaque côté) : personnage précédent / suivant de la liste (les unités déployées) ;
   * ↑ ↓, Q / E ou les onglets : page ; C (ou G) : stats ⇄ taux de croissance ; X / Échap / clic droit / R : fermer.
   * opts.actions : [{ id, label, onClick(unité) }] — boutons sous la fiche (la fiche se ferme puis l'action reçoit l'unité affichée). opts.title : titre au-dessus (ex. « Unités »).
   */
  function open(u, ctx, opts = {}) {
    const list = (opts.list && opts.list.length ? opts.list : [u]);
    let i = Math.max(0, list.indexOf(u)), page = opts.page || 'stats', growths = !!opts.growths;
    return new Promise((resolve) => {
      const back = h('div', { id: 'unit-sheet', class: 'rd-overlay' });
      const fit = () => { const s = Math.max(2, Math.min(6, Math.floor(Math.min((window.innerWidth - 160) / W, (window.innerHeight - 110) / H)))); back.style.setProperty('--s', String(s)); };
      let sheet = null;
      const se = (n) => { try { Music.se(n); } catch (er) { /* sans son */ } };
      const go = (d) => { if (list.length < 2) return; page = sheet.getPage(); i = (i + d + list.length) % list.length; show(); se('cursor'); };
      const turn = (d) => { sheet.page(d); page = sheet.getPage(); se('cursor'); };
      const show = () => {
        sheet = element(list[i], ctx, { page, growths, onGrowths: (g) => { growths = g; page = 'stats'; } });
        const many = list.length > 1;
        back.replaceChildren(
          opts.title ? h('div', { class: 'rd-title' }, opts.title, many ? h('span', {}, ` ${i + 1} / ${list.length}`) : null) : null,
          h('div', { class: 'rd-stage' },
            many ? h('button', { class: 'rd-nav prev', 'data-sheet-nav': 'prev', title: 'Personnage précédent (←)', onclick: (e) => { e.stopPropagation(); go(-1); } }, '◀') : null,
            sheet,
            many ? h('button', { class: 'rd-nav next', 'data-sheet-nav': 'next', title: 'Personnage suivant (→)', onclick: (e) => { e.stopPropagation(); go(1); } }, '▶') : null),
          (opts.actions || []).length ? h('div', { class: 'rd-actions' }, opts.actions.map(a => h('button', { class: 'rd-action', 'data-sheet-action': a.id || a.label,
            onclick: (e) => { e.stopPropagation(); const target = list[i]; close(); a.onClick(target); } }, a.label))) : null,
          h('div', { class: 'rd-help' }, (many ? '← → : personnage · ' : '') + '↑ ↓ : page · C : croissances · X / Échap : fermer'));
      };
      const close = () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', fit); back.remove(); resolve(); };
      const onKey = (e) => {
        e.stopImmediatePropagation();
        const k = e.key;
        if (['x', 'X', 'Escape', 'Backspace', 'r', 'R'].includes(k)) { e.preventDefault(); se('cancel'); close(); }
        else if (k === 'ArrowRight' || k === 'ArrowLeft') { e.preventDefault(); go(k === 'ArrowRight' ? 1 : -1); }
        else if (k === 'c' || k === 'C' || k === 'g' || k === 'G') { e.preventDefault(); sheet.toggleGrowths(); se('cursor'); }
        else if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'q' || k === 'Q' || k === 'e' || k === 'E') { e.preventDefault(); turn(k === 'ArrowDown' || k === 'e' || k === 'E' ? 1 : -1); }
      };
      back.addEventListener('mousedown', (e) => { if (e.target === back || e.button === 2) { e.preventDefault(); close(); } });
      back.addEventListener('contextmenu', (e) => e.preventDefault());
      // molette : personnage suivant / précédent
      back.addEventListener('wheel', (e) => { e.preventDefault(); go(e.deltaY > 0 || e.deltaX > 0 ? 1 : -1); }, { passive: false });
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('resize', fit);
      fit(); show();
      document.body.append(back);
      se('confirm');
    });
  }

  root.UnitSheet = { element, open, PAGES, W, H };
})(self);
