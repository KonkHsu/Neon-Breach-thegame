export const C = Object.freeze({
  width: 1280,
  height: 720,
  playerRadius: 16,
  dodgeDistance: 150,
  dodgeDuration: 0.18,
  dodgeCooldown: 2.5,
  speed: 244,
  hp: 160,
  fireDelay: 0.08,
  bulletSpeed: 1012,
  damage: 28,
  pulseRadius: 300,
  pulseDamage: 228,
  pulseCooldown: 8,
  enemyCap: 100,
  chaserHp: 80,
  chargerHp: 112,
  shooterHp: 96,
  shieldHp: 56,
  bossHp: 105840,
  bossRoundGrowth: 1.25,
  bossAddsEvery: 4,
  bossBulletDamage: 21,
  bossLaserDamage: 36,
  bossContactDamage: 38,
  shooterInterval: 6.4,
  rangedRetention: 0.35,
  enemyWaveGrowth: 1.03,
  magazineSize: 48,
  reloadDuration: 1.4,
  regenDelay: 4,
  regenRate: 4,
  particleCap: 240,
  projectileCap: 260,
});
// Denser waves retain ~35–38 seconds of spawning; clearing gates advancement.
export const WAVES = [
  { count: 58, every: 0.6 },
  { count: 82, every: 0.435 },
  { count: 106, every: 0.35 },
  { count: 130, every: 0.29 },
];
// Shared by both modes. Acquisition effects live in Game.chooseBuff.
export const EVOLUTION = {
  waveDensity: 1.3,
  earlyWaves: 4,
  earlyDensity: 0.75,
  lateDensity: 1.3,
  lateDensityAt: 600,
  svdSalvagePerRound: 10,
  treeShotInterval: 3.4,
  treeShotRageInterval: 2.4,
  treeShotWarning: 0.9,
  treeShotCount: 5,
  treeShotRageCount: 7,
  frenzyCap: 60,
  frenzyPerStack: 0.01,
  frenzyGrace: 4,
  frenzyDecay: 10,
  thermalRadius: 120,
  thermalDamage: 1.5,
  thermalCooldown: 1,
  emberRadius: 150,
  emberTargets: 3,
  fragmentRange: 340,
  mageHp: 1400,
  mageChance: 0.08,
  mageCap: 4,
  tombHp: 600,
  tombInterval: 4,
  summonWarning: 0.8,
  summons: 2,
  spikeRadius: 28,
  spikeWarning: 1.2,
  spikeLife: 2.4,
  spikeDamage: 27,
  treeInterval: 4,
  treeRageInterval: 3,
  treeCount: 10,
  treeRageCount: 14,
};
export const BUFFS = [
  {
    id: "frenzy",
    icon: "↯",
    name: "狂热扳机",
    description:
      "命中叠狂热，最多 60 层；每层狂热 +1% 射速，每次强化再 +1%。4 秒未命中开始衰退，换弹时保留。",
    maxStacks: Infinity,
  },
  {
    id: "thermal",
    icon: "✦",
    name: "热震反应",
    description:
      "命中灼烧且受寒冰控制的敌人引发爆炸，造成主武器 150% 伤害；每个目标每秒一次。",
    maxStacks: 1,
  },
  {
    id: "ember",
    icon: "♨",
    name: "余烬蔓延",
    description: "燃烧敌人死亡，将剩余灼烧传给附近 3 个敌人；可继续蔓延。",
    maxStacks: 1,
  },
  {
    id: "salvage",
    icon: "↻",
    name: "战地回收",
    description:
      "主武器、碎片与灼烧击杀回收弹药，每层每击杀恢复 1 发。SVD 每层每 10 次击杀恢复 1 发，最多每 2 次击杀恢复 1 发。",
    maxStacks: 5,
  },
  {
    id: "damage",
    icon: "↗",
    name: "高能弹芯",
    description: "伤害增加基础值的 30%",
    maxStacks: Infinity,
  },
  {
    id: "rate",
    icon: "»",
    name: "过载扳机",
    description: "前 10 层射速每层 +20%，之后每层 +8%",
    maxStacks: Infinity,
  },
  {
    id: "speed",
    icon: "⌁",
    name: "轻量推进",
    description: "前 5 层移速每层 +12%，之后 +4%，最高 2.4 倍",
    maxStacks: 25,
  },
  {
    id: "magazine",
    icon: "▥",
    name: "扩容弹匣",
    description: "增加基础弹容的 20%，立即装满",
    maxStacks: Infinity,
  },
  {
    id: "reload",
    icon: "⟳",
    name: "快换机匣",
    description: "换弹耗时 −15%，最快 0.3 秒",
    maxStacks: Infinity,
  },
  {
    id: "pierce",
    icon: "⇥",
    name: "相位穿透",
    description: "多穿透 1 个敌人，穿透后保留 85% 伤害",
    maxStacks: 12,
  },
  {
    id: "cooldown",
    skill: "pulse",
    icon: "◎",
    name: "脉冲回路",
    description: "冲击波冷却 −15%，最快 2 秒",
    maxStacks: Infinity,
  },
  {
    id: "heal",
    icon: "+",
    name: "紧急修复",
    description: "生命上限 +10，恢复 35 生命",
    maxStacks: Infinity,
  },
  {
    id: "dragon",
    icon: "♨",
    name: "龙息弹",
    description: "灼烧 3 秒；每秒 12 伤害，每层再加 8，享受伤害强化",
    maxStacks: Infinity,
  },
  {
    id: "ice",
    icon: "❄",
    name: "寒冰弹",
    description:
      "15% 概率麻痹 0.6 秒；每层 +5% 概率、+0.1 秒，最高 60% / 1.5 秒",
    maxStacks: 10,
  },
  {
    id: "split",
    icon: "⋔",
    name: "碎裂回响",
    description:
      "击杀发射 2 枚追踪碎片，每层再加 1 枚；造成击杀弹丸 50% 伤害，携带半额灼烧与寒冰，可触发热震。",
    maxStacks: 5,
  },
  {
    id: "chamber",
    icon: "▰",
    name: "首轮爆发",
    description: "换弹后，前 3 发伤害 +60%",
    maxStacks: 1,
  },
  {
    id: "pulse-ammo",
    skill: "pulse",
    icon: "↻",
    name: "脉冲回收",
    description: "冲击波命中，补充 6 发子弹",
    maxStacks: 1,
  },
];
export const ROGUE = {
  normalPoints: 10,
  bossPoints: 600,
  upgradeBase: 100,
  itemChoiceChance: 0.1,
  upgradeStep: 20,
  rateBuffWeight: 0.5,
  burnDuration: 3,
  burnBase: 12,
  burnStep: 8,
  iceChance: 0.15,
  iceChanceStep: 0.05,
  iceChanceMax: 0.6,
  iceDuration: 0.6,
  iceDurationStep: 0.1,
  iceDurationMax: 1.5,
  thawImmunity: 1.5,
  coinMin: 45,
  coinMax: 75,
  coinLife: 20,
  coinPoints: 150,
  oneHitDuration: 8,
};
export const ITEMS = {
  sentry: {
    name: "哨戒机枪",
    price: 500,
    ammo: 3,
    deploy: true,
    hp: 160,
    damage: 18,
    interval: 0.16,
    range: 420,
    speed: 1100,
    immunity: 0.4,
    description: "部署三台机枪，存活期间持续自动开火",
  },
  beam: {
    name: "高能光束",
    price: 350,
    ammo: 480,
    drain: 60,
    damage: 450,
    beams: 3,
    width: 14,
    description: "三束激光贯穿敌群，目标不足时集火",
  },
  electric: {
    name: "电流弹射",
    price: 400,
    ammo: 320,
    interval: 0.065,
    row: 4,
    damage: 42,
    speed: 1100,
    life: 3,
    bounces: 5,
    freeze: 2,
    immunity: 2,
    chainRadius: 120,
    chainHops: 2,
    chainTargets: 6,
    chainDamage: 30,
    description: "反弹弹雨，麻痹并传递电流",
  },
  charm: {
    name: "魅惑弓",
    price: 300,
    ammo: 16,
    interval: 0.6,
    row: 1,
    damage: 60,
    speed: 700,
    range: 700,
    radius: 180,
    allyDamage: 32,
    allyInterval: 0.6,
    allyRange: 280,
    blastRadius: 180,
    blastDamage: 180,
    description: "范围魅惑，友军生命耗尽时自爆",
  },
};
export const EVENT_TYPES = [
  {
    id: "onehit",
    name: "一击即倒",
    description:
      "8 秒内，直接命中秒杀普通敌人；命中 Boss 每秒最多追加 2% 生命伤害",
  },
  { id: "points", name: "点数奖励", description: "获得 150 点数" },
  {
    id: "fusion",
    name: "聚变清屏",
    description: "清除场上普通敌人与弹幕，削减 Boss 25% 生命",
  },
];
export const ENDLESS_WAVES = [
  { count: 58, every: 0.6 },
  { count: 82, every: 0.435 },
  { count: 106, every: 0.35 },
  { count: 106, every: 0.35 },
  { count: 130, every: 0.29 },
  { count: 130, every: 0.29 },
  { count: 150, every: 0.27 },
];
export function buildStats(w, stacks) {
  const n = (id) => stacks(id),
    rate = n("rate"),
    speed = n("speed"),
    ice = n("ice");
  return {
    baseSpeed: w.speed,
    baseDamage: w.damage,
    baseFireDelay: w.fireDelay,
    damage: w.damage * (1 + 0.3 * n("damage")),
    fireDelay:
      w.fireDelay /
      (1 + 0.2 * Math.min(10, rate) + 0.08 * Math.max(0, rate - 10)),
    speed:
      w.speed *
      Math.min(
        2.4,
        1 + 0.12 * Math.min(5, speed) + 0.04 * Math.max(0, speed - 5),
      ),
    magazineSize:
      w.magazineSize + Math.ceil(w.magazineSize * 0.2) * n("magazine"),
    reloadDuration: Math.max(0.3, w.reloadDuration * 0.85 ** n("reload")),
    maxHp: C.hp + 10 * n("heal"),
    pierce: Math.min(12, n("pierce")),
    pulseCooldown: Math.max(2, C.pulseCooldown * 0.85 ** n("cooldown")),
    split: n("split") ? 1 + n("split") : 0,
    frenzyPower: n("frenzy") * EVOLUTION.frenzyPerStack,
    thermal: n("thermal") > 0,
    ember: n("ember") > 0,
    salvage: n("salvage"),
    chamber: n("chamber") > 0,
    pulseAmmo: n("pulse-ammo") > 0,
    burnDps: n("dragon")
      ? (ROGUE.burnBase + ROGUE.burnStep * (n("dragon") - 1)) *
        (1 + 0.3 * n("damage"))
      : 0,
    iceChance: ice
      ? Math.min(
          ROGUE.iceChanceMax,
          ROGUE.iceChance + ROGUE.iceChanceStep * (ice - 1),
        )
      : 0,
    iceDuration: ice
      ? Math.min(
          ROGUE.iceDurationMax,
          ROGUE.iceDuration + ROGUE.iceDurationStep * (ice - 1),
        )
      : 0,
  };
}
export const COLORS = {
  chaser: "#ff637b",
  charger: "#ffbf69",
  shooter: "#b79aff",
  boss: "#ff557c",
  mage: "#b991ff",
  tomb: "#9c7fd4",
};
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Time-based stages are independent of wave count and freeze with game time.
export const ENDLESS_STAGES = [
  { at: 0, name: "接入", hp: 1, speed: 1, density: 1, ranged: 0.27 },
  { at: 180, name: "成型", hp: 1.5, speed: 1.08, density: 1.35, ranged: 0.32 },
  { at: 360, name: "过载", hp: 1.9, speed: 1.16, density: 1.7, ranged: 0.38 },
  { at: 600, name: "极限", hp: 2.2, speed: 1.24, density: 2, ranged: 0.42 },
];
COLORS.shield = "#73baff";
export function buffDescription(buff, game) {
  if (buff.item) return `获得${buff.name}，放入空闲道具槽`;
  const n = game.stacks(buff.id);
  const descriptions = {
    frenzy: n ? "每层狂热额外增加 1% 射速" : "命中叠射速，越打越快",
    thermal: "灼烧与寒冰相遇，引发爆炸",
    ember: "燃烧敌人死亡，火焰向外蔓延",
    salvage:
      game.weaponId === "svd"
        ? "每 10 次击杀额外回收 1 发"
        : "击杀额外恢复 1 发弹药",
    split: n ? "多发射 1 枚元素碎片" : "击杀发射 2 枚元素碎片",
    rate: `射速增加基础值的 ${n < 10 ? 20 : 8}%`,
    speed: `移速增加基础值的 ${n < 5 ? 12 : 4}%`,
    damage: "伤害增加基础值的 30%",
    dragon: n ? "灼烧伤害提升" : "命中附加灼烧",
    ice: n ? "麻痹更频繁、更持久" : "命中有概率麻痹敌人",
    reload: "换弹更快",
    cooldown: "冲击波冷却缩短",
    pierce: "多穿透 1 个敌人",
    magazine: "弹容提升，立即装满",
  };
  return descriptions[buff.id] || buff.description;
}
