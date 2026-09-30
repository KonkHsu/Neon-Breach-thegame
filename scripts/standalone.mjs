import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const assets = {};
const types = { '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml', '.wav':'audio/wav', '.txt':'text/plain;charset=utf-8' };
async function collect(dir, prefix = '') {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const key = prefix + entry.name;
    if (entry.isDirectory()) await collect(resolve(dir, entry.name), key + '/');
    else assets[key] = `data:${types[extname(entry.name)] || 'application/octet-stream'};base64,${(await readFile(resolve(dir, entry.name))).toString('base64')}`;
  }
}
await collect(resolve(root, 'public'));
let html = await readFile(resolve(root, 'dist/index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g)];
let code = '';
for (const match of scripts) {
  code += await readFile(resolve(root, 'dist', match[1]), 'utf8');
  html = html.replace(match[0], '');
}
for (const match of [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)]) {
  const css = await readFile(resolve(root, 'dist', match[1]), 'utf8');
  html = html.replace(match[0], () => `<style>${css}</style>`);
}
html = html.replace('./favicon.svg', assets['favicon.svg']);
// Blob URL keeps the original credits link usable in a local file browser.
code = `globalThis.__NEON_ASSETS__=${JSON.stringify(assets)};\n` + code + `\nfetch(globalThis.__NEON_ASSETS__['licenses/NOTICE.txt']).then(r=>r.blob()).then(b=>{document.querySelector('#footer a').href=URL.createObjectURL(b)});`;
html = html.replace('</body>', () => `<script>${code.replace(/<\/script/gi, '<\\/script')}</script></body>`);
await writeFile(resolve(root, '霓虹突破.html'), html);
console.log('已生成可直接双击、离线运行的 霓虹突破.html');
