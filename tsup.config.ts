import { defineConfig, type Options } from 'tsup';

const shared: Options = {
  target: 'es2019',
  tsconfig: 'tsconfig.build.json',
  treeshake: true,
  // Keep the runtime import() of the agent native in every format. Browsers that can run the agent
  // (an ES module) all support dynamic import, so it must never be rewritten to require().
  esbuildOptions(options) {
    options.supported = { ...options.supported, 'dynamic-import': true };
  },
};

export default defineConfig([
  {
    ...shared,
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    // Shorter local names keep dist/index.js inside its size budget. Whitespace stays unminified on
    // purpose: esbuild drops comments when it removes whitespace, and the bundler hints inside the
    // agent import() must survive (test/dist.test.ts checks them).
    minifyIdentifiers: true,
  },
  {
    ...shared,
    entry: { shieldlabs: 'src/index.ts' },
    format: ['iife'],
    globalName: 'ShieldLabsJS',
    minify: true,
    outExtension: () => ({ js: '.iife.js' }),
  },
]);
