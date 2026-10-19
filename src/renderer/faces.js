/*
 * Portraits au format « face set » des Fire Emblem GBA (planche de 128×112) :
 *
 *   (0,0)    96×80  portrait principal
 *   (96,16)  32×32  mini-portrait (fenêtres, listes)
 *   (96,48)  32×16  yeux mi-clos      (96,64) 32×16 yeux fermés
 *   (0,80) (32,80) (64,80)    bouche ouverte, entrouverte, fermée
 *   (96,80)                   sourire bouche fermée
 *   (0,96) (32,96) (64,96)    sourire ouvert, entrouvert, fermé
 *   (96,96)                   inutilisé
 *
 * La couleur du pixel (0,0) sert de fond transparent. La position des yeux et de la
 * bouche sur le portrait n'est pas dans l'image : on la retrouve en cherchant où les
 * cases « yeux mi-clos » et « bouche fermée » collent le mieux au portrait.
 * Une image qui ne fait pas 128×112 reste un portrait simple (affiché tel quel).
 */
(function (root) {
  'use strict';
  const W = 128, H = 112;
  const sheets = new WeakMap();
  const live = new Set();

  const MOUTH = { open: [0, 80], half: [32, 80], closed: [64, 80], smile: [96, 80], smileOpen: [0, 96], smileHalf: [32, 96] };
  const EYES = { half: [96, 48], closed: [96, 64] };
  const TALK = ['half', 'open', 'half', 'closed'];

  function isFaceset(img) { return !!img && img.naturalWidth === W && img.naturalHeight === H; }

  /** Découpe et analyse une planche (mis en cache par image). */
  function sheetOf(img) {
    if (!isFaceset(img)) return null;
    if (sheets.has(img)) return sheets.get(img);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, W, H);
    const px = data.data;
    const at = (x, y) => (y * W + x) * 4;
    // meilleure position d'une case 32×16 sur le portrait (nombre de pixels différents)
    const locate = ([sx, sy]) => {
      let best = [Infinity, 0, 0];
      for (let y = 0; y <= 80 - 16; y++) for (let x = 0; x <= 96 - 32; x++) {
        let n = 0;
        for (let j = 0; j < 16 && n < best[0]; j++) for (let i = 0; i < 32; i++) {
          const a = at(sx + i, sy + j), b = at(x + i, y + j);
          if (px[a] !== px[b] || px[a + 1] !== px[b + 1] || px[a + 2] !== px[b + 2]) n++;
        }
        if (n < best[0]) best = [n, x, y];
      }
      return [best[1], best[2]];
    };
    const sheet = { canvas: cv, mouth: locate(MOUTH.closed), eyes: locate(EYES.half) };
    // fond transparent
    const [r, gg, b] = [px[0], px[1], px[2]];
    for (let i = 0; i < px.length; i += 4) if (px[i] === r && px[i + 1] === gg && px[i + 2] === b) px[i + 3] = 0;
    g.putImageData(data, 0, 0);
    sheets.set(img, sheet);
    return sheet;
  }

  /**
   * Élément portrait. mode : 'main' (96×80, dialogues), 'bust' (80×80 recadré, cases carrées),
   * 'mini' (32×32). Renvoie un <canvas> animé (clignement, bouche) pour un face set,
   * un <img> sinon. el.face.talking = true fait parler le personnage.
   */
  function element(img, src, mode) {
    const sheet = sheetOf(img);
    if (!sheet) return src ? h('img', src) : null;
    const box = mode === 'mini' ? [96, 16, 32, 32] : mode === 'bust' ? [8, 0, 80, 80] : [0, 0, 96, 80];
    const cv = document.createElement('canvas');
    cv.width = box[2]; cv.height = box[3];
    cv.className = 'faceset faceset-' + (mode || 'main');
    const ctl = { cv, sheet, box, mode, talking: false, smile: false, nextBlink: performance.now() + 1500 + Math.random() * 2500, blinkT0: 0, frameKey: '' };
    cv.face = ctl;
    draw(ctl, performance.now(), true);
    if (mode !== 'mini') live.add(ctl);
    if (live.size === 1) requestAnimationFrame(loop);
    return cv;
  }
  function h(tag, src) { const e = document.createElement(tag); e.src = src; return e; }

  function draw(c, t, force) {
    // yeux : mi-clos → fermés → mi-clos, toutes les 2 à 5 secondes
    let eyes = null;
    if (t >= c.nextBlink) { c.blinkT0 = t; c.nextBlink = t + 2000 + Math.random() * 3000; }
    const bt = t - c.blinkT0;
    if (c.blinkT0 && bt < 180) eyes = bt < 50 ? 'half' : bt < 130 ? 'closed' : 'half';
    // bouche : cycle pendant que le texte défile
    let mouth = null;
    if (c.talking) {
      const m = TALK[Math.floor(t / 90) % TALK.length];
      mouth = c.smile ? ({ half: 'smileHalf', open: 'smileOpen', closed: 'smile' })[m] : m;
    } else if (c.smile) mouth = 'smile';
    const key = (eyes || '') + '|' + (mouth || '');
    if (!force && key === c.frameKey) return;
    c.frameKey = key;
    const g = c.cv.getContext('2d');
    const [bx, by, bw, bh] = c.box, S = c.sheet;
    g.clearRect(0, 0, bw, bh);
    g.drawImage(S.canvas, bx, by, bw, bh, 0, 0, bw, bh);
    if (c.mode === 'mini') return;
    const patch = ([sx, sy], [dx, dy]) => { g.clearRect(dx - bx, dy - by, 32, 16); g.drawImage(S.canvas, sx, sy, 32, 16, dx - bx, dy - by, 32, 16); };
    if (eyes) patch(EYES[eyes], S.eyes);
    if (mouth) patch(MOUTH[mouth], S.mouth);
  }

  function loop(t) {
    for (const c of live) { if (!c.cv.isConnected && t - (c.born || (c.born = t)) > 1000) live.delete(c); else draw(c, t); }
    if (live.size) requestAnimationFrame(loop);
  }

  root.Faces = { isFaceset, sheetOf, element, MOUTH, EYES };
})(self);
