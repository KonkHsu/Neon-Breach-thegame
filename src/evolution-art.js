import { EVOLUTION as E } from "./config.js";

const symbols = {
  frenzy: ["#ffb45e", "M18 48 34 28 29 42 48 18 40 41 47 38 29 57 33 43Z"],
  thermal: [
    "#eeb9ff",
    "M32 9 39 24 55 32 39 40 32 55 25 40 9 32 25 24Z M17 15 47 49 M47 15 17 49",
  ],
  ember: [
    "#ff985c",
    "M32 12 Q50 29 43 44 Q31 58 19 44 Q11 30 25 21 Q22 35 30 35 Q37 31 32 12Z M8 47 13 39 M53 47 56 39",
  ],
  salvage: [
    "#98f9cc",
    "M17 27 A17 17 0 1 1 16 42 M17 15 17 27 29 27 M29 30H37V43H29Z",
  ],
  sentry: [
    "#8be4c4",
    "M32 36 13 54 M32 36 50 54 M32 36V58 M21 25H43V39H21Z M30 25V10H35V25 M43 28H50V36H43Z",
  ],
  tree: [
    "#9bffb2",
    "M30 57V25L18 17 12 7 M32 26 43 17 48 6 M31 37 17 30 6 20 M33 38 47 28 57 20 M31 53 16 59 M34 53 49 59 M21 14 32 5 43 14 38 25H26Z",
  ],
  mage: [
    "#c6a0ff",
    "M12 50 17 25 32 9 47 25 52 50 32 44Z M23 29H28 M36 29H41 M8 54 32 60 56 54 M52 13 57 18 52 23 47 18Z",
  ],
  tomb: [
    "#b49edc",
    "M17 54V22Q17 8 32 8Q47 8 47 22V54Z M10 56H54 M32 19V38 M23 26H41 M36 42 30 47 35 54",
  ],
};
export function vectorAsset(id) {
  const key = id.replace("icon-", ""),
    entry = symbols[key];
  if (!entry) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="3" y="3" width="58" height="58" rx="15" fill="#101e2b" stroke="${entry[0]}" stroke-opacity=".3"/><path d="${entry[1]}" stroke="${entry[0]}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="${entry[0]}" fill-opacity=".18"/></svg>`;
}
export const vectorIds = Object.keys(symbols).map((id) =>
  ["tree", "mage", "tomb"].includes(id) ? id : "icon-" + id,
);

function line(c, points, color, width = 2) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
}
export function drawEvolutionActor(c, e, time, reduced = false, art = null) {
  const kind = e.type === "boss" ? e.bossKind : e.type;
  if (!["tree", "mage", "tomb", "sentry"].includes(kind)) return false;
  // Raster actors share the established armored sprite language; combat overlays
  // remain procedural so status and telegraphs stay legible at every quality level.
  const bob =
    reduced || kind === "tomb" || kind === "sentry"
      ? 0
      : Math.sin(time * 3 + (e.id || 0)) * 1.1;
  if (
    art?.sprite(
      c,
      kind,
      e.x,
      e.y + bob,
      kind === "sentry" ? e.angle : 0,
      undefined,
      e.flash > 0,
    )
  ) {
    c.save();
    c.translate(e.x, e.y);
    if (kind === "sentry") {
      if (e.muzzle > 0) {
        c.save();
        c.rotate(e.angle);
        c.fillStyle = "#fff2b0";
        c.beginPath();
        c.moveTo(28, -6);
        c.lineTo(43, 0);
        c.lineTo(28, 6);
        c.fill();
        c.restore();
      }
      if (!reduced && e.hp / e.maxHp < 0.4) {
        c.fillStyle = "#9296a980";
        c.beginPath();
        c.arc(-6, -20 - ((time * 13) % 13), 5, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = "#101d28";
      c.fillRect(-21, -38, 42, 4);
      c.fillStyle = "#85ebce";
      c.fillRect(-21, -38, 42 * Math.max(0, e.hp / e.maxHp), 4);
    } else if (kind === "tomb") {
      c.strokeStyle = "#bc86ff";
      c.lineWidth = 1.5;
      c.beginPath();
      c.ellipse(0, 26, 29, 9, 0, 0, Math.PI * 2);
      c.stroke();
      if (e.hp / e.maxHp < 0.7)
        line(
          c,
          [
            [5, -8],
            [-2, 0],
            [5, 8],
            [-4, 19],
          ],
          "#f0caff",
          1.5,
        );
    } else if (kind === "tree" && !reduced) {
      c.globalAlpha = 0.2 + (Math.sin(time * 5) + 1) * 0.15;
      c.fillStyle = e.hp < e.maxHp / 2 ? "#ffbd5c" : "#b9ff61";
      c.beginPath();
      c.ellipse(0, 8, 7, 9, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    return true;
  }
  c.save();
  c.translate(e.x, e.y);
  c.lineJoin = "round";
  c.lineCap = "round";
  const color =
    e.flash > 0
      ? "#fff"
      : kind === "tree"
        ? "#a2ef9b"
        : kind === "sentry"
          ? "#98e8d3"
          : "#c1a2ee";
  const pulse = reduced ? 1 : 1 + Math.sin(time * 4 + e.id) * 0.06;
  if (kind === "tree") {
    c.fillStyle = "#142f31";
    c.strokeStyle = color;
    c.lineWidth = 3;
    for (const [x, y] of [
      [-44, -4],
      [-35, -30],
      [-15, -46],
      [12, -50],
      [37, -34],
      [46, -8],
    ]) {
      line(
        c,
        [
          [0, 20],
          [x * 0.55, y * 0.5 + 6],
          [x, y],
        ],
        "#426b53",
        7,
      );
      line(
        c,
        [
          [0, 20],
          [x * 0.55, y * 0.5 + 6],
          [x, y],
        ],
        color,
        1.5,
      );
      c.save();
      c.translate(x, y);
      c.rotate(x / 95);
      c.fillStyle = "#244d3c";
      c.strokeStyle = color;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(0, -17 * pulse);
      c.lineTo(14, -2);
      c.lineTo(10, 11);
      c.lineTo(0, 16);
      c.lineTo(-13, 4);
      c.lineTo(-12, -6);
      c.closePath();
      c.fill();
      c.stroke();
      line(
        c,
        [
          [0, 12],
          [0, -10],
        ],
        "#72bb7c",
        1,
      );
      c.restore();
    }
    c.fillStyle = "#253b30";
    c.beginPath();
    c.moveTo(-12, 35);
    c.lineTo(-18, -15);
    c.lineTo(0, -33);
    c.lineTo(19, -13);
    c.lineTo(12, 35);
    c.closePath();
    c.fill();
    c.stroke();
    line(
      c,
      [
        [-8, -11],
        [-2, 1],
        [-7, 15],
        [4, 26],
      ],
      "#d7ffad",
      3,
    );
    c.fillStyle = e.hp < e.maxHp / 2 ? "#ffd27a" : "#dfffac";
    c.beginPath();
    c.ellipse(0, 0, 7 * pulse, 13 * pulse, 0, 0, Math.PI * 2);
    c.fill();
    line(
      c,
      [
        [-14, 33],
        [-34, 49],
        [-50, 49],
      ],
      color,
      3,
    );
    line(
      c,
      [
        [12, 33],
        [31, 44],
        [49, 40],
      ],
      color,
      3,
    );
  } else if (kind === "mage") {
    const bob = reduced ? 0 : Math.sin(time * 5 + e.id) * 2;
    c.translate(0, bob);
    c.fillStyle = "#302347";
    c.strokeStyle = color;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, -24);
    c.lineTo(18, -3);
    c.lineTo(21, 19);
    c.lineTo(0, 14);
    c.lineTo(-21, 19);
    c.lineTo(-18, -3);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = "#0c1429";
    c.beginPath();
    c.ellipse(0, -2, 10, 12, 0, 0, Math.PI * 2);
    c.fill();
    line(
      c,
      [
        [-6, -4],
        [-3, -3],
      ],
      "#e1cfff",
      3,
    );
    line(
      c,
      [
        [3, -3],
        [6, -4],
      ],
      "#e1cfff",
      3,
    );
    for (let i = 0; i < 3; i++) {
      const a = time * 0.7 + i * 2.1;
      c.save();
      c.translate(Math.cos(a) * 28, Math.sin(a) * 16);
      c.rotate(a);
      c.fillStyle = color;
      c.fillRect(-2, -5, 4, 10);
      c.restore();
    }
  } else if (kind === "tomb") {
    c.fillStyle = "#29283b";
    c.strokeStyle = color;
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(-19, 20);
    c.lineTo(-19, -14);
    c.quadraticCurveTo(0, -39, 19, -14);
    c.lineTo(19, 20);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = "#48405a";
    c.fillRect(-26, 18, 52, 8);
    line(
      c,
      [
        [0, -21],
        [0, 3],
      ],
      color,
      3,
    );
    line(
      c,
      [
        [-10, -12],
        [10, -12],
      ],
      color,
      3,
    );
    if (e.hp / e.maxHp < 0.7)
      line(
        c,
        [
          [12, -6],
          [4, 3],
          [11, 9],
          [3, 20],
        ],
        "#090e19",
        2,
      );
    c.strokeStyle = "#c194fd";
    c.lineWidth = 1;
    c.beginPath();
    c.ellipse(0, 27, 31, 10, 0, 0, Math.PI * 2);
    c.stroke();
  } else {
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1;
      line(
        c,
        [
          [0, 0],
          [Math.cos(a) * 24, Math.sin(a) * 24],
        ],
        "#668e95",
        5,
      );
    }
    c.fillStyle = "#233f47";
    c.strokeStyle = color;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, 0, 15, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.save();
    c.rotate(e.angle);
    c.fillStyle = "#405766";
    c.fillRect(-12, -9, 27, 18);
    c.strokeRect(-12, -9, 27, 18);
    c.fillStyle = "#aacfc9";
    c.fillRect(8, -6, 24, 4);
    c.fillRect(8, 2, 24, 4);
    if (e.muzzle > 0) {
      c.fillStyle = "#ffdc9d";
      c.beginPath();
      c.moveTo(32, -9);
      c.lineTo(45, 0);
      c.lineTo(32, 9);
      c.fill();
    }
    c.restore();
    if (e.hp / e.maxHp < 0.4) {
      c.fillStyle = "#a8a7ba70";
      c.beginPath();
      c.arc(-3, -22 - ((time * 14) % 12), 6, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "#213640";
    c.fillRect(-22, -32, 44, 4);
    c.fillStyle = color;
    c.fillRect(-22, -32, 44 * Math.max(0, e.hp / e.maxHp), 4);
  }
  c.restore();
  return true;
}
export function drawEvolutionGround(renderer, g) {
  const c = renderer.ctx;
  for (const s of g.spikes) {
    const warning = s.age < E.spikeWarning;
    c.save();
    c.translate(s.x, s.y);
    c.fillStyle = warning ? "#edbd6b25" : "#729a5b45";
    c.strokeStyle = warning ? "#ffcd80" : "#b5fa8c";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, 0, E.spikeRadius, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    if (warning) {
      c.setLineDash([4, 4]);
      c.beginPath();
      c.arc(0, 0, E.spikeRadius * (1 - s.age / E.spikeWarning), 0, Math.PI * 2);
      c.stroke();
    }
    c.setLineDash([]);
    for (let i = -1; i <= 1; i++) {
      if (warning)
        line(
          c,
          [
            [i * 11 - 5, 7],
            [i * 11, 0],
            [i * 11 + 4, -6],
          ],
          "#f2b47d",
          1.5,
        );
      else {
        const x = i * 13,
          tip = -26 + Math.abs(i) * 10;
        c.fillStyle = "#1d292b";
        c.strokeStyle = "#090e18";
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(x - 9, 13);
        c.lineTo(x - 7, 3);
        c.lineTo(x, tip);
        c.lineTo(x + 5, -3);
        c.lineTo(x + 9, 13);
        c.closePath();
        c.fill();
        c.stroke();
        c.fillStyle = i === 0 ? "#829679" : "#536c58";
        c.beginPath();
        c.moveTo(x, tip);
        c.lineTo(x + 5, -3);
        c.lineTo(x + 9, 13);
        c.lineTo(x, 8);
        c.closePath();
        c.fill();
        line(
          c,
          [
            [x, tip + 7],
            [x - 3, 1],
            [x, 8],
            [x - 2, 13],
          ],
          "#adf46b",
          1.8,
        );
      }
    }
    c.restore();
  }
  for (const e of g.enemies)
    for (const s of e.summonPending || []) {
      renderer.ring(s.x, s.y, 19, "#c49aff", 2);
      renderer.ring(
        s.x,
        s.y,
        19 * Math.max(0, s.left / E.summonWarning),
        "#eee1ff",
        1,
      );
    }
  for (const t of g.turrets)
    if (t.hp > 0)
      drawEvolutionActor(
        c,
        { ...t, type: "sentry" },
        g.time,
        renderer.reduced,
        renderer.art,
      );
  for (const f of g.comboEffects) {
    c.save();
    c.globalAlpha = 1 - f.age / f.life;
    if (f.kind === "thermal") {
      renderer.ring(f.x, f.y, (f.radius * f.age) / f.life, "#a7e5ff", 4);
      renderer.ring(
        f.x,
        f.y,
        ((f.radius * f.age) / f.life) * 0.8,
        "#ff965e",
        3,
      );
    } else
      line(
        c,
        [
          [f.x, f.y],
          [f.endX, f.endY],
        ],
        "#ff9e65",
        2,
      );
    c.restore();
  }
}
