import { C, EVOLUTION as E, ITEMS, clamp, distance } from "./config.js";
import { segmentHit } from "./weapons.js";

// Rebuilt each simulation step; authoritative damage is never capped by visual pools.
export class SpatialGrid {
  constructor(size = 128) {
    this.size = size;
    this.cells = new Map();
  }
  rebuild(entities) {
    for (const bucket of this.cells.values()) bucket.length = 0;
    for (const e of entities) {
      if (e.hp <= 0 || e.ally) continue;
      const key = `${Math.floor(e.x / this.size)},${Math.floor(e.y / this.size)}`;
      let bucket = this.cells.get(key);
      if (!bucket) this.cells.set(key, (bucket = []));
      bucket.push(e);
    }
  }
  *rect(x1, y1, x2, y2) {
    for (
      let x = Math.max(-1, Math.floor(x1 / this.size));
      x <= Math.min(11, Math.floor(x2 / this.size));
      x++
    )
      for (
        let y = Math.max(-1, Math.floor(y1 / this.size));
        y <= Math.min(7, Math.floor(y2 / this.size));
        y++
      )
        for (const e of this.cells.get(`${x},${y}`) || [])
          if (e.hp > 0 && !e.ally) yield e;
  }
  nearest(p, range) {
    let target = null,
      best = range;
    for (const e of this.rect(
      p.x - range,
      p.y - range,
      p.x + range,
      p.y + range,
    )) {
      const d = distance(e, p);
      if (d <= best) {
        best = d;
        target = e;
      }
    }
    return target;
  }
}

export const evolutionMethods = {
  resetEvolution() {
    this.frenzy = 0;
    this.frenzyIdle = 0;
    this.turrets = [];
    this.spikes = [];
    this.comboEffects = [];
    this.lastBossKind = null;
    this.recoveryDuringReload = false;
    this.enemyGrid = new SpatialGrid();
    this.turretGrid = new SpatialGrid();
    this.turretBullets.clear();
  },
  effectiveFireDelay() {
    return this.player.fireDelay / (1 + this.frenzy * this.player.frenzyPower);
  },
  onPrimaryHit(b) {
    if (!this.player.frenzyPower || !b.shot || b.shot.frenzyHit) return;
    b.shot.frenzyHit = true;
    this.frenzy = Math.min(E.frenzyCap, this.frenzy + b.shot.count);
    this.frenzyIdle = 0;
  },
  thermalHit(e) {
    if (
      !this.player.thermal ||
      !(e.burn > 0) ||
      !(e.frozen > 0 || e.slow > 0) ||
      (e.thermalAt ?? -1) > this.time
    )
      return;
    e.thermalAt = this.time + E.thermalCooldown;
    this.comboEffects.push({
      kind: "thermal",
      x: e.x,
      y: e.y,
      radius: E.thermalRadius,
      age: 0,
      life: 0.38,
    });
    this.burst(e.x, e.y, "#ffb0e9", 14);
    for (const target of [...this.enemies])
      if (
        target.hp > 0 &&
        !target.ally &&
        distance(e, target) <= E.thermalRadius + target.r
      )
        this.hurtEnemy(
          target,
          this.player.damage * E.thermalDamage,
          0,
          0,
          true,
          false,
          "thermal",
        );
  },
  onEnemyDeath(e, source, bullet) {
    if (e.deathHandled) return;
    e.deathHandled = true;
    const playerKill = ["primary", "fragment", "burn"].includes(source);
    if (playerKill && this.player.salvage) {
      let recovered = this.player.salvage;
      if (this.weaponId === "svd") {
        this.player.salvageProgress =
          (this.player.salvageProgress || 0) + recovered;
        recovered = Math.floor(
          this.player.salvageProgress / E.svdSalvagePerRound,
        );
        this.player.salvageProgress %= E.svdSalvagePerRound;
      }
      this.player.ammo = Math.min(
        this.player.magazineSize,
        this.player.ammo + recovered,
      );
      if (recovered > 0 && this.reloadLeft > 0)
        this.recoveryDuringReload = true;
    }
    if (
      source !== "event" &&
      source !== "tar" &&
      this.player.ember &&
      e.burn > 0 &&
      e.burnOwner !== "turret"
    ) {
      const targets = this.enemies
        .filter(
          (t) =>
            t !== e && t.hp > 0 && !t.ally && distance(e, t) <= E.emberRadius,
        )
        .sort((a, b) => distance(a, e) - distance(b, e))
        .slice(0, E.emberTargets);
      for (const t of targets) {
        // A weaker spread cannot replace a stronger burn or extend an existing one.
        if (!(t.burn > 0) || e.burnDps > t.burnDps) {
          t.burn = t.burn > 0 ? Math.min(t.burn, e.burn) : e.burn;
          t.burnDps = e.burnDps;
          t.burnOwner = "player";
        }
        this.comboEffects.push({
          kind: "ember",
          x: e.x,
          y: e.y,
          endX: t.x,
          endY: t.y,
          age: 0,
          life: 0.35,
        });
      }
    }
    if (source === "primary" && bullet && this.player.split) {
      const targets = this.enemies
        .filter((t) => t.hp > 0 && !t.ally && distance(t, e) < E.fragmentRange)
        .sort((a, b) => distance(a, e) - distance(b, e));
      for (let i = 0; i < this.player.split && targets.length; i++) {
        const target = targets[i % targets.length],
          angle = Math.atan2(target.y - e.y, target.x - e.x);
        this.addBullet(e.x, e.y, angle, {
          damage:
            (bullet.damage / (bullet.shot?.count || 1)) *
            (bullet.impactFalloff || 1) *
            0.5,
          burnDps: (bullet.burnDps || 0) * 0.5,
          iceChance: bullet.iceChance,
          iceDuration: bullet.iceDuration,
          shot: { id: ++this.shotId, checked: new Set(), count: 1 },
          targetId: target.id,
          hit: new Set([e.id]),
          fragment: true,
          weaponId: null,
          life: 1,
          speed: 800,
        });
      }
    }
    if (
      e.type === "mage" &&
      !e.ally &&
      source !== "event" &&
      !this.bossDefeated
    ) {
      const tomb = this.spawn("tomb");
      Object.assign(tomb, {
        x: e.x,
        y: e.y,
        hp: E.tombHp * e.hpScale,
        maxHp: E.tombHp * e.hpScale,
        warm: 0,
        summonCd: E.tombInterval,
        summonPending: [],
      });
    }
  },
  deployTurrets() {
    const spec = ITEMS.sentry;
    for (let i = 0; i < 3; i++) {
      let spot;
      for (let n = 0; n < 4096; n++) {
        const angle = (i * Math.PI * 2) / 3 + n * 2.39996,
          radius = 64 + Math.sqrt(n) * 12;
        spot = {
          x: clamp(this.player.x + Math.cos(angle) * radius, 48, 1232),
          y: clamp(this.player.y + Math.sin(angle) * radius, 88, 654),
        };
        if (this.turrets.every((t) => t.hp <= 0 || distance(t, spot) > 46))
          break;
      }
      this.turrets.push({
        ...spot,
        id: ++this.uid,
        r: 18,
        hp: spec.hp,
        maxHp: spec.hp,
        cd: 0,
        angle: this.player.angle,
        invuln: 0,
        flash: 0,
      });
      this.burst(spot.x, spot.y, "#7fffd4", 14);
    }
  },
  hurtTurret(t, damage) {
    if (t.hp <= 0 || t.invuln > 0) return;
    t.hp = Math.max(0, t.hp - damage);
    t.invuln = ITEMS.sentry.immunity;
    t.flash = 0.1;
    if (t.hp <= 0) {
      this.burst(t.x, t.y, "#ffbd75", 20);
      this.turrets = this.turrets.filter((other) => other.hp > 0);
    }
  },
  enemyTarget(e) {
    return this.turretGrid.nearest(e, distance(e, this.player)) || this.player;
  },
  updateEvolution(dt) {
    if (this.reloadLeft <= 0) {
      const old = this.frenzyIdle;
      this.frenzyIdle += dt;
      const decay =
        Math.max(0, this.frenzyIdle - E.frenzyGrace) -
        Math.max(0, old - E.frenzyGrace);
      this.frenzy = Math.max(0, this.frenzy - decay * E.frenzyDecay);
    }
    for (const fx of this.comboEffects) fx.age += dt;
    this.comboEffects = this.comboEffects.filter((f) => f.age < f.life);
    this.enemyGrid.rebuild(this.enemies);
    const spec = ITEMS.sentry,
      p = this.player;
    for (const t of this.turrets) {
      t.invuln = Math.max(0, t.invuln - dt);
      t.flash = Math.max(0, t.flash - dt);
      if (t.hp <= 0) continue;
      t.cd -= dt;
      const target = this.enemyGrid.nearest(t, spec.range);
      if (!target) {
        t.cd = Math.max(0, t.cd);
        continue;
      }
      t.angle = Math.atan2(target.y - t.y, target.x - t.x);
      const delay = spec.interval * (p.fireDelay / this.weapon.fireDelay);
      while (t.cd <= 0) {
        const count = Math.max(1, Math.floor(-t.cd / delay) + 1);
        this.addBullet(
          t.x + Math.cos(t.angle) * 24,
          t.y + Math.sin(t.angle) * 24,
          t.angle,
          {
            special: "turret",
            weaponId: null,
            damage: spec.damage * (p.damage / this.weapon.damage) * count,
            speed: spec.speed,
            life: spec.range / spec.speed,
            range: spec.range,
            travelled: 0,
            burnDps: p.burnDps,
            iceChance: p.iceChance,
            iceDuration: p.iceDuration,
            shot: { id: ++this.shotId, checked: new Set(), count },
            knock: 12,
          },
        );
        t.cd += delay * count;
        t.muzzle = 0.055;
      }
      t.muzzle = Math.max(0, (t.muzzle || 0) - dt);
    }
    this.turrets = this.turrets.filter((t) => t.hp > 0);
    this.turretGrid.rebuild(this.turrets);
    for (const s of this.spikes) {
      s.age += dt;
      if (s.age < E.spikeWarning || s.age >= E.spikeWarning + E.spikeLife)
        continue;
      if (distance(s, p) < E.spikeRadius + p.r) this.hurtPlayer(E.spikeDamage);
      for (const t of this.turretGrid.rect(
        s.x - 60,
        s.y - 60,
        s.x + 60,
        s.y + 60,
      ))
        if (distance(s, t) < E.spikeRadius + t.r)
          this.hurtTurret(t, E.spikeDamage);
    }
    this.spikes = this.spikes.filter(
      (s) => s.age < E.spikeWarning + E.spikeLife,
    );
  },
  updateTomb(e, dt) {
    e.summonCd -= dt;
    e.summonPending ||= [];
    if (e.summonCd <= 0 && !e.summonPending.length) {
      e.summonCd = E.tombInterval;
      for (let i = 0; i < E.summons; i++)
        e.summonPending.push({
          x: clamp(e.x + (i ? 44 : -44), 35, 1245),
          y: clamp(e.y + 40, 78, 665),
          left: E.summonWarning,
        });
    }
    for (const s of e.summonPending) {
      s.left -= dt;
      if (
        s.left <= 0 &&
        this.enemies.filter((t) => t.hp > 0 && !t.ally).length < C.enemyCap
      ) {
        const minion = this.spawn("chaser");
        Object.assign(minion, { x: s.x, y: s.y, warm: 0, summoned: true });
        s.done = true;
      }
    }
    e.summonPending = e.summonPending.filter((s) => !s.done);
  },
  updateTree(b, dt) {
    const enraged = b.hp <= b.maxHp / 2;
    b.shotTimer = (b.shotTimer ?? E.treeShotInterval) - dt;
    if (b.pending) {
      b.pending.t -= dt;
      if (b.pending.t <= 0) {
        const count = enraged ? E.treeShotRageCount : E.treeShotCount;
        for (let i = 0; i < count; i++)
          this.hazard(
            b.x,
            b.y,
            b.pending.a + (i - (count - 1) / 2) * 0.18,
            enraged ? 230 : 195,
            C.bossBulletDamage,
          );
        b.pending = null;
        this.event("bossFire");
      }
    } else if (b.shotTimer <= 0) {
      b.pending = {
        kind: "fan",
        a: Math.atan2(this.player.y - b.y, this.player.x - b.x),
        t: E.treeShotWarning,
        max: E.treeShotWarning,
      };
      b.shotTimer = enraged ? E.treeShotRageInterval : E.treeShotInterval;
    }
    b.atkTimer -= dt;
    if (b.atkTimer > 0) return;
    const rage = b.hp <= b.maxHp / 2;
    b.atkTimer = rage ? E.treeRageInterval : E.treeInterval;
    const p = this.player,
      count = rage ? E.treeRageCount : E.treeCount;
    const safe = {
      x: clamp(p.x + (p.x < 640 ? 180 : -180), 50, 1230),
      y: clamp(p.y + (p.y < 360 ? 120 : -120), 85, 655),
    };
    const spots = [];
    const accept = (s) =>
      !segmentHit(p.x, p.y, safe.x, safe.y, s, 66) &&
      [...this.spikes, ...spots].every(
        (t) => distance(t, s) > E.spikeRadius * 2 + 16,
      );
    for (let i = 0; i < 3; i++) {
      const a =
        Math.atan2(safe.y - p.y, safe.x - p.x) + Math.PI + (i - 1) * 0.8;
      const s = {
        x: clamp(p.x + Math.cos(a) * 105, 60, 1220),
        y: clamp(p.y + Math.sin(a) * 105, 90, 645),
        age: 0,
      };
      if (accept(s)) spots.push(s);
    }
    for (let i = 0; i < 80 && spots.length < count; i++) {
      const s = {
        x: 60 + this.random() * 1160,
        y: 90 + this.random() * 555,
        age: 0,
      };
      if (accept(s)) spots.push(s);
    }
    // Deterministic fallback also supports fixed-seed QA without overlapping hazards.
    for (let y = 95; y < 650 && spots.length < count; y += 90)
      for (let x = 65; x < 1230 && spots.length < count; x += 105) {
        const s = { x, y, age: 0 };
        if (accept(s)) spots.push(s);
      }
    this.spikes.push(...spots);
    this.event("bossFire");
  },
};
