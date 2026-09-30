import { read, write } from "./storage.js";
import {
  checkpoint,
  restoreCheckpoint,
  resultRecord,
  mergeRecords,
  validateCheckpoint,
} from "./endless-save.js";
import { BrowserService, errorText } from "./browser-service.js";
const uid = () => globalThis.crypto?.randomUUID?.() ||
  Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, "0")).join("-");
const $ = (id) => document.getElementById(id);
const formatTime = (t) => `${Math.floor(t / 60)}分${Math.floor(t % 60)}秒`;
const detail = (r) =>
  `${r.score} 分 · 第 ${r.wave} 波 · ${r.kills} 击杀 · ${formatTime(r.time)}`;
const date = (t) => new Date(t).toLocaleString("zh-CN");

export function setupEndless({ game: g, input, sync, onRestore }) {
  const host = document.createElement("div");
  host.innerHTML = `  <dialog id="endless-confirm" aria-labelledby="endless-confirm-title"><h2 id="endless-confirm-title">放弃原进度？</h2><p>新开一局会替换未完成的无尽挑战。</p><div class="endless-tools"><button id="endless-cancel" class="secondary">保留进度</button><button id="endless-discard" class="primary">放弃并新开</button></div></dialog>`;
  document.body.append(host);
  const button = (id, text, parent) => {
    const b = document.createElement("button");
    b.id = id;
    b.className = "secondary";
    b.textContent = text;
    parent.append(b);
    return b;
  };
  button(
    "endless-sync-progress",
    "重试进度同步",
    document.querySelector(".menu-extras"),
  );
  button(
    "endless-continue",
    "继续无尽挑战",
    document.querySelector(".menu-extras"),
  );
  const hint = document.createElement("p");
  hint.id = "endless-save-hint";
  hint.className = "endless-save-hint";
  document.querySelector(".menu-extras").after(hint);
  button("endless-save-exit", "保存并退出", $("modal-actions"));
  button(
    "endless-station-exit",
    "保存并退出",
    $("station-continue").parentElement,
  );
  const status = document.createElement("p");
  status.id = "endless-status";
  status.className = "endless-status";
  status.setAttribute("role", "status");
  $("result-stats").after(status);
  button("endless-retry", "重试保存 / 更新排名", $("modal-actions"));
  let service = new BrowserService(),
    connected = false,
    epoch = 0,
    run = null,
    restoring = false,
    pending = null,
    revision = 0;
  let guestSave = read("endless-guest-checkpoint", null),
    cloudSave = null,
    cloudBroken = false;
  let archive = { best: null, recent: [] },
    account = "正在检查本机连接…",
    profile = null,
    tab = "public";
  let chain = Promise.resolve(),
    timer = null,
    checkpointStatus = "",
    recordStatus = "",
    scoreStatus = "",
    finished = null,
    viewVersion = 0,
    connecting = false;
  let savingExit = false;
  let localArchive = mergeRecords(
    read("endless-guest-records", { best: null, recent: [] }),
    null,
  );
  const active = () =>
    run &&
    !run.finished &&
    g.mode === "endless" &&
    !g.tutorial &&
    g.state !== "menu";
  const eligible = () => run?.cloud && connected && run.epoch === epoch;
  function saveCandidate() {
    return run &&
      !run.finished &&
      run.cloud === connected &&
      (!run.cloud || run.epoch === epoch)
      ? run.checkpoint
      : connected
        ? cloudSave
        : guestSave;
  }
  function notify() {
    $("endless-sync-progress").hidden = !pending || !eligible();
    const save = saveCandidate();
    $("endless-continue").hidden = !save || active();
    $("endless-save-hint").textContent = save
      ? `${connected ? "本机" : "本机"}进度 · 第 ${save.data?.wave ?? "?"} 波 · ${save.data?.score ?? "?"} 分 · ${date(save.savedAt)}，从检查点继续。${checkpointStatus}`
      : checkpointStatus;
    $("endless-status").textContent = [
      checkpointStatus,
      recordStatus,
      scoreStatus,
    ]
      .filter(Boolean)
      .join(" · ");
    $("endless-retry").hidden =
      !finished?.cloud ||
      !connected ||
      finished.epoch !== epoch ||
      (finished.saved && finished.cleared);
  }
  function enqueue(work) {
    const e = epoch;
    const next = chain
      .catch(() => {})
      .then(() => {
        if (e !== epoch) throw Error("账号连接已变化，请重新读取");
        return work();
      });
    chain = next;
    return next;
  }
  function storeLocal(save) {
    const ok = write(
      run.cloud ? "endless-account-checkpoint" : "endless-guest-checkpoint",
      save,
    );
    if (!run.cloud) guestSave = save;
    checkpointStatus = ok
      ? "已保存本机检查点"
      : "浏览器无法持久保存进度，请勿关闭页面";
    return ok;
  }
  async function flush() {
    clearTimeout(timer);
    timer = null;
    const save = pending;
    pending = null;
    if (!save || !eligible()) return;
    const currentRun = run;
    try {
      await enqueue(() => service.writeCheckpoint(save));
      if (run === currentRun && !currentRun.finished) {
        if (pending && pending.revision <= save.revision) pending = null;
        cloudSave = save;
        checkpointStatus = "检查点已同步本机";
      }
    } catch (e) {
      if (run === currentRun && !currentRun.finished) {
        if (!pending || pending.revision < save.revision) pending = save;
        checkpointStatus = `已保留本机，本机未同步：${errorText(e)}`;
      }
    }
    notify();
  }
  function capture() {
    if (restoring || !active() || !["playing", "station"].includes(g.state))
      return;
    try {
      const save = checkpoint(g, run.id, ++revision);
      run.checkpoint = save;
      storeLocal(save);
      if (eligible()) {
        pending = save;
        clearTimeout(timer);
        timer = setTimeout(() => void flush(), g.state === "station" ? 650 : 0);
      }
    } catch (e) {
      checkpointStatus = e.message;
    }
    notify();
  }
  // Capture synchronously at boundaries, before the next simulation tick.
  for (const method of [
    "nextWave",
    "enterStation",
    "leaveStation",
    "changeLoadout",
    "buyItem",
    "chooseBuff",
  ]) {
    const original = g[method];
    g[method] = function (...args) {
      const value = original.apply(this, args);
      if (
        method === "nextWave" ||
        method === "leaveStation" ||
        (g.state === "station" && value !== false)
      )
        capture();
      return value;
    };
  }
  async function connect() {
    if (active() || connecting) return;
    connecting = true;
    await chain.catch(() => {});
    clearTimeout(timer);
    pending = null;
    run = null;
    epoch++;
    connected = false;
    profile = null;
    cloudSave = null;
    cloudBroken = false;
    archive = { best: null, recent: [] };
    finished = null;
    service = new BrowserService();
    account = "正在读取本机战绩…";
    notify();
    try {
      archive = await service.readArchive();
      connected = true;
      try {
        cloudSave = await service.readCheckpoint();
      } catch (e) {
        cloudBroken = true;
        checkpointStatus = `无法读取本机进度：${errorText(e)}`;
      }
      account = "独立网页版 · 进度和战绩自动保存在当前浏览器";
    } catch (e) {
      account = errorText(e);
    }
    connecting = false;
    notify();
  }
  function confirmDiscard() {
    return new Promise((resolve) => {
      const dialog = $("endless-confirm");
      dialog.showModal();
      let yes = false;
      $("endless-discard").onclick = () => {
        yes = true;
        dialog.close();
      };
      $("endless-cancel").onclick = () => dialog.close();
      dialog.addEventListener("close", () => resolve(yes), { once: true });
    });
  }
  async function prepareStart(mode) {
    if (savingExit) return false;
    if (connecting) {
      await initialConnect;
      if (connecting) return false;
    }
    if (mode !== "endless") {
      await flush();
      run = null;
      finished = null;
      recordStatus = scoreStatus = "";
      notify();
      return true;
    }
    if (cloudBroken) {
      checkpointStatus = "请重新读取并读取本机进度后再开始，避免覆盖原存档";
      notify();
      return false;
    }
    const old = (!run?.finished && run?.checkpoint) || saveCandidate();
    if (old) {
      if (!(await confirmDiscard())) return false;
    }
    await flush();
    await chain.catch(() => {});
    if (old && connected) {
      try {
        await service.finishCheckpoint(old.runId);
      } catch (e) {
        checkpointStatus = `无法放弃本机旧进度：${errorText(e)}`;
        notify();
        return false;
      }
    }
    if (connected) cloudSave = null;
    else {
      guestSave = null;
      write("endless-guest-checkpoint", null);
    }
    finished = null;
    recordStatus = "";
    scoreStatus = "";
    checkpointStatus = "";
    revision = 0;
    run = { id: uid(), cloud: connected, epoch, finished: false };
    notify();
    return true;
  }
  $("endless-continue").onclick = () => {
    const save = saveCandidate();
    if (!save) return;
    try {
      validateCheckpoint(save);
      restoring = true;
      restoreCheckpoint(g, save);
      revision = save.revision;
      run = {
        id: save.runId,
        cloud: connected,
        epoch,
        checkpoint: save,
        finished: false,
      };
      finished = null;
      recordStatus = "";
      scoreStatus = "";
      input.clear();
      onRestore();
      sync();
    } catch (e) {
      checkpointStatus = `无法恢复：${errorText(e)}`;
    } finally {
      restoring = false;
      notify();
    }
  };
  async function saveExit() {
    if (!active() || savingExit) return false;
    savingExit = true;
    if (g.state === "station") capture();
    else g.pause();
    input.clear();
    sync();
    await flush();
    await chain.catch(() => {});
    savingExit = false;
    g.state = "menu";
    sync();
    notify();
    return true;
  }
  $("endless-sync-progress").onclick = () => void flush();
  $("endless-save-exit").onclick = () => void saveExit();
  $("endless-station-exit").onclick = () => void saveExit();
  async function uploadResult() {
    const f = finished;
    if (!f || !connected || f.epoch !== epoch || f.busy) return;
    f.busy = true;
    const savePromise = enqueue(async () => {
      if (!f.cleared) {
        await service.finishCheckpoint(f.record.id);
        f.cleared = true;
      }
      if (!f.saved) {
        const next = await service.writeRecord(f.record);
        f.saved = true;
        if (finished === f) archive = next;
      }
    }).then(
      () => {
        if (finished === f && f.epoch === epoch) {
          recordStatus = "本机战绩已保存";
          cloudSave = null;
        }
      },
      (e) => {
        if (finished === f && f.epoch === epoch)
          recordStatus = `本机战绩未同步：${errorText(e)}`;
      },
    );
    chain = savePromise;
    await chain;
    f.busy = false;
    notify();
  }
  $("endless-retry").onclick = () => void uploadResult();
  function observe() {
    status.hidden =
      g.mode !== "endless" ||
      !!g.tutorial ||
      !["paused", "won", "lost"].includes(g.state);
    const ended =
      ["won", "lost"].includes(g.state) && g.mode === "endless" && !g.tutorial;
    $("endless-save-exit").hidden = !(g.state === "paused" && active());
    $("endless-station-exit").hidden = !active();
    if (ended && run && !run.finished) {
      run.finished = true;
      clearTimeout(timer);
      pending = null;
      const record = resultRecord(g, run.id);
      write(
        run.cloud ? "endless-account-checkpoint" : "endless-guest-checkpoint",
        null,
      );
      checkpointStatus = "";
      if (run.cloud) {
        cloudSave = null;
        write("endless-account-last-result", record);
      } else {
        guestSave = null;
        localArchive = mergeRecords(localArchive, record);
        write("endless-guest-records", localArchive);
      }
      recordStatus = "本局战绩已保留本机";
      if (eligible()) {
        finished = {
          record,
          cloud: true,
          epoch,
          saved: false,
          cleared: false,
        };
        void uploadResult();
      }
      notify();
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && active()) {
      if (run.checkpoint) storeLocal(run.checkpoint);
      void flush();
    }
  });
  const initialConnect = connect();
  notify();
  return {
    prepareStart,
    saveExit,
    observe,
    active,
    closeDialog() { return false; },
    get busy() {
      return savingExit;
    },
    getResume() {
      return saveCandidate();
    },
    resumeSaved() {
      $("endless-continue").click();
      return g.state === "paused";
    },
    ready: initialConnect,
  };
}
