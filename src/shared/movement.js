/* Aptitudes de déplacement dérivées de la classe, indépendantes du camp et du pillage. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Movement = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const classCrossesWater = cls => typeof cls?.crossWater === 'boolean' ? cls.crossWater : /^(fe\d*_)?(brigand|bandit|pirate)$/.test(cls?.id || '');
  const crossesWater = unit => !!unit && (typeof unit.crossWater === 'boolean' ? unit.crossWater : classCrossesWater({ id: unit.classId }));
  return { classCrossesWater, crossesWater };
});
