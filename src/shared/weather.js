/* Climat par acte : ambiance et effets tactiques facultatifs. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Weather = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const TYPES = [
    { value: 'none', label: 'Aucune' }, { value: 'fog', label: 'Brouillard' },
    { value: 'sand', label: 'Tempête de sable' }, { value: 'snow', label: 'Neige' }
  ];
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
  function effects(value) {
    const v = normalize(value), active = v.tactical && v.type !== 'none';
    return { vision: active && ['fog', 'sand'].includes(v.type) ? [6, 4, 3][v.intensity - 1] : null,
      avoid: active && v.type === 'fog' ? v.intensity * 5 : 0,
      movement: active && ['sand', 'snow'].includes(v.type) ? v.intensity : 0 };
  }
  function movePenalty(value, moveType) {
    const intensity = effects(value).movement;
    if (!intensity || moveType === 'flier') return 0;
    return intensity === 1 ? (moveType === 'horse' ? 1 : 0) : intensity === 3 && moveType === 'horse' ? 2 : 1;
  }
  function describe(value) {
    const v = normalize(value), e = effects(v);
    if (!v.tactical || v.type === 'none') return 'Ambiance visuelle uniquement.';
    const view = e.vision ? `Vue partagée : ${e.vision} cases. Les ennemis hors de vue sont cachés.` : '';
    if (e.avoid) return `Esquive +${e.avoid} points pour les deux camps. ${view}`;
    const move = e.movement === 1 ? 'Cavalerie : coût de chaque case +1. Autres unités inchangées.' :
      `Unités au sol : coût de chaque case +1${e.movement === 3 ? ' (+2 pour la cavalerie)' : ''}. Volants inchangés ; terrains infranchissables conservés.`;
    return [view, move].filter(Boolean).join(' ');
  }
  function summary(value) {
    const e = effects(value), parts = [];
    if (e.avoid) parts.push(`Esq +${e.avoid}`);
    if (e.vision) parts.push(`Vue ${e.vision}`);
    if (e.movement) parts.push(e.movement === 1 ? 'Cavalerie : coût +1' : e.movement === 3 ? 'Sol : coût +1 / cav. +2' : 'Sol : coût +1');
    return parts.join(' · ') || 'Visuel';
  }
  const side = team => team === 'enemy' ? 'enemy' : 'player';
  function visibleTiles(value, units, team, width, height) {
    const radius = effects(value).vision;
    if (radius === null) return null; // null = carte entière, sans allouer une grille
    const visible = new Set();
    for (const u of units) {
      if (u.dead || u.hp <= 0 || side(u.team) !== side(team)) continue;
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius + Math.abs(dy); dx <= radius - Math.abs(dy); dx++) {
        const x = u.x + dx, y = u.y + dy;
        if (x >= 0 && y >= 0 && x < width && y < height) visible.add(x + ',' + y);
      }
    }
    return visible;
  }
  function canSee(visible, unit) { return !!unit && (visible === null || visible.has(unit.x + ',' + unit.y)); }
  return { TYPES, INTENSITIES, normalize, validate, label, effects, movePenalty, describe, summary, visibleTiles, canSee };
});
