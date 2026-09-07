import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse, serializeOuter } from 'parse5';
import { createHash } from 'node:crypto';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';

const root = resolve(process.argv[2] || '.');
const origin = 'https://shifter.co';
const failures = [];
const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
const pages = [];
const assets = new Set();
const excluded = new Set(['.git', '.vercel', 'node_modules', 'docs', 'scripts', 'tests', '.github']);
const design = JSON.parse(readFileSync(new URL('./design-baseline.json', import.meta.url), 'utf8'));
const sectionHashes = {};
const sectionOrder = [];
const digest = value => createHash('sha256').update(value).digest('hex');
function walk(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.name.startsWith('.')) continue;
    const full = join(path, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html')) pages.push(full);
  }
}
function localPath(value, from) {
  if (!value || value.startsWith('#')) return null;
  const url = new URL(value, origin + '/' + relative(root, from).split(sep).join('/'));
  if (url.origin !== origin) return null;
  let path = decodeURIComponent(url.pathname);
  const rewrite = (config.rewrites || []).find(rule => rule.source === path);
  if (rewrite) path = rewrite.destination;
  const file = resolve(root, '.' + path);
  if (file !== root && !file.startsWith(root + sep)) throw new Error('Path escapes site root');
  return { file, hash: url.hash };
}
function requireAsset(value, from) {
  const target = localPath(value, from);
  if (!target) return;
  assets.add(target.file);
  if (!existsSync(target.file)) failures.push(relative(root, from) + ': missing ' + value);
}
function requirePage(value, from) {
  const target = localPath(value, from);
  if (!target) return;
  const file = target.file;
  const candidates = [file, join(file, 'index.html')];
  if (!candidates.some(p => existsSync(p))) failures.push(relative(root, from) + ': broken link ' + value);
}
function visit(node, from) {
  const attrs = Object.fromEntries((node.attrs || []).map(a => [a.name, a.value]));
  if (from === join(root, 'index.html') && Object.hasOwn(design.sections, attrs.id)) {
    sectionHashes[attrs.id] = digest(serializeOuter(node));
    sectionOrder.push(attrs.id);
  }
  if (['img', 'script', 'source', 'video', 'audio'].includes(node.tagName)) requireAsset(attrs.src, from);
  if (node.tagName === 'link' && /stylesheet|preload|icon|manifest/.test(attrs.rel || '')) requireAsset(attrs.href, from);
  if (node.tagName === 'a') requirePage(attrs.href, from);
  if (node.tagName === 'script' && attrs.type === 'application/ld+json') {
    try { JSON.parse((node.childNodes || []).map(n => n.value || '').join('')); }
    catch { failures.push(relative(root, from) + ': invalid JSON-LD'); }
  }
  for (const child of node.childNodes || []) visit(child, from);
}
walk(root);
assert.ok(pages.length > 0, 'No HTML pages found');
for (const page of pages) visit(parse(readFileSync(page, 'utf8')), page);
for (const [file, hash] of Object.entries(design.files)) {
  const path = join(root, file);
  if (!existsSync(path) || digest(readFileSync(path)) !== hash) failures.push('Protected design/runtime asset changed: ' + file);
}
for (const [id, hash] of Object.entries(design.sections)) {
  if (sectionHashes[id] !== hash) failures.push('Protected homepage section changed: #' + id);
}
if (JSON.stringify(sectionOrder) !== JSON.stringify(Object.keys(design.sections))) {
  failures.push('Protected homepage sections reordered, duplicated or missing');
}
for (const asset of assets) {
  if (!existsSync(asset) || !asset.endsWith('.css')) continue;
  const css = postcss.parse(readFileSync(asset, 'utf8'));
  function checkValue(value) {
    valueParser(value).walk(node => {
      if (node.type === 'function' && node.value.toLowerCase() === 'url') {
        requireAsset(node.nodes.map(part => part.value).join('').trim(), asset);
        return false;
      }
    });
  }
  css.walkDecls(decl => checkValue(decl.value));
  css.walkAtRules('import', rule => {
    const first = valueParser(rule.params).nodes[0];
    if (first?.type === 'string') requireAsset(first.value, asset);
    else checkValue(rule.params);
  });
}
const manifest = JSON.parse(readFileSync(join(root, 'site.webmanifest'), 'utf8'));
for (const icon of manifest.icons || []) requireAsset(icon.src, join(root, 'site.webmanifest'));
const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
for (const entry of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) requirePage(entry[1], join(root, 'sitemap.xml'));
for (const page of ['about.html', 'method.html']) {
  if (!existsSync(join(root, page))) failures.push('Missing AEO page ' + page);
}
const api = join(root, 'api/lead.js');
if (!existsSync(api)) failures.push('Missing Snapshot backend api/lead.js');
else {
  const { createWebLeadHandler } = await import(pathToFileURL(api));
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Verification must not send outbound requests'); };
  try {
    const handler = createWebLeadHandler({ env: {} });
    const response = await handler(new Request(origin + '/api/lead'));
    assert.equal(response.status, 405);
    assert.deepEqual(await response.json(), { ok: false });
  } catch (error) { failures.push('Snapshot backend check: ' + error.message); }
  finally { globalThis.fetch = oldFetch; }
}
if (failures.length) {
  console.error(failures.join('\n'));
  console.error('FAIL: ' + failures.length + ' broken dependencies or routes');
  process.exitCode = 1;
} else console.log('PASS: ' + pages.length + ' pages, ' + assets.size + ' asset paths, JSON-LD, sitemap and Snapshot GET handler');
