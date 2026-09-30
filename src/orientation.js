// Native browser orientation; unsupported devices retain the original rotate hint.
export function setupLandscape(win = window, doc = document, onChange = () => {}) {
  let disposed = false, pending = false, locked = false;
  async function request() {
    if (disposed || pending || locked || !win.screen?.orientation?.lock) return;
    pending = true;
    try { await win.screen.orientation.lock("landscape"); locked = true; }
    catch { /* Physical rotation remains available. */ }
    finally { pending = false; }
  }
  const changed = () => onChange({ orientation: win.screen?.orientation?.type });
  win.screen?.orientation?.addEventListener?.("change", changed);
  doc.addEventListener("pointerup", request, { once: true, passive: true });
  void request();
  return () => {
    disposed = true;
    doc.removeEventListener("pointerup", request);
    win.screen?.orientation?.removeEventListener?.("change", changed);
  };
}
