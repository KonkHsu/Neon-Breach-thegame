import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/combat.js";
import {
  checkpoint,
  restoreCheckpoint,
  mergeRecords,
  validateCheckpoint,
} from "../src/endless-save.js";
function game() { const g = new Game(() => 0.5); g.reset("endless"); return g; }
test("wave checkpoint rolls back in-wave rewards and restores paused, with no reset bonus", () => {
  const g = game();
  g.score = 300;
  g.kills = 3;
  g.player.hp = 61;
  g.player.ammo = 17;
  const save = checkpoint(g, "run");
  g.score += 200;
  g.player.hp = 5;
  restoreCheckpoint(g, save);
  assert.equal(g.score, 300);
  assert.equal(g.kills, 3);
  assert.equal(g.player.hp, 61);
  assert.equal(g.player.ammo, 17);
  assert.equal(g.state, "paused");
  g.resume();
  assert.equal(g.state, "playing");
});
test("station purchases and loadout survive without repeated healing", () => {
  const g = game();
  g.wave = 8;
  g.player.hp = 30;
  g.enterStation();
  g.points = 5000;
  g.buyItem("electric");
  g.changeLoadout("mg42", "charge");
  const save = checkpoint(g, "run", 3),
    hp = g.player.hp,
    points = g.points;
  restoreCheckpoint(g, save);
  g.resume();
  assert.equal(g.state, "station");
  assert.equal(g.player.hp, hp);
  assert.equal(g.points, points);
  assert.equal(g.item.id, "electric");
  assert.equal(g.weaponId, "mg42");
});
test("active charge restores its hit Set and allies retain status", () => {
  const g = game();
  g.ultimateId = "charge";
  g.activateUltimate();
  g.ultimate.hit.add(123);
  g.spawn("chaser");
  g.enemies[0].ally = true;
  g.enemies[0].charm = 4;
  const save = checkpoint(g, "run");
  restoreCheckpoint(g, save);
  assert.ok(g.ultimate.hit.has(123));
  assert.equal(g.enemies[0].charm, 4);
});
test("reject corrupted versions, stats, unknown buffs and non-endless snapshots", () => {
  const g = game(),
    save = checkpoint(g, "r");
  assert.throws(() => validateCheckpoint({ ...save, version: 999 }));
  const bad = structuredClone(save);
  bad.data.player.hp = -1;
  assert.throws(() => validateCheckpoint(bad));
  bad.data.player.hp = 100;
  bad.data.buffs = ["unknown"];
  assert.throws(() => validateCheckpoint(bad));
  g.tutorial = {};
  assert.throws(() => checkpoint(g, "r"));
});
