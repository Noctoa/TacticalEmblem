/*
 * Icônes de compétences : pixel art 16 × 16 de la communauté Fire Emblem (img/skills/icons.png, index dans
 * img/skills/index.js, généré par tools/build_skill_icons.py). Une compétence peut avoir une image (champ « image » :
 * « icon:<id> ») ; sinon son symbole (« icon »). Les anciennes icônes façon Heroes (« feh:… ») n'existent plus.
 *
 *   SkillIcons.element(skill, 24)      → élément HTML (image, ou le symbole en texte)
 *   SkillIcons.draw(ctx, id, x, y, 40) → dessine l'icône sur un canvas (true si l'image est chargée)
 *   SkillIcons.all()                   → [{ id, label, group, credits, index }] de toutes les icônes
 *   SkillIcons.groups()                → groupes d'icônes (pour la fenêtre de choix)
 * L'identifiant « ultimate » désigne l'icône d'ultime (img/ui/ultimate/icon.png, Base de données › Ultimes).
 */
(function (root) {
  'use strict';
  const META = root.SKILL_ICONS || { cell: 16, cols: 16, list: [] };
  const ULT = 'img/ui/ultimate/icon.png', SHEET = 'img/skills/icons.png';
  const byId = new Map(META.list.map((e, index) => [e.id, Object.assign({ index }, e)]));
  const parse = (id) => {
    if (id === 'ultimate') return { ultimate: true };
    const m = /^icon:([a-z0-9-]+)$/.exec(String(id || ''));
    return m && byId.has(m[1]) ? byId.get(m[1]) : null;
  };
  const url = (rel) => new URL(rel, document.baseURI).href;
  const rows = () => Math.ceil(META.list.length / META.cols);
  function style(id, size) {
    const p = parse(id); if (!p) return null;
    if (p.ultimate) return { backgroundImage: `url("${url(ULT)}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', width: size + 'px', height: size + 'px' };
    const k = size / META.cell, r = Math.floor(p.index / META.cols), c = p.index % META.cols;
    return { backgroundImage: `url("${url(SHEET)}")`, backgroundSize: `${META.cols * META.cell * k}px ${rows() * META.cell * k}px`,
      backgroundPosition: `${-c * META.cell * k}px ${-r * META.cell * k}px`, imageRendering: 'pixelated', width: size + 'px', height: size + 'px' };
  }
  /** Élément d'icône d'une compétence (ou d'un identifiant d'image seul). */
  function element(skill, size, cls) {
    const id = typeof skill === 'string' ? skill : skill && skill.image;
    const st = style(id, size || 24);
    const el = document.createElement('span');
    el.className = 'skill-icon' + (st ? ' img' : '') + (cls ? ' ' + cls : '');
    if (st) { Object.assign(el.style, st); el.style.display = 'inline-block'; el.style.flex = 'none'; el.style.verticalAlign = 'middle'; }
    else el.textContent = (skill && typeof skill === 'object' && skill.icon) || '✦';
    return el;
  }
  const imgs = {};
  const img = (key, src) => { if (!imgs[key]) { imgs[key] = new Image(); imgs[key].src = url(src); } return imgs[key]; };
  function draw(ctx, id, x, y, size) {
    const p = parse(id); if (!p) return false;
    const sm = ctx.imageSmoothingEnabled;
    if (p.ultimate) {
      const im = img('ult', ULT); if (!im.complete || !im.naturalWidth) return false;
      const k = size / Math.max(im.naturalWidth, im.naturalHeight); ctx.imageSmoothingEnabled = true;
      ctx.drawImage(im, x + (size - im.naturalWidth * k) / 2, y + (size - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k);
      ctx.imageSmoothingEnabled = sm; return true;
    }
    const im = img('sheet', SHEET); if (!im.complete || !im.naturalWidth) return false;
    const r = Math.floor(p.index / META.cols), c = p.index % META.cols;
    ctx.imageSmoothingEnabled = false; // pixel art : agrandi sans flou
    ctx.drawImage(im, c * META.cell, r * META.cell, META.cell, META.cell, x, y, size, size);
    ctx.imageSmoothingEnabled = sm;
    return true;
  }
  const all = () => META.list.map((e, index) => Object.assign({ index }, e, { id: 'icon:' + e.id }));
  const groups = () => [...new Set(META.list.map(e => e.group))];
  /** Précharge la planche si ces compétences ont une icône. */
  function preload(skills) { if ((skills || []).some(s => { const p = parse(s && s.image); return p && !p.ultimate; })) img('sheet', SHEET); }
  root.SkillIcons = { parse, element, draw, all, groups, preload, META };
})(self);
