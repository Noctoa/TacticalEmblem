/* Climat par acte : ambiance et effets tactiques facultatifs. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Weather = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const Factions = typeof module !== 'undefined' && module.exports ? require('./factions.js') : self.Factions;
  const playerSide = (u) => !!u && Factions.isPlayerSide(u.team);
  /** Unité venue d'un placement générique (ennemi, autre faction, allié générique) ; les anciennes unités ennemies sans placementId aussi. */
  const placed = (u) => !!u && (!!u.placementId || !Factions.isPlayerSide(u.team));
  const TYPES = [
    { value: 'none', label: 'Aucune' }, { value: 'fog', label: 'Brouillard' },
    { value: 'sand', label: 'Tempête de sable' }, { value: 'snow', label: 'Neige' },
    { value: 'rain', label: 'Pluie' }, { value: 'ash', label: 'Cendres' }
  ];
  /** Pluie (règle de Fire Emblem : The Blazing Blade) : seules les cases découvertes sans effet de terrain sont ralenties. */
  const INDOOR = new Set(['floor', 'bridge', 'gate', 'door', 'throne', 'pillar', 'stairs', 'house', 'village', 'fort', 'castle', 'wall', 'indoor']);
  const rainAffects = (terrain) => !terrain || (!INDOOR.has(terrain.id) && !(Number(terrain.avoid) || 0) && !(Number(terrain.def) || 0));
  const INTENSITIES = [{ value: '1', label: 'Légère' }, { value: '2', label: 'Modérée' }, { value: '3', label: 'Forte' }];
  function normalize(value) {
    const v = value && typeof value === 'object' ? value : {};
    return { type: TYPES.some(t => t.value === v.type) ? v.type : 'none',
      intensity: [1, 2, 3].includes(v.intensity) ? v.intensity : 2, direction: v.direction === 'left' ? 'left' : 'right',
      tactical: v.tactical === true };
  }
  function validate(value) {
    if (value === undefined) return [];
    if (!value || typeof value !== 'object' || Array.isArray(value)) return ['Météo : réglages invalides.'];
    const errors = [];
    if (!TYPES.some(t => t.value === value.type)) errors.push('Météo : type inconnu.');
    if (value.intensity !== undefined && ![1, 2, 3].includes(value.intensity)) errors.push('Météo : intensité attendue de 1 à 3.');
    if (value.direction !== undefined && !['left', 'right'].includes(value.direction)) errors.push('Météo : direction du vent invalide.');
    if (value.tactical !== undefined && typeof value.tactical !== 'boolean') errors.push('Météo : activation des effets tactiques invalide.');
    return errors;
  }
  function label(value) {
    const v = normalize(value), name = TYPES.find(t => t.value === v.type).label;
    return v.type === 'none' ? name : name + ' · ' + INTENSITIES[v.intensity - 1].label.toLowerCase();
  }
  /** Brouillard : au-delà de 5 cases (léger), 4 (modéré) ou 3 (fort) des unités de son camp, on ne voit plus rien (toujours actif). */
  const FOG_VISION = [5, 4, 3];
  function effects(value) {
    const v = normalize(value), active = v.tactical && v.type !== 'none';
    return { vision: v.type === 'fog' ? FOG_VISION[v.intensity - 1] : active && (v.type === 'sand' || v.type === 'ash') ? [6, 4, 3][v.intensity - 1]
        : active && v.type === 'rain' && v.intensity === 3 ? 5 : null,
      // brouillard : esquive + ; cendres : la visée est gênée (même effet : précision des attaques −5 par niveau)
      avoid: active && (v.type === 'fog' || v.type === 'ash') ? v.intensity * 5 : 0,
      movement: active && ['sand', 'snow', 'rain'].includes(v.type) ? v.intensity : 0, rain: active && v.type === 'rain' };
  }
  /** Coût en plus d'une case ; terrain : la pluie ne ralentit que le terrain découvert (forêts, montagnes, intérieur : non). */
  function movePenalty(value, moveType, terrain) {
    const e = effects(value), intensity = e.movement;
    if (!intensity || moveType === 'flier') return 0;
    if (e.rain) {
      if (terrain !== undefined && !rainAffects(terrain)) return 0;
      // légère : cavalerie +1 ; modérée (FE7) : à pied +1, cavalerie +2 ; forte : idem
      return intensity === 1 ? (moveType === 'horse' ? 1 : 0) : moveType === 'horse' ? 2 : 1;
    }
    return intensity === 1 ? (moveType === 'horse' ? 1 : 0) : intensity === 3 && moveType === 'horse' ? 2 : 1;
  }
  function describe(value) {
    const v = normalize(value), e = effects(v);
    if (v.type === 'fog' && !v.tactical) return `Vue partagée : ${e.vision} cases. Les ennemis hors de vue sont cachés.`;
    if (!v.tactical || v.type === 'none') return 'Ambiance visuelle uniquement.';
    const view = e.vision ? `Vue partagée : ${e.vision} cases. Les ennemis hors de vue sont cachés.` : '';
    if (v.type === 'ash') return `Les cendres gênent la visée : précision −${e.avoid} pour les deux camps. ${view}`;
    if (e.avoid) return `Esquive +${e.avoid} points pour les deux camps. ${view}`;
    if (e.rain) return (e.movement === 1 ? 'Terrain découvert (plaine, route…) : cavalerie, coût de chaque case +1.'
      : 'Terrain découvert (plaine, route…) : coût de chaque case +1 à pied, +2 pour la cavalerie (règle de Fire Emblem : The Blazing Blade).')
      + ' Forêts, montagnes, ponts et intérieurs inchangés ; volants inchangés.' + (view ? ' ' + view : '');
    const move = e.movement === 1 ? 'Cavalerie : coût de chaque case +1. Autres unités inchangées.' :
      `Unités au sol : coût de chaque case +1${e.movement === 3 ? ' (+2 pour la cavalerie)' : ''}. Volants inchangés ; terrains infranchissables conservés.`;
    return [view, move].filter(Boolean).join(' ');
  }
  function summary(value) {
    const e = effects(value), parts = [];
    if (e.avoid) parts.push(value && value.type === 'ash' ? `Préc −${e.avoid}` : `Esq +${e.avoid}`);
    if (e.rain) { parts.push(e.movement === 1 ? 'Découvert : cav. +1' : 'Découvert : +1 / cav. +2'); if (e.vision) parts.push(`Vue ${e.vision}`); return parts.join(' · '); }
    if (e.vision) parts.push(`Vue ${e.vision}`);
    if (e.movement) parts.push(e.movement === 1 ? 'Cavalerie : coût +1' : e.movement === 3 ? 'Sol : coût +1 / cav. +2' : 'Sol : coût +1');
    return parts.join(' · ') || 'Visuel';
  }

  function visibleTiles(value, units, team, width, height) {
    const radius = effects(value).vision;
    if (radius === null) return null; // null = carte entière, sans allouer une grille
    const visible = new Set();
    for (const u of units) {
      if (u.dead || u.hp <= 0 || Factions.hostile(u.team, team)) continue; // vision partagée par les camps qui ne se battent pas
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius + Math.abs(dy); dx <= radius - Math.abs(dy); dx++) {
        const x = u.x + dx, y = u.y + dy;
        if (x >= 0 && y >= 0 && x < width && y < height) visible.add(x + ',' + y);
      }
    }
    return visible;
  }
  function canSee(visible, unit) { return !!unit && (visible === null || visible.has(unit.x + ',' + unit.y)); }
  return { TYPES, INTENSITIES, FOG_VISION, normalize, validate, label, effects, movePenalty, describe, summary, visibleTiles, canSee };
});
