import { ANNOUNCEMENT, announcementState } from "./announcement.js";
import { read, write } from "./storage.js";
export function setupAnnouncement(game) {
  const state = announcementState(read, write),
    dialog = document.createElement("dialog");
  dialog.id = "announcement-dialog";
  dialog.setAttribute("aria-labelledby", "announcement-title");
  const heading = document.createElement("h2");
  heading.id = "announcement-title";
  heading.textContent = ANNOUNCEMENT.title;
  const version = document.createElement("small");
  version.textContent = ANNOUNCEMENT.version;
  const intro = document.createElement("p");
  intro.textContent = ANNOUNCEMENT.intro;
  const list = document.createElement("ul");
  for (const text of ANNOUNCEMENT.lines) {
    const li = document.createElement("li");
    li.textContent = text;
    list.append(li);
  }
  const body = document.createElement("div");
  body.className = "announcement-body";
  body.append(intro, list);
  const button = document.createElement("button");
  button.className = "primary";
  button.textContent = "知道了";
  button.onclick = () => {
    state.acknowledge();
    dialog.close();
  };
  dialog.append(version, heading, body, button);
  document.querySelector("#app").append(dialog);
  dialog.addEventListener("cancel", (e) => e.preventDefault());
  const clear = () =>
    game.state === "menu" &&
    !document.hidden &&
    !document.querySelector(".intro-screen, dialog[open]");
  document.querySelector("#announcement-open").onclick = () => {
    if (clear()) dialog.showModal();
  };
  return () => {
    if (state.pending() && clear()) dialog.showModal();
  };
}
