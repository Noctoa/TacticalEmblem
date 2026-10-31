/* Champs partagés entre l'inspecteur de map et la fiche d'acte. */
(function (root) {
  'use strict';
  function form(village, db, map, api) {
    const model = Object.assign({ name: 'Village', x: 0, y: 0, script: '', allowedUnits: [], recruitUnitId: '', repeatOnReplay: false, raidable: true, ruinedTerrainId: db.terrains.some(t => t.id === 'plain') ? 'plain' : '' }, village,
      { reward: Object.assign({ gold: 0, itemId: '', uses: 0 }, village.reward) });
    const box = UI.form([
      { key: 'name', label: 'Nom du village', type: 'text' },
      { type: 'row', fields: [{ key: 'x', label: 'Case X', type: 'number', min: 0, max: map.width - 1 }, { key: 'y', label: 'Case Y', type: 'number', min: 0, max: map.height - 1 }] },
      { key: 'script', label: 'Dialogue de visite (Nom: texte)', type: 'textarea', rows: 5, placeholder: 'Villageois: Merci de votre aide !' },
      { key: 'reward.gold', label: 'Or offert', type: 'number', min: 0, max: 999999 },
      { key: 'reward.itemId', label: 'Arme ou objet offert', type: 'select', empty: '— aucun —', options: db.weapons.concat(db.items).map(e => ({ value: e.id, label: e.name })) },
      { key: 'reward.uses', label: 'Utilisations de l’objet (0 = toutes)', type: 'number', min: 0, max: 999 },
      { key: 'recruitUnitId', label: 'Personnage recruté', type: 'select', empty: '— aucun —', options: db.units.map(u => ({ value: u.id, label: u.name })) },
      { key: 'allowedUnits', label: 'Visiteurs autorisés (vide = tous les personnages du joueur)', type: 'multicheck', options: db.units.map(u => ({ value: u.id, label: u.name })) },
      { key: 'repeatOnReplay', label: 'Réutilisable quand cet acte est rejoué après victoire', type: 'checkbox' },
      { key: 'raidable', label: 'Les brigands peuvent piller ce village tant qu’il est ouvert', type: 'checkbox' },
      { key: 'ruinedTerrainId', label: 'Terrain après pillage', type: 'select', empty: '— plaine par défaut —', options: db.terrains.filter(t => Rules.moveCost(t, 'foot') < Rules.IMPASSABLE).map(t => ({ value: t.id, label: t.name })) },
      { type: 'info', text: 'Visiter consomme l’action. Un objet va au convoi si l’inventaire est plein ; si les deux sont pleins, la visite attend une place libre. Une recrue apparaît à proximité ou un allié vert rejoint le joueur. Un personnage mort ne ressuscite pas. Par défaut, les récompenses ne se répètent pas après une victoire.' }
    ], model, { onChange: key => {
      api.beforeChange && api.beforeChange();
      const top = key.split('.')[0];
      // Le modèle de saisie doit rester distinct pour capturer l'état précédent dans l'historique.
      village[top] = model[top] && typeof model[top] === 'object' ? JSON.parse(JSON.stringify(model[top])) : model[top];
      api.onChange(key);
    } });
    box.dataset.villageId = village.id;
    const looks = UI.h('details', { 'data-village-appearances': village.id }, UI.h('summary', {}, 'Tuiles du village fermé et des ruines'));
    const content = UI.h('div'); looks.append(content); box.append(looks);
    function redraw() {
      content.replaceChildren(UI.h('p', { class: 'form-info' }, 'La case du village est son entrée. Choisis un bloc de tuiles pour remplacer tout le bâtiment : les anciens tiles de la zone seront effacés pendant la partie. Sans réglage, une porte fermée ou des décombres simples sont dessinés.'));
      for (const [kind, label] of [['visited', 'Après visite du joueur : village fermé'], ['ruined', 'Après pillage : village en ruines']]) {
        const patch = village.appearance?.[kind], ts = patch && db.tilesets.find(t => t.id === patch.tilesetId);
        const row = UI.h('div', { class: 'village-appearance-row', 'data-village-appearance': kind }, UI.h('b', {}, label));
        if (ts) {
          const preview = UI.h('canvas', { width: patch.width * 24, height: patch.height * 24, style: { maxWidth: '100%', imageRendering: 'pixelated' } });
          Render.loadImage(Editor.baseUrl(), ts.image).then(img => { if (!img) return; const ctx = preview.getContext('2d'); ctx.imageSmoothingEnabled = false;
            for (let y = 0; y < patch.height; y++) for (let x = 0; x < patch.width; x++) Render.drawTile(ctx, img, ts, (patch.tileY + y) * ts.columns + patch.tileX + x, x * 24, y * 24, 24, 24, 0);
          });
          row.append(UI.h('p', { class: 'form-info' }, `${ts.name} · ${patch.width} × ${patch.height} cases · décalage ${patch.offsetX}, ${patch.offsetY}`), preview);
        }
        row.append(UI.h('button', { class: 'small', 'data-village-pick': kind, onclick: async () => {
          const value = await pickPatch(village, kind, db, map);
          if (!value) return;
          api.beforeChange?.(); village.appearance = { ...village.appearance, [kind]: value }; model.appearance = village.appearance; api.onChange('appearance'); redraw();
        } }, ts ? 'Changer les tuiles…' : 'Choisir les tuiles…'));
        if (patch) row.append(UI.h('button', { class: 'small', 'data-village-clear': kind, onclick: () => {
          api.beforeChange?.(); village.appearance = { ...village.appearance }; delete village.appearance[kind]; model.appearance = village.appearance; api.onChange('appearance'); redraw();
        } }, 'Aspect de secours'));
        content.append(row);
      }
    }
    redraw();
    return box;
  }
  async function pickPatch(village, kind, db, map) {
    const sets = db.tilesets.filter(ts => map.tilesets.some(t => t.tilesetId === ts.id));
    if (!sets.length) { await UI.alert('Aucun tileset', 'Ajoute d’abord un tileset à la map.'); return null; }
    const existing = village.appearance?.[kind];
    const patch = existing ? { ...existing } : { tilesetId: sets[0].id, tileX: 0, tileY: 0, width: 1, height: 1, offsetX: 0, offsetY: 0 };
    return UI.modal((box, close) => {
      const h = UI.h; box.dataset.villageTilePicker = kind;
      let zoom = 2, anchor = null, manualOffset = !!existing, picture = null, version = 0;
      const canvas = h('canvas', { 'data-village-tiles': true, style: { imageRendering: 'pixelated', cursor: 'crosshair', display: 'block' } });
      const tsOf = () => sets.find(ts => ts.id === patch.tilesetId) || sets[0];
      const select = h('select', { 'data-village-tileset': true, onchange: () => { patch.tilesetId = select.value; Object.assign(patch, { tileX: 0, tileY: 0, width: 1, height: 1 }); refresh(); } }, sets.map(ts => h('option', { value: ts.id }, ts.name)));
      select.value = patch.tilesetId;
      const note = h('p', { class: 'form-info', role: 'status' }), errors = h('p', { class: 'note', role: 'status' });
      const ox = h('input', { type: 'number', min: -15, max: 15, value: patch.offsetX, 'data-village-offset': 'x', onchange: e => { patch.offsetX = Number(e.target.value); manualOffset = true; draw(); } });
      const oy = h('input', { type: 'number', min: -15, max: 15, value: patch.offsetY, 'data-village-offset': 'y', onchange: e => { patch.offsetY = Number(e.target.value); manualOffset = true; draw(); } });
      const save = h('button', { class: 'primary', 'data-village-tiles-apply': true, onclick: () => { if (!check().length) close({ ...patch }); } }, 'Utiliser ce bloc');
      const check = () => Villages.validate({ villages: [{ ...village, appearance: { [kind]: patch } }] }, db, map);
      function draw() {
        if (!picture) return;
        const ts = tsOf(), ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
        canvas.width = picture.width * zoom; canvas.height = picture.height * zoom; ctx.imageSmoothingEnabled = false;
        ctx.drawImage(picture, 0, 0, canvas.width, canvas.height);
        const start = Render.tileSource(ts, patch.tileY * ts.columns + patch.tileX);
        ctx.strokeStyle = '#ffd16a'; ctx.lineWidth = 2;
        ctx.strokeRect(start.sx * zoom + 1, start.sy * zoom + 1, (patch.width * (ts.tileWidth + (ts.spacing || 0)) - (ts.spacing || 0)) * zoom - 2,
          (patch.height * (ts.tileHeight + (ts.spacing || 0)) - (ts.spacing || 0)) * zoom - 2);
        note.textContent = `Bloc (${patch.tileX}, ${patch.tileY}) · ${patch.width} × ${patch.height} cases. Glisse sur l’image pour sélectionner tout le village.`;
        const list = check(); errors.textContent = list.join(' '); save.disabled = list.length > 0;
      }
      async function refresh() { picture = null; save.disabled = true; const request = ++version, img = await Render.loadImage(Editor.baseUrl(), tsOf().image); if (request !== version) return; picture = img; if (img) draw(); else errors.textContent = 'Image du tileset illisible.'; }
      function cell(e) {
        const r = canvas.getBoundingClientRect(), ts = tsOf(), px = (e.clientX - r.left) / r.width * canvas.width / zoom, py = (e.clientY - r.top) / r.height * canvas.height / zoom;
        const x = Math.floor((px - (ts.margin || 0)) / (ts.tileWidth + (ts.spacing || 0))), y = Math.floor((py - (ts.margin || 0)) / (ts.tileHeight + (ts.spacing || 0)));
        return x >= 0 && x < ts.columns && y >= 0 && y * ts.columns + x < ts.tileCount ? { x, y } : null;
      }
      function choose(end) {
        if (!anchor || !end) return;
        patch.tileX = Math.min(anchor.x, end.x); patch.tileY = Math.min(anchor.y, end.y);
        patch.width = Math.min(16, Math.abs(end.x - anchor.x) + 1); patch.height = Math.min(16, Math.abs(end.y - anchor.y) + 1);
        if (!manualOffset) { patch.offsetX = -Math.floor(patch.width / 2); patch.offsetY = 1 - patch.height; ox.value = patch.offsetX; oy.value = patch.offsetY; }
        draw();
      }
      canvas.addEventListener('pointerdown', e => { if (e.button !== 0) return; anchor = cell(e); if (!anchor) return; try { canvas.setPointerCapture?.(e.pointerId); } catch (_) { /* événement synthétique ou pointeur déjà relâché */ } choose(anchor); e.preventDefault(); });
      canvas.addEventListener('pointermove', e => { if (anchor) choose(cell(e)); });
      canvas.addEventListener('pointerup', e => { choose(cell(e)); anchor = null; });
      canvas.addEventListener('pointercancel', () => { anchor = null; });
      box.append(h('h3', {}, kind === 'visited' ? 'Village fermé après visite' : 'Village en ruines après pillage'), select,
        h('div', { class: 'insp-actions' }, h('button', { onclick: () => { zoom = Math.max(1, zoom - 1); draw(); } }, '−'), h('button', { onclick: () => { zoom = Math.min(4, zoom + 1); draw(); } }, '+')),
        h('div', { style: { maxHeight: '42vh', overflow: 'auto', background: '#152025' } }, canvas), note,
        h('div', { class: 'form-row' }, h('label', { class: 'field' }, 'Décalage X depuis l’entrée', ox), h('label', { class: 'field' }, 'Décalage Y depuis l’entrée', oy)),
        errors, h('div', { class: 'modal-actions' }, h('button', { onclick: () => close(null) }, 'Annuler'), save));
      refresh();
    }, { wide: true });
  }
  root.VillageFields = { form };
})(self);
