import { assetUrl } from "./asset-url.js";
import { makeGun, makeEffect, EFFECT_LAYERS } from "./sound-design.js";

/** Original weapon/BGM design; legacy event names retain the AudioBus API role. */
export class Audio {
  constructor() {
    this.enabled = true;
    this.ready = false;
    this.scene = "menu";
    this.hidden = false;
    this.guns = new Map();
    this.effects = new Map();
    this.lastEffects = new Map();
    this.voices = new Set();
    this.shotIndex = 0;
    this.lastShot = -1;
    this.musicOffset = 0;
  }
  unlock() {
    try {
      if (!this.context) {
        const ac = (this.context = new (
          window.AudioContext || window.webkitAudioContext
        )());
        this.master = ac.createGain();
        this.master.gain.value = 0;
        const limiter = ac.createDynamicsCompressor();
        limiter.threshold.value = -8;
        limiter.knee.value = 8;
        limiter.ratio.value = 8;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.12;
        this.master.connect(limiter);
        limiter.connect(ac.destination);
        this.sfx = ac.createGain();
        this.sfx.gain.value = 0.65;
        const filter = ac.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 3200;
        filter.Q.value = 0.5;
        this.sfx.connect(filter);
        filter.connect(this.master);
        this.musicGain = ac.createGain();
        this.musicGain.gain.value = 0;
        this.musicGain.connect(this.master);
      }
      this.ready = true;
      if (this.context.state === "suspended")
        this.context.resume().catch(() => {});
      this.master.gain.setTargetAtTime(
        this.enabled ? 0.85 : 0,
        this.context.currentTime,
        0.025,
      );
      this.syncMusic();
    } catch {
      this.ready = false;
    }
  }
  setEnabled(value) {
    this.enabled = value;
    this.unlock();
    if (!value) this.stopVoices();
  }
  setScene(scene, hidden = false) {
    if (this.scene === scene && this.hidden === hidden) return;
    this.scene = scene;
    this.hidden = hidden;
    if (hidden || scene === "paused") this.stopVoices();
    if (scene === "won" || scene === "lost") this.musicOffset = 0;
    this.syncMusic();
  }
  syncMusic() {
    if (!this.ready) return;
    const active =
      this.enabled &&
      !this.hidden &&
      ["menu", "playing", "buff"].includes(this.scene);
    if (!active) {
      if (this.musicSource) {
        if (!["won", "lost"].includes(this.scene)) {
          this.musicOffset =
            (this.musicOffset + this.context.currentTime - this.musicStarted) %
            this.musicBuffer.duration;
        }
        this.musicSource.stop();
        this.musicSource.disconnect();
        this.musicSource = null;
      }
      return;
    }
    if (!this.musicBuffer) {
      if (
        !this.musicLoading &&
        (!this.musicRetryAt || Date.now() >= this.musicRetryAt)
      ) {
        this.musicLoading = fetch(assetUrl("audio/battle.wav"))
          .then((response) => {
            if (!response.ok) throw new Error("Music unavailable");
            return response.arrayBuffer();
          })
          .then((data) => this.context.decodeAudioData(data))
          .then((buffer) => {
            this.musicBuffer = buffer;
            this.syncMusic();
          })
          .catch(() => {
            this.musicRetryAt = Date.now() + 5000;
          })
          .finally(() => {
            this.musicLoading = null;
          });
      }
      return;
    }
    if (this.musicSource) return;
    const source = this.context.createBufferSource();
    source.buffer = this.musicBuffer;
    source.loop = true;
    source.connect(this.musicGain);
    this.musicGain.gain.cancelScheduledValues(this.context.currentTime);
    this.musicGain.gain.setValueAtTime(0, this.context.currentTime);
    this.musicGain.gain.linearRampToValueAtTime(
      0.255,
      this.context.currentTime + 0.25,
    );
    this.musicStarted = this.context.currentTime;
    source.start(0, this.musicOffset);
    this.musicSource = source;
  }
  stopVoices() {
    for (const source of this.voices) {
      try {
        source.stop();
      } catch {}
    }
    this.voices.clear();
  }
  track(source, nodes = []) {
    // Bound polyphony even with high fire-rate upgrades and overlapping events.
    if (this.voices.size >= 24) {
      const oldest = this.voices.values().next().value;
      oldest.stop();
      this.voices.delete(oldest);
    }
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      for (const node of nodes) node.disconnect();
    };
  }
  gun(id) {
    const ac = this.context,
      t = ac.currentTime;
    if (t - this.lastShot < 0.012) return;
    this.lastShot = t;
    const variant = this.shotIndex++ % 4,
      key = `${id}:${variant}`;
    if (!this.guns.has(key)) {
      const pcm = makeGun(id, ac.sampleRate, variant + 19);
      const buffer = ac.createBuffer(1, pcm.length, ac.sampleRate);
      buffer.copyToChannel(pcm, 0);
      this.guns.set(key, buffer);
    }
    const source = ac.createBufferSource();
    source.buffer = this.guns.get(key);
    source.playbackRate.value = 0.985 + variant * 0.01;
    source.connect(this.sfx);
    this.track(source);
    source.start(t);
    // Keep the score audible but leave room for weapon transients.
    if (this.musicSource) {
      const gain = this.musicGain.gain;
      gain.cancelScheduledValues(t);
      gain.setValueAtTime(gain.value, t);
      gain.linearRampToValueAtTime(0.1725, t + 0.008);
      gain.linearRampToValueAtTime(0.255, t + 0.16);
    }
  }
  effect(id) {
    if (id === "item:sentry") id = "item:electric";
    const ac = this.context,
      t = ac.currentTime;
    const interval = id === "itemFire:beam" ? 0.085 : 0.035;
    if (t - (this.lastEffects.get(id) ?? -Infinity) < interval) return;
    this.lastEffects.set(id, t);
    if (!this.effects.has(id)) {
      const pcm = makeEffect(id, ac.sampleRate);
      if (!pcm) return;
      const buffer = ac.createBuffer(1, pcm.length, ac.sampleRate);
      buffer.copyToChannel(pcm, 0);
      this.effects.set(id, buffer);
    }
    const source = ac.createBufferSource();
    source.buffer = this.effects.get(id);
    source.connect(this.sfx);
    this.track(source);
    source.start(t);
  }
  tone(frequency, duration, volume = 0.15, type = "sine", delay = 0) {
    const ac = this.context,
      t = ac.currentTime + delay;
    const source = ac.createOscillator(),
      gain = ac.createGain();
    source.type = type;
    source.frequency.value = frequency;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(gain);
    gain.connect(this.sfx);
    this.track(source, [gain]);
    source.start(t);
    source.stop(t + duration + 0.01);
  }
  play(event, weapon = "qbz191") {
    if (!this.enabled || !this.ready || this.hidden) return;
    try {
      if (event === "item:sentry") {
        this.effect("item:electric");
        return;
      }
      if (Object.hasOwn(EFFECT_LAYERS, event)) {
        this.effect(event);
        return;
      }
      switch (event) {
        case "shoot":
          this.gun(weapon);
          break;
        case "kill":
          this.tone(105, 0.055, 0.08);
          break;
        case "hit":
        case "lost":
          this.tone(125, 0.16, 0.23, "triangle");
          break;
        case "buff":
          this.tone(440, 0.16, 0.13);
          this.tone(660, 0.2, 0.1, "sine", 0.08);
          break;
        case "boss":
          this.tone(146, 0.35, 0.23, "triangle");
          this.tone(155, 0.35, 0.15, "triangle");
          break;
        case "bossFire":
          this.tone(80, 0.22, 0.2, "triangle");
          break;
        case "win":
          this.tone(294, 0.3);
          this.tone(370, 0.3, 0.15, "sine", 0.1);
          this.tone(440, 0.5, 0.15, "sine", 0.2);
          break;
      }
    } catch {}
  }
}
