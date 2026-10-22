/*
 * Emplacements de sauvegarde façon Fire Emblem GBA (img/ui/save/, tools/build_ui_save.py) :
 * barre verte ornée (claire quand elle est choisie), main-curseur, cadre PLAYTIME avec les chiffres du jeu.
 *
 *   SaveSlots.describe(s, { G, R, lobbyName })  → { title, mode, gold, date, playTime, error }
 *   SaveSlots.element(s, info, { onClick, cls }) → bouton (barre) d'un emplacement
 *   SaveSlots.playtime(ms)                       → cadre PLAYTIME « HH:MM »
 *   SaveSlots.clock(ms)                          → « 12:34 »
 */
(function (root) {
  'use strict';
  const { h } = UI;

  const clock = (ms) => {
    const m = Math.max(0, Math.floor((Number(ms) || 0) / 60000));
    return `${String(Math.min(99, Math.floor(m / 60))).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };
  /** Chiffres de la planche (cases de 8 × 10 : 0-9 puis « : »). */
  function digits(text) {
    return h('span', { class: 'sv-digits', 'aria-label': text }, [...text].map(c => {
      const i = c === ':' ? 10 : Number(c);
      return Number.isInteger(i) ? h('i', { style: { backgroundPosition: `calc(var(--px) * ${-i * 8}) 0` } }) : h('b', {}, c);
    }));
  }
  function playtime(ms) { return h('span', { class: 'sv-playtime', title: 'Temps de jeu' }, digits(clock(ms))); }

  const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
  function describe(s, ctx) {
    if (!s || !s.exists) return { title: 'Vide', empty: true };
    if (s.error) return { title: 'Sauvegarde illisible', error: s.error };
    const { G, R } = ctx, info = s.info || {};
    const LOBBY = self.Lobby ? Lobby.LOBBY_SAVE : '__lobby__';
    const place = info.place || (s.chapterId === LOBBY ? (ctx.lobbyName || 'Camp') : ((R.byId(G.db.chapters, s.chapterId) || {}).name || s.chapterId));
    const title = s.chapterId === LOBBY ? place : (info.kind === 'preparation' ? `Préparatifs de « ${place} »` : `Début de « ${place} »`);
    return { title, mode: s.mode === 'casual' ? 'Détente' : 'Classique', gold: G.lobbyOn || s.gold ? (s.gold || 0) : null,
      date: fmtDate(info.savedAt), playTime: info.playTime };
  }

  /** Barre d'un emplacement : numéro, lieu, mode · or · date, temps de jeu. */
  function element(s, d, opts = {}) {
    return h('button', { class: 'sv-slot' + (d.empty ? ' empty' : '') + (d.error ? ' broken' : '') + (opts.cls ? ' ' + opts.cls : ''),
      'data-sv-slot': s.slot, disabled: !!opts.disabled, onclick: opts.onClick, title: opts.title || '' }, content(s, d));
  }
  /** Contenu d'une barre (numéro, lieu, détails, temps de jeu), pour un bouton fourni par l'appelant (écran titre). */
  function content(s, d) {
    const sub = d.error ? [h('span', {}, d.error)] : d.empty ? [] : [
      h('span', {}, d.mode),
      d.gold !== null && d.gold !== undefined ? UI.money(d.gold, UI.GOLD_ICON || 'img/ui/gold.png', 'Or') : null,
      d.date ? h('span', { class: 'sv-date' }, d.date) : null];
    return [h('span', { class: 'sv-num' }, String(s.slot)),
      h('span', { class: 'sv-main' }, h('span', { class: 'sv-title' }, d.title), sub.length ? h('span', { class: 'sv-sub' }, sub) : null),
      !d.empty && !d.error && d.playTime !== undefined ? playtime(d.playTime) : null];
  }

  root.SaveSlots = { describe, element, content, playtime, clock, digits };
})(self);
