// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

it.each(['index.js', 'index.cjs', 'shieldlabs.iife.js', 'index.d.ts', 'index.d.cts'])(
  'the packaging check rejects a stale VERSION in %s',
  (file) => {
    const fixture = mkdtempSync(path.join(tmpdir(), 'shieldlabs-version-'));
    try {
      mkdirSync(path.join(fixture, 'scripts'));
      cpSync(path.join(root, 'scripts/check-dist-version.mjs'), path.join(fixture, 'scripts/check-dist-version.mjs'));
      cpSync(path.join(root, 'package.json'), path.join(fixture, 'package.json'));
      cpSync(path.join(root, 'dist'), path.join(fixture, 'dist'), { recursive: true });
      const check = () => spawnSync(process.execPath, ['scripts/check-dist-version.mjs'], {
        cwd: fixture, encoding: 'utf8', timeout: 5000,
      });
      const baseline = check();
      expect(baseline.status, baseline.stderr).toBe(0);
      const { version } = JSON.parse(readFileSync(path.join(fixture, 'package.json'), 'utf8')) as { version: string };
      const target = path.join(fixture, 'dist', file);
      const original = readFileSync(target, 'utf8');
      expect(original).toContain(version);
      writeFileSync(target, original.split(version).join('0.0.0'));
      const stale = check();
      expect(stale.status).toBe(1);
      expect(stale.stderr).toContain(`${file}: VERSION must match package.json`);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  },
);
