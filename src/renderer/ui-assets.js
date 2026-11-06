/*
 * Ressources graphiques de l'interface, modifiables dans le projet (comme dans RPG Maker) :
 * les images du moteur (src/renderer/img : fenêtres, curseurs, bandeaux de phase, interface de combat, chiffres,
 * icônes, météo…) sont copiées dans <projet>/ressources/interface/ (même arborescence, sans img/).
 * Une image modifiée dans le projet remplace celle du moteur ; supprimée, elle est recopiée à la prochaine ouverture.
 *
 *   UIAssets.init(baseUrl, files) — files : chemins présents dans ressources/interface (ex. 'ui/window.png')
 *   UIAsset('img/ui/arrow.png')   — adresse à utiliser (celle du projet si elle existe, sinon celle du moteur)
 *   Les feuilles de style (url(img/…)) sont réécrites à l'init.
 */
(function (root) {
  'use strict';
  let base = null, files = new Set();
  const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
  /** 'img/ui/arrow.png' → adresse dans le projet si l'image y est, sinon le chemin d'origine. */
  function url(rel) {
    const m = /^img\/(.+)$/.exec(String(rel || ''));
    return base && m && files.has(m[1]) ? base + 'ressources/interface/' + enc(m[1]) : rel;
  }
  /** Réécrit les url(img/…) des feuilles de style chargées depuis src/renderer. */
  function applyCss() {
    if (!base || !files.size || typeof document === 'undefined') return 0;
    const renderer = new URL('./', document.baseURI).href;
    let n = 0;
    const fix = (value, href) => value.replace(/url\((['"]?)([^'")]+)\1\)/g, (all, q, u) => {
      let abs; try { abs = new URL(u, href || document.baseURI).href; } catch (e) { return all; }
      if (!abs.startsWith(renderer)) return all;
      const rel = decodeURIComponent(abs.slice(renderer.length).split(/[?#]/)[0]), to = url(rel);
      if (to === rel) return all;
      n++; return `url("${to}")`;
    });
    const walk = (rules, href) => {
      for (const r of rules) {
        if (r.cssRules && !r.style) { walk(r.cssRules, href); continue; }
        if (!r.style) continue;
        for (let i = 0; i < r.style.length; i++) {
          const prop = r.style[i], v = r.style.getPropertyValue(prop);
          if (!v || v.indexOf('url(') < 0) continue;
          const nv = fix(v, href);
          if (nv !== v) r.style.setProperty(prop, nv, r.style.getPropertyPriority(prop));
        }
        if (r.cssRules) walk(r.cssRules, href);
      }
    };
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      walk(rules, sheet.href);
    }
    return n;
  }
  function init(baseUrl, list) {
    base = baseUrl || null; files = new Set(list || []);
    const n = applyCss();
    if (root.dispatchEvent && typeof CustomEvent === 'function') root.dispatchEvent(new CustomEvent('ui-assets', { detail: { files: files.size, css: n } }));
    return n;
  }
  root.UIAssets = { init, url, applyCss, has: (rel) => url(rel) !== rel, files: () => [...files] };
  root.UIAsset = url;
})(self);
