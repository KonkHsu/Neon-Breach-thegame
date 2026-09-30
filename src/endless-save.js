import { BUFFS, ITEMS, C } from "./config.js";
import { WEAPONS, ULTIMATES } from "./weapons.js";

export const SAVE_VERSION = 10;
const fields = [
  "player",
  "dodge",
  "tar",
  "enemies",
  "wave",
  "time",
  "kills",
  "score",
  "shotCd",
  "pulseCd",
  "pulse",
  "ultimate",
  "ultCharge",
  "unhurtTime",
  "reloadLeft",
  "reloadTotal",
  "bossAddsTimer",
  "bossDefeated",
  "uid",
  "waveTime",
  "spawnAcc",
  "banner",
  "remaining",
  "points",
  "purchases",
  "shotId",
  "skillResources",
  "weaponAmmo",
  "items",
  "turrets",
  "spikes",
  "frenzy",
  "frenzyIdle",
  "lastBossKind",
  "recoveryDuringReload",
  "coin",
  "oneHit",
  "coinTimer",
  "buffs",
  "weaponId",
  "ultimateId",
];
const clone = (value) =>
  JSON.parse(
    JSON.stringify(value, (_key, v) => (v instanceof Set ? [...v] : v)),
  );
export function checkpoint(game, runId, revision = 1) {
  if (
    game.mode !== "endless" ||
    game.tutorial ||
    !["playing", "station"].includes(game.state)
  )
    throw Error("当前状态不能创建检查点");
  const data = Object.fromEntries(fields.map((key) => [key, game[key]]));
  const save = {
    version: SAVE_VERSION,
    runId,
    revision,
    savedAt: Date.now(),
    state: game.state,
    data: clone(data),
  };
  validateCheckpoint(save);
  return save;
}
export function migrateCheckpoint(save) {
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9].includes(save?.version)) return save;
  if (!save.data || (save.version === 1 && !Object.hasOwn(save.data, "item")))
    throw Error("存档缺少必要字段");
  const upgraded = clone(save),
    d = upgraded.data;
  upgraded.version = SAVE_VERSION;
  if (save.version === 1) {
    d.items = [d.item, null];
    delete d.item;
    d.turrets = [];
    d.spikes = [];
    d.frenzy = 0;
    d.frenzyIdle = 0;
    d.recoveryDuringReload = false;
    d.lastBossKind = d.wave >= 8 ? "guardian" : null;
  }
  if (save.version < 3) d.player.salvageProgress = 0;
  for (const e of d.enemies || []) {
    if (e.ally) e.charm = null;
    if (e.type === "boss" && save.version < 3) {
      if (save.version === 1) e.bossKind = "guardian";
      const factor =
        12 * C.bossRoundGrowth ** Math.max(0, Math.floor(d.wave / 8) - 1);
      e.hp *= factor;
      e.maxHp *= factor;
    }
  }
  if (save.version < 4) {
    const waveGrowth = C.enemyWaveGrowth ** Math.max(0, d.wave - 1);
    for (const e of d.enemies || []) {
      if (e.type === "boss" || e.ally) continue;
      const scale = waveGrowth * (e.type === "mage" ? 10 : 1);
      e.hp *= scale;
      e.maxHp *= scale;
      if (Number.isFinite(e.hpScale)) e.hpScale *= waveGrowth;
    }
    for (const t of d.turrets || []) {
      const ratio = t.hp / t.maxHp;
      t.maxHp = ITEMS.sentry.hp;
      t.hp = t.maxHp * ratio;
    }
  }
  if (save.version < 5 && d.wave <= 16)
    for (const e of d.enemies || [])
      if (e.type === "boss") {
        e.hp *= 0.5;
        e.maxHp *= 0.5;
      }
  if (save.version < 6)
    d.dodge = { cooldown: 0, left: 0, x: 0, y: -1, lastX: 0, lastY: -1 };
  if (save.version < 7) {
    d.player.hp += 60;
    d.player.maxHp += 60;
    d.tar = {
      energy: 100,
      active: false,
      tick: 0,
      lastX: d.player.x,
      lastY: d.player.y,
      patches: [],
    };
  } else if (save.version < 9 && d.tar?.patches) {
    for (const patch of d.tar.patches)
      patch.life = Math.min(
        patch.life / (save.version === 7 ? 4 : 2),
        ULTIMATES.tar.life,
      );
  }
  for (const e of d.enemies || [])
    if (e.type === "boss") {
      e.hp *= 0.7;
      e.maxHp *= 0.7;
    }
  return upgraded;
}
export function validateCheckpoint(save) {
  save = migrateCheckpoint(save);
  const d = save?.data;
  const finiteTree = (v) =>
    typeof v === "number"
      ? Number.isFinite(v)
      : v && typeof v === "object"
        ? Object.values(v).every(finiteTree)
        : true;
  if (
    save?.version !== SAVE_VERSION ||
    !["playing", "station"].includes(save.state) ||
    typeof save.runId !== "string" ||
    !save.runId ||
    !Number.isInteger(save.revision) ||
    save.revision < 1 ||
    !Number.isFinite(save.savedAt) ||
    !d ||
    !finiteTree(d)
  )
    throw Error("存档损坏或版本不兼容");
  if (
    !WEAPONS[d.weaponId] ||
    !ULTIMATES[d.ultimateId] ||
    !Array.isArray(d.buffs) ||
    !Array.isArray(d.enemies) ||
    !d.player ||
    !d.skillResources ||
    !d.weaponAmmo
  )
    throw Error("存档装备数据无效");
  if (
    !d.tar ||
    typeof d.tar.active !== "boolean" ||
    !Number.isFinite(d.tar.energy) ||
    d.tar.energy < 0 ||
    d.tar.energy > ULTIMATES.tar.energy ||
    !Number.isFinite(d.tar.tick) ||
    d.tar.tick < 0 ||
    d.tar.tick > ULTIMATES.tar.tick ||
    !Number.isFinite(d.tar.lastX) ||
    !Number.isFinite(d.tar.lastY) ||
    !Array.isArray(d.tar.patches) ||
    d.tar.patches.some(
      (p) =>
        ![p.x, p.y, p.life].every(Number.isFinite) ||
        p.life <= 0 ||
        p.life > ULTIMATES.tar.life,
    ) ||
    (d.tar.active && (d.ultimateId !== "tar" || d.tar.energy <= 0))
  )
    throw Error("焦油状态无效");
  if (fields.some((key) => !Object.hasOwn(d, key)))
    throw Error("存档缺少必要字段");
  if (
    !d.dodge ||
    ["cooldown", "left", "x", "y", "lastX", "lastY"].some(
      (k) => !Number.isFinite(d.dodge[k]),
    ) ||
    d.dodge.cooldown < 0 ||
    d.dodge.cooldown > C.dodgeCooldown ||
    d.dodge.left < 0 ||
    d.dodge.left > C.dodgeDuration ||
    Math.abs(Math.hypot(d.dodge.x, d.dodge.y) - 1) > 0.001 ||
    Math.abs(Math.hypot(d.dodge.lastX, d.dodge.lastY) - 1) > 0.001
  )
    throw Error("闪避状态无效");
  for (const key of [
    "x",
    "y",
    "angle",
    "r",
    "hp",
    "maxHp",
    "invuln",
    "ammo",
    "magazineSize",
  ]) {
    if (!Number.isFinite(d.player[key])) throw Error("存档玩家数值无效");
  }
  for (const key of [
    "wave",
    "kills",
    "score",
    "points",
    "purchases",
    "remaining",
    "uid",
  ])
    if (!Number.isSafeInteger(d[key]) || d[key] < (key === "wave" ? 1 : 0))
      throw Error("存档数值无效");
  for (const key of [
    "time",
    "shotCd",
    "pulseCd",
    "ultCharge",
    "unhurtTime",
    "reloadLeft",
    "reloadTotal",
    "bossAddsTimer",
    "waveTime",
    "spawnAcc",
    "banner",
    "shotId",
    "oneHit",
    "coinTimer",
  ])
    if (typeof d[key] !== "number" || !Number.isFinite(d[key]))
      throw Error("存档计时数据无效");
  if (
    !(d.player.hp > 0) ||
    !(d.player.maxHp >= d.player.hp) ||
    !(d.player.ammo >= 0) ||
    !(d.player.ammo <= d.player.magazineSize) ||
    !Number.isFinite(d.player.x) ||
    !Number.isFinite(d.player.y)
  )
    throw Error("存档玩家数据无效");
  for (const id of d.buffs) {
    const b = BUFFS.find((b) => b.id === id);
    if (!b || d.buffs.filter((x) => x === id).length > b.maxStacks)
      throw Error("存档强化数据无效");
  }
  if (
    d.ultimate &&
    (!["charge", "ricochet"].includes(d.ultimate.kind) ||
      (d.ultimate.kind === "charge" && !Array.isArray(d.ultimate.hit)))
  )
    throw Error("存档技能无效");
  if (
    !Array.isArray(d.items) ||
    d.items.length !== 2 ||
    d.items.some(
      (item) =>
        item &&
        (!ITEMS[item.id] ||
          !Number.isFinite(item.ammo) ||
          item.ammo < 0 ||
          typeof item.active !== "boolean" ||
          !Number.isFinite(item.cd)),
    )
  )
    throw Error("存档道具无效");
  if (
    !Array.isArray(d.turrets) ||
    d.turrets.some(
      (t) =>
        ![t.x, t.y, t.hp, t.maxHp, t.cd, t.angle, t.invuln, t.id].every(
          Number.isFinite,
        ) ||
        t.hp <= 0 ||
        t.hp > t.maxHp,
    ) ||
    !Array.isArray(d.spikes) ||
    d.spikes.some((t) => ![t.x, t.y, t.age].every(Number.isFinite)) ||
    !Number.isFinite(d.frenzy) ||
    d.frenzy < 0 ||
    d.frenzy > 60 ||
    !Number.isFinite(d.frenzyIdle) ||
    d.frenzyIdle < 0 ||
    ![null, "guardian", "tree"].includes(d.lastBossKind) ||
    typeof d.recoveryDuringReload !== "boolean"
  )
    throw Error("存档战场数据无效");
  if (
    d.enemies.some(
      (e) =>
        ![
          "chaser",
          "charger",
          "shooter",
          "shield",
          "boss",
          "mage",
          "tomb",
        ].includes(e.type) ||
        !Number.isFinite(e.x) ||
        !Number.isFinite(e.y) ||
        !(e.hp > 0),
    )
  )
    throw Error("存档敌人数据无效");
  return save;
}
export function restoreCheckpoint(game, save) {
  save = validateCheckpoint(save);
  const data = clone(save.data);
  game.reset("endless", data.weaponId, data.ultimateId);
  for (const key of fields) game[key] = data[key];
  if (game.ultimate?.kind === "charge")
    game.ultimate.hit = new Set(game.ultimate.hit);
  game.weapon = WEAPONS[data.weaponId];
  game.rebuildStats();
  game.tutorial = null;
  game.events = [];
  game.choices = [];
  game.toast = null;
  game.ashes = null;
  game.buffReturn = save.state;
  game.pauseReturn = save.state;
  game.state = "paused";
  return game;
}
export function resultRecord(game, id) {
  return {
    id,
    score: game.score,
    kills: game.kills,
    time: Math.floor(game.time),
    wave: game.wave,
    endedAt: Date.now(),
  };
}
export function validRecord(r) {
  return (
    r &&
    typeof r.id === "string" &&
    ["score", "kills", "time", "wave", "endedAt"].every(
      (k) => Number.isSafeInteger(r[k]) && r[k] >= 0,
    )
  );
}
export function mergeRecords(old, record) {
  const recent = [record, ...(old?.recent || [])].filter(validRecord);
  const unique = [...new Map(recent.map((r) => [r.id, r])).values()]
    .sort((a, b) => b.endedAt - a.endedAt)
    .slice(0, 10);
  let best = validRecord(old?.best) ? old.best : null;
  for (const r of unique) if (!best || r.wave > best.wave) best = r;
  return { best, recent: unique };
}
