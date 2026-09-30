import { setupAnnouncement } from "./announcement-ui.js";
import { setupIntro } from "./intro.js";
import { Haptics } from "./haptics.js";
import { artImage, artUrl } from "./art.js";
import { setupEndless } from "./endless-ui.js";
import { setupLandscape } from "./orientation.js";
import { setupCodex } from "./encyclopedia.js";
import { LESSONS, lessonText } from "./tutorial.js";
import { WEAPONS, ULTIMATES, ULT_KILLS } from "./weapons.js";
import "./style.css";
import "./battle-ui.css";
import { Game } from "./combat.js";
import { BUFFS, C, ITEMS, buffDescription } from "./config.js";
import { Renderer } from "./render.js";
import { Input } from "./input.js";
import { Audio } from "./audio.js";
import { read, write } from "./storage.js";
const $ = (id) => document.getElementById(id),
  g = new Game(),
  renderer = new Renderer($("arena")),
  audio = new Audio();
let endless;
let best = Number(read("best", 0)) || 0,
  bestEndless = Number(read("best-endless", 0)) || 0,
  selectedMode = "campaign",
  selectedWeapon = "qbz191",
  selectedUltimate = "pulse",
  lastState = "",
  lastBuffs = "",
  lastChoiceVersion = -1,
  lastTime = performance.now(),
  portrait = false;
let accumulator = 0,
  hudTime = 0;
const haptics = new Haptics(navigator, read("vibration", false) === true);
let soundEnabled = read("sound", true) === true;
let autoFireEnabled = read("auto-fire", false) === true;
renderer.reduced =
  read(
    "reduced-motion",
    matchMedia("(prefers-reduced-motion: reduce)").matches,
  ) === true;
const touchControls = matchMedia("(pointer: coarse)");
const timeText = (t) =>
  `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
function activity() {
  if (!audio.ready || audio.context?.state !== "running") {
    audio.enabled = soundEnabled;
    audio.unlock();
  }
}
function settings() {
  $("attack-label").textContent = autoFireEnabled ? "自动" : "开火";
  $("attack-caption").innerHTML = autoFireEnabled ? "自动开火中" : "长按 <kbd>SPACE</kbd>";
  $("attack").setAttribute("aria-label", autoFireEnabled ? "自动开火已开启，可按住手动开火" : "按住开火");
  $("auto-fire").innerHTML = `自动开火 <span>${autoFireEnabled ? "开" : "关"}</span>`;
  $("auto-fire").setAttribute("aria-pressed", String(autoFireEnabled));
  $("auto-fire").setAttribute("aria-label", autoFireEnabled ? "关闭主武器自动开火" : "开启主武器自动开火");
  $("vibration-note").textContent = haptics.available
    ? "受伤、大招与道具启动时震动"
    : haptics.unsupportedReason;
  $("vibration").innerHTML =
    `震动 <span>${haptics.available ? (haptics.enabled ? "开" : "关") : "不支持"}</span>`;
  $("vibration").disabled = !haptics.available;
  $("vibration").title = haptics.available
    ? "受伤、大招与道具震动"
    : "当前设备不支持震动";
  $("vibration").setAttribute(
    "aria-label",
    haptics.available
      ? haptics.enabled
        ? "关闭震动"
        : "开启震动"
      : "当前设备不支持震动",
  );
  $("sound").innerHTML = `声音 <span>${soundEnabled ? "开" : "关"}</span>`;
  $("sound").setAttribute("aria-label", soundEnabled ? "关闭声音" : "开启声音");
  $("motion").innerHTML = `震屏 <span>${renderer.reduced ? "弱" : "开"}</span>`;
  $("motion").setAttribute(
    "aria-label",
    renderer.reduced ? "开启完整震屏" : "减弱震屏",
  );
}
function pause(only = false) {
  if ($("settings-dialog").open) {
    $("settings-dialog").close();
    return;
  }
  if ($("start-dialog").open) {
    $("start-dialog").close();
    return;
  }
  if (endless?.closeDialog()) return;
  if ($("codex-dialog").open) {
    $("codex-dialog").close();
    return;
  }
  if ($("backpack-dialog").open) {
    $("backpack-dialog").close();
    return;
  }
  if (g.state === "paused" && !only && !portrait) g.resume();
  else g.pause();
  input.clear();
  sync();
}
const input = new Input({
  canvas: $("arena"),
  joystick: $("joystick"),
  moveZone: $("move-zone"),
  knob: $("knob"),
  attack: $("attack"),
  dodge: $("dodge"),
  onDodge: () => g.evade(input.sample()),
  pulse: $("pulse"),
  reload: $("reload"),
  ultimate: $("ultimate"),
  item: $("item"),
  item2: $("item2"),
  onItem: (slot = 0) => g.useItem(slot),
  upgrade: $("upgrade"),
  onUpgrade: purchaseUpgrade,
  onUltimate: () => g.activateUltimate(),
  onPulse: () => g.shockwave(),
  onReload: () => g.reload(),
  onPause: pause,
  onActivity: activity,
  isPlaying: () => g.state === "playing" && !portrait,
});
setupCodex();
document.querySelector(".pulse-glyph").innerHTML = artImage(
  "icon-pulse",
  "action-art",
);
document.documentElement.style.setProperty(
  "--menu-art",
  `url("${artUrl("menu")}")`,
);
document.documentElement.style.setProperty(
  "--station-art",
  `url("${artUrl("station")}")`,
);
document.addEventListener(
  "error",
  (e) => {
    if (
      e.target instanceof HTMLImageElement &&
      e.target.classList.contains("art-image")
    )
      e.target.hidden = true;
  },
  true,
);
function purchaseUpgrade() {
  if (!g.buyUpgrade()) return;
  input.clear();
  sync();
}
$("station-upgrade").onclick = purchaseUpgrade;
$("station-continue").onclick = () => {
  activity();
  if (endless?.busy) return;
  g.leaveStation();
  input.clear();
  if (portrait) g.pause();
  sync();
};
$("station-backpack").onclick = () => {
  selectedWeapon = g.weaponId;
  selectedUltimate = g.ultimateId;
  refreshLoadout();
  $("backpack-dialog").showModal();
};
$("tutorial-start").onclick = async () => {
  await renderer.art.ready;
  activity();
  input.clear();
  g.startTutorial(selectedWeapon, selectedUltimate);
  if (portrait) g.pause();
  sync();
};
$("tutorial-exit").onclick = () => {
  input.clear();
  g.state = "menu";
  g.tutorial = null;
  sync();
};
for (const [id, spec] of Object.entries(ITEMS)) {
  const button = document.createElement("button");
  button.className = "shop-card";
  button.dataset.item = id;
  button.innerHTML = `${artImage(`icon-${id}`, "shop-art")}<strong>${spec.name}</strong><small>${spec.description}</small><span>${spec.deploy ? `${spec.ammo} 台` : spec.drain ? `${spec.ammo / spec.drain} 秒` : `${spec.ammo} 发`} · ${spec.price} 点</span>`;
  button.onclick = () => {
    g.buyItem(id);
    sync();
  };
  $("shop").append(button);
}
function refreshStation() {
  $("station-points").textContent = `${g.points} 点`;
  $("station-loadout").textContent =
    `${g.weapon.name} · ${ULTIMATES[g.ultimateId].name}`;
  $("station-upgrade").textContent = `强化 · ${g.upgradeCost} 点`;
  $("station-upgrade").disabled = g.points < g.upgradeCost;
  $("station-item").textContent =
    g.items
      .map((item, i) => `${i + 1}号槽：${item ? ITEMS[item.id].name : "空闲"}`)
      .join(" · ") + (g.turrets.length ? ` · 机枪 ${g.turrets.length} 台` : "");
  for (const button of $("shop").children)
    button.disabled =
      g.items.every(Boolean) || g.points < ITEMS[button.dataset.item].price;
}
window.addEventListener("keydown", (e) => {
  if (
    e.code === "KeyU" &&
    !e.repeat &&
    g.state === "station" &&
    !$("backpack-dialog").open
  ) {
    g.buyUpgrade();
    input.clear();
    sync();
  }
});
let launchChoice = null;
let starting = false;
async function start() {
  if (starting) return;
  starting = true;
  try {
    await renderer.art.ready;
    if (!(await endless.prepareStart(selectedMode))) return;
    activity();
    launchChoice = null;
    $("backpack-dialog").close();
    input.clear();
    g.reset(selectedMode, selectedWeapon, selectedUltimate);
    if (portrait) g.pause();
    sync();
  } finally {
    starting = false;
  }
}
function selectMode(mode) {
  selectedMode = mode;
  $("mode-campaign").setAttribute("aria-pressed", mode === "campaign");
  $("mode-endless").setAttribute("aria-pressed", mode === "endless");
  $("mode-tutorial").setAttribute("aria-pressed", mode === "tutorial");
  $("mode-hint").innerHTML =
    mode === "endless"
      ? "无尽敌潮 / 每 8 波 Boss<br><span>难度递增 · 挑战最高分</span>"
      : "约 3–5 分钟 / 局<br><span>5 波闯关 · 击破最终守卫</span>";
  $("best-label").textContent =
    mode === "endless" ? "无尽本机最高分" : "闯关最高分";
  sync();
}
function refreshLoadout() {
  for (const button of $("weapon-picker").children)
    button.setAttribute(
      "aria-pressed",
      button.dataset.weapon === selectedWeapon,
    );
  for (const button of $("ultimate-picker").children)
    button.setAttribute(
      "aria-pressed",
      button.dataset.ultimate === selectedUltimate,
    );
  const w = WEAPONS[selectedWeapon];
  $("weapon-detail").textContent =
    `${w.description} · 换弹 ${w.reloadDuration.toFixed(2)} 秒`;
  $("skill-rule").textContent =
    selectedUltimate === "tar"
      ? "随时开关 · 关闭后充能"
      : selectedUltimate === "pulse"
        ? "冷却后可再次释放"
        : "开局可用 · 击杀充能";
  $("ultimate-detail").textContent =
    selectedUltimate === "tar"
      ? "沿途燃烧 · 最长开启 10 秒 · 关闭后 20 秒回满"
      : selectedUltimate === "pulse"
        ? `震退敌人，清除附近弹幕 · 冷却 ${C.pulseCooldown} 秒`
        : selectedUltimate === "ricochet"
          ? "自动连射 320 发，打空结束"
          : "摇杆转向，撞敌耗能，耗尽结束";
}
for (const w of Object.values(WEAPONS)) {
  const button = document.createElement("button");
  button.dataset.weapon = w.id;
  button.innerHTML = `${artImage(`card-${w.id}`, "weapon-art")}<strong>${w.name}<small>${w.alias}</small></strong><span>${w.magazineSize} 发 <em>${w.pellets > 1 ? "× 8 弹丸" : `${Math.round(60 / w.fireDelay)} 发/分`}</em></span>`;
  button.onclick = () => {
    selectedWeapon = w.id;
    if (g.state === "station")
      g.changeLoadout(selectedWeapon, selectedUltimate);
    refreshLoadout();
  };
  $("weapon-picker").append(button);
}
for (const [id, u] of Object.entries(ULTIMATES)) {
  const button = document.createElement("button");
  button.dataset.ultimate = id;
  button.innerHTML = `${artImage(`icon-${id}`, "skill-art")}<strong>${id === "pulse" ? "◎" : id === "ricochet" ? "⋙" : "⛨"} ${u.name}</strong><small>${u.description}</small>`;
  button.onclick = () => {
    selectedUltimate = id;
    if (g.state === "station")
      g.changeLoadout(selectedWeapon, selectedUltimate);
    refreshLoadout();
  };
  $("ultimate-picker").append(button);
}
refreshLoadout();
$("backpack").onclick = () => $("backpack-dialog").showModal();
$("backpack-close").onclick = () => $("backpack-dialog").close();
$("backpack-dialog").addEventListener("close", () => {
  const back = launchChoice && g.state === "menu";
  launchChoice = null;
  for (const b of [
    ...$("weapon-picker").children,
    ...$("ultimate-picker").children,
  ])
    b.disabled = false;
  $("loadout-launch").hidden = true;
  $("loadout-note").textContent = "";
  $("backpack-close").textContent = "完成";
  if (back) void openStart();
  else (g.state === "station" ? $("station-backpack") : $("start")).focus();
  sync();
});
$("mode-campaign").onclick = () => selectMode("campaign");
$("mode-endless").onclick = () => selectMode("endless");
$("mode-tutorial").onclick = () => selectMode("tutorial");
$("challenge-endless").onclick = () => {
  selectMode("endless");
  start();
};
async function openStart() {
  $("start-dialog").showModal();
  $("start-mode").textContent =
    selectedMode === "endless"
      ? "无尽模式"
      : selectedMode === "tutorial"
        ? "教学"
        : "闯关模式";
  $("start-continue").disabled = true;
  $("start-save-info").textContent = "正在读取进度…";
  await endless.ready;
  const save = selectedMode === "endless" ? endless.getResume() : null;
  $("start-continue").disabled = !save;
  $("start-save-info").textContent = save
    ? `第 ${save.data.wave} 波 · ${save.data.score} 分`
    : selectedMode === "endless"
      ? "暂无可继续的存档"
      : "此模式不保存中途进度";
}
function openLoadout(choice) {
  launchChoice = choice;
  if (choice === "continue") {
    const save = endless.getResume();
    if (!save) return;
    selectedWeapon = save.data.weaponId;
    selectedUltimate = save.data.ultimateId;
  }
  refreshLoadout();
  for (const b of [
    ...$("weapon-picker").children,
    ...$("ultimate-picker").children,
  ])
    b.disabled = choice === "continue";
  $("loadout-note").textContent =
    choice === "continue"
      ? "沿用存档装备与强化，进入后继续挑战。"
      : "选择本局武器与技能。";
  $("loadout-launch").hidden = false;
  $("backpack-close").textContent = "返回";
  $("start-dialog").close();
  $("backpack-dialog").showModal();
}
$("start").onclick = openStart;
$("start-close").onclick = () => $("start-dialog").close();
$("start-new").onclick = () => openLoadout("new");
$("start-continue").onclick = () => openLoadout("continue");
$("loadout-launch").onclick = async () => {
  const choice = launchChoice;
  $("loadout-launch").disabled = true;
  try {
    await renderer.art.ready;
    if (choice === "continue") {
      if (endless.resumeSaved()) {
        launchChoice = null;
        $("backpack-dialog").close();
        if (!portrait) g.resume();
        sync();
      }
    } else if (selectedMode === "tutorial") {
      launchChoice = null;
      $("backpack-dialog").close();
      $("tutorial-start").click();
    } else {
      await start();
      if (!$("backpack-dialog").open) launchChoice = null;
    }
  } finally {
    $("loadout-launch").disabled = false;
  }
};
$("restart").onclick = () =>
  g.tutorial ? $("tutorial-start").click() : start();
$("resume").onclick = () => {
  activity();
  if (!portrait && !endless.busy) {
    input.clear();
    g.resume();
    sync();
  }
};
$("pause").onclick = () => pause();
const openSettings = () => {
  input.clear();
  activity();
  settings();
  $("settings-dialog").showModal();
};
$("settings-open").onclick = openSettings;
$("pause-settings").onclick = openSettings;
$("settings-close").onclick = () => $("settings-dialog").close();
$("settings-dialog").addEventListener("cancel", (e) => {
  e.preventDefault();
  $("settings-dialog").close();
});
$("home").onclick = async () => {
  if (endless.active()) {
    await endless.saveExit();
    return;
  }
  input.clear();
  g.state = "menu";
  g.tutorial = null;
  sync();
};
$("vibration").onclick = () => {
  haptics.setEnabled(!haptics.enabled);
  write("vibration", haptics.enabled);
  settings();
};
$("sound").onclick = () => {
  soundEnabled = !soundEnabled;
  audio.setEnabled(soundEnabled);
  write("sound", soundEnabled);
  settings();
};
$("motion").onclick = () => {
  renderer.reduced = !renderer.reduced;
  write("reduced-motion", renderer.reduced);
  settings();
};
$("auto-fire").onclick = () => {
  autoFireEnabled = !autoFireEnabled;
  write("auto-fire", autoFireEnabled);
  settings();
  sync();
};
let lastWidth = innerWidth,
  lastOrientation = innerWidth > innerHeight;
function fit() {
  renderer.resize();
  const orientation = innerWidth > innerHeight;
  // Mobile browser chrome changes height mid-gesture; only actual layout rotation clears input.
  if (innerWidth !== lastWidth || orientation !== lastOrientation)
    input.clear();
  lastWidth = innerWidth;
  lastOrientation = orientation;
  portrait = matchMedia("(pointer:coarse)").matches && innerHeight > innerWidth;
  $("rotate").hidden = !portrait;
  if (portrait) g.pause();
  sync();
}
window.addEventListener("resize", fit);
window.addEventListener("orientationchange", () => {
  input.clear();
  requestAnimationFrame(fit);
});
window.visualViewport?.addEventListener("resize", fit);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) haptics.stop();
  if (document.hidden) {
    g.pause();
    input.clear();
    sync();
  }
  audio.setScene(g.state, document.hidden);
});
function sync() {
  endless?.observe();
  const state = g.state;
  audio.setScene(state, document.hidden);
  if (
    state !== lastState ||
    (state === "buff" && lastChoiceVersion !== g.choiceVersion)
  ) {
    lastChoiceVersion = g.choiceVersion;
    input.clear();
    lastState = state;
    $("menu").hidden = state !== "menu";
    $("hud").hidden = state === "menu";
    $("controls").hidden = state !== "playing";
    $("pause").hidden = !["playing", "paused"].includes(state);
    $("app").classList.toggle("playing", state !== "menu");
    $("footer").hidden = state !== "menu";
    $("modal").hidden = ["menu", "playing", "station", "ashes"].includes(state);
    $("station").hidden = state !== "station";
    $("victory-art").hidden = !["won", "lost"].includes(state);
    if (["won", "lost"].includes(state))
      $("victory-art").innerHTML = artImage(
        state === "won" ? "icon-victory" : "icon-defeat",
        "result-art",
      );
    $("modal").classList.toggle("victory", state === "won");
    $("challenge-endless").hidden = state !== "won" || !!g.tutorial;
    $("choices").replaceChildren();
    $("result-stats").replaceChildren();
    $("modal-actions").hidden = state === "buff";
    $("resume").hidden = state !== "paused";
    $("pause-settings").hidden = state !== "paused";
    $("restart").textContent = state === "paused" ? "重新开始" : "再战一局";
    if (state === "buff") {
      $("modal-eyebrow").textContent = `第 ${g.upgradeCount + 1} 次强化`;
      $("modal-title").textContent = "选择强化";
      $("modal-copy").textContent = "";
      for (const b of g.choices) {
        const btn = document.createElement("button");
        btn.className = "choice";
        btn.dataset.buff = b.id;
        btn.innerHTML = `<span class="buff-icon">${artImage(`icon-${b.id}`)}</span><strong>${b.name} <em>${b.item ? "道具" : g.stacks(b.id) ? `已获 ${g.stacks(b.id)} 层` : "未获得"}</em></strong><small>${buffDescription(b, g)}</small>`;
        const choose = () => {
          if (!g.chooseBuff(b.id)) return;
          input.clear();
          sync();
        };
        btn.onpointerdown = (e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          e.preventDefault();
          choose();
        };
        btn.onclick = (e) => {
          if (e.detail === 0) choose();
        };
        $("choices").append(btn);
      }
    }
    if (state === "paused") {
      $("modal-eyebrow").textContent = "";
      $("modal-title").textContent = "战斗已暂停";
      $("modal-copy").textContent = "";
    }
    if (state === "won" || state === "lost") {
      const win = state === "won";
      if (g.tutorial) {
        // Tutorial runs never write scores.
      } else if (g.mode === "endless") {
        bestEndless = Math.max(bestEndless, g.score);
        write("best-endless", bestEndless);
      } else {
        best = Math.max(best, g.score);
        write("best", best);
      }
      $("modal-eyebrow").textContent = "";
      $("modal-title").textContent = g.tutorial
        ? "教学完成"
        : win
          ? "闯关成功"
          : "挑战结束";
      $("modal-copy").textContent = win ? "" : `抵达第 ${g.wave} 波`;
      $("result-stats").innerHTML =
        `<div><small>本局得分</small>${g.score}</div><div><small>消灭目标</small>${g.kills}</div><div><small>战斗时间</small>${timeText(g.time)}</div>`;
    }
    if (!["playing", "menu"].includes(state))
      requestAnimationFrame(() => {
        const btn = $("modal").querySelector("button:not([hidden])");
        if ((btn && !$("modal-actions").hidden) || state === "buff")
          btn?.focus({ preventScroll: true });
      });
  }
  $("best-score").textContent = String(
    selectedMode === "endless" ? bestEndless : best,
  ).padStart(6, "0");
  $("hp-number").textContent = `${Math.ceil(g.player.hp)} / ${g.player.maxHp}`;
  $("hp-fill").style.width = `${(g.player.hp / g.player.maxHp) * 100}%`;
  $("wave-number").innerHTML =
    `${String(g.wave).padStart(2, "0")} <span>${g.mode === "endless" ? "/ ∞" : "/ 05"}</span>`;
  $("remaining-enemies").textContent = `剩余 ${g.remainingEnemies}`;
  $("dodge-status").textContent =
    g.ultimate?.kind === "charge"
      ? "冲锋中"
      : g.dodge.cooldown > 0
        ? `${g.dodge.cooldown.toFixed(1)}s`
        : "就绪";
  $("dodge").disabled =
    state !== "playing" ||
    g.dodge.cooldown > 0 ||
    g.ultimate?.kind === "charge";
  $("dodge").classList.toggle("ready", !$("dodge").disabled);
  $("dodge").style.setProperty(
    "--dodge-progress",
    `${(1 - g.dodge.cooldown / C.dodgeCooldown) * 360}deg`,
  );
  $("kills").textContent = String(g.kills).padStart(3, "0");
  $("time").textContent = timeText(g.time);
  const healing = g.player.hp < g.player.maxHp && g.unhurtTime >= C.regenDelay;
  $("regen").textContent =
    g.player.hp >= g.player.maxHp
      ? ""
      : healing
        ? `回血 +${C.regenRate}/秒`
        : `回血倒计时 ${Math.ceil(C.regenDelay - g.unhurtTime)} 秒`;
  $("regen").classList.toggle("active", healing);
  $("hp-fill").classList.toggle("recovering", healing);
  const canUpgrade = state === "playing" && g.points >= g.upgradeCost;
  $("upgrade-points").textContent = `${g.points} / ${g.upgradeCost}`;
  $("upgrade").classList.toggle("ready", canUpgrade);
  $("upgrade").classList.toggle("quiet", renderer.reduced);
  $("upgrade").setAttribute(
    "aria-label",
    `${canUpgrade ? "可强化" : "强化点数不足"}，现有 ${g.points} 点，需要 ${g.upgradeCost} 点`,
  );
  $("upgrade").hidden = state !== "playing";
  $("upgrade").disabled = !canUpgrade;
  for (let slot = 0; slot < 2; slot++) {
    const id = slot ? "item2" : "item",
      item = g.items[slot];
    $(id).hidden = !item;
    if (!item) continue;
    const spec = ITEMS[item.id];
    $(id + "-name").textContent = spec.name;
    $(id + "-ammo").textContent =
      `${spec.deploy ? `${spec.ammo} 台` : spec.drain ? `${(item.ammo / spec.drain).toFixed(1)} 秒` : `${item.ammo} 发`}${item.active ? " · 使用中" : touchControls.matches ? " · 使用" : slot ? " · G" : " · F"}`;
    $(id).classList.toggle("active", item.active);
    $(id).setAttribute(
      "aria-label",
      `${slot + 1}号槽 ${spec.name}${item.active ? " 使用中" : " 点击使用"}`,
    );
  }
  $("frenzy").hidden = !g.player.frenzyPower;
  $("frenzy").textContent =
    `狂热 ${Math.floor(g.frenzy)} / 60${g.frenzyIdle > 4 && g.reloadLeft <= 0 && g.frenzy > 0 ? " ↓" : ""}`;
  $("frenzy").classList.toggle("full", g.frenzy >= 60);
  $("tutorial-bar").hidden =
    !g.tutorial || ["menu", "won", "lost"].includes(state);
  if (g.tutorial) $("tutorial-goal").textContent = lessonText(g);
  $("event-toast").hidden = !g.toast && !g.oneHit;
  $("event-toast").textContent = g.oneHit
    ? `一击即倒 ${g.oneHit.toFixed(1)} 秒`
    : g.toast?.text || "";
  if (state === "station") refreshStation();
  const u = g.ultimate,
    spec = ULTIMATES[g.ultimateId];
  $("weapon-name").textContent = g.weapon.name;
  $("pulse-wrap").hidden = g.ultimateId !== "pulse";
  $("ultimate").hidden = g.ultimateId === "pulse";
  $("controls").classList.toggle("equipped-ultimate", g.ultimateId !== "pulse");
  $("ultimate-name").textContent = spec.name;
  $("tar-action-art").hidden = false;
  $("tar-action-art").src = artUrl("icon-" + g.ultimateId);
  $("ultimate-status").textContent = u
    ? u.kind === "ricochet"
      ? `${u.ammo} 发`
      : `能量 ${Math.ceil(Math.max(0, u.energy))}`
    : g.ultCharge >= ULT_KILLS
      ? touchControls.matches
        ? "就绪"
        : "就绪 Q"
      : `${g.ultCharge} / ${ULT_KILLS} 杀`;
  $("ultimate-fill").style.width =
    `${100 * (u ? (u.kind === "ricochet" ? u.ammo / spec.ammo : Math.max(0, u.energy) / spec.energy) : g.ultCharge / ULT_KILLS)}%`;
  $("ultimate").classList.toggle("active", !!u);
  $("ultimate").classList.toggle("ready", !u && g.ultCharge >= ULT_KILLS);
  if (g.ultimateId === "tar") {
    $("ultimate-status").textContent =
      `${g.tar.active ? "关闭" : "开启"} · ${Math.floor(g.tar.energy)}%${touchControls.matches ? "" : " Q"}`;
    $("ultimate-fill").style.width = `${g.tar.energy}%`;
    $("ultimate").classList.toggle("active", g.tar.active);
    $("ultimate").classList.toggle("ready", !g.tar.active && g.tar.energy > 0);
  }
  $("ultimate").style.setProperty(
    "--energy-level",
    $("ultimate-fill").style.width,
  );
  $("ultimate").setAttribute(
    "aria-label",
    `${spec.name}，${$("ultimate-status").textContent}`,
  );
  $("reload").disabled = !!u;
  $("attack").classList.toggle("ultimate-active", !!u);
  $("ammo").textContent = `${g.player.ammo} / ${g.player.magazineSize}`;
  $("reload-text").textContent = u
    ? "大招进行中"
    : g.reloadLeft > 0
      ? `换弹 ${g.reloadLeft.toFixed(1)}s`
      : touchControls.matches
        ? "换弹 · 备弹 ∞"
        : "换弹 R · 备弹 ∞";
  $("reload").classList.toggle("reloading", g.reloadLeft > 0);
  $("reload").setAttribute(
    "aria-label",
    g.reloadLeft > 0
      ? `正在换弹，剩余 ${g.reloadLeft.toFixed(1)} 秒`
      : `换弹，剩余 ${g.player.ammo} 发，无限备弹`,
  );
  $("reload-fill").style.width =
    `${g.reloadLeft > 0 ? (1 - g.reloadLeft / g.reloadTotal) * 100 : (g.player.ammo / g.player.magazineSize) * 100}%`;
  $("attack").classList.toggle("reloading", g.reloadLeft > 0);

  $("pulse").classList.toggle("cooling", g.pulseCd > 0);
  $("pulse").style.setProperty(
    "--pulse-ready",
    `${100 * (1 - g.pulseCd / g.player.pulseCooldown)}%`,
  );
  $("pulse-label").textContent =
    g.pulseCd > 0 ? `${g.pulseCd.toFixed(1)} s` : "冲击波";
  $("pulse").setAttribute(
    "aria-label",
    g.pulseCd > 0 ? `冲击波冷却 ${Math.ceil(g.pulseCd)} 秒` : "释放冲击波",
  );
  const key = g.buffs.join(",");
  if (lastBuffs !== key) {
    lastBuffs = key;
    $("buff-tags").innerHTML = [...new Set(g.buffs)]
      .map(
        (id) =>
          `<span>${BUFFS.find((b) => b.id === id).name} ×${g.stacks(id)}</span>`,
      )
      .join("");
  }
  const boss = g.enemies.find((e) => e.type === "boss" && e.hp > 0);
  $("boss-hud").hidden = !boss || state !== "playing";
  if (boss) {
    $("boss-hud").classList.toggle("tree", boss.bossKind === "tree");
    $("boss-name").textContent =
      boss.bossKind === "tree" ? "♧ 树妖" : "Ω 裂隙守卫";
    $("boss-fill").style.width = `${(boss.hp / boss.maxHp) * 100}%`;
    $("boss-phase").textContent = boss.hp <= boss.maxHp / 2 ? "狂暴" : "";
  }
  $("banner").hidden = state !== "playing" || g.banner <= 0;
  $("banner-small").textContent = g.isBossWave()
    ? g.mode === "endless"
      ? "Boss 来袭"
      : "最终 Boss"
    : g.mode === "endless"
      ? `无尽模式${g.wave > 8 && g.wave % 8 === 1 ? " · 缓冲波" : ""}`
      : "闯关模式";
  $("banner-title").textContent = g.isBossWave()
    ? boss?.bossKind === "tree"
      ? "树妖"
      : "裂隙守卫"
    : `第 ${g.wave} 波`;
}
function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  accumulator += dt;
  const controls = input.sample();
  controls.autoFire = autoFireEnabled && !g.tutorial;
  while (accumulator >= 1 / 120) {
    g.update(1 / 120, controls);
    accumulator -= 1 / 120;
  }
  haptics.setPlaying(g.state === "playing" && !document.hidden);
  for (const e of g.events.splice(0)) {
    audio.play(e, g.weaponId);
    haptics.play(e);
  }
  renderer.draw(g, now / 1000);
  hudTime += dt;
  if (hudTime >= 0.1 || lastState !== g.state) {
    sync();
    hudTime = 0;
  }
  requestAnimationFrame(frame);
}
// Development-only hooks for deterministic browser QA; eliminated from production.
if (import.meta.env.DEV)
  window.__NEON__ = { game: g, input, audio, haptics, renderer, sync, start };
endless = setupEndless({
  game: g,
  input,
  sync,
  onRestore: () => {
    selectedMode = "endless";
    selectedWeapon = g.weaponId;
    selectedUltimate = g.ultimateId;
    selectMode("endless");
    refreshLoadout();
    lastState = "";
    accumulator = 0;
  },
});
// Try autoplay on entry; trusted interaction resumes a browser-suspended context.
audio.setEnabled(soundEnabled);
document.addEventListener("pointerdown", activity, {
  capture: true,
  passive: true,
});
document.addEventListener("keydown", activity, { capture: true });
settings();
fit();
sync();
setupLandscape(window, document, () => requestAnimationFrame(fit));
requestAnimationFrame(frame);

setupIntro();
const checkAnnouncement = setupAnnouncement(g);
setInterval(checkAnnouncement, 250);
