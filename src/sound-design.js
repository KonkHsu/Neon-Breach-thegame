// Original procedural sound design. No recordings or third-party samples.
export const GUN_PROFILES = {
  svd: { duration: 0.32, body: 82, cutoff: 2400, decay: 0.06, gain: 0.84 },
  qbz191: { duration: 0.23, body: 115, cutoff: 2600, decay: 0.042, gain: 0.77 },
  mg42: { duration: 0.19, body: 91, cutoff: 2200, decay: 0.035, gain: 0.68 },
  aa12: { duration: 0.38, body: 70, cutoff: 1900, decay: 0.075, gain: 0.86 },
};
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2147483648 - 1;
  };
}
export function makeGun(id, sampleRate = 44100, seed = 1) {
  const p = GUN_PROFILES[id] || GUN_PROFILES.qbz191;
  const data = new Float32Array(Math.ceil(p.duration * sampleRate));
  const random = rng(seed),
    alpha = 1 - Math.exp((-2 * Math.PI * p.cutoff) / sampleRate);
  let low = 0,
    low2 = 0,
    rumble = 0,
    phase = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    low += alpha * (random() - low);
    low2 += alpha * (low - low2);
    rumble += 0.025 * (random() - rumble);
    phase += (2 * Math.PI * (p.body + 100 * Math.exp(-t * 95))) / sampleRate;
    const attack = Math.min(1, t / 0.0012);
    const blast = low2 * 2.3 * Math.exp(-t / p.decay);
    const body = Math.sin(phase) * 0.45 * Math.exp(-t / (p.decay * 0.9));
    const tail = rumble * 1.6 * Math.exp(-t / 0.11);
    // A muted bolt closure, not a pitched laser sweep.
    const bolt = t > 0.045 ? low2 * 0.23 * Math.exp(-(t - 0.045) / 0.012) : 0;
    const end = Math.min(1, (p.duration - t) / 0.02);
    data[i] = Math.tanh((blast + body + tail + bolt) * attack) * p.gain * end;
  }
  return data;
}

// 16 bars at 132 BPM. Circular mixing preserves instrument tails at the seam.
export function makeBattleMusic(sampleRate = 44100) {
  const beat = 60 / 132,
    bars = 16;
  const data = new Float32Array(Math.round(bars * 4 * beat * sampleRate));
  const random = rng(20260925);
  const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);
  function mix(time, duration, voice) {
    const start = Math.round(time * sampleRate),
      count = Math.ceil(duration * sampleRate);
    for (let i = 0; i < count; i++) {
      const t = i / sampleRate;
      data[(start + i) % data.length] +=
        voice(t, i) *
        Math.min(1, t / 0.003) *
        Math.min(1, (duration - t) / 0.012);
    }
  }
  function tone(time, midi, duration, volume, kind = "bass") {
    const f = freq(midi);
    mix(time, duration, (t) => {
      const phase = 2 * Math.PI * f * t;
      const wave =
        Math.sin(phase) +
        (kind === "pad" ? 0.16 : 0.32) * Math.sin(phase * 2) +
        0.1 * Math.sin(phase * 3);
      const envelope =
        kind === "pad"
          ? Math.sin((Math.PI * t) / duration) ** 2
          : Math.exp(-t / (duration * 0.32));
      return wave * envelope * volume;
    });
  }
  function kick(time, volume = 0.6) {
    mix(
      time,
      0.28,
      (t) =>
        Math.sin(
          2 * Math.PI * (48 * t + 65 * 0.018 * (1 - Math.exp(-t / 0.018))),
        ) *
        Math.exp(-t / 0.075) *
        volume,
    );
  }
  function drum(time, duration, volume, cutoff, body = 0) {
    const alpha = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
    let low = 0,
      low2 = 0;
    mix(time, duration, (t) => {
      low += alpha * (random() - low);
      low2 += alpha * (low - low2);
      return (
        (low2 + body * Math.sin(2 * Math.PI * 165 * t)) *
        Math.exp(-t / (duration * 0.24)) *
        volume
      );
    });
  }
  const roots = [38, 38, 34, 36]; // D minor / B-flat / C, two phrases with fills.
  const motif = [0, 7, 12, 7, 3, 7, 10, 7];
  for (let bar = 0; bar < bars; bar++) {
    const root = roots[Math.floor(bar / 2) % 4],
      start = bar * 4 * beat;
    for (const step of [0, 1.5, 2, 2.75]) kick(start + step * beat);
    for (const step of [1, 3])
      drum(start + step * beat, 0.18, 0.48, 1800, 0.28);
    for (let step = 0; step < 8; step++) {
      const t = start + (step * beat) / 2;
      drum(t, 0.052, step % 2 ? 0.1 : 0.065, 3400);
      tone(
        t,
        root + (step === 6 ? 12 : 0),
        beat * 0.42,
        step % 2 ? 0.15 : 0.23,
      );
      if (bar % 8 >= 2)
        tone(t + beat / 4, root + 24 + motif[step], beat * 0.65, 0.042, "lead");
    }
    for (const offset of [0, 7, 12])
      tone(start, root + 12 + offset, beat * 4.6, 0.035, "pad");
    if (bar % 4 === 3) {
      for (let j = 0; j < 4; j++)
        drum(start + (3 + j / 4) * beat, 0.12, 0.14 + j * 0.025, 1500, 0.6);
    }
    if (bar % 8 === 0) drum(start, 0.8, 0.15, 2200);
  }
  let low = 0;
  const alpha = 1 - Math.exp((-2 * Math.PI * 4200) / sampleRate);
  // Two passes settle the circular filter before retaining its output.
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < data.length; i++) {
      low += alpha * (data[i] - low);
      if (pass === 1) data[i] = Math.tanh(low * 1.2) * 0.8;
    }
  return data;
}

// Layer format: [start, length, frequency, end frequency, noise mix, level].
// Mechanical sounds use short, inharmonic resonances and filtered friction.
export const EFFECT_LAYERS = {
  reload: [
    [0, 0.035, 310, 210, 0.85, 0.46],
    [0.055, 0.12, 145, 105, 0.95, 0.32],
    [0.16, 0.04, 520, 330, 0.7, 0.18],
  ],
  reloadDone: [
    [0, 0.045, 185, 110, 0.75, 0.55],
    [0.06, 0.07, 430, 170, 0.85, 0.48],
  ],
  pulse: [
    [0, 0.38, 95, 32, 0.4, 0.68],
    [0.025, 0.23, 180, 50, 0.7, 0.35],
  ],
  "ultimate:charge": [
    [0, 0.07, 210, 90, 0.75, 0.55],
    [0.055, 0.4, 65, 140, 0.65, 0.5],
  ],
  "ultimate:ricochet": [
    [0, 0.08, 150, 90, 0.8, 0.4],
    [0.08, 0.22, 90, 230, 0.35, 0.45],
    [0.19, 0.09, 340, 140, 0.7, 0.36],
  ],
  "ultimateFire:ricochet": [
    [0, 0.085, 160, 65, 0.7, 0.48],
    [0.025, 0.06, 420, 240, 0.35, 0.2],
  ],
  "item:beam": [
    [0, 0.35, 90, 240, 0.15, 0.43],
    [0.1, 0.3, 180, 360, 0.12, 0.2],
  ],
  "itemFire:beam": [
    [0, 0.14, 135, 135, 0.12, 0.23],
    [0, 0.14, 272, 272, 0.08, 0.1],
  ],
  "item:electric": [
    [0, 0.09, 180, 420, 0.65, 0.36],
    [0.08, 0.1, 290, 520, 0.65, 0.35],
    [0.17, 0.16, 390, 150, 0.55, 0.3],
  ],
  "itemFire:electric": [
    [0, 0.08, 360, 170, 0.7, 0.32],
    [0.018, 0.045, 540, 280, 0.65, 0.2],
  ],
  "item:charm": [
    [0, 0.32, 330, 330, 0.06, 0.3],
    [0.09, 0.32, 440, 440, 0.04, 0.24],
    [0.18, 0.3, 660, 660, 0.03, 0.18],
  ],
  "itemFire:charm": [
    [0, 0.055, 220, 150, 0.8, 0.27],
    [0.012, 0.24, 390, 310, 0.08, 0.32],
  ],
};
export function makeEffect(id, sampleRate = 44100) {
  const layers = EFFECT_LAYERS[id];
  if (!layers) return null;
  const duration = Math.max(...layers.map(([start, length]) => start + length));
  const data = new Float32Array(Math.ceil(duration * sampleRate));
  const random = rng(7103 + Object.keys(EFFECT_LAYERS).indexOf(id));
  for (const [start, length, from, to, noise, volume] of layers) {
    const offset = Math.round(start * sampleRate);
    let low = 0,
      phase = 0;
    const alpha =
      1 -
      Math.exp(
        (-2 * Math.PI * (id.startsWith("reload") ? 2100 : 1800)) / sampleRate,
      );
    for (
      let i = 0;
      i < Math.floor(length * sampleRate) && offset + i < data.length;
      i++
    ) {
      const t = i / sampleRate,
        progress = t / length;
      low += alpha * (random() - low);
      phase += (2 * Math.PI * (from + (to - from) * progress)) / sampleRate;
      const ring =
        Math.sin(phase) +
        0.22 * Math.sin(phase * (id.startsWith("reload") ? 2.73 : 2));
      const flutter = id.includes("electric")
        ? 0.6 + 0.4 * Math.sin(2 * Math.PI * 75 * t) ** 2
        : 1;
      const env =
        Math.min(1, t / 0.002) *
        Math.exp(-progress * 4) *
        Math.min(1, (length - t) / 0.012);
      data[offset + i] +=
        (low * noise * 2 + ring * (1 - noise)) * volume * env * flutter;
    }
  }
  // Two low-pass stages tame even the electrical and metallic transients.
  const alpha = 1 - Math.exp((-2 * Math.PI * 2800) / sampleRate);
  let a = 0,
    b = 0;
  for (let i = 0; i < data.length; i++) {
    a += alpha * (data[i] - a);
    b += alpha * (a - b);
    data[i] =
      Math.tanh(b) * Math.min(1, (data.length - 1 - i) / (sampleRate * 0.008));
  }
  return data;
}
