/*
 * Exemple de plugin script pour Tactical Emblem (l'ancien nom de l'API, TacticsForge, marche aussi).
 *
 * TacticalEmblem.register(id, { editor(api), game(api) })  : appelé une fois dans l'éditeur / au lancement du jeu
 * TacticalEmblem.on(événement, (e, api) => ...)            : événements du jeu
 *   game:start, chapter:start { chapter }, turn:start { phase, turn },
 *   combat:end { attacker, defender, result }, unit:defeated { unit }, chapter:victory { chapter }
 * api : { where, project, db, state (le jeu en cours), toast(texte, 'error'?) }
 */
(function () {
  'use strict';
  const ID = 'exemple-annonce-tours';
  let vaincus = 0;

  TacticalEmblem.register(ID, {
    game(api) { api.toast('Plugin « Annonce des tours » actif'); }
  });

  TacticalEmblem.on('chapter:start', () => { vaincus = 0; });
  TacticalEmblem.on('turn:start', (e, api) => {
    if (e.phase === 'player') api.toast(`Tour ${e.turn} — à toi de jouer !`);
  });
  TacticalEmblem.on('unit:defeated', (e) => {
    if (e.unit.team === 'enemy') vaincus++;
  });
  TacticalEmblem.on('chapter:victory', (e, api) => {
    api.toast(`${vaincus} ennemi(s) vaincu(s) dans cet acte`);
  });
})();
