import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/combat.js";
import { BUFFS, ITEMS, C } from "../src/config.js";
const setup = (weapon = "qbz191", mode = "endless") => {
  const g = new Game(() => 0.5);
  g.reset(mode, weapon);
  g.remaining = 999;
  g.spawnAcc = -1e8;
  return g;
};
const step = (g, t, hz = 120, fire = false) => {
  for (let i = 0; i < Math.round(t * hz); i++)
    g.update(1 / hz, { x: 0, y: 0, fire });
};
const add = (g, id, n = 1) => {
  for (let i = 0; i < n; i++) {
    g.state = "buff";
    g.choices = [BUFFS.find((b) => b.id === id)];
    assert.ok(g.chooseBuff(id));
  }
};
const enemy = (g, x = 720, hp = 1000) =>
  Object.assign(g.spawn("chaser"), {
    x,
    y: 380,
    hp,
    maxHp: hp,
    warm: 100,
    speed: 0,
  });

test("stat growth uses weapon base, generous caps, meaningful candidate filtering", () => {
  for (const w of ["qbz191", "mg42", "aa12", "svd"]) {
    const g = setup(w);
    add(g, "damage", 100);
    add(g, "rate", 20);
    add(g, "speed", 25);
    add(g, "magazine", 10);
    assert.equal(g.player.damage, g.weapon.damage * 31);
    assert.ok(Math.abs(g.player.fireDelay - g.weapon.fireDelay / 3.8) < 1e-10);
    assert.equal(g.player.speed, g.weapon.speed * 2.4);
    assert.equal(
      g.player.magazineSize,
      g.weapon.magazineSize + Math.ceil(g.weapon.magazineSize * 0.2) * 10,
    );
    while (g.availableBuffs().some((b) => b.id === "reload")) add(g, "reload");
    while (g.availableBuffs().some((b) => b.id === "cooldown"))
      add(g, "cooldown");
    add(g, "ice", 10);
    assert.equal(g.player.reloadDuration, 0.3);
    assert.equal(g.player.pulseCooldown, 2);
    assert.equal(g.player.iceChance, 0.6);
    assert.equal(g.player.iceDuration, 1.5);
    assert.ok(
      !g
        .availableBuffs()
        .some((b) => ["reload", "cooldown", "speed", "ice"].includes(b.id)),
    );
  }
});
test("upgrade price keeps rising, single debit, stationary return and frozen choice time", () => {
  const g = setup();
  g.points = 10000;
  for (const cost of [100, 120, 140, 160, 180, 200, 220, 240]) {
    const before = g.points;
    assert.equal(g.upgradeCost, cost);
    assert.ok(g.buyUpgrade());
    assert.equal(g.points, before - cost);
    assert.equal(g.buyUpgrade(), false);
    const snapshot = JSON.stringify(g);
    step(g, 3);
    assert.equal(JSON.stringify(g), snapshot);
    assert.equal(new Set(g.choices.map((b) => b.id)).size, 3);
    g.chooseBuff(g.choices[0].id);
  }
  g.enterStation();
  const wave = g.wave;
  assert.ok(g.buyUpgrade());
  g.chooseBuff(g.choices[0].id);
  assert.equal(g.state, "station");
  assert.equal(g.wave, wave);
});
test("swapping preserves build and skill resources without repeated acquisition healing or ammo", () => {
  const g = setup();
  add(g, "damage", 8);
  add(g, "magazine", 2);
  add(g, "heal", 3);
  add(g, "cooldown", 2);
  add(g, "pulse-ammo");
  g.player.hp = 30;
  g.pulseCd = 7;
  g.enterStation();
  const hp = g.player.hp,
    ammo = g.player.ammo;
  assert.ok(g.changeLoadout("mg42", "charge"));
  assert.equal(g.player.damage, 22 * 3.4);
  assert.equal(g.player.hp, hp);
  assert.equal(g.player.ammo, 0);
  g.ultCharge = 13;
  g.changeLoadout("aa12", "ricochet");
  g.changeLoadout("qbz191", "pulse");
  assert.equal(g.player.ammo, ammo);
  assert.equal(g.pulseCd, 7);
  assert.equal(g.player.hp, hp);
  g.changeLoadout("mg42", "charge");
  assert.equal(g.ultCharge, 13);
  assert.equal(g.player.ammo, 0);
});
test("dragon and ice coexist; all shotgun pellets share one freeze roll per target", () => {
  const g = setup("aa12");
  add(g, "dragon", 2);
  add(g, "damage", 2);
  add(g, "ice");
  g.shoot();
  assert.equal(new Set(g.bullets.active.map((b) => b.shot)).size, 1);
  const e = enemy(g);
  let rolls = 0;
  g.random = () => {
    rolls++;
    return 0.1;
  };
  for (const b of g.bullets.active) g.applyElements(e, b);
  assert.equal(rolls, 1);
  assert.equal(e.burn, 3);
  assert.equal(e.burnDps, 32);
  assert.equal(e.frozen, 0.6);
  const hp = e.hp;
  g.updateStatus(e, 0.5);
  assert.equal(e.hp, hp - 16);
});
test("shared thaw immunity prevents alternating electric and ice freeze locks; boss slows only", () => {
  const g = setup(),
    e = enemy(g);
  g.freezeEnemy(e, 2, 2);
  g.freezeEnemy(e, 10);
  assert.equal(e.frozen, 2);
  g.updateStatus(e, 2);
  assert.equal(e.thaw, 2);
  g.freezeEnemy(e, 0.6);
  assert.equal(e.frozen, 0);
  g.updateStatus(e, 2);
  g.freezeEnemy(e, 0.6);
  assert.equal(e.frozen, 0.6);
  e.type = "boss";
  e.frozen = 0;
  e.thaw = 0;
  g.freezeEnemy(e, 2);
  assert.equal(e.frozen, 0);
  assert.equal(e.slow, 2);
});
test("electric chain stops at two hops / six including origin and never recursively propagates", () => {
  const g = setup(),
    a = enemy(g, 500);
  for (let i = 0; i < 9; i++) enemy(g, 510 + i * 5);
  g.chainElectric(a);
  assert.equal(g.enemies.filter((e) => e.frozen > 0).length, 6);
  assert.equal(g.enemies.filter((e) => e.hp === 970).length, 5);
  const h = setup();
  const b = enemy(h, 300);
  enemy(h, 400);
  enemy(h, 500);
  const far = enemy(h, 600);
  h.chainElectric(b);
  assert.equal(far.hp, 1000);
});
test("charm converts unlimited survivors, refreshes allies, rewards once, boss only explosion", () => {
  const g = setup();
  for (let i = 0; i < 30; i++) enemy(g, 650 + i, 500);
  const boss = enemy(g, 670, 2000);
  boss.type = "boss";
  g.charmBlast(670, 380);
  assert.equal(g.enemies.filter((e) => e.ally).length, 30);
  assert.equal(g.points, 300);
  assert.equal(boss.hp, 1940);
  assert.ok(!boss.ally);
  for (const e of g.enemies) if (e.ally) e.charm = 1;
  g.charmBlast(670, 380);
  assert.ok(g.enemies.filter((e) => e.ally).every((e) => e.charm === null));
  assert.equal(g.points, 300);
  const ally = g.enemies[0];
  const points = g.points;
  g.explodeAlly(ally);
  const hp = boss.hp;
  g.explodeAlly(ally);
  assert.equal(boss.hp, hp);
  assert.equal(g.points, points);
});
test("allies cannot be attacked by main weapons or shockwave, do not block wave clear", () => {
  const g = setup();
  const ally = enemy(g, 700, 500);
  g.charmBlast(700, 380);
  const hp = ally.hp;
  g.shoot();
  g.shockwave();
  step(g, 0.2);
  assert.equal(ally.hp, hp);
  g.remaining = 0;
  g.update(0.01);
  assert.equal(g.wave, 2);
  assert.ok(g.enemies.includes(ally));
});
test("shop two slots, active item cannot stop, special ammo independent of primary and ultimate", () => {
  for (const id of Object.keys(ITEMS)) {
    const g = setup();
    g.points = 1000;
    g.enterStation();
    assert.ok(g.buyItem(id));
    assert.equal(g.points, 1000 - ITEMS[id].price);
    assert.equal(g.buyItem(id), true);
    assert.equal(g.buyItem(id), false);
    assert.equal(g.useItem(), false);
    g.leaveStation();
    g.spawnAcc = -1e8;
    assert.ok(g.useItem());
    assert.equal(g.useItem(), false);
    g.activateUltimate();
    step(g, 11);
    assert.equal(g.item, null);
    assert.equal(g.player.ammo, 48);
    assert.ok(g.pulseCd < 10);
  }
});
test("event effects spare unspawned enemies, reward each kill once, respect boss restrictions", () => {
  const g = setup();
  const mob = enemy(g),
    boss = enemy(g, 900, 10000);
  boss.type = "boss";
  g.hazard(10, 10, 0);
  g.triggerEvent("onehit");
  assert.equal(g.directDamage(mob, 1), 1000);
  assert.equal(g.directDamage(boss, 28), 228);
  assert.equal(g.directDamage(boss, 28), 28);
  g.time += 1;
  assert.equal(g.directDamage(boss, 28), 228);
  const remaining = g.remaining;
  g.triggerEvent("fusion");
  assert.equal(mob.hp, 0);
  assert.equal(boss.hp, 7500);
  assert.equal(g.points, 10);
  assert.equal(g.remaining, remaining);
  assert.equal(g.hazards.active.length, 0);
  g.hurtEnemy(mob, 1000);
  assert.equal(g.points, 10);
  g.triggerEvent("points");
  assert.equal(g.points, 160);
});
test("coin spawns safely, pickup triggers, expiry and pause freeze all rogue clocks", () => {
  const g = setup();
  g.random = () => 0.9;
  assert.ok(g.spawnCoin());
  assert.ok(Math.hypot(g.coin.x - g.player.x, g.coin.y - g.player.y) >= 120);
  g.oneHit = 8;
  g.item = { id: "charm", ammo: 8, active: true, cd: 0 };
  const e = enemy(g);
  g.freezeEnemy(e, 2);
  e.burn = 3;
  e.burnDps = 20;
  g.pause();
  const snapshot = JSON.stringify(g);
  step(g, 3);
  assert.equal(JSON.stringify(g), snapshot);
  g.resume();
  g.coin.life = 0.001;
  g.update(0.01);
  assert.equal(g.coin, null);
  g.coin = { x: g.player.x, y: g.player.y, life: 20 };
  g.random = () => 0.5;
  g.update(0.01);
  assert.equal(g.points, 150);
});
test("eight-wave boss ashes, cleanup without rewards, two station cycles and restart", () => {
  const g = setup();
  for (const wave of [8, 16]) {
    g.wave = wave - 1;
    g.nextWave();
    const b = g.enemies[0];
    enemy(g);
    g.hurtEnemy(b, 1e8);
    const points = g.points;
    g.update(0.01);
    assert.equal(g.state, "ashes");
    assert.equal(g.ashes.age, 0);
    g.pause();
    step(g, 2);
    assert.equal(g.ashes.age, 0);
    g.resume();
    step(g, 1.3);
    assert.equal(g.state, "station");
    assert.equal(g.points, points);
    assert.equal(g.enemies.length, 0);
    assert.ok(g.leaveStation());
    assert.equal(g.wave, wave + 1);
  }
  g.coin = { x: 300, y: 300, life: 10 };
  g.item = { id: "charm", ammo: 8 };
  g.reset();
  assert.equal(g.points, 0);
  assert.equal(g.item, null);
  assert.equal(g.coin, null);
  assert.equal(g.purchases, 0);
  assert.equal(g.ashes, null);
});
test("very high rate preserves ammo, aggregate damage and equivalent trigger count at 60/120Hz", () => {
  const values = [];
  for (const hz of [60, 120]) {
    const g = setup("mg42");
    g.player.fireDelay = 0.00001;
    g.player.ammo = g.player.magazineSize = 1e7;
    g.player.x = 100;
    g.player.angle = 0;
    step(g, 0.05, hz, true);
    const spent = 1e7 - g.player.ammo;
    assert.equal(
      g.bullets.active.reduce((n, b) => n + b.shot.count, 0),
      spent,
    );
    assert.equal(
      g.bullets.active.reduce((n, b) => n + b.damage, 0),
      spent * 22,
    );
    assert.ok(g.bullets.active.length <= hz * 0.05 + 1);
    values.push(spent);
  }
  assert.ok(Math.abs(values[0] - values[1]) <= 1);
});
test("optional tutorial walks all objectives, revives, spends points and reaches completion", () => {
  const g = setup();
  g.startTutorial();
  assert.equal(g.tutorial.step, "move");
  g.player.x = 840;
  g.update(0.01);
  assert.equal(g.tutorial.step, "dodge");
  g.evade({ x: 1, y: 0 });
  step(g, 0.2);
  assert.equal(g.tutorial.step, "shoot");
  for (const e of g.enemies) g.hurtEnemy(e, 1e6);
  g.update(0.01);
  assert.equal(g.tutorial.step, "reload");
  g.reload();
  step(g, 12);
  assert.equal(g.tutorial.step, "skill");
  g.shockwave();
  g.update(0.01);
  assert.equal(g.tutorial.step, "upgrade");
  g.buyUpgrade();
  g.chooseBuff("dragon");
  g.update(0.01);
  assert.equal(g.tutorial.step, "elements");
  g.shoot();
  step(g, 0.5);
  assert.equal(g.tutorial.step, "boss");
  g.hurtEnemy(g.enemies[0], 1e6);
  step(g, 1.5);
  assert.equal(g.state, "station");
  assert.equal(g.tutorial.step, "shop");
  assert.ok(g.buyItem("charm"));
  g.leaveStation();
  assert.equal(g.tutorial.step, "item");
  g.useItem();
  step(g, 11);
  assert.equal(g.tutorial.step, "coin");
  g.player.x = g.coin.x;
  g.player.y = g.coin.y;
  g.update(0.01);
  assert.equal(g.state, "won");
  assert.equal(g.tutorial.step, "done");
  g.startTutorial();
  g.player.invuln = 0;
  g.hurtPlayer(999);
  assert.equal(g.state, "playing");
  assert.equal(g.player.hp, C.hp);
});

test("one-hit also empowers direct shockwave hits, while burn never inherits instant kills", () => {
  const g = setup();
  const e = enemy(g, 700, 10000);
  g.triggerEvent("onehit");
  e.burn = 3;
  e.burnDps = 12;
  g.updateStatus(e, 0.05);
  assert.ok(e.hp > 9900);
  g.shockwave();
  assert.ok(e.hp <= 0);
  assert.equal(g.points, 10);
});
