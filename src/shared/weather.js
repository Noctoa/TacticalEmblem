/* Ambiances visuelles par acte ; aucune incidence sur les règles ou la visibilité des unités. */
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
      intensity: [1, 2, 3].includes(v.intensity) ? v.intensity : 2, direction: v.direction === 'left' ? 'left' : 'right' };
  }
  function validate(value) {
    if (value === undefined) return [];
    if (!value || typeof value !== 'object' || Array.isArray(value)) return ['Météo : réglages invalides.'];
    const errors = [];
    if (!TYPES.some(t => t.value === value.type)) errors.push('Météo : type inconnu.');
    if (value.intensity !== undefined && ![1, 2, 3].includes(value.intensity)) errors.push('Météo : intensité attendue de 1 à 3.');
    if (value.direction !== undefined && !['left', 'right'].includes(value.direction)) errors.push('Météo : direction du vent invalide.');
    return errors;
  }
  function label(value) {
    const v = normalize(value), name = TYPES.find(t => t.value === v.type).label;
    return v.type === 'none' ? name : name + ' · ' + INTENSITIES[v.intensity - 1].label.toLowerCase();
  }
  return { TYPES, INTENSITIES, normalize, validate, label };
});
