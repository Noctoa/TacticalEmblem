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
          { key: 'direction', label: 'Direction du vent', type: 'select', options: [{ value: 'right', label: 'Vers la droite' }, { value: 'left', label: 'Vers la gauche' }] },
          { key: 'tactical', label: 'Activer les effets tactiques du climat', type: 'checkbox' }
        ]),
        { type: 'custom', render: () => UI.h('p', { class: 'form-info', 'data-weather-description': true }, Weather.describe(model)) },
        { type: 'info', text: 'Les effets tactiques concernent les deux camps. Masquer l’animation dans les paramètres ne les annule pas. Les événements peuvent changer le climat en cours d’acte.' }
      ], model, { onChange: key => {
        if (api.beforeChange) api.beforeChange();
        model.intensity = Number(model.intensity);
        chapter.weather = Weather.normalize(model); Object.assign(model, chapter.weather);
        api.change(); if (key === 'type') render();
        else box.querySelector('[data-weather-description]').textContent = Weather.describe(model);
      } }));
    }
    render(); return box;
  }
  root.WeatherFields = { form };
})(self);
