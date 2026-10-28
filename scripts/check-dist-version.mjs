import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const read = (name) => readFileSync(new URL(`../dist/${name}`, import.meta.url), 'utf8');
const esm = await import('../dist/index.js');
const cjs = createRequire(import.meta.url)('../dist/index.cjs');
const page = vm.createContext({});
vm.runInContext(read('shieldlabs.iife.js'), page, { timeout: 1000 });

for (const [file, version] of [
  ['index.js', esm.VERSION],
  ['index.cjs', cjs.VERSION],
  ['shieldlabs.iife.js', page.ShieldLabsJS?.VERSION],
]) {
  assert.equal(version, pkg.version, `${file}: VERSION must match package.json`);
}
for (const file of ['index.d.ts', 'index.d.cts']) {
  const declaration = read(file).match(/\bdeclare const VERSION\s*=\s*(["'])([^"']+)\1\s*;/);
  assert.equal(declaration?.[2], pkg.version, `${file}: VERSION must match package.json`);
}
console.log(`All runtime and declaration versions match ${pkg.version}.`);
