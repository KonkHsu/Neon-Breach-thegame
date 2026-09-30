import { distance } from "./config.js";
export const LESSONS = {
  move: "左侧滑动或按 WASD，移动到光圈",
  shoot: "长按开火，消灭 3 个敌人",
  reload: "换弹一次，避开攻击，等待生命恢复",
  skill: "靠近敌人，释放一次大招",
  upgrade: "点击「强化」，花费点数选择 Buff",
  elements: "龙息与寒冰已装填：开火，让敌人灼烧并麻痹",
  boss: "击败守卫，进入补给站",
  shop: "购买一件道具，再继续挑战",
  item: "点击任一道具槽使用，键盘按 F / G",
  coin: "拾取金色事件币",
  done: "教学完成",
  dodge: "朝光圈移动，点击闪避或按 Shift",
};
export const lessonText = (g) =>
  g.tutorial?.step === "skill" && g.ultimateId === "tar"
    ? "开启焦油背包，移动灼伤敌人，再次点击关闭"
    : LESSONS[g.tutorial?.step] || "教学完成";
export const tutorialMethods = {
  startTutorial(weapon = "qbz191", skill = "pulse") {
    this.reset("campaign", weapon, skill);
    this.tutorial = {
      step: "move",
      origin: { x: this.player.x, y: this.player.y },
      target: { x: 840, y: 380 },
      kills: 0,
      elapsed: 0,
    };
    this.remaining = 0;
    this.banner = 0;
  },
  tutorialTargets(count = 3) {
    this.enemies = [];
    this.bullets.clear();
    this.specialBullets.clear();
    for (let i = 0; i < count; i++) {
      const e = this.spawn("chaser");
      Object.assign(e, {
        x: 350 + (i % 5) * 135,
        y: 220 + Math.floor(i / 5) * 160,
        hp: 80,
        maxHp: 80,
        speed: 35,
        warm: 1,
      });
    }
  },
  updateTutorial(dt, input) {
    const t = this.tutorial;
    if (!t) return;
    t.elapsed += dt;
    if (t.step === "move" && distance(this.player, t.target) < 45) {
      t.step = "dodge";
      t.target = { x: Math.min(1150, this.player.x + 150), y: this.player.y };
      this.dodge.cooldown = 0;
    } else if (t.step === "dodge" && t.didDodge) {
      t.step = "shoot";
      t.kills = this.kills;
      this.tutorialTargets();
    } else if (t.step === "shoot" && this.kills - t.kills >= 3) {
      t.step = "reload";
      this.player.hp = Math.min(this.player.hp, this.player.maxHp * 0.7);
      this.unhurtTime = 0;
      this.player.ammo = Math.min(
        this.player.ammo,
        this.player.magazineSize - 1,
      );
    } else if (
      t.step === "reload" &&
      t.didReload &&
      this.reloadLeft === 0 &&
      this.player.hp >= this.player.maxHp * 0.85
    ) {
      t.step = "skill";
      this.tutorialTargets(4);
    } else if (
      t.step === "skill" &&
      t.didSkill &&
      !this.ultimate &&
      (this.ultimateId !== "tar" ||
        (t.tarHit && t.tarClosed && !this.tar.active))
    ) {
      t.step = "upgrade";
      this.enemies = [];
      this.points = Math.max(this.points, this.upgradeCost);
    } else if (
      t.step === "upgrade" &&
      this.purchases > 0 &&
      this.state === "playing"
    ) {
      t.step = "elements";
      for (const id of ["dragon", "ice"])
        if (!this.stacks(id)) this.buffs.push(id);
      this.rebuildStats();
      this.tutorialTargets(2);
      for (const e of this.enemies) {
        e.hp = e.maxHp = 1500;
        e.speed = 0;
      }
      t.elementHits = 0;
    } else if (t.step === "elements") {
      const burned = this.enemies.some((e) => e.burn > 0),
        frozen = this.enemies.some((e) => e.frozen > 0);
      t.sawBurn ||= burned;
      t.sawFreeze ||= frozen;
      if (t.sawBurn && t.sawFreeze) {
        t.step = "boss";
        this.wave = 4;
        this.nextWave();
        const b = this.enemies[0];
        b.hp = b.maxHp = 1400;
        this.bossAddsTimer = 999;
        this.player.hp = this.player.maxHp;
        this.player.ammo = this.player.magazineSize;
      }
    } else if (
      t.step === "item" &&
      t.didItem &&
      !this.items.some((item) => item?.active)
    ) {
      t.step = "coin";
      this.enemies = [];
      this.specialBullets.clear();
      this.coin = { x: 640, y: 360, life: 999 };
      if (distance(this.player, this.coin) < 80) this.coin.x = 900;
    } else if (t.step === "coin" && t.didCoin) {
      t.step = "done";
      this.finish(true);
    }
  },
};
