import { assetUrl } from "./asset-url.js";
export function setupIntro() {
  const screen = document.createElement("div");
  screen.className = "intro-screen";
  screen.setAttribute("role", "dialog");
  screen.setAttribute("aria-label", "霓虹突破开场");
  screen.innerHTML =
    '<img src="' +
    assetUrl("intro.svg") +
    '" alt="霓虹突破"><button type="button">跳过</button>';
  const app = document.getElementById("app");
  app.inert = true;
  document.body.append(screen);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    app.inert = false;
    screen.remove();
    document.removeEventListener("keydown", key, true);
  };
  const key = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (["Escape", "Enter", " "].includes(e.key)) close();
  };
  document.addEventListener("keydown", key, true);
  screen.querySelector("button").onclick = close;
  screen.querySelector("img").onerror = close;
  const timer = setTimeout(
    close,
    matchMedia("(prefers-reduced-motion: reduce)").matches ? 800 : 5000,
  );
}
