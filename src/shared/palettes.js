/*
 * Couleurs d'équipe des sprites.
 *
 * Chaque planche (sprite de map ou animation de combat) est enregistrée UNE fois, dans ses
 * couleurs d'origine. Les variantes d'équipe sont calculées à la volée :
 *
 *   original  couleurs de la planche, telles quelles
 *   blue      unités du joueur
 *   red       ennemis
 *   green     alliés (unités vertes)
 *   gray      unité qui a déjà joué ce tour
 *   custom:#rrggbb,#rrggbb,…   dégradé choisi (générateur de personnage) : les couleurs d'équipe de la planche,
 *             de la plus claire à la plus foncée, prennent les couleurs du dégradé dans le même ordre
 *
 * Seules les « couleurs d'équipe » de la planche (tenue, armure…) changent de teinte ; la peau,
 * les cheveux, les armes gardent leurs couleurs. La liste est enregistrée dans le .json de la
 * ressource (« teamColors », couleurs « #rrggbb ») ; sans liste, elle est détectée automatiquement :
 * la famille de teintes saturées la plus présente, hors tons chair / bruns / blonds.
 *
 * Réglage « colors » d'une unité, d'une classe ou d'un placement :
 *   'team'      couleur d'équipe partout
 *   'original'  couleur d'origine partout
 *   'map'       couleur d'équipe sur la map, couleur d'origine en combat (comme les Fire Emblem GBA)
 *   ''          hériter (placement / unité → classe → réglage du projet)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Palettes = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LIST = ['original', 'blue', 'red', 'green', 'gray'];
  const LABELS = { original: "Couleur d'origine", blue: 'Bleu (joueur)', red: 'Rouge (ennemi)', green: 'Vert (allié)', gray: 'Gris (a joué)' };
  const TARGET_HUE = { blue: 222, red: 2, green: 118 };
  // anciens noms (planches à 4 palettes précalculées)
  const ALIAS = { ally: 'blue', enemy: 'red', neutral: 'green' };
  const MODES = [
    { value: 'map', label: "Équipe sur la map, origine en combat" },
    { value: 'team', label: "Couleur d'équipe partout" },
    { value: 'original', label: "Couleur d'origine partout" }
  ];
  const DEFAULT_MODE = 'map';

  const CUSTOM = /^custom:#[0-9a-f]{6}(,#[0-9a-f]{6}){1,7}$/i;
  const norm = (p) => ALIAS[p] || (LIST.includes(p) || CUSTOM.test(p) ? p : 'original');
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  const parseHex = (s) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(s || '').trim());
    return m ? parseInt(m[1], 16) : null;
  };

  function toHsv(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, mx ? d / mx : 0, mx / 255];
  }
  function fromHsv(h, s, v) {
    h = ((h % 360) + 360) % 360;
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }
  const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

  /** Couleurs opaques d'une image RGBA : Map(0xRRGGBB → nombre de pixels). */
  function countColors(data) {
    const out = new Map();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const k = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      out.set(k, (out.get(k) || 0) + 1);
    }
    return out;
  }

  /** Couleurs triées par présence : [{ hex, count, h, s, v }]. */
  function describe(counts) {
    return [...counts].sort((a, b) => b[1] - a[1]).map(([k, n]) => {
      const [h, s, v] = toHsv(k >> 16, (k >> 8) & 255, k & 255);
      return { hex: hex(k), count: n, h, s, v };
    });
  }

  /** Détection automatique des couleurs d'équipe : liste de « #rrggbb ». */
  function detect(counts) {
    const bins = new Array(36).fill(0);
    const cand = [];
    for (const [k, n] of counts) {
      const r = k >> 16, g = (k >> 8) & 255, b = k & 255;
      const [h, s, v] = toHsv(r, g, b);
      if (s < 0.25 || v < 0.18 || Math.max(r, g, b) - Math.min(r, g, b) < 28) continue;
      if (h >= 12 && h <= 60) continue; // peau, cheveux bruns / blonds, bois, or
      cand.push({ k, h });
      bins[Math.floor(h / 10) % 36] += n * s;
    }
    if (!cand.length) return [];
    let best = 0, bestScore = -1;
    for (let i = 0; i < 36; i++) {
      const sc = bins[(i + 35) % 36] + bins[i] + bins[(i + 1) % 36];
      if (sc > bestScore) { bestScore = sc; best = i; }
    }
    const center = best * 10 + 5;
    return cand.filter(c => hueDist(c.h, center) <= 45).map(c => hex(c.k)).sort();
  }

  /** Couleurs d'équipe d'une ressource : celles du .json si présentes, sinon détectées. */
  function teamColorsOf(meta, counts) {
    if (meta && Array.isArray(meta.teamColors)) return meta.teamColors.filter(c => parseHex(c) !== null);
    return counts ? detect(counts) : [];
  }

  /** Teinte moyenne (pondérée par la saturation) d'une liste de couleurs. */
  function centerHue(list) {
    let x = 0, y = 0;
    for (const k of list) {
      const [h, s] = toHsv(k >> 16, (k >> 8) & 255, k & 255);
      const w = Math.max(0.05, s);
      x += Math.cos(h * Math.PI / 180) * w; y += Math.sin(h * Math.PI / 180) * w;
    }
    const h = Math.atan2(y, x) * 180 / Math.PI;
    return (h + 360) % 360;
  }

  /**
   * Table de recoloration pour une palette : Map(0xRRGGBB source → [r, g, b]).
   * Pour « gray », toute couleur est concernée (la table est construite à partir de counts).
   */
  function table(palette, teamColors, counts) {
    palette = norm(palette);
    const out = new Map();
    if (palette === 'original') return out;
    if (palette === 'gray') {
      for (const k of counts.keys()) {
        const r = k >> 16, g = (k >> 8) & 255, b = k & 255;
        const l = Math.round(Math.min(255, (0.3 * r + 0.59 * g + 0.11 * b) * 0.92 + 14));
        out.set(k, [l, l, l]);
      }
      return out;
    }
    const keys = (teamColors || []).map(parseHex).filter(k => k !== null);
    if (!keys.length) return out;
    if (palette.startsWith('custom:')) {
      const lum = (k) => 0.3 * (k >> 16) + 0.59 * ((k >> 8) & 255) + 0.11 * (k & 255);
      const ramp = palette.slice(7).split(',').map(parseHex);
      const sorted = [...new Set(keys)].sort((a, b) => lum(b) - lum(a));
      const ch = (c) => [c >> 16, (c >> 8) & 255, c & 255];
      sorted.forEach((k, i) => { // position dans le dégradé, interpolée entre ses couleurs
        const t = sorted.length === 1 ? (ramp.length - 1) / 2 : i * (ramp.length - 1) / (sorted.length - 1);
        const a = ch(ramp[Math.floor(t)]), b = ch(ramp[Math.ceil(t)]), f = t - Math.floor(t);
        out.set(k, a.map((v, j) => Math.round(v + (b[j] - v) * f)));
      });
      return out;
    }
    const center = centerHue(keys);
    const target = TARGET_HUE[palette];
    const avgSat = keys.reduce((a, k) => a + toHsv(k >> 16, (k >> 8) & 255, k & 255)[1], 0) / keys.length;
    // la tenue est déjà de la bonne couleur : on ne touche à rien
    if (hueDist(center, target) <= 25 && avgSat >= 0.3) return out;
    for (const k of keys) {
      const [h, s, v] = toHsv(k >> 16, (k >> 8) & 255, k & 255);
      // couleurs ternes (gris, violet délavé) : on leur donne assez de saturation pour lire l'équipe
      const s2 = Math.min(1, Math.max(s, 0.42 + 0.2 * (1 - v)));
      out.set(k, fromHsv(h - center + target, s2, Math.max(v, 0.16)));
    }
    return out;
  }

  /** Recolore en place des pixels RGBA. */
  function apply(data, palette, teamColors, counts) {
    const t = table(palette, teamColors, counts || countColors(data));
    if (!t.size) return data;
    for (let i = 0; i < data.length; i += 4) {
      if (!data[i + 3]) continue;
      const c = t.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      if (c) { data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; }
    }
    return data;
  }

  /** Palette d'équipe d'une unité selon son camp ('player' | 'ally' | 'enemy'). */
  function teamPalette(team) { return team === 'enemy' ? 'red' : team === 'ally' ? 'green' : 'blue'; }

  /** Réglage effectif : le premier non vide de la liste, sinon le défaut du projet. */
  function resolveMode(...candidates) {
    for (const c of candidates) if (c && MODES.some(m => m.value === c)) return c;
    return DEFAULT_MODE;
  }

  /**
   * Palette à utiliser pour dessiner une unité.
   * where : 'map' | 'battle' ; mode : 'team' | 'original' | 'map' ; done : a déjà joué (map seulement).
   */
  function paletteFor(team, mode, where, done) {
    if (done && where === 'map') return 'gray';
    mode = resolveMode(mode);
    if (mode === 'original') return 'original';
    if (mode === 'map' && where === 'battle') return 'original';
    return teamPalette(team);
  }

  return { LIST, LABELS, MODES, DEFAULT_MODE, TARGET_HUE, norm, hex, parseHex, toHsv, fromHsv, countColors, describe, detect, teamColorsOf, table, apply, teamPalette, resolveMode, paletteFor };
});
