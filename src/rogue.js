import { C, ITEMS, EVENT_TYPES, ROGUE, distance } from "./config.js";
import { WEAPONS, ULTIMATES, ULT_KILLS, segmentHit } from "./weapons.js";

export const rogueMethods = {
  resetRogue() {
    this.points = 0;
    this.purchases = 0;
    this.buffReturn = "playing";
    this.shotId = 0;
    this.skillResources = {
      pulse: 0,
      ricochet: ULT_KILLS,
      charge: ULT_KILLS,
      segmentHit,
    };
    this.weaponAmmo = {};
    this.items = [null, null];
    this.beam = null;
    this.coin = null;
    this.oneHit = 0;
    this.coinTimer = this.nextCoinDelay();
    this.toast = null;
    this.ashes = null;
    this.tutorial = null;
    this.rebuildStats();
  },
  nextCoinDelay() {
    return ROGUE.coinMin + this.random() * (ROGUE.coinMax - ROGUE.coinMin);
  },
  rewardEnemy(e, chargeCredit = true) {
    if (e.rewarded) return;
    e.rewarded = true;
    this.kills++;
    if (e.summoned) return;
    this.points += e.type === "boss" ? ROGUE.bossPoints : ROGUE.normalPoints;
    this.score += e.type === "boss" ? 1500 : 100;
    if (!this.ultimate && this.ultimateId !== "tar" && chargeCredit)
      this.ultCharge = Math.min(ULT_KILLS, this.ultCharge + 1);
  },
  completeBoss() {
    if (this.mode !== "endless" && !this.tutorial) {
      this.finish(true);
      return;
    }
    this.enterStation();
  },
  enterStation() {
    this.clearTar();
    this.beam = null;
    this.spikes = [];
    this.comboEffects = [];
    this.frenzy = this.frenzyIdle = 0;
    this.turretBullets.clear();
    this.state = "station";
    this.enemies = this.enemies.filter((e) => e.ally && e.hp > 0);
    this.remaining = 0;
    for (const pool of [
      this.bullets,
      this.specialBullets,
      this.hazards,
      this.particles,
      this.numbers,
    ])
      pool.clear();
    this.ultimate = null;
    this.pulse = null;
    this.coin = null;
    this.oneHit = 0;
    this.toast = null;
    this.items = this.items.map((item) => (item?.active ? null : item));
    this.reloadLeft = this.reloadTotal = 0;
    this.player.hp = Math.min(
      this.player.maxHp,
      this.player.hp + this.player.maxHp * 0.3,
    );
    this.player.ammo = this.player.magazineSize;
    this.weaponAmmo[this.weaponId] = this.player.ammo;
    if (this.tutorial) {
      this.tutorial.step = "shop";
      this.points = Math.max(this.points, 700);
    }
  },
  leaveStation() {
    if (this.state !== "station") return false;
    if (this.tutorial && !this.items.some(Boolean)) {
      this.toast = { text: "先购买一件道具", left: 2 };
      return false;
    }
    this.state = "playing";
    this.ashes = null;
    this.nextWave();
    this.coinTimer = this.nextCoinDelay();
    if (this.tutorial) {
      this.tutorial.step = "item";
      this.remaining = 0;
      this.wave = 1;
      this.tutorialTargets(8);
    }
    return true;
  },
  changeLoadout(weaponId, ultimateId) {
    if (
      this.state !== "station" ||
      !WEAPONS[weaponId] ||
      !ULTIMATES[ultimateId]
    )
      return false;
    this.weaponAmmo[this.weaponId] = this.player.ammo;
    this.skillResources[this.ultimateId] =
      this.ultimateId === "pulse" ? this.pulseCd : this.ultCharge;
    this.weaponId = weaponId;
    this.weapon = WEAPONS[weaponId];
    this.ultimateId = ultimateId;
    this.rebuildStats();
    // First-time swaps start empty; returning to a weapon restores its stored ammo.
    this.player.ammo = Math.min(
      this.player.magazineSize,
      this.weaponAmmo[weaponId] ?? 0,
    );
    if (ultimateId === "pulse") this.pulseCd = this.skillResources.pulse;
    else if (ultimateId !== "tar")
      this.ultCharge = this.skillResources[ultimateId];
    return true;
  },
  buyItem(id) {
    const spec = ITEMS[id];
    if (
      this.state !== "station" ||
      !spec ||
      this.items.every(Boolean) ||
      this.points < spec.price
    )
      return false;
    this.points -= spec.price;
    this.items[this.items.findIndex((item) => !item)] = {
      id,
      ammo: spec.ammo,
      active: false,
      cd: 0,
    };
    return true;
  },
  useItem(slot = 0) {
    const item = this.items[slot];
    if (this.state !== "playing" || !item || item.active) return false;
    item.active = true;
    if (this.tutorial) this.tutorial.didItem = true;
    this.event(`item:${item.id}`);
    if (item.id === "sentry") {
      this.deployTurrets();
      this.items[slot] = null;
    }
    return true;
  },
  directDamage(e, damage) {
    if (!this.oneHit || e.ally || e.type === "tomb") return damage;
    if (e.type !== "boss" && e.type !== "tomb") {
      e.shield = 0;
      return Math.max(damage, e.hp);
    }
    if ((e.oneHitAt ?? -Infinity) <= this.time) {
      e.oneHitAt = this.time + 1;
      return damage + e.maxHp * 0.02;
    }
    return damage;
  },
  freezeEnemy(e, duration, immunity = ROGUE.thawImmunity) {
    if (e.hp <= 0 || e.ally || e.type === "tomb" || e.frozen > 0 || e.thaw > 0)
      return;
    if (e.type === "boss") {
      e.slow = duration;
      return;
    }
    e.frozen = duration;
    e.thawDuration = immunity;
    e.pending = null;
    e.dash = 0;
    e.kx = e.ky = 0;
  },
  applyElements(e, b) {
    if (
      ((b.ultimate || b.special) && b.special !== "turret") ||
      e.ally ||
      e.hp <= 0
    )
      return;
    const owner = b.special === "turret" ? "turret" : "player";
    if (b.burnDps && (!(e.burn > 0) || b.burnDps >= e.burnDps)) {
      e.burn = ROGUE.burnDuration;
      e.burnDps = b.burnDps;
      e.burnOwner = owner;
    }
    const shot = b.shot;
    if (shot && !shot.checked.has(e.id)) {
      shot.checked.add(e.id);
      if (
        this.tutorial?.step === "elements" ||
        this.random() < 1 - (1 - (b.iceChance || 0)) ** shot.count
      )
        this.freezeEnemy(e, b.iceDuration);
    }
    if (owner === "player") this.thermalHit(e);
  },
  updateStatus(e, dt) {
    if (e.burn > 0) {
      const burnedTime = Math.min(dt, e.burn);
      e.burn = Math.max(0, e.burn - dt);
      this.hurtEnemy(
        e,
        e.burnDps * burnedTime,
        0,
        0,
        e.burnOwner !== "turret",
        false,
        e.burnOwner === "turret" ? "turret" : "burn",
      );
      if (e.hp <= 0) return false;
    }
    e.slow = Math.max(0, (e.slow || 0) - dt);
    if (e.frozen > 0) {
      e.frozen = Math.max(0, e.frozen - dt);
      if (e.frozen === 0) e.thaw = e.thawDuration;
      return false;
    }
    e.thaw = Math.max(0, (e.thaw || 0) - dt);
    return true;
  },
  chainElectric(origin) {
    const spec = ITEMS.electric,
      visited = new Set([origin.id]);
    this.freezeEnemy(origin, spec.freeze, spec.immunity);
    let frontier = [origin];
    for (let hop = 0; hop < spec.chainHops; hop++) {
      const next = [];
      for (const source of frontier) {
        for (const e of this.enemies) {
          if (visited.size >= spec.chainTargets) break;
          if (
            e.hp <= 0 ||
            e.ally ||
            visited.has(e.id) ||
            distance(source, e) > spec.chainRadius
          )
            continue;
          visited.add(e.id);
          next.push(e);
          this.freezeEnemy(e, spec.freeze, spec.immunity);
          this.hurtEnemy(
            e,
            this.directDamage(e, spec.chainDamage),
            0,
            0,
            false,
          );
          this.burst(e.x, e.y, "#88dfff", 3);
        }
      }
      frontier = next;
    }
  },
  charmBlast(x, y) {
    const spec = ITEMS.charm;
    this.burst(x, y, "#ffa7e7", 24);
    for (const e of this.enemies) {
      if (e.hp <= 0 || distance(e, { x, y }) > spec.radius + e.r) continue;
      if (e.ally) {
        e.charm = null;
        continue;
      }
      this.hurtEnemy(e, this.directDamage(e, spec.damage), 0, 0, false);
      if (e.hp > 0 && e.type !== "boss" && e.type !== "tomb") {
        this.rewardEnemy(e, false);
        e.ally = true;
        e.charm = null;
        e.allyCd = 0;
        e.burn = e.frozen = e.thaw = e.slow = 0;
        e.shield = 0;
        e.pending = e.laser = null;
        e.dash = 0;
      }
    }
  },
  explodeAlly(e) {
    if (e.exploded) return;
    e.exploded = true;
    e.hp = 0;
    const spec = ITEMS.charm;
    this.burst(e.x, e.y, "#ffa7e7", 18);
    for (const target of this.enemies)
      if (
        target.hp > 0 &&
        !target.ally &&
        distance(target, e) <= spec.blastRadius + target.r
      )
        this.hurtEnemy(
          target,
          this.directDamage(target, spec.blastDamage),
          0,
          80,
          false,
        );
  },
  updateAlly(e, dt) {
    if (e.hp <= 0) {
      this.explodeAlly(e);
      return;
    }
    let target = null,
      nearest = Infinity;
    for (const enemy of this.enemies)
      if (enemy.hp > 0 && !enemy.ally) {
        const d = distance(enemy, e);
        if (d < nearest) {
          nearest = d;
          target = enemy;
        }
      }
    if (!target) return;
    const a = Math.atan2(target.y - e.y, target.x - e.x),
      spec = ITEMS.charm;
    if (nearest > 160) {
      e.x += Math.cos(a) * 150 * dt;
      e.y += Math.sin(a) * 150 * dt;
    }
    e.allyCd -= dt;
    if (nearest <= spec.allyRange && e.allyCd <= 0) {
      e.allyCd = spec.allyInterval;
      this.addBullet(e.x, e.y, a, {
        special: "ally",
        weaponId: null,
        damage: spec.allyDamage,
        life: spec.allyRange / 700,
        speed: 700,
        knock: 20,
      });
    }
    for (const foe of this.enemies)
      if (foe.hp > 0 && !foe.ally && distance(e, foe) < e.r + foe.r)
        e.hp -= 18 * dt;
    if (e.hp <= 0) this.explodeAlly(e);
  },
  spawnCoin() {
    let spot = null;
    for (let i = 0; i < 30; i++) {
      const candidate = {
        x: 280 + this.random() * 720,
        y: 280 + this.random() * 160,
      };
      if (
        distance(candidate, this.player) >= 120 &&
        this.enemies.every(
          (e) => e.ally || e.hp <= 0 || distance(candidate, e) > e.r + 40,
        )
      ) {
        spot = candidate;
        break;
      }
    }
    if (spot) this.coin = { ...spot, life: ROGUE.coinLife };
    return !!spot;
  },
  triggerEvent(id) {
    this.coin = null;
    const event = EVENT_TYPES.find((e) => e.id === id);
    if (!event) return;
    this.toast = { text: event.name, left: 3 };
    if (id === "points") this.points += ROGUE.coinPoints;
    if (id === "onehit") this.oneHit = ROGUE.oneHitDuration;
    if (id === "fusion") {
      this.hazards.clear();
      for (const e of this.enemies)
        if (e.hp > 0 && !e.ally) {
          e.shield = 0;
          this.hurtEnemy(
            e,
            e.type === "boss" ? e.maxHp * 0.25 : e.hp,
            0,
            0,
            false,
            true,
            "event",
          );
        }
      this.burst(this.player.x, this.player.y, "#ffffff", 100);
      this.shake = 10;
    }
    if (this.tutorial) this.tutorial.didCoin = true;
    this.event("pulse");
  },
  updateBeam(item, dt, slot) {
    const spec = ITEMS.beam,
      p = this.player,
      duration = Math.min(dt, item.ammo / spec.drain);
    const targets = this.enemies
      .filter((e) => e.hp > 0 && !e.ally)
      .sort((a, b) => distance(a, p) - distance(b, p))
      .slice(0, spec.beams);
    item.cd -= duration;
    const feedback = item.cd <= 0;
    if (feedback) {
      item.cd += 0.1;
      this.event(`itemFire:${item.id}`);
    }
    for (let i = 0; i < spec.beams; i++) {
      const target = targets[i % targets.length];
      const a = target
        ? Math.atan2(target.y - p.y, target.x - p.x)
        : p.angle + (i - 1) * 0.14;
      const offset = (i - 1) * 12,
        x = p.x - Math.sin(a) * offset,
        y = p.y + Math.cos(a) * offset;
      const angle = target ? Math.atan2(target.y - y, target.x - x) : a,
        dx = Math.cos(angle),
        dy = Math.sin(angle);
      const reach = Math.min(
        dx > 1e-8 ? (1256 - x) / dx : dx < -1e-8 ? (24 - x) / dx : Infinity,
        dy > 1e-8 ? (686 - y) / dy : dy < -1e-8 ? (60 - y) / dy : Infinity,
      );
      const endX = x + dx * reach,
        endY = y + dy * reach;
      this.beams.push({ x, y, endX, endY, width: spec.width, slot });
      for (const e of this.enemies)
        if (
          e.hp > 0 &&
          !e.ally &&
          segmentHit(x, y, endX, endY, e, e.r + spec.width / 2)
        )
          this.hurtEnemy(
            e,
            this.directDamage(e, spec.damage * duration),
            angle,
            0,
            false,
            feedback,
            "special",
          );
    }
    item.ammo = Math.max(0, item.ammo - spec.drain * duration);
    if (item.ammo < 1e-8) this.items[slot] = null;
  },
  updateRogue(dt) {
    this.beam = null;
    this.oneHit = Math.max(0, this.oneHit - dt);
    if (this.toast && (this.toast.left -= dt) <= 0) this.toast = null;
    if (this.mode === "endless" && !this.tutorial) {
      this.coinTimer -= dt;
      if (this.coinTimer <= 0 && !this.coin) {
        this.spawnCoin();
        this.coinTimer = this.nextCoinDelay();
      }
    }
    if (this.coin) {
      this.coin.life -= dt;
      if (distance(this.coin, this.player) < this.player.r + 17)
        this.triggerEvent(
          this.tutorial
            ? "points"
            : EVENT_TYPES[Math.floor(this.random() * 3)].id,
        );
      else if (this.coin.life <= 0) this.coin = null;
    }
    for (let slot = 0; slot < this.items.length; slot++) {
      const item = this.items[slot];
      if (!item?.active) continue;
      if (item.id === "beam") {
        this.updateBeam(item, dt, slot);
        continue;
      }
      const spec = ITEMS[item.id],
        p = this.player;
      item.cd -= dt;
      while (item.cd <= 0 && item.ammo > 0) {
        let target = null,
          d = Infinity;
        for (const e of this.enemies)
          if (e.hp > 0 && !e.ally && distance(e, p) < d) {
            d = distance(e, p);
            target = e;
          }
        const a = target ? Math.atan2(target.y - p.y, target.x - p.x) : p.angle;
        for (let i = 0; i < spec.row && item.ammo > 0; i++, item.ammo--) {
          const offset = (i - (spec.row - 1) / 2) * 11;
          this.addBullet(
            p.x + Math.cos(a) * 24 - Math.sin(a) * offset,
            p.y + Math.sin(a) * 24 + Math.cos(a) * offset,
            a,
            {
              special: item.id,
              ultimate: item.id === "electric",
              weaponId: null,
              speed: spec.speed,
              damage: spec.damage,
              life: spec.life || spec.range / spec.speed,
              left: item.id === "electric" ? 3 : 1,
              knock: 32,
              bounces: spec.bounces || 0,
              travelled: 0,
            },
          );
        }
        item.cd += spec.interval;
        this.event(`itemFire:${item.id}`);
      }
      if (item.ammo <= 0) this.items[slot] = null;
    }
  },
};
