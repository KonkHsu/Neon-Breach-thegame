import test from "node:test";
import assert from "node:assert/strict";
import { makeGun, makeBattleMusic, GUN_PROFILES } from "../src/sound-design.js";
import { makeEffect, EFFECT_LAYERS } from "../src/sound-design.js";
import { Game } from "../src/combat.js";
import { ITEMS } from "../src/config.js";
import { Audio } from "../src/audio.js";

test("weapon samples have bounded peaks, silent edges and distinct variants", () => {
  for (const id of Object.keys(GUN_PROFILES)) {
    const a = makeGun(id, 22050, 19),
      b = makeGun(id, 22050, 20);
    assert.notDeepEqual(a, b);
    assert.ok(a[0] === 0);
    assert.ok(Math.abs(a.at(-1)) < 0.001);
    let energy = 0;
    for (const x of a) {
      assert.ok(Number.isFinite(x) && Math.abs(x) < 0.9);
      energy += x * x;
    }
    assert.ok(energy / a.length > 0.001);
  }
});

test("gun transients put most spectral energy below the harsh high-frequency band", () => {
  const rate = 22050,
    n = 1024;
  for (const id of Object.keys(GUN_PROFILES)) {
    const a = makeGun(id, rate, 19);
    let high = 0,
      total = 0;
    for (let k = 1; k < n / 2; k++) {
      let re = 0,
        im = 0;
      for (let i = 0; i < n; i++) {
        const x = a[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
        re += x * Math.cos((2 * Math.PI * k * i) / n);
        im += x * Math.sin((2 * Math.PI * k * i) / n);
      }
      const energy = re * re + im * im;
      total += energy;
      if ((k * rate) / n > 4000) high += energy;
    }
    assert.ok(high / total < 0.12, `${id}: high-band fraction ${high / total}`);
  }
});

test("battle music is a finite, unclipped, continuous 16-bar loop", () => {
  const rate = 22050,
    music = makeBattleMusic(rate);
  assert.equal(music.length, Math.round(((16 * 4 * 60) / 132) * rate));
  let sum = 0;
  for (const x of music) {
    assert.ok(Number.isFinite(x) && Math.abs(x) < 0.81);
    sum += x * x;
  }
  assert.ok(Math.sqrt(sum / music.length) > 0.07);
  assert.ok(Math.abs(music[0] - music.at(-1)) < 0.02);
});

test("music pauses, resumes at its offset and stays stopped in background or when muted", () => {
  const audio = new Audio(),
    sources = [],
    ramps = [];
  audio.ready = true;
  audio.enabled = true;
  audio.musicBuffer = { duration: 29 };
  audio.context = {
    currentTime: 0,
    createBufferSource() {
      const s = {
        connect() {},
        disconnect() {},
        start(t, offset) {
          this.offset = offset;
        },
        stop() {
          this.stopped = true;
        },
      };
      sources.push(s);
      return s;
    },
  };
  audio.musicGain = {
    gain: {
      cancelScheduledValues() {},
      setValueAtTime() {},
      linearRampToValueAtTime(value) {
        ramps.push(value);
      },
    },
  };
  audio.syncMusic(); // Menu BGM starts before gameplay.
  assert.equal(sources.length, 1);
  assert.equal(ramps.at(-1), 0.34 * 0.75);
  audio.setScene("playing");
  assert.equal(sources.length, 1);
  audio.syncMusic();
  assert.equal(sources.length, 1);
  audio.setScene("buff");
  assert.equal(sources.length, 1);
  assert.ok(!sources[0].stopped);
  audio.setScene("playing");
  assert.equal(sources.length, 1);
  audio.context.currentTime = 3;
  audio.setScene("paused");
  assert.equal(sources[0].stopped, true);
  audio.setScene("playing", true);
  assert.equal(sources.length, 1);
  audio.setScene("playing", false);
  assert.equal(sources[1].offset, 3);
  audio.enabled = false;
  audio.syncMusic();
  assert.equal(sources[1].stopped, true);
  audio.setScene("menu");
  assert.equal(audio.musicOffset, 3);
  audio.enabled = true;
  audio.setScene("playing");
  assert.equal(sources[2].offset, 3);
  audio.setScene("menu");
  assert.equal(sources.length, 3);
  assert.ok(!sources[2].stopped);
  audio.setScene("menu", true);
  assert.equal(sources[2].stopped, true);
});

test("mechanical and ability samples remain bounded with smooth endpoints", () => {
  const fingerprints = new Set();
  for (const id of Object.keys(EFFECT_LAYERS)) {
    const pcm = makeEffect(id, 22050);
    let energy = 0;
    for (const x of pcm) {
      assert.ok(Number.isFinite(x) && Math.abs(x) < 1);
      energy += x * x;
    }
    assert.ok(energy > 0.1, id);
    assert.ok(pcm[0] === 0 && pcm.at(-1) === 0, id);
    fingerprints.add(`${pcm.length}:${energy}`);
  }
  assert.equal(fingerprints.size, Object.keys(EFFECT_LAYERS).length);
});

test("ultimate and item sounds retain their identity, including the last projectile", () => {
  for (const id of ["pulse", "ricochet", "charge"]) {
    const g = new Game(() => 0.5);
    g.reset("endless", "qbz191", id);
    g.ultCharge = 60;
    g.pulseCd = 0;
    g.events = [];
    assert.ok(g.activateUltimate());
    assert.ok(g.events.includes(id === "pulse" ? "pulse" : `ultimate:${id}`));
    if (id === "ricochet") {
      g.ultimate.ammo = 1;
      g.updateUltimate(0.01, { x: 0, y: 0 });
      assert.equal(g.ultimate, null);
      assert.ok(g.events.includes("ultimateFire:ricochet"));
      assert.ok(!g.events.includes("shoot"));
    }
  }
  for (const id of Object.keys(ITEMS)) {
    const g = new Game(() => 0.5);
    g.reset("endless");
    g.events = [];
    g.item = { id, ammo: 1, active: false, cd: 0 };
    assert.ok(g.useItem());
    g.updateRogue(0.02);
    assert.ok(g.events.includes(`item:${id}`));
    if (!ITEMS[id].deploy) assert.ok(g.events.includes(`itemFire:${id}`));
    else assert.equal(g.turrets.length, 3);
    assert.ok(!g.events.includes("shoot"));
  }
});
