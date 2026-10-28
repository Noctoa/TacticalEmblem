/*
 * Icônes des armes et des objets : pixel art 16 × 16 (img/items/icons.png, index dans img/items/index.js, généré par
 * tools/build_item_icons.py). Une arme ou un objet peut avoir une image (champ « image » : « item:<id> ») ; sinon
 * l'arme garde l'icône de son type (img/ui/weapon-icons.png) et l'objet son symbole.
 *
 *   ItemIcons.style(id)                → styles CSS de l'icône (en %, s'adapte à la taille de l'élément) ou null
 *   ItemIcons.apply(el, id)            → pose l'icône sur un élément existant (true si l'id est connu)
 *   ItemIcons.element(id, 24, 'cls')   → élément HTML de l'icône (null si l'id est inconnu)
 *   ItemIcons.all() / groups()         → toutes les icônes [{ id, label, group, index }] / leurs groupes
 */
(function (root) {
  'use strict';
  const META = root.ITEM_ICONS || { cell: 16, cols: 16, list: [] };
  const SHEET = 'img/items/icons.png';
  const byId = new Map(META.list.map((e, index) => [e.id, Object.assign({ index }, e)]));
  const rows = () => Math.max(1, Math.ceil(META.list.length / META.cols));
  const url = () => new URL(SHEET, document.baseURI).href;
  const parse = (id) => { const m = /^item:([a-z0-9-]+)$/.exec(String(id || '')); return m && byId.has(m[1]) ? byId.get(m[1]) : null; };
  function style(id) {
    const p = parse(id); if (!p) return null;
    const r = Math.floor(p.index / META.cols), c = p.index % META.cols, R = rows();
    return { backgroundImage: `url("${url()}")`, backgroundRepeat: 'no-repeat', backgroundSize: `${META.cols * 100}% ${R * 100}%`,
      backgroundPosition: `${META.cols > 1 ? c / (META.cols - 1) * 100 : 0}% ${R > 1 ? r / (R - 1) * 100 : 0}%`, imageRendering: 'pixelated' };
  }
  function apply(el, id) { const st = style(id); if (!st) return false; Object.assign(el.style, st); el.textContent = ''; return true; }
  function element(id, size, cls) {
    const st = style(id); if (!st) return null;
    const el = document.createElement('span');
    el.className = 'item-icon' + (cls ? ' ' + cls : '');
    Object.assign(el.style, st, { display: 'inline-block', flex: 'none', verticalAlign: 'middle' });
    if (size) { el.style.width = size + 'px'; el.style.height = size + 'px'; }
    return el;
  }
  const all = () => META.list.map((e, index) => Object.assign({ index }, e, { id: 'item:' + e.id }));
  const groups = () => [...new Set(META.list.map(e => e.group))];
  root.ItemIcons = { parse, style, apply, element, all, groups, META };
})(self);
