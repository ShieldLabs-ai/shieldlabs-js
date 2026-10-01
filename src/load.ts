import { createAgent, isAgentModule, type AgentModule, type ShieldLabsAgent } from './agent';
import { agentUrl, checkEnvironment } from './environment';
import { ShieldLabsError } from './errors';
import { importAgent } from './import-agent';
import { checkPublicKey, checkTimeout, invalidOptions, isObject } from './validate';

export interface LoadOptions {
  /**
   * Public Key of your domain (Integration > API keys in the analytics dashboard). Must match
   * `^[A-Za-z0-9_-]{1,128}$`; a one-time warning is logged when it is not 32 lowercase hex characters.
   * Server-side secrets (`sec_…`, `whsec_…`) are rejected.
   */
  publicKey: string;
  /** `'production'` (default) loads `https://cdn.shieldlabs.ai/snippet.js`, `'development'` the development agent. */
  environment?: 'production' | 'development';
  /** Advanced: agent module URL override. https only (http is allowed for localhost and 127.0.0.1). */
  scriptUrl?: string;
  /** Milliseconds to wait for the agent to load, and the default for each agent call. Default 10000. */
  timeout?: number;
}

const DEFAULT_TIMEOUT = 10000;

interface Entry {
  /** The import in flight, or the loaded agent module. Unset after a failed import. */
  module?: Promise<AgentModule>;
  /** Failed imports so far. */
  failures: number;
}

/** One entry per resolved agent URL (the URL includes the Public Key). */
const entries = new Map<string, Entry>();

function importOnce(url: string): Promise<AgentModule> {
  let entry = entries.get(url);
  if (!entry) entries.set(url, (entry = { failures: 0 }));
  if (entry.module) return entry.module;
  const current = entry;
  // Browsers remember a failed module load per URL, so each retry imports a new URL.
  const target = current.failures ? url + '&retry=' + String(current.failures) : url;
  const loading = new Promise<unknown>((resolve) => {
    resolve(importAgent(target));
  }).then(
    (mod) => {
      if (isAgentModule(mod)) return mod;
      throw new ShieldLabsError('load_failed', 'The module at ' + target + ' is not the ShieldLabs agent.');
    },
    (error: unknown) => {
      throw new ShieldLabsError('load_failed', 'Could not load the ShieldLabs agent from ' + target + '.', error);
    },
  );
  current.module = loading;
  // A failed import is not cached: the next load() call retries. This runs before the callers see it.
  loading.then(undefined, () => {
    current.failures += 1;
    current.module = undefined;
  });
  return loading;
}

/**
 * Loads the ShieldLabs agent from the CDN and returns an agent you can identify with.
 * Memoized per agent URL and Public Key: concurrent and repeated calls share one import. When the
 * import takes longer than `timeout`, the call rejects with `timeout` and the import continues: a
 * later call uses it once it has loaded.
 */
export function load(options: LoadOptions): Promise<ShieldLabsAgent> {
  return new Promise<ShieldLabsAgent>((resolve, reject) => {
    if (!isObject(options)) throw invalidOptions('load() needs an options object.');
    const publicKey = checkPublicKey(options.publicKey);
    const timeout = checkTimeout(options.timeout) ?? DEFAULT_TIMEOUT;
    const url = agentUrl(publicKey, options.environment, options.scriptUrl);
    checkEnvironment();
    const timer = setTimeout(() => {
      reject(new ShieldLabsError('timeout', 'The ShieldLabs agent did not load within ' + String(timeout) + ' ms.'));
    }, timeout);
    const loading = importOnce(url);
    const stop = (): void => {
      clearTimeout(timer);
    };
    // Reactions run in the order they were added: the timer is cleared before the call settles.
    void loading.then(stop, stop);
    void loading.then((mod) => {
      resolve(createAgent(mod, timeout));
    }, reject);
  });
}
