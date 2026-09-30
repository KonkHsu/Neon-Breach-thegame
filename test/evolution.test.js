import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/combat.js";
import {
  C,
  EVOLUTION as E,
  ITEMS,
  WAVES,
  ENDLESS_WAVES,
} from "../src/config.js";
import {
  checkpoint,
  restoreCheckpoint,
  validateCheckpoint,
} from "../src/endless-save.js";
import { Haptics } from "../src/haptics.js";
const setup = (weapon = "qbz191") => {
  const g = new Game(() => 0.5);
  g.reset("endless", weapon);
  g.spawnAcc = -1e8;
  g.remaining = 999;
  g.player.invuln = 999;
  return g;
};
const buff = (g, ...ids) => {
  g.buffs.push(...ids);
  g.rebuildStats();
};
const foe = (g, x = 700, y = 380, hp = 10000, type = "chaser") =>
  Object.assign(g.spawn(type), { x, y, hp, maxHp: hp, warm: 999, speed: 0 });
const step = (g, seconds, fire = false) => {
  for (let i = 0; i < Math.round(seconds * 120); i++) {
    g.update(1 / 120, { x: 0, y: 0, fire });
    g.events = [];
  }
};
const shot = (extra = {}) => ({
  damage: 28,
  burnDps: 12,
  iceChance: 1,
  iceDuration: 1,
  shot: { id: 1, checked: new Set(), count: 1 },
  ...extra,
});

test("AA12 pellets, penetration and aggregated volleys add frenzy once per trigger", () => {
  const g = setup("aa12");
  buff(g, "frenzy", "pierce");
  foe(g, 680, 380, 1e7);
  foe(g, 708, 380, 1e7);
  g.shoot(3);
  step(g, 0.15);
  assert.equal(g.frenzy, 3);
  assert.equal(g.player.ammo, 13);
  const base = g.player.fireDelay;
  g.frenzy = 60;
  assert.equal(g.effectiveFireDelay(), base / 1.6);
  buff(g, "frenzy");
  assert.equal(g.effectiveFireDelay(), base / 2.2);
  g.bullets.clear();
  g.frenzyIdle = 3.9;
  g.updateEvolution(0.2);
  assert.ok(Math.abs(g.frenzy - 59) < 1e-8);
  g.reloadLeft = 2;
  g.updateEvolution(1);
  assert.ok(Math.abs(g.frenzy - 59) < 1e-8);
  g.pause();
  const snap = JSON.stringify(g);
  g.update(0.05);
  assert.equal(JSON.stringify(g), snap);
  g.resume();
  g.nextWave();
  assert.ok(g.frenzy > 0);
  g.enterStation();
  assert.equal(g.frenzy, 0);
});

test("frenzy preserves cadence and ammo at 60/120Hz, including aggregated fire", () => {
  const results = [];
  for (const hz of [60, 120]) {
    const g = setup("mg42");
    buff(
      g,
      ...Array(50).fill("frenzy"),
      ...Array(25).fill("rate"),
      ...Array(30).fill("magazine"),
    );
    g.frenzy = 60;
    g.player.ammo = g.player.magazineSize;
    foe(g, 710, 380, 1e12);
    const ammo = g.player.ammo;
    for (let i = 0; i < hz; i++) g.update(1 / hz, { x: 0, y: 0, fire: true });
    results.push(ammo - g.player.ammo);
    assert.ok(results.at(-1) > 1000);
    assert.equal(g.frenzy, 60);
  }
  assert.ok(Math.abs(results[0] - results[1]) <= 1);
});

test("thermal explodes once per target cooldown without recursively triggering itself", () => {
  const g = setup();
  buff(g, "thermal", "dragon", "ice");
  const a = foe(g),
    b = foe(g, 730);
  b.burn = 2;
  b.burnDps = 12;
  b.frozen = 1;
  g.applyElements(a, shot());
  assert.equal(a.hp, 10000 - g.player.damage * 1.5);
  assert.equal(b.hp, a.hp);
  g.applyElements(a, shot());
  assert.equal(a.hp, b.hp);
  assert.equal(g.comboEffects.filter((f) => f.kind === "thermal").length, 1);
  g.time = 1;
  g.applyElements(a, shot());
  assert.equal(g.comboEffects.filter((f) => f.kind === "thermal").length, 2);
  const boss = foe(g, 720, 380, 10000, "boss");
  g.applyElements(boss, shot());
  assert.ok(boss.slow > 0);
  assert.ok(boss.thermalAt > g.time);
});

test("ember spreads only remaining stronger player burn to three neighbors", () => {
  const g = setup();
  buff(g, "ember");
  const a = foe(g, 650, 380, 1),
    neighbors = [680, 700, 720, 740].map((x) => foe(g, x));
  Object.assign(a, { burn: 2, burnDps: 20, burnOwner: "player" });
  g.updateStatus(a, 0.1);
  assert.equal(neighbors.filter((e) => e.burn > 0).length, 3);
  assert.ok(neighbors.every((e) => !e.burn || e.burn <= 1.9));
  const b = neighbors[0];
  b.hp = 1;
  g.updateStatus(b, 0.1);
  assert.ok(neighbors[3].burn <= 1.8 + 1e-9);
  const strong = neighbors[1];
  strong.burn = 0.5;
  strong.burnDps = 999;
  const turretKill = foe(g, 675, 380, 1);
  Object.assign(turretKill, { burn: 3, burnDps: 1000, burnOwner: "turret" });
  g.hurtEnemy(turretKill, 2, 0, 0, false, false, "turret");
  assert.equal(strong.burnDps, 999);
  assert.equal(strong.burn, 0.5);
});

test("fragments scale by single projectile damage, carry elements and cannot split again", () => {
  const g = setup();
  buff(g, "split", "split", "split", "salvage");
  const a = foe(g, 650, 380, 1),
    b = foe(g, 730, 380, 10000);
  g.player.ammo = 10;
  g.hurtEnemy(
    a,
    500,
    0,
    0,
    true,
    false,
    "primary",
    shot({ damage: 300, burnDps: 32, shot: { count: 3 }, impactFalloff: 1 }),
  );
  assert.equal(g.bullets.active.length, 4);
  assert.ok(
    g.bullets.active.every(
      (b) => b.damage === 50 && b.burnDps === 16 && b.iceChance === 1,
    ),
  );
  assert.equal(g.player.ammo, 11);
  g.hurtEnemy(b, 1e6, 0, 0, true, false, "fragment", g.bullets.active[0]);
  assert.equal(g.bullets.active.length, 4);
  assert.equal(g.player.ammo, 12);
  g.hurtEnemy(b, 1e6, 0, 0, true, false, "fragment");
  assert.equal(g.player.ammo, 12);
});

test("recovery does not cancel reload; turret and thermal kills do not refill", () => {
  const g = setup();
  buff(g, "salvage", "salvage");
  g.player.ammo = 0;
  g.reload();
  g.hurtEnemy(foe(g, 700, 380, 1), 2, 0, 0, true, false, "burn");
  assert.equal(g.player.ammo, 2);
  g.update(0.05, { x: 0, y: 0, fire: true });
  assert.ok(g.reloadLeft > 0);
  assert.equal(g.player.ammo, 2);
  for (const source of ["turret", "thermal", "special"])
    g.hurtEnemy(foe(g, 700, 380, 1), 2, 0, 0, false, false, source);
  assert.equal(g.player.ammo, 2);
});

test("two slots buy duplicates, launch independently and exhaust both without touching primary", () => {
  const g = setup();
  g.enterStation();
  g.points = 10000;
  assert.ok(g.buyItem("beam"));
  assert.ok(g.buyItem("beam"));
  assert.equal(g.buyItem("charm"), false);
  assert.equal(g.useItem(0), false);
  g.leaveStation();
  g.spawnAcc = -1e8;
  g.remaining = 999;
  assert.ok(g.useItem(0));
  assert.ok(g.useItem(1));
  assert.equal(g.useItem(1), false);
  const target = foe(g, 760, 380, 1e6);
  g.updateRogue(1);
  assert.equal(g.beams.length, 6);
  assert.equal(target.hp, 1e6 - 450 * 6);
  assert.equal(g.player.ammo, 48);
  for (let i = 0; i < 7; i++) g.updateRogue(1);
  assert.deepEqual(g.items, [null, null]);
  g.items = [
    { id: "charm", ammo: 16, active: false, cd: 0 },
    { id: "electric", ammo: 10, active: true, cd: 0 },
  ];
  g.enterStation();
  assert.ok(g.items[0]);
  assert.equal(g.items[1], null);
});

test("sentries deploy three at a time, persist damaged through two stations and inherit only specified buffs", () => {
  const g = setup();
  buff(g, "damage", "rate", "dragon", "ice", "frenzy", "salvage");
  g.items[1] = { id: "sentry", ammo: 3, active: false, cd: 0 };
  assert.ok(g.useItem(1));
  assert.equal(g.items[1], null);
  assert.equal(g.turrets.length, 3);
  assert.ok(
    g.turrets.every((a, i) =>
      g.turrets.every(
        (b, j) => i === j || Math.hypot(a.x - b.x, a.y - b.y) > 46,
      ),
    ),
  );
  const turret = g.turrets[0];
  g.hurtTurret(turret, 18);
  assert.equal(turret.hp, ITEMS.sentry.hp - 18);
  g.hurtTurret(turret, 18);
  assert.equal(turret.hp, ITEMS.sentry.hp - 18);
  foe(g, 700, 380, 1e9);
  g.frenzy = 60;
  g.updateEvolution(0.01);
  assert.ok(g.turretBullets.active.length > 0);
  const b = g.turretBullets.active[0];
  assert.equal(b.damage, 18 * 1.3);
  assert.equal(b.burnDps, g.player.burnDps);
  assert.equal(b.left, 1);
  const cd = turret.cd;
  g.frenzy = 0;
  assert.ok(Math.abs(cd - (0.16 / 1.2 - 0.01)) < 1e-8);
  for (let i = 0; i < 2; i++) {
    g.enterStation();
    assert.equal(turret.hp, ITEMS.sentry.hp - 18);
    g.leaveStation();
  }
  g.deployTurrets();
  assert.equal(g.turrets.length, 6);
  g.reset();
  assert.equal(g.turrets.length, 0);
  assert.equal(g.turretBullets.active.length, 0);
});

test("turrets attract nearby enemies and receive contact, projectile and laser damage", () => {
  const g = setup();
  g.deployTurrets();
  const t = g.turrets[0];
  g.player.x = 200;
  g.player.y = 100;
  const enemy = foe(g, t.x + 5, t.y, 1e7);
  enemy.warm = 0;
  g.update(0.01);
  assert.ok(t.hp < 240);
  enemy.x = 1200;
  enemy.y = 650;
  t.invuln = 0;
  g.hazard(t.x - 15, t.y, 0, 200);
  g.update(0.05);
  assert.ok(t.hp <= 214);
  const boss = foe(g, t.x - 80, t.y, 1e7, "boss");
  boss.bossKind = "guardian";
  boss.laser = { start: 0, end: 0, ang: 0, life: 1, dur: 1 };
  t.invuln = 0;
  const hp = t.hp;
  g.updateBoss(boss, 0.01);
  assert.equal(t.hp, hp - C.bossLaserDamage);
});

test("tree rotates with guardian, telegraphs safe spikes, pauses and cleans up on death", () => {
  const g = setup();
  g.wave = 7;
  g.nextWave();
  let boss = g.enemies[0];
  assert.equal(boss.bossKind, "tree");
  boss.atkTimer = 0;
  g.updateTree(boss, 0.01);
  assert.equal(g.spikes.length, 10);
  for (let i = 0; i < g.spikes.length; i++)
    for (let j = i + 1; j < g.spikes.length; j++)
      assert.ok(
        Math.hypot(
          g.spikes[i].x - g.spikes[j].x,
          g.spikes[i].y - g.spikes[j].y,
        ) > 72,
      );
  const spike = g.spikes[0];
  g.player.x = spike.x;
  g.player.y = spike.y;
  g.player.invuln = 0;
  g.updateEvolution(1);
  assert.equal(g.player.hp, C.hp);
  g.updateEvolution(0.21);
  assert.equal(g.player.hp, C.hp - E.spikeDamage);
  g.pause();
  const state = JSON.stringify(g.spikes);
  g.update(0.05);
  assert.equal(JSON.stringify(g.spikes), state);
  g.resume();
  g.hurtEnemy(boss, 1e9);
  assert.equal(g.spikes.length, 0);
  g.enterStation();
  g.wave = 15;
  g.nextWave();
  assert.equal(g.enemies[0].bossKind, "guardian");
  g.wave = 23;
  g.nextWave();
  boss = g.enemies[0];
  assert.equal(boss.bossKind, "tree");
  boss.hp = boss.maxHp / 2;
  boss.atkTimer = 0;
  g.updateTree(boss, 0.01);
  assert.equal(g.spikes.length, 14);
});

test("mage creates one durable tomb; warnings, capacity, no-reward summons and clear event work", () => {
  const g = setup();
  g.wave = 3;
  const mage = foe(g, 650, 380, 1, "mage");
  g.hurtEnemy(mage, 100);
  g.hurtEnemy(mage, 100);
  const tomb = g.enemies.find((e) => e.type === "tomb");
  assert.ok(tomb);
  assert.equal(tomb.maxHp, E.tombHp * mage.hpScale);
  assert.equal(g.enemies.filter((e) => e.type === "tomb").length, 1);
  g.freezeEnemy(tomb, 2);
  assert.ok(!tomb.frozen);
  g.charmBlast(tomb.x, tomb.y);
  assert.ok(!tomb.ally);
  g.updateTomb(tomb, 3.99);
  assert.equal(tomb.summonPending.length, 0);
  g.updateTomb(tomb, 0.02);
  assert.equal(tomb.summonPending.length, 2);
  g.updateTomb(tomb, 0.4);
  assert.equal(g.enemies.filter((e) => e.summoned).length, 0);
  g.updateTomb(tomb, 0.4);
  assert.equal(g.enemies.filter((e) => e.summoned).length, 2);
  const points = g.points,
    score = g.score,
    charge = g.ultCharge;
  buff(g, "salvage");
  g.player.ammo = 10;
  const summoned = g.enemies.find((e) => e.summoned);
  g.hurtEnemy(summoned, 1e9, 0, 0, true, false, "primary");
  assert.equal(g.points, points);
  assert.equal(g.score, score);
  assert.equal(g.ultCharge, charge);
  assert.equal(g.player.ammo, 11);
  foe(g, 800, 380, 100, "mage");
  g.triggerEvent("fusion");
  assert.ok(g.enemies.every((e) => e.hp <= 0));
});

test("wave density and six-round SVD apply without removing queued enemies at the cap", () => {
  const g = setup("svd");
  assert.equal(g.player.ammo, 6);
  buff(g, "magazine");
  assert.equal(g.player.magazineSize, 8);
  assert.equal(
    g.waveSpec().count,
    Math.round(ENDLESS_WAVES[0].count * 1.3 * 0.75),
  );
  g.reset("campaign");
  assert.equal(g.waveSpec().count, Math.round(WAVES[0].count * 1.3 * 0.75));
  for (let i = 0; i < C.enemyCap; i++) foe(g, 700, 380, 1e6);
  const remaining = g.remaining;
  g.spawnAcc = 100;
  g.update(0.01);
  assert.equal(g.remaining, remaining);
  g.enemies[0].hp = 0;
  g.update(0.01);
  assert.equal(g.remaining, remaining - 1);
});

test("v2 checkpoints retain slots, turrets, spikes and combos; v1 migrates without free ammo", () => {
  const g = setup("svd");
  buff(g, "frenzy", "ember");
  g.deployTurrets();
  g.turrets[0].hp = 100;
  g.frenzy = 20;
  g.frenzyIdle = 3;
  g.items = [
    { id: "charm", ammo: 9, active: true, cd: 0.2 },
    { id: "sentry", ammo: 3, active: false, cd: 0 },
  ];
  g.spikes = [{ x: 400, y: 250, age: 0.7 }];
  g.lastBossKind = "tree";
  const save = checkpoint(g, "evolution");
  const restored = setup();
  restoreCheckpoint(restored, save);
  assert.equal(restored.state, "paused");
  assert.equal(restored.turrets[0].hp, 100);
  assert.deepEqual(restored.items, g.items);
  assert.equal(restored.frenzy, 20);
  assert.deepEqual(restored.spikes, g.spikes);
  const old = structuredClone(save);
  old.version = 1;
  old.data.item = old.data.items[0];
  for (const key of [
    "items",
    "turrets",
    "spikes",
    "frenzy",
    "frenzyIdle",
    "lastBossKind",
    "recoveryDuringReload",
  ])
    delete old.data[key];
  old.data.player.magazineSize = 8;
  old.data.player.ammo = 8;
  restoreCheckpoint(restored, old);
  assert.equal(restored.player.ammo, 6);
  assert.deepEqual(restored.items, [old.data.item, null]);
  assert.equal(restored.turrets.length, 0);
  const invalid = structuredClone(save);
  invalid.data.items.push(null);
  assert.throws(() => validateCheckpoint(invalid));
});

test("haptics is opt-in, only hurt/skill/item, and stops on pause/disable", () => {
  const calls = [],
    h = new Haptics({
      vibrate: (v) => {
        calls.push(v);
        return true;
      },
    });
  h.setPlaying(true);
  h.play("hit");
  assert.deepEqual(calls, []);
  h.setEnabled(true);
  for (const e of ["shoot", "itemFire:beam", "kill", "pulse", "buff"])
    h.play(e);
  assert.deepEqual(calls, []);
  h.play("hit");
  h.play("ultimate:charge");
  h.play("item:sentry");
  h.play("haptic:skill");
  assert.equal(calls.length, 4);
  h.setPlaying(false);
  assert.equal(calls.at(-1), 0);
  h.setEnabled(false);
  assert.equal(calls.at(-1), 0);
  const unsupported = new Haptics({}, true);
  assert.equal(unsupported.available, false);
  unsupported.play("hit");
});

test("SVD salvage accrues one round per ten layer-kills and does not reward other sources", () => {
  const g = setup("svd");
  buff(g, "salvage");
  g.player.ammo = 0;
  for (let i = 0; i < 9; i++)
    g.hurtEnemy(foe(g, 700, 380, 1), 2, 0, 0, true, false, "primary");
  assert.equal(g.player.ammo, 0);
  g.hurtEnemy(foe(g, 700, 380, 1), 2, 0, 0, true, false, "burn");
  assert.equal(g.player.ammo, 1);
  buff(g, "salvage", "salvage", "salvage", "salvage");
  g.hurtEnemy(foe(g, 700, 380, 1), 2, 0, 0, true, false, "fragment");
  assert.equal(g.player.ammo, 1);
  g.hurtEnemy(foe(g, 700, 380, 1), 2, 0, 0, true, false, "primary");
  assert.equal(g.player.ammo, 2);
  g.hurtEnemy(foe(g, 700, 380, 1), 2, 0, 0, true, false, "turret");
  assert.equal(g.player.salvageProgress, 0);
  g.reset("endless", "svd");
  assert.equal(g.player.salvageProgress, 0);
});
test("Boss health is twelvefold and grows geometrically each endless boss round", () => {
  assert.equal(C.bossHp, 12600 * 12 * 0.7);
  const g = setup();
  g.wave = 7;
  g.nextWave();
  const first = g.enemies.find((e) => e.type === "boss").maxHp;
  g.wave = 15;
  g.nextWave();
  assert.equal(g.enemies.find((e) => e.type === "boss").maxHp, first * 1.25);
  g.wave = 23;
  g.nextWave();
  assert.equal(
    g.enemies.find((e) => e.type === "boss").maxHp,
    first * 2 * 1.25 ** 2,
  );
});
test("Tree shoots a telegraphed fan, enrages, and freezes during pause", () => {
  const g = setup();
  g.wave = 7;
  g.nextWave();
  const b = g.enemies[0];
  b.bossKind = "tree";
  b.atkTimer = 999;
  b.shotTimer = 0;
  g.updateTree(b, 0.01);
  assert.equal(g.hazards.active.length, 0);
  assert.equal(b.pending.kind, "fan");
  g.pause();
  const t = b.pending.t;
  g.update(0.2);
  assert.equal(b.pending.t, t);
  g.resume();
  g.updateTree(b, 1);
  assert.equal(g.hazards.active.length, E.treeShotCount);
  b.hp = b.maxHp / 2;
  b.shotTimer = 0;
  g.updateTree(b, 0.01);
  g.updateTree(b, 1);
  assert.equal(g.hazards.active.length, E.treeShotCount + E.treeShotRageCount);
});
test("Charmed allies survive old expiration timers and explode only at zero health", () => {
  const g = setup();
  const e = foe(g, 700, 380, 500);
  g.charmBlast(700, 380);
  e.charm = 0.01;
  g.updateAlly(e, 100);
  assert.ok(e.hp > 0);
  assert.ok(!e.exploded);
  e.hp = 0;
  g.updateAlly(e, 0.01);
  assert.ok(e.exploded);
});
test("legacy checkpoints scale surviving boss HP proportionally and keep permanent allies", () => {
  const g = setup();
  g.wave = 15;
  g.nextWave();
  const save = checkpoint(g, "migration", 1);
  save.version = 2;
  const b = save.data.enemies.find((e) => e.type === "boss");
  b.hp = 6000;
  b.maxHp = 12000;
  const h = new Game();
  restoreCheckpoint(h, save);
  const boss = h.enemies.find((e) => e.type === "boss");
  assert.equal(boss.maxHp, 12000 * 12 * 1.25 * 0.5 * 0.7);
  assert.equal(boss.hp / boss.maxHp, 0.5);
  const ally = foe(h, 600, 380, 200);
  ally.ally = true;
  h.enterStation();
  assert.ok(h.enemies.includes(ally));
});

test("late density, wave health and mage health scale independently of player build", () => {
  const g = setup();
  g.wave = 10;
  g.time = 599;
  g.time = 600;
  const density = g.pressure().density;
  const baseCount = ENDLESS_WAVES[1].count;
  assert.equal(
    g.waveSpec().count,
    Math.round(baseCount * density * E.waveDensity * 1.3),
  );
  const mage = g.spawn("mage");
  assert.equal(mage.hp, 1400 * (g.pressure().hp * C.enemyWaveGrowth ** 9));
  const a = g.spawn("chaser").hp;
  buff(g, "damage", "damage");
  assert.equal(g.spawn("chaser").hp, a);
  g.wave++;
  assert.ok(Math.abs(g.spawn("chaser").hp / a - 1.03) < 1e-10);
  assert.equal(ITEMS.sentry.hp, 160);
  assert.equal(C.shooterInterval, 6.4);
});
test("rate and frenzy are rarer in seeded three-card draws without duplicates", () => {
  const g = setup();
  let seed = 1701;
  g.random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const counts = {};
  for (let i = 0; i < 8000; i++) {
    g.offerBuffs();
    assert.equal(new Set(g.choices.map((b) => b.id)).size, 3);
    for (const b of g.choices) counts[b.id] = (counts[b.id] || 0) + 1;
  }
  for (const id of ["rate", "frenzy"]) {
    assert.ok(counts[id] < counts.damage * 0.7);
    assert.ok(counts[id] > counts.damage * 0.35);
  }
  g.purchases = 100;
  assert.equal(g.upgradeCost, 2100);
});
test("boss bullet damage increases without changing ordinary bullets", () => {
  const g = setup();
  const b = foe(g, 300, 300, 1000, "boss");
  b.bossKind = "guardian";
  b.sequence = 0;
  b.pending = { kind: "ring", t: 0, max: 1 };
  g.updateBoss(b, 0.01);
  assert.ok(g.hazards.active.every((h) => h.damage === 21));
  g.hazard(100, 100, 0);
  assert.equal(g.hazards.active.at(-1).damage, 14);
  g.player.invuln = 0;
  g.player.x = 300;
  g.player.y = 300;
  g.update(0.001);
  assert.ok(g.player.hp <= C.hp - 21);
});
test("v3 migration rescales turrets and ordinary enemies without multiplying Boss twice", () => {
  const g = setup();
  g.wave = 10;
  g.deployTurrets();
  const e = g.spawn("mage");
  const save = checkpoint(g, "v3-balance", 1);
  save.version = 3;
  Object.assign(save.data.turrets[0], { hp: 120, maxHp: 240 });
  Object.assign(save.data.enemies[0], { hp: 70, maxHp: 140, hpScale: 1 });
  const h = new Game();
  restoreCheckpoint(h, save);
  assert.equal(h.turrets[0].hp, 80);
  assert.equal(h.turrets[0].maxHp, 160);
  assert.equal(h.enemies[0].maxHp, 140 * (C.enemyWaveGrowth ** 9 * 10));
  assert.equal(h.enemies[0].hp / h.enemies[0].maxHp, 0.5);
});
test("item upgrade card grants once, fills empty slot, respects full slots and station return", () => {
  const g = setup();
  g.random = () => 0;
  g.points = 1000;
  g.state = "station";
  assert.ok(g.buyUpgrade());
  const card = g.choices.find((b) => b.item);
  assert.ok(card);
  const cost = g.points;
  assert.ok(g.chooseBuff(card.id));
  assert.equal(g.state, "station");
  assert.equal(g.points, cost);
  assert.equal(g.items[0].id, card.id);
  assert.equal(g.buffs.length, 0);
  assert.equal(g.upgradeCount, 1);
  assert.equal(g.chooseBuff(card.id), false);
  g.items[1] = { id: "beam", ammo: 480, active: false };
  g.offerBuffs();
  assert.ok(g.choices.every((b) => !b.item));
});
test("first four waves are gentler; campaign and first two endless bosses have half health", () => {
  const g = setup();
  g.reset("campaign");
  g.wave = 4;
  g.nextWave();
  assert.equal(g.enemies[0].hp, C.bossHp * 0.5);
  g.reset("endless");
  g.wave = 7;
  g.nextWave();
  assert.equal(g.enemies[0].hp, C.bossHp * 0.5);
  g.wave = 15;
  g.nextWave();
  assert.equal(g.enemies[0].hp, C.bossHp * 1.25 * 0.5);
  g.wave = 23;
  g.nextWave();
  assert.equal(g.enemies[0].hp, C.bossHp * 1.25 ** 2);
  g.wave = 5;
  assert.equal(
    g.waveSpec().count,
    Math.round(ENDLESS_WAVES[4].count * E.waveDensity),
  );
});
