/*
 * Éditeur d'animations d'attaque (Base de données › Animations), façon RPG Maker :
 * une bande d'images (frames), une scène où l'on place les cellules (morceaux des planches de ressources/animations)
 * à la souris, leurs réglages (position, taille, rotation, opacité, fusion), le son / flash / tremblement de chaque
 * image, l'interpolation entre deux images et l'aperçu (enchaînements compris).
 *
 *   AnimationEditor.render(anim, { baseUrl, list, sheets, sounds, onChange })   → élément
 *   AnimationEditor.pickPiece(baseUrl, sheets, current)                         → { image, rect } | null
 *   AnimationEditor.detectPieces(img)                                           → [[x, y, w, h], …]
 */
(function (root) {
  'use strict';
  const { h } = UI;
  const A = root.Animations;

  // scène : 720 × 400 unités ; l'attaquant à gauche, la cible à droite (mesures du combat animé)
  const STAGE = { w: 720, h: 400 };
  const SRC = { x: 200, y: 222 }, TGT = { x: 480, y: 222 };
  const body = (p) => ({ x: p.x, y: p.y, feet: p.y + 72, head: p.y - 60 });
  const SCREEN = { x: STAGE.w / 2, y: 170 };
  const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } } };

  /** Origine des cellules d'une animation dans la scène de l'éditeur. */
  function originOf(a) {
    if (a.kind === 'projectile') return { x: (SRC.x + TGT.x) / 2, y: SRC.y };
    if (a.position === 'screen') return SCREEN;
    const p = body(a.on === 'user' ? SRC : TGT);
    return { x: p.x, y: a.position === 'feet' ? p.feet : a.position === 'head' ? p.head : p.y };
  }

  function silhouette(g, p, label, flash) {
    const feet = p.y + 72;
    g.save();
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(p.x, feet, 34, 8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = flash ? '#ffffff' : 'rgba(150,160,185,.55)';
    g.beginPath(); g.roundRect(p.x - 24, feet - 104, 48, 104, 14); g.fill();
    g.beginPath(); g.arc(p.x, feet - 120, 17, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '600 13px Inter, system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText(label, p.x, feet + 24);
    g.restore();
  }

  function render(anim, ctx) {
    const st = { frame: 0, cell: -1, onion: store.get('tf.animOnion', '1') === '1', run: null, flashUntil: 0 };
    const changed = () => { ctx.onChange && ctx.onChange(); };
    const frames = () => anim.frames || (anim.frames = [{ cells: [] }]);
    const curFrame = () => frames()[Math.min(st.frame, frames().length - 1)];
    const curCell = () => (curFrame().cells || [])[st.cell] || null;

    const canvas = h('canvas', { class: 'anim-stage', tabindex: 0, 'data-anim-stage': true });
    const strip = h('div', { class: 'anim-frames', 'data-anim-frames': true });
    const cellPane = h('div', { class: 'anim-side' });
    const framePane = h('div', { class: 'anim-side' });
    const playBtn = h('button', { class: 'small primary', 'data-anim-play': true, onclick: () => preview() }, '▶ Aperçu');
    const rootEl = h('div', { class: 'anim-editor' },
      h('div', { class: 'form-heading' }, 'Images de l’animation'),
      h('div', { class: 'anim-toolbar' },
        playBtn,
        h('button', { class: 'small', 'data-anim-add-cell': true, onclick: () => addCell() }, '＋ Ajouter une pièce…'),
        h('label', { class: 'anim-onion' }, (() => { const cb = h('input', { type: 'checkbox' }); cb.checked = st.onion; cb.onchange = () => { st.onion = cb.checked; store.set('tf.animOnion', cb.checked ? '1' : '0'); draw(); }; return cb; })(), ' Image précédente en transparence')),
      strip,
      h('div', { class: 'anim-work' }, h('div', { class: 'anim-stage-wrap' }, canvas,
        h('p', { class: 'form-info' }, anim.kind === 'projectile'
          ? 'Projectile : les cellules sont placées autour du projectile (au centre du trajet), qui pointe vers la droite. Il est tourné selon son trajet si « orienté » est coché.'
          : 'Glisse une cellule pour la placer ; flèches : déplacer d’un pixel (Maj : 10), Suppr : retirer. L’attaquant est à gauche : en jeu, l’animation est retournée quand il est à droite.')),
      h('div', { class: 'anim-panels' }, cellPane, framePane)));

    // ------------------------------------------------------------------ bande des images
    function renderStrip() {
      const n = frames().length;
      st.frame = Math.max(0, Math.min(st.frame, n - 1));
      const btns = frames().map((f, i) => h('button', {
        class: 'anim-frame' + (i === st.frame ? ' on' : '') + (anim.hitFrame === i + 1 && anim.kind !== 'projectile' ? ' hit' : ''), 'data-frame': i, title: `Image ${i + 1}` + (anim.hitFrame === i + 1 ? ' — impact' : ''),
        onclick: () => { st.frame = i; st.cell = -1; refresh(); }
      }, String(i + 1), (f.cells || []).length ? h('small', {}, String(f.cells.length)) : null, f.se ? h('i', {}, '♪') : null, f.flash ? h('i', {}, '✺') : null));
      const interp = h('select', { class: 'anim-interp', title: 'Interpoler les cellules de l’image courante jusqu’à l’image choisie' },
        h('option', { value: '' }, 'Interpoler jusqu’à…'), frames().map((f, i) => i > st.frame + 1 ? h('option', { value: i }, 'image ' + (i + 1)) : null));
      interp.onchange = () => {
        const to = Number(interp.value);
        if (A.interpolate(anim, st.frame, to)) { changed(); UI.toast(`Images ${st.frame + 2} à ${to} interpolées.`); refresh(); }
      };
      strip.replaceChildren(h('div', { class: 'anim-frame-list' }, btns),
        h('div', { class: 'anim-frame-tools' },
          h('button', { class: 'small', 'data-anim-frame-add': true, title: 'Nouvelle image vide après celle-ci', disabled: n >= A.MAX_FRAMES, onclick: () => { frames().splice(st.frame + 1, 0, { cells: [] }); st.frame++; st.cell = -1; changed(); refresh(); } }, '＋ Image'),
          h('button', { class: 'small', 'data-anim-frame-copy': true, title: 'Dupliquer l’image', disabled: n >= A.MAX_FRAMES, onclick: () => { frames().splice(st.frame + 1, 0, JSON.parse(JSON.stringify(curFrame()))); st.frame++; changed(); refresh(); } }, 'Dupliquer'),
          h('button', { class: 'small', title: 'Déplacer avant', disabled: st.frame === 0, onclick: () => move(-1) }, '◀'),
          h('button', { class: 'small', title: 'Déplacer après', disabled: st.frame >= n - 1, onclick: () => move(1) }, '▶'),
          h('button', { class: 'small danger', title: 'Supprimer l’image', disabled: n <= 1, onclick: () => { frames().splice(st.frame, 1); st.cell = -1; if (anim.hitFrame > frames().length) anim.hitFrame = frames().length; changed(); refresh(); } }, 'Supprimer'),
          interp));
      const on = strip.querySelector('.anim-frame.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    function move(d) {
      const F = frames(), j = st.frame + d;
      [F[st.frame], F[j]] = [F[j], F[st.frame]]; st.frame = j; changed(); refresh();
    }

    // ------------------------------------------------------------------ scène
    let z = 1;
    function draw() {
      if (st.run) return; // l'aperçu dessine lui-même
      paint((g) => {
        const o = originOf(anim);
        const prev = frames()[st.frame - 1];
        if (st.onion && prev) AnimPlayer.drawFrame(g, ctx.baseUrl, prev, o.x, o.y, 1, { alpha: 0.28 });
        AnimPlayer.drawFrame(g, ctx.baseUrl, curFrame(), o.x, o.y, 1);
        // repère de l'origine et contour de la cellule choisie
        g.strokeStyle = 'rgba(255,170,60,.8)'; g.lineWidth = 1 / z;
        g.beginPath(); g.moveTo(o.x - 8, o.y); g.lineTo(o.x + 8, o.y); g.moveTo(o.x, o.y - 8); g.lineTo(o.x, o.y + 8); g.stroke();
        const c = curCell();
        if (c) {
          g.save(); g.translate(o.x + (c.x || 0), o.y + (c.y || 0)); g.rotate((c.rotation || 0) * Math.PI / 180);
          const s = (c.scale || 100) / 100, w = c.rect[2] * s, hh = c.rect[3] * s;
          g.setLineDash([5 / z, 4 / z]); g.strokeStyle = '#ffb347'; g.lineWidth = 1.5 / z; g.strokeRect(-w / 2, -hh / 2, w, hh);
          g.restore();
        }
      });
    }
    function paint(fn, flash) {
      const dpr = window.devicePixelRatio || 1;
      const cw = canvas.clientWidth || 640;
      z = cw / STAGE.w;
      const ch = Math.round(STAGE.h * z);
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) { canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); canvas.style.height = ch + 'px'; }
      const g = canvas.getContext('2d');
      g.setTransform(dpr * z, 0, 0, dpr * z, 0, 0);
      g.fillStyle = '#1b1f2a'; g.fillRect(0, 0, STAGE.w, STAGE.h);
      const grd = g.createLinearGradient(0, 0, 0, STAGE.h); grd.addColorStop(0, '#232a3a'); grd.addColorStop(1, '#151820');
      g.fillStyle = grd; g.fillRect(0, 0, STAGE.w, STAGE.h);
      g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(0, SRC.y + 72, STAGE.w, STAGE.h);
      silhouette(g, SRC, 'Attaquant', false);
      silhouette(g, TGT, 'Cible', flash && flash.target);
      if (anim.kind === 'projectile' && !st.run) {
        g.save(); g.setLineDash([6, 6]); g.strokeStyle = 'rgba(255,255,255,.25)';
        g.beginPath(); g.moveTo(SRC.x + 30, SRC.y); g.quadraticCurveTo((SRC.x + TGT.x) / 2, SRC.y - (anim.arc || 0) * 2, TGT.x - 30, TGT.y); g.stroke(); g.restore();
      }
      fn(g);
    }
    const toUnits = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z }; };
    function hitTest(p) {
      const o = originOf(anim), cells = curFrame().cells || [];
      for (let i = cells.length - 1; i >= 0; i--) {
        const c = cells[i], dx = p.x - (o.x + (c.x || 0)), dy = p.y - (o.y + (c.y || 0));
        const r = -(c.rotation || 0) * Math.PI / 180, s = (c.scale || 100) / 100;
        const lx = (dx * Math.cos(r) - dy * Math.sin(r)) / s, ly = (dx * Math.sin(r) + dy * Math.cos(r)) / s;
        if (Math.abs(lx) <= c.rect[2] / 2 && Math.abs(ly) <= c.rect[3] / 2) return i;
      }
      return -1;
    }
    canvas.addEventListener('mousedown', (e) => {
      if (st.run) return;
      canvas.focus();
      const p = toUnits(e), i = hitTest(p);
      st.cell = i;
      renderCellPane(); draw();
      if (i < 0) return;
      const c = curCell(), drag = { p, x: c.x || 0, y: c.y || 0, moved: false };
      const onMove = (ev) => {
        const q = toUnits(ev);
        c.x = Math.round(drag.x + q.x - drag.p.x); c.y = Math.round(drag.y + q.y - drag.p.y); drag.moved = true;
        draw(); syncCellInputs();
      };
      const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); if (drag.moved) changed(); };
      window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    });
    canvas.addEventListener('keydown', (e) => {
      const c = curCell(); if (!c) return;
      const step = e.shiftKey ? 10 : 1;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (d) { e.preventDefault(); e.stopPropagation(); c.x = (c.x || 0) + d[0]; c.y = (c.y || 0) + d[1]; changed(); draw(); syncCellInputs(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeCell(); }
    });
    if (window.ResizeObserver) new ResizeObserver(() => draw()).observe(canvas);

    // ------------------------------------------------------------------ cellules
    let cellInputs = {};
    function syncCellInputs() { const c = curCell(); if (!c) return; for (const [k, el] of Object.entries(cellInputs)) if (document.activeElement !== el) el.value = c[k] === undefined ? '' : c[k]; }
    function renderCellPane() {
      cellInputs = {};
      const c = curCell();
      if (!c) {
        cellPane.replaceChildren(h('div', { class: 'form-heading' }, 'Cellule'),
          h('p', { class: 'form-info' }, (curFrame().cells || []).length ? 'Clique une cellule dans la scène pour la régler.' : 'Image vide : « Ajouter une pièce… » pose un morceau d’une planche.'));
        return;
      }
      const numField = (key, label, min, max) => {
        const el = h('input', { type: 'number', min, max, step: 1, 'data-cell-field': key }); el.value = c[key] === undefined ? '' : c[key];
        el.addEventListener('change', () => { let v = Number(el.value) || 0; v = Math.max(min, Math.min(max, v)); c[key] = v; el.value = v; changed(); draw(); });
        cellInputs[key] = el;
        return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), el);
      };
      const blend = h('select', { 'data-cell-field': 'blend' }, A.BLENDS.map(b => h('option', { value: b.value }, b.label)));
      blend.value = c.blend || 'normal'; blend.onchange = () => { c.blend = blend.value; changed(); draw(); };
      const mirror = h('input', { type: 'checkbox' }); mirror.checked = !!c.mirror; mirror.onchange = () => { c.mirror = mirror.checked; changed(); draw(); };
      const cells = curFrame().cells;
      cellPane.replaceChildren(
        h('div', { class: 'form-heading' }, `Cellule ${st.cell + 1} / ${cells.length}`),
        h('p', { class: 'anim-cell-src' }, c.image.split('/').pop().replace(/\.[a-z]+$/i, ''), ' · ', c.rect.join(', ')),
        h('div', { class: 'form-row' }, numField('x', 'X', -4000, 4000), numField('y', 'Y', -4000, 4000)),
        h('div', { class: 'form-row' }, numField('scale', 'Taille (%)', 1, 1000), numField('rotation', 'Rotation (°)', -3600, 3600)),
        h('div', { class: 'form-row' }, numField('opacity', 'Opacité (%)', 0, 100), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Fusion'), blend)),
        h('label', { class: 'field checkbox' }, mirror, h('span', {}, 'Retournée')),
        h('div', { class: 'anim-cell-tools' },
          h('button', { class: 'small', title: 'Passer devant', disabled: st.cell >= cells.length - 1, onclick: () => layer(1) }, '↑ Devant'),
          h('button', { class: 'small', title: 'Passer derrière', disabled: st.cell <= 0, onclick: () => layer(-1) }, '↓ Derrière'),
          h('button', { class: 'small', onclick: async () => { const p = await pickPiece(ctx.baseUrl, ctx.sheets, c); if (p) { c.image = p.image; c.rect = p.rect; changed(); refresh(); } } }, 'Changer la pièce…'),
          h('button', { class: 'small', disabled: cells.length >= A.MAX_CELLS, onclick: () => { cells.splice(st.cell + 1, 0, Object.assign(JSON.parse(JSON.stringify(c)), { x: (c.x || 0) + 10, y: (c.y || 0) + 10 })); st.cell++; changed(); refresh(); } }, 'Dupliquer'),
          h('button', { class: 'small danger', 'data-cell-delete': true, onclick: () => removeCell() }, 'Retirer')));
    }
    function layer(d) {
      const cells = curFrame().cells, j = st.cell + d;
      [cells[st.cell], cells[j]] = [cells[j], cells[st.cell]]; st.cell = j; changed(); refresh();
    }
    function removeCell() { const cells = curFrame().cells; if (st.cell < 0) return; cells.splice(st.cell, 1); st.cell = -1; changed(); refresh(); }
    async function addCell() {
      const f = curFrame(); f.cells = f.cells || [];
      if (f.cells.length >= A.MAX_CELLS) return UI.toast(`${A.MAX_CELLS} cellules au plus par image.`);
      const p = await pickPiece(ctx.baseUrl, ctx.sheets, f.cells[st.cell] || null);
      if (!p) return;
      f.cells.push(A.cell(p.image, p.rect, { scale: Math.max(10, Math.min(100, Math.round(12000 / Math.max(p.rect[2], p.rect[3])))) }));
      st.cell = f.cells.length - 1; changed(); refresh();
    }

    // ------------------------------------------------------------------ réglages de l'image (son, flash, tremblement)
    function renderFramePane() {
      const f = curFrame();
      const se = h('select', { 'data-frame-se': true }, h('option', { value: '' }, '— aucun —'), (ctx.sounds || []).map(p => h('option', { value: p }, p.split('/').pop())));
      se.value = f.se || ''; se.onchange = () => { if (se.value) f.se = se.value; else delete f.se; changed(); renderStrip(); if (se.value) Music.seFile(se.value); };
      const fl = f.flash || null;
      const scope = h('select', { 'data-frame-flash': true }, h('option', { value: '' }, '— aucun —'), A.FLASH_SCOPES.map(s => h('option', { value: s.value }, s.label)));
      scope.value = fl ? fl.scope : '';
      scope.onchange = () => {
        if (!scope.value) delete f.flash; else f.flash = Object.assign({ color: '#ffffff', strength: 60, duration: 3 }, f.flash || {}, { scope: scope.value });
        changed(); renderStrip(); renderFramePane();
      };
      const flashFields = fl ? [
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Couleur'), (() => { const el = h('input', { type: 'color', value: fl.color || '#ffffff' }); el.oninput = () => { fl.color = el.value; changed(); }; return el; })()),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Force (%)'), (() => { const el = h('input', { type: 'number', min: 0, max: 100, value: fl.strength }); el.onchange = () => { fl.strength = Math.max(0, Math.min(100, Math.round(Number(el.value) || 0))); changed(); }; return el; })()),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Durée (images)'), (() => { const el = h('input', { type: 'number', min: 1, max: 60, value: fl.duration }); el.onchange = () => { fl.duration = Math.max(1, Math.min(60, Math.round(Number(el.value) || 1))); changed(); }; return el; })())
      ] : [];
      const shake = h('input', { type: 'number', min: 0, max: 30, value: f.shake || 0 });
      shake.onchange = () => { const v = Math.max(0, Math.min(30, Math.round(Number(shake.value) || 0))); if (v) f.shake = v; else delete f.shake; changed(); };
      const isHit = anim.kind !== 'projectile' && anim.hitFrame === st.frame + 1;
      framePane.replaceChildren(
        h('div', { class: 'form-heading' }, `Image ${st.frame + 1} / ${frames().length}`),
        anim.kind !== 'projectile' ? h('label', { class: 'field checkbox' }, (() => { const cb = h('input', { type: 'checkbox', 'data-frame-hit': true }); cb.checked = isHit; cb.onchange = () => { anim.hitFrame = cb.checked ? st.frame + 1 : 0; changed(); renderStrip(); ctx.onHitFrame && ctx.onHitFrame(); }; return cb; })(),
          h('span', {}, 'Les dégâts tombent sur cette image')) : null,
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Son'), se),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Flash'), scope),
        flashFields.length ? h('div', { class: 'form-row' }, flashFields) : null,
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Tremblement de l’écran (0 à 30)'), shake));
    }

    // ------------------------------------------------------------------ aperçu
    function preview() {
      if (st.run) return;
      let flashT = 0, shake = 0;
      const run = AnimPlayer.run({
        list: ctx.list(), id: anim.id, baseUrl: ctx.baseUrl, unit: () => 1,
        source: () => body(SRC), target: () => body(TGT), screen: () => SCREEN,
        onEvent: (ev) => {
          if (ev.type === 'se') Music.seFile(ev.path);
          if (ev.type === 'shake') shake = Math.max(shake, ev.amount);
          if (ev.type === 'flash' && ev.scope === 'target') flashT = performance.now() + ev.duration;
        }
      });
      st.run = run; playBtn.disabled = true;
      let hitShown = 0;
      run.hit.then(() => { hitShown = performance.now(); });
      const loop = () => {
        const fl = { target: performance.now() < flashT };
        paint((g) => {
          g.save();
          if (shake > 0.3) { g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake * 0.6); shake *= 0.88; }
          run.draw(g);
          g.restore();
          run.drawScreenFlash(g, STAGE.w, STAGE.h);
          if (hitShown && performance.now() - hitShown < 700) {
            g.fillStyle = '#ffe680'; g.font = '800 26px Inter, system-ui, sans-serif'; g.textAlign = 'center';
            g.fillText('12', TGT.x, TGT.y - 120 - (performance.now() - hitShown) / 25);
          }
        }, fl);
        if (run.active || run.flashes.length || performance.now() - hitShown < 700) requestAnimationFrame(loop);
        else { st.run = null; playBtn.disabled = false; draw(); }
      };
      requestAnimationFrame(loop);
    }

    function refresh() { renderStrip(); renderCellPane(); renderFramePane(); draw(); }
    // planches chargées : la scène est redessinée
    AnimPlayer.preload(ctx.baseUrl, [anim]).then(() => draw());
    refresh();
    requestAnimationFrame(draw);
    rootEl.preview = preview;
    return rootEl;
  }

  // ----------------------------------------------------------------------------------------------
  // Choix d'une pièce dans une planche
  // ----------------------------------------------------------------------------------------------
  const pieceCache = new Map();
  /** Morceaux d'une planche : zones opaques reliées (à 4 px près), comme tools/… les détecte. */
  function detectPieces(img) {
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    if (!W || !H) return [];
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    let data;
    try { data = g.getImageData(0, 0, W, H).data; } catch (e) { return []; }
    // grille de 2 px : une case est pleine si un de ses pixels est assez opaque
    const S = 2, gw = Math.ceil(W / S), gh = Math.ceil(H / S), full = new Uint8Array(gw * gh);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 12) full[(y / S | 0) * gw + (x / S | 0)] = 1;
    // dilatation de 2 cases : les morceaux à 4 px près restent ensemble
    const R = 2, tmp = new Uint8Array(gw * gh), grown = new Uint8Array(gw * gh);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { if (!full[y * gw + x]) continue; for (let d = -R; d <= R; d++) { const xx = x + d; if (xx >= 0 && xx < gw) tmp[y * gw + xx] = 1; } }
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { if (!tmp[y * gw + x]) continue; for (let d = -R; d <= R; d++) { const yy = y + d; if (yy >= 0 && yy < gh) grown[yy * gw + x] = 1; } }
    const label = new Int32Array(gw * gh), out = [], stack = [];
    let n = 0;
    for (let i = 0; i < gw * gh; i++) {
      if (!grown[i] || label[i]) continue;
      n++; label[i] = n; stack.push(i);
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
      while (stack.length) {
        const k = stack.pop(), x = k % gw, y = (k / gw) | 0;
        if (full[k]) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
          const j = yy * gw + xx; if (grown[j] && !label[j]) { label[j] = n; stack.push(j); }
        }
      }
      if (x1 < 0) continue;
      // bornes exactes au pixel dans la zone trouvée
      let px0 = Infinity, py0 = Infinity, px1 = -1, py1 = -1;
      for (let y = y0 * S; y < Math.min(H, (y1 + 1) * S); y++) for (let x = x0 * S; x < Math.min(W, (x1 + 1) * S); x++) {
        if (data[(y * W + x) * 4 + 3] > 12) { if (x < px0) px0 = x; if (y < py0) py0 = y; if (x > px1) px1 = x; if (y > py1) py1 = y; }
      }
      if (px1 < 0) continue;
      const w = px1 - px0 + 1, hh = py1 - py0 + 1;
      if (w >= 6 && hh >= 6) out.push([px0, py0, w, hh]);
    }
    out.sort((a, b) => (Math.floor(a[1] / 32) - Math.floor(b[1] / 32)) || a[0] - b[0]);
    return out;
  }

  /** Fenêtre de choix : une planche, ses morceaux détectés (clic) ou une zone tracée à la souris. */
  function pickPiece(baseUrl, sheets, current) {
    sheets = (sheets || []).slice();
    if (!sheets.length) { UI.alert('Aucune planche d’animation', 'Range des images dans ressources/animations (Ressources › « Ajouter les ressources par défaut » copie les planches de base).'); return Promise.resolve(null); }
    let sheet = current && sheets.includes(current.image) ? current.image : store.get('tf.animSheet', sheets[0]);
    if (!sheets.includes(sheet)) sheet = sheets[0];
    return UI.modal((box, close) => {
      box.classList.add('anim-picker-modal');
      const canvas = h('canvas', { class: 'anim-picker', 'data-anim-picker': true });
      const info = h('span', { class: 'anim-picker-info' });
      const label = (p) => p.replace(/^ressources\/animations\//, '').replace(/\.[a-z]+$/i, '');
      const sel = h('select', { 'data-anim-sheet': true }, sheets.map(p => h('option', { value: p }, label(p))));
      sel.value = sheet;
      let img = null, pieces = [], k = 1, hover = -1, drag = null, rect = null;
      const load = async () => {
        store.set('tf.animSheet', sheet);
        img = await Render.loadImage(baseUrl, sheet);
        if (!img) { info.textContent = 'Image illisible.'; return; }
        if (!pieceCache.has(sheet)) pieceCache.set(sheet, detectPieces(img));
        pieces = pieceCache.get(sheet); hover = -1; rect = null;
        info.textContent = `${img.naturalWidth} × ${img.naturalHeight} · ${pieces.length} morceaux · clic : choisir · glisser : tracer une zone`;
        draw();
      };
      sel.onchange = () => { sheet = sel.value; load(); };
      function draw() {
        if (!img) return;
        const maxW = Math.min(980, window.innerWidth - 120), maxH = window.innerHeight - 260;
        k = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
        const w = Math.round(img.naturalWidth * k), hh = Math.round(img.naturalHeight * k), dpr = window.devicePixelRatio || 1;
        canvas.width = w * dpr; canvas.height = hh * dpr; canvas.style.width = w + 'px'; canvas.style.height = hh + 'px';
        const g = canvas.getContext('2d'); g.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
        // damier : la transparence se voit
        const c = 16 / k;
        for (let y = 0; y < img.naturalHeight; y += c) for (let x = 0; x < img.naturalWidth; x += c) { g.fillStyle = ((x / c + y / c) & 1) ? '#262b38' : '#1e222d'; g.fillRect(x, y, c, c); }
        g.drawImage(img, 0, 0);
        g.lineWidth = 1 / k;
        pieces.forEach((p, i) => { g.strokeStyle = i === hover ? '#ffb347' : 'rgba(80,220,140,.45)'; g.lineWidth = (i === hover ? 2 : 1) / k; g.strokeRect(p[0] + 0.5, p[1] + 0.5, p[2] - 1, p[3] - 1); });
        if (current && current.image === sheet) { g.strokeStyle = '#5ab0ff'; g.lineWidth = 2 / k; g.strokeRect(...current.rect); }
        if (rect) { g.setLineDash([6 / k, 4 / k]); g.strokeStyle = '#ffb347'; g.lineWidth = 2 / k; g.strokeRect(...rect); g.setLineDash([]); }
      }
      const at = (e) => { const r = canvas.getBoundingClientRect(); return { x: Math.round((e.clientX - r.left) / k), y: Math.round((e.clientY - r.top) / k) }; };
      const pieceAt = (p) => { let best = -1, area = Infinity; pieces.forEach((q, i) => { if (p.x >= q[0] && p.y >= q[1] && p.x < q[0] + q[2] && p.y < q[1] + q[3] && q[2] * q[3] < area) { best = i; area = q[2] * q[3]; } }); return best; };
      canvas.addEventListener('mousemove', (e) => {
        const p = at(e);
        if (drag) { rect = [Math.min(drag.x, p.x), Math.min(drag.y, p.y), Math.abs(p.x - drag.x) + 1, Math.abs(p.y - drag.y) + 1]; draw(); return; }
        const i = pieceAt(p); if (i !== hover) { hover = i; draw(); }
      });
      canvas.addEventListener('mousedown', (e) => { drag = at(e); rect = null; });
      canvas.addEventListener('mouseup', (e) => {
        const p = at(e), d = drag; drag = null;
        if (d && Math.abs(p.x - d.x) + Math.abs(p.y - d.y) > 6 && rect && rect[2] >= 2 && rect[3] >= 2) {
          const W = img.naturalWidth, H = img.naturalHeight;
          const r = [Math.max(0, rect[0]), Math.max(0, rect[1])]; r.push(Math.min(W - r[0], rect[2]), Math.min(H - r[1], rect[3]));
          return close({ image: sheet, rect: r });
        }
        const i = pieceAt(p);
        if (i >= 0) close({ image: sheet, rect: pieces[i].slice() });
      });
      box.append(h('h3', {}, 'Choisir une pièce'),
        h('div', { class: 'anim-picker-bar' }, h('label', { class: 'field-label' }, 'Planche'), sel, info),
        h('div', { class: 'anim-picker-scroll' }, canvas),
        h('div', { class: 'modal-actions' }, h('button', { onclick: () => close(null) }, 'Annuler')));
      load();
    }, { wide: true });
  }

  root.AnimationEditor = { render, pickPiece, detectPieces, STAGE };
})(self);
