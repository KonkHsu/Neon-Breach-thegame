// User-supplied CODM panels: unscaled panel damage, range m ×14,
// sprint m/s ×40, projectile m/s ×1.1. Timings stay in seconds.
export const WEAPONS = {
  svd: {
    id: "svd",
    name: "SVD",
    alias: "精确射手步枪",
    description: "重弹远射，强力击退",
    damage: 85,
    damages: [85, 77],
    ranges: [666.4, 2100],
    fireDelay: 0.375,
    bulletSpeed: 1200,
    speed: 231.6,
    magazineSize: 6,
    reloadDuration: 2.11,
    emptyReload: 1.77,
    knock: 97.5,
    pellets: 1,
    spread: 0,
    color: "#c6b4ff",
  },
  qbz191: {
    id: "qbz191",
    name: "QBZ191",
    alias: "突击步枪",
    description: "均衡灵活，适合持续游走",
    damage: 28,
    damages: [28, 24, 22, 17],
    ranges: [208.6, 434, 607.6, 840],
    fireDelay: 0.08,
    bulletSpeed: 1012,
    speed: 244,
    magazineSize: 48,
    reloadDuration: 1.4,
    emptyReload: 1.49,
    knock: 65,
    pellets: 1,
    spread: 0,
    color: "#a2ffdf",
  },
  mg42: {
    id: "mg42",
    name: "MG42",
    alias: "轻机枪",
    description: "250 发压制火力，移动较慢",
    damage: 22,
    damages: [22, 19, 18, 16],
    ranges: [210, 350, 490, 840],
    fireDelay: 0.049,
    bulletSpeed: 1023,
    speed: 211.6,
    magazineSize: 250,
    reloadDuration: 4.92,
    emptyReload: 5.4,
    knock: 68.25,
    pellets: 1,
    spread: 0.025,
    color: "#ffd58b",
  },
  aa12: {
    id: "aa12",
    name: "AA12",
    alias: "全自动霰弹枪",
    description: "一发 8 弹丸，贴近敌人更强",
    damage: 16,
    damages: [16, 8, 6, 5],
    ranges: [35, 123.2, 263.2, 508.2],
    fireDelay: 0.177,
    bulletSpeed: 850,
    speed: 268.8,
    magazineSize: 16,
    reloadDuration: 1.3,
    emptyReload: 1.46,
    knock: 13,
    pellets: 8,
    spread: 0.42,
    color: "#ffacda",
  },
};
export const ULTIMATES = {
  tar: {
    name: "焦油背包",
    description: "沿途留下燃烧焦油，随时开关",
    energy: 100,
    drain: 10,
    recharge: 5,
    life: 2,
    radius: 48,
    damage: 60,
    tick: 0.1,
    spacing: 24,
  },
  pulse: { name: "冲击波", description: "震退敌人，清除附近弹幕" },
  ricochet: {
    name: "弹射机器",
    description: "高速弹雨，撞墙弹射",
    ammo: 320,
    row: 4,
    interval: 0.065,
    damage: 42,
    bulletSpeed: 1100,
    life: 3,
    bounces: 5,
  },
  charge: {
    name: "冲锋陷阵",
    description: "举盾冲锋，撞穿敌群",
    energy: 300,
    speed: 650,
    turnSpeed: 9,
    drain: 6,
    hitCost: 6,
    bossCost: 20,
    bossDamage: 2520,
    tombDamage: 900,
    knock: 900,
    wallDrain: 20,
  },
};
export const ULT_KILLS = 60;
export function damageAtRange(weapon, travelled) {
  const i = weapon.ranges.findIndex((r) => travelled <= r);
  return i < 0 ? 0 : weapon.damages[i] / weapon.damage;
}
// First contact fraction along the swept segment; null means no collision.
export function segmentEntry(x, y, nx, ny, target, radius) {
  const dx = nx - x,
    dy = ny - y,
    fx = x - target.x,
    fy = y - target.y;
  const a = dx * dx + dy * dy,
    c = fx * fx + fy * fy - radius * radius;
  if (c <= 0) return 0;
  if (a === 0) return null;
  const b = fx * dx + fy * dy,
    disc = b * b - a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : null;
}
export function segmentHit(x, y, nx, ny, target, radius) {
  return segmentEntry(x, y, nx, ny, target, radius) !== null;
}
