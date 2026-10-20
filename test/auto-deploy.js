/*
 * Pour les scénarios qui ne testent pas les préparatifs : valide automatiquement l'écran
 * « Préparatifs et déploiement » avec la sélection par défaut, comme si on cliquait sur Commencer.
 * À charger en tête d'un scénario : require('./auto-deploy.js');
 */
'use strict';
const { app } = require('electron');
const SCRIPT = `setInterval(() => {
  if (!window.PlaytestState || PlaytestState.mode !== 'preparation') return;
  const b = document.querySelector('[data-deploy-start]:not([disabled])'); if (b) b.click();
}, 150); true`;
app.on('web-contents-created', (e, wc) => wc.on('did-finish-load', () => wc.executeJavaScript(SCRIPT, true).catch(() => {})));
