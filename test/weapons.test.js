import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/combat.js";
import { BUFFS, C } from "../src/config.js";
import {
  WEAPONS,
  ULTIMATES,
  ULT_KILLS,
  damageAtRange,
} from "../src/weapons.js";
const setup = (weapon = "qbz191", ult = "ricochet") => {
  const g = new Game(() => 0.5);
  g.reset("endless", weapon, ult);
  g.spawnAcc = -9999;
  g.remaining = 999;
  return g;
};
const advance = (g, t, input = { x: 0, y: 0, fire: false }) => {
  for (let i = 0; i < Math.round(t * 120); i++) g.update(1 / 120, input);
};
test("weapons keep exact panel damage, magazines, pellet counts and timing", () => {
  const expected = {
    svd: [[85, 77], 6, 1, 0.375],
    qbz191: [[28, 24, 22, 17], 48, 1, 0.08],
    mg42: [[22, 19, 18, 16], 250, 1, 0.049],
    aa12: [[16, 8, 6, 5], 16, 8, 0.177],
  };
  for (const [id, [damages, mag, pellets, interval]] of Object.entries(
    expected,
  )) {
    const g = setup(id);
    assert.deepEqual(g.weapon.damages, damages);
    assert.equal(g.player.ammo, mag);
    g.shoot();
    assert.equal(g.player.ammo, mag - 1);
    assert.equal(g.bullets.active.length, pellets);
    assert.equal(g.shotCd, interval);
    assert.ok(g.bullets.active.every((b) => b.damage === damages[0]));
  }
});
test("damage falls off at each weapon range and projectiles expire at max range", () => {
  for (const w of Object.values(WEAPONS)) {
    for (let i = 0; i < w.damages.length; i++)
      assert.equal(damageAtRange(w, w.ranges[i]) * w.damage, w.damages[i]);
    assert.equal(damageAtRange(w, w.ranges.at(-1) + 1), 0);
    const g = setup(w.id);
    g.player.x = 100;
    g.player.y = 380;
    g.player.angle = 0;
    g.shoot();
    advance(g, 1.2);
    assert.equal(g.bullets.active.length, 0);
  }
});
test("actual hit uses distance falloff; swept collision catches fast bullet", () => {
  const g = setup();
  g.player.x = 100;
  g.player.y = 380;
  g.player.angle = 0;
  const e = g.spawn("chaser");
  Object.assign(e, { x: 400, y: 380, hp: 200, speed: 0, warm: 99 });
  g.shoot();
  advance(g, 0.3);
  assert.equal(e.hp, 176);
  const h = setup();
  const target = h.spawn("chaser");
  Object.assign(target, { x: 700, y: 380, hp: 100, warm: 99 });
  h.addBullet(650, 380, 0, { speed: 8000, damage: 28 });
  h.update(0.01);
  assert.equal(target.hp, 72);
});
test("49ms automatic fire cadence is independent of 60/120Hz simulation and stops on release", () => {
  for (const hz of [60, 120]) {
    const g = setup("mg42");
    for (let i = 0; i < hz; i++) g.update(1 / hz, { x: 0, y: 0, fire: true });
    assert.ok(Math.abs(250 - g.player.ammo - 21) <= 1);
    const ammo = g.player.ammo;
    advance(g, 0.2);
    assert.equal(g.player.ammo, ammo);
  }
});
test("partial and empty reload use each weapon timings; weapon stat upgrades always improve", () => {
  for (const id of Object.keys(WEAPONS)) {
    const g = setup(id);
    g.player.ammo--;
    g.reload();
    assert.equal(g.reloadTotal, g.weapon.reloadDuration);
    advance(g, g.reloadTotal + 0.05);
    assert.equal(g.player.ammo, g.player.magazineSize);
    g.player.ammo = 0;
    g.reload();
    assert.ok(Math.abs(g.reloadTotal - g.weapon.emptyReload) < 1e-8);
    let prev = g.player.fireDelay;
    for (let i = 0; i < 3; i++) {
      g.buffs.push("rate");
      g.rebuildStats();
      assert.ok(g.player.fireDelay < prev);
      assert.ok(g.player.fireDelay > 0);
      prev = g.player.fireDelay;
    }
  }
});
test("ricochet has fixed stats unaffected by weapon/buffs, wall bounce and finite ammo", () => {
  for (const weapon of Object.keys(WEAPONS)) {
    const g = setup(weapon);
    g.player.damage = 999;
    g.player.pierce = 9;
    g.player.fireDelay = 0.001;
    g.player.chargedShots = 3;
    g.player.split = true;
    g.player.angle = 0;
    g.player.x = 1220;
    assert.ok(g.activateUltimate());
    assert.equal(g.reload(), false);
    assert.equal(g.shoot(), false);
    g.update(0.01);
    assert.equal(g.specialBullets.active.length, 4);
    const b = g.specialBullets.active[0];
    assert.equal(b.damage, 42);
    assert.equal(b.left, 3);
    advance(g, 0.03);
    assert.ok(b.vx < 0);
    assert.ok(b.bounces < 5);
    advance(g, 5.4);
    assert.equal(g.ultimate, null);
    assert.equal(g.player.ammo, g.weapon.magazineSize);
    assert.equal(g.ultCharge, 0);
  }
});
test("ultimate projectiles do not self-recharge after the ultimate ends", () => {
  const g = setup();
  g.ultCharge = 0;
  const e = g.spawn("chaser");
  Object.assign(e, { x: 680, y: 380, hp: 1, warm: 99 });
  g.addBullet(665, 380, 0, {
    ultimate: true,
    weaponId: null,
    damage: 42,
    life: 1,
  });
  g.update(0.01);
  assert.equal(e.hp, -41);
  assert.equal(g.ultCharge, 0);
});
test("charge clears enemies and shield along path, costs energy, steers, cannot repeatedly hit boss", () => {
  const g = setup("qbz191", "charge");
  g.player.angle = 0;
  const e = g.spawn("shield");
  Object.assign(e, { x: 700, y: 380, warm: 99 });
  g.activateUltimate();
  advance(g, 0.1);
  assert.ok(e.hp <= 0);
  assert.ok(g.ultimate.energy < 294 && g.ultimate.energy > 290);
  const angle = g.ultimate.angle;
  g.update(0.05, { x: 0, y: -1, fire: true });
  assert.ok(g.ultimate.angle < angle);
  assert.equal(g.player.ammo, 48);
  g.wave = 7;
  g.nextWave();
  const boss = g.enemies[0];
  g.player.x = boss.x - 40;
  g.player.y = boss.y;
  g.ultimate.angle = 0;
  const hp = boss.hp;
  g.update(0.01);
  assert.equal(boss.hp, hp - 2520);
  g.player.x = boss.x - 40;
  g.player.y = boss.y;
  g.update(0.01);
  assert.equal(boss.hp, hp - 2520);
});
test("charge ends on depletion, shields contact damage, ultimate pause and restart are clean", () => {
  const g = setup("aa12", "charge");
  g.activateUltimate();
  g.player.invuln = 0;
  g.update(0.01);
  assert.ok(g.player.invuln > 0);
  g.pause();
  const before = JSON.stringify(g);
  g.update(0.05);
  assert.equal(JSON.stringify(g), before);
  g.resume();
  g.ultimate.energy = 0.01;
  g.update(0.01);
  assert.equal(g.ultimate, null);
  g.ultCharge = 59;
  const e = g.spawn("chaser");
  g.hurtEnemy(e, 9999, 0);
  assert.equal(g.ultCharge, ULT_KILLS);
  g.activateUltimate();
  g.reset();
  assert.equal(g.weaponId, "aa12");
  assert.equal(g.ultimateId, "charge");
  assert.equal(g.ultimate, null);
  assert.equal(g.ultCharge, ULT_KILLS);
  assert.equal(g.player.ammo, 16);
});
test("AA12 pellet falloff uses first contact, not overshot frame endpoint", () => {
  for (const [x, expected] of [
    [154, 16],
    [155, 8],
    [242.2, 8],
    [243.2, 6],
  ]) {
    const g = setup("aa12");
    g.player.x = 100;
    g.player.y = 380;
    const e = g.spawn("chaser");
    Object.assign(e, { x, y: 380, hp: 200, warm: 99 });
    g.addBullet(122, 380, 0, { damage: 16 });
    advance(g, 0.3);
    assert.equal(e.hp, 200 - expected);
  }
});
test("shockwave is the default selectable skill; other loadouts cannot cast it", () => {
  const g = new Game();
  g.reset();
  assert.equal(g.ultimateId, "pulse");
  assert.ok(g.activateUltimate());
  assert.equal(g.pulseCd, C.pulseCooldown);
  assert.equal(g.activateUltimate(), false);
  g.reset("campaign", "mg42", "charge");
  assert.equal(g.shockwave(), false);
  assert.ok(g.activateUltimate());
  assert.equal(g.ultimate.kind, "charge");
});
test("only shockwave loadouts receive pulse-specific upgrades; choices remain three", () => {
  const g = setup("qbz191", "ricochet");
  g.time = 300;
  for (let i = 0; i < 20; i++) {
    g.offerBuffs();
    assert.ok(g.choices.every((b) => b.skill !== "pulse"));
  }
  assert.equal(g.choices.length, 3);
  assert.ok(g.availableBuffs().some((b) => b.id === "damage"));
});
