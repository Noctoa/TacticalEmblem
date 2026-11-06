/*
 * Jeu compilé (Fichier › Compiler le jeu…) : remplace l'API tf.* de l'éditeur quand le jeu tourne seul
 * (navigateur, Android, ou .exe Windows sans l'éditeur).
 *
 * - le projet est embarqué dans game/game-data.js (window.__GAME__ = { name, project, plugins, version }) :
 *   pas de lecture de fichiers, ça marche aussi en file:// ;
 * - les ressources sont dans game/ (même arborescence que le dossier du projet) ;
 * - les sauvegardes (5 emplacements) vont dans le stockage du navigateur / de l'application (localStorage) ;
 * - mode « release » : pas de menu Debug, « Quitter » revient à l'écran titre (navigateur) ou ferme l'application.
 */
(function () {
  'use strict';
  const GAME = window.__GAME__;
  if (!GAME || (window.tf && !window.tf.__shim)) return; // dans l'éditeur, l'API Electron reste
  const SLOTS = 5;
  const key = (slot) => `game:${GAME.id || GAME.name}:slot-${slot}`;
  const baseUrl = new URL('../../game/', location.href).href;
  const read = (slot) => {
    let raw = null;
    try { raw = localStorage.getItem(key(slot)); } catch (e) { throw new Error('Stockage indisponible : les sauvegardes sont désactivées dans ce navigateur.'); }
    if (!raw) return null;
    const s = JSON.parse(raw);
    return self.Campaign ? Campaign.validate(s) : s;
  };
  const checkSlot = (slot) => { const n = Number(slot); if (!Number.isInteger(n) || n < 1 || n > SLOTS) throw new Error('Emplacement de sauvegarde invalide : ' + slot); return n; };
  function list() {
    const out = [];
    for (let n = 1; n <= SLOTS; n++) {
      const e = { slot: n, exists: false };
      try {
        const s = read(n);
        if (s) Object.assign(e, { exists: true, mtime: Date.parse((s.info && s.info.savedAt) || 0) || 0, info: s.info || {}, chapterId: s.chapterId, mode: s.campaign.mode, gold: s.campaign.gold || 0 });
      } catch (err) { e.exists = true; e.error = err.message; }
      out.push(e);
    }
    return out;
  }
  const api = {
    __shim: true,
    loadProject: async () => ({ dir: 'game', baseUrl, project: JSON.parse(JSON.stringify(GAME.project)) }),
    installedPlugins: async () => (GAME.plugins || []).slice(),
    listSaves: async () => list(),
    loadCampaign: async (dir, slot) => {
      if (slot === undefined || slot === null) {
        const latest = list().filter(s => s.exists && !s.error).sort((a, b) => b.mtime - a.mtime)[0];
        return latest ? Object.assign(read(latest.slot), { slot: latest.slot }) : null;
      }
      const n = checkSlot(slot), s = read(n);
      return s ? Object.assign(s, { slot: n }) : null;
    },
    saveCampaign: async (dir, value, slot) => {
      if (self.Campaign) Campaign.validate(value);
      const n = checkSlot(slot === undefined || slot === null ? 1 : slot);
      const data = Object.assign({}, value, { info: Object.assign({}, value.info || {}, { savedAt: new Date().toISOString() }) });
      delete data.slot;
      try { localStorage.setItem(key(n), JSON.stringify(data)); } catch (e) { throw new Error('Sauvegarde impossible : stockage plein ou indisponible.'); }
      return n;
    },
    removeSave: async (dir, slot) => { try { localStorage.removeItem(key(checkSlot(slot))); } catch (e) { /* rien */ } return true; }
  };
  window.tf = Object.assign(window.tf || {}, api);
  window.__RELEASE__ = true;
  document.title = GAME.name || document.title;
  // « Quitter » : application Android → ferme l'activité ; Electron → ferme la fenêtre ; navigateur → retour au titre
  const nativeClose = window.close.bind(window);
  window.close = () => {
    if (window.AndroidGame && window.AndroidGame.quit) return window.AndroidGame.quit();
    if (GAME.platform === 'windows') return nativeClose();
    location.reload();
  };
})();
