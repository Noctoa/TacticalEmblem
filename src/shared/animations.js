/*
 * Animations d'attaque (Base de données › Animations), façon RPG Maker.
 *
 * Une animation est une suite d'images (frames) ; chaque image pose des cellules, c.-à-d. des morceaux
 * d'une planche du dossier ressources/animations, avec position, taille, rotation, opacité et mode de fusion :
 *
 *   { id, name, kind: 'normal' | 'projectile',
 *     on: 'target' | 'user',             animation normale : jouée sur la cible ou sur l'attaquant
 *     position: 'center' | 'feet' | 'head' | 'screen',
 *     speed: 50,                         durée d'une image (ms)
 *     hitFrame: 3,                       image (1…n) où les dégâts tombent ; 0 = à la fin
 *     travel: 300, arc: 0, rotate: true, projectile : durée du trajet (ms), hauteur de la courbe, orienté selon le trajet
 *     next: 'anim_…',                    animation enchaînée (à l'arrivée d'un projectile, sinon à la fin)
 *     frames: [{ cells: [cell…], se: 'ressources/sons/…', flash: { scope, color, strength, duration }, shake }] }
 *
 *   cell = { image: 'ressources/animations/…png', rect: [x, y, w, h], x, y, scale: 100, rotation: 0, opacity: 100,
 *            blend: 'normal' | 'add', mirror: false }
 *
 * Unités : 48 = une case de la map (≈ un personnage de large). Origine : le point choisi (centre, pieds, tête
 * de l'unité, ou centre de l'écran). Les animations sont dessinées avec l'attaquant à gauche ; elles sont
 * retournées automatiquement quand il est à droite. Un projectile est dessiné pointant vers la droite.
 *
 * Quelle attaque joue quelle animation : arme (champ « animation », vide = celle du type d'arme, 'none' = aucune ;
 * « critAnimation » pour les critiques), compétence qui se déclenche (champ « animation »), et l'animation par
 * défaut de chaque type d'arme (meta.animationDefaults, réglée dans l'onglet Animations).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Animations = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const KINDS = [{ value: 'normal', label: 'Normale (sur une unité)' }, { value: 'projectile', label: 'Projectile (de l’attaquant à la cible)' }];
  const TARGETS = [{ value: 'target', label: 'La cible' }, { value: 'user', label: 'L’attaquant' }];
  const POSITIONS = [{ value: 'center', label: 'Centre' }, { value: 'feet', label: 'Pieds' }, { value: 'head', label: 'Tête' }, { value: 'screen', label: 'Écran' }];
  const BLENDS = [{ value: 'normal', label: 'Normal' }, { value: 'add', label: 'Addition (lumière)' }];
  const FLASH_SCOPES = [{ value: 'target', label: 'Cible' }, { value: 'screen', label: 'Écran' }];
  const MAX_FRAMES = 200, MAX_CELLS = 32, MAX_CHAIN = 6;
  const DIR = 'ressources/animations';
  const ID = /^[A-Za-z0-9_-]{1,64}$/;

  function create(kind) {
    const a = { name: 'Nouvelle animation', kind: kind === 'projectile' ? 'projectile' : 'normal', on: 'target', position: 'center', speed: 50, hitFrame: 1, next: '', frames: [{ cells: [] }] };
    if (a.kind === 'projectile') Object.assign(a, { travel: 300, arc: 0, rotate: true });
    return a;
  }
  function cell(image, rect, values) {
    return Object.assign({ image, rect: rect.slice(), x: 0, y: 0, scale: 100, rotation: 0, opacity: 100, blend: 'normal', mirror: false }, values || {});
  }

  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  /** Durée totale d'une animation seule (ms), trajet du projectile compris. */
  function duration(a) {
    if (!a) return 0;
    const frames = (a.frames || []).length * num(a.speed, 50);
    return a.kind === 'projectile' ? Math.max(num(a.travel, 300), 1) : frames;
  }
  /** Image affichée à l'instant t (ms) ; un projectile boucle sur ses images pendant le trajet. */
  function frameIndex(a, t) {
    const n = (a.frames || []).length; if (!n) return -1;
    const i = Math.floor(Math.max(0, t) / Math.max(1, num(a.speed, 50)));
    return a.kind === 'projectile' ? i % n : Math.min(n - 1, i);
  }
  /** Animations enchaînées à partir de id (next), sans boucle. */
  function chain(list, id) {
    const out = [], seen = new Set();
    let cur = byId(list, id);
    while (cur && !seen.has(cur.id) && out.length < MAX_CHAIN) { out.push(cur); seen.add(cur.id); cur = cur.next ? byId(list, cur.next) : null; }
    return out;
  }
  const byId = (list, id) => (Array.isArray(list) ? list : []).find(a => a && a.id === id) || null;

  /**
   * Animation d'une attaque : compétence déclenchée (avec animation) > critique de l'arme > arme > type d'arme.
   * Renvoie l'id ou '' (aucune).
   */
  function forAttack(db, meta, weapon, opts = {}) {
    const list = (db && db.animations) || [];
    const ok = (id) => !!id && id !== 'none' && !!byId(list, id);
    for (const s of opts.skills || []) {
      const sk = s && s.animation !== undefined ? s : byId((db && db.skills) || [], s && s.id);
      if (sk && ok(sk.animation)) return sk.animation;
    }
    if (!weapon) return '';
    if (opts.crit && ok(weapon.critAnimation)) return weapon.critAnimation;
    if (weapon.animation === 'none') return '';
    if (ok(weapon.animation)) return weapon.animation;
    const def = ((meta && meta.animationDefaults) || {})[weapon.type];
    return ok(def) ? def : '';
  }

  /**
   * Interpolation (comme l'outil « Interpolation » de RPG Maker) : les images entre from et to (indices 0…n-1)
   * reçoivent les cellules de « from », placées entre leurs positions de « from » et de « to » (cellule i ↔ cellule i).
   */
  function interpolate(a, from, to) {
    const F = a.frames || [];
    if (!(from >= 0 && to > from + 1 && to < F.length)) return false;
    const A = F[from].cells || [], B = F[to].cells || [];
    for (let f = from + 1; f < to; f++) {
      const k = (f - from) / (to - from);
      F[f].cells = A.map((c, i) => {
        const d = B[i] || c, o = JSON.parse(JSON.stringify(c));
        for (const key of ['x', 'y', 'scale', 'rotation', 'opacity']) o[key] = Math.round(num(c[key], 0) + (num(d[key], 0) - num(c[key], 0)) * k);
        return o;
      });
    }
    return true;
  }

  // ----------------------------------------------------------------------------------------------
  // Validation
  // ----------------------------------------------------------------------------------------------
  function validate(a, list) {
    const errors = [], who = a && a.name ? `Animation « ${a.name} »` : 'Animation';
    if (!a || typeof a !== 'object' || Array.isArray(a)) return ['Une animation doit être une fiche.'];
    if (typeof a.id !== 'string' || !ID.test(a.id)) errors.push(`${who} : identifiant invalide.`);
    if (typeof a.name !== 'string' || !a.name.trim()) errors.push(`${who} : nom manquant.`);
    if (!KINDS.some(k => k.value === a.kind)) errors.push(`${who} : type inconnu.`);
    if (a.on !== undefined && !TARGETS.some(k => k.value === a.on)) errors.push(`${who} : cible inconnue.`);
    if (a.position !== undefined && !POSITIONS.some(k => k.value === a.position)) errors.push(`${who} : position inconnue.`);
    const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
    if (!int(a.speed, 16, 1000)) errors.push(`${who} : durée d'une image entre 16 et 1000 ms.`);
    if (!Array.isArray(a.frames) || !a.frames.length || a.frames.length > MAX_FRAMES) errors.push(`${who} : 1 à ${MAX_FRAMES} images.`);
    else {
      if (a.hitFrame !== undefined && !int(a.hitFrame, 0, a.frames.length)) errors.push(`${who} : image de l'impact entre 0 et ${a.frames.length}.`);
      a.frames.forEach((f, i) => {
        const at = `${who}, image ${i + 1}`;
        if (!f || typeof f !== 'object' || !Array.isArray(f.cells)) { errors.push(`${at} : cellules manquantes.`); return; }
        if (f.cells.length > MAX_CELLS) errors.push(`${at} : ${MAX_CELLS} cellules au plus.`);
        for (const c of f.cells) {
          if (!c || typeof c.image !== 'string' || !c.image.startsWith('ressources/') || c.image.includes('..')) { errors.push(`${at} : image de cellule invalide.`); continue; }
          if (!Array.isArray(c.rect) || c.rect.length !== 4 || !c.rect.every((v, k) => Number.isInteger(v) && v >= (k < 2 ? 0 : 1) && v <= 8192)) errors.push(`${at} : découpe de cellule invalide.`);
          for (const [k, lo, hi] of [['x', -4000, 4000], ['y', -4000, 4000], ['scale', 1, 1000], ['rotation', -3600, 3600], ['opacity', 0, 100]]) {
            if (c[k] !== undefined && !(typeof c[k] === 'number' && isFinite(c[k]) && c[k] >= lo && c[k] <= hi)) errors.push(`${at} : ${k} hors limites.`);
          }
          if (c.blend !== undefined && !BLENDS.some(b => b.value === c.blend)) errors.push(`${at} : mode de fusion inconnu.`);
        }
        if (f.se !== undefined && f.se !== '' && (typeof f.se !== 'string' || !f.se.startsWith('ressources/'))) errors.push(`${at} : son invalide.`);
        if (f.flash !== undefined && f.flash !== null) {
          const fl = f.flash;
          if (!FLASH_SCOPES.some(s => s.value === fl.scope) || !/^#[0-9a-fA-F]{6}$/.test(String(fl.color)) || !int(fl.strength, 0, 100) || !int(fl.duration, 1, 60)) errors.push(`${at} : flash invalide.`);
        }
        if (f.shake !== undefined && !int(f.shake, 0, 30)) errors.push(`${at} : tremblement entre 0 et 30.`);
      });
    }
    if (a.kind === 'projectile') {
      if (!int(a.travel, 30, 5000)) errors.push(`${who} : durée du trajet entre 30 et 5000 ms.`);
      if (a.arc !== undefined && !int(a.arc, -500, 500)) errors.push(`${who} : courbe entre -500 et 500.`);
    }
    if (a.next) {
      if (!byId(list, a.next)) errors.push(`${who} : animation enchaînée introuvable.`);
      else if (chain(list, a.id).length >= MAX_CHAIN || chainLoops(list, a.id)) errors.push(`${who} : enchaînement en boucle.`);
    }
    return errors;
  }
  function chainLoops(list, id) {
    const seen = new Set(); let cur = byId(list, id);
    while (cur) { if (seen.has(cur.id)) return true; seen.add(cur.id); cur = cur.next ? byId(list, cur.next) : null; }
    return false;
  }
  function validateAll(list) {
    if (list === undefined) return [];
    if (!Array.isArray(list)) return ['Les animations doivent être une liste.'];
    const ids = new Set(), errors = [];
    for (const a of list) {
      errors.push(...validate(a, list));
      if (a && ids.has(a.id)) errors.push(`Animation : identifiant en double (${a.id}).`);
      if (a) ids.add(a.id);
    }
    return errors;
  }
  /** Références des armes, compétences et types d'arme vers des animations existantes. */
  function validateLinks(db, meta) {
    const list = (db && db.animations) || [], errors = [];
    const ok = (id) => !id || id === 'none' || !!byId(list, id);
    for (const w of (db && db.weapons) || []) {
      if (!ok(w.animation)) errors.push(`Arme « ${w.name} » : animation introuvable.`);
      if (w.critAnimation && w.critAnimation !== 'none' && !byId(list, w.critAnimation)) errors.push(`Arme « ${w.name} » : animation des critiques introuvable.`);
    }
    for (const s of (db && db.skills) || []) if (s && s.animation && !byId(list, s.animation)) errors.push(`Compétence « ${s.name} » : animation introuvable.`);
    for (const [type, id] of Object.entries((meta && meta.animationDefaults) || {})) if (id && !byId(list, id)) errors.push(`Animation par défaut (${type}) introuvable.`);
    return errors;
  }
  /** Qui utilise cette animation : « Arme X », « Compétence Y », « Animation Z », « Type d'arme ». */
  function usersOf(db, meta, id) {
    const out = [];
    for (const w of (db && db.weapons) || []) if (w.animation === id || w.critAnimation === id) out.push('Arme « ' + w.name + ' »');
    for (const s of (db && db.skills) || []) if (s && s.animation === id) out.push('Compétence « ' + s.name + ' »');
    for (const a of (db && db.animations) || []) if (a.next === id && a.id !== id) out.push('Animation « ' + a.name + ' »');
    for (const [type, v] of Object.entries((meta && meta.animationDefaults) || {})) if (v === id) out.push('Type d’arme « ' + type + ' »');
    return out;
  }
  /** Retire les références à une animation supprimée. */
  function forget(db, meta, id) {
    for (const w of (db && db.weapons) || []) { if (w.animation === id) w.animation = ''; if (w.critAnimation === id) w.critAnimation = ''; }
    for (const s of (db && db.skills) || []) if (s && s.animation === id) s.animation = '';
    for (const a of (db && db.animations) || []) if (a.next === id) a.next = '';
    const d = meta && meta.animationDefaults;
    if (d) for (const k of Object.keys(d)) if (d[k] === id) d[k] = '';
  }
  /** Planches utilisées par ces animations (préchargement). */
  function images(list) {
    const out = new Set();
    for (const a of list || []) for (const f of (a && a.frames) || []) for (const c of f.cells || []) if (c && c.image) out.add(c.image);
    return [...out];
  }

  // ----------------------------------------------------------------------------------------------
  // Animations d'exemple (planches « Heroes » de ressources/animations/heroes)
  // ----------------------------------------------------------------------------------------------
  const H = DIR + '/heroes/Btl_Hit01.png', M = DIR + '/heroes/Blt_Mag01.png', ROD = DIR + '/heroes/Btl_Rod01.png';
  /**
   * Construit les images à partir de pistes : { image, rect, blend, keys: [[image, { x, y, scale, rotation, opacity }], …] } ;
   * entre deux clés, les valeurs sont interpolées ; la cellule n'existe qu'entre sa première et sa dernière clé.
   */
  function build(n, tracks, extra = {}) {
    const frames = Array.from({ length: n }, () => ({ cells: [] }));
    for (const t of tracks) {
      const keys = t.keys.slice().sort((a, b) => a[0] - b[0]);
      for (let f = keys[0][0]; f <= keys[keys.length - 1][0] && f < n; f++) {
        let i = 0; while (i < keys.length - 1 && keys[i + 1][0] < f) i++;
        const [f0, v0] = keys[i], [f1, v1] = keys[Math.min(i + 1, keys.length - 1)];
        const k = f1 === f0 ? 0 : (f - f0) / (f1 - f0);
        const val = (key, d) => { const a = num(v0[key], num(t[key], d)), b = num(v1[key], a); return Math.round(a + (b - a) * k); };
        frames[f].cells.push(cell(t.image, t.rect, { x: val('x', 0), y: val('y', 0), scale: val('scale', 100), rotation: val('rotation', 0), opacity: val('opacity', 100), blend: t.blend || 'normal' }));
      }
    }
    for (const [f, v] of Object.entries(extra)) Object.assign(frames[f], v);
    return frames;
  }
  const flash = (scope, color, strength, dur) => ({ flash: { scope, color, strength, duration: dur } });

  function samples() {
    const A = (id, name, values, frames) => Object.assign({ id, name, kind: 'normal', on: 'target', position: 'center', speed: 45, hitFrame: 3, next: '' }, values, { frames });
    return [
      A('anim_slash', 'Coup tranchant', { hitFrame: 3 }, build(10, [
        { image: H, rect: [4, 390, 119, 179], blend: 'add', keys: [[0, { x: -34, y: -14, scale: 45, rotation: -25, opacity: 0 }], [2, { x: 0, y: 0, scale: 80, rotation: 0, opacity: 100 }], [6, { x: 22, y: 6, scale: 95, rotation: 15, opacity: 0 }]] },
        { image: H, rect: [0, 774, 187, 182], blend: 'add', keys: [[2, { scale: 18, opacity: 100 }], [7, { scale: 70, opacity: 0 }]] },
        { image: H, rect: [775, 5, 49, 53], blend: 'add', keys: [[2, { scale: 70, rotation: 0 }], [6, { scale: 130, rotation: 90, opacity: 0 }]] }
      ], { 2: flash('target', '#ffffff', 80, 2) })),
      A('anim_pierce', 'Coup d’estoc', { hitFrame: 3 }, build(9, [
        { image: H, rect: [5, 0, 246, 60], blend: 'add', keys: [[0, { x: -110, scale: 35, opacity: 0 }], [2, { x: -12, scale: 70, opacity: 100 }], [6, { x: 40, scale: 85, opacity: 0 }]] },
        { image: H, rect: [265, 259, 109, 121], blend: 'add', keys: [[2, { x: 6, scale: 25, opacity: 100 }], [6, { x: 6, scale: 65, opacity: 0, rotation: 30 }]] }
      ], { 2: flash('target', '#ffffff', 80, 2) })),
      A('anim_smash', 'Coup lourd', { hitFrame: 2 }, build(10, [
        { image: H, rect: [0, 774, 187, 182], blend: 'add', keys: [[1, { scale: 25, opacity: 100 }], [7, { scale: 105, opacity: 0 }]] },
        { image: H, rect: [265, 259, 109, 121], blend: 'add', keys: [[1, { scale: 40, rotation: 0 }], [5, { scale: 85, rotation: 45, opacity: 0 }]] },
        { image: H, rect: [878, 97, 119, 119], blend: 'add', keys: [[2, { scale: 30, opacity: 90 }], [8, { scale: 130, opacity: 0 }]] }
      ], { 1: Object.assign(flash('screen', '#ffffff', 35, 3), { shake: 10 }) })),
      A('anim_arrow', 'Flèche', { kind: 'projectile', speed: 60, hitFrame: 0, travel: 260, arc: 6, rotate: true, next: 'anim_arrow_hit' }, build(2, [
        { image: H, rect: [52, 126, 156, 35], blend: 'add', keys: [[0, { x: -24, scale: 42 }], [1, { x: -26, scale: 46, opacity: 85 }]] }
      ])),
      A('anim_arrow_hit', 'Impact de flèche', { speed: 45, hitFrame: 1 }, build(6, [
        { image: H, rect: [775, 5, 49, 53], blend: 'add', keys: [[0, { scale: 45 }], [5, { scale: 100, opacity: 0, rotation: 45 }]] },
        { image: H, rect: [18, 269, 96, 95], blend: 'add', keys: [[0, { scale: 30, opacity: 90 }], [4, { scale: 60, opacity: 0 }]] }
      ], { 0: flash('target', '#ffffff', 70, 2) })),
      A('anim_fire', 'Feu', { kind: 'projectile', speed: 60, hitFrame: 0, travel: 380, arc: 26, rotate: false, next: 'anim_fire_hit' }, build(4, [
        { image: H, rect: [18, 269, 96, 95], blend: 'add', keys: [[0, { x: -18, scale: 45, opacity: 60 }], [3, { x: -18, scale: 50, opacity: 60 }]] },
        { image: M, rect: [6, 6, 83, 87], blend: 'normal', keys: [[0, { scale: 45, rotation: 0 }], [1, { scale: 50, rotation: 10 }], [2, { scale: 45, rotation: 0 }], [3, { scale: 50, rotation: -10 }]] }
      ])),
      A('anim_fire_hit', 'Explosion de feu', { position: 'feet', speed: 50, hitFrame: 2 }, build(12, [
        { image: M, rect: [104, 206, 278, 237], blend: 'normal', keys: [[0, { y: -30, scale: 20 }], [4, { y: -72, scale: 58 }], [11, { y: -84, scale: 66, opacity: 0 }]] },
        { image: H, rect: [18, 269, 96, 95], blend: 'add', keys: [[0, { y: -48, scale: 40 }], [5, { y: -48, scale: 140, opacity: 0 }]] }
      ], { 1: flash('screen', '#ff9040', 30, 3) })),
      A('anim_thunder', 'Éclair', { position: 'feet', speed: 50, hitFrame: 3 }, build(10, [
        { image: M, rect: [381, 4, 97, 243], blend: 'add', keys: [[1, { y: -125, scale: 75 }], [2, { y: -125, scale: 75, opacity: 30 }], [3, { y: -125, scale: 80, opacity: 100 }], [6, { y: -125, scale: 80, opacity: 0 }]] },
        { image: M, rect: [488, 3, 78, 237], blend: 'add', keys: [[2, { x: 22, y: -120, scale: 60 }], [5, { x: 22, y: -120, scale: 60, opacity: 0 }]] },
        { image: M, rect: [767, 149, 87, 103], blend: 'add', keys: [[3, { y: -40, scale: 55 }], [8, { y: -40, scale: 95, opacity: 0 }]] }
      ], { 1: flash('screen', '#ffffff', 50, 2), 3: Object.assign(flash('screen', '#fff4a0', 45, 3), { shake: 6 }) })),
      A('anim_flux', 'Flux', { position: 'feet', speed: 50, hitFrame: 6 }, build(14, [
        { image: M, rect: [6, 453, 83, 87], blend: 'normal', keys: [[0, { x: -26, y: -10, scale: 40, opacity: 0 }], [4, { x: -22, y: -40, scale: 65 }], [12, { x: -16, y: -90, scale: 55, opacity: 0 }]] },
        { image: M, rect: [6, 453, 83, 87], blend: 'normal', keys: [[1, { x: 26, y: -10, scale: 40, opacity: 0 }], [5, { x: 22, y: -44, scale: 65 }], [13, { x: 16, y: -95, scale: 55, opacity: 0 }]] },
        { image: M, rect: [10, 564, 81, 75], blend: 'normal', keys: [[2, { y: -30, scale: 50, opacity: 0 }], [6, { y: -50, scale: 110, opacity: 90 }], [13, { y: -70, scale: 125, opacity: 0 }]] }
      ], { 6: flash('screen', '#40104a', 40, 4) })),
      A('anim_heal', 'Soin', { position: 'feet', speed: 50, hitFrame: 8 }, build(16, [
        { image: ROD, rect: [388, 132, 119, 119], blend: 'add', keys: [[0, { y: -8, scale: 20 }], [10, { y: -8, scale: 115, opacity: 0 }]] },
        { image: ROD, rect: [397, 12, 102, 102], blend: 'add', keys: [[2, { y: -48, scale: 40, opacity: 0 }], [6, { y: -48, scale: 90, opacity: 80 }], [15, { y: -48, scale: 100, opacity: 0 }]] },
        { image: ROD, rect: [268, 5, 40, 54], blend: 'add', keys: [[4, { x: -20, y: -66, scale: 50, opacity: 0 }], [7, { x: -20, y: -76, scale: 80 }], [11, { x: -20, y: -100, scale: 40, opacity: 0 }]] },
        { image: ROD, rect: [332, 5, 40, 54], blend: 'add', keys: [[6, { x: 22, y: -48, scale: 50, opacity: 0 }], [9, { x: 22, y: -60, scale: 80 }], [13, { x: 22, y: -84, scale: 40, opacity: 0 }]] }
      ], { 8: flash('target', '#ffffff', 50, 3) })),
      A('anim_luna', 'Luna', { speed: 50, hitFrame: 5 }, build(12, [
        { image: H, rect: [0, 594, 116, 164], blend: 'add', keys: [[0, { x: -22, scale: 40, rotation: -30, opacity: 0 }], [4, { scale: 90, opacity: 100 }], [8, { x: 10, scale: 110, rotation: 20, opacity: 0 }]] },
        { image: M, rect: [4, 837, 119, 119], blend: 'add', keys: [[3, { scale: 30, opacity: 90 }], [9, { scale: 130, opacity: 0 }]] }
      ], { 4: flash('screen', '#6080ff', 35, 3) })),
      A('anim_sol', 'Sol', { speed: 50, hitFrame: 5 }, build(12, [
        { image: H, rect: [18, 269, 96, 95], blend: 'add', keys: [[0, { scale: 20 }], [8, { scale: 140, opacity: 0 }]] },
        { image: M, rect: [140, 716, 102, 102], blend: 'add', keys: [[2, { scale: 40, opacity: 90 }], [10, { scale: 120, opacity: 0 }]] }
      ], { 3: flash('screen', '#ffd060', 30, 3) }))
    ];
  }
  /** Animation par défaut de chaque type d'arme (projet d'exemple). */
  const SAMPLE_DEFAULTS = { sword: 'anim_slash', lance: 'anim_pierce', axe: 'anim_smash', bow: 'anim_arrow', anima: 'anim_fire', light: 'anim_thunder', dark: 'anim_flux', staff: 'anim_heal' };
  /** Animations des compétences de base qui se déclenchent. */
  const SAMPLE_SKILLS = { skill_luna: 'anim_luna', skill_sol: 'anim_sol' };

  return { KINDS, TARGETS, POSITIONS, BLENDS, FLASH_SCOPES, MAX_FRAMES, MAX_CELLS, DIR, create, cell, duration, frameIndex, chain, byId, forAttack,
    interpolate, validate, validateAll, validateLinks, usersOf, forget, images, samples, SAMPLE_DEFAULTS, SAMPLE_SKILLS, build };
});
