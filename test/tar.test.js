import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/combat.js";
import { C } from "../src/config.js";
import {
  checkpoint,
  restoreCheckpoint,
  migrateCheckpoint,
} from "../src/endless-save.js";
const idle = { x: 0, y: 0, fire: false };
function setup() {
  const g = new Game(() => 0.5);
  g.reset("endless", "qbz191", "tar");
  g.spawnAcc = -1e6;
  return g;
}
function step(g, seconds, input = idle, hz = 120) {
  while (seconds > 1e-9) {
    const dt = Math.min(1 / hz, seconds);
    g.update(dt, input);
    seconds -= dt;
  }
}
function enemy(g, x = g.player.x, y = g.player.y) {
  const e = g.spawn("chaser");
  Object.assign(e, {
    x,
    y,
    hp: 10000,
    maxHp: 10000,
    speed: 0,
    warm: 999,
    r: 16,
  });
  return e;
}
test("160 base HP and v6 migration preserve missing health, buffs and dodge", () => {
  const g = setup();
  assert.equal(g.player.hp, 160);
  g.buffs = ["heal"];
  g.rebuildStats();
  const save = checkpoint(g, "v6");
  save.version = 6;
  save.data.player.maxHp = 110;
  save.data.player.hp = 70;
  delete save.data.tar;
  save.data.dodge.cooldown = 1;
  const next = migrateCheckpoint(save);
  assert.equal(next.data.player.hp, 130);
  assert.equal(next.data.player.maxHp, 170);
  assert.equal(next.data.dodge.cooldown, 1);
  assert.deepEqual(migrateCheckpoint(next), next);
});
test("tar toggles with any energy, drains in 10 seconds, recharges only when off/equipped", () => {
  const g = setup();
  assert.ok(g.activateUltimate());
  step(g, 10);
  assert.ok(!g.tar.active);
  assert.equal(g.tar.energy, 0);
  step(g, 20);
  assert.ok(Math.abs(g.tar.energy - 100) < 1e-7);
  g.tar.energy = 0.01;
  g.activateUltimate();
  step(g, 0.01);
  assert.equal(g.tar.active, false);
  g.ultimateId = "pulse";
  const energy = g.tar.energy;
  step(g, 2);
  assert.equal(g.tar.energy, energy);
});
test("tar damage is fixed, nonstacking, excludes allies, does not execute or trigger player combos", () => {
  for (const hz of [60, 120]) {
    const g = setup(),
      e = enemy(g),
      ally = enemy(g, 300, 200);
    ally.ally = true;
    g.buffs = [
      "damage",
      "salvage",
      "frenzy",
      "dragon",
      "ice",
      "thermal",
      "split",
      "ember",
    ];
    g.rebuildStats();
    g.oneHit = 8;
    g.player.ammo = 5;
    g.activateUltimate();
    g.tar.patches.push(
      { x: 641, y: 380, life: 2 },
      { x: 300, y: 200, life: 2 },
    );
    step(g, 1, idle, hz);
    assert.ok(Math.abs(e.hp - 9940) < 1e-6);
    assert.equal(ally.hp, 10000);
    assert.equal(g.player.ammo, 5);
    assert.equal(g.frenzy, 0);
    assert.ok(!e.burn && !e.frozen);
    e.x = 1000;
    step(g, 1);
    assert.ok(Math.abs(e.hp - 9940) < 1e-6);
  }
});
test("tar kills reward once, mage leaves tomb, Boss/tomb take damage without knockback", () => {
  const g = setup(),
    e = enemy(g);
  e.type = "mage";
  e.hp = 5;
  e.hpScale = 1;
  g.activateUltimate();
  step(g, 0.1);
  assert.equal(g.points, 10);
  assert.equal(g.kills, 1);
  const tomb = g.enemies.find((e) => e.type === "tomb");
  assert.ok(tomb);
  const hp = tomb.hp;
  step(g, 0.1);
  assert.equal(tomb.hp, hp - 6);
  assert.equal(tomb.kx, 0);
  const b = enemy(g);
  b.type = "boss";
  b.bossKind = "guardian";
  b.sequence = 0;
  const initial = b.hp;
  step(g, 0.1);
  assert.equal(b.hp, initial - 6);
});
test("tar leaves continuous dodge trail and permits firing/reloading; off patches expire", () => {
  const g = setup();
  g.activateUltimate();
  const x = g.player.x;
  g.evade({ x: 1, y: 0 });
  step(g, 0.18, { ...idle, fire: true });
  assert.ok(g.player.ammo < 48);
  for (let px = x; px <= x + 150; px += 10)
    assert.ok(
      g.tar.patches.some((p) => Math.hypot(px - p.x, g.player.y - p.y) <= 48),
    );
  assert.ok(g.reload());
  g.activateUltimate();
  step(g, 1);
  assert.ok(g.reloadLeft > 0);
  step(g, 8);
  assert.equal(g.tar.patches.length, 0);
});
test("pause and checkpoint preserve tar; normal waves retain, station clears without refilling, reset clears", () => {
  const g = setup();
  g.activateUltimate();
  step(g, 1);
  g.pause();
  const snapshot = JSON.stringify(g.tar);
  step(g, 1);
  assert.equal(JSON.stringify(g.tar), snapshot);
  g.resume();
  const save = checkpoint(g, "tar");
  const h = setup();
  restoreCheckpoint(h, save);
  assert.deepEqual(h.tar, g.tar);
  h.resume();
  h.nextWave();
  assert.ok(h.tar.active && h.tar.patches.length);
  const energy = h.tar.energy;
  h.enterStation();
  assert.equal(h.tar.active, false);
  assert.equal(h.tar.patches.length, 0);
  h.changeLoadout("mg42", "pulse");
  h.changeLoadout("qbz191", "tar");
  assert.equal(h.tar.energy, energy);
  step(h, 1);
  assert.equal(h.tar.energy, energy);
  h.reset();
  assert.equal(h.tar.energy, 100);
});
test("dodge lesson requires an actual incoming dodge, tar skill lesson needs moving damage and manual stop", () => {
  const g = setup();
  g.startTutorial("qbz191", "tar");
  g.player.x = g.tutorial.target.x;
  step(g, 0.01);
  assert.equal(g.tutorial.step, "dodge");
  g.player.x = g.tutorial.target.x;
  step(g, 0.1);
  assert.equal(g.tutorial.step, "dodge");
  g.player.x -= 150;
  g.evade({ x: 1, y: 0 });
  step(g, 0.2);
  assert.equal(g.tutorial.step, "shoot");
  g.tutorial.step = "skill";
  g.enemies = [];
  enemy(g, g.player.x + 40);
  g.activateUltimate();
  step(g, 0.25, { x: 1, y: 0, fire: false });
  assert.ok(g.tutorial.tarHit);
  assert.equal(g.tutorial.step, "skill");
  g.activateUltimate();
  step(g, 0.01);
  assert.equal(g.tutorial.step, "upgrade");
});
test("tar kill cannot spread existing burn, and killing Boss immediately clears all tar", () => {
  const g = setup();
  g.buffs = ["ember", "salvage", "split"];
  g.rebuildStats();
  const a = enemy(g),
    b = enemy(g, g.player.x + 100);
  a.hp = 10;
  a.burn = 3;
  a.burnDps = 12;
  a.burnOwner = "player";
  g.player.ammo = 3;
  g.activateUltimate();
  g.updateTar(0.1);
  assert.ok(!b.burn);
  assert.equal(g.player.ammo, 3);
  assert.equal(g.bullets.active.length, 0);
  b.type = "boss";
  b.hp = 1;
  b.x = g.player.x;
  g.updateTar(0.1);
  assert.ok(g.bossDefeated);
  assert.equal(g.tar.active, false);
  assert.equal(g.tar.patches.length, 0);
});

test("v7 tar patches migrate both lifetime reductions without changing health or energy", () => {
  const g = setup(); g.activateUltimate(); step(g, .2);
  const save = checkpoint(g, "v7"); save.version = 7;
  save.data.tar.patches = [{x: 300, y: 200, life: 8}, {x: 320, y: 200, life: 2}];
  const next = migrateCheckpoint(save);
  assert.deepEqual(next.data.tar.patches.map(p => p.life), [2, .5]);
  assert.equal(next.data.player.hp, save.data.player.hp);
  assert.equal(next.data.tar.energy, save.data.tar.energy);
  assert.deepEqual(migrateCheckpoint(next), next);
});

test("v8 tar patches halve remaining life once while preserving energy and health", () => {
  const g = setup(); g.activateUltimate(); step(g, .2);
  const save = checkpoint(g, "v8"); save.version = 8;
  save.data.tar.patches = [{x: 300, y: 200, life: 4}, {x: 320, y: 200, life: 1}];
  const next = migrateCheckpoint(save);
  assert.deepEqual(next.data.tar.patches.map(p => p.life), [2, .5]);
  assert.equal(next.data.player.hp, save.data.player.hp);
  assert.equal(next.data.tar.energy, save.data.tar.energy);
  assert.deepEqual(migrateCheckpoint(next), next);
});
