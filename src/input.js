// Separate pointer ownership follows Zombie Orb Arena; normalized deadzone
// response is inspired by canvas-vampire-survivors. See SOURCES.md.
const MOVE_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowLeft",
  "ArrowDown",
  "ArrowRight",
]);
const GAME_KEYS = new Set([
  ...MOVE_KEYS,
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "KeyE",
  "KeyQ",
  "KeyR",
  "KeyF",
  "KeyG",
  "KeyU",
]);

function keyboardCode(e) {
  if (e.code && e.code !== "Unidentified") return e.code;
  if (e.key === " " || e.key === "Spacebar") return "Space";
  if (/^[a-z]$/i.test(e.key || "")) return `Key${e.key.toUpperCase()}`;
  return e.key;
}

export class Input {
  constructor({
    canvas,
    joystick,
    moveZone,
    knob,
    dodge,
    onDodge,
    attack,
    pulse,
    reload,
    ultimate,
    upgrade,
    onUpgrade,
    onItem,
    item,
    item2,
    onUltimate,
    onReload,
    onPulse,
    onPause,
    onActivity,
    isPlaying,
  }) {
    Object.assign(this, {
      canvas,
      joystick,
      moveZone,
      knob,
      attack,
      pulse,
      reload,
      ultimate,
      upgrade,
      onUpgrade,
      onItem,
      item,
      onUltimate,
      onReload,
      onPulse,
      onPause,
      onActivity,
      isPlaying,
    });
    this.keys = new Set();
    this.pointers = new Map();
    this.x = 0;
    this.y = 0;
    this.mouse = false;
    const bind = (el, role) => {
      el.addEventListener("pointerdown", (e) => {
        if (
          !isPlaying() ||
          el.disabled ||
          (e.pointerType === "mouse" && e.button !== 0) ||
          [...this.pointers.values()].includes(role)
        )
          return;
        e.preventDefault();
        onActivity();
        el.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, role);
        if (role === "joy") {
          this.origin = { x: e.clientX, y: e.clientY };
          this.radius = joystick.getBoundingClientRect().width * 0.34;
          joystick.classList.add("floating");
          this.positionJoystick();
          this.move(e);
        }
        if (role === "dodge") onDodge();
        if (role === "pulse") onPulse();
        if (role === "ultimate") onUltimate();
        if (role === "reload") onReload();
        if (role === "item") onItem(0);
        if (role === "item2") onItem(1);
        if (role === "upgrade") onUpgrade();
      });
      el.addEventListener("pointermove", (e) => {
        if (this.pointers.get(e.pointerId) === "joy") this.move(e);
      });
      for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
        el.addEventListener(name, (e) => this.release(e.pointerId));
    };
    bind(moveZone, "joy");
    bind(attack, "attack");
    if (dodge) bind(dodge, "dodge");
    dodge?.addEventListener("click", (e) => {
      if (e.detail === 0 && isPlaying()) onDodge();
    });
    bind(pulse, "pulse");
    bind(reload, "reload");
    bind(ultimate, "ultimate");
    bind(item, "item");
    if (item2) bind(item2, "item2");
    bind(upgrade, "upgrade");
    upgrade.addEventListener("click", (e) => {
      if (e.detail === 0 && isPlaying()) {
        onActivity();
        onUpgrade();
      }
    });
    item.addEventListener("click", (e) => {
      if (e.detail === 0 && isPlaying()) onItem();
    });
    item2?.addEventListener("click", (e) => {
      if (e.detail === 0 && isPlaying()) onItem(1);
    });
    ultimate.addEventListener("click", (e) => {
      if (e.detail === 0 && isPlaying()) {
        onActivity();
        onUltimate();
      }
    });
    // Pointer gestures fire on down; keyboard/assistive activation still uses click.
    reload.addEventListener("click", (e) => {
      if (e.detail === 0 && isPlaying()) {
        onActivity();
        onReload();
      }
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button === 0 && isPlaying()) {
        this.mouse = true;
        canvas.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, "mouse");
        onActivity();
      }
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
      canvas.addEventListener(name, (e) => this.release(e.pointerId));
    // A consumed item hides its button while the finger is still down. The
    // release can be retargeted to the window instead of that hidden button.
    for (const name of ["pointerup", "pointercancel"])
      window.addEventListener(name, (e) => this.release(e.pointerId));
    window.addEventListener("keydown", (e) => {
      const code = keyboardCode(e);
      if (code === "Escape" && !e.repeat) {
        onPause();
        return;
      }
      if (!isPlaying()) return;
      if (GAME_KEYS.has(code)) e.preventDefault();
      this.keys.add(code);
      if (
        (code === "ShiftLeft" || code === "ShiftRight" || code === "Shift") &&
        !e.repeat
      )
        onDodge?.();
      if (code === "KeyU" && !e.repeat) onUpgrade();
      if (code === "KeyF" && !e.repeat) onItem(0);
      if (code === "KeyG" && !e.repeat) onItem(1);
      if (code === "KeyQ" && !e.repeat) onUltimate();
      if (code === "KeyE" && !e.repeat) onPulse();
      if (code === "KeyR" && !e.repeat) onReload();
      onActivity();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(keyboardCode(e)));
    window.addEventListener("blur", () => {
      this.clear();
      onPause(true);
    });
  }
  positionJoystick() {
    this.joystick.style.left = `${this.origin.x}px`;
    this.joystick.style.top = `${this.origin.y}px`;
  }
  move(e) {
    if (!this.origin) return;
    const radius = this.radius;
    let dx = e.clientX - this.origin.x,
      dy = e.clientY - this.origin.y;
    const d = Math.hypot(dx, dy);
    // The base follows excess travel, so reversing never requires crossing a distant origin.
    if (d > radius) {
      this.origin.x += dx * (1 - radius / d);
      this.origin.y += dy * (1 - radius / d);
      dx *= radius / d;
      dy *= radius / d;
      this.positionJoystick();
    }
    const mag = Math.min(1, d / radius);
    const live = mag < 0.12 ? 0 : (mag - 0.12) / 0.88;
    this.x = d ? (dx / radius / (mag || 1)) * live : 0;
    this.y = d ? (dy / radius / (mag || 1)) * live : 0;
    this.knob.style.transform = `translate(${dx}px,${dy}px)`;
  }
  release(id) {
    const role = this.pointers.get(id);
    this.pointers.delete(id);
    if (role === "joy") {
      this.x = this.y = 0;
      this.knob.style.transform = "";
      this.origin = null;
      this.joystick.classList.remove("floating");
      this.joystick.style.left = "";
      this.joystick.style.top = "";
    }
    if (role === "mouse") this.mouse = false;
  }
  clear() {
    this.keys.clear();
    for (const id of [...this.pointers.keys()]) this.release(id);
    this.mouse = false;
    this.x = this.y = 0;
  }
  sample() {
    let x = this.x,
      y = this.y;
    const k = this.keys;
    if (k.has("KeyA") || k.has("ArrowLeft")) x -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) x += 1;
    if (k.has("KeyW") || k.has("ArrowUp")) y -= 1;
    if (k.has("KeyS") || k.has("ArrowDown")) y += 1;
    const len = Math.max(1, Math.hypot(x, y));
    return {
      x: x / len,
      y: y / len,
      fire:
        this.mouse ||
        k.has("Space") ||
        [...this.pointers.values()].includes("attack"),
    };
  }
}
