// Size budget: dist/index.js must stay at or below 3072 bytes after gzip.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BUDGET = 3072;

function gzipSize(path) {
  return gzipSync(readFileSync(new URL('../' + path, import.meta.url)), { level: 9 }).length;
}

const esm = gzipSize('dist/index.js');
const iife = gzipSize('dist/shieldlabs.iife.js');

console.log(`dist/index.js           ${esm} bytes gzip (budget ${BUDGET})`);
console.log(`dist/shieldlabs.iife.js ${iife} bytes min+gzip`);

if (esm > BUDGET) {
  console.error(`dist/index.js is ${esm - BUDGET} bytes over the budget.`);
  process.exit(1);
}
