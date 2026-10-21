'use strict';
/*
 * Plugin de test fabriqué à partir des ressources de base (les plugins de ressources FE ne sont plus fournis
 * dans le dépôt) : une animation et un sprite de map pour la classe Archer, un portrait et une animation pour
 * Roy (pack de personnages FE6), un fond de combat pour la plaine.
 */
const fs = require('fs'), os = require('os'), path = require('path');
const DEF = path.join(__dirname, '..', '..', 'assets', 'default', 'ressources');

function makePlugin(dir) {
  dir = dir || path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-fixture-')), 'pack-test');
  const res = path.join(dir, 'ressources');
  const cp = (from, to) => { fs.mkdirSync(path.dirname(path.join(res, to)), { recursive: true }); fs.copyFileSync(path.join(DEF, from), path.join(res, to)); };
  cp('personnages/Lyn/combat.png', 'personnages/Testeur/combat_Arc.png');
  cp('personnages/Lyn/combat.json', 'personnages/Testeur/combat_Arc.json');
  cp('personnages/Lyn/map_Lord.png', 'personnages/Testeur/map_Arc.png');
  cp('personnages/Lyn/map_Lord.json', 'personnages/Testeur/map_Arc.json');
  cp('personnages/Eliwood/portrait.png', 'personnages/RoyTest/portrait.png');
  cp('personnages/Eliwood/combat.png', 'personnages/RoyTest/combat.png');
  cp('personnages/Eliwood/combat.json', 'personnages/RoyTest/combat.json');
  cp('tilesets/village.png', 'fonds-combat/test-plaine.png');
  const P = 'ressources/personnages/';
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({
    id: 'pack-test', name: 'Pack de test', version: '1.0.0', kind: 'ressources', description: 'Plugin de ressources fabriqué pour les tests.',
    ressources: 'ressources',
    links: {
      characters: { 'fe6:Roy': { folder: 'RoyTest', portrait: P + 'RoyTest/portrait.png', battler: P + 'RoyTest/combat' } },
      classes: { archer: { folder: 'Testeur', battler: P + 'Testeur/combat_Arc', mapSprite: P + 'Testeur/map_Arc' } },
      battlebacks: { plain: 'ressources/fonds-combat/test-plaine.png' }
    },
    scripts: []
  }, null, 1));
  return dir;
}
module.exports = { makePlugin };
