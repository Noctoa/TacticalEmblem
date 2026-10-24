/*
 * Générateur de personnage (d'après « FE Character Creator » de TheFlyingMinotaur) : calcul pur, sans DOM.
 *
 * Un personnage généré est décrit par une recette :
 *   { hair, face, armor, token,                      identifiants des pièces (img/generator/parts.js), '' = aucune
 *     colors: { skin, hair, metal, trim, cloth, leather }   couleurs '#rrggbb'
 *     offsets: { hair: [dx, dy], face: [dx, dy], armor: [dx, dy] } }   décalage de chaque pièce en pixels
 *
 * Les pièces sont « indexées » : la composante rouge / 10 d'un pixel donne la teinte (voir SHADES). La
 * composition superpose cheveux arrière, tenue, visage puis cheveux sur 96 × 96, recolorés avec la palette.
 * On en tire un face set 128 × 112 (portrait 96 × 80, mini-portrait 32 × 32) et un sprite de map
 * (figurine 64 × 64 animée : respiration, pas sautillés, miroir vers la droite).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CharGen = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SIZE = 96, TOKEN = 64;
  const LAYERS = ['hairb', 'armor', 'face', 'hair']; // ordre de dessin
  const GROUPS = [
    { id: 'skin', label: 'Peau' }, { id: 'hair', label: 'Cheveux' }, { id: 'metal', label: 'Métal' },
    { id: 'trim', label: 'Ornements' }, { id: 'cloth', label: 'Tissu' }, { id: 'leather', label: 'Cuir' }
  ];
  const DEFAULT_COLORS = { skin: '#c08c6e', hair: '#403219', metal: '#646464', trim: '#f7ad52', cloth: '#525273', leather: '#946442' };
  // nuancier proposé pour chaque teinte (le sélecteur de couleur reste libre)
  const SWATCHES = {
    skin: ['#f8d8b8', '#f0c090', '#e0a878', '#c08c6e', '#a87050', '#8a5a3c', '#6a4028', '#4a2c1c'],
    hair: ['#f0e0a0', '#e8b848', '#c07830', '#a03018', '#d84830', '#403219', '#202028', '#e8e8f0', '#9090a0', '#5080d8', '#48a868', '#a058c8', '#f088b8'],
    metal: ['#c8c8d0', '#909098', '#646464', '#404048', '#c8a860', '#806040'],
    trim: ['#f7ad52', '#f0d878', '#e8e8f0', '#d84830', '#48a868', '#5080d8', '#a058c8'],
    cloth: ['#525273', '#3058b0', '#2880c8', '#b03030', '#2f7d4f', '#6a3a98', '#d8c8a0', '#383838', '#e8e8e8', '#c86818'],
    leather: ['#946442', '#6a4428', '#c89060', '#403028', '#808060']
  };
  // composante rouge / 10 → teinte : [groupe, nuance] (nuance : -1 plus clair, 0 base, n plus sombre n fois)
  const SHADES = [['outline', 0], ['hair', -1], ['hair', 0], ['hair', 1], ['skin', -1], ['skin', 0], ['skin', 1], ['skin', 2], ['skin', 3],
    ['metal', -1], ['metal', 0], ['metal', 1], ['trim', -1], ['trim', 0], ['trim', 1], ['cloth', -1], ['cloth', 0], ['cloth', 1],
    ['leather', -1], ['leather', 0], ['leather', 1]];

  const hex = (c) => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  function rgb(s) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(s || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  // éclaircir / assombrir : java.awt.Color.brighter() / darker() (facteur 0,7) comme le générateur d'origine,
  // l'éclaircissement étant plafonné (une couleur déjà claire ne vire pas au blanc pur)
  function brighter(c) {
    const i = 3;
    if (c[0] === 0 && c[1] === 0 && c[2] === 0) return [i, i, i];
    return c.map(v => Math.min(255, Math.floor((v > 0 && v < i ? i : v) / 0.7), Math.round(v + (255 - v) * 0.55)));
  }
  const darker = (c) => c.map(v => Math.max(0, Math.floor(v * 0.7)));
  /** Palette RGB des 21 indices (et blanc au-delà) pour ces couleurs. */
  function palette(colors) {
    const base = {}; for (const g of GROUPS) base[g.id] = rgb(colors && colors[g.id]) || rgb(DEFAULT_COLORS[g.id]);
    base.outline = [0, 0, 0];
    return SHADES.map(([g, k]) => {
      let c = base[g];
      if (g === 'outline') return c;
      if (k < 0) return brighter(c);
      for (let n = 0; n < k; n++) c = darker(c);
      return c;
    });
  }
  /** Couleur finale d'un pixel indexé (r, a) ; null si transparent. */
  function shade(pal, r, a) {
    if (!a) return null;
    const i = Math.floor(r / 10);
    return pal[i] || [255, 255, 255];
  }

  // ------------------------------------------------------------- recette
  const EMPTY_OFFSETS = () => ({ hair: [0, 0], face: [0, 0], armor: [0, 0] });
  const clampOff = (v) => Math.max(-48, Math.min(48, Math.round(Number(v) || 0)));
  /** Recette complète et valide (pièces inconnues retirées si parts est donné). */
  function normalize(r, parts) {
    r = r && typeof r === 'object' ? r : {};
    const ok = (list, id) => (typeof id === 'string' && (!parts || !id || (list || []).some(p => p.id === id)) ? id : '');
    const out = { hair: ok(parts && parts.hair, r.hair), face: ok(parts && parts.face, r.face), armor: ok(parts && parts.armor, r.armor),
      token: ok(parts && parts.token, r.token), colors: {}, offsets: EMPTY_OFFSETS() };
    for (const g of GROUPS) out.colors[g.id] = rgb(r.colors && r.colors[g.id]) ? hex(rgb(r.colors[g.id])) : DEFAULT_COLORS[g.id];
    for (const k of Object.keys(out.offsets)) { const o = r.offsets && r.offsets[k]; if (Array.isArray(o)) out.offsets[k] = [clampOff(o[0]), clampOff(o[1])]; }
    return out;
  }
  function validate(r, parts) {
    const errors = [];
    if (!r || typeof r !== 'object') return ['Recette de personnage invalide.'];
    if (!r.face && !r.hair && !r.armor) errors.push('Choisis au moins un visage, des cheveux ou une tenue.');
    if (parts) for (const k of ['hair', 'face', 'armor', 'token']) if (r[k] && !(parts[k] || []).some(p => p.id === r[k])) errors.push(`Pièce inconnue (${k} : ${r[k]}).`);
    for (const g of GROUPS) if (r.colors && r.colors[g.id] !== undefined && !rgb(r.colors[g.id])) errors.push(`Couleur invalide (${g.label}).`);
    return errors;
  }
  /** Recette au hasard (rng : () => [0, 1)) ; garde les champs de keep. */
  function random(parts, rng = Math.random, keep = {}) {
    const pick = (list) => (list && list.length ? list[Math.floor(rng() * list.length)].id : '');
    const sw = (g) => SWATCHES[g][Math.floor(rng() * SWATCHES[g].length)];
    const r = { hair: pick((parts.hair || []).filter(p => p.front)), face: pick(parts.face), armor: pick(parts.armor), token: pick(parts.token),
      colors: {}, offsets: EMPTY_OFFSETS() };
    for (const g of GROUPS) r.colors[g.id] = sw(g.id);
    return Object.assign(r, keep);
  }
  /** Recette par défaut : pièces de ce nom si elles existent (ex. « Eliwood »), sinon les premières. */
  function defaults(parts, name) {
    const find = (list, filter) => { const l = (list || []).filter(filter || (() => true)); return (l.find(p => p.id.toLowerCase() === String(name || '').toLowerCase()) || l[0] || {}).id || ''; };
    return normalize({ hair: find(parts.hair, p => p.front), face: find(parts.face), armor: find(parts.armor), token: (parts.token || []).some(p => p.id.toLowerCase() === String(name || '').toLowerCase()) ? find(parts.token) : (find(parts.token, p => /^lord$/i.test(p.id)) || find(parts.token)) }, parts);
  }

  // ------------------------------------------------------------- composition (tableaux RGBA)
  /**
   * Portrait 96 × 96 (RGBA) : layers = { hairb, armor, face, hair } → données RGBA 96 × 96 (ou null), recolorées.
   * Le pixel (x, y) d'une pièce décalée de [dx, dy] vient de (x − dx, y − dy).
   */
  function composePortrait(layers, recipe) {
    const pal = palette(recipe.colors), out = new Uint8ClampedArray(SIZE * SIZE * 4);
    for (const name of LAYERS) {
      const src = layers[name]; if (!src) continue;
      const [dx, dy] = recipe.offsets[name === 'hairb' ? 'hair' : name] || [0, 0];
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        const sx = x - dx, sy = y - dy;
        if (sx < 0 || sy < 0 || sx >= SIZE || sy >= SIZE) continue;
        const i = (sy * SIZE + sx) * 4;
        const c = shade(pal, src[i], src[i + 3]); if (!c) continue;
        const o = (y * SIZE + x) * 4;
        out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
      }
    }
    return out;
  }
  /** Figurine 64 × 64 recolorée (RGBA). */
  function composeToken(src, recipe) {
    const pal = palette(recipe.colors), out = new Uint8ClampedArray(TOKEN * TOKEN * 4);
    if (!src) return out;
    for (let i = 0; i < out.length; i += 4) {
      const c = shade(pal, src[i], src[i + 3]); if (!c) continue;
      out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255;
    }
    return out;
  }
  function bbox(data, w, h) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  }
  const FACESET = { w: 128, h: 112, top: 16, key: [1, 2, 3] }; // portrait = lignes 16 à 95 du 96 × 96 ; key : couleur de fond (transparente en jeu)
  /**
   * Face set 128 × 112 (format des portraits du jeu, faces.js) à partir du portrait 96 × 96.
   * face : données du visage seul (pour centrer le mini-portrait), facultatif.
   * Les cases yeux / bouche reprennent le portrait lui-même (pas d'animation, mais compatible).
   */
  function faceset(portrait, faceLayer) {
    const { w, h, top, key } = FACESET, out = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < out.length; i += 4) { out[i] = key[0]; out[i + 1] = key[1]; out[i + 2] = key[2]; out[i + 3] = 255; }
    const put = (sx, sy, dx, dy, cw, ch) => {
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const px = sx + x, py = sy + y;
        if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) continue;
        const i = (py * SIZE + px) * 4; if (!portrait[i + 3]) continue;
        const o = ((dy + y) * w + dx + x) * 4;
        out[o] = portrait[i]; out[o + 1] = portrait[i + 1]; out[o + 2] = portrait[i + 2]; out[o + 3] = 255;
      }
    };
    put(0, top, 0, 0, 96, 80);
    // mini-portrait : 32 × 32 autour du visage (ou du haut du portrait)
    const b = (faceLayer && bbox(faceLayer, SIZE, SIZE)) || bbox(portrait, SIZE, SIZE) || { x0: 32, y0: 24, x1: 64, y1: 56 };
    const cx = Math.round((b.x0 + b.x1) / 2), cy = Math.round(b.y0 + Math.min(32, b.y1 - b.y0) / 2 + 4);
    const mx = Math.max(0, Math.min(SIZE - 32, cx - 16)), my = Math.max(0, Math.min(SIZE - 32, cy - 16));
    put(mx, my, 96, 16, 32, 32);
    // cases yeux (96,48) (96,64) et bouches : une zone du portrait (repérée telle quelle par faces.js)
    const ex = Math.max(0, Math.min(64, cx - 16)), ey = Math.max(top, Math.min(SIZE - 16, cy - 8));
    for (const [dx, dy] of [[96, 48], [96, 64]]) put(ex, ey, dx, dy, 32, 16);
    for (const [dx, dy] of [[0, 80], [32, 80], [64, 80], [96, 80], [0, 96], [32, 96], [64, 96]]) put(ex, Math.min(SIZE - 16, ey + 12), dx, dy, 32, 16);
    return { data: out, width: w, height: h };
  }

  /**
   * Sprite de map à partir d'une figurine 64 × 64 (une seule pose) : planche 4 × 6 cases (idle, gauche, droite,
   * bas, haut, sélection) et son .json (base 32 : dessinée pour des cases de 32 px).
   */
  function mapSprite(token, opts = {}) {
    const F = TOKEN, b = bbox(token, F, F) || { x0: 24, y0: 16, x1: 40, y1: 48 };
    // pieds : centre des pixels de la ligne la plus basse ; recentrés dans la case (le miroir garde l'ancrage)
    let fx = 0, n = 0;
    for (let y = b.y1; y >= Math.max(b.y0, b.y1 - 3); y--) for (let x = b.x0; x <= b.x1; x++) if (token[(y * F + x) * 4 + 3]) { fx += x; n++; }
    fx = n ? Math.round(fx / n) : 32;
    const shift = F / 2 - fx, ground = Math.min(F - 1, b.y1 + 1), waist = Math.round(b.y0 + (b.y1 - b.y0) * 0.55);
    const get = (src, x, y) => (x < 0 || y < 0 || x >= F || y >= F ? null : (y * F + x) * 4);
    const make = (fn) => { const o = new Uint8ClampedArray(F * F * 4); for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) { const s = fn(x, y); if (s === null) continue; const d = (y * F + x) * 4; o[d] = s[0]; o[d + 1] = s[1]; o[d + 2] = s[2]; o[d + 3] = s[3]; } return o; };
    const px = (src, x, y) => { const i = get(src, x, y); return i === null || !src[i + 3] ? null : [src[i], src[i + 1], src[i + 2], src[i + 3]]; };
    const pose = make((x, y) => px(token, x - shift, y));
    const mirror = make((x, y) => px(pose, F - 1 - x + 1, y));
    const breathe = (s) => make((x, y) => (y <= waist ? (y === 0 ? null : px(s, x, y - 1)) : px(s, x, y)));
    const hop = (s) => make((x, y) => (y < b.y1 - 1 ? px(s, x, y + 1) : px(s, x, y)));
    const rows = [[pose, breathe(pose), pose, breathe(pose)], [pose, hop(pose), pose, hop(pose)], [mirror, hop(mirror), mirror, hop(mirror)],
      [pose, hop(pose), pose, hop(pose)], [pose, hop(pose), pose, hop(pose)], [pose, breathe(pose), hop(pose), breathe(pose)]];
    const W = F * 4, H = F * 6, sheet = new Uint8ClampedArray(W * H * 4);
    rows.forEach((line, r) => line.forEach((fr, c) => {
      for (let y = 0; y < F; y++) sheet.set(fr.subarray(y * F * 4, (y + 1) * F * 4), ((r * F + y) * W + c * F) * 4);
    }));
    const walk = { frames: [0, 1, 2, 3], durations: [110, 110, 110, 110] };
    const anims = { idle: { row: 0, frames: [0, 1, 2, 1], durations: [500, 160, 500, 160] } };
    ['left', 'right', 'down', 'up'].forEach((k, i) => { anims[k] = Object.assign({ row: i + 1 }, walk); });
    anims.focus = { row: 5, frames: [0, 1, 2, 1], durations: [160, 100, 160, 100] };
    const meta = { type: 'mapsprite', name: opts.name || 'Personnage généré', frame: [F, F], anchor: [F / 2, ground], base: 32, anims,
      source: 'Générateur de personnage (pièces : FE Character Creator, TheFlyingMinotaur)' };
    if (opts.teamColors) meta.teamColors = opts.teamColors;
    return { data: sheet, width: W, height: H, meta };
  }
  /** Couleurs d'équipe du sprite : les nuances du tissu (recolorées en bleu / rouge / vert selon le camp). */
  function teamColors(recipe) {
    const pal = palette(recipe.colors);
    return [pal[15], pal[16], pal[17]].map(hex);
  }

  // ------------------------------------------------------------- protagoniste créé par le joueur
  /**
   * Réglage du projet (meta.avatar) : { enabled, unitId, rename }. Personnage par défaut : le héros du camp,
   * sinon le premier personnage principal, sinon la première unité.
   */
  function avatarConfig(meta, db) {
    const a = Object.assign({ enabled: false, unitId: '', rename: true }, (meta && meta.avatar) || {});
    const units = (db && db.units) || [];
    const has = (id) => units.some(u => u.id === id);
    if (!has(a.unitId)) {
      const hero = meta && meta.lobby && meta.lobby.heroId;
      a.unitId = has(hero) ? hero : ((units.find(u => u.protagonist) || units[0] || {}).id || '');
    }
    a.enabled = !!a.enabled && !!a.unitId; a.rename = a.rename !== false;
    return a;
  }
  /** Remplace le nom d'origine par le nom choisi (mots entiers) et {héros} / {hero} par le nom du protagoniste. */
  function renameText(text, from, to) {
    let s = String(text || '').replace(/\{(héros|heros|hero)\}/gi, to || from || '');
    if (from && to && from !== to) s = s.replace(new RegExp('(^|[^\\p{L}\\p{N}_])' + from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{N}_])', 'gu'), (m, pre) => pre + to);
    return s;
  }
  /** Validation de la création du joueur sauvegardée dans la campagne : { unitId, name, recipe }. */
  function validateAvatar(a, parts) {
    if (a === undefined || a === null) return [];
    if (typeof a !== 'object' || typeof a.unitId !== 'string' || !a.unitId) return ['Protagoniste créé invalide.'];
    const errors = [];
    if (a.name !== undefined && (typeof a.name !== 'string' || a.name.length > 20)) errors.push('Nom du protagoniste invalide (20 caractères au plus).');
    return errors.concat(validate(a.recipe, parts));
  }

  return { avatarConfig, renameText, validateAvatar, SIZE, TOKEN, LAYERS, GROUPS, DEFAULT_COLORS, SWATCHES, SHADES, FACESET, rgb, hex, brighter, darker, palette, shade,
    normalize, validate, random, defaults, composePortrait, composeToken, bbox, faceset, mapSprite, teamColors };
});
