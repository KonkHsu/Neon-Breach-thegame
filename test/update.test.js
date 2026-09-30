import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/combat.js";
import { C } from "../src/config.js";
import {
  checkpoint,
  migrateCheckpoint,
  mergeRecords,
} from "../src/endless-save.js";

import { ANNOUNCEMENT, announcementState } from "../src/announcement.js";

test("personal best migrates by waves and same wave does not use score", () => {
  const record = (id, wave, score) => ({
    id,
    wave,
    score,
    time: 10,
    kills: 1,
    endedAt: Number(id),
  });
  let a = mergeRecords(
    { best: record("1", 5, 999), recent: [record("2", 8, 1)] },
    null,
  );
  assert.equal(a.best.wave, 8);
  a = mergeRecords(a, record("3", 8, 9999));
  assert.equal(a.best.id, "2");
});
test("v9 Boss loses 30% once; tar energy and lifetime unchanged", () => {
  const g = new Game();
  g.reset("endless");
  g.wave = 7;
  g.nextWave();
  const s = checkpoint(g, "old");
  s.version = 9;
  const b = s.data.enemies[0];
  b.hp = 500;
  b.maxHp = 1000;
  const m = migrateCheckpoint(s);
  assert.equal(m.data.enemies[0].hp, 350);
  assert.equal(m.data.enemies[0].maxHp, 700);
  assert.deepEqual(m.data.tar, s.data.tar);
  assert.deepEqual(migrateCheckpoint(m), m);
});
test("seeded ranged substitutions preserve total and retain 35%", () => {
  const g = new Game();
  let seed = 42;
  g.random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for (const type of ["shooter", "mage"]) {
    const results = Array.from({ length: 20000 }, () => g.balanceSpawn(type));
    const retained = results.filter((x) => x === type).length;
    assert.ok(retained > 6600 && retained < 7400);
    assert.ok(results.every((x) => x === type || x === "chaser"));
  }
  assert.equal(g.balanceSpawn("charger"), "charger");
  assert.equal(C.shooterInterval, 6.4);
});
test("announcement acknowledges only on action, new version and failed storage fall back to memory", () => {
  let saved = "";
  let s = announcementState(
    () => saved,
    (_k, v) => (saved = v),
  );
  assert.ok(s.pending());
  assert.ok(s.pending());
  s.acknowledge();
  assert.equal(saved, ANNOUNCEMENT.version);
  assert.ok(
    !announcementState(
      () => saved,
      () => {},
    ).pending(),
  );
  s = announcementState(
    () => "older",
    () => false,
  );
  assert.ok(s.pending());
  s.acknowledge();
  assert.ok(!s.pending());
});

