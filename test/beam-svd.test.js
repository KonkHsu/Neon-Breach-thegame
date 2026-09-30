import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/combat.js";
import { ITEMS } from "../src/config.js";
import { WEAPONS } from "../src/weapons.js";
import { checkpoint, restoreCheckpoint } from "../src/endless-save.js";
const setup = () => {
  const g = new Game(() => 0.5);
  g.reset("endless", "svd");
  g.spawnAcc = -99999;
  g.remaining = 999;
  g.player.x = 200;
  g.player.y = 380;
  return g;
};
const target = (g, x, y = 380) =>
  Object.assign(g.spawn("chaser"), {
    x,
    y,
    hp: 10000,
    maxHp: 10000,
    warm: 999,
    speed: 0,
  });
const activate = (g) => {
  g.item = { id: "beam", ammo: ITEMS.beam.ammo, cd: 0, active: false };
  assert.ok(g.useItem());
};
test("beam hits all collinear enemies including shield/boss, spares off-axis and allies, ignores weapon buffs", () => {
  const g = setup(),
    a = target(g, 400),
    b = target(g, 600),
    boss = target(g, 800),
    off = target(g, 1100, 650),
    ally = target(g, 500);
  boss.type = "boss";
  ally.ally = true;
  ally.charm = 8;
  b.shield = 50;
  g.player.damage = 99999;
  activate(g);
  g.updateRogue(0.5);
  assert.equal(a.hp, 9325);
  assert.equal(b.hp, 9375);
  assert.equal(b.shield, 0);
  assert.equal(boss.hp, 9550);
  assert.equal(off.hp, 10000);
  assert.equal(ally.hp, 10000);
  assert.equal(g.beam.endX, 1256);
  assert.equal(g.player.ammo, 6);
  a.hp = b.hp = boss.hp = 0;
  g.updateRogue(0.01);
  assert.ok(g.beam.endY > 380);
});
test("beam damage and 8-second energy agree at 60/120Hz; pause freezes and station/reset clear", () => {
  for (const hz of [60, 120]) {
    const g = setup(),
      e = target(g, 400);
    e.hp = e.maxHp = 20000;
    activate(g);
    for (let i = 0; i < hz; i++) g.updateRogue(1 / hz);
    assert.ok(Math.abs(e.hp - 18650) < 1e-6);
    assert.ok(Math.abs(g.item.ammo - 420) < 1e-6);
    g.pause();
    const snap = JSON.stringify(g);
    g.update(0.05);
    assert.equal(JSON.stringify(g), snap);
    g.resume();
    for (let i = 0; i < 7 * hz; i++) g.updateRogue(1 / hz);
    assert.equal(g.item, null);
    assert.ok(Math.abs(e.hp - 9200) < 1e-5);
    g.updateRogue(0.01);
    assert.equal(g.beam, null);
    activate(g);
    g.updateRogue(0.1);
    g.enterStation();
    assert.equal(g.beam, null);
    assert.equal(g.item, null);
    g.reset();
    assert.equal(g.beam, null);
  }
});
test("SVD uses exact panel timings and has strongest bullet knockback", () => {
  const g = setup(),
    e = target(g, 250);
  g.shoot();
  g.update(0.02);
  assert.equal(e.hp, 9915);
  assert.equal(e.kx, 97.5);
  assert.equal(g.player.ammo, 5);
  assert.ok(
    WEAPONS.svd.knock > Math.max(WEAPONS.mg42.knock, WEAPONS.qbz191.knock),
  );
  g.reload();
  assert.equal(g.reloadTotal, 2.11);
  g.reloadLeft = 0;
  g.player.ammo = 0;
  g.reload();
  assert.ok(Math.abs(g.reloadTotal - 1.77) < 1e-10);
  assert.equal(g.player.speed, 231.6);
});
test("charge turns 90 degrees in under 0.2 seconds and charm reaches expanded area", () => {
  const g = setup();
  g.ultimateId = "charge";
  g.player.angle = 0;
  g.activateUltimate();
  for (let i = 0; i < 24; i++) g.updateUltimate(1 / 120, { x: 0, y: 1 });
  assert.ok(Math.abs(g.player.angle - Math.PI / 2) < 1e-8);
  const h = setup(),
    e = target(h, 500, 380);
  h.charmBlast(340, 380);
  assert.ok(e.ally);
  assert.equal(ITEMS.charm.ammo, 16);
});
test("SVD and active beam survive existing endless checkpoint format", () => {
  const g = setup();
  activate(g);
  g.updateRogue(0.4);
  const save = checkpoint(g, "beam-svd");
  const restored = setup();
  restoreCheckpoint(restored, save);
  assert.equal(restored.weaponId, "svd");
  assert.equal(restored.item.ammo, 456);
  restored.state = "playing";
  restored.update(0.01);
  assert.ok(restored.beam);
  assert.ok(restored.item.ammo < 456);
});
