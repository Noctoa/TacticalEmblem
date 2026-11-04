'use strict';
// Musiques : pistes Fire Emblem fournies, musique par acte (Music.setOverrides) et musique de combat (Music.battle).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadMusic() {
  const played = [];
  const timers = { n: 0, live: new Set() };
  class FakeAudio {
    constructor(src) { this.src = src; this.paused = true; this.volume = 1; this.loop = false; played.push(this); }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
    cloneNode() { return new FakeAudio(this.src); }
  }
  const ctx = { Audio: FakeAudio, localStorage: { getItem: () => null, setItem() {} }, performance: { now: () => 0 },
    setInterval: (f) => { const id = ++timers.n; timers.live.add(id); queueMicrotask(() => { for (let i = 0; i < 200 && timers.live.has(id); i++) f(); }); return id; },
    clearInterval: (id) => timers.live.delete(id), requestAnimationFrame() {},
    Render: { imageUrl: (b, p) => b + p }, UI: { toast() {} } };
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/renderer/audio.js'), 'utf8'), ctx);
  return { Music: ctx.Music, played };
}

test('les pistes Fire Emblem sont fournies et les musiques de combat du projet d\'exemple existent', () => {
  const root = path.join(__dirname, '../assets/default');
  const dirs = ['FE3', 'FE4', 'FE5', 'FE9', 'FE10', 'FE12', 'FE13'];
  let n = 0;
  for (const d of dirs) n += fs.readdirSync(path.join(root, 'ressources/musiques', d)).filter(f => f.endsWith('.ogg')).length;
  n += fs.readdirSync(path.join(root, 'ressources/jingles/FE5')).filter(f => f.endsWith('.ogg')).length;
  assert.strictEqual(n, 70);
  const Defaults = require('../src/shared/defaults.js');
  const audio = Defaults.sampleProject('T').meta.audio;
  for (const k of ['battlePlayer', 'battleEnemy', 'battleBoss']) assert.ok(fs.existsSync(path.join(root, audio[k])), k);
});

test('musique par acte : remplace celle du projet, vide = projet', () => {
  const { Music } = loadMusic();
  Music.setup('base/', { playerPhase: 'p.ogg', enemyPhase: 'e.ogg' });
  Music.setOverrides({ playerPhase: 'acte.ogg', enemyPhase: '' });
  assert.strictEqual(Music.track('playerPhase'), 'acte.ogg');
  assert.strictEqual(Music.track('enemyPhase'), 'e.ogg');
  Music.bgm('playerPhase');
  assert.strictEqual(Music.state().current, 'acte.ogg');
  Music.setOverrides(undefined);
  assert.strictEqual(Music.track('playerPhase'), 'p.ogg');
});

test('musique de combat : met la map en pause puis la reprend', async () => {
  const tick = () => new Promise(r => setTimeout(r, 5));
  const { Music, played } = loadMusic();
  Music.setup('base/', { playerPhase: 'p.ogg' });
  assert.strictEqual(typeof Music.battle('battleBoss'), 'function'); // rien de réglé : sans effet
  assert.strictEqual(played.length, 0);
  Music.bgm('playerPhase');
  await tick();
  const map = played[0];
  assert.ok(!map.paused);
  Music.setOverrides({ battleBoss: 'boss.ogg' });
  const end = Music.battle('battleBoss');
  const fight = played[1];
  await tick();
  assert.strictEqual(fight.src, 'base/boss.ogg');
  assert.ok(map.paused && !fight.paused && Music.state().battle);
  end();
  await tick();
  assert.ok(!map.paused && !Music.state().battle);
  assert.strictEqual(played.length, 2); // la musique de la map reprend (même élément, même position)
});
