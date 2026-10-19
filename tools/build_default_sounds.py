#!/usr/bin/env python3
"""
Effets sonores par défaut (assets/default/ressources/sons/*.wav), synthétisés : sons courts façon
console 8/16 bits, libres de droits. Usage : python3 tools/build_default_sounds.py
"""
import math, os, random, struct, wave

RATE = 22050
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'default', 'ressources', 'sons')


def square(f, t):
    return 1.0 if math.sin(2 * math.pi * f * t) >= 0 else -1.0


def tone(freqs, dur, wave_fn=square, vol=0.35, decay=8.0):
    """freqs : fréquence fixe ou fonction du temps."""
    n = int(RATE * dur)
    out = []
    for i in range(n):
        t = i / RATE
        f = freqs(t) if callable(freqs) else freqs
        env = math.exp(-decay * t) * min(1.0, i / 60)
        out.append(wave_fn(f, t) * env * vol)
    return out


def noise(dur, vol=0.4, decay=10.0, lowpass=0.35):
    random.seed(7)
    out, last = [], 0.0
    for i in range(int(RATE * dur)):
        t = i / RATE
        last = last + lowpass * ((random.random() * 2 - 1) - last)
        out.append(last * math.exp(-decay * t) * vol * 2.2)
    return out


def mix(*parts):
    n = max(len(p) for p in parts)
    return [max(-1.0, min(1.0, sum(p[i] for p in parts if i < len(p)))) for i in range(n)]


def save(name, samples):
    os.makedirs(OUT, exist_ok=True)
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(s * 32000)) for s in samples))


def main():
    save('curseur', tone(1320, 0.035, vol=0.18, decay=40))
    save('valider', tone(lambda t: 880 if t < 0.05 else 1320, 0.12, vol=0.25, decay=14))
    save('annuler', tone(lambda t: 660 if t < 0.05 else 440, 0.12, vol=0.25, decay=14))
    save('coup', mix(noise(0.18, vol=0.5, decay=18), tone(lambda t: 180 - 400 * t, 0.15, vol=0.3, decay=16)))
    save('critique', mix(noise(0.35, vol=0.55, decay=9, lowpass=0.6), tone(lambda t: 520 - 900 * t, 0.3, vol=0.3, decay=8)))
    save('esquive', tone(lambda t: 500 + 2600 * t, 0.16, wave_fn=lambda f, t: math.sin(2 * math.pi * f * t), vol=0.3, decay=10))
    save('defaite', tone(lambda t: 420 - 300 * t, 0.6, vol=0.3, decay=4))
    print('sons écrits dans', OUT)


if __name__ == '__main__':
    main()
