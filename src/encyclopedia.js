import { artImage } from "./art.js";
import { WEAPONS, ULTIMATES, ULT_KILLS } from "./weapons.js";
import {
  BUFFS,
  C,
  ITEMS,
  EVENT_TYPES,
  ROGUE,
  EVOLUTION as E,
} from "./config.js";
const cards = () => ({
  武器: Object.values(WEAPONS).map((w) => ({
    name: w.name,
    description: w.description,
    stats: [
      ["伤害", w.damages.join(" / ") + (w.pellets > 1 ? "（每颗弹丸）" : "")],
      [
        "弹容",
        `${w.magazineSize} 发${w.pellets > 1 ? ` · 每发 ${w.pellets} 弹丸` : ""}`,
      ],
      ["射速", `${Math.round(60 / w.fireDelay)} 发/分`],
      ["换弹", `${w.reloadDuration} 秒 · 空仓 ${w.emptyReload} 秒`],
      ["射程", w.ranges.at(-1) >= 800 ? "远" : "中 · 贴身伤害高"],
      ["弹速", w.bulletSpeed >= 1000 ? "快" : "中"],
      ["机动", w.speed >= 260 ? "高" : w.speed < 220 ? "低" : "中"],
      [
        "击退",
        w.knock >= 90 ? "极强" : w.knock >= 60 ? "强" : "轻（每颗弹丸）",
      ],
    ],
  })),
  大招: Object.entries(ULTIMATES).map(([id, u]) => ({
    name: u.name,
    description: u.description,
    stats:
      id === "tar"
        ? [
            ["伤害", `${u.damage} /秒`],
            ["焦油持续", `${u.life} 秒`],
            ["范围", "近身路径"],
            ["续航", `满能量可开启 ${u.energy / u.drain} 秒`],
            ["回复", `关闭后 ${u.energy / u.recharge} 秒回满`],
            ["操作", "再次点击关闭，可同时开火与闪避"],
            ["效果", "重叠不增加伤害，不受强化影响"],
          ]
        : id === "pulse"
          ? [
              ["伤害", C.pulseDamage],
              ["冷却", `${C.pulseCooldown} 秒`],
              ["作用", "清弹、震退、破盾；Boss 不被击退"],
            ]
          : id === "ricochet"
            ? [
                ["弹容", `${u.ammo} 发`],
                ["伤害", u.damage],
                ["连射", `每次 ${u.row} 发 · ${u.interval} 秒间隔`],
                ["反弹", `最多 ${u.bounces} 次`],
                ["充能", `击杀 ${ULT_KILLS} 个敌人`],
              ]
            : [
                ["能量", u.energy],
                ["撞击", "普通敌人直接消灭"],
                ["Boss 伤害", u.bossDamage],
                ["墓碑伤害", u.tombDamage],
                [
                  "耗能",
                  `每秒 ${u.drain} · 撞敌 ${u.hitCost} · Boss ${u.bossCost}`,
                ],
                ["充能", `击杀 ${ULT_KILLS} 个敌人`],
              ],
  })),
  Buff: BUFFS.map((b) => ({
    name: b.name,
    description: b.description,
    stats: [
      [
        "层数",
        Number.isFinite(b.maxStacks)
          ? `最多 ${b.maxStacks} 层`
          : b.id === "reload"
            ? "换弹达到 0.3 秒后不再出现"
            : b.id === "cooldown"
              ? "冷却达到 2 秒后不再出现"
              : "可重复获得",
      ],
      ...(b.skill ? [["适用", "冲击波"]] : []),
      ...(b.id === "ice"
        ? [
            [
              "控制保护",
              `解冻后 ${ROGUE.thawImmunity} 秒不再麻痹；Boss 仅减速 20%`,
            ],
          ]
        : []),
    ],
  })),
  道具: Object.entries(ITEMS).map(([id, s]) => ({
    name: s.name,
    description: s.description,
    stats: [
      ["价格", `${s.price} 点`],
      [
        s.deploy ? "部署" : s.drain ? "持续时间" : "弹药",
        s.deploy
          ? `${s.ammo} 台 · 存活期间持续工作`
          : `${s.drain ? `${s.ammo / s.drain} 秒` : `${s.ammo} 发`} · 启动后持续使用至耗尽`,
      ],
      [s.drain ? "每束每秒伤害" : "伤害", s.damage],
      ...(id === "beam"
        ? [
            ["锁定", `${s.beams} 束分别锁敌，目标不足时集火`],
            ["穿透", "沿直线贯穿所有敌人，伤害不递减"],
          ]
        : id === "sentry"
          ? [
              ["每台生命", s.hp],
              ["射速", `${Math.round(60 / s.interval)} 发/分`],
              ["射程", "中远"],
              [
                "强化",
                "继承伤害、射速、龙息与寒冰；不积累玩家狂热，不为玩家回收弹药",
              ],
              ["保留", "跨波次和补给站保留血量；敌人可以摧毁，不自动修复"],
            ]
          : id === "electric"
            ? [
                ["麻痹", `${s.freeze} 秒，解冻保护 ${s.immunity} 秒`],
                [
                  "传递",
                  `近距离 ${s.chainHops} 跳，含首目标最多 ${s.chainTargets} 个；传递伤害 ${s.chainDamage}`,
                ],
                ["Boss", "伤害与减速，不麻痹"],
              ]
            : [
                ["魅惑", "永久转化 · 生命耗尽时自爆"],
                ["友军射击", `${s.allyDamage} 伤害 / ${s.allyInterval} 秒`],
                ["自爆", `${s.blastDamage} 范围伤害`],
                ["Boss", "只受爆炸伤害"],
              ]),
    ],
  })),
  事件: EVENT_TYPES.map((e) => ({
    name: e.name,
    description: e.description,
    stats: [["触发", "无尽模式拾取金色事件币"]],
  })),
  敌人: [
    {
      name: "追击者",
      description: "持续追击，保持移动拉开距离",
      hp: C.chaserHp,
    },
    {
      name: "冲锋者",
      description: "预警后直线冲锋，侧向闪避",
      hp: C.chargerHp,
    },
    { name: "射手", description: "保持距离并发射弹幕", hp: C.shooterHp },
    {
      name: "护盾兵",
      description: `额外护盾 ${C.shieldHp}，冲击波可破盾`,
      hp: C.shooterHp,
    },
    {
      name: "墓碑法师",
      description: `死亡留下墓碑；墓碑每 ${E.tombInterval} 秒召唤 ${E.summons} 个追击者`,
      hp: E.mageHp,
    },
    {
      name: "墓碑",
      description:
        "优先摧毁召唤源；无法魅惑、冻结或击退。召唤怪不提供点数和大招充能",
      hp: E.tombHp,
    },
    {
      name: "树妖",
      description: `发射预警扇形弹幕；地刺预警 ${E.spikeWarning} 秒，持续 ${E.spikeLife} 秒，接触伤害 ${E.spikeDamage}；半血后地刺更多、更频繁`,
      hp: C.bossHp,
    },
    {
      name: "裂隙守卫",
      description: "环形弹幕与激光扫射，半血狂暴",
      hp: C.bossHp,
    },
  ].map((e) => ({
    name: e.name,
    description: e.description,
    stats: [
      ["初始生命", e.hp],
      [
        "点数",
        ["裂隙守卫", "树妖"].includes(e.name)
          ? ROGUE.bossPoints
          : ROGUE.normalPoints,
      ],
    ],
  })),
});
export function setupCodex() {
  const $ = (id) => document.getElementById(id),
    data = cards();
  const artByName = Object.fromEntries([
    ...Object.values(WEAPONS).map((w) => [w.name, "card-" + w.id]),
    ...Object.entries(ULTIMATES).map(([id, v]) => [v.name, "icon-" + id]),
    ...Object.entries(ITEMS).map(([id, v]) => [v.name, "icon-" + id]),
    ...BUFFS.map((b) => [b.name, "icon-" + b.id]),
    ...EVENT_TYPES.map((v) => [v.name, "icon-coin"]),
    ["树妖", "tree"],
    ["墓碑法师", "mage"],
    ["墓碑", "tomb"],
    ...["追击者", "冲锋者", "射手", "护盾兵", "裂隙守卫"].map((n, i) => [
      n,
      ["chaser", "charger", "shooter", "shield", "boss"][i],
    ]),
  ]);
  function show(category) {
    for (const b of $("codex-tabs").children)
      b.setAttribute("aria-pressed", b.textContent === category);
    $("codex-content").replaceChildren();
    for (const entry of data[category]) {
      const card = document.createElement("article");
      card.innerHTML = `${artImage(artByName[entry.name], "codex-art")}<h3>${entry.name}</h3><p>${entry.description}</p><dl>${entry.stats.map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`).join("")}</dl>`;
      $("codex-content").append(card);
    }
    $("codex-content").scrollTop = 0;
  }
  for (const category of Object.keys(data)) {
    const b = document.createElement("button");
    b.textContent = category;
    b.onclick = () => show(category);
    $("codex-tabs").append(b);
  }
  show("武器");
  $("codex-open").onclick = () => $("codex-dialog").showModal();
  $("codex-close").onclick = () => $("codex-dialog").close();
}
