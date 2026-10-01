// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as sdk from '../src/index';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
  dependencies?: Record<string, string>;
  scripts: Record<string, string>;
};

describe('package surface', () => {
  it('VERSION equals the package.json version', () => {
    expect(sdk.VERSION).toBe(pkg.version);
  });

  it('exports exactly load, ShieldLabsError and VERSION at runtime', () => {
    expect(Object.keys(sdk).sort()).toEqual(['ShieldLabsError', 'VERSION', 'load']);
  });

  it('has no runtime dependencies and no install scripts', () => {
    expect(pkg.dependencies ?? {}).toEqual({});
    for (const script of ['preinstall', 'install', 'postinstall', 'prepare']) {
      expect(pkg.scripts[script]).toBeUndefined();
    }
  });
});
