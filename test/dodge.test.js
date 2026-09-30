import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/combat.js";
import { C } from "../src/config.js";
import {
  checkpoint,
  restoreCheckpoint,
  migrateCheckpoint,
  validateCheckpoint,
} from "../src/endless-save.js";
const idle = { x: 0, y: 0, fire: false };
function game() {
  const g = new Game(() => 0.5);
  g.reset("endless");
  g.spawnAcc = -100;
  g.player.invuln = 0;
  return g;
}
function tick(g, time, input = idle) {
  while (time > 1e-10) {
    const dt = Math.min(time, 1 / 120);
    g.update(dt, input);
    time -= dt;
  }
}
test("remaining includes queued enemies and tombs but excludes allies, turrets and dead entities", () => {
  const g = game();
  g.remaining = 12;
  g.enemies = [
    { hp: 10, type: "boss" },
    { hp: 10, type: "tomb" },
    { hp: 10, summoned: true },
    { hp: 0 },
    { hp: 10, ally: true },
  ];
  g.turrets = [{ hp: 10 }];
  assert.equal(g.remainingEnemies, 15);
  g.enemies.push({ hp: 10, summoned: true });
  assert.equal(g.remainingEnemies, 16);
  g.bossDefeated = true;
  assert.equal(g.remainingEnemies, 0);
});
test("dodge is exactly 150 units diagonal, locks direction and ignores speed buffs", () => {
  for (const speed of [50, 2000]) {
    const g = game();
    g.player.speed = speed;
    const { x, y } = g.player;
    assert.equal(g.evade({ x: 1, y: 1 }), true);
    tick(g, 0.18, { x: -1, y: 0, fire: false });
    assert.ok(Math.abs(g.player.x - x - 150 / Math.sqrt(2)) < 1e-7);
    assert.ok(Math.abs(g.player.y - y - 150 / Math.sqrt(2)) < 1e-7);
    assert.equal(g.evade(idle), false);
  }
});
test("default upward dodge, last movement fallback, fixed cooldown and map boundary", () => {
  const g = game();
  assert.equal(g.evade(), true);
  const y = g.player.y;
  tick(g, 0.18);
  assert.ok(Math.abs(y - g.player.y - 150) < 1e-7);
  tick(g, 2.32);
  assert.ok(g.dodge.cooldown < 1e-8);
  tick(g, 0.02, { x: 1, y: 0, fire: false });
  assert.equal(g.evade(), true);
  assert.equal(g.dodge.x, 1);
  g.player.x = C.width - 33;
  tick(g, 0.18);
  assert.equal(g.player.x, C.width - 32);
});
test("damage during dodge neither hurts nor resets regeneration; damage resumes after dodge", () => {
  const g = game();
  g.unhurtTime = 5;
  g.evade();
  g.hurtPlayer(30);
  assert.equal(g.player.hp, C.hp);
  assert.equal(g.unhurtTime, 5);
  tick(g, 0.17);
  g.hurtPlayer(30);
  assert.equal(g.player.hp, C.hp);
  tick(g, 0.03);
  g.hurtPlayer(30);
  assert.equal(g.player.hp, C.hp - 30);
  assert.equal(g.unhurtTime, 0);
});
test("dodge supports fire and reload but refuses shield charge without spending cooldown", () => {
  const g = game();
  g.player.ammo = 5;
  g.reload();
  const left = g.reloadLeft;
  g.evade();
  tick(g, 0.18);
  assert.ok(g.reloadLeft < left);
  g.reloadLeft = 0;
  g.dodge.cooldown = 0;
  g.evade();
  tick(g, 0.18, { ...idle, fire: true });
  assert.ok(g.player.ammo < 5);
  g.dodge.cooldown = 0;
  g.ultimate = { kind: "charge" };
  assert.equal(g.evade(), false);
  assert.equal(g.dodge.cooldown, 0);
});
test("pause, checkpoint restore and reset preserve or clear dodge at appropriate boundaries", () => {
  const g = game();
  g.evade({ x: 1, y: 0 });
  tick(g, 0.05);
  const d = { ...g.dodge },
    p = { ...g.player };
  g.pause();
  tick(g, 1);
  assert.deepEqual(g.dodge, d);
  assert.equal(g.player.x, p.x);
  g.resume();
  const saved = checkpoint(g, "dodge-test");
  const restored = game();
  restoreCheckpoint(restored, saved);
  assert.deepEqual(restored.dodge, d);
  restored.resume();
  tick(restored, 0.13);
  assert.ok(Math.abs(restored.player.x - 790) < 1e-7);
  assert.ok(restored.dodge.cooldown > 2.3);
  restored.reset();
  assert.equal(restored.dodge.cooldown, 0);
  assert.equal(restored.dodge.left, 0);
});
test("v5 checkpoint migrates without halving boss HP again and invalid dodge values are rejected", () => {
  const g = game();
  g.wave = 7;
  g.nextWave();
  const old = checkpoint(g, "old");
  old.version = 5;
  delete old.data.dodge;
  const hp = old.data.enemies[0].hp;
  const migrated = migrateCheckpoint(old);
  assert.equal(migrated.version, 10);
  assert.equal(migrated.data.enemies[0].hp, hp * 0.7);
  assert.equal(migrated.data.dodge.cooldown, 0);
  validateCheckpoint(migrated);
  migrated.data.dodge.left = 999;
  assert.throws(() => validateCheckpoint(migrated));
});
