/* Sprites de map et animations de combat : dessin d'une frame selon le temps, couleurs d'équipe (voir shared/palettes.js). */
(function (root) {
  'use strict';
  const tints = new WeakMap();   // image -> Map(clé -> canvas recoloré)
  const counts = new WeakMap();  // image -> Map(clé meta -> couleurs comptées)

  const imgW = (img) => img.naturalWidth || img.width;
  const imgH = (img) => img.naturalHeight || img.height;

  /** Couleurs de la planche (pour une ancienne planche à 4 palettes : seulement le premier bloc). */
  function colorsOf(img, meta) {
    let per = counts.get(img); if (!per) counts.set(img, per = new Map());
    const h = meta && meta.paletteHeight ? Math.min(imgH(img), meta.paletteHeight) : imgH(img);
    if (per.has(h)) return per.get(h);
    const cv = document.createElement('canvas'); cv.width = imgW(img); cv.height = h;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    const c = Palettes.countColors(g.getImageData(0, 0, cv.width, h).data);
    per.set(h, c);
    return c;
  }

  /** Couleurs d'équipe d'une ressource : { list, auto, colors (toutes, triées) }. */
  function teamColors(img, meta) {
    const c = colorsOf(img, meta);
    return { list: Palettes.teamColorsOf(meta, c), auto: !(meta && Array.isArray(meta.teamColors)), colors: Palettes.describe(c) };
  }

  /** Image (ou canvas) dans la palette demandée ; l'original est renvoyé tel quel. */
  function tinted(img, meta, palette) {
    palette = Palettes.norm(palette);
    if (!img || palette === 'original') return img;
    let per = tints.get(img); if (!per) tints.set(img, per = new Map());
    const team = meta && Array.isArray(meta.teamColors) ? meta.teamColors.join(',') : 'auto';
    const key = palette + '|' + team + '|' + (meta && meta.paletteHeight || 0);
    if (per.has(key)) return per.get(key);
    const cv = document.createElement('canvas'); cv.width = imgW(img); cv.height = imgH(img);
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    try {
      const d = g.getImageData(0, 0, cv.width, cv.height);
      const c = colorsOf(img, meta);
      Palettes.apply(d.data, palette, Palettes.teamColorsOf(meta, c), palette === 'gray' ? Palettes.countColors(d.data) : c);
      g.putImageData(d, 0, 0);
    } catch (e) { per.set(key, img); return img; }
    per.set(key, cv);
    return cv;
  }
  /** Oublie les variantes calculées (après un changement des couleurs d'équipe). */
  function forgetTints(img) { if (img) { tints.delete(img); counts.delete(img); } }

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
   * opts : { anim, t, palette ('original' | 'blue' | 'red' | 'green' | 'gray'), frame, alpha }
   * Seul le premier bloc de la planche est lu (les anciennes planches avaient 4 palettes précalculées).
   */
  function drawMapSprite(ctx, meta, img, cx, bottom, k, opts) {
    if (!meta || !img) return false;
    opts = opts || {};
    const anim = meta.anims[opts.anim] || meta.anims.idle;
    const fi = opts.frame !== undefined ? anim.frames[opts.frame % anim.frames.length] : animFrame(anim, opts.t || 0);
    const [fw, fh] = meta.frame;
    const sx = fi * fw, sy = anim.row * fh;
    img = tinted(img, meta, opts.palette || 'original');
    const [ax, ay] = meta.anchor;
    if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    ctx.drawImage(img, sx, sy, fw, fh, Math.round(cx - ax * k), Math.round(bottom - ay * k), fw * k, fh * k);
    if (opts.alpha !== undefined) ctx.globalAlpha = 1;
    return true;
  }

  /** Dessine une frame de battler (index dans la planche). (x, ground) = point d'ancrage à l'écran. img : déjà recolorée (tinted). */
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

  root.Sprites = { animFrame, drawMapSprite, drawBattlerFrame, icon, tinted, teamColors, forgetTints };
})(self);
