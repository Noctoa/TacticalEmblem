/* Sprites de map (img/characters) et battlers (img/battlers) : dessin d'une frame selon le temps. */
(function (root) {
  'use strict';

  function animFrame(anim, t) {
    const frames = anim.frames || [0];
    const durs = anim.durations || frames.map(() => 100);
    const total = durs.reduce((a, b) => a + b, 0) || 1;
    let k = ((t % total) + total) % total;
    for (let i = 0; i < frames.length; i++) {
      if (k < durs[i]) return frames[i];
      k -= durs[i];
    }
    return frames[frames.length - 1];
  }

  /**
   * Dessine un sprite de map. (cx, bottom) = centre bas de la case. k = facteur d'échelle (taille de case / meta.base).
   * opts : { anim, t, palette, frame, alpha }
   */
  function drawMapSprite(ctx, meta, img, cx, bottom, k, opts) {
    if (!meta || !img) return false;
    opts = opts || {};
    const anim = meta.anims[opts.anim] || meta.anims.idle;
    const fi = opts.frame !== undefined ? anim.frames[opts.frame % anim.frames.length] : animFrame(anim, opts.t || 0);
    const [fw, fh] = meta.frame;
    let pi = Math.max(0, meta.palettes.indexOf(opts.palette || 'ally'));
    const sx = fi * fw, sy = pi * meta.paletteHeight + anim.row * fh;
    const [ax, ay] = meta.anchor;
    if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    ctx.drawImage(img, sx, sy, fw, fh, Math.round(cx - ax * k), Math.round(bottom - ay * k), fw * k, fh * k);
    if (opts.alpha !== undefined) ctx.globalAlpha = 1;
    return true;
  }

  /** Dessine une frame de battler (index dans la planche). (x, ground) = point d'ancrage à l'écran. */
  function drawBattlerFrame(ctx, meta, img, index, x, ground, scale, flip) {
    const [cw, ch] = meta.cell;
    const sx = (index % meta.columns) * cw, sy = Math.floor(index / meta.columns) * ch;
    const [ax, ay] = meta.anchor;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(ground));
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, sx, sy, cw, ch, -ax * scale, -ay * scale, cw * scale, ch * scale);
    ctx.restore();
  }

  /** Petite icône (canvas) d'un sprite de map, pour les listes. */
  function icon(baseUrl, meta, palette, size) {
    const s = size || 32;
    const c = document.createElement('canvas');
    c.width = s; c.height = s; c.className = 'sprite-icon';
    if (!meta) return c;
    Render.loadImage(baseUrl, meta.image).then(img => {
      if (!img) return;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      // on cadre la zone utile (24×24 autour du personnage) dans l'icône
      const k = s / 24;
      drawMapSprite(g, meta, img, s / 2, (meta.anchor[1] - 2) * k, k, { anim: 'idle', frame: 0, palette });
    });
    return c;
  }

  root.Sprites = { animFrame, drawMapSprite, drawBattlerFrame, icon };
})(self);
