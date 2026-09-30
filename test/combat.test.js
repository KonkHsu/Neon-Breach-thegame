import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, nearestTarget } from "../src/combat.js";
import { BUFFS, C, WAVES } from "../src/config.js";
const game = () => {
  const g = new Game(() => 0.5);
  g.reset();
  g.remaining = 999;
  return g;
};
test("nearest living target switches on kill; no enemy keeps the last heading", () => {
  const g = game(),
    p = g.player;
  const a = { id: 1, x: p.x + 40, y: p.y, hp: 1 },
    b = { id: 2, x: p.x, y: p.y + 80, hp: 1 };
  g.enemies = [a, b];
  assert.equal(nearestTarget(p, g.enemies), a);
  a.hp = 0;
  assert.equal(nearestTarget(p, g.enemies), b);
  g.shoot();
  assert.equal(p.angle, Math.PI / 2);
  g.enemies = [];
  g.shoot();
  assert.equal(p.angle, Math.PI / 2);
});
test("holding fires repeatedly, releasing stops", () => {
  const g = game();
  for (let i = 0; i < 30; i++) g.update(1 / 60, { x: 0, y: 0, fire: true });
  const n = g.events.filter((e) => e === "shoot").length;
  assert.ok(n >= 3);
  for (let i = 0; i < 10; i++) g.update(1 / 60, { x: 0, y: 0, fire: false });
  assert.equal(g.events.filter((e) => e === "shoot").length, n);
});
test("automatic primary fire waits for a target and obeys reload and pause", () => {
  const g = game();
  g.spawnAcc = -1000;
  const controls = { x: 0, y: 0, fire: false, autoFire: true };
  const initial = g.player.ammo;
  for (let i = 0; i < 60; i++) g.update(1 / 120, controls);
  assert.equal(g.player.ammo, initial);
  const enemy = g.spawn("chaser");
  Object.assign(enemy, { x: g.player.x + 80, y: g.player.y, hp: 100000, speed: 0 });
  for (let i = 0; i < 60; i++) g.update(1 / 120, controls);
  assert.ok(g.player.ammo < initial);
  const afterShooting = g.player.ammo;
  g.reload();
  g.update(1 / 120, controls);
  assert.equal(g.player.ammo, afterShooting);
  assert.ok(g.reloadLeft > 0);
  g.pause();
  const remainingReload = g.reloadLeft;
  for (let i = 0; i < 120; i++) g.update(1 / 120, controls);
  assert.equal(g.reloadLeft, remainingReload);
  g.resume();
  for (let i = 0; i < 600 && g.reloadLeft > 0; i++) g.update(1 / 120, controls);
  assert.equal(g.reloadLeft, 0);
  assert.ok(g.player.ammo > afterShooting);
});
test("pulse respects range, clears only nearby bullets, does not knock back boss; cooldown gates", () => {
  const g = game();
  g.player.x = 640;
  g.player.y = 360;
  const near = g.spawn("chaser"),
    far = g.spawn("chaser");
  Object.assign(near, { x: 700, y: 360, hp: 150 });
  Object.assign(far, { x: 1000, y: 360, hp: 150 });
  const boss = {
    id: 999,
    type: "boss",
    x: 650,
    y: 360,
    r: 40,
    hp: 1000,
    flash: 0,
    kx: 0,
    ky: 0,
  };
  g.enemies.push(boss);
  g.hazard(660, 360, 0);
  g.hazard(1100, 360, 0);
  assert.equal(g.shockwave(), true);
  assert.equal(near.hp, 150 - C.pulseDamage);
  assert.equal(far.hp, 150);
  assert.equal(boss.hp, 1000 - C.pulseDamage);
  assert.equal(boss.kx, 0);
  assert.ok(near.kx > 0);
  assert.equal(g.hazards.active.length, 1);
  assert.equal(g.shockwave(), false);
  assert.equal(g.pulseCd, C.pulseCooldown);
});
test("pause freezes every timer and entity; resume continues", () => {
  const g = game();
  g.shockwave();
  g.shoot();
  g.pause();
  const before = JSON.stringify(g);
  g.update(0.05, { x: 1, y: 0, fire: true });
  assert.equal(JSON.stringify(g), before);
  assert.equal(g.shockwave(), false);
  g.resume();
  g.update(0.05);
  assert.equal(g.time, 0.05);
  assert.equal(g.pulseCd, C.pulseCooldown - 0.05);
});
test("all buffs apply, resume the same wave, and selections cannot be replayed", () => {
  const checks = {
    damage: (p) => assert.ok(Math.abs(p.damage - C.damage * 1.3) < 1e-8),
    rate: (p) => assert.equal(p.fireDelay, C.fireDelay / 1.2),
    speed: (p) => assert.equal(p.speed, C.speed * 1.12),
    pierce: (p) => assert.equal(p.pierce, 1),
    cooldown: (p) => assert.equal(p.pulseCooldown, C.pulseCooldown * 0.85),
    heal: (p) => {
      assert.equal(p.hp, 85);
      assert.equal(p.maxHp, C.hp + 10);
    },
    magazine: (p) => {
      assert.equal(p.ammo, C.magazineSize + 10);
      assert.equal(p.magazineSize, C.magazineSize + 10);
    },
    reload: (p) => assert.equal(p.reloadDuration, C.reloadDuration * 0.85),
  };
  for (const b of BUFFS.filter((b) => !b.endlessOnly)) {
    const g = game();
    g.wave = 2;
    g.player.hp = 50;
    g.state = "buff";
    g.choices = [b];
    assert.equal(g.chooseBuff(b.id), true);
    checks[b.id]?.(g.player);
    assert.equal(g.wave, 2);
    assert.equal(g.chooseBuff(b.id), false);
    g.offerBuffs();
    assert.equal(g.stacks(b.id), 1);
    assert.equal(new Set(g.choices.map((c) => c.id)).size, g.choices.length);
  }
});
test("short run progression, kill upgrade, boss victory and death", () => {
  const g = game();
  for (let wave = 1; wave < 5; wave++) {
    assert.equal(g.wave, wave);
    g.remaining = 0;
    g.update(0.01);
  }
  assert.equal(g.wave, 5);
  assert.equal(g.enemies[0].type, "boss");
  g.enemies[0].hp = 0;
  g.update(0.01);
  advance(g, 1.3);
  assert.equal(g.state, "won");
  g.reset();
  g.player.invuln = 0;
  g.hurtPlayer(C.hp);
  assert.equal(g.state, "lost");
});
test("restart clears effects, entities, buffs, health, score and cooldown", () => {
  const g = game();
  g.shockwave();
  g.shoot();
  g.spawn("chaser");
  g.buffs.push("damage");
  g.player.hp = 3;
  g.score = 500;
  g.time = 80;
  g.reset();
  assert.equal(g.player.hp, C.hp);
  assert.equal(g.pulseCd, 0);
  assert.equal(g.pulse, null);
  assert.equal(g.time, 0);
  assert.equal(g.score, 0);
  assert.deepEqual(g.buffs, []);
  assert.equal(g.enemies.length, 0);
  assert.equal(g.bullets.active.length, 0);
  assert.equal(g.particles.active.length, 0);
  assert.equal(g.wave, 1);
});
test("boss telegraphs delay damage and pause cannot advance them", () => {
  const g = game();
  g.wave = 4;
  g.nextWave();
  const b = g.enemies[0];
  b.bossKind = "guardian";
  b.atkTimer = 0;
  g.update(0.01);
  assert.equal(b.pending.kind, "ring");
  assert.equal(g.hazards.active.length, 0);
  g.pause();
  g.update(20);
  assert.equal(b.pending.t, 1);
  g.resume();
  for (let i = 0; i < 21; i++) g.update(0.05);
  assert.ok(g.hazards.active.length > 0);
});
test("simulation movement independent of display refresh rate", () => {
  const a = game(),
    b = game();
  for (let i = 0; i < 60; i++) a.update(1 / 60, { x: 1, y: 0 });
  for (let i = 0; i < 120; i++) b.update(1 / 120, { x: 1, y: 0 });
  assert.ok(Math.abs(a.player.x - b.player.x) < 0.0001);
});
test("pooled particles and projectiles are bounded", () => {
  const g = game();
  for (let i = 0; i < 500; i++) {
    g.burst(0, 0, "white", 10);
    g.shoot();
  }
  assert.ok(g.particles.active.length <= 240);
  assert.ok(g.bullets.active.length <= 260);
});

const advance = (g, seconds, input = { x: 0, y: 0, fire: false }) => {
  for (let i = 0; i < Math.round(seconds * 120); i++) g.update(1 / 120, input);
};
function quietGame() {
  const g = game();
  g.spawnAcc = -10000;
  return g;
}
test("breathing regeneration waits four damage-free seconds, resets on hit, and caps", () => {
  const g = quietGame();
  g.player.invuln = 0;
  g.hurtPlayer(30);
  advance(g, 3.5);
  assert.equal(g.player.hp, C.hp - 30);
  advance(g, 1.5);
  assert.ok(Math.abs(g.player.hp - (C.hp - 26)) < 1e-6);
  g.hurtPlayer(10);
  assert.equal(g.unhurtTime, 0);
  advance(g, 3.9);
  assert.ok(Math.abs(g.player.hp - (C.hp - 36)) < 1e-6);
  advance(g, 15);
  assert.equal(g.player.hp, C.hp);
});
test("reload starts on empty, locks shooting, refills with unlimited reserve and resumes held fire", () => {
  const g = quietGame();
  g.player.ammo = 1;
  g.shoot();
  assert.equal(g.player.ammo, 0);
  assert.equal(g.reloadLeft, g.weapon.emptyReload);
  assert.equal(g.shoot(), false);
  assert.equal(g.reload(), false);
  advance(g, 1);
  assert.equal(g.player.ammo, 0);
  advance(g, 0.6);
  assert.equal(g.player.ammo, C.magazineSize);
  assert.equal(g.reloadLeft, 0);
  advance(g, 0.01, { x: 0, y: 0, fire: true });
  assert.equal(g.player.ammo, C.magazineSize - 1);
  for (let n = 0; n < 3; n++) {
    g.player.ammo = 0;
    g.reload();
    advance(g, 1.6);
    assert.equal(g.player.ammo, C.magazineSize);
  }
});
test("manual reload preserves ammo until complete and disallows full magazines", () => {
  const g = quietGame();
  assert.equal(g.reload(), false);
  g.player.ammo = 12;
  assert.equal(g.reload(), true);
  advance(g, 0.5);
  assert.equal(g.player.ammo, 12);
  assert.equal(g.shoot(), false);
  advance(g, 1);
  assert.equal(g.player.ammo, C.magazineSize);
});
test("reload and healing freeze in pause, upgrade selection and death; reset clears them", () => {
  const g = quietGame();
  g.player.hp = 40;
  g.player.ammo = 5;
  g.reload();
  g.unhurtTime = 5;
  for (const state of ["paused", "buff", "lost"]) {
    g.state = state;
    const before = JSON.stringify(g);
    advance(g, 5);
    assert.equal(JSON.stringify(g), before);
    assert.equal(g.reload(), false);
  }
  g.reset();
  assert.equal(g.reloadLeft, 0);
  assert.equal(g.player.ammo, C.magazineSize);
  assert.equal(g.unhurtTime, 0);
});
test("kills award points without automatically interrupting play", () => {
  const g = quietGame();
  for (let i = 0; i < 30; i++) g.hurtEnemy(g.spawn("chaser"), 99999, 0);
  g.update(0.01);
  assert.equal(g.state, "playing");
  assert.equal(g.points, 300);
  assert.ok(g.buyUpgrade());
  assert.equal(g.points, 200);
  assert.equal(g.upgradeCost, 120);
  assert.equal(g.buyUpgrade(), false);
  g.chooseBuff(g.choices[0].id);
  assert.equal(g.state, "playing");
});
test("piercing stacks, capped buffs leave the pool and fresh restart resets caps", () => {
  const g = quietGame(),
    b = BUFFS.find((b) => b.id === "pierce");
  for (let i = 0; i < 12; i++) {
    g.state = "buff";
    g.choices = [b];
    assert.equal(g.chooseBuff(b.id), true);
  }
  assert.equal(g.player.pierce, 12);
  g.offerBuffs();
  assert.ok(!g.choices.some((c) => c.id === "pierce"));
  g.choices = [b];
  assert.equal(g.chooseBuff(b.id), false);
  g.reset();
  assert.equal(g.stacks("pierce"), 0);
  assert.equal(g.player.pierce, 0);
});
test("magazine upgrade completes reload and fast reload changes the next reload duration", () => {
  const g = quietGame();
  g.player.ammo = 5;
  g.reload();
  g.state = "buff";
  g.choices = [BUFFS.find((b) => b.id === "magazine")];
  g.chooseBuff("magazine");
  assert.equal(g.player.ammo, C.magazineSize + 10);
  assert.equal(g.reloadLeft, 0);
  g.state = "buff";
  g.choices = [BUFFS.find((b) => b.id === "reload")];
  g.chooseBuff("reload");
  g.player.ammo = 2;
  g.reload();
  assert.equal(g.reloadLeft, C.reloadDuration * 0.85);
});
test("enemy density increases; boss escorts stay bounded and cannot block victory", () => {
  assert.equal(
    WAVES.reduce((n, w) => n + w.count, 0),
    376,
  );
  assert.ok(WAVES[0].every < 1);
  const g = quietGame();
  g.wave = 4;
  g.nextWave();
  g.player.invuln = 999;
  advance(g, 6.2);
  assert.equal(g.enemies.length, 4);
  g.hurtEnemy(
    g.enemies.find((e) => e.type === "boss"),
    C.bossHp * 2,
    0,
  );
  g.update(0.01);
  advance(g, 1.3);
  assert.equal(g.state, "won");
});
test("healing and reload timing agree at 60 and 120Hz", () => {
  const a = quietGame(),
    b = quietGame();
  for (const g of [a, b]) {
    g.player.hp = 50;
    g.player.ammo = 0;
    g.reload();
  }
  for (let i = 0; i < 360; i++) a.update(1 / 60);
  for (let i = 0; i < 720; i++) b.update(1 / 120);
  assert.ok(Math.abs(a.player.hp - b.player.hp) < 1e-6);
  assert.equal(a.player.ammo, b.player.ammo);
});

test("endless bosses advance through multiple cycles; campaign still wins", () => {
  const g = game();
  g.reset("endless");
  for (const wave of [8, 16, 24]) {
    g.wave = wave - 1;
    g.nextWave();
    g.hurtEnemy(g.enemies[0], 1e6, 0);
    g.update(0.01);
    advance(g, 1.3);
    assert.equal(g.state, "station");
    g.leaveStation();
    assert.equal(g.wave, wave + 1);
    assert.equal(g.state, "playing");
  }
  g.reset();
  assert.equal(g.mode, "endless");
  assert.equal(g.wave, 1);
  g.reset("campaign");
  assert.equal(g.mode, "campaign");
});
test("repeatable offense grows past old caps in both modes", () => {
  for (const mode of ["campaign", "endless"]) {
    const g = game();
    g.reset(mode);
    for (let i = 0; i < 30; i++)
      for (const id of ["damage", "rate", "dragon"]) {
        g.state = "buff";
        g.choices = [BUFFS.find((b) => b.id === id)];
        assert.ok(g.chooseBuff(id));
      }
    assert.equal(g.player.damage, C.damage * 10);
    assert.ok(g.player.fireDelay < C.fireDelay / 4);
    assert.ok(g.availableBuffs().some((b) => b.id === "damage"));
  }
});
test("enemy health grows with waves while stage speed stays bounded", () => {
  const g = game();
  g.reset("endless");
  for (const [time, name] of [
    [0, "接入"],
    [180, "成型"],
    [360, "过载"],
    [600, "极限"],
  ]) {
    g.time = time;
    assert.equal(g.pressure().name, name);
  }
  g.wave = 999;
  g.time = 1e7;
  const e = g.spawn("chaser");
  assert.equal(e.hp, C.chaserHp * (2.2 * C.enemyWaveGrowth ** 998));
  assert.ok(e.speed < 120);
  g.wave = 999;
  g.nextWave();
  assert.ok(
    Math.abs(
      g.enemies[0].maxHp / (C.bossHp * 1.66 * C.bossRoundGrowth ** 124) - 1,
    ) < 1e-12,
  );
  g.wave = 9;
  const recovery = g.waveSpec();
  g.wave = 14;
  assert.ok(recovery.every > g.waveSpec().every);
});
test("danger strips warn, hurt only outside safe area and freeze on pause", () => {
  const g = quietGame();
  g.reset("endless");
  g.time = 700;
  g.waveTime = 1.2;
  g.spawnAcc = -999;
  g.player.invuln = 0;
  g.player.x = 40;
  assert.equal(g.dangerField().active, false);
  g.update(0.01);
  assert.equal(g.player.hp, C.hp);
  g.waveTime = 3.2;
  g.update(0.01);
  assert.equal(g.player.hp, C.hp - 10);
  g.pause();
  const before = JSON.stringify(g);
  g.update(0.05);
  assert.equal(JSON.stringify(g), before);
  g.resume();
  g.player.x = 640;
  g.player.y = 360;
  g.player.invuln = 0;
  g.update(0.01);
  assert.equal(g.player.hp, C.hp - 10);
});
test("shield breaks to pulse; pulse-ammo rewards hits; completed reload charges only three shots", () => {
  const g = quietGame();
  g.reset("endless");
  g.spawnAcc = -999;
  g.player.pulseAmmo = true;
  g.player.chamber = true;
  g.player.ammo = 5;
  const e = g.spawn("shield");
  e.x = g.player.x + 50;
  e.y = g.player.y;
  e.hp = 200;
  g.shockwave();
  assert.equal(e.shield, 0);
  assert.equal(e.hp, 200 - C.pulseDamage);
  assert.equal(g.player.ammo, 11);
  g.reload();
  advance(g, 1.6);
  assert.equal(g.player.chargedShots, 3);
  g.enemies = [];
  for (let i = 0; i < 4; i++) g.shoot();
  assert.deepEqual(
    g.bullets.active.slice(-4).map((b) => b.damage),
    [C.damage * 1.6, C.damage * 1.6, C.damage * 1.6, C.damage],
  );
});
test("late boss adds a telegraphed fan attack", () => {
  const g = game();
  g.reset("endless");
  g.time = 700;
  g.wave = 15;
  g.nextWave();
  const b = g.enemies[0];
  b.bossKind = "guardian";
  b.sequence = 2;
  b.atkTimer = 0;
  g.updateBoss(b, 0.01);
  assert.equal(b.pending.kind, "fan");
  assert.equal(g.hazards.active.length, 0);
  g.updateBoss(b, 1);
  assert.equal(g.hazards.active.length, 7);
});
test("kill fragments cannot recursively split; piercing damage decays", () => {
  const g = quietGame();
  g.reset("endless");
  g.spawnAcc = -999;
  g.player.split = true;
  g.player.pierce = 1;
  const a = g.spawn("chaser"),
    b = g.spawn("chaser");
  Object.assign(a, { x: 670, y: 380, hp: 1, warm: 9 });
  Object.assign(b, { x: 760, y: 380, hp: 100, warm: 9 });
  g.shoot();
  g.update(0.01);
  assert.equal(g.bullets.active.filter((b) => b.fragment).length, 1);
  assert.ok(
    Math.abs(
      g.bullets.active.find((b) => !b.fragment).damage - C.damage * 0.85,
    ) < 1e-9,
  );
});
