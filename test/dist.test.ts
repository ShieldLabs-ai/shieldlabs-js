// @vitest-environment node
// Checks the files that ship in the package. `npm test` builds them first (the pretest script).
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspect } from 'node:util';
import vm from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = (file: string): string => fileURLToPath(new URL(`../dist/${file}`, import.meta.url));
const read = (file: string): string => readFileSync(dist(file), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

interface Bundle {
  load: (options: unknown) => Promise<unknown>;
  ShieldLabsError: new (code: string, message: string) => Error & { code: string };
  VERSION: string;
}

beforeAll(() => {
  if (!existsSync(dist('index.js'))) {
    throw new Error('dist/ is missing. Run `npm test` (it builds first) or `npm run build`.');
  }
});

describe('IIFE build', () => {
  it('defines the ShieldLabsJS global when run as a classic script', async () => {
    const page: Record<string, unknown> = {
      console,
      URL,
      setTimeout,
      clearTimeout,
      document: {},
      isSecureContext: true,
      location: { protocol: 'https:', hostname: 'shop.example.com' },
    };
    page.window = page;
    const context = vm.createContext(page);
    vm.runInContext(read('shieldlabs.iife.js'), context, { filename: 'shieldlabs.iife.js' });

    const bundle = (page.window as { ShieldLabsJS?: Bundle }).ShieldLabsJS;
    expect(bundle).toBeDefined();
    expect(Object.keys(bundle!).sort()).toEqual(['ShieldLabsError', 'VERSION', 'load']);
    expect(bundle!.VERSION).toBe(pkg.version);
    expect(new bundle!.ShieldLabsError('timeout', 'x').code).toBe('timeout');
    expect(bundle!.ShieldLabsError.name).toBe('ShieldLabsError');

    // The options are validated in the bundle too.
    await expect(bundle!.load({ publicKey: '' })).rejects.toMatchObject({ code: 'invalid_options' });
    // The runtime import cannot succeed inside this sandbox: it must surface as load_failed.
    await expect(bundle!.load({ publicKey: '0123456789abcdef0123456789abcdef' })).rejects.toMatchObject({
      code: 'load_failed',
    });
  });

  it('is minified', () => {
    expect(read('shieldlabs.iife.js').split('\n').length).toBeLessThan(5);
  });
});

describe('ESM and CJS builds', () => {
  it.each(['index.js', 'index.cjs'])('%s keeps a native import() with the bundler hints', (file) => {
    const code = read(file);
    // Local names are shortened in the build, so match any identifier as the argument.
    expect(code).toMatch(/import\(\s*\/\* webpackIgnore: true \*\/\s*\/\* @vite-ignore \*\/\s*[\w$]+\s*\)/);
    expect(code.match(/\bimport\(/g)).toHaveLength(1);
    expect(code).not.toMatch(/\brequire\(/);
    expect(code).toContain('https://cdn.shieldlabs.ai/snippet.js');
  });

  it('the CJS build exports the public API', () => {
    const require = createRequire(root);
    const cjs = require(dist('index.cjs')) as Bundle;
    expect(Object.keys(cjs).sort()).toEqual(['ShieldLabsError', 'VERSION', 'load']);
    expect(cjs.VERSION).toBe(pkg.version);
  });

  it('the ESM build exports the public API', async () => {
    const esm = (await import(pathToFileURL(dist('index.js')).href)) as Bundle;
    expect(Object.keys(esm).sort()).toEqual(['ShieldLabsError', 'VERSION', 'load']);
    expect(esm.VERSION).toBe(pkg.version);
  });

  it.each(['index.js', 'index.cjs'])('%s keeps the error class name readable in logs', async (file) => {
    const bundle =
      file === 'index.cjs'
        ? (createRequire(root)(dist(file)) as Bundle)
        : ((await import(pathToFileURL(dist(file)).href)) as Bundle);
    expect(bundle.ShieldLabsError.name).toBe('ShieldLabsError');
    expect(inspect(new bundle.ShieldLabsError('timeout', 'x'))).toMatch(/^ShieldLabsError: x\n/);
  });

  it.each(['index.d.ts', 'index.d.cts'])('%s declares the public types', (file) => {
    const types = read(file);
    const version = /\bdeclare const VERSION\s*=\s*(["'])([^"']+)\1\s*;/.exec(types);
    expect(version?.[2]).toBe(pkg.version);
    for (const name of [
      'LoadOptions',
      'IdentifyOptions',
      'IdentifyResult',
      'ShieldLabsAgent',
      'InteractionIdentifier',
      'ShieldLabsError',
      'ShieldLabsErrorCode',
      'VERSION',
      'load',
    ]) {
      expect(types).toContain(name);
    }
  });
});
