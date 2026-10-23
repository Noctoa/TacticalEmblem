/*
 * Icônes de compétences façon Fire Emblem Heroes (img/skills/skills-<n>.png, index dans img/skills/index.js).
 * Une compétence peut avoir une image (champ « image » : « feh:<planche>-<case> ») ; sinon son symbole (« icon »).
 *
 *   SkillIcons.element(skill, 24)      → élément HTML (image, ou le symbole en texte)
 *   SkillIcons.draw(ctx, id, x, y, 40) → dessine l'icône sur un canvas (true si l'image est chargée)
 *   SkillIcons.all()                   → [{ id, sheet, index }] de toutes les icônes
 * L'identifiant « ultimate » désigne l'icône d'ultime (img/ui/ultimate/icon.png, Base de données › Ultimes).
 */
(function (root) {
  'use strict';
  const META = root.SKILL_ICON_SHEETS || { cell: 76, offset: 2, cols: 13, size: 1024, sheets: {} };
  const ULT = 'img/ui/ultimate/icon.png';
  const parse = (id) => { if (id === 'ultimate') return { ultimate: true }; const m = /^feh:(\d+)-(\d+)$/.exec(String(id || '')); return m && META.sheets[m[1]] && META.sheets[m[1]].includes(+m[2]) ? { sheet: +m[1], index: +m[2] } : null; };
  const url = (sheet) => new URL(`img/skills/skills-${sheet}.png`, document.baseURI).href;
  function style(id, size) {
    const p = parse(id); if (!p) return null;
    if (p.ultimate) return { backgroundImage: `url("${new URL(ULT, document.baseURI).href}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', width: size + 'px', height: size + 'px' };
    const k = size / META.cell, r = Math.floor(p.index / META.cols), c = p.index % META.cols;
    return { backgroundImage: `url("${url(p.sheet)}")`, backgroundSize: `${META.size * k}px ${META.size * k}px`,
      backgroundPosition: `${-(META.offset + c * META.cell) * k}px ${-(META.offset + r * META.cell) * k}px`, width: size + 'px', height: size + 'px' };
  }
  /** Élément d'icône d'une compétence (ou d'un identifiant d'image seul). */
  function element(skill, size, cls) {
    const id = typeof skill === 'string' ? skill : skill && skill.image;
    const st = style(id, size || 24);
    const el = document.createElement('span');
    el.className = 'skill-icon' + (st ? ' img' : '') + (cls ? ' ' + cls : '');
    if (st) { Object.assign(el.style, st); el.style.display = 'inline-block'; el.style.flex = 'none'; el.style.verticalAlign = 'middle'; }
    else el.textContent = (skill && skill.icon) || '✦';
    return el;
  }
  const imgs = {};
  function draw(ctx, id, x, y, size) {
    const p = parse(id); if (!p) return false;
    if (p.ultimate) {
      if (!imgs.ult) { imgs.ult = new Image(); imgs.ult.src = new URL(ULT, document.baseURI).href; }
      const im = imgs.ult; if (!im.complete || !im.naturalWidth) return false;
      const k = size / Math.max(im.naturalWidth, im.naturalHeight), sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = true;
      ctx.drawImage(im, x + (size - im.naturalWidth * k) / 2, y + (size - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k);
      ctx.imageSmoothingEnabled = sm; return true;
    }
    if (!imgs[p.sheet]) { imgs[p.sheet] = new Image(); imgs[p.sheet].src = url(p.sheet); }
    const im = imgs[p.sheet]; if (!im.complete || !im.naturalWidth) return false;
    const r = Math.floor(p.index / META.cols), c = p.index % META.cols;
    const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = true;
    ctx.drawImage(im, META.offset + c * META.cell, META.offset + r * META.cell, META.cell, META.cell, x, y, size, size);
    ctx.imageSmoothingEnabled = sm;
    return true;
  }
  const all = () => Object.entries(META.sheets).flatMap(([s, list]) => list.map(i => ({ id: `feh:${s}-${i}`, sheet: +s, index: i })));
  const sheets = () => Object.keys(META.sheets).map(Number);
  /** Précharge les planches utilisées par ces compétences. */
  function preload(skills) { for (const s of skills || []) { const p = parse(s && s.image); if (p && !p.ultimate && !imgs[p.sheet]) { imgs[p.sheet] = new Image(); imgs[p.sheet].src = url(p.sheet); } } }
  root.SkillIcons = { parse, element, draw, all, sheets, preload, META };
})(self);
