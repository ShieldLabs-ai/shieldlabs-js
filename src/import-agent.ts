/**
 * Imports the hosted agent module at runtime. This is the only dynamic import in the package; tests
 * replace this module with a fake agent. The comments keep bundlers from resolving or bundling the
 * CDN URL: the agent is always loaded from the ShieldLabs CDN.
 */
export function importAgent(url: string): Promise<unknown> {
  return import(/* webpackIgnore: true */ /* @vite-ignore */ url) as Promise<unknown>;
}
