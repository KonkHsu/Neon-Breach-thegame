export const assetUrl = (path) => globalThis.__NEON_ASSETS__?.[path] || new URL(import.meta.env.BASE_URL + path, document.baseURI).href;
