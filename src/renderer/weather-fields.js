(function (root) {
  'use strict';
  function form(chapter, api) {
    const box = UI.h('div', { 'data-weather-fields': true });
    const model = Weather.normalize(chapter.weather);
    function render() {
      box.replaceChildren(UI.form([
        { key: 'type', label: 'Météo', type: 'select', options: Weather.TYPES },
        ...(model.type === 'none' ? [] : [
          { key: 'intensity', label: 'Intensité', type: 'select', options: Weather.INTENSITIES },
          { key: 'direction', label: 'Direction du vent', type: 'select', options: [{ value: 'right', label: 'Vers la droite' }, { value: 'left', label: 'Vers la gauche' }] }
        ]),
        { type: 'info', text: 'Ambiance visuelle sur la carte et en combat. Ne cache aucune unité et ne change ni déplacements, ni statistiques. Les événements peuvent changer la météo en cours d’acte.' }
      ], model, { onChange: key => {
        if (api.beforeChange) api.beforeChange();
        model.intensity = Number(model.intensity);
        chapter.weather = Weather.normalize(model); Object.assign(model, chapter.weather);
        api.change(); if (key === 'type') render();
      } }));
    }
    render(); return box;
  }
  root.WeatherFields = { form };
})(self);
