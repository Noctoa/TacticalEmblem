/*
 * Lecture des animations d'attaque (src/shared/animations.js) sur un canvas : combat animé, map, aperçu de l'éditeur.
 *
 *   const run = AnimPlayer.run({ list, id, baseUrl,
 *     unit: () => px par unité (48 unités = une case),
 *     source: () => ({ x, y, feet, head }), target: () => ({ x, y, feet, head }), screen: () => ({ x, y }),
 *     speed: () => 1, skipped: () => false, onEvent: (ev) => {} });   // ev : { type: 'se' | 'flash' | 'shake', … }
 *   run.draw(ctx)                 à chaque image de la boucle d'affichage
 *   run.drawScreenFlash(ctx, w, h)
 *   await run.hit                 moment des dégâts (image d'impact, arrivée d'un projectile) ; await run.done
 */
(function (root) {
  'use strict';
  const A = root.Animations;

  /** Précharge les planches utilisées par ces animations. */
  function preload(baseUrl, list) { return Promise.all(A.images(list).map(p => Render.loadImage(baseUrl, p))); }

  /** Dessine les cellules d'une image à l'origine (ox, oy). u : px par unité ; mirror : retourné horizontalement. */
  function drawFrame(g, baseUrl, frame, ox, oy, u, opts = {}) {
    if (!frame) return;
    const mirror = !!opts.mirror, angle = opts.angle || 0, alpha = opts.alpha === undefined ? 1 : opts.alpha;
    for (const c of frame.cells || []) {
      const img = Render.readyImage(baseUrl, c.image);
      if (!img) { Render.loadImage(baseUrl, c.image); continue; }
      const [rx, ry, rw, rh] = c.rect;
      const s = (c.scale === undefined ? 100 : c.scale) / 100 * u;
      g.save();
      g.translate(ox, oy);
      if (angle) g.rotate(angle);
      if (opts.flipY) g.scale(1, -1);
      const sx = mirror ? -1 : 1;
      g.translate(sx * (c.x || 0) * u, (c.y || 0) * u);
      g.rotate(sx * (c.rotation || 0) * Math.PI / 180);
      g.scale((mirror !== !!c.mirror ? -1 : 1) * s, s);
      g.globalAlpha = Math.max(0, Math.min(1, (c.opacity === undefined ? 100 : c.opacity) / 100)) * alpha;
      g.globalCompositeOperation = c.blend === 'add' ? 'lighter' : 'source-over';
      g.imageSmoothingEnabled = true;
      g.drawImage(img, rx, ry, rw, rh, -rw / 2, -rh / 2, rw, rh);
      g.restore();
    }
  }

  function run(opts) {
    const chain = A.chain(opts.list, opts.id);
    const speed = opts.speed || (() => 1), skipped = opts.skipped || (() => false), emit = opts.onEvent || (() => {});
    let resolveHit, resolveDone;
    const r = { hit: new Promise(res => { resolveHit = res; }), done: new Promise(res => { resolveDone = res; }), active: true, flashes: [] };
    let stage = 0, t = 0, last = performance.now(), lastFrame = -1, hitDone = false;
    const hit = () => { if (!hitDone) { hitDone = true; resolveHit(); } };
    const finish = () => { if (!r.active) return; r.active = false; hit(); resolveDone(); };
    if (!chain.length) { finish(); return Object.assign(r, { draw() {}, drawScreenFlash() {} }); }
    const cur = () => chain[stage];
    // les dégâts tombent à l'arrivée d'un projectile, sauf si l'animation suivante (sur la cible) a sa propre image d'impact
    const nextHits = (i) => { const n = chain[i + 1]; return !!n && n.kind === 'normal' && (n.on || 'target') === 'target' && n.hitFrame > 0; };
    const fire = (a, i) => {
      const f = a.frames[i]; if (!f) return;
      if (f.se) emit({ type: 'se', path: f.se });
      if (f.shake) emit({ type: 'shake', amount: f.shake });
      if (f.flash && f.flash.strength > 0) {
        const fl = { scope: f.flash.scope, color: f.flash.color, strength: f.flash.strength / 100, duration: f.flash.duration * (a.speed || 50), t0: performance.now() };
        if (fl.scope === 'screen') r.flashes.push(fl);
        emit(Object.assign({ type: 'flash' }, fl));
      }
    };
    function step(now) {
      if (!r.active) return;
      if (skipped()) { finish(); return; }
      t += (now - last) * speed(); last = now;
      for (;;) {
        const a = cur();
        const fi = A.frameIndex(a, t);
        if (a.kind !== 'projectile' || t < a.frames.length * (a.speed || 50)) {
          // évènements des images franchies (une seule fois, même si un projectile boucle)
          const upto = a.kind === 'projectile' ? Math.min(fi, a.frames.length - 1) : fi;
          while (lastFrame < upto) { lastFrame++; if (a.kind !== 'projectile' || lastFrame < a.frames.length) fire(a, lastFrame); }
        }
        if (a.kind === 'normal' && (a.on || 'target') === 'target' && a.hitFrame > 0 && fi >= a.hitFrame - 1) hit();
        const dur = A.duration(a);
        if (t < dur) break;
        if (a.kind === 'projectile' && !nextHits(stage)) hit();
        t -= dur; lastFrame = -1;
        if (++stage >= chain.length) { finish(); return; }
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);

    const point = (p, pos) => !p ? { x: 0, y: 0 } : { x: p.x, y: pos === 'feet' ? (p.feet !== undefined ? p.feet : p.y) : pos === 'head' ? (p.head !== undefined ? p.head : p.y) : p.y };
    r.draw = (g) => {
      if (!r.active) return;
      const a = cur(), u = opts.unit(), src = opts.source(), tgt = opts.target();
      const mirror = src && tgt ? src.x > tgt.x + 0.5 : false;
      const fi = A.frameIndex(a, t);
      g.save();
      if (a.kind === 'projectile') {
        const k = Math.max(0, Math.min(1, t / Math.max(1, a.travel || 300)));
        const p0 = point(src, 'center'), p1 = point(tgt, 'center');
        const arc = (a.arc || 0) * u;
        const x = p0.x + (p1.x - p0.x) * k, y = p0.y + (p1.y - p0.y) * k - Math.sin(k * Math.PI) * arc;
        let angle = 0, flipY = false;
        if (a.rotate !== false) {
          const dx = p1.x - p0.x, dy = (p1.y - p0.y) - Math.cos(k * Math.PI) * Math.PI * arc;
          angle = Math.atan2(dy, dx || 0.0001);
          flipY = Math.cos(angle) < 0; // reste à l'endroit quand il part vers la gauche
        }
        drawFrame(g, opts.baseUrl, a.frames[fi], x, y, u, { mirror: a.rotate === false && mirror, angle, flipY });
      } else {
        const who = (a.on || 'target') === 'user' ? src : tgt;
        const o = a.position === 'screen' && opts.screen ? opts.screen() : point(who, a.position);
        drawFrame(g, opts.baseUrl, a.frames[fi], o.x, o.y, u, { mirror });
      }
      g.restore();
    };
    r.drawScreenFlash = (g, w, h) => {
      const now = performance.now();
      for (let i = r.flashes.length - 1; i >= 0; i--) {
        const f = r.flashes[i], k = (now - f.t0) / Math.max(1, f.duration / speed());
        if (k >= 1) { r.flashes.splice(i, 1); continue; }
        g.save(); g.globalAlpha = f.strength * (1 - k); g.fillStyle = f.color; g.fillRect(0, 0, w, h); g.restore();
      }
    };
    return r;
  }

  /** Durée totale d'une animation et de ses enchaînements (ms, sans le ralentissement). */
  function totalDuration(list, id) { return A.chain(list, id).reduce((n, a) => n + A.duration(a), 0); }

  root.AnimPlayer = { run, drawFrame, preload, totalDuration };
})(self);
