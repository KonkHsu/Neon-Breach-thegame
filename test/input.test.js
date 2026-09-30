import test from "node:test";
import assert from "node:assert/strict";
import { Input } from "../src/input.js";

function setup(onDodge = () => {}) {
  const previousWindow = globalThis.window;
  const win = new EventTarget();
  globalThis.window = win;
  const element = () => new EventTarget();
  const input = new Input({
    canvas: element(),
    joystick: element(),
    moveZone: element(),
    knob: element(),
    attack: element(),
    pulse: element(),
    reload: element(),
    ultimate: element(),
    upgrade: element(),
    item: element(),
    onDodge,
    onUpgrade() {},
    onItem() {},
    onUltimate() {},
    onReload() {},
    onPulse() {},
    onPause() {},
    onActivity() {},
    isPlaying: () => true,
  });
  function key(type, code, value = code, repeat = false) {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, {
      repeat: { value: repeat },
      code: { value: code },
      key: { value },
    });
    win.dispatchEvent(event);
    return event;
  }
  return { input, key, restore: () => (globalThis.window = previousWindow) };
}

test("every WASD diagonal moves in its expected direction and releases cleanly", () => {
  const { input, key, restore } = setup();
  try {
    for (const [first, second, x, y] of [
      ["KeyW", "KeyA", -1, -1],
      ["KeyA", "KeyS", -1, 1],
      ["KeyD", "KeyS", 1, 1],
      ["KeyW", "KeyD", 1, -1],
    ]) {
      assert.equal(key("keydown", first).defaultPrevented, true);
      assert.equal(key("keydown", second).defaultPrevented, true);
      const sample = input.sample();
      assert.equal(Math.sign(sample.x), x);
      assert.equal(Math.sign(sample.y), y);
      assert.ok(Math.abs(Math.hypot(sample.x, sample.y) - 1) < 1e-9);
      key("keyup", second);
      key("keyup", first);
      assert.deepEqual(input.sample(), { x: 0, y: 0, fire: false });
    }
  } finally {
    restore();
  }
});

test("embedded browsers without a usable code can use key for movement", () => {
  const { input, key, restore } = setup();
  try {
    key("keydown", "Unidentified", "a");
    key("keydown", undefined, "S");
    assert.ok(input.sample().x < 0 && input.sample().y > 0);
    key("keyup", "Unidentified", "a");
    key("keyup", undefined, "S");
    assert.deepEqual(input.sample(), { x: 0, y: 0, fire: false });
  } finally {
    restore();
  }
});

test("hidden consumable releases pointer ownership through window", () => {
  const { input, restore } = setup();
  try {
    input.pointers.set(91, "item2");
    const event = new Event("pointerup");
    Object.defineProperty(event, "pointerId", { value: 91 });
    window.dispatchEvent(event);
    assert.equal(input.pointers.size, 0);
  } finally {
    restore();
  }
});

test("Shift triggers once, supports either side, and keeps held movement/fire", () => {
  let calls = 0;
  const { input, key, restore } = setup(() => calls++);
  try {
    key("keydown", "KeyW");
    key("keydown", "Space");
    key("keydown", "ShiftLeft");
    key("keydown", "ShiftLeft", "Shift", true);
    assert.equal(calls, 1);
    assert.equal(input.sample().y, -1);
    assert.equal(input.sample().fire, true);
    key("keyup", "ShiftLeft");
    key("keydown", "ShiftRight");
    assert.equal(calls, 2);
    input.clear();
    assert.equal(input.sample().y, 0);
    assert.equal(input.sample().fire, false);
  } finally {
    restore();
  }
});
