import { tarMethods } from "./tar.js";
import { evolutionMethods } from "./evolution.js";
import { rogueMethods } from "./rogue.js";
import { tutorialMethods } from "./tutorial.js";
import {
  WEAPONS,
  ULTIMATES,
  ULT_KILLS,
  damageAtRange,
  segmentHit,
  segmentEntry,
} from "./weapons.js";
/** Adapted from Zombie Orb Arena (MIT), see public/licenses and SOURCES.md.
 * Source algorithms: planWave, tryAutoShoot/shootAt, circular collision,
 * pursue movement, pending boss telegraphs, ring and laser attacks.
 * Timing now uses seconds, all targets share nearest selection, bounded arena.
 */
import {
  C,
  EVOLUTION as E,
  WAVES,
  BUFFS,
  ENDLESS_WAVES,
  buildStats,
  ROGUE,
  ITEMS,
  ENDLESS_STAGES,
  COLORS,
  clamp,
  distance,
} from "./config.js";
export function nearestTarget(player, enemies) {
  let target = null,
    dist = Infinity;
  for (const enemy of enemies) {
    const d = distance(enemy, player);
    if (enemy.hp > 0 && !enemy.ally && d < dist) {
      dist = d;
      target = enemy;
    }
  }
  return target;
}
export class Pool {
  constructor(cap) {
    this.cap = cap;
    this.active = [];
    this.free = [];
  }
  add(data) {
    if (this.active.length >= this.cap) return null;
    const o = this.free.pop() || {};
    for (const key of Object.keys(o)) delete o[key];
    Object.assign(o, data);
    this.active.push(o);
    return o;
  }
  sweep(alive) {
    for (let i = this.active.length - 1; i >= 0; i--)
      if (!alive(this.active[i])) this.free.push(this.active.splice(i, 1)[0]);
  }
  clear() {
    this.free.push(...this.active);
    this.active.length = 0;
  }
}
export class Game {
  constructor(random = Math.random) {
    this.random = random;
    this.bullets = new Pool(Infinity);
    this.specialBullets = new Pool(Infinity);
    this.turretBullets = new Pool(Infinity);
    this.hazards = new Pool(C.projectileCap);
    this.particles = new Pool(C.particleCap);
    this.numbers = new Pool(40);
    this.reset();
    this.state = "menu";
  }
  reset(
    mode = this.mode || "campaign",
    weaponId = this.weaponId || "qbz191",
    ultimateId = this.ultimateId || "pulse",
  ) {
    this.weaponId = WEAPONS[weaponId] ? weaponId : "qbz191";
    this.weapon = WEAPONS[this.weaponId];
    this.ultimateId = ULTIMATES[ultimateId] ? ultimateId : "pulse";
    this.ultimate = null;
    this.ultCharge = ULT_KILLS;
    const w = this.weapon;
    this.mode = mode === "endless" ? "endless" : "campaign";
    this.player = {
      x: 640,
      y: 380,
      r: C.playerRadius,
      hp: C.hp,
      maxHp: C.hp,
      speed: w.speed,
      baseSpeed: w.speed,
      baseDamage: w.damage,
      baseFireDelay: w.fireDelay,
      damage: w.damage,
      fireDelay: w.fireDelay,
      pierce: 0,
      pulseCooldown: C.pulseCooldown,
      angle: -Math.PI / 2,
      invuln: 0,
      salvageProgress: 0,
      ammo: w.magazineSize,
      magazineSize: w.magazineSize,
      reloadDuration: w.reloadDuration,
    };
    this.dodge = { cooldown: 0, left: 0, x: 0, y: -1, lastX: 0, lastY: -1 };
    this.enemies = [];
    for (const p of [
      this.bullets,
      this.specialBullets,
      this.hazards,
      this.particles,
      this.numbers,
    ])
      p.clear();
    this.events = [];
    this.wave = 0;
    this.time = 0;
    this.kills = 0;
    this.score = 0;
    this.shotCd = 0;
    this.pulseCd = 0;
    this.pulse = null;
    this.shake = 0;
    this.buffs = [];
    this.choiceVersion = 0;
    this.unhurtTime = 0;
    this.reloadLeft = 0;
    this.reloadTotal = 0;
    this.bossAddsTimer = C.bossAddsEvery;
    this.bossDefeated = false;
    this.choices = [];
    this.uid = 0;
    this.pauseReturn = "playing";
    this.resetTar();
    this.resetRogue();
    this.resetEvolution();
    this.state = "playing";
    this.nextWave();
  }
  get remainingEnemies() {
    if (
      this.bossDefeated ||
      ["ashes", "station", "won", "menu"].includes(this.state)
    )
      return 0;
    return (
      Math.max(0, this.remaining || 0) +
      this.enemies.filter((e) => e.hp > 0 && !e.ally).length
    );
  }
  evade(input = { x: 0, y: 0 }) {
    if (
      this.state !== "playing" ||
      this.dodge.cooldown > 0 ||
      this.ultimate?.kind === "charge"
    )
      return false;
    const length = Math.hypot(input.x, input.y);
    const d = this.dodge;
    if (length > 0.12) {
      d.lastX = input.x / length;
      d.lastY = input.y / length;
    }
    d.x = d.lastX;
    d.y = d.lastY;
    if (this.tutorial?.step === "dodge")
      this.tutorial.dodgeFromOutside =
        Math.hypot(
          this.player.x - this.tutorial.target.x,
          this.player.y - this.tutorial.target.y,
        ) > 45;
    d.left = C.dodgeDuration;
    d.cooldown = C.dodgeCooldown;
    return true;
  }
  get item() {
    return this.items?.[0] || null;
  }
  set item(value) {
    this.items ||= [null, null];
    this.items[0] = value;
  }
  get beam() {
    return this.beams?.[0] || null;
  }
  set beam(value) {
    this.beams = value ? [value] : [];
  }
  event(type) {
    if (this.events.length < 32) this.events.push(type);
  }
  get upgradeCount() {
    return this.purchases;
  }
  isBossWave() {
    return this.wave % (this.mode === "endless" ? 8 : 5) === 0;
  }
  pressure() {
    if (this.mode !== "endless") return ENDLESS_STAGES[0];
    let stage = ENDLESS_STAGES[0];
    for (const candidate of ENDLESS_STAGES)
      if (this.time >= candidate.at) stage = candidate;
    return stage;
  }
  dangerField() {
    if (this.mode !== "endless" || this.time < 360) return null;
    // Alternating horizontal/vertical strips; a warning and recovery gap always remain.
    const period =
      this.time >= 600
        ? Math.max(5, 12 - 0.5 * Math.floor((this.wave - 1) / 8))
        : 18;
    const phase = this.waveTime % period;
    if (phase < 1) return null;
    const width = Math.min(
      205,
      65 + 24 * Math.log2(1 + Math.max(0, this.time - 360) / 180),
    );
    return {
      vertical: Math.floor(this.waveTime / period) % 2 === 0,
      width,
      active: phase >= 2.2 && phase < period - 0.5,
      warning: Math.max(0, 2.2 - phase),
    };
  }
  waveSpec() {
    const base =
      this.mode === "endless"
        ? ENDLESS_WAVES[Math.min((this.wave - 1) % 8, 6)]
        : WAVES[Math.min(this.wave - 1, 3)];
    if (this.mode !== "endless")
      return {
        count: Math.round(
          base.count *
            E.waveDensity *
            (this.wave <= E.earlyWaves ? E.earlyDensity : 1),
        ),
        every: base.every / E.waveDensity,
      };
    const recovery = this.wave > 8 && this.wave % 8 === 1;
    const density =
      (this.wave <= E.earlyWaves ? E.earlyDensity : 1) *
      this.pressure().density *
      (recovery ? 0.72 : 1) *
      E.waveDensity *
      (this.time >= E.lateDensityAt ? E.lateDensity : 1);
    return {
      count: Math.round(base.count * density),
      every: Math.max(0.18 / E.waveDensity, base.every / density),
    };
  }

  nextWave() {
    this.beam = null;
    this.spikes = [];
    this.comboEffects = [];
    this.turretBullets.clear();
    this.wave++;
    this.enemies = this.enemies.filter((e) => e.ally && e.hp > 0);
    this.bossDefeated = false;
    this.bossAddsTimer = C.bossAddsEvery;
    this.waveTime = 0;
    this.spawnAcc = 0;
    this.banner = 2.2;
    this.hazards.clear();
    this.bullets.clear();
    this.specialBullets.clear();
    this.player.invuln = 1.2;
    if (this.isBossWave()) {
      this.remaining = 0;
      const bossKind = this.tutorial
        ? "guardian"
        : this.mode === "endless" && this.lastBossKind
          ? this.lastBossKind === "tree"
            ? "guardian"
            : "tree"
          : this.random() < 0.5
            ? "guardian"
            : "tree";
      this.lastBossKind = bossKind;
      const bossHealth =
        C.bossHp *
        (this.mode !== "endless" || this.wave <= 16 ? 0.5 : 1) *
        (this.mode === "endless"
          ? (1 + (this.pressure().hp - 1) * 0.55) *
            C.bossRoundGrowth ** Math.max(0, Math.floor(this.wave / 8) - 1)
          : 1);
      this.enemies.push({
        id: ++this.uid,
        type: "boss",
        bossKind,
        x: 640,
        y: 185,
        r: 46,
        hp: bossHealth,
        maxHp: bossHealth,
        speed: bossKind === "tree" ? 0 : 26,
        flash: 0,
        kx: 0,
        ky: 0,
        atkTimer: 1,
        sequence: 0,
        pending: null,
        laser: null,
      });
      this.event("boss");
    } else this.remaining = this.waveSpec().count;
  }
  pause() {
    if (["playing", "ashes"].includes(this.state)) {
      this.pauseReturn = this.state;
      this.state = "paused";
      return true;
    }
    return false;
  }
  resume() {
    if (this.state === "paused") this.state = this.pauseReturn || "playing";
  }
  spawn(type) {
    const edge = Math.floor(this.random() * 4);
    let x = edge < 2 ? (edge === 0 ? 42 : 1238) : 80 + this.random() * 1120;
    let y = edge >= 2 ? (edge === 2 ? 80 : 652) : 90 + this.random() * 520;
    if (Math.hypot(x - this.player.x, y - this.player.y) < 240) {
      x = 1280 - x;
      y = 720 - y;
    }
    const hpScale =
      (this.mode === "endless"
        ? this.pressure().hp
        : 1 + Math.max(0, this.wave - 1) * 0.12) *
      C.enemyWaveGrowth ** Math.max(0, this.wave - 1);
    const hp =
      (type === "mage"
        ? E.mageHp
        : type === "tomb"
          ? E.tombHp
          : type === "chaser"
            ? C.chaserHp
            : type === "charger"
              ? C.chargerHp
              : C.shooterHp) * hpScale;
    const e = {
      id: ++this.uid,
      type,
      x,
      y,
      r: type === "tomb" ? 24 : type === "charger" ? 19 : 16,
      hp,
      maxHp: hp,
      hpScale,
      ...(type === "tomb"
        ? { summonCd: E.tombInterval, summonPending: [] }
        : {}),
      shield: type === "shield" ? C.shieldHp : 0,
      speed:
        (type === "tomb"
          ? 0
          : type === "chaser"
            ? 96
            : type === "charger"
              ? 75
              : 60) * this.pressure().speed,
      kx: 0,
      ky: 0,
      flash: 0,
      warm: 0.65,
      atkTimer: 1 + this.random(),
      pending: null,
      dash: 0,
    };
    this.enemies.push(e);
    return e;
  }
  burst(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const a = this.random() * Math.PI * 2,
        sp = 40 + this.random() * 190;
      this.particles.add({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        color,
        life: 0.25 + this.random() * 0.4,
        maxLife: 0.65,
      });
    }
  }
  hurtEnemy(
    e,
    damage,
    angle = 0,
    knock = 25,
    chargeCredit = true,
    feedback = true,
    source = "other",
    bullet = null,
  ) {
    if (e.hp <= 0 || e.ally) return;
    if (e.shield > 0) {
      const absorbed = Math.min(e.shield, damage);
      e.shield -= absorbed;
      damage -= absorbed;
    }
    e.hp -= damage;
    if (feedback) e.flash = 0.09;
    if (e.type !== "boss" && e.type !== "tomb") {
      e.kx += Math.cos(angle) * knock;
      e.ky += Math.sin(angle) * knock;
    }
    if (feedback) this.burst(e.x, e.y, COLORS[e.type], 4);
    if (feedback)
      this.numbers.add({
        x: e.x,
        y: e.y - e.r,
        text: Math.round(damage),
        life: 0.55,
        color: "#f1ffff",
      });
    if (e.hp <= 0) {
      this.rewardEnemy(e, chargeCredit);
      if (e.type === "boss") {
        this.bossDefeated = true;
        this.clearTar();
        this.spikes = [];
        this.ashes = { x: e.x, y: e.y, age: 0, bossKind: e.bossKind };
      }
      this.onEnemyDeath(e, source, bullet);
      this.burst(e.x, e.y, COLORS[e.type], 18);
      this.shake = Math.max(this.shake, 3);
      this.event("kill");
    }
  }
  hurtPlayer(damage) {
    if (
      damage <= 0 ||
      this.player.invuln > 0 ||
      this.dodge.left > 0 ||
      this.state !== "playing"
    )
      return;
    this.unhurtTime = 0;
    this.player.hp = Math.max(0, this.player.hp - damage);
    this.player.invuln = 0.65;
    this.shake = 10;
    this.event("hit");
    if (this.player.hp <= 0) {
      if (this.tutorial) {
        this.player.hp = this.player.maxHp;
        this.player.invuln = 3;
      } else this.finish(false);
    }
  }
  finish(win) {
    this.clearTar();
    this.beam = null;
    this.state = win ? "won" : "lost";
    this.hazards.clear();
    this.ultimate = null;
    this.event(win ? "win" : "lost");
  }
  reload() {
    const p = this.player;
    if (
      this.state !== "playing" ||
      this.ultimate ||
      this.reloadLeft > 0 ||
      p.ammo === p.magazineSize
    )
      return false;
    this.reloadTotal =
      p.reloadDuration *
      (p.ammo === 0 ? this.weapon.emptyReload / this.weapon.reloadDuration : 1);
    this.reloadLeft = this.reloadTotal;
    this.recoveryDuringReload = false;
    if (this.tutorial) this.tutorial.didReload = true;
    this.event("reload");
    return true;
  }
  addBullet(x, y, angle, options = {}) {
    const speed = options.speed || this.weapon.bulletSpeed;
    return (
      options.special === "turret"
        ? this.turretBullets
        : options.special || options.ultimate
          ? this.specialBullets
          : this.bullets
    ).add({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 3,
      life: 2,
      damage: 0,
      left: 1,
      hit: new Set(),
      fragment: false,
      ultimate: false,
      travelled: 22,
      weaponId: this.weaponId,
      knock: this.weapon.knock,
      bounces: 0,
      ...options,
    });
  }
  shoot(count = 1) {
    if (this.state !== "playing" || this.reloadLeft > 0 || this.ultimate)
      return false;
    if (this.player.ammo <= 0) {
      this.reload();
      return false;
    }
    count = Math.min(count, this.player.ammo);
    const shot = { id: ++this.shotId, checked: new Set(), count };
    const p = this.player,
      w = this.weapon,
      target = nearestTarget(p, this.enemies);
    if (target) p.angle = Math.atan2(target.y - p.y, target.x - p.x);
    for (let i = 0; i < w.pellets; i++) {
      const offset =
        w.pellets > 1
          ? (i / (w.pellets - 1) - 0.5) * w.spread
          : (this.random() - 0.5) * w.spread;
      const a = p.angle + offset;
      this.addBullet(p.x + Math.cos(a) * 22, p.y + Math.sin(a) * 22, a, {
        damage: p.damage * (count + 0.6 * Math.min(count, p.chargedShots || 0)),
        shot,
        burnDps: p.burnDps,
        iceChance: p.iceChance,
        iceDuration: p.iceDuration,
        left: 1 + p.pierce,
        life: w.ranges.at(-1) / w.bulletSpeed + 0.1,
      });
    }
    this.shotCd += this.effectiveFireDelay() * count;
    this.event("shoot");
    p.ammo -= count;
    p.chargedShots = Math.max(0, (p.chargedShots || 0) - count);
    if (p.ammo === 0) this.reload();
    return true;
  }
  activateUltimate() {
    if (this.ultimateId === "tar") return this.toggleTar();
    if (this.ultimateId === "pulse") return this.shockwave();
    if (
      this.state !== "playing" ||
      this.ultimate ||
      (this.ultimateId === "charge" && this.dodge.left > 0) ||
      this.ultCharge < ULT_KILLS
    )
      return false;
    this.ultCharge = 0;
    // Keep the primary magazine; an interrupted reload must be started again.
    this.reloadLeft = this.reloadTotal = 0;
    this.ultimate =
      this.ultimateId === "ricochet"
        ? { kind: "ricochet", ammo: ULTIMATES.ricochet.ammo, cd: 0 }
        : {
            kind: "charge",
            energy: ULTIMATES.charge.energy,
            angle: this.player.angle,
            hit: new Set(),
          };
    if (this.tutorial) this.tutorial.didSkill = true;
    this.event(`ultimate:${this.ultimateId}`);
    this.shake = 6;
    return true;
  }
  endUltimate() {
    this.ultimate = null;
    this.shotCd = 0;
    if (this.player.ammo === 0) this.reload();
  }
  updateUltimate(dt, input) {
    const u = this.ultimate,
      p = this.player;
    if (!u) return;
    if (u.kind === "ricochet") {
      const spec = ULTIMATES.ricochet;
      u.cd -= dt;
      // Automatic fire spends the finite magazine even with no target.
      while (u.cd <= 0 && u.ammo > 0) {
        const target = nearestTarget(p, this.enemies);
        if (target) p.angle = Math.atan2(target.y - p.y, target.x - p.x);
        for (let i = 0; i < spec.row && u.ammo > 0; i++, u.ammo--) {
          const offset = (i - (spec.row - 1) / 2) * 11,
            a = p.angle;
          this.addBullet(
            p.x + Math.cos(a) * 24 - Math.sin(a) * offset,
            p.y + Math.sin(a) * 24 + Math.cos(a) * offset,
            a,
            {
              speed: spec.bulletSpeed,
              damage: spec.damage,
              life: spec.life,
              left: 3,
              knock: 32,
              ultimate: true,
              weaponId: null,
              bounces: spec.bounces,
              travelled: 0,
            },
          );
        }
        u.cd += spec.interval;
        this.event("ultimateFire:ricochet");
      }
      if (u.ammo <= 0) this.endUltimate();
      return;
    }
    const spec = ULTIMATES.charge;
    if (Math.hypot(input.x, input.y) > 0.12) {
      const target = Math.atan2(input.y, input.x),
        diff = Math.atan2(
          Math.sin(target - u.angle),
          Math.cos(target - u.angle),
        );
      u.angle += clamp(diff, -spec.turnSpeed * dt, spec.turnSpeed * dt);
    }
    p.angle = u.angle;
    const x = p.x,
      y = p.y;
    p.x = clamp(x + Math.cos(u.angle) * spec.speed * dt, 32, C.width - 32);
    p.y = clamp(y + Math.sin(u.angle) * spec.speed * dt, 68, C.height - 40);
    u.energy -= spec.drain * dt;
    if (Math.hypot(p.x - x, p.y - y) < spec.speed * dt * 0.3)
      u.energy -= spec.wallDrain * dt;
    for (const e of this.enemies) {
      if (
        e.hp <= 0 ||
        e.ally ||
        u.hit.has(e.id) ||
        !segmentHit(x, y, p.x, p.y, e, e.r + 32)
      )
        continue;
      u.hit.add(e.id);
      e.shield = 0;
      this.hurtEnemy(
        e,
        this.directDamage(
          e,
          e.type === "boss"
            ? spec.bossDamage
            : e.type === "tomb"
              ? spec.tombDamage
              : e.hp,
        ),
        u.angle,
        spec.knock,
      );
      u.energy -= e.type === "boss" ? spec.bossCost : spec.hitCost;
      if (u.energy <= 0) break;
    }
    this.hazards.sweep((h) => !segmentHit(x, y, p.x, p.y, h, h.r + 32));
    p.invuln = Math.max(p.invuln, 0.08);
    if (u.energy <= 0) this.endUltimate();
  }
  shockwave() {
    if (
      this.state !== "playing" ||
      this.pulseCd > 0 ||
      this.ultimateId !== "pulse"
    )
      return false;
    const p = this.player;
    this.pulseCd = p.pulseCooldown;
    this.pulse = { x: p.x, y: p.y, age: 0 };
    this.shake = 8;
    let pulseHit = false;
    for (const e of this.enemies)
      if (!e.ally && e.hp > 0 && distance(e, p) <= C.pulseRadius + e.r) {
        pulseHit = true;
        e.shield = 0;
        this.hurtEnemy(
          e,
          this.directDamage(e, C.pulseDamage),
          Math.atan2(e.y - p.y, e.x - p.x),
          570,
        );
        if (e.type !== "boss") {
          e.pending = null;
          e.dash = 0;
          e.atkTimer = Math.max(e.atkTimer, 1);
        }
      }
    if (pulseHit && p.pulseAmmo) p.ammo = Math.min(p.magazineSize, p.ammo + 6);
    this.hazards.sweep((h) => distance(h, p) > C.pulseRadius + h.r);
    this.burst(p.x, p.y, "#7affde", 42);
    if (this.tutorial) this.tutorial.didSkill = true;
    this.event("pulse");
    this.event("haptic:skill");
    return true;
  }
  stacks(id) {
    return this.buffs.filter((b) => b === id).length;
  }
  balanceSpawn(type) {
    return (type === "shooter" || type === "mage") &&
      this.random() >= C.rangedRetention
      ? "chaser"
      : type;
  }
  get upgradeCost() {
    return ROGUE.upgradeBase + this.purchases * ROGUE.upgradeStep;
  }
  availableBuffs() {
    return BUFFS.filter(
      (b) =>
        this.stacks(b.id) < b.maxStacks &&
        (!b.skill || b.skill === this.ultimateId) &&
        (b.id !== "reload" || this.player.reloadDuration > 0.300001) &&
        (b.id !== "cooldown" || this.player.pulseCooldown > 2.000001),
    );
  }
  buyUpgrade() {
    if (
      !["playing", "station"].includes(this.state) ||
      (this.bossDefeated && this.state !== "station") ||
      this.points < this.upgradeCost
    )
      return false;
    this.buffReturn = this.state;
    this.points -= this.upgradeCost;
    this.purchases++;
    this.offerBuffs();
    return true;
  }
  offerBuffs() {
    const pool = this.availableBuffs();
    if (!pool.length) return false;
    this.state = "buff";
    const hpRatio = this.player.hp / this.player.maxHp;
    const healWeight = hpRatio <= 0.35 ? 5 : hpRatio <= 0.65 ? 3 : 1;
    const weight = (buff) =>
      buff.id === "heal"
        ? healWeight
        : ["rate", "frenzy"].includes(buff.id)
          ? ROGUE.rateBuffWeight
          : 1;
    this.choices = [];
    while (pool.length && this.choices.length < 3) {
      const total = pool.reduce((sum, buff) => sum + weight(buff), 0);
      let pick = this.random() * total;
      let index = 0;
      for (; index < pool.length - 1; index++) {
        pick -= weight(pool[index]);
        if (pick < 0) break;
      }
      this.choices.push(pool.splice(index, 1)[0]);
    }
    if (
      !this.tutorial &&
      this.items.some((item) => !item) &&
      this.random() < ROGUE.itemChoiceChance
    ) {
      const ids = Object.keys(ITEMS),
        id =
          ids[Math.min(ids.length - 1, Math.floor(this.random() * ids.length))];
      this.choices[this.choices.length - 1] = {
        id,
        name: ITEMS[id].name,
        item: true,
      };
    }
    if (this.tutorial?.step === "upgrade")
      this.choices = ["dragon", "ice", "damage"].map((id) =>
        BUFFS.find((b) => b.id === id),
      );
    this.choiceVersion++;
    return true;
  }
  rebuildStats() {
    Object.assign(
      this.player,
      buildStats(this.weapon, (id) => this.stacks(id)),
    );
    this.player.hp = Math.min(this.player.hp, this.player.maxHp);
    this.player.ammo = Math.min(this.player.ammo, this.player.magazineSize);
  }
  chooseBuff(id) {
    const b = this.choices.find((b) => b.id === id);
    if (
      this.state !== "buff" ||
      !b ||
      !(b.item
        ? ITEMS[id] && this.items.some((item) => !item)
        : this.availableBuffs().some((v) => v.id === id))
    )
      return false;
    if (b.item)
      this.items[this.items.findIndex((item) => !item)] = {
        id,
        ammo: ITEMS[id].ammo,
        active: false,
        cd: 0,
      };
    else this.buffs.push(id);
    this.rebuildStats();
    if (id === "heal")
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 35);
    if (id === "magazine") {
      this.player.ammo = this.player.magazineSize;
      this.reloadLeft = this.reloadTotal = 0;
    }
    if (id === "cooldown")
      this.pulseCd = Math.min(this.pulseCd, this.player.pulseCooldown);
    this.choices = [];
    this.state = this.buffReturn || "playing";
    this.player.invuln = Math.max(this.player.invuln, 0.6);
    this.event("buff");
    return true;
  }
  hazard(x, y, a, speed = 190, damage = 14) {
    this.hazards.add({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      r: 6,
      life: 7,
      damage,
    });
  }
  updateBoss(b, dt) {
    if (b.bossKind === "tree") {
      this.updateTree(b, dt);
      return;
    }
    const p = this.player,
      enraged = b.hp <= b.maxHp / 2;
    b.atkTimer -= dt;
    if (b.pending) {
      b.pending.t -= dt;
      if (b.pending.t <= 0) {
        const pending = b.pending;
        b.pending = null;
        if (pending.kind === "ring") {
          for (let k = 0; k < 16; k++)
            this.hazard(
              b.x,
              b.y,
              (k * Math.PI * 2) / 16 + b.sequence * 0.22,
              enraged ? 205 : 175,
              C.bossBulletDamage,
            );
        } else if (pending.kind === "fan") {
          for (let i = -3; i <= 3; i++)
            this.hazard(
              b.x,
              b.y,
              pending.a + i * 0.16,
              240,
              C.bossBulletDamage,
            );
        } else
          b.laser = {
            start: pending.start,
            end: pending.end,
            ang: pending.start,
            life: 1.8,
            dur: 1.8,
          };
        this.event("bossFire");
      }
    } else if (!b.laser && b.atkTimer <= 0) {
      const a = Math.atan2(p.y - b.y, p.x - b.x);
      b.sequence++;
      b.pending =
        b.sequence % 2
          ? { kind: "ring", t: 1, max: 1 }
          : { kind: "laser", t: 1.1, max: 1.1, start: a - 0.8, end: a + 0.8 };
      if (this.mode === "endless" && this.time >= 360 && b.sequence % 3 === 0)
        b.pending = { kind: "fan", a, t: 0.9, max: 0.9 };
      b.atkTimer =
        (enraged ? 2.6 : 3.8) *
        (this.mode === "endless" && this.time >= 600 ? 0.8 : 1);
    }
    if (b.laser) {
      const l = b.laser;
      l.life -= dt;
      l.ang = l.start + (l.end - l.start) * (1 - l.life / l.dur);
      const dx = p.x - b.x,
        dy = p.y - b.y;
      const along = dx * Math.cos(l.ang) + dy * Math.sin(l.ang),
        across = Math.abs(-dx * Math.sin(l.ang) + dy * Math.cos(l.ang));
      if (along > 0 && across < p.r + 9) this.hurtPlayer(C.bossLaserDamage);
      for (const t of this.turrets)
        if (
          segmentHit(
            b.x,
            b.y,
            b.x + Math.cos(l.ang) * 1600,
            b.y + Math.sin(l.ang) * 1600,
            t,
            t.r + 9,
          )
        )
          this.hurtTurret(t, C.bossLaserDamage);
      if (l.life <= 0) b.laser = null;
    }
  }
  update(dt, input = { x: 0, y: 0, fire: false }) {
    if (this.state === "ashes") {
      this.ashes.age += Math.min(dt, 0.05);
      if (this.ashes.age >= 1.2) this.completeBoss();
      return;
    }
    if (this.state !== "playing") return;
    dt = clamp(dt, 0, 0.05);
    const p = this.player;
    const firing = input.fire || (input.autoFire && !!nearestTarget(p, this.enemies));
    this.time += dt;
    this.waveTime += dt;
    this.updateEvolution(dt);
    this.updateRogue(dt);
    this.updateTutorial(dt, input);
    this.banner = Math.max(0, this.banner - dt);
    this.shotCd -= dt;
    if (!firing) this.shotCd = Math.max(0, this.shotCd);
    this.pulseCd = Math.max(0, this.pulseCd - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    const oldUnhurt = this.unhurtTime;
    this.unhurtTime += dt;
    const healingTime =
      Math.max(0, this.unhurtTime - C.regenDelay) -
      Math.max(0, oldUnhurt - C.regenDelay);
    p.hp = Math.min(p.maxHp, p.hp + healingTime * C.regenRate);
    if (
      this.reloadLeft > 0 &&
      input.fire &&
      p.ammo > 0 &&
      !this.ultimate &&
      !this.recoveryDuringReload
    )
      this.reloadLeft = this.reloadTotal = 0;
    if (this.reloadLeft > 0) {
      this.reloadLeft = Math.max(0, this.reloadLeft - dt);
      if (this.reloadLeft === 0) {
        p.ammo = p.magazineSize;
        this.recoveryDuringReload = false;
        p.chargedShots = p.chamber ? 3 : 0;
        this.event("reloadDone");
      }
    }
    this.shake *= Math.exp(-12 * dt);
    const len = Math.max(1, Math.hypot(input.x, input.y));
    this.dodge.cooldown = Math.max(0, this.dodge.cooldown - dt);
    if (Math.hypot(input.x, input.y) > 0.12) {
      const magnitude = Math.hypot(input.x, input.y);
      this.dodge.lastX = input.x / magnitude;
      this.dodge.lastY = input.y / magnitude;
    }
    if (this.dodge.left > 0) {
      const travel =
        (C.dodgeDistance * Math.min(dt, this.dodge.left)) / C.dodgeDuration;
      p.x = clamp(p.x + this.dodge.x * travel, 32, C.width - 32);
      p.y = clamp(p.y + this.dodge.y * travel, 68, C.height - 40);
      if (
        this.tutorial?.step === "dodge" &&
        this.tutorial.dodgeFromOutside &&
        Math.hypot(p.x - this.tutorial.target.x, p.y - this.tutorial.target.y) <
          35
      )
        this.tutorial.didDodge = true;
      this.dodge.left = Math.max(0, this.dodge.left - dt);
      // Cover collision checks on the final partial step, without extending the dodge timer.
      p.invuln = Math.max(p.invuln, dt);
    } else if (this.ultimate?.kind !== "charge") {
      p.x = clamp(p.x + (input.x / len) * p.speed * dt, 32, C.width - 32);
      p.y = clamp(p.y + (input.y / len) * p.speed * dt, 68, C.height - 40);
    }
    const wasUltimate = !!this.ultimate;
    this.updateUltimate(dt, input);
    this.updateTar(dt);
    const field = this.dangerField();
    if (
      field?.active &&
      (field.vertical
        ? p.x < field.width || p.x > C.width - field.width
        : p.y < 60 + field.width || p.y > C.height - 40 - field.width)
    )
      this.hurtPlayer(10);
    if (this.state !== "playing") return;
    if (wasUltimate || this.ultimate || this.reloadLeft > 0) this.shotCd = 0;
    else if (firing)
      while (this.shotCd <= 0) {
        if (
          !this.shoot(
            this.weapon.pellets / this.effectiveFireDelay() > 1200
              ? Math.max(
                  1,
                  Math.floor(-this.shotCd / this.effectiveFireDelay()) + 1,
                )
              : 1,
          )
        ) {
          this.shotCd = 0;
          break;
        }
      }
    if (this.pulse) {
      this.pulse.age += dt;
      if (this.pulse.age > 0.55) this.pulse = null;
    }
    if (!this.isBossWave()) {
      this.spawnAcc += dt;
      const every = this.waveSpec().every;
      while (
        this.remaining > 0 &&
        this.spawnAcc >= every &&
        this.enemies.filter((e) => !e.ally && e.hp > 0).length < C.enemyCap
      ) {
        this.spawnAcc -= every;
        this.remaining--;
        const r = this.random();
        let type;
        if (this.mode === "endless" && this.time >= 180) {
          const ranged = this.pressure().ranged;
          type =
            r < ranged
              ? "shooter"
              : r < ranged + 0.26
                ? "charger"
                : this.time >= 360 && r > 0.9
                  ? "shield"
                  : "chaser";
        } else
          type =
            this.wave === 1
              ? "chaser"
              : r < 0.46
                ? "chaser"
                : r < 0.73
                  ? "charger"
                  : "shooter";
        if (
          this.wave >= 3 &&
          this.random() < E.mageChance &&
          this.enemies.filter((e) => e.type === "mage" && !e.ally && e.hp > 0)
            .length < E.mageCap
        )
          type = "mage";
        this.spawn(this.balanceSpawn(type));
      }
    }
    if (this.isBossWave() && !this.bossDefeated && !this.tutorial) {
      this.bossAddsTimer -= dt;
      if (this.bossAddsTimer <= 0) {
        this.bossAddsTimer = C.bossAddsEvery;
        for (
          let i = 0;
          i < 3 &&
          this.enemies.filter((e) => e.type !== "boss" && !e.ally && e.hp > 0)
            .length < 18;
          i++
        )
          this.spawn(this.balanceSpawn(["chaser", "charger", "shooter"][i]));
      }
    }
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      if (e.ally) {
        this.updateAlly(e, dt);
        continue;
      }
      if (!this.updateStatus(e, dt)) continue;
      if (e.type === "tomb") {
        e.flash = Math.max(0, e.flash - dt);
        this.updateTomb(e, dt);
        continue;
      }
      const enemyDt = dt * (e.slow > 0 ? 0.8 : 1);
      e.flash = Math.max(0, e.flash - dt);
      e.warm = Math.max(0, (e.warm || 0) - dt);
      const target = e.type === "boss" ? p : this.enemyTarget(e);
      const dx = target.x - e.x,
        dy = target.y - e.y,
        d = Math.hypot(dx, dy) || 1,
        a = Math.atan2(dy, dx);
      if (e.warm <= 0) {
        if (e.type === "boss") this.updateBoss(e, enemyDt);
        else {
          e.atkTimer -= dt;
          if (e.type === "charger") {
            if (e.pending) {
              e.pending.t -= dt;
              if (e.pending.t <= 0) {
                e.dash = 0.42;
                e.dashAngle = e.pending.a;
                e.pending = null;
              }
            } else if (e.atkTimer <= 0 && e.dash <= 0) {
              e.pending = { a, t: 0.7, max: 0.7, kind: "charge" };
              e.atkTimer = 3.2;
            }
          }
          if ((e.type === "shooter" || e.type === "mage") && e.atkTimer <= 0) {
            if (e.pending) {
              e.pending.t -= dt;
              if (e.pending.t <= 0) {
                this.hazard(e.x, e.y, e.pending.a, 210);
                if (this.mode === "endless" && this.time >= 600) {
                  this.hazard(e.x, e.y, e.pending.a - 0.22, 190);
                  this.hazard(e.x, e.y, e.pending.a + 0.22, 190);
                }
                e.pending = null;
                e.atkTimer = C.shooterInterval;
              }
            } else e.pending = { a, t: 0.65, max: 0.65, kind: "shot" };
          }
        }
        if (e.dash > 0) {
          e.x += Math.cos(e.dashAngle) * 460 * dt;
          e.y += Math.sin(e.dashAngle) * 460 * dt;
          e.dash -= dt;
        } else if (!e.pending && !e.laser) {
          const dir =
            e.type === "shooter" || e.type === "mage"
              ? d < 270
                ? -1
                : d > 370
                  ? 1
                  : 0
              : 1;
          e.x += (dx / d) * e.speed * dir * enemyDt;
          e.y += (dy / d) * e.speed * dir * enemyDt;
        }
        if (distance(e, p) < e.r + p.r)
          this.hurtPlayer(e.type === "boss" ? C.bossContactDamage : 12);
        if (target !== p && distance(e, target) < e.r + target.r)
          this.hurtTurret(target, 12);
      }
      e.x = clamp(e.x + e.kx * dt, 26, 1254);
      e.y = clamp(e.y + e.ky * dt, 65, 678);
      e.kx *= Math.exp(-7 * dt);
      e.ky *= Math.exp(-7 * dt);
    }
    if (this.state !== "playing") return;
    this.enemyGrid.rebuild(this.enemies);
    for (const b of [
      ...this.bullets.active,
      ...this.specialBullets.active,
      ...this.turretBullets.active,
    ]) {
      if (b.fragment) {
        const t =
          this.enemies.find(
            (e) => e.id === b.targetId && e.hp > 0 && !e.ally,
          ) || nearestTarget(b, this.enemies);
        if (t) {
          b.targetId = t.id;
          const a = Math.atan2(t.y - b.y, t.x - b.x);
          b.vx = Math.cos(a) * 800;
          b.vy = Math.sin(a) * 800;
        }
      }
      const ox = b.x,
        oy = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      b.travelled += Math.hypot(b.vx, b.vy) * dt;
      if (b.ultimate) {
        let bounced = false;
        if (b.x < 28 || b.x > 1252) {
          b.x = clamp(b.x, 28, 1252);
          b.vx *= -1;
          bounced = true;
        }
        if (b.y < 64 || b.y > 682) {
          b.y = clamp(b.y, 64, 682);
          b.vy *= -1;
          bounced = true;
        }
        if (bounced) {
          if (b.bounces-- <= 0) b.life = 0;
          this.burst(b.x, b.y, "#ffd58b", 2);
        }
      }
      if (b.life <= 0) continue;
      const weapon = b.weaponId && WEAPONS[b.weaponId];
      for (const e of b.special === "charm"
        ? this.enemies
        : this.enemyGrid.rect(
            Math.min(ox, b.x) - 80,
            Math.min(oy, b.y) - 80,
            Math.max(ox, b.x) + 80,
            Math.max(oy, b.y) + 80,
          )) {
        if (
          e.hp <= 0 ||
          (e.ally && b.special !== "charm") ||
          b.left <= 0 ||
          b.hit.has(e.id)
        )
          continue;
        const entry = segmentEntry(ox, oy, b.x, b.y, e, b.r + e.r);
        if (entry === null) continue;
        const travelled =
          b.travelled - Math.hypot(b.x - ox, b.y - oy) * (1 - entry);
        const falloff =
          weapon && !b.fragment ? damageAtRange(weapon, travelled) : 1;
        if (falloff <= 0) continue;
        b.hit.add(e.id);
        b.left--;
        if (b.special === "charm") {
          this.charmBlast(e.x, e.y);
          b.life = 0;
          b.left = 0;
          break;
        }
        if (!b.fragment && !b.special && !b.ultimate) this.onPrimaryHit(b);
        b.impactFalloff = falloff;
        this.applyElements(e, b);
        this.hurtEnemy(
          e,
          this.directDamage(e, b.damage * falloff),
          Math.atan2(b.vy, b.vx),
          b.knock,
          !b.ultimate && !b.special,
          true,
          b.special === "turret"
            ? "turret"
            : b.special || b.ultimate
              ? "special"
              : b.fragment
                ? "fragment"
                : "primary",
          b,
        );
        if (b.special === "electric") this.chainElectric(e);
        if (!b.ultimate && !b.special) b.damage *= 0.85;
      }
      if (b.range && b.travelled >= b.range) b.life = 0;
      if (weapon && !b.fragment && b.travelled >= weapon.ranges.at(-1))
        b.life = 0;
    }
    for (const pool of [this.bullets, this.specialBullets, this.turretBullets])
      pool.sweep(
        (b) =>
          b.life > 0 &&
          b.left > 0 &&
          b.x > 0 &&
          b.x < 1280 &&
          b.y > 0 &&
          b.y < 720,
      );
    for (const h of this.hazards.active) {
      const hx = h.x,
        hy = h.y;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.life -= dt;
      for (const t of this.turretGrid.rect(
        Math.min(hx, h.x) - 24,
        Math.min(hy, h.y) - 24,
        Math.max(hx, h.x) + 24,
        Math.max(hy, h.y) + 24,
      ))
        if (h.life > 0 && segmentHit(hx, hy, h.x, h.y, t, t.r + h.r)) {
          this.hurtTurret(t, h.damage ?? 14);
          h.life = 0;
        }
      const ally = this.enemies.find(
        (e) => e.ally && e.hp > 0 && distance(h, e) < h.r + e.r,
      );
      if (ally && h.life > 0) {
        ally.hp -= h.damage ?? 14;
        h.life = 0;
        if (ally.hp <= 0) this.explodeAlly(ally);
      }
      if (h.life > 0 && distance(h, p) < h.r + p.r) {
        h.life = 0;
        this.hurtPlayer(h.damage ?? 14);
      }
    }
    this.hazards.sweep(
      (h) => h.life > 0 && h.x > 0 && h.x < 1280 && h.y > 0 && h.y < 720,
    );
    for (const a of this.particles.active) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.life -= dt;
    }
    this.particles.sweep((a) => a.life > 0);
    for (const n of this.numbers.active) {
      n.y -= 36 * dt;
      n.life -= dt;
    }
    this.numbers.sweep((n) => n.life > 0);
    this.enemies = this.enemies.filter((e) => e.hp > 0);
    if (this.state !== "playing") return;
    // Victory takes precedence over pending rewards; escorts need not be cleared.
    if (
      this.bossDefeated ||
      (this.isBossWave() && this.enemies.every((e) => e.type !== "boss"))
    ) {
      this.beam = null;
      this.spikes = [];
      this.state = "ashes";
      this.ashes ||= { x: 640, y: 185, age: 0 };
      return;
    }
    if (
      !this.tutorial &&
      this.remaining === 0 &&
      this.enemies.every((e) => e.ally)
    )
      this.nextWave();
  }
}

Object.assign(
  Game.prototype,
  rogueMethods,
  tutorialMethods,
  evolutionMethods,
  tarMethods,
);
