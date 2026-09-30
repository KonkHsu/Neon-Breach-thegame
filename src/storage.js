const memory = {};
export function read(key, fallback) {
  try {
    const v = localStorage.getItem("neon-breach-web:" + key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return memory[key] ?? fallback;
  }
}
export function write(key, value) {
  memory[key] = value;
  try {
    localStorage.setItem("neon-breach-web:" + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
