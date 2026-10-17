/* Musique du playtest : BGM par phase (fondu enchaîné) et jingles (ME) qui coupent la BGM le temps de jouer. */
(function (root) {
  'use strict';
  let baseUrl = '', cfg = {}, current = '', bgmEl = null, meEl = null, fadeTimer = null;
  const M = { muted: false };
  try { M.muted = localStorage.getItem('tf-muted') === '1'; } catch (e) { /* stockage indisponible */ }

  const vol = () => (M.muted ? 0 : Math.max(0, Math.min(1, cfg.volume === undefined ? 0.6 : Number(cfg.volume))));
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

  /** Joue la BGM associée à une clé de configuration (playerPhase, allyPhase, enemyPhase…). */
  M.bgm = function (keyName) {
    const path = cfg[keyName] || '';
    if (path === current && bgmEl) { if (bgmEl.paused && !(meEl && !meEl.paused)) safePlay(bgmEl); return; }
    current = path;
    const start = () => {
      if (bgmEl) { bgmEl.pause(); bgmEl = null; }
      if (!path) return;
      bgmEl = new Audio(url(path)); bgmEl.loop = true; bgmEl.volume = 0;
      if (meEl && !meEl.paused) return; // reprendra après le jingle
      safePlay(bgmEl); fade(bgmEl, vol(), 600);
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
    meEl = new Audio(url(path)); meEl.volume = vol();
    meEl.onended = () => { if (bgmEl && opts.resume !== false) { bgmEl.volume = 0; safePlay(bgmEl); fade(bgmEl, vol(), 500); } };
    safePlay(meEl);
  };

  M.victory = function () {
    if (cfg.victory) { M.me('victory', { resume: false }); return; }
    if (bgmEl) fade(bgmEl, 0, 1200, () => { if (bgmEl) bgmEl.pause(); });
  };

  M.toggleMute = function () {
    M.muted = !M.muted;
    try { localStorage.setItem('tf-muted', M.muted ? '1' : '0'); } catch (e) { /* ignoré */ }
    if (bgmEl) bgmEl.volume = vol();
    if (meEl) meEl.volume = vol();
    UI.toast(M.muted ? 'Musique coupée (M)' : 'Musique activée (M)');
  };

  M.state = () => ({ current, playing: !!(bgmEl && !bgmEl.paused), muted: M.muted });
  root.Music = M;
})(self);
