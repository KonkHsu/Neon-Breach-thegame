export class Haptics {
  constructor(device = globalThis.navigator, enabled = false) {
    this.device = device;
    this.available = typeof device?.vibrate === "function";
    const appleMobile =
      /iPhone|iPad|iPod/.test(device?.userAgent || "") ||
      (device?.platform === "MacIntel" && device?.maxTouchPoints > 1);
    this.unsupportedReason = appleMobile
      ? "当前 iPhone / iPad 环境不支持游戏震动"
      : "当前设备不支持震动";
    this.enabled = this.available && enabled;
    this.playing = false;
  }
  setEnabled(value) {
    this.enabled = this.available && value;
    if (!this.enabled) this.stop();
  }
  setPlaying(value) {
    if (this.playing && !value) this.stop();
    this.playing = value;
  }
  stop() {
    if (this.available) {
      try {
        this.device.vibrate(0);
      } catch {}
    }
  }
  play(event) {
    if (!this.enabled || !this.playing) return;
    const pattern =
      event === "hit"
        ? [35, 25, 25]
        : event === "haptic:skill" || event.startsWith("ultimate:")
          ? 30
          : event.startsWith("item:")
            ? 20
            : null;
    if (pattern === null) return;
    try {
      this.device.vibrate(pattern);
    } catch {}
  }
}
