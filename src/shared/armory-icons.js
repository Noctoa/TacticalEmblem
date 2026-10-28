/*
 * Icônes des armes et des objets (pixel art 16 × 16, planche src/renderer/img/items, tools/build_item_icons.py).
 * Une fiche d'arme ou d'objet y renvoie par son champ « image » : « item:<id> » (ex. item:iron-sword) ; sans image,
 * l'arme garde l'icône de son type et l'objet son symbole.
 *
 *   defaultImage(entry) → icône d'une arme / d'un objet de base d'après son nom (ou '')
 *   fill(db)            → donne leur icône aux armes et objets de base qui n'ont pas encore de champ « image »
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ArmoryIcons = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  // noms des armes et objets de base (projet d'exemple, pack « De la série Fire Emblem… ») → icône
  const NAMES = {
    'Épée de fer': 'iron-sword', 'Épée fine': 'slim-sword', 'Rapière': 'rapier', "Épée d'acier": 'steel-sword', "Épée d'argent": 'silver-sword',
    'Lame tueuse': 'killing-edge', 'Épée brave': 'brave-sword', 'Estoc anti-armure': 'armorslayer', 'Tueuse de cheval': 'ridersbane',
    'Lame du tonnerre': 'levin-sword', 'Lame du vent': 'wind-sword', 'Lame de feu': 'flame-sword', 'Lame runique': 'shadow-sword',
    'Épée courte': 'short-sword', 'Falchion': 'falchion', 'Tyrfing': 'tyrfing', 'Balmung': 'balmung', 'Mystletainn': 'mystletainn',
    'Lance de fer': 'iron-lance', 'Lance fine': 'slim-lance', "Lance d'acier": 'steel-lance', "Lance d'argent": 'silver-lance',
    'Lance tueuse': 'killer-lance', 'Lance brave': 'brave-lance', 'Javelot': 'javelin', 'Lance courte': 'short-lance', 'Épieu': 'long-lance',
    'Lance anti-cheval': 'knight-killer', 'Gungnir': 'gungnir', 'Gáe Bolg': 'gaebolg', 'Gae Bolg': 'gaebolg',
    'Hache de fer': 'iron-axe', "Hache d'acier": 'steel-axe', "Hache d'argent": 'silver-axe', 'Hache tueuse': 'killer-axe',
    'Hache brave': 'brave-axe', 'Hachette': 'hand-axe', 'Marteau': 'hammer', 'Hallebarde': 'pole-axe',
    'Arc de fer': 'iron-bow', 'Arc court': 'short-bow', "Arc d'acier": 'steel-bow', "Arc d'argent": 'silver-bow', 'Arc tueur': 'killer-bow',
    'Arc brave': 'brave-bow', 'Arc long': 'long-bow', 'Baliste': 'arrowspate', 'Parthia': 'parthia',
    'Feu': 'fire', 'Tonnerre': 'thunder', 'Vent': 'wind', 'Elfeu': 'elfire', 'Bolganone': 'bolganone', 'Fimbulvetr': 'blizzard',
    'Excalibur': 'excalibur', 'Météore': 'meteor', 'Forseti': 'forseti', 'Mjöllnir': 'mjolnir', 'Mjölnir': 'mjolnir', 'Valflame': 'valflame',
    'Thoron': 'thoron', 'Éclair': 'lightning', 'Lueur': 'lightning-2', 'Divine': 'starlight', 'Aura': 'aura', 'Nosferatu': 'nosferatu',
    'Naga': 'naga', 'Flux': 'hel', 'Fenrir': 'fenrir', 'Miasme': 'poison',
    'Soin': 'heal', 'Guérison': 'mend', 'Récupération': 'recover', 'Physique': 'physic',
    'Potion': 'vulnerary', 'Élixir': 'pure-water', 'Robe séraphique': 'seraph-robe', 'Bague de force': 'power-ring', 'Livre secret': 'secret-book',
    'Aile vive': 'speed-ring', 'Icône de la déesse': 'goddess-icon', 'Bouclier draconique': 'dracoshield', 'Talisman': 'talisman', 'Bottes': 'boots',
    'Sceau de promotion': 'knight-seal', 'Emblème du héros': 'hero-crest', 'Bouclier de chevalier': 'knight-crest', 'Guide céleste': 'magic-ring',
    'Rouleau de la guilde': 'manual', 'Clé de coffre': 'chest-key', 'Clé de porte': 'door-key', 'Passe-partout': 'silver-key'
  };
  const BY_NAME = {};
  for (const [n, id] of Object.entries(NAMES)) BY_NAME[fold(n)] = id;

  const isImage = (img) => /^item:[a-z0-9-]+$/.test(String(img || ''));
  const defaultImage = (e) => { const id = BY_NAME[fold(e && e.name)]; return id ? 'item:' + id : ''; };
  /** Icônes des armes et objets de base sans champ « image » (projet d'avant les icônes). Renvoie le nombre ajouté. */
  function fill(db) {
    let n = 0;
    for (const list of [(db && db.weapons) || [], (db && db.items) || []]) {
      for (const e of list) {
        if (e.image !== undefined) continue;
        const im = defaultImage(e);
        if (im) { e.image = im; n++; }
      }
    }
    return n;
  }
  return { NAMES, isImage, defaultImage, fill, fold };
});
