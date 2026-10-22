/*
 * Écran titre du jeu : nom du jeu (et sous-titre), puis Jouer, Crédits et Quitter.
 * Réglages dans Base de données › Système › Écran titre (meta.title) et texte des crédits (meta.credits).
 *
 *   const choice = await TitleScreen.show({ meta, baseUrl, play: { items: () => [...] }, extra: [{ value, label }] });
 *   // valeur de l'entrée choisie (sous-menus de « Jouer » compris), 'quit' pour Quitter
 *
 * Clavier : flèches pour choisir, Z / Entrée pour valider, X / Échap pour revenir (crédits, sous-menus).
 */
(function (root) {
  'use strict';
  const { h } = UI;

  const DEFAULTS = { subtitle: '', background: '', music: '', newGameMode: 'classic' };
  function settings(meta) { return Object.assign({}, DEFAULTS, (meta && meta.title) || {}); }

  /**
   * Lignes des crédits : « Rôle : Nom » sur deux colonnes, une ligne qui finit par « : » devient un titre de section,
   * une ligne vide sépare les blocs ; le reste s'affiche tel quel.
   */
  function parseCredits(text) {
    const out = [];
    for (const raw of String(text || '').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) { out.push({ kind: 'gap' }); continue; }
      if (/[:：]$/.test(line)) { out.push({ kind: 'heading', text: line.replace(/\s*[:：]$/, '') }); continue; }
      const m = line.match(/^(.{1,60}?)\s+[:：]\s+(.+)$/);
      if (m) out.push({ kind: 'role', role: m[1], name: m[2] });
      else out.push({ kind: 'text', text: line });
    }
    while (out.length && out[0].kind === 'gap') out.shift();
    while (out.length && out[out.length - 1].kind === 'gap') out.pop();
    return out;
  }

  function creditsView(meta) {
    const lines = parseCredits(meta.credits);
    const box = h('div', { class: 'ts-credits-roll' });
    box.append(h('h2', {}, meta.name || 'Crédits'));
    if (meta.author) box.append(h('div', { class: 'ts-cr-role' }, h('span', {}, 'Auteur'), h('b', {}, meta.author)));
    if (!lines.length && !meta.author) box.append(h('p', { class: 'ts-cr-empty' }, 'Aucun crédit pour le moment.'));
    for (const l of lines) {
      if (l.kind === 'gap') box.append(h('div', { class: 'ts-cr-gap' }));
      else if (l.kind === 'heading') box.append(h('h3', {}, l.text));
      else if (l.kind === 'role') box.append(h('div', { class: 'ts-cr-role' }, h('span', {}, l.role), h('b', {}, l.name)));
      else box.append(h('p', {}, l.text));
    }
    box.append(h('div', { class: 'ts-cr-gap' }), h('p', { class: 'ts-cr-engine' }, 'Créé avec Tactical Emblem'));
    return box;
  }

  /**
   * Affiche l'écran titre et attend un choix.
   * opts.play : entrée « Jouer » — { value } (choix direct) ou { items: () => [entrées] } (sous-menu) ;
   * une entrée : { value, label, desc?, items?() } — « items » ouvre un sous-menu (ex. Charger → emplacements).
   * opts.extra : entrées ajoutées avant « Quitter ». Renvoie la valeur choisie ('quit' pour Quitter).
   */
  function show(opts) {
    const meta = opts.meta || {};
    const set = settings(meta);
    return new Promise((resolve) => {
      const screen = h('div', { id: 'title-screen' });
      if (set.background) {
        screen.classList.add('has-bg');
        screen.style.setProperty('--ts-bg', `url("${Render.imageUrl(opts.baseUrl, set.background)}")`);
      }
      document.body.append(screen);
      document.body.classList.add('on-title');
      const top = [
        Object.assign({ value: 'play', label: 'Jouer' }, opts.play || {}, { id: 'play' }),
        { value: 'credits', label: 'Crédits' },
        ...(opts.extra || []),
        { value: 'quit', label: 'Quitter' }
      ];
      // pile des menus : [{ title, items, index }] ; le premier est le menu principal
      const stack = [{ title: '', items: top, index: 0 }];
      let view = 'menu', mouseMoved = false;
      const onMove = (e) => { if (e.movementX || e.movementY) mouseMoved = true; };
      window.addEventListener('mousemove', onMove);
      const cur = () => stack[stack.length - 1];

      function render() {
        screen.innerHTML = '';
        screen.append(h('div', { class: 'ts-sky' }));
        if (view === 'credits') {
          screen.append(h('div', { class: 'ts-window ts-credits' }, creditsView(meta),
            h('button', { class: 'ts-item on', 'data-title': 'back', onclick: back }, 'Retour')));
          return;
        }
        const m = cur(), sub = stack.length > 1;
        const list = sub ? m.items.concat([{ value: '__back', label: 'Retour', back: true }]) : m.items;
        const desc = (list[m.index] || {}).desc;
        const menu = h('div', { class: 'ts-window ts-menu' + (sub ? ' sub' : '') },
          sub ? h('div', { class: 'ts-menu-title' }, m.title) : null,
          list.map((it, i) => h('button', {
            class: 'ts-item' + (i === m.index ? ' on' : '') + (it.dev ? ' dev' : '') + (it.back ? ' back' : '') + (it.cls ? ' ' + it.cls : ''), 'data-title': it.id || it.value,
            onmouseenter: () => { if (mouseMoved && m.index !== i) { m.index = i; play('cursor'); render(); } }, // souris réellement bougée (pas un simple réaffichage sous le pointeur)
            onclick: () => pick(i)
          }, typeof it.render === 'function' ? it.render() : [it.label, it.items ? h('span', { class: 'ts-more' }, '…') : null])),
          sub ? h('div', { class: 'ts-desc' }, desc || '') : null);
        screen.append(
          h('div', { class: 'ts-head' + (sub ? ' small' : '') },
            h('h1', { class: 'ts-name' }, meta.name || 'Mon Tactical RPG'),
            set.subtitle && !sub ? h('div', { class: 'ts-sub' }, set.subtitle) : null),
          menu,
          h('div', { class: 'ts-foot' }, meta.author ? 'Un jeu de ' + meta.author : '', h('span', {}, 'Flèches : choisir · Z / Entrée : valider' + (sub ? ' · X / Échap : retour' : ''))));
      }
      const play = (se) => { try { if (self.Music) self.Music.se(se); } catch (e) { /* sans son */ } };
      function back() {
        play('cancel');
        if (view === 'credits') view = 'menu';
        else if (stack.length > 1) stack.pop();
        render();
      }
      function pick(i) {
        const m = cur(), list = stack.length > 1 ? m.items.concat([{ back: true }]) : m.items;
        const it = list[i];
        m.index = i;
        if (it.back) return back();
        if (it.value === 'credits' && stack.length === 1) { play('confirm'); view = 'credits'; render(); return; }
        if (typeof it.items === 'function') {
          const items = it.items() || [];
          if (items.length) { play('confirm'); stack.push({ title: it.title || it.label, items, index: 0 }); render(); return; }
        }
        play(it.value === 'quit' ? 'cancel' : 'confirm');
        done(it.value);
      }
      function done(value) {
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('mousemove', onMove);
        screen.classList.add('out');
        setTimeout(() => { screen.remove(); document.body.classList.remove('on-title'); }, 250);
        resolve(value);
      }
      function onKey(e) {
        if (document.querySelector('.modal-back')) return;
        e.stopImmediatePropagation();
        const k = e.key;
        if (view === 'credits') {
          if (['x', 'X', 'Escape', 'Backspace', 'z', 'Z', 'Enter', ' '].includes(k)) { e.preventDefault(); back(); }
          else if (k === 'ArrowDown' || k === 'ArrowUp') { const roll = screen.querySelector('.ts-credits-roll'); if (roll) roll.scrollTop += k === 'ArrowDown' ? 40 : -40; }
          return;
        }
        const m = cur(), n = m.items.length + (stack.length > 1 ? 1 : 0);
        if (k === 'ArrowDown' || k === 'ArrowRight') { e.preventDefault(); m.index = (m.index + 1) % n; play('cursor'); render(); }
        else if (k === 'ArrowUp' || k === 'ArrowLeft') { e.preventDefault(); m.index = (m.index - 1 + n) % n; play('cursor'); render(); }
        else if (['z', 'Z', 'Enter', ' '].includes(k)) { e.preventDefault(); pick(m.index); }
        else if (['x', 'X', 'Escape', 'Backspace'].includes(k) && stack.length > 1) { e.preventDefault(); back(); }
      }
      window.addEventListener('keydown', onKey, true);
      render();
    });
  }

  root.TitleScreen = { show, settings, parseCredits, DEFAULTS };
})(self);
