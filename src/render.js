import { drawTar, drawTarPack } from "./tar.js";
import { drawEvolutionActor, drawEvolutionGround } from "./evolution-art.js";
import { C, COLORS, clamp } from "./config.js";
import { ART, ArtBank } from "./art.js";
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.reduced = false;
    this.art = new ArtBank();
    this.previousPlayer = null;
    this.resize();
  }
  resize() {
    const r = this.canvas.getBoundingClientRect(),
      dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.scale = Math.min(
      this.canvas.width / C.width,
      this.canvas.height / C.height,
    );
    this.ox = (this.canvas.width - C.width * this.scale) / 2;
    this.oy = (this.canvas.height - C.height * this.scale) / 2;
  }
  ring(x, y, r, color, width = 1) {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
  }
  polygon(x, y, r, n, a, color, fill) {
    const c = this.ctx;
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const t = a + (i * Math.PI * 2) / n;
      c.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r);
    }
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    c.strokeStyle = color;
    c.lineWidth = 2;
    c.stroke();
  }
  draw(g, t) {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#070e18";
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.translate(this.ox, this.oy);
    c.scale(this.scale, this.scale);
    c.save();
    c.beginPath();
    c.rect(0, 0, 1280, 720);
    c.clip();
    if (!this.reduced && g.shake > 0.1)
      c.translate(Math.sin(t * 71) * g.shake, Math.cos(t * 89) * g.shake * 0.6);
    const floor = this.art.images.get("arena");
    if (floor) {
      c.drawImage(floor, 0, 0, 1280, 720);
      c.fillStyle = "#040c1660";
      c.fillRect(0, 0, 1280, 720);
    } else {
      const glow = c.createRadialGradient(640, 330, 40, 640, 330, 750);
      glow.addColorStop(0, "#132a34");
      glow.addColorStop(1, "#080e19");
      c.fillStyle = glow;
      c.fillRect(0, 0, 1280, 720);
      c.strokeStyle = "#7bcccd0c";
      c.lineWidth = 1;
      c.beginPath();
      for (let x = 0; x <= 1280; x += 40) {
        c.moveTo(x, 0);
        c.lineTo(x, 720);
      }
      for (let y = 0; y <= 720; y += 40) {
        c.moveTo(0, y);
        c.lineTo(1280, y);
      }
      c.stroke();
      c.strokeStyle = "#7bcccd20";
      c.strokeRect(24, 60, 1232, 626);
      c.strokeStyle = "#7bcccd35";
      c.setLineDash([3, 9]);
      c.strokeRect(34, 70, 1212, 606);
      c.setLineDash([]);
      this.ring(640, 370, 185, "#8ad7d00c");
      this.ring(640, 370, 180, "#8ad7d009");
      c.strokeStyle = "#78e8db25";
      for (const [x, y, sx, sy] of [
        [24, 60, 1, 1],
        [1256, 60, -1, 1],
        [24, 686, 1, -1],
        [1256, 686, -1, -1],
      ]) {
        c.beginPath();
        c.moveTo(x, y + sy * 22);
        c.lineTo(x, y);
        c.lineTo(x + sx * 22, y);
        c.stroke();
      }
    }
    c.font = "10px monospace";
    c.fillStyle = "#a1cccc38";
    drawTar(c, g, this.reduced);
    const field = g.dangerField();
    if (field) {
      c.fillStyle = field.active ? "#ff557c33" : "#ffbf691a";
      c.strokeStyle = field.active ? "#ff557c" : "#ffbf69";
      const w = field.width;
      const rects = field.vertical
        ? [
            [0, 60, w, 626],
            [1280 - w, 60, w, 626],
          ]
        : [
            [0, 60, 1280, w],
            [0, 680 - w, 1280, w],
          ];
      for (const r of rects) {
        c.fillRect(...r);
        c.strokeRect(...r);
      }
      c.fillStyle = "#ffbf69";
      c.font = "bold 14px monospace";
      c.textAlign = "center";
      c.fillText(
        field.active
          ? "边界灼烧 · 向安全区域移动"
          : `边界灼烧预警 ${field.warning.toFixed(1)}s`,
        640,
        110,
      );
      c.textAlign = "left";
    }
    drawEvolutionGround(this, g);
    for (const e of g.enemies) {
      if (e.pending) {
        const p = e.pending;
        c.save();
        c.strokeStyle = e.type === "boss" ? "#ff6985aa" : "#ffbf6966";
        c.fillStyle = "#ff688018";
        c.lineWidth = 2;
        c.setLineDash([8, 7]);
        if (p.kind === "laser") {
          c.beginPath();
          c.moveTo(e.x, e.y);
          c.arc(e.x, e.y, 1600, p.start, p.end);
          c.closePath();
          c.fill();
          c.beginPath();
          c.moveTo(e.x, e.y);
          c.lineTo(
            e.x + Math.cos(p.start) * 1600,
            e.y + Math.sin(p.start) * 1600,
          );
          c.stroke();
        } else if (p.kind === "ring")
          this.ring(e.x, e.y, e.r + 15 + (1 - p.t / p.max) * 40, "#ff6985", 2);
        else if (e.bossKind === "tree" && p.kind === "fan") {
          const spread = e.hp <= e.maxHp / 2 ? 0.54 : 0.36;
          c.strokeStyle = "#b6ed83";
          c.fillStyle = "#95d96118";
          c.beginPath();
          c.moveTo(e.x, e.y);
          c.arc(e.x, e.y, 360, p.a - spread, p.a + spread);
          c.closePath();
          c.fill();
          c.stroke();
        } else {
          c.beginPath();
          c.moveTo(e.x, e.y);
          c.lineTo(e.x + Math.cos(p.a) * 300, e.y + Math.sin(p.a) * 300);
          c.stroke();
        }
        c.restore();
      }
      if (e.laser) {
        const l = e.laser;
        c.strokeStyle = "#ff5777";
        c.lineWidth = 18;
        c.beginPath();
        c.moveTo(e.x, e.y);
        c.lineTo(e.x + Math.cos(l.ang) * 1600, e.y + Math.sin(l.ang) * 1600);
        c.stroke();
        c.strokeStyle = "#ffe9d8";
        c.lineWidth = 5;
        c.stroke();
      }
    }
    for (const b of g.beams) {
      c.save();
      c.lineCap = "round";
      const pulse = this.reduced ? 1 : 0.9 + 0.1 * Math.sin(g.time * 32);
      for (const [width, color] of [
        [b.width * 2.6, "#b295ff28"],
        [b.width, "#cbb8ffbb"],
        [4, "#fff9ff"],
      ]) {
        c.lineWidth = width * pulse;
        c.strokeStyle = color;
        c.beginPath();
        c.moveTo(b.x, b.y);
        c.lineTo(b.endX, b.endY);
        c.stroke();
      }
      this.ring(b.x, b.y, 5, "#ede1ff", 2);
      c.restore();
    }
    for (const b of [
      ...g.bullets.active,
      ...g.specialBullets.active,
      ...g.turretBullets.active,
    ]) {
      c.strokeStyle =
        b.special === "electric"
          ? "#88dfff"
          : b.special === "charm" || b.special === "ally"
            ? "#ffa7e7"
            : b.ultimate
              ? "#ffd58b"
              : b.burnDps
                ? "#ffb06d"
                : b.iceChance
                  ? "#93dbff"
                  : g.weapon.color;
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(b.x - b.vx * 0.018, b.y - b.vy * 0.018);
      c.lineTo(b.x, b.y);
      c.stroke();
      c.fillStyle = "#fff";
      c.fillRect(b.x - 2, b.y - 2, 4, 4);
    }
    for (const h of g.hazards.active) {
      this.ring(h.x, h.y, 7, "#ff758d", 2);
      c.fillStyle = "#ff9b89";
      c.beginPath();
      c.arc(h.x, h.y, 3, 0, 7);
      c.fill();
    }
    for (const e of g.enemies) {
      c.save();
      if (e.warm > 0) c.globalAlpha = 0.4 + Math.sin(t * 25) * 0.2;
      const color =
        e.flash > 0
          ? "#ffffff"
          : e.ally
            ? "#ffa7e7"
            : e.frozen > 0
              ? "#93dbff"
              : e.bossKind === "tree"
                ? "#9eefab"
                : COLORS[e.type];
      if (e.burn > 0) this.ring(e.x, e.y, e.r + 5, "#ff9b59", 2);
      if (e.ally) {
        this.ring(e.x, e.y, e.r + 7, "#ffa7e7", 2);
        c.fillStyle = "#ffa7e7";
        c.font = "12px monospace";
        c.fillText("友军", e.x - 12, e.y - e.r - 10);
      }
      const angle = Math.atan2(g.player.y - e.y, g.player.x - e.x);
      const n =
        e.type === "charger"
          ? 3
          : e.type === "shooter"
            ? 4
            : e.type === "boss"
              ? 6
              : 5;
      const facing = e.laser?.ang ?? e.pending?.a ?? angle;
      const spriteSize = ART[e.type]?.size || e.r * 2;
      c.fillStyle = "#00000055";
      c.beginPath();
      c.ellipse(e.x, e.y + 4, e.r, e.r * 0.65, 0, 0, Math.PI * 2);
      c.fill();
      const bob = this.reduced
        ? 0
        : Math.sin(g.time * (e.type === "shooter" ? 3 : 8) + e.x) * 0.65;
      if (
        !drawEvolutionActor(c, e, g.time, this.reduced, this.art) &&
        !this.art.sprite(
          c,
          e.type,
          e.x,
          e.y + bob,
          facing,
          spriteSize,
          e.flash > 0,
        )
      ) {
        this.polygon(e.x, e.y, e.r, n, facing, color, color + "18");
        this.polygon(e.x, e.y, e.r * 0.48, n, -facing, color, color + "20");
      }
      // Status marks stay visible independently of sprite colors.
      if (e.frozen > 0) {
        this.ring(e.x, e.y, e.r + 3, "#93dbff", 2);
        for (let i = 0; i < 3; i++)
          this.polygon(
            e.x + Math.cos(i * 2.1) * e.r,
            e.y + Math.sin(i * 2.1) * e.r,
            4,
            4,
            0,
            "#d4f8ff",
            "#8bdfff",
          );
      }
      if (e.burn > 0) {
        for (let i = 0; i < 3; i++) {
          const a = i * 2.1 + g.time * 2;
          this.polygon(
            e.x + Math.cos(a) * e.r,
            e.y + Math.sin(a) * e.r,
            3,
            3,
            a,
            "#ffbe69",
            "#ff7845",
          );
        }
      }
      if (e.pending && e.type === "boss") {
        this.ring(e.x, e.y, 12 + Math.sin(g.time * 16) * 2, "#ffb18f", 3);
      }
      if (e.shield > 0) this.ring(e.x, e.y, e.r + 7, "#73baff", 3);
      if (e.type === "boss") {
        this.ring(e.x, e.y, e.r + 9, color + "60");
        if (e.hp < e.maxHp / 2) this.ring(e.x, e.y, 15, "#ff496f", 3);
      } else if (e.hp < e.maxHp) {
        c.fillStyle = "#253744";
        c.fillRect(e.x - 17, e.y - e.r - 10, 34, 3);
        c.fillStyle = color;
        c.fillRect(
          e.x - 17,
          e.y - e.r - 10,
          34 * Math.max(0, e.hp / e.maxHp),
          3,
        );
      }
      c.restore();
    }
    if (g.coin) {
      this.ring(
        g.coin.x,
        g.coin.y,
        20 + Math.sin(g.time * 5) * 3,
        "#ffcf78",
        2,
      );
      if (
        !this.art.sprite(c, "icon-coin", g.coin.x, g.coin.y, g.time * 0.3, 27)
      )
        this.polygon(g.coin.x, g.coin.y, 12, 6, g.time, "#ffe5ab", "#805c20");
    }
    if (["move", "dodge"].includes(g.tutorial?.step))
      this.ring(g.tutorial.target.x, g.tutorial.target.y, 35, "#a2ffdf", 3);
    if (g.ashes && g.state === "ashes") {
      const a = g.ashes,
        progress = a.age / 1.2;
      if (a.bossKind === "tree") {
        c.save();
        c.globalAlpha = Math.max(0, 1 - progress * 1.5);
        drawEvolutionActor(
          c,
          { ...a, type: "boss", bossKind: "tree", id: 0 },
          g.time,
          this.reduced,
          this.art,
        );
        c.restore();
      }
      for (let i = 0; i < 100; i++) {
        const angle = i * 2.39996,
          radius = Math.sqrt(i / 100) * 46;
        const drift = progress * (40 + (i % 11) * 8);
        c.globalAlpha = Math.max(0, 1 - progress);
        c.fillStyle =
          a.bossKind === "tree"
            ? i % 4 === 0
              ? "#c6ed9a"
              : "#587c65"
            : i % 4 === 0
              ? "#ffd58b"
              : "#b9abb9";
        c.fillRect(
          a.x + Math.cos(angle) * (radius + drift),
          a.y + Math.sin(angle) * radius - progress * (40 + (i % 17) * 5),
          3,
          3,
        );
      }
      c.globalAlpha = 1;
      this.ring(
        a.x,
        a.y,
        46 + progress * 95,
        `rgba(255,140,165,${1 - progress})`,
        2,
      );
    }
    if (g.pulse) {
      const s = g.pulse,
        a = clamp(1 - s.age / 0.55, 0, 1),
        r = C.pulseRadius * (1 - (1 - s.age / 0.55) ** 3);
      c.save();
      c.globalAlpha = a;
      this.ring(s.x, s.y, r, "#80ffe2", 4);
      this.ring(s.x, s.y, r * 0.88, "#80ffe240", 18);
      c.restore();
    }
    for (const a of g.particles.active) {
      c.globalAlpha = clamp(a.life / 0.4, 0, 1);
      c.fillStyle = a.color;
      c.save();
      c.translate(a.x, a.y);
      c.rotate(a.life * 9);
      c.fillRect(-2, -1, 4, 2);
      c.restore();
    }
    c.globalAlpha = 1;
    const p = g.player;
    if (g.state !== "menu") {
      c.save();
      if (g.dodge.left > 0) {
        for (let i = 3; i > 0; i--) {
          this.ring(
            p.x - g.dodge.x * i * 15,
            p.y - g.dodge.y * i * 15,
            p.r + 2,
            `rgba(119,231,255,${0.28 / i})`,
            2,
          );
        }
      }
      c.translate(p.x, p.y);
      drawTarPack(c, g);
      this.ring(0, 0, 25, "#65f2d329");
      if (p.invuln > 0) this.ring(0, 0, 28, "#a8ffed88", 2);
      if (g.ultimate?.kind === "charge") {
        c.save();
        c.rotate(p.angle);
        c.strokeStyle = "#a9caff";
        c.lineWidth = 7;
        c.beginPath();
        c.arc(0, 0, 34, -1.2, 1.2);
        c.stroke();
        c.strokeStyle = "#a9caff55";
        c.lineWidth = 3;
        for (let i = -1; i <= 1; i++) {
          c.beginPath();
          c.moveTo(-28, i * 14);
          c.lineTo(-90, i * 20);
          c.stroke();
        }
        c.restore();
      }
      if (g.ultimate?.kind === "ricochet") this.ring(0, 0, 32, "#ffd58baa", 3);
      const moved =
        this.previousPlayer &&
        Math.hypot(p.x - this.previousPlayer.x, p.y - this.previousPlayer.y) >
          0.05;
      this.previousPlayer = { x: p.x, y: p.y };
      c.rotate(p.angle);
      const recoil = this.reduced
        ? 0
        : clamp((g.shotCd - p.fireDelay + 0.045) / 0.045, 0, 1) * 1.6;
      const bob = moved && !this.reduced ? Math.sin(g.time * 18) * 0.7 : 0;
      if (moved && !this.reduced) {
        c.fillStyle = "#86ffe6";
        c.fillRect(-23, -9, 5 + Math.sin(g.time * 35) * 2, 2);
        c.fillRect(-23, 7, 5 + Math.sin(g.time * 35) * 2, 2);
      }
      const hasPlayer = this.art.sprite(
        c,
        "player",
        -recoil,
        bob,
        0,
        39,
        p.invuln > 0 && Math.sin(g.time * 35) > 0,
      );
      if (!hasPlayer) {
        c.fillStyle =
          p.invuln > 0 && Math.sin(t * 35) > 0 ? "#ffffff" : "#8bffe6";
        c.shadowBlur = 15;
        c.shadowColor = "#53fcd4";
        c.beginPath();
        c.moveTo(21, 0);
        c.lineTo(-12, -12);
        c.lineTo(-7, 0);
        c.lineTo(-12, 12);
        c.closePath();
        c.fill();
        c.shadowBlur = 0;
      }
      const weaponKey = `weapon-${g.weaponId}`;
      const weaponSize = ART[weaponKey]?.size || 29;
      if (!this.art.sprite(c, weaponKey, 13 - recoil, 0, 0, weaponSize)) {
        c.fillStyle =
          g.ultimate?.kind === "ricochet" ? "#ffd58b" : g.weapon.color;
        c.fillRect(
          12,
          -3,
          g.weaponId === "mg42" ? 22 : 15,
          g.weaponId === "aa12" ? 8 : 5,
        );
      }
      if (recoil > 0.1 && !g.ultimate && g.reloadLeft <= 0) {
        const muzzle =
          13 -
          recoil +
          weaponSize * (ART[weaponKey].muzzle[0] - ART[weaponKey].anchor[0]);
        this.polygon(muzzle, 0, 5, 4, 0, "#fff2b4", "#ffd17d");
      }
      c.restore();
    }
    for (const n of g.numbers.active) {
      c.globalAlpha = clamp(n.life / 0.25, 0, 1);
      c.fillStyle = n.color;
      c.font = "bold 13px monospace";
      c.textAlign = "center";
      c.fillText(n.text, n.x, n.y);
    }
    c.globalAlpha = 1;
    c.textAlign = "left";
    if (g.state === "menu") {
      c.globalAlpha = 0.3;
      for (let i = 0; i < 4; i++) {
        const x = 790 + i * 130,
          y = 240 + Math.sin(i * 2 + t * 0.4) * 140;
        this.polygon(
          x,
          y,
          16 + (i % 3) * 5,
          i % 2 ? 3 : 5,
          t * 0.1 + i,
          ["#ff637b", "#b79aff", "#ffbf69"][i % 3],
          "#ffffff03",
        );
      }
    }
    c.restore();
  }
}
