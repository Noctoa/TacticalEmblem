/* Éditeur de conversation commun (événements de map, conversations du camp, soutiens, villages, dialogues de combat…).
 *
 * Le dialogue reste stocké comme avant (une ligne « Nom: réplique » par réplique, ou « @fichier#id » pour un texte de
 * l'outil Textes) : tous les systèmes du jeu le lisent sans changement. L'éditeur le montre réplique par réplique :
 * orateur (avec son portrait), texte, ordre, aperçu dans la boîte de dialogue. Chaque réplique a sa ligne dans le CSV
 * (outil Textes › Base de données : les dialogues des niveaux dans le CSV de leur chapitre), sans le nom de l'orateur.
 *
 * UI.dialogueEditor(textarea) : le textarea d'origine reste la source (masqué, « Texte brut » pour l'afficher) ;
 * écrire dedans de l'extérieur reconstruit les répliques.
 */
(function () {
  'use strict';
  const h = UI.h;
  const REF = /^\s*@([^#\s]+#\S+)\s*$/;
  const db = () => (window.Editor && Editor.db && Editor.db()) || { units: [] };
  const texts = () => (window.Editor && Editor.project && Editor.project() && Editor.project().texts) || null;
  const unitNamed = (name) => { const n = String(name || '').trim().toLowerCase(); return n ? (db().units || []).find(u => String(u.name || '').trim().toLowerCase() === n) : null; };

  function parse(value) {
    return String(value || '').split('\n').filter(l => l.trim()).map(l => {
      const m = REF.exec(l);
      if (m) return { ref: m[1] };
      const p = Texts.parseLine(l);
      return { who: p.who, text: p.text };
    });
  }
  const serialize = (rows) => rows.filter(r => r.ref || r.text.trim() || r.who.trim()).map(r => r.ref ? '@' + r.ref : Texts.joinLine(r.who.trim(), r.text.trim())).join('\n');

  /** Portrait (faceset) d'un orateur ; initiale colorée sinon. */
  function face(who, mode) {
    const u = unitNamed(who);
    const box = h('div', { class: 'dlg-face' + (mode ? ' ' + mode : '') });
    if (!u || !u.portrait || !window.Faces || !window.Render) {
      box.append(h('div', { class: 'dlg-initial', style: { background: (u && u.color) || '' } }, who ? String(who).trim().slice(0, 1).toUpperCase() : '…'));
      return box;
    }
    Render.loadImage(Editor.baseUrl(), u.portrait).then(img => box.replaceChildren(Faces.element(img, Render.imageUrl(Editor.baseUrl(), u.portrait), 'main') || '')).catch(() => {});
    return box;
  }
  /** Texte et orateur d'un renvoi @fichier#id (langue principale). */
  function refInfo(ref) {
    const t = texts();
    const found = t && Texts.find(t, ref);
    if (!found) return { who: '', text: '[texte manquant : ' + ref + ']', missing: true };
    return { who: Texts.speakerOf(found.file, db()), text: Texts.lookup(t, ref, t.main) || '', file: found.file };
  }

  /** Aperçu : les répliques une à une dans la boîte de dialogue, avec le portrait. */
  function preview(value) {
    const t = texts();
    const script = t ? Texts.resolve(value, t, t.main, db()) : value;
    const lines = String(script || '').split('\n').filter(l => l.trim()).map(l => Texts.parseLine(l));
    if (!lines.length) return UI.toast('Ce dialogue est vide.', 'warn');
    let i = 0;
    return UI.modal((box, close) => {
      box.classList.add('dlg-preview-modal');
      const stage = h('div', { class: 'dlg-preview', 'data-dlg-preview-box': true });
      const count = h('span', { class: 'dlg-preview-count' });
      const show = () => {
        const ln = lines[i];
        stage.replaceChildren(h('div', { class: 'tx-dlg' }, h('div', { class: 'tx-dlg-face' }, face(ln.who)),
          h('div', { class: 'tx-dlg-box' }, h('div', { class: 'tx-dlg-name' }, ln.who || '—'), h('div', { class: 'tx-dlg-text' }, ln.text))));
        count.textContent = (i + 1) + ' / ' + lines.length;
      };
      const step = (d) => { const n = i + d; if (n >= lines.length) return close(); if (n >= 0) { i = n; show(); } };
      stage.addEventListener('click', () => step(1));
      box.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); step(1); } if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); } });
      box.tabIndex = -1;
      box.append(h('h3', {}, 'Aperçu du dialogue'), stage,
        h('div', { class: 'modal-actions' }, count,
          h('button', { onclick: () => step(-1) }, '◀ Précédente'), h('button', { class: 'primary', 'data-dlg-next': true, onclick: () => step(1) }, 'Suivante ▶')));
      show();
      setTimeout(() => box.focus(), 0);
    }, { wide: true });
  }

  const dirty = () => { if (window.Editor && Editor.markDirty) Editor.markDirty(); };
  /** Réplique d'un fichier de personnage : { file, row, unit } (sinon null). */
  function charRef(ref) {
    const t = texts(), found = t && Texts.find(t, ref);
    if (!found || found.file.kind !== 'character') return null;
    return { file: found.file, row: found.row, unit: (db().units || []).find(u => u.id === found.file.ref) || null };
  }

  /**
   * Choix d'une réplique déjà écrite d'un personnage (ou d'une nouvelle, rangée dans son fichier de textes).
   * Renvoie « fichier#id » ou null.
   */
  function pickLine(unitId) {
    const t = texts();
    const units = (db().units || []).filter(u => u.name);
    if (!t || !units.length) { UI.toast('Aucun personnage dans la base.', 'warn'); return Promise.resolve(null); }
    let unit = units.find(u => u.id === unitId) || units.find(u => Texts.characterFile(t, db(), u.id)) || units[0], query = '';
    return UI.modal((box, close) => {
      box.classList.add('dlg-pick-modal');
      const sel = h('select', { 'data-pick-unit': true, onchange: () => { unit = units.find(u => u.id === sel.value); fill(); } },
        units.map(u => { const f = Texts.characterFile(t, db(), u.id); return h('option', { value: u.id }, u.name + (f && f.rows.length ? ' (' + f.rows.length + ')' : '')); }));
      sel.value = unit.id;
      const list = h('div', { class: 'tx-pick-list dlg-pick-list' });
      const prev = h('div', { class: 'tx-preview' });
      const showPrev = (text) => prev.replaceChildren(h('div', { class: 'tx-dlg' }, h('div', { class: 'tx-dlg-face' }, face(unit.name)),
        h('div', { class: 'tx-dlg-box' }, h('div', { class: 'tx-dlg-name' }, unit.name), h('div', { class: 'tx-dlg-text' }, text || h('span', { class: 'muted' }, 'Survole une réplique pour la voir ici.')))));
      const fresh = h('textarea', { rows: 2, placeholder: 'Nouvelle réplique de ce personnage…', 'data-pick-new': true, spellcheck: false });
      const fill = () => {
        const f = Texts.characterFile(t, db(), unit.id), q = query.toLowerCase();
        const rows = f ? f.rows.filter(r => !q || Object.values(r.t).some(v => String(v).toLowerCase().includes(q))) : [];
        list.replaceChildren(...rows.map(r => {
          const txt = r.t[t.main] || Texts.lookup(t, f.id + '#' + r.id, t.main) || '';
          return h('button', { class: 'tx-pick-row', type: 'button', 'data-pick-line': r.id, onmouseenter: () => showPrev(txt), onclick: () => close(f.id + '#' + r.id) },
            h('code', {}, r.id), h('span', {}, txt));
        }));
        if (!rows.length) list.append(h('p', { class: 'db-empty' }, f && f.rows.length ? 'Aucune réplique ne correspond.' : unit.name + ' n’a pas encore de répliques : écris la première ci-dessous.'));
        showPrev('');
      };
      box.append(h('h3', {}, 'Réplique d’un personnage'),
        h('p', { class: 'form-info' }, 'Les répliques viennent du fichier de textes du personnage (outil Textes › Personnages) : une même réplique peut servir dans plusieurs dialogues, et se traduit une seule fois.'),
        h('div', { class: 'dlg-pick-top' }, sel, h('input', { type: 'search', placeholder: 'Rechercher…', oninput: (e) => { query = e.target.value; fill(); } })),
        prev, list,
        h('div', { class: 'dlg-pick-new' }, fresh, h('button', { class: 'primary', type: 'button', 'data-pick-add': true, onclick: () => {
          if (!fresh.value.trim()) return fresh.focus();
          const ref = Texts.storeLine(t, db(), unit.id, fresh.value.replace(/\s*\n\s*/g, ' ')); dirty(); close(ref);
        } }, 'Ajouter et utiliser')),
        h('div', { class: 'modal-actions' }, h('button', { type: 'button', onclick: () => close(null) }, 'Annuler')));
      fill();
    }, { wide: true });
  }

  function dialogueEditor(ta, opts) {
    opts = opts || {};
    let rows = parse(ta.value), writing = false, raw = false;
    const wrap = h('div', { class: 'dlg-editor', 'data-dlg-editor': true });
    const list = h('div', { class: 'dlg-rows' });
    const listId = 'dlg-names-' + Math.random().toString(36).slice(2);
    const names = h('datalist', { id: listId });
    const fillNames = () => {
      const set = new Set((db().units || []).map(u => u.name).filter(Boolean));
      for (const r of rows) if (r.who) set.add(r.who);
      names.replaceChildren(...[...set].map(n => h('option', { value: n })));
    };
    const write = () => {
      writing = true;
      ta.value = serialize(rows);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
      writing = false;
    };
    const focusRow = (i, part) => { const el = list.querySelector(`[data-dlg-row="${i}"] ${part === 'who' ? '[data-dlg-who]' : '[data-dlg-text]'}`); if (el) { el.focus(); if (el.setSelectionRange) el.setSelectionRange(el.value.length, el.value.length); } };
    /** Orateur proposé pour une réplique insérée en position i : l'interlocuteur de la précédente. */
    const speakers = (opts.speakers || []).filter(Boolean);
    const whoOf = (r) => !r ? '' : r.ref ? refInfo(r.ref).who : r.who;
    const nextWho = (i) => {
      const a = rows[i - 1], b = rows[i - 2];
      const last = whoOf(a);
      if (!a) return speakers[0] || '';
      if (b && whoOf(b) && whoOf(b) !== last) return whoOf(b);
      return speakers.find(n => n !== last) || last;
    };
    const insert = (at, row) => { rows.splice(at, 0, row); render(); write(); };

    function rowEl(r, i) {
      const tools = h('div', { class: 'dlg-tools' },
        h('button', { class: 'mini', type: 'button', title: 'Monter', html: Icons.icon('up'), disabled: i === 0, onclick: () => { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; render(); write(); } }),
        h('button', { class: 'mini', type: 'button', title: 'Descendre', html: Icons.icon('down'), disabled: i === rows.length - 1, onclick: () => { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; render(); write(); } }),
        h('button', { class: 'mini', type: 'button', title: 'Supprimer cette réplique', html: Icons.icon('trash'), 'data-dlg-delete': String(i), onclick: () => { rows.splice(i, 1); render(); write(); } }));
      const c = r.ref && charRef(r.ref);
      if (c) {
        const t = texts(), name = (c.unit && c.unit.name) || c.file.name;
        const text = h('textarea', { rows: 1, class: 'dlg-text', spellcheck: false, 'data-dlg-text': String(i), title: 'Texte du fichier de ' + name + ' : le modifier ici le modifie partout où cette réplique sert.' });
        text.value = c.row.t[t.main] || '';
        const grow = () => { text.style.height = 'auto'; text.style.height = Math.max(34, text.scrollHeight + 2) + 'px'; };
        text.addEventListener('input', () => { const v = text.value.replace(/\n/g, ' '); if (v !== text.value) text.value = v; if (v.trim()) c.row.t[t.main] = v; grow(); dirty(); });
        text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) { e.preventDefault(); insert(i + 1, { who: nextWho(i + 1), text: '' }); focusRow(i + 1); } });
        requestAnimationFrame(grow);
        const uses = h('button', { class: 'small ghost', type: 'button', 'data-dlg-choose': String(i), title: 'Choisir une autre réplique de ' + name, onclick: async () => {
          const ref = await pickLine(c.file.ref); if (ref) { r.ref = ref; render(); write(); }
        } }, 'Changer');
        return h('div', { class: 'dlg-row char', 'data-dlg-row': String(i) }, face(name),
          h('div', { class: 'dlg-main' }, h('div', { class: 'dlg-ref-head' }, h('b', { 'data-dlg-speaker': String(i) }, name), h('code', { title: 'Réplique du fichier de textes du personnage' }, '@' + r.ref), uses,
            window.TextsEditor ? h('button', { class: 'small ghost', type: 'button', title: 'Ouvrir le fichier de ' + name + ' dans l’outil Textes (traductions)', onclick: () => TextsEditor.open(c.file.id) }, 'Traduire') : null), text), tools);
      }
      if (r.ref) {
        const info = refInfo(r.ref);
        return h('div', { class: 'dlg-row ref' + (info.missing ? ' missing' : ''), 'data-dlg-row': String(i) }, face(info.who),
          h('div', { class: 'dlg-ref' },
            h('div', { class: 'dlg-ref-head' }, h('b', {}, info.who || 'Texte'), h('code', {}, '@' + r.ref),
              info.file && window.TextsEditor ? h('button', { class: 'small ghost', type: 'button', title: 'Ouvrir ce fichier dans l’outil Textes', onclick: () => TextsEditor.open(info.file.id) }, 'Modifier') : null),
            h('div', { class: 'dlg-ref-text' }, info.text)), tools);
      }
      const who = h('input', { type: 'text', class: 'dlg-who', list: listId, placeholder: 'Narration', value: r.who, 'data-dlg-who': String(i), spellcheck: false,
        title: 'Orateur : le nom d’une unité affiche son portrait ; vide = narration' });
      const faceBox = h('div', { class: 'dlg-face-slot' }, face(r.who));
      who.addEventListener('input', () => { r.who = who.value.replace(/[:\n]/g, ''); write(); });
      who.addEventListener('change', () => { faceBox.replaceChildren(face(r.who)); fillNames(); });
      const text = h('textarea', { rows: 1, class: 'dlg-text', placeholder: 'Réplique…', spellcheck: false, 'data-dlg-text': String(i) });
      text.value = r.text;
      const grow = () => { text.style.height = 'auto'; text.style.height = Math.max(34, text.scrollHeight + 2) + 'px'; };
      text.addEventListener('input', () => { r.text = text.value.replace(/\n/g, ' '); if (text.value !== r.text) text.value = r.text; grow(); write(); });
      text.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) { e.preventDefault(); insert(i + 1, { who: nextWho(i + 1), text: '' }); focusRow(i + 1); }
        else if (e.key === 'Backspace' && !text.value && !r.who && rows.length > 1) { e.preventDefault(); rows.splice(i, 1); render(); write(); focusRow(Math.max(0, i - 1)); }
      });
      requestAnimationFrame(grow);
      const choose = h('button', { class: 'mini', type: 'button', title: 'Choisir une réplique déjà écrite de ce personnage', html: Icons.icon('chat'), 'data-dlg-choose': String(i), onclick: async () => {
        const u = Texts.unitByName(db(), r.who), ref = await pickLine(u && u.id);
        if (ref) { rows[i] = { ref }; render(); write(); }
      } });
      tools.prepend(choose);
      return h('div', { class: 'dlg-row', 'data-dlg-row': String(i) }, faceBox, h('div', { class: 'dlg-main' }, who, text), tools);
    }

    function render() {
      fillNames();
      list.replaceChildren(...rows.map(rowEl));
      if (!rows.length) list.append(h('p', { class: 'dlg-empty' }, opts.empty || 'Aucune réplique. Ajoute la première, ou un texte de l’outil Textes.'));
    }

    const rawBtn = h('button', { class: 'small ghost', type: 'button', 'data-dlg-raw': true, title: 'Afficher le dialogue en texte brut (une ligne « Nom: réplique » par réplique)', onclick: () => {
      raw = !raw; wrap.classList.toggle('raw', raw); rawBtn.textContent = raw ? 'Répliques' : 'Texte brut';
      if (!raw) { rows = parse(ta.value); render(); }
    } }, 'Texte brut');
    const bar = h('div', { class: 'dlg-bar' },
      h('button', { class: 'small', type: 'button', 'data-dlg-add': true, html: Icons.icon('plus'), onclick: () => { insert(rows.length, { who: nextWho(rows.length), text: '' }); focusRow(rows.length - 1, rows[rows.length - 1].who ? 'text' : 'who'); } }, 'Réplique'),
      h('button', { class: 'small', type: 'button', 'data-dlg-pick-char': true, html: Icons.icon('chat'), title: 'Ajouter une réplique déjà écrite d’un personnage (son fichier de textes)', onclick: async () => {
        const last = [...rows].reverse().find(x => whoOf(x)), u = Texts.unitByName(db(), nextWho(rows.length) || (last && whoOf(last)));
        const ref = await pickLine(u && u.id); if (ref) insert(rows.length, { ref });
      } }, 'Réplique d’un personnage'),
      window.TextsEditor ? h('button', { class: 'small ghost', type: 'button', 'data-text-ref-btn': true, title: 'Ajouter un texte de l’outil Textes (référence @fichier#id, traduite en jeu)', onclick: async () => {
        const ref = await TextsEditor.pick(); if (ref) insert(rows.length, { ref });
      } }, '＋ Texte existant') : null,
      h('span', { class: 'dlg-bar-gap' }),
      h('button', { class: 'small ghost', type: 'button', 'data-dlg-preview': true, html: Icons.icon('play'), onclick: () => preview(ta.value) }, 'Aperçu'),
      rawBtn);
    // écriture extérieure dans le textarea (texte brut, scripts, tests) : répliques reconstruites
    const external = () => { if (writing) return; rows = parse(ta.value); if (!raw) render(); };
    ta.addEventListener('input', external);
    ta.addEventListener('change', external);
    ta.classList.add('dlg-raw');
    render();
    wrap.append(ta, names, list, bar);
    return wrap;
  }

  UI.dialogueEditor = dialogueEditor;
  UI.dialoguePreview = preview;
  UI.pickCharacterLine = pickLine;
})();
