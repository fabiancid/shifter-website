import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import './verify-site.mjs';

if (process.exitCode) throw new Error('Source checks failed; no output produced');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'public');
const marker = join(output, '.shifter-static-output');
const markerValue = 'generated-by-shifter-build-v1\n';
if (existsSync(output)) {
  assert.ok(existsSync(marker) && readFileSync(marker, 'utf8') === markerValue,
    'Refusing to replace a public directory not created by this build');
  rmSync(output, { recursive: true });
}
mkdirSync(output);
writeFileSync(marker, markerValue);

const files = [];
const staticExtension = /\.(?:html|css|js|svg|png|jpe?g|webp|avif|ico|woff2?|ttf|otf|mp4|webm|xml|webmanifest)$/i;
function collect(dir, nested = false) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'redesign.html') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory() && (nested || ['assets', 'insights'].includes(entry.name))) collect(full, true);
    else if (entry.isFile() && (staticExtension.test(entry.name) || ['robots.txt', 'llms.txt'].includes(entry.name))) files.push(full);
  }
}
collect(root);
for (const file of files) {
  const target = join(output, relative(root, file));
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(file, target);
  assert.ok(readFileSync(file).equals(readFileSync(target)), 'Output differs: ' + file);
}
for (const privatePath of ['api', 'scripts', 'node_modules', 'package.json', 'vercel.json', 'README.md', 'APPLY-LOG.md', 'redesign.html']) {
  assert.ok(!existsSync(join(output, privatePath)), 'Private source included in output: ' + privatePath);
}
assert.ok(existsSync(join(output, 'index.html')), 'Homepage missing from output');
console.log('PASS: ' + files.length + ' byte-identical public files; server code and build tools excluded');
