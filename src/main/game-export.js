/*
 * Compilateur du jeu (Fichier › Compiler le jeu…) : une version jouable du projet, sans l'éditeur.
 *
 *   Web      <sortie>/<Nom> (Web)/index.html  + <Nom>-web.zip (prêt pour itch.io, index.html à la racine)
 *   Windows  <sortie>/<Nom> (Windows)/<Nom>.exe : le moteur Electron de Tactical Emblem, avec le jeu à la place
 *            de l'éditeur (resources/app). Rien à installer.
 *   Android  <sortie>/<Nom> (Android Studio)/ : projet Android (WebView) à ouvrir dans Android Studio,
 *            Build › Build APK(s) ; le jeu est dans app/src/main/assets/www.
 *
 * Le jeu = playtest.html + src/shared + le dossier du projet (game/) ; le projet chargé est embarqué dans
 * game/game-data.js et src/renderer/game-shim.js remplace l'API tf.* (sauvegardes dans le stockage local).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const io = require('./project-io');
const pluginsIO = require('./plugins-io');

const PLATFORMS = ['web', 'windows', 'android'];
const SKIP_PROJECT = new Set(['saves', '.git', 'node_modules', 'compilations', 'build', 'export']);

/** Nom de fichier lisible et sûr ; identifiant (paquet Android, stockage). */
const fileName = (s) => String(s || 'Mon jeu').replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Mon jeu';
const slug = (s) => String(s || 'jeu').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 30) || 'jeu';

function copyDir(src, dest, filter) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (filter && !filter(s, e)) continue;
    if (e.isDirectory()) copyDir(s, d, filter);
    else if (e.isFile()) fs.copyFileSync(s, d);
  }
}
function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function sizeOf(p) {
  let n = 0;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) { const f = path.join(p, e.name); n += e.isDirectory() ? sizeOf(f) : e.isFile() ? fs.statSync(f).size : 0; }
  return n;
}

// ---------- zip (sans dépendance : deflate de zlib + CRC32) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zipDir(root, out) {
  const files = [];
  (function walk(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name), r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(p, r); else if (e.isFile()) files.push([p, r]);
    }
  })(root, '');
  const fd = fs.openSync(out, 'w');
  const central = [];
  let offset = 0;
  const write = (b) => { fs.writeSync(fd, b); offset += b.length; };
  for (const [p, r] of files) {
    const data = fs.readFileSync(p), name = Buffer.from(r, 'utf8');
    const packed = /\.(png|jpe?g|gif|webp|ogg|mp3|m4a|zip)$/i.test(r) ? null : zlib.deflateRawSync(data, { level: 6 });
    const body = packed && packed.length < data.length ? packed : data, method = body === data ? 0 : 8, crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(method, 8);
    head.writeUInt32LE(0, 10); head.writeUInt32LE(crc, 14); head.writeUInt32LE(body.length, 18); head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(name.length, 26); head.writeUInt16LE(0, 28);
    const at = offset;
    write(head); write(name); write(body);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(method, 10);
    c.writeUInt32LE(0, 12); c.writeUInt32LE(crc, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(name.length, 28); c.writeUInt32LE(at, 42);
    central.push(Buffer.concat([c, name]));
  }
  const cdStart = offset;
  for (const c of central) write(c);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(offset - cdStart, 12); end.writeUInt32LE(cdStart, 16);
  write(end);
  fs.closeSync(fd);
  return files.length;
}

// ---------- jeu web (base commune aux 3 plateformes) ----------
/**
 * Écrit la version web dans dest : index.html, src/ (moteur du jeu), game/ (projet + game-data.js).
 * platform : 'web' | 'windows' | 'android' (comportement de « Quitter »).
 */
function writeWeb(dest, ctx, platform) {
  const { appRoot, projectDir, project, plugins, ui, name, version, id } = ctx;
  rmrf(dest);
  fs.mkdirSync(dest, { recursive: true });
  // moteur : renderer (sans les fichiers propres à l'éditeur, inutiles) + shared
  const EDITOR_ONLY = /^(editor|db|texts-editor|dialogue-editor|generator-page|event-fields|lobby-editor|village-fields|file-browser|resources|studio)\b.*\.(js|css|html)$/;
  copyDir(path.join(appRoot, 'src', 'renderer'), path.join(dest, 'src', 'renderer'), (p, e) => !(e.isFile() && path.dirname(p) === path.join(appRoot, 'src', 'renderer') && EDITOR_ONLY.test(e.name)));
  copyDir(path.join(appRoot, 'src', 'shared'), path.join(dest, 'src', 'shared'));
  // page du jeu : projet embarqué + remplacement de l'API de l'éditeur, avant les autres scripts
  const page = path.join(dest, 'src', 'renderer', 'playtest.html');
  let html = fs.readFileSync(page, 'utf8');
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(name)}</title>`)
    .replace('<script src="../shared/factions.js"></script>', '<script src="../../game/game-data.js"></script>\n<script src="game-shim.js"></script>\n<script src="../shared/factions.js"></script>');
  fs.writeFileSync(page, html);
  // projet : ressources, plugins, données (sans sauvegardes ni copies de secours)
  copyDir(projectDir, path.join(dest, 'game'), (p, e) => !(e.isDirectory() && path.dirname(p) === projectDir && SKIP_PROJECT.has(e.name)) && !/\.(bak|tmp)$/.test(e.name));
  const data = { id, name, version, platform, project, plugins, ui };
  fs.writeFileSync(path.join(dest, 'game', 'game-data.js'), '/* Généré par Tactical Emblem (Fichier › Compiler le jeu…) */\nwindow.__GAME__ = ' + JSON.stringify(data) + ';\n');
  fs.writeFileSync(path.join(dest, 'index.html'), `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(name)}</title><style>html,body{margin:0;height:100%;background:#000;color:#ccc;font:16px sans-serif}</style></head>
<body><noscript>Active JavaScript pour jouer à ${escapeHtml(name)}.</noscript>
<script>location.replace('src/renderer/playtest.html?dir=game&release=1');</script></body></html>
`);
}
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- Windows (moteur Electron de Tactical Emblem) ----------
/** Fichiers du moteur Electron à côté de l'exécutable (sans l'application de l'éditeur). */
function runtimeFiles(exeDir) {
  return fs.readdirSync(exeDir, { withFileTypes: true }).filter(e => e.name !== 'resources' && !/^(Uninstall|update|debug\.log)/i.test(e.name) && !/\.(blockmap|zip|7z)$/i.test(e.name));
}
function writeDesktop(dest, ctx) {
  const { exePath, name, version, id } = ctx;
  const exeDir = path.dirname(exePath);
  rmrf(dest);
  fs.mkdirSync(path.join(dest, 'resources'), { recursive: true });
  for (const e of runtimeFiles(exeDir)) {
    const s = path.join(exeDir, e.name);
    if (s === exePath) continue;
    if (e.isDirectory()) copyDir(s, path.join(dest, e.name)); else if (e.isFile()) fs.copyFileSync(s, path.join(dest, e.name));
  }
  const ext = path.extname(exePath);
  const exe = path.join(dest, fileName(name) + ext);
  fs.copyFileSync(exePath, exe);
  try { fs.chmodSync(exe, 0o755); } catch (e) { /* Windows */ }
  const app = path.join(dest, 'resources', 'app');
  writeWeb(app, ctx, 'windows');
  fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'game-' + id, productName: name, version, main: 'main.js' }, null, 2));
  fs.writeFileSync(path.join(app, 'main.js'), `'use strict';
// ${name} — compilé avec Tactical Emblem
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
app.setName(${JSON.stringify(name)});
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({ width: 1280, height: 800, minWidth: 800, minHeight: 500, title: ${JSON.stringify(name)}, backgroundColor: '#000000',
    autoHideMenuBar: true, webPreferences: { contextIsolation: true, sandbox: true } });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F11' || (input.key === 'Enter' && input.alt))) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile(path.join(__dirname, 'src', 'renderer', 'playtest.html'), { query: { dir: 'game', release: '1' } });
});
app.on('window-all-closed', () => app.quit());
`);
  return exe;
}

// ---------- Android (projet Android Studio, WebView) ----------
function writeAndroid(dest, ctx) {
  const { name, version, id } = ctx;
  const pkg = 'com.tacticalemblem.' + (/^[a-z]/.test(id) ? id : 'jeu' + id);
  rmrf(dest);
  const w = (rel, text) => { const f = path.join(dest, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
  writeWeb(path.join(dest, 'app', 'src', 'main', 'assets', 'www'), ctx, 'android');
  const code = Math.max(1, version.split('.').map(n => parseInt(n, 10) || 0).reduce((a, n) => a * 100 + Math.min(n, 99), 0));
  w('settings.gradle', `pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositories { google(); mavenCentral() } }
rootProject.name = ${JSON.stringify(name)}
include ':app'
`);
  w('build.gradle', `plugins { id 'com.android.application' version '8.5.2' apply false }\n`);
  w('gradle.properties', `android.useAndroidX=true\norg.gradle.jvmargs=-Xmx2048m\n`);
  w('app/build.gradle', `plugins { id 'com.android.application' }
android {
    namespace '${pkg}'
    compileSdk 34
    defaultConfig {
        applicationId '${pkg}'
        minSdk 24
        targetSdk 34
        versionCode ${code}
        versionName '${version}'
    }
    buildTypes { release { minifyEnabled false } }
    compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }
    // les ressources du jeu (png, ogg…) sont déjà compressées
    androidResources { noCompress += ['png', 'ogg', 'mp3', 'json', 'js'] }
}
dependencies { implementation 'androidx.webkit:webkit:1.11.0' }
`);
  w('app/src/main/AndroidManifest.xml', `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:label="@string/app_name" android:theme="@android:style/Theme.Black.NoTitleBar.Fullscreen" android:hardwareAccelerated="true">
        <activity android:name=".MainActivity" android:exported="true" android:screenOrientation="sensorLandscape"
            android:configChanges="orientation|screenSize|keyboardHidden|keyboard|navigation">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`);
  w('app/src/main/res/values/strings.xml', `<?xml version="1.0" encoding="utf-8"?>\n<resources><string name="app_name">${escapeHtml(name)}</string></resources>\n`);
  w(`app/src/main/java/${pkg.replace(/\./g, '/')}/MainActivity.java`, `package ${pkg};

import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.WebViewAssetLoader;

/** ${name} — compilé avec Tactical Emblem. Le jeu (HTML) est servi depuis assets/www. */
public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);
        hideBars();
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
        });
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true); // sauvegardes
        s.setMediaPlaybackRequiresUserGesture(false); // musique
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface public void quit() { runOnUiThread(MainActivity.this::finish); }
        }, "AndroidGame");
        if (state != null) web.restoreState(state);
        else web.loadUrl("https://appassets.androidplatform.net/assets/www/index.html");
    }

    private void hideBars() {
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override public void onWindowFocusChanged(boolean focus) { super.onWindowFocusChanged(focus); if (focus) hideBars(); }
    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override protected void onPause() { super.onPause(); web.onPause(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }

    /** Bouton retour = touche Échap (paramètres, retour en arrière dans les menus). */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            web.evaluateJavascript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));", null);
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
`);
  w('LISEZMOI.txt', `${name} ${version} — projet Android (compilé avec Tactical Emblem)

Pour obtenir l'APK à installer sur un téléphone ou une tablette :
1. Installe Android Studio (gratuit) : https://developer.android.com/studio
2. Android Studio › Open › choisis ce dossier. Laisse-le télécharger ce qu'il demande (Gradle, SDK Android).
3. Menu Build › Build App Bundle(s) / APK(s) › Build APK(s).
   L'APK se trouve ensuite dans app/build/outputs/apk/debug/app-debug.apk.
4. Copie l'APK sur l'appareil et ouvre-le (autorise l'installation d'applications de sources inconnues).

Pour publier sur le Play Store : Build › Generate Signed App Bundle / APK.
Le jeu lui-même est dans app/src/main/assets/www (le même que la version Web).
Le bouton retour d'Android ouvre les paramètres (comme la touche Échap).
`);
  return dest;
}

/**
 * Compile le jeu. opts : { name, version, platforms, outDir }.
 * env : { appRoot, assetsDir, exePath, platform (process.platform) }. Renvoie { outputs: [{ platform, path, file?, size }], warnings }.
 */
function exportGame(projectDir, opts, env) {
  const platforms = (opts.platforms || []).filter(p => PLATFORMS.includes(p));
  if (!platforms.length) throw new Error('Choisis au moins une plateforme.');
  if (!opts.outDir) throw new Error('Choisis le dossier de sortie.');
  const outRoot = path.resolve(opts.outDir);
  if (outRoot === path.resolve(projectDir) || outRoot.startsWith(path.resolve(projectDir) + path.sep) && !/[\\/](compilations|build|export)([\\/]|$)/.test(outRoot.slice(path.resolve(projectDir).length)))
    throw new Error('Choisis un dossier de sortie hors du projet (ou son sous-dossier « compilations »).');
  const project = io.loadProject(projectDir, env.assetsDir);
  const name = fileName(opts.name || project.meta.name);
  const version = /^\d+(\.\d+){0,3}$/.test(String(opts.version || '')) ? String(opts.version) : '1.0.0';
  const plugins = pluginsIO.listInstalled(projectDir).filter(m => !m.error);
  const ui = io.installInterface(projectDir, path.join(env.appRoot, 'src', 'renderer', 'img')); // images d'interface du projet
  const ctx = { appRoot: env.appRoot, projectDir, project, plugins, ui, name, version, id: slug(name), exePath: env.exePath };
  const outputs = [], warnings = [];
  fs.mkdirSync(outRoot, { recursive: true });
  if (platforms.includes('web')) {
    const dir = path.join(outRoot, name + ' (Web)');
    writeWeb(dir, ctx, 'web');
    const zip = path.join(outRoot, name + ' - web.zip');
    zipDir(dir, zip);
    outputs.push({ platform: 'web', path: dir, file: zip, size: fs.statSync(zip).size });
  }
  if (platforms.includes('windows')) {
    const label = env.platform === 'win32' ? 'Windows' : env.platform === 'darwin' ? 'macOS' : 'Linux';
    if (env.platform !== 'win32') warnings.push(`La version de bureau est construite pour le système en cours (${label}) : compile depuis Windows pour obtenir le .exe.`);
    const dir = path.join(outRoot, name + ` (${label})`);
    const exe = writeDesktop(dir, ctx);
    outputs.push({ platform: 'windows', path: dir, file: exe, size: sizeOf(dir) });
  }
  if (platforms.includes('android')) {
    const dir = path.join(outRoot, name + ' (Android Studio)');
    writeAndroid(dir, ctx);
    outputs.push({ platform: 'android', path: dir, file: path.join(dir, 'LISEZMOI.txt'), size: sizeOf(dir) });
    warnings.push('Android : ouvre le dossier dans Android Studio puis Build › Build APK(s) (voir LISEZMOI.txt).');
  }
  return { outputs, warnings, name, version };
}

module.exports = { PLATFORMS, exportGame, zipDir, fileName, slug };
