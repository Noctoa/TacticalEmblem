/*
 * Générateur de personnage (d'après « FE Character Creator » de TheFlyingMinotaur) : calcul pur, sans DOM.
 *
 * Un personnage généré est décrit par une recette :
 *   { hair, face, armor, token,                      identifiants des pièces (img/generator/parts.js), '' = aucune
 *     colors: { skin, hair, eyes, metal, trim, cloth, leather }   couleurs '#rrggbb' (eyes '' = comme les cheveux)
 *     ramps: { hair | eyes | metal | trim | cloth | leather: [clair, base, ombre], skin: [5 nuances] }   dégradés exacts (facultatif)
 *     map: null | { colors, ramps }   couleurs propres au sprite de map (null = celles du portrait)
 *     combat: null | { colors, ramps }   couleurs propres au sprite de combat (null = celles du portrait) : peau, cheveux,
 *                                        métal, ornements et cuir de son animation (recolorBattler) ; son tissu donne la
 *                                        tenue (couleurs d'équipe) de cette animation ou de celle de la classe
 *     offsets: { hair: [dx, dy], face: [dx, dy], armor: [dx, dy] }   décalage de chaque pièce en pixels
 *     sprite: '' | id }   sprite de map animé tiré de la bibliothèque FE (img/generator/sprites.js) ; '' = la figurine
 *
 * Les pièces sont « indexées » : la composante rouge / 10 d'un pixel donne la teinte (voir SHADES). La
 * composition superpose cheveux arrière, tenue, visage puis cheveux sur 96 × 96, recolorés avec la palette.
 * On en tire un face set 128 × 112 (portrait 96 × 80, mini-portrait 32 × 32) et un sprite de map
 * (figurine 64 × 64 animée : respiration, pas sautillés, miroir vers la droite).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CharGen = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SIZE = 96, TOKEN = 64;
  const LAYERS = ['hairb', 'armor', 'face', 'hair']; // ordre de dessin
  // nuanciers détaillés (planches « Hair by Blade » et « Dark & Tan Skin Tone Examples », compilées par Blade, corps par AK) :
  // cheveux = 225 dégradés de 3 nuances (clair, base, ombre), 37 + 8 colonnes de 5, proposés aussi pour les yeux, le métal,
  // les ornements, le tissu et le cuir ; peau = 34 dégradés de 5 nuances.
  const unpack = (s) => s.split(' ').map(r => r.split(',').map(c => '#' + c));
  const HAIR_RAMPS = unpack('e89088,b0606c,78394c f08878,c8585c,7c3444 ec3848,9c2c44,5c283c f8404c,ac3444,682c3c f83830,c0241c,781c24 d04c38,a03040,6c2034 fc8864,c45840,7c342c f88c38,cc6030,8c4c2c fc9450,c86844,804028 d8a050,ac6c44,68443c f4e498,d4a058,805c44 f4f8d0,e0c090,a47858 ecd088,c89050,8c5c30 e3f383,90b45c,587544 d0e36c,90a448,557045 98c35c,6c8844,485530 cfdb90,8cac64,496954 c3f180,78a858,416d35 a7f794,6cc084,3d7959 8bf3b3,50a87c,396551 8ff3d3,58c098,2d7160 40e7c7,30a0a8,305275 5ce6eb,3c98bc,445281 9bdfeb,7498c0,495e85 4ca7d7,406ca8,484175 448fdf,3c60ac,343d79 6b7b9f,485478,403d61 5f7fee,3c58ac,31457a 97afeb,6b78c7,51468e abaee6,907cbc,654e86 ba9ef6,946cc0,66467e c6aae3,9880c7,6a5a8e ea9ef6,ac68bc,734687 e7929f,cb6078,963252 f29296,cf596c,8f364a fba6b3,f76d9c,ab3f6e e563a6,ad356d,6c3156 d8847c,a45058,6c3440 f86860,ac404c,6c2c30 e02c44,90283c,5c2434 f03848,9c3040,642438 f8302c,bc1c10,741820 dc3c34,943844,5c2440 f07048,b44830,743420 f48424,c4602c,804428 f8ac60,c47440,8c4c2c cc9448,9c603c,603834 e8d888,c09050,785840 f4f8bc,e0c088,9c7450 e4d86c,c09844,8c5c30 b4e46c,5cac64,3c6944 b4cb54,788c44,505c44 8ca458,5c7040,40482c c3cb78,809854,3d6148 8fc36c,488c50,25513c 80d78c,589c80,356559 70db97,3c946c,2c6149 60dfbb,349c7c,1c615d 34d7b7,2c8894,304265 48dfeb,3494ac,3c4a79 7fc7e3,6484b4,455981 3c93c7,386098,403969 406fcf,344890,303561 4c6793,404870,383551 4c63d3,304494,303962 7393df,505cb4,403481 938fd6,745c9c,4d4172 ab7fea,8858bc,59356e ae87da,7860a4,5a3d6e ca83de,985ca4,6a3e76 e67b93,cb5870,873a4b e28e8b,bf5564,7f3246 f696a7,eb5d88,a03b62 dd539a,a13565,642d52 d8646c,ac4450,703038 f06060,b43848,6c2834 d02838,842034,582030 dc2c3c,882840,582438 f42c24,b41810,6c141c e83c38,9c3028,68201c ec6838,9c4428,6c3014 f88028,c85624,883a2a f0b058,b07838,6c4430 c0803c,905434,58302c dcc484,ac7c50,74503c f0f8bc,d8c078,986d48 e8d854,c8a048,9c6830 b0d758,709840,546430 a4b448,608048,385034 7ca74c,506c38,4c4430 a4b35c,607c48,355144 64a759,407048,305034 68bb90,388064,2c4950 50c784,348860,2c5945 50d7ab,34907c,1c4d59 30bfa3,28707c,303959 34c3cb,307ca4,383e69 68bbcf,5078a4,394971 3481af,345890,403961 44579b,403c68,302955 4c5777,3c405c,2b2e42 385ba7,303c6c,34314d 677fee,504db8,37307a 7363af,5c4090,493169 8b63d6,7444a0,4d2d62 9367ab,68447c,493165 b66bce,884894,62316a da6b97,a8486c,763561 d6727b,a0455c,672e3e f2728f,d04570,883252 d1478a,942d59,60254a d45870,9c3c50,6c2c44 e84c54,9c3040,642830 c02034,842034,541c2c d42434,90243c,582038 f0241c,ac140c,6c1018 dc3034,842834,581c2c e84824,a8341c,80241c ec6424,a84828,703424 e89c4c,a46830,684028 a86834,78442c,4c2824 d0b470,a07448,6c4c3c e4dca8,c4a864,846448 d8dc60,b4983c,805c24 a8d048,5c9840,386830 809434,50683c,304024 749838,486034,443c30 748440,405c38,284044 589b48,346838,30482c 449b64,386c50,284534 34bb68,287c50,245540 40af94,347484,30495d 2ca387,246470,3c3155 2c9bab,24607c,343159 489bb3,346488,383d61 2877a7,3c4c88,403565 3853ab,343880,28255d 405373,343c5c,252b42 34488b,2c3461,1f2545 5b62d2,443b8c,2c2862 634493,4c3074,352455 7b4fc6,603885,452552 834fa3,5c3c80,492d61 a64fbe,783c84,562d5e be5b8f,983d83,6e3152 ce5773,8d3c58,663141 ed5f83,c33964,702d4a c1377b,892851,5b2149 bc3c58,84283c,582038 dc3848,982c38,5c2028 b01830,741c34,4c182c c42030,802434,502038 ec1c18,a41008,601018 e43c28,ac2834,6c2834 ec542c,b42c20,801c20 e85c1c,ac401c,602c1c d08838,986030,684028 9c6030,6c402c,442424 c09c50,886440,5c4030 e0c490,b49058,886040 e0e758,b49c38,846424 78c040,4e8524,404c20 647830,445024,383020 607428,385028,383420 6c7834,385830,283c40 548f40,386440,304434 407f4c,2c5c4c,283940 30a360,287450,1c493c 3cbb84,2e8070,244960 288f80,205464,173c48 208797,24506c,302d51 34879b,305878,3c3959 206f9b,344480,402d53 344ca7,303874,302859 344c6c,303454,22253c 2c447b,342c58,251f3f 544fc2,3b3281,2f235a 634087,443464,302548 6744ab,4c3870,362850 7347ba,603884,452962 9b40aa,703878,52294a a64783,843874,552c4d c24767,90344d,5b293d e54f77,ac2d59,642d45 b13076,71284d,4b1d42 f6f8ee,ccc4c0,949494 f8ecec,c8b8bc,94888c d8d0d0,a894a4,6c5864 846c70,5c4850,443038 787084,544c64,44384c 9c5c4c,744844,583438 b47c40,885c3c,64443c d8b49c,a47c70,643c4c f4f4f8,c0bcc4,888084 f0ecf0,c4bcc0,807474 d0c0c8,988494,604c58 745c64,58404c,3f2e36 6b6474,484458,383044 ac6448,7c4c44,5e383c ac784c,805448,603c40 c49c80,84645c,58384c f0f0e8,c4c0c0,848088 fcf4f0,c4bcac,7c746c c0b0b8,847484,50404c 6c5864,543c4c,3c2b36 645c6c,4c4058,362e3f 9c5c4c,744844,583438 986c44,744c34,58342c a07864,6c5048,503444 dcdcd4,a0a8a4,6c6c70 dcd4d8,a09ca4,70686c a898a4,6c5c68,483444 7c6c7c,5c4c5c,403444 544c64,443450,302539 884c3c,60383c,4c2c30 885c44,604038,4c3034 8c6854,5c403c,482838 d0ccc4,90948c,646060 d8d0c8,949088,64605c a09098,645060,483945 584858,403440,2e252e 544460,443048,302233 784434,5c3438,48282c 785038,5c3c34,482c28 805c48,583c38,402430');
  const HAIR_LAYOUT = { columns: [37, 8], rows: 5 };
  // peau : du plus clair au plus foncé (luminance moyenne des 5 nuances), doublons retirés
  const lum = (c) => { const v = rgb(c); return 0.3 * v[0] + 0.59 * v[1] + 0.11 * v[2]; };
  const SKIN_RAMPS = unpack('f8d088,e89858,b87848,886038,604848 e8b070,c08048,a86840,805840,604840 d09058,b87040,985828,704028,503020 e3a873,b88868,a36b5b,81535a,603c48 f8cd9c,de9c6a,a86840,805840,604840 fad085,e8a656,bf823d,8f592a,604848 f8de8b,eeac5a,cd7b4a,885a41,604848 d8a058,c07840,985838,784830,583828 f5c776,e08547,a55f3a,785033,4d3738 a87858,986040,784038,583030,403028 f8d088,e89850,b87848,886038,604848 d5a56d,bb7c53,9a6143,754d3a,513b3d f7cb82,e59454,b47446,865c35,5c4444 b08157,906552,7d4f46,633f46,493637 f7d79e,eba464,c17d4a,8a6139,5d4343 f8de8b,eeac5a,cd7b4a,885a41,604848 e4a874,bc8468,9c6054,7c4c54,603c48 e2ae75,b8886d,a16c5d,7f5359,5f4747 f5bd73,e08b4a,a86a41,835229,4d3738 e8c088,e09860,b07840,805840,584040 fad385,eca55e,c08045,936142,56413f f8c089,dd9564,c1774a,8a5548,533e3e f8f8b0,f8c870,e09058,987048,604848 f8f8b8,f8d868,f0a850,987048,604848 f8c060,e09838,c07830,986038,604038 ffe19a,f4ba6b,d98857,9c7757,715757 f8f8b8,f8d870,e89850,987048,604848 f8f0d8,f8c888,e89858,987048,604848 f8f8c8,f8c880,e89860,987048,604848 f8f0e8,f0c898,e8a078,987058,604848 f8f0d0,f0d0a8,f8a878,b87050,705048 f8e8c0,f8c090,e88c58,986848,604848 bc8658,906552,7d4f46,633f46,483432 c28a5a,9e7054,885648,664640,4e363a c8966c,ac7c64,8c5c4c,704a3e,563436')
    .filter((r, i, all) => all.findIndex(o => o.join() === r.join()) === i)
    .sort((a, b) => b.reduce((n, c) => n + lum(c), 0) - a.reduce((n, c) => n + lum(c), 0));
  const GROUPS = [
    { id: 'skin', label: 'Peau' }, { id: 'hair', label: 'Cheveux' }, { id: 'eyes', label: 'Yeux', optional: true }, { id: 'metal', label: 'Métal' },
    { id: 'trim', label: 'Ornements' }, { id: 'cloth', label: 'Tissu' }, { id: 'leather', label: 'Cuir' }
  ];
  const DEFAULT_COLORS = { skin: '#c08c6e', hair: '#403219', eyes: '', metal: '#646464', trim: '#f7ad52', cloth: '#525273', leather: '#946442' };
  // nuancier proposé pour chaque teinte (le sélecteur de couleur reste libre)
  const SWATCHES = {
    skin: ['#f8d8b8', '#f0c090', '#e0a878', '#c08c6e', '#a87050', '#8a5a3c', '#6a4028', '#4a2c1c'],
    hair: ['#f0e0a0', '#e8b848', '#c07830', '#a03018', '#d84830', '#403219', '#202028', '#e8e8f0', '#9090a0', '#5080d8', '#48a868', '#a058c8', '#f088b8'],
    eyes: ['#3868c8', '#30a0d8', '#48a860', '#8ab838', '#a87038', '#603820', '#c03028', '#e0a020', '#8048c0', '#d060a8', '#909aa8', '#282830'],
    metal: ['#c8c8d0', '#909098', '#646464', '#404048', '#c8a860', '#806040'],
    trim: ['#f7ad52', '#f0d878', '#e8e8f0', '#d84830', '#48a868', '#5080d8', '#a058c8'],
    cloth: ['#525273', '#3058b0', '#2880c8', '#b03030', '#2f7d4f', '#6a3a98', '#d8c8a0', '#383838', '#e8e8e8', '#c86818'],
    leather: ['#946442', '#6a4428', '#c89060', '#403028', '#808060']
  };
  // composante rouge / 10 → teinte : [groupe, nuance] (nuance : -1 plus clair, 0 base, n plus sombre n fois)
  const SHADES = [['outline', 0], ['hair', -1], ['hair', 0], ['hair', 1], ['skin', -1], ['skin', 0], ['skin', 1], ['skin', 2], ['skin', 3],
    ['metal', -1], ['metal', 0], ['metal', 1], ['trim', -1], ['trim', 0], ['trim', 1], ['cloth', -1], ['cloth', 0], ['cloth', 1],
    ['leather', -1], ['leather', 0], ['leather', 1]];

  const hex = (c) => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  function rgb(s) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(s || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  // éclaircir / assombrir : java.awt.Color.brighter() / darker() (facteur 0,7) comme le générateur d'origine,
  // l'éclaircissement étant plafonné (une couleur déjà claire ne vire pas au blanc pur)
  function brighter(c) {
    const i = 3;
    if (c[0] === 0 && c[1] === 0 && c[2] === 0) return [i, i, i];
    return c.map(v => Math.min(255, Math.floor((v > 0 && v < i ? i : v) / 0.7), Math.round(v + (255 - v) * 0.55)));
  }
  const darker = (c) => c.map(v => Math.max(0, Math.floor(v * 0.7)));
  const RAMP_SIZE = { hair: 3, skin: 5, eyes: 3, metal: 3, trim: 3, cloth: 3, leather: 3 };
  const RAMP_INDEX = { hair: 1, skin: 4, metal: 9, trim: 12, cloth: 15, leather: 18 }; // premier indice de chaque teinte
  const rampOk = (r, n) => Array.isArray(r) && r.length === n && r.every(c => rgb(c));
  /** Palette RGB des 21 indices (et blanc au-delà) : couleurs de base nuancées, ou dégradés exacts (ramps). */
  function palette(colors, ramps) {
    const base = {}; for (const g of GROUPS) base[g.id] = rgb(colors && colors[g.id]) || rgb(DEFAULT_COLORS[g.id]);
    base.outline = [0, 0, 0];
    const pal = SHADES.map(([g, k]) => {
      let c = base[g];
      if (g === 'outline') return c;
      if (k < 0) return brighter(c);
      for (let n = 0; n < k; n++) c = darker(c);
      return c;
    });
    for (const [g, at] of Object.entries(RAMP_INDEX)) if (ramps && rampOk(ramps[g], RAMP_SIZE[g])) ramps[g].forEach((c, i) => { pal[at + i] = rgb(c); });
    return pal;
  }
  /** Teintes des yeux (clair, base, ombre) ; null = celles des cheveux, comme le générateur d'origine. */
  function eyePalette(colors, ramps) {
    if (ramps && rampOk(ramps.eyes, 3)) return ramps.eyes.map(rgb);
    const c = rgb(colors && colors.eyes);
    return c ? [brighter(c), c, darker(c)] : null;
  }
  /**
   * Pixels des yeux d'un visage : teinte « cheveux » (indices 1-3) à 3 px au plus du blanc de l'œil, étendus d'un
   * pixel aux voisins de même teinte. Les barbes et sourcils, loin du blanc des yeux, gardent la couleur des cheveux.
   */
  function eyeMask(face) {
    const n = SIZE * SIZE, idx = (p) => (face[p * 4 + 3] ? Math.floor(face[p * 4] / 10) : -1);
    const hairish = new Uint8Array(n), white = new Uint8Array(n), mask = new Uint8Array(n);
    for (let p = 0; p < n; p++) { const i = idx(p); if (i >= 1 && i <= 3) hairish[p] = 1; else if (i >= 21) white[p] = 1; }
    const near = (p, r, set) => {
      const x = p % SIZE, y = (p - x) / SIZE;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < SIZE && Y < SIZE && set[Y * SIZE + X]) return true;
      }
      return false;
    };
    for (let p = 0; p < n; p++) if (hairish[p] && near(p, 3, white)) mask[p] = 1;
    const grown = mask.slice();
    for (let p = 0; p < n; p++) if (hairish[p] && !mask[p] && near(p, 1, mask)) grown[p] = 1;
    return grown;
  }
  /** Couleur finale d'un pixel indexé (r, a) ; null si transparent. */
  function shade(pal, r, a) {
    if (!a) return null;
    const i = Math.floor(r / 10);
    return pal[i] || [255, 255, 255];
  }

  // ------------------------------------------------------------- recette
  /** { colors, ramps? } valides (couleurs inconnues → défaut ; dégradés invalides retirés). */
  function normColors(r) {
    const out = { colors: {} };
    for (const g of GROUPS) out.colors[g.id] = rgb(r.colors && r.colors[g.id]) ? hex(rgb(r.colors[g.id])) : DEFAULT_COLORS[g.id];
    const ramps = {};
    for (const [k, size] of Object.entries(RAMP_SIZE)) if (r.ramps && rampOk(r.ramps[k], size)) ramps[k] = r.ramps[k].map(c => hex(rgb(c)));
    if (Object.keys(ramps).length) out.ramps = ramps;
    return out;
  }
  /** Couleurs du sprite de map : les siennes, sinon celles du portrait. */
  const mapColors = (recipe) => (recipe && recipe.map ? recipe.map : recipe);
  /** Couleurs du sprite de combat : les siennes, sinon celles du portrait. */
  const combatColors = (recipe) => (recipe && recipe.combat ? recipe.combat : recipe);
  /** Palette de l'animation de combat (Palettes « custom: ») : le tissu du sprite de combat ; '' sans recette. */
  function battlePalette(recipe) {
    if (!recipe || typeof recipe !== 'object') return '';
    const cc = combatColors(recipe), pal = palette(cc.colors, cc.ramps);
    return 'custom:' + [pal[15], pal[16], pal[17]].map(hex).join(',');
  }
  /**
   * Animation de combat FE recolorée avec les couleurs de combat de la recette : peau, cheveux, métal, ornements et cuir.
   * groups = img/generator/battler-colors.js › id : { peau | cheveux | … : ['#rrggbb' du plus clair au plus foncé] } ;
   * chaque nuance de la planche prend la nuance de même rang dans le dégradé choisi. Le tissu n'est pas touché :
   * ce sont les couleurs d'équipe, teintes en jeu (battlePalette).
   */
  function battlerColorTable(groups, recipe) {
    const out = new Map();
    if (!groups || !recipe) return out;
    const cc = combatColors(recipe), pal = palette(cc.colors, cc.ramps);
    for (const [g, list] of Object.entries(groups)) {
      const at = RAMP_INDEX[g];
      if (at === undefined || g === 'cloth' || !Array.isArray(list) || !list.length) continue;
      const ramp = pal.slice(at, at + RAMP_SIZE[g]);
      list.forEach((c, i) => {
        const src = rgb(c); if (!src) return;
        const t = list.length === 1 ? (ramp.length - 1) / 2 : i * (ramp.length - 1) / (list.length - 1);
        const a = ramp[Math.floor(t)], b = ramp[Math.ceil(t)], f = t - Math.floor(t);
        out.set((src[0] << 16) | (src[1] << 8) | src[2], a.map((v, j) => Math.round(v + (b[j] - v) * f)));
      });
    }
    return out;
  }
  /** Recolore en place les pixels RGBA d'une planche de combat (voir battlerColorTable). */
  function recolorBattler(data, groups, recipe) {
    const t = battlerColorTable(groups, recipe);
    if (!t.size) return data;
    for (let i = 0; i < data.length; i += 4) {
      if (!data[i + 3]) continue;
      const c = t.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      if (c) { data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; }
    }
    return data;
  }
  const EMPTY_OFFSETS = () => ({ hair: [0, 0], face: [0, 0], armor: [0, 0] });
  const clampOff = (v) => Math.max(-48, Math.min(48, Math.round(Number(v) || 0)));
  /** Recette complète et valide (pièces inconnues retirées si parts est donné). */
  function normalize(r, parts) {
    r = r && typeof r === 'object' ? r : {};
    const ok = (list, id) => (typeof id === 'string' && (!parts || !id || (list || []).some(p => p.id === id)) ? id : '');
    const out = { hair: ok(parts && parts.hair, r.hair), face: ok(parts && parts.face, r.face), armor: ok(parts && parts.armor, r.armor),
      token: ok(parts && parts.token, r.token), colors: {}, offsets: EMPTY_OFFSETS(), sprite: '' };
    if (typeof r.sprite === 'string' && (!parts || !parts.sprite || parts.sprite.some(p => p.id === r.sprite))) out.sprite = r.sprite;
    Object.assign(out, normColors(r));
    if (r.map && typeof r.map === 'object') out.map = normColors(r.map);
    if (r.combat && typeof r.combat === 'object') out.combat = normColors(r.combat);
    else if (r.battle && rampOk(r.battle.ramp, 3)) { // ancienne recette : tenue de combat seule → couleurs du sprite de combat
      const ramp = r.battle.ramp.map(c => hex(rgb(c)));
      out.combat = normColors({ colors: Object.assign({}, out.colors, { cloth: ramp[1] }), ramps: Object.assign({}, out.ramps, { cloth: ramp }) });
    }
    for (const k of Object.keys(out.offsets)) { const o = r.offsets && r.offsets[k]; if (Array.isArray(o)) out.offsets[k] = [clampOff(o[0]), clampOff(o[1])]; }
    return out;
  }
  function validate(r, parts) {
    const errors = [];
    if (!r || typeof r !== 'object') return ['Recette de personnage invalide.'];
    if (!r.face && !r.hair && !r.armor) errors.push('Choisis au moins un visage, des cheveux ou une tenue.');
    if (parts) for (const k of ['hair', 'face', 'armor', 'token']) if (r[k] && !(parts[k] || []).some(p => p.id === r[k])) errors.push(`Pièce inconnue (${k} : ${r[k]}).`);
    if (r.sprite !== undefined && r.sprite !== '' && (typeof r.sprite !== 'string' || (parts && parts.sprite && !parts.sprite.some(p => p.id === r.sprite)))) errors.push(`Sprite de map inconnu (${r.sprite}).`);
    for (const g of GROUPS) if (r.colors && r.colors[g.id] !== undefined && !rgb(r.colors[g.id]) && !(g.optional && r.colors[g.id] === '')) errors.push(`Couleur invalide (${g.label}).`);
    for (const [k, size] of Object.entries(RAMP_SIZE)) if (r.ramps && r.ramps[k] !== undefined && !rampOk(r.ramps[k], size)) errors.push(`Nuancier invalide (${k}).`);
    if (r.combat !== undefined && r.combat !== null && typeof r.combat !== 'object') errors.push('Couleurs de combat invalides.');
    return errors;
  }
  /** Recette au hasard (rng : () => [0, 1)) ; garde les champs de keep. */
  function random(parts, rng = Math.random, keep = {}) {
    const pick = (list) => (list && list.length ? list[Math.floor(rng() * list.length)].id : '');
    const sw = (g) => SWATCHES[g][Math.floor(rng() * SWATCHES[g].length)];
    const r = { hair: pick((parts.hair || []).filter(p => p.front)), face: pick(parts.face), armor: pick(parts.armor), token: pick(parts.token),
      colors: {}, offsets: EMPTY_OFFSETS() };
    for (const g of GROUPS) r.colors[g.id] = sw(g.id);
    // teintes tirées des nuanciers détaillés ; yeux : une fois sur deux comme les cheveux
    r.ramps = {};
    for (const g of ['skin', 'hair', 'metal', 'trim', 'cloth', 'leather']) {
      const list = g === 'skin' ? SKIN_RAMPS : HAIR_RAMPS, ramp = list[Math.floor(rng() * list.length)];
      r.ramps[g] = ramp; r.colors[g] = ramp[1];
    }
    if (rng() < 0.5) r.colors.eyes = '';
    else { const eyes = HAIR_RAMPS[Math.floor(rng() * HAIR_RAMPS.length)]; r.ramps.eyes = eyes; r.colors.eyes = eyes[1]; }
    return Object.assign(r, keep);
  }
  /** Recette par défaut : pièces de ce nom si elles existent (ex. « Eliwood »), sinon les premières. */
  /**
   * Recette de départ : les pièces du même nom que le personnage (Lyn, Hector…), sinon celles d'Eliwood ; le sprite
   * de combat « Lord » (animation d'Eliwood) ; le sprite de map FE du personnage (« Lord (F) Lyn Sword »…), sinon
   * celui d'Eliwood (« Lord (M) Eliwood Sword »).
   */
  const DEFAULT_PART = 'Eliwood', DEFAULT_SPRITE = 'lord-m-eliwood-sword';
  function defaults(parts, name) {
    const key = String(name || '').trim().toLowerCase();
    const find = (list, filter, fallback) => {
      const l = (list || []).filter(filter || (() => true)), by = (id) => l.find(p => p.id.toLowerCase() === id);
      return ((key && by(key)) || (fallback && by(fallback.toLowerCase())) || l[0] || {}).id || '';
    };
    const token = (parts.token || []).some(p => p.id.toLowerCase() === key) ? find(parts.token) : (find(parts.token, p => /^lord$/i.test(p.id)) || find(parts.token));
    return normalize({ hair: find(parts.hair, p => p.front, DEFAULT_PART), face: find(parts.face, null, DEFAULT_PART), armor: find(parts.armor, null, DEFAULT_PART),
      token, sprite: defaultSprite(parts, key, token) }, parts);
  }
  /** Sprite de map FE par défaut : celui qui porte le nom du personnage (seigneur de base d'abord, du même sexe que son
   *  animation de combat), sinon celui d'Eliwood ; '' sans bibliothèque de sprites. */
  function defaultSprite(parts, key, token) {
    const list = parts.sprite || [];
    if (!list.length) return '';
    const word = key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const B = parts.battlers, bid = (B && B.tokens && B.tokens[token]) || '';
    const sex = /(^|-)f(-|$)/.test(bid) ? 'f' : /(^|-)m(-|$)/.test(bid) ? 'm' : '';
    const named = word ? list.filter(p => new RegExp('(^|-)' + word + '(-|$)').test(p.id)) : [];
    if (named.length) {
      const score = (p) => (/^lord-/.test(p.id) ? 4 : 0) + (sex && new RegExp('(^|-)' + sex + '(-|$)').test(p.id) ? 2 : 0) - p.id.length / 100;
      return named.slice().sort((a, b) => score(b) - score(a))[0].id;
    }
    return list.some(p => p.id === DEFAULT_SPRITE) ? DEFAULT_SPRITE : '';
  }

  // ------------------------------------------------------------- composition (tableaux RGBA)
  /**
   * Portrait 96 × 96 (RGBA) : layers = { hairb, armor, face, hair } → données RGBA 96 × 96 (ou null), recolorées.
   * Le pixel (x, y) d'une pièce décalée de [dx, dy] vient de (x − dx, y − dy).
   */
  function composePortrait(layers, recipe) {
    const pal = palette(recipe.colors, recipe.ramps), out = new Uint8ClampedArray(SIZE * SIZE * 4);
    const eyes = eyePalette(recipe.colors, recipe.ramps);
    for (const name of LAYERS) {
      const src = layers[name]; if (!src) continue;
      const mask = name === 'face' && eyes ? eyeMask(src) : null;
      const [dx, dy] = recipe.offsets[name === 'hairb' ? 'hair' : name] || [0, 0];
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        const sx = x - dx, sy = y - dy;
        if (sx < 0 || sy < 0 || sx >= SIZE || sy >= SIZE) continue;
        const i = (sy * SIZE + sx) * 4;
        const c = mask && mask[sy * SIZE + sx] ? eyes[Math.floor(src[i] / 10) - 1] : shade(pal, src[i], src[i + 3]); if (!c) continue;
        const o = (y * SIZE + x) * 4;
        out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
      }
    }
    return out;
  }
  /** Figurine 64 × 64 recolorée (RGBA). */
  /**
   * Monture d'un sprite de combat (cheval, pégase…) : sur les figurines montées, la crinière, la queue et la robe sont
   * dessinées avec les teintes « cheveux ». On garde comme cheveux la mèche du cavalier (tache de teinte cheveux la plus
   * haute, si elle est dans le haut de la figurine, et les taches collées à elle) ; le reste est la monture.
   * Renvoie un masque (1 = pixel de la monture) de TOKEN × TOKEN.
   */
  function mountMask(src) {
    const F = TOKEN, mask = new Uint8Array(F * F);
    if (!src) return mask;
    const isHair = (k) => src[k * 4 + 3] && Math.floor(src[k * 4] / 10) >= 1 && Math.floor(src[k * 4] / 10) <= 3;
    let top = F, bottom = -1;
    for (let k = 0; k < F * F; k++) if (src[k * 4 + 3]) { const y = Math.floor(k / F); if (y < top) top = y; if (y > bottom) bottom = y; }
    if (bottom < 0) return mask;
    // taches de teinte cheveux (8-connexité)
    const comp = new Int32Array(F * F).fill(-1), comps = [];
    for (let k = 0; k < F * F; k++) {
      if (comp[k] >= 0 || !isHair(k)) continue;
      const c = { id: comps.length, px: [], x0: F, x1: -1, y0: F, y1: -1 }, stack = [k]; comp[k] = c.id;
      while (stack.length) {
        const q = stack.pop(), x = q % F, y = Math.floor(q / F); c.px.push(q);
        if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy, n = ny * F + nx;
          if (nx >= 0 && ny >= 0 && nx < F && ny < F && comp[n] < 0 && isHair(n)) { comp[n] = c.id; stack.push(n); }
        }
      }
      comps.push(c);
    }
    if (!comps.length) return mask;
    const head = comps.reduce((a, c) => (c.y0 < a.y0 ? c : a));
    const keep = new Set();
    if (head.y0 <= top + (bottom - top) * 0.3) {
      keep.add(head.id);
      for (const c of comps) if (c.y0 <= head.y1 + 1 && c.x1 >= head.x0 - 2 && c.x0 <= head.x1 + 2 && c.y1 <= head.y1 + 6) keep.add(c.id);
    }
    for (const c of comps) if (!keep.has(c.id)) for (const q of c.px) mask[q] = 1;
    return mask;
  }
  /** opts.mount : figurine montée → la monture prend les teintes du cuir au lieu de celles des cheveux. */
  function composeToken(src, recipe, opts = {}) {
    const mc = mapColors(recipe), pal = palette(mc.colors, mc.ramps), out = new Uint8ClampedArray(TOKEN * TOKEN * 4);
    if (!src) return out;
    const mount = opts.mount ? mountMask(src) : null;
    for (let i = 0; i < out.length; i += 4) {
      const c = mount && mount[i / 4] ? pal[RAMP_INDEX.leather + Math.floor(src[i] / 10) - 1] : shade(pal, src[i], src[i + 3]); if (!c) continue;
      out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255;
    }
    return out;
  }
  function bbox(data, w, h) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  }
  const FACESET = { w: 128, h: 112, top: 16, key: [1, 2, 3] }; // portrait = lignes 16 à 95 du 96 × 96 ; key : couleur de fond (transparente en jeu)
  /**
   * Face set 128 × 112 (format des portraits du jeu, faces.js) à partir du portrait 96 × 96.
   * face : données du visage seul (pour centrer le mini-portrait), facultatif.
   * Les cases yeux / bouche reprennent le portrait lui-même (pas d'animation, mais compatible).
   */
  function faceset(portrait, faceLayer) {
    const { w, h, top, key } = FACESET, out = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < out.length; i += 4) { out[i] = key[0]; out[i + 1] = key[1]; out[i + 2] = key[2]; out[i + 3] = 255; }
    const put = (sx, sy, dx, dy, cw, ch) => {
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const px = sx + x, py = sy + y;
        if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) continue;
        const i = (py * SIZE + px) * 4; if (!portrait[i + 3]) continue;
        const o = ((dy + y) * w + dx + x) * 4;
        out[o] = portrait[i]; out[o + 1] = portrait[i + 1]; out[o + 2] = portrait[i + 2]; out[o + 3] = 255;
      }
    };
    put(0, top, 0, 0, 96, 80);
    // mini-portrait : 32 × 32 autour du visage (ou du haut du portrait)
    const b = (faceLayer && bbox(faceLayer, SIZE, SIZE)) || bbox(portrait, SIZE, SIZE) || { x0: 32, y0: 24, x1: 64, y1: 56 };
    const cx = Math.round((b.x0 + b.x1) / 2), cy = Math.round(b.y0 + Math.min(32, b.y1 - b.y0) / 2 + 4);
    const mx = Math.max(0, Math.min(SIZE - 32, cx - 16)), my = Math.max(0, Math.min(SIZE - 32, cy - 16));
    put(mx, my, 96, 16, 32, 32);
    // cases yeux (96,48) (96,64) et bouches : une zone du portrait (repérée telle quelle par faces.js)
    const ex = Math.max(0, Math.min(64, cx - 16)), ey = Math.max(top, Math.min(SIZE - 16, cy - 8));
    for (const [dx, dy] of [[96, 48], [96, 64]]) put(ex, ey, dx, dy, 32, 16);
    for (const [dx, dy] of [[0, 80], [32, 80], [64, 80], [96, 80], [0, 96], [32, 96], [64, 96]]) put(ex, Math.min(SIZE - 16, ey + 12), dx, dy, 32, 16);
    return { data: out, width: w, height: h };
  }

  /**
   * Sprite de map à partir d'une figurine 64 × 64 (une seule pose) : planche 4 × 6 cases (idle, gauche, droite,
   * bas, haut, sélection) et son .json (base 32 : dessinée pour des cases de 32 px).
   */
  function mapSprite(token, opts = {}) {
    const F = TOKEN, b = bbox(token, F, F) || { x0: 24, y0: 16, x1: 40, y1: 48 };
    // pieds : centre des pixels de la ligne la plus basse ; recentrés dans la case (le miroir garde l'ancrage)
    let fx = 0, n = 0;
    for (let y = b.y1; y >= Math.max(b.y0, b.y1 - 3); y--) for (let x = b.x0; x <= b.x1; x++) if (token[(y * F + x) * 4 + 3]) { fx += x; n++; }
    fx = n ? Math.round(fx / n) : 32;
    const shift = F / 2 - fx, ground = Math.min(F - 1, b.y1 + 1), waist = Math.round(b.y0 + (b.y1 - b.y0) * 0.55);
    const get = (src, x, y) => (x < 0 || y < 0 || x >= F || y >= F ? null : (y * F + x) * 4);
    const make = (fn) => { const o = new Uint8ClampedArray(F * F * 4); for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) { const s = fn(x, y); if (s === null) continue; const d = (y * F + x) * 4; o[d] = s[0]; o[d + 1] = s[1]; o[d + 2] = s[2]; o[d + 3] = s[3]; } return o; };
    const px = (src, x, y) => { const i = get(src, x, y); return i === null || !src[i + 3] ? null : [src[i], src[i + 1], src[i + 2], src[i + 3]]; };
    const pose = make((x, y) => px(token, x - shift, y));
    const mirror = make((x, y) => px(pose, F - 1 - x + 1, y));
    const breathe = (s) => make((x, y) => (y <= waist ? (y === 0 ? null : px(s, x, y - 1)) : px(s, x, y)));
    const hop = (s) => make((x, y) => (y < b.y1 - 1 ? px(s, x, y + 1) : px(s, x, y)));
    const rows = [[pose, breathe(pose), pose, breathe(pose)], [pose, hop(pose), pose, hop(pose)], [mirror, hop(mirror), mirror, hop(mirror)],
      [pose, hop(pose), pose, hop(pose)], [pose, hop(pose), pose, hop(pose)], [pose, breathe(pose), hop(pose), breathe(pose)]];
    const W = F * 4, H = F * 6, sheet = new Uint8ClampedArray(W * H * 4);
    rows.forEach((line, r) => line.forEach((fr, c) => {
      for (let y = 0; y < F; y++) sheet.set(fr.subarray(y * F * 4, (y + 1) * F * 4), ((r * F + y) * W + c * F) * 4);
    }));
    const walk = { frames: [0, 1, 2, 3], durations: [110, 110, 110, 110] };
    const anims = { idle: { row: 0, frames: [0, 1, 2, 1], durations: [500, 160, 500, 160] } };
    ['left', 'right', 'down', 'up'].forEach((k, i) => { anims[k] = Object.assign({ row: i + 1 }, walk); });
    anims.focus = { row: 5, frames: [0, 1, 2, 1], durations: [160, 100, 160, 100] };
    const meta = { type: 'mapsprite', name: opts.name || 'Personnage généré', frame: [F, F], anchor: [F / 2, ground], base: 32, anims,
      source: 'Générateur de personnage (pièces : FE Character Creator, TheFlyingMinotaur)' };
    if (opts.teamColors) meta.teamColors = opts.teamColors;
    return { data: sheet, width: W, height: H, meta };
  }
  /**
   * .json d'un sprite de la bibliothèque FE (entrée de GENERATOR_SPRITES.list, f = [repos, marche, sélection]) :
   * planche 4 × 6 cases de 32 × 32 (idle, gauche, droite, bas, haut, sélection), base 16 (sprites GBA).
   */
  function spriteMeta(entry, name) {
    const [ni, nw, nf] = (entry && Array.isArray(entry.f) ? entry.f : [3, 4, 3]).map(n => Math.max(1, Math.min(4, n | 0)));
    const loop = (k) => (k === 3 ? [0, 1, 2, 1] : Array.from({ length: k }, (_, i) => i));
    const anims = { idle: { row: 0, frames: loop(ni), durations: ni === 3 ? [500, 80, 500, 80] : Array(ni).fill(500) } };
    ['left', 'right', 'down', 'up'].forEach((k, i) => { anims[k] = { row: i + 1, frames: Array.from({ length: nw }, (_, j) => j), durations: Array(nw).fill(110) }; });
    anims.focus = { row: 5, frames: loop(nf), durations: nf === 3 ? [160, 100, 160, 100] : Array(nf).fill(160) };
    const credits = entry && entry.credits && entry.credits.length ? ' — ' + entry.credits.join(', ') : '';
    return { type: 'mapsprite', name: name || (entry && entry.label) || 'Personnage généré', frame: [32, 32], anchor: [16, 32], base: 16, anims, source: 'FE-Repo' + credits };
  }
  /**
   * Palette commune des sprites de map FE GBA (camp bleu) : chaque couleur est rattachée à une teinte du générateur
   * (indice de palette() ou fonction de la palette). Contour, ombre au sol, blanc et rouge restent tels quels.
   */
  const FE_MAP_COLORS = [
    ['#18f0f8', (p) => brighter(p[15])], ['#28a0f8', 15], ['#3850e0', 16], ['#383890', 17], ['#584878', (p) => darker(p[17])], // couleurs du camp → tissu
    ['#f8f8d0', 4], ['#b09058', 6],                                                       // peau
    ['#d8e8f0', 9], ['#90b8e8', 10], ['#706060', 11],                                    // métal (#808870 = ombre au sol, gardée)
    ['#f8f840', 12]];                                                                     // ornements (or)
  const FE_KEYS = FE_MAP_COLORS.map(([c]) => rgb(c));
  /** Couleurs du sprite de map FE recoloré avec les couleurs de la carte (liste [de, vers] en RGB). */
  function feMapPalette(recipe) {
    const mc = mapColors(recipe), pal = palette(mc.colors, mc.ramps);
    return FE_MAP_COLORS.map(([, to], i) => [FE_KEYS[i], typeof to === 'number' ? pal[to] : to(pal)]);
  }
  /**
   * Recolore (sur place) les pixels RGBA d'un sprite de map FE : chaque couleur proche (écart ≤ 14 par composante)
   * d'une couleur de la palette commune prend la teinte choisie ; les autres (contour, couleurs propres) restent.
   * Avec width (et height), les cheveux sont aussi repérés et prennent le dégradé « Cheveux » (recolorFeHair).
   */
  function recolorFeSprite(data, recipe, width, height) {
    const map = feMapPalette(recipe), cache = new Map();
    // cheveux (repérés par la place, voir feHairMask) : dégradé « Cheveux », puis le reste avec la palette commune
    const hair = width ? recolorFeHair(data, width, height || data.length / 4 / width, recipe) : null;
    for (let i = 0; i < data.length; i += 4) {
      if (!data[i + 3] || (hair && hair[i / 4])) continue;
      const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      let to = cache.get(key);
      if (to === undefined) {
        to = null; let best = 15;
        for (const [from, c] of map) { const d = Math.max(Math.abs(from[0] - data[i]), Math.abs(from[1] - data[i + 1]), Math.abs(from[2] - data[i + 2])); if (d < best) { best = d; to = c; } }
        cache.set(key, to);
      }
      if (to) { data[i] = to[0]; data[i + 1] = to[1]; data[i + 2] = to[2]; }
    }
    return data;
  }
  /**
   * Cheveux d'un sprite de map FE. La palette commune des sprites GBA n'a pas de couleur « cheveux » : ils sont
   * dessinés avec les couleurs du camp (Lyn, Hector), le rouge (Eliwood) ou l'or (blonds). On les repère donc par la
   * place : dans chaque case de 32 × 32, les pixels colorés de la tête — au-dessus du visage (peau de la palette)
   * et autour, ou le haut de la silhouette quand le personnage est de dos — reliés au sommet du crâne.
   * Renvoie un masque (1 = cheveux) de la taille de l'image.
   */
  const FE_SKIN = ['#f8f8d0', '#b09058'].map(rgb), FE_NOT_HAIR = ['#403838', '#808870', '#f8f8f8', '#d8e8f0', '#90b8e8', '#706060', '#000000'].map(rgb);
  const near = (r, g, b, c, tol = 14) => Math.abs(r - c[0]) <= tol && Math.abs(g - c[1]) <= tol && Math.abs(b - c[2]) <= tol;
  function feHairMask(data, width, height, cell = 32) {
    const mask = new Uint8Array(width * height);
    const isLightSkin = (i) => near(data[i], data[i + 1], data[i + 2], FE_SKIN[0]);
    const kind = (i) => { // 0 vide / contour / ombre / blanc / métal, 1 peau, 2 couleur (cheveux possibles)
      if (data[i + 3] < 128) return 0;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (FE_SKIN.some(c => near(r, g, b, c))) return 1;
      if (FE_NOT_HAIR.some(c => near(r, g, b, c, 10)) || Math.max(r, g, b) < 70) return 0;
      return 2;
    };
    for (let cy = 0; cy + cell <= height; cy += cell) for (let cx = 0; cx + cell <= width; cx += cell) {
      const K = new Uint8Array(cell * cell);
      let top = -1, fx0 = cell, fx1 = -1, fy0 = cell, fy1 = -1;
      for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
        const k = kind(((cy + y) * width + cx + x) * 4); K[y * cell + x] = k;
        if (k && top < 0) top = y;
      }
      if (top < 0) continue;
      // visage : la peau claire la plus haute de la silhouette (8 premières lignes ; la peau foncée sert aussi aux
      // armures, et les mains sont plus bas)
      for (let y = top; y < Math.min(cell, top + 8); y++) for (let x = 0; x < cell; x++) if (K[y * cell + x] === 1 && isLightSkin(((cy + y) * width + cx + x) * 4)) {
        if (fy0 === cell) fy0 = y;
        if (y <= fy0 + 1) { fx0 = Math.min(fx0, x); fx1 = Math.max(fx1, x); fy1 = Math.max(fy1, y); }
      }
      let y0, y1, x0, x1;
      if (fx1 >= 0) { y0 = Math.max(top, fy0 - 7); y1 = Math.min(cell - 1, fy0 + 1); x0 = Math.max(0, fx0 - 2); x1 = Math.min(cell - 1, fx1 + 2); }
      else { // de dos : le haut de la tête
        let a = cell, b = -1; for (let x = 0; x < cell; x++) for (let y = top; y < top + 2; y++) if (K[y * cell + x]) { a = Math.min(a, x); b = Math.max(b, x); }
        y0 = top; y1 = Math.min(cell - 1, top + 3); x0 = Math.max(0, a - 2); x1 = Math.min(cell - 1, b + 2);
      }
      // cheveux : pixels colorés de cette zone reliés au crâne — juste au-dessus du visage, ou le haut de la tête de dos
      const seen = new Uint8Array(cell * cell), stack = [];
      const [sy0, sy1, sx0, sx1] = fx1 >= 0 ? [Math.max(y0, fy0 - 4), fy0 - 1, fx0, fx1] : [y0, Math.min(y1, y0 + 1), x0, x1];
      for (let y = sy0; y <= sy1; y++) for (let x = sx0; x <= sx1; x++) if (K[y * cell + x] === 2) { seen[y * cell + x] = 1; stack.push(y * cell + x); }
      while (stack.length) {
        const p = stack.pop(), x = p % cell, y = (p - x) / cell;
        mask[(cy + y) * width + cx + x] = 1;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, q = ny * cell + nx;
          if (nx < x0 || nx > x1 || ny < y0 || ny > y1 || seen[q] || K[q] !== 2) continue;
          seen[q] = 1; stack.push(q);
        }
      }
    }
    return mask;
  }
  /**
   * Cheveux d'un sprite de map FE aux couleurs de la carte : les teintes trouvées dans le masque, de la plus claire à
   * la plus foncée, prennent le dégradé « Cheveux » (3 nuances). Sur place ; à appeler avant recolorFeSprite.
   */
  function recolorFeHair(data, width, height, recipe) {
    const mask = feHairMask(data, width, height), cols = new Map();
    for (let p = 0; p < mask.length; p++) if (mask[p]) { const i = p * 4; cols.set((data[i] << 16) | (data[i + 1] << 8) | data[i + 2], 1); }
    if (!cols.size) return mask;
    const mc = mapColors(recipe), ramp = palette(mc.colors, mc.ramps).slice(RAMP_INDEX.hair, RAMP_INDEX.hair + 3);
    const lum = (k) => 0.3 * (k >> 16) + 0.59 * ((k >> 8) & 255) + 0.11 * (k & 255);
    const sorted = [...cols.keys()].sort((a, b) => lum(b) - lum(a)), to = new Map();
    sorted.forEach((k, i) => {
      const t = sorted.length === 1 ? 1 : i * 2 / (sorted.length - 1), a = ramp[Math.floor(t)], b = ramp[Math.ceil(t)], f = t - Math.floor(t);
      to.set(k, a.map((v, j) => Math.round(v + (b[j] - v) * f)));
    });
    for (let p = 0; p < mask.length; p++) if (mask[p]) {
      const i = p * 4, c = to.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2];
    }
    return mask;
  }
  /** Couleurs d'équipe d'un sprite FE recoloré : les 5 nuances du camp devenues celles du tissu. */
  const feTeamColors = (recipe) => feMapPalette(recipe).slice(0, 5).map(([, c]) => hex(c));
  /** Couleurs d'équipe du sprite : les nuances du tissu (recolorées en bleu / rouge / vert selon le camp). */
  function teamColors(recipe) {
    const mc = mapColors(recipe), pal = palette(mc.colors, mc.ramps);
    return [pal[15], pal[16], pal[17]].map(hex);
  }

  // ------------------------------------------------------------- protagoniste créé par le joueur
  /**
   * Réglage du projet (meta.avatar) : { enabled, unitId, rename }. Personnage par défaut : le héros du camp,
   * sinon le premier personnage principal, sinon la première unité.
   */
  function avatarConfig(meta, db) {
    const a = Object.assign({ enabled: false, unitId: '', rename: true }, (meta && meta.avatar) || {});
    const units = (db && db.units) || [];
    const has = (id) => units.some(u => u.id === id);
    if (!has(a.unitId)) {
      const hero = meta && meta.lobby && meta.lobby.heroId;
      a.unitId = has(hero) ? hero : ((units.find(u => u.protagonist) || units[0] || {}).id || '');
    }
    a.enabled = !!a.enabled && !!a.unitId; a.rename = a.rename !== false;
    return a;
  }
  /** Remplace le nom d'origine par le nom choisi (mots entiers) et {héros} / {hero} par le nom du protagoniste. */
  function renameText(text, from, to) {
    let s = String(text || '').replace(/\{(héros|heros|hero)\}/gi, to || from || '');
    if (from && to && from !== to) s = s.replace(new RegExp('(^|[^\\p{L}\\p{N}_])' + from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{N}_])', 'gu'), (m, pre) => pre + to);
    return s;
  }
  /** Validation de la création du joueur sauvegardée dans la campagne : { unitId, name, recipe }. */
  function validateAvatar(a, parts) {
    if (a === undefined || a === null) return [];
    if (typeof a !== 'object' || typeof a.unitId !== 'string' || !a.unitId) return ['Protagoniste créé invalide.'];
    const errors = [];
    if (a.name !== undefined && (typeof a.name !== 'string' || a.name.length > 20)) errors.push('Nom du protagoniste invalide (20 caractères au plus).');
    return errors.concat(validate(a.recipe, parts));
  }

  return { normColors, mapColors, combatColors, battlePalette, battlerColorTable, recolorBattler, RAMP_INDEX, HAIR_RAMPS, HAIR_LAYOUT, SKIN_RAMPS, RAMP_SIZE, eyePalette, eyeMask, avatarConfig, renameText, validateAvatar, SIZE, TOKEN, LAYERS, GROUPS, DEFAULT_COLORS, SWATCHES, SHADES, FACESET, rgb, hex, brighter, darker, palette, shade,
    normalize, validate, random, defaults, composePortrait, composeToken, mountMask, bbox, faceset, mapSprite, spriteMeta, teamColors, FE_MAP_COLORS, feMapPalette, recolorFeSprite, feHairMask, recolorFeHair, feTeamColors };
});
