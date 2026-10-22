/*
 * Son du playtest, trois canaux :
 *   musique (BGM)   une piste en boucle par phase, en fondu enchaîné
 *   jingles (ME)    coupent la musique le temps de jouer (montée de niveau, victoire…)
 *   effets (SE)     bruitages courts : curseur, valider, annuler, coup, critique, esquive, défaite
 *
 * Volume final = volume du projet (Système › Musique, « Volume ») × volume du joueur pour ce canal.
 * Les volumes du joueur et la coupure du son sont mémorisés dans le navigateur de l'application.
 */
(function (root) {
  'use strict';
  let baseUrl = '', cfg = {}, current = '', bgmEl = null, meEl = null, fadeTimer = null;
  const M = { muted: false, volumes: { music: 1, me: 1, se: 1 } };
  const SE_KEYS = [
    ['cursor', 'Curseur'], ['confirm', 'Valider'], ['cancel', 'Annuler'],
    ['hit', 'Coup'], ['crit', 'Coup critique'], ['miss', 'Esquive'], ['death', 'Unité vaincue']
  ];
  M.SE_KEYS = SE_KEYS;
  try {
    const saved = JSON.parse(localStorage.getItem('tf-audio') || 'null');
    if (saved) { M.muted = !!saved.muted; Object.assign(M.volumes, saved.volumes || {}); }
    else M.muted = localStorage.getItem('tf-muted') === '1';
  } catch (e) { /* stockage indisponible */ }
  const persist = () => { try { localStorage.setItem('tf-audio', JSON.stringify({ muted: M.muted, volumes: M.volumes })); } catch (e) { /* ignoré */ } };

  const clamp = (v) => Math.max(0, Math.min(1, Number(v) || 0));
  const base = () => clamp(cfg.volume === undefined ? 0.6 : cfg.volume);
  const vol = (channel) => (M.muted ? 0 : base() * clamp(M.volumes[channel]));
  const url = (p) => Render.imageUrl(baseUrl, p);
  const safePlay = (el) => { try { const p = el.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* pas de sortie audio */ } };

  function fade(el, to, ms, done) {
    clearInterval(fadeTimer);
    if (!el) { if (done) done(); return; }
    const from = el.volume, steps = Math.max(1, Math.round(ms / 30)); let i = 0;
    fadeTimer = setInterval(() => {
      i++; el.volume = Math.max(0, Math.min(1, from + (to - from) * i / steps));
      if (i >= steps) { clearInterval(fadeTimer); if (done) done(); }
    }, 30);
  }

  M.setup = function (b, c) { baseUrl = b; cfg = c || {}; };

  /** Joue la BGM associée à une clé de configuration (playerPhase, allyPhase, enemyPhase, lobby…). */
  M.bgm = function (keyName) {
    const path = cfg[keyName] || '';
    if (path === current && bgmEl) { if (bgmEl.paused && !(meEl && !meEl.paused)) safePlay(bgmEl); return; }
    current = path;
    const start = () => {
      if (bgmEl) { bgmEl.pause(); bgmEl = null; }
      if (!path) return;
      bgmEl = new Audio(url(path)); bgmEl.loop = true; bgmEl.volume = 0;
      if (meEl && !meEl.paused) return; // reprendra après le jingle
      safePlay(bgmEl); fade(bgmEl, vol('music'), 600);
    };
    if (bgmEl && !bgmEl.paused) fade(bgmEl, 0, 350, start); else start();
  };

  /** Jingle : coupe la BGM, puis la reprend (sauf resume: false). */
  M.me = function (keyName, opts) {
    const path = cfg[keyName]; if (!path) return;
    opts = opts || {};
    if (meEl) meEl.pause();
    if (bgmEl) bgmEl.pause();
    if (opts.resume === false) { if (bgmEl) bgmEl = null; current = ''; }
    meEl = new Audio(url(path)); meEl.volume = vol('me');
    meEl.onended = () => { if (bgmEl && opts.resume !== false) { bgmEl.volume = 0; safePlay(bgmEl); fade(bgmEl, vol('music'), 500); } };
    safePlay(meEl);
  };

  M.victory = function () {
    if (cfg.victory) { M.me('victory', { resume: false }); return; }
    if (bgmEl) fade(bgmEl, 0, 1200, () => { if (bgmEl) bgmEl.pause(); });
  };

  // ---------- effets sonores ----------
  const lastSe = {};
  const seCache = {};
  /** Effet sonore (clé de SE_KEYS) ; ignoré si aucun son n'est réglé ou s'il vient d'être joué. */
  M.se = function (keyName) {
    const path = (cfg.se || {})[keyName];
    if (!path || M.muted || !M.volumes.se) return;
    const now = performance.now();
    if (now - (lastSe[keyName] || 0) < 45) return; // curseur tenu : pas de mitraillage
    lastSe[keyName] = now;
    const src = seCache[path] || (seCache[path] = new Audio(url(path)));
    const el = src.cloneNode(); el.volume = vol('se');
    safePlay(el);
  };
  /** Joue un fichier son (chemin du projet, ex. une image d'animation d'attaque) sur le canal des effets. */
  M.seFile = function (path) {
    if (!path || M.muted || !M.volumes.se) return;
    const src = seCache[path] || (seCache[path] = new Audio(url(path)));
    const el = src.cloneNode(); el.volume = vol('se');
    safePlay(el);
  };
  /** Joue un son d'aperçu sur un canal (réglage du volume). */
  M.preview = function (channel) {
    if (channel === 'se') { lastSe.confirm = 0; return M.se('confirm'); }
    if (channel === 'me') { const key = ['levelUp', 'victory', 'gameOver'].find(k => cfg[k]); if (key) M.me(key); }
  };

  // ---------- réglages du joueur ----------
  function apply() {
    if (bgmEl) bgmEl.volume = vol('music');
    if (meEl) meEl.volume = vol('me');
  }
  M.setVolume = function (channel, value) { M.volumes[channel] = clamp(value); persist(); apply(); };
  M.setMuted = function (on) { M.muted = !!on; persist(); apply(); };
  M.toggleMute = function () {
    M.setMuted(!M.muted);
    UI.toast(M.muted ? 'Son coupé (M)' : 'Son activé (M)');
  };

  M.state = () => ({ current, playing: !!(bgmEl && !bgmEl.paused), muted: M.muted, volumes: Object.assign({}, M.volumes), vol: { music: vol('music'), me: vol('me'), se: vol('se') } });
  root.Music = M;
})(self);
