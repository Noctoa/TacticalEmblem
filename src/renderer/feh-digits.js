/*
 * Chiffres de dégâts façon Fire Emblem Heroes (img/feh/digits-<style>.png, découpés par tools/build_ui_feh.py).
 * Styles : crit (grands, rouges), dmg (rouges), small (petits, rouges), heal (verts).
 *
 *   FehDigits.draw(ctx, 27, x, y, hauteur, 'dmg')   → true si dessiné (images chargées), sinon false
 * x, y : centre du nombre. Les images sont chargées au premier appel ; tant qu'elles ne le sont pas, l'appelant
 * dessine le texte habituel.
 */
(function (root) {
  'use strict';
  const META = root.FEH_DIGITS || {};
  const imgs = {};
  function image(style) {
    if (!META[style]) return null;
    if (!imgs[style]) { const im = new Image(); im.src = new URL(`img/feh/digits-${style}.png`, document.baseURI).href; imgs[style] = im; }
    const im = imgs[style];
    return im.complete && im.naturalWidth ? im : null;
  }
  /** Précharge les styles (appelé au démarrage du jeu). */
  function preload() { for (const s of Object.keys(META)) image(s); }
  /** Largeur à l'écran d'un nombre dessiné à la hauteur h. */
  function width(n, h, style) {
    const m = META[style]; if (!m) return 0;
    return String(Math.max(0, Math.floor(n))).split('').reduce((w, d) => w + m.cells[+d][1] * h / m.h * 0.86, 0);
  }
  function draw(ctx, n, x, y, h, style) {
    const m = META[style], im = image(style);
    if (!m || !im || !Number.isFinite(Number(n))) return false;
    const s = h / m.h, digitsList = String(Math.max(0, Math.floor(Number(n)))).split('');
    const total = width(n, h, style);
    let cx = x - total / 2;
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true; // illustrations lissées, pas du pixel art
    for (const d of digitsList) {
      const [sx, sw] = m.cells[+d];
      ctx.drawImage(im, sx, 0, sw, m.h, cx - sw * s * 0.07, y - h / 2, sw * s, h); // chiffres un peu resserrés
      cx += sw * s * 0.86;
    }
    ctx.imageSmoothingEnabled = smooth;
    return true;
  }
  root.FehDigits = { draw, width, preload, styles: () => Object.keys(META) };
})(self);
