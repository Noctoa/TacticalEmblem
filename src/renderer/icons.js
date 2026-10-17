/* Icônes SVG (trait 1.6px, 16×16). */
(function (root) {
  const P = {
    file: '<path d="M4 1.8h5l3.2 3.2V14H4z"/><path d="M9 1.8V5h3.2"/>',
    folder: '<path d="M1.8 4.2h4.4l1.4 1.6h6.6v7.4H1.8z"/>',
    save: '<path d="M2.5 2.5h9l2 2v9h-11z"/><path d="M5 2.5v3.5h5V2.5"/><rect x="4.6" y="9" width="6.8" height="4.5"/>',
    import: '<path d="M8 2v8"/><path d="M4.8 7 8 10.2 11.2 7"/><path d="M2.5 12.5v1.2h11v-1.2"/>',
    layers: '<path d="M8 2 14 5.2 8 8.4 2 5.2z"/><path d="M2 8.2 8 11.4l6-3.2"/><path d="M2 11 8 14.2 14 11"/>',
    terrain: '<path d="M1.5 13 6 5.5l2.6 4L10.5 7l4 6z"/>',
    units: '<path d="M8 1.8 13 4v4.4c0 3-2.3 4.8-5 5.8-2.7-1-5-2.8-5-5.8V4z"/>',
    pencil: '<path d="M10.8 2.2 13.8 5.2 5.4 13.6H2.4v-3z"/><path d="m9.2 3.8 3 3"/>',
    rect: '<rect x="2.5" y="3.5" width="11" height="9"/>',
    fill: '<path d="m7 2 6 6-5 5-6-6z"/><path d="M13 10.5c.8 1.2 1.2 2 1.2 2.6a1.2 1.2 0 0 1-2.4 0c0-.6.4-1.4 1.2-2.6z"/>',
    eraser: '<path d="m9.5 2.5 4 4-7 7h-3l-2-2z"/><path d="m6 6 4 4"/><path d="M8 13.5h6"/>',
    picker: '<path d="m10 2.5 3.5 3.5-2 2-3.5-3.5z"/><path d="m8.5 5.5-6 6v2h2l6-6"/>',
    undo: '<path d="M5.5 3 2.5 6l3 3"/><path d="M2.5 6h7a4 4 0 0 1 0 8H7"/>',
    redo: '<path d="m10.5 3 3 3-3 3"/><path d="M13.5 6h-7a4 4 0 0 0 0 8H9"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
    minus: '<path d="M3 8h10"/>',
    grid: '<rect x="2" y="2" width="12" height="12"/><path d="M6 2v12M10 2v12M2 6h12M2 10h12"/>',
    db: '<ellipse cx="8" cy="3.8" rx="5.5" ry="2"/><path d="M2.5 3.8v8.4c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V3.8"/><path d="M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2"/>',
    play: '<path d="M4.5 2.8v10.4L13 8z" fill="currentColor"/>',
    eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
    eyeoff: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" opacity=".35"/><path d="m2.5 13.5 11-11"/>',
    up: '<path d="m4 10 4-4 4 4"/>',
    down: '<path d="m4 6 4 4 4-4"/>',
    trash: '<path d="M3 4.5h10"/><path d="M6 4.5V2.8h4v1.7"/><path d="M4.3 4.5 5 13.5h6l.7-9"/>',
    copy: '<rect x="5" y="5" width="8.5" height="8.5"/><path d="M3 10.5V2.5h8"/>',
    map: '<path d="M1.8 3.5 5.8 2l4.4 1.8 4-1.5v10.2l-4 1.5-4.4-1.8-4 1.5z"/><path d="M5.8 2v10.2M10.2 3.8V14"/>',
    flag: '<path d="M3.5 14V2"/><path d="M3.5 2.5h8.5l-2 3 2 3H3.5"/>',
    sword: '<path d="m13.5 2.5-7 7"/><path d="M13.5 2.5v3l-6.5 6.5"/><path d="m4 9 3 3"/><path d="m2.5 13.5 2.5-2.5"/>',
    chat: '<path d="M2 3h12v8H7l-3 2.5V11H2z"/>',
    gear: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>'
  };
  function icon(name, size) {
    const s = size || 16;
    return `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
  }
  function hydrate(rootEl) {
    (rootEl || document).querySelectorAll('[data-icon]').forEach(b => {
      if (b.querySelector(':scope > svg.ic')) return;
      b.insertAdjacentHTML('afterbegin', icon(b.dataset.icon));
    });
  }
  root.Icons = { icon, hydrate };
})(self);
