/*
 * MIDI → WAV avec FluidSynth (wasm, paquet npm js-synthesizer) et une banque de sons General MIDI.
 *   npm install --no-save js-synthesizer@1.8.5
 *   node tools/music/midi-to-wav.js in.mid out.wav GeneralUser-GS.sf2
 * Puis, pour le jeu (silence de fin retiré, volume homogène) :
 *   ffmpeg -i out.wav -af "areverse,silenceremove=start_periods=1:start_threshold=-60dB,areverse,loudnorm=I=-16:TP=-1.5:LRA=11" -c:a libvorbis -q:a 3 piste.ogg
 * Voir tools/music/README.md.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const PKG = path.dirname(require.resolve('js-synthesizer/package.json'));
// libfluidsynth (emscripten) chargé dans le contexte global : Module, addOnPostRun… deviennent globaux
globalThis.require = require; globalThis.__dirname = __dirname; globalThis.__filename = __filename;
vm.runInThisContext(fs.readFileSync(path.join(PKG, 'externals/libfluidsynth-2.3.0.js'), 'utf8'), { filename: 'libfluidsynth.js' });
const JSSynth = require(PKG);
(async () => {
  const [inp, out, sf] = process.argv.slice(2);
  await JSSynth.waitForReady();
  const synth = new JSSynth.Synthesizer();
  const RATE = 44100;
  synth.init(RATE);
  await synth.loadSFont(new Uint8Array(fs.readFileSync(sf)).buffer);
  await synth.addSMFDataToPlayer(new Uint8Array(fs.readFileSync(inp)).buffer);
  await synth.playPlayer();
  const chunk = 4096, L = [], R = [];
  let silent = 0;
  for (let t = 0; t < RATE * 600; t += chunk) { // 10 min max
    const l = new Float32Array(chunk), r = new Float32Array(chunk);
    synth.render([l, r]);
    L.push(l); R.push(r);
    if (!synth.isPlayerPlaying()) { let m = 0; for (let i = 0; i < chunk; i++) m = Math.max(m, Math.abs(l[i]), Math.abs(r[i])); silent = m < 1e-4 ? silent + 1 : 0; if (silent > 20) break; }
  }
  const n = L.length * chunk, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  let o = 44;
  for (let k = 0; k < L.length; k++) for (let i = 0; i < chunk; i++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[k][i] * 32767))), o); buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[k][i] * 32767))), o + 2); o += 4;
  }
  fs.writeFileSync(out, buf);
  console.log('ok', (n / RATE).toFixed(1) + ' s');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
