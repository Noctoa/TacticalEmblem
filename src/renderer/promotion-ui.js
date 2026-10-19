/* Vue partagée de l'arbre d'évolution, construite depuis le graphe de classes. */
(function (root) {
  'use strict';
  const { h } = UI;
  const ns = 'http://www.w3.org/2000/svg';
  function graph(db, options = {}) {
    const edges = (db.classes || []).flatMap(cls => Promotions.branches(cls, db).map((row, index) => ({ from: cls.id, to: row && row.classId, index, row })));
    const ids = new Set();
    if (options.rootId) {
      const pending = [options.rootId];
      while (pending.length) {
        const id = pending.pop(); if (ids.has(id)) continue; ids.add(id);
        for (const edge of edges) if (edge.from === id) pending.push(edge.to); else if (edge.to === id) pending.push(edge.from);
      }
    } else for (const cls of db.classes || []) ids.add(cls.id);
    const classes = (db.classes || []).filter(cls => ids.has(cls.id));
    const links = edges.filter(e => classes.some(c => c.id === e.from) && classes.some(c => c.id === e.to));
    const levels = new Map(classes.map(c => [c.id, 0]));
    // Nombre de passes borné : une erreur de cycle ne doit pas bloquer l'éditeur.
    for (let pass = 0; pass < classes.length; pass++) {
      let changed = false;
      for (const edge of links) if (levels.get(edge.to) <= levels.get(edge.from)) { levels.set(edge.to, levels.get(edge.from) + 1); changed = true; }
      if (!changed) break;
    }
    if (Promotions.validate(db).some(e => e.startsWith('Cycle'))) for (const cls of classes) levels.set(cls.id, Math.min(9, Math.max(0, Number(cls.tier) || 0)));
    const columns = [];
    for (const cls of classes) { const level = levels.get(cls.id); (columns[level] || (columns[level] = [])).push(cls); }
    const positions = new Map();
    const height = Math.max(180, ...columns.filter(Boolean).map(col => col.length * 100 + 32));
    columns.forEach((col, x) => col && col.forEach((cls, y) => positions.set(cls.id, { x: x * 270 + 20, y: 24 + y * 100 })));
    const width = Math.max(260, columns.length * 270);
    const canvas = h('div', { class: 'promotion-tree-canvas', style: { width: width + 'px', height: height + 'px' } });
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('width', width); svg.setAttribute('height', height); svg.classList.add('promotion-links');
    for (const edge of links) {
      const a = positions.get(edge.from), b = positions.get(edge.to), x1 = a.x + 200, x2 = b.x, y1 = a.y + 31, y2 = b.y + 31;
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', `M ${x1} ${y1} C ${x1 + 34} ${y1}, ${x2 - 34} ${y2}, ${x2} ${y2}`);
      path.setAttribute('class', 'promotion-link');
      const title = document.createElementNS(ns, 'title'); title.textContent = 'Niveau ' + edge.row.minLevel + ' — cliquer pour voir cette branche'; path.append(title);
      if (options.onEdge) { path.setAttribute('tabindex', '0'); path.setAttribute('role', 'button'); path.setAttribute('aria-label', edge.from + ' vers ' + edge.to);
        path.addEventListener('click', () => options.onEdge(edge)); path.addEventListener('keydown', e => { if (e.key === 'Enter') options.onEdge(edge); }); }
      svg.append(path);
    }
    canvas.append(svg);
    for (const cls of classes) {
      const pos = positions.get(cls.id);
      canvas.append(h('button', { class: 'promotion-node' + (cls.id === options.currentId ? ' current' : ''), 'data-tree-class': cls.id,
        style: { left: pos.x + 'px', top: pos.y + 'px' }, onclick: () => options.onClass && options.onClass(cls) },
      h('b', {}, cls.name), h('small', {}, `Palier ${cls.tier === undefined ? 1 : cls.tier} · Dép ${cls.mov}`),
      h('span', {}, (cls.weapons || []).map(id => (Rules.WEAPON_TYPES.find(t => t.id === id) || {}).name || id).join(' · '))));
    }
    return h('div', { class: 'promotion-tree', 'aria-label': 'Arbre d’évolution' }, canvas);
  }
  root.PromotionUI = { graph };
})(self);
