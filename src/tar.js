import { ULTIMATES } from "./weapons.js";
const spec = () => ULTIMATES.tar;
export const tarMethods = {
  resetTar() {
    this.tar = {
      energy: spec().energy,
      active: false,
      tick: 0,
      lastX: this.player.x,
      lastY: this.player.y,
      patches: [],
    };
  },
  clearTar() {
    this.tar.active = false;
    this.tar.patches = [];
    this.tar.tick = 0;
  },
  toggleTar() {
    if (
      this.state !== "playing" ||
      this.ultimateId !== "tar" ||
      this.tar.energy <= 0
    )
      return false;
    this.tar.active = !this.tar.active;
    if (this.tar.active) {
      this.tar.lastX = this.player.x;
      this.tar.lastY = this.player.y;
      this.placeTar(this.player.x, this.player.y);
      if (this.tutorial) {
        this.tutorial.didSkill = true;
        this.tutorial.tarOrigin = { x: this.player.x, y: this.player.y };
      }
      this.event("ultimate:tar");
    } else if (this.tutorial) this.tutorial.tarClosed = true;
    return true;
  },
  placeTar(x, y) {
    const near = this.tar.patches.find(
      (p) => Math.hypot(p.x - x, p.y - y) < spec().spacing * 0.75,
    );
    if (near) near.life = spec().life;
    else this.tar.patches.push({ x, y, life: spec().life });
  },
  updateTar(dt) {
    if (this.state !== "playing") return;
    const t = this.tar,
      s = spec();
    t.patches = t.patches.filter((p) => (p.life -= dt) > 0);
    if (this.ultimateId === "tar") {
      if (t.active) {
        const dx = this.player.x - t.lastX,
          dy = this.player.y - t.lastY,
          length = Math.hypot(dx, dy);
        const steps = Math.floor(length / s.spacing);
        for (let i = 1; i <= steps; i++)
          this.placeTar(
            t.lastX + (dx / length) * s.spacing * i,
            t.lastY + (dy / length) * s.spacing * i,
          );
        if (steps) {
          t.lastX += (dx / length) * s.spacing * steps;
          t.lastY += (dy / length) * s.spacing * steps;
        }
        this.placeTar(this.player.x, this.player.y);
        t.energy = Math.max(0, t.energy - s.drain * dt);
        if (t.energy < 1e-8) {
          t.energy = 0;
          t.active = false;
        }
      } else t.energy = Math.min(s.energy, t.energy + s.recharge * dt);
    }
    t.tick += dt;
    while (t.tick >= s.tick - 1e-9) {
      t.tick = Math.max(0, t.tick - s.tick);
      for (const e of [...this.enemies]) {
        if (
          e.hp <= 0 ||
          e.ally ||
          !t.patches.some(
            (p) => Math.hypot(e.x - p.x, e.y - p.y) <= s.radius + e.r,
          )
        )
          continue;
        if (
          this.tutorial?.step === "skill" &&
          this.tutorial.tarOrigin &&
          Math.hypot(
            this.player.x - this.tutorial.tarOrigin.x,
            this.player.y - this.tutorial.tarOrigin.y,
          ) > 24
        )
          this.tutorial.tarHit = true;
        this.hurtEnemy(e, s.damage * s.tick, 0, 0, false, false, "tar");
        e.flash = Math.max(e.flash, 0.035);
        if (this.bossDefeated) break;
      }
    }
  },
};
export function drawTar(c, g, reduced) {
  const s = spec(),
    patches = g.tar.patches;
  if (!patches.length) return;
  c.save();
  // Two union silhouettes leave only the outside rim, not overlapping rings.
  const silhouette = (radius) => {
    c.beginPath();
    for (const p of patches) {
      c.moveTo(p.x + radius, p.y);
      c.ellipse(p.x, p.y, radius, radius, 0, 0, Math.PI * 2);
    }
  };
  c.globalAlpha = 0.8;
  c.fillStyle = "#f47c2f";
  if (!reduced) {
    c.shadowColor = "#fa702aaa";
    c.shadowBlur = 9;
  }
  silhouette(s.radius);
  c.fill();
  c.shadowBlur = 0;
  c.fillStyle = "#1d1415";
  c.globalAlpha = 0.94;
  silhouette(s.radius - 3);
  c.fill();
  for (let i = 0; i < patches.length; i++) {
    const p = patches[i];
    if (i % 2) continue;
    const flicker = Math.sin(g.time * 9 + p.x * 0.07),
      fade = Math.min(1, p.life);
    c.globalAlpha = fade * 0.65;
    c.strokeStyle = "#ce652755";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(p.x - 8, p.y + 5);
    c.lineTo(p.x + 1, p.y - 5);
    c.lineTo(p.x + 9, p.y + 1);
    c.stroke();
    for (const side of [-1, 1]) {
      const y = p.y + side * (s.radius - 6);
      if (
        patches.some(
          (q) => q !== p && Math.hypot(p.x - q.x, y - q.y) < s.radius - 9,
        )
      )
        continue;
      c.fillStyle = "#f5933f";
      c.globalAlpha = fade * 0.8;
      c.beginPath();
      c.moveTo(p.x - 5, y + 3);
      c.quadraticCurveTo(
        p.x + 4,
        y - 3,
        p.x + flicker * 3,
        y - 13 - flicker * 4,
      );
      c.quadraticCurveTo(p.x + 11, y + 4, p.x - 5, y + 3);
      c.fill();
      c.fillStyle = "#ffe198";
      c.beginPath();
      c.moveTo(p.x - 1, y + 2);
      c.lineTo(p.x + 2, y - 5);
      c.lineTo(p.x + 5, y + 2);
      c.fill();
      if (!reduced) {
        const phase = (g.time * 1.6 + i * 0.31) % 1;
        c.globalAlpha = fade * (1 - phase) * 0.6;
        c.fillRect(p.x + 6, y - phase * 24, 2, 2);
      }
    }
  }
  c.restore();
}
export function drawTarPack(c, g) {
  if (g.ultimateId !== "tar") return;
  c.save();
  c.rotate(g.player.angle);
  c.translate(-15, 0);
  for (const y of [-8, 8]) {
    c.fillStyle = "#18242e";
    c.strokeStyle = g.tar.active ? "#ffb05a" : "#6caaa5";
    c.lineWidth = 2;
    c.fillRect(-9, y - 5, 16, 10);
    c.strokeRect(-9, y - 5, 16, 10);
    c.fillStyle = "#6ef0de";
    c.fillRect(-5, y - 3, 3, 6);
  }
  if (g.tar.active) {
    c.fillStyle = "#ff7b35";
    c.beginPath();
    c.moveTo(-11, -5);
    c.lineTo(-24 - Math.sin(g.time * 25) * 4, 0);
    c.lineTo(-11, 5);
    c.fill();
  }
  c.restore();
}
