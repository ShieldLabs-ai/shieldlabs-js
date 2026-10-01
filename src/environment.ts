import { ShieldLabsError } from './errors';
import { invalidOptions } from './validate';

/** The agent module for production traffic. */
export const PRODUCTION_AGENT_URL = 'https://cdn.shieldlabs.ai/snippet.js';
/** The agent module of the ShieldLabs development environment. */
export const DEVELOPMENT_AGENT_URL = 'https://dev.cdn.shieldlabs.ai/snippet.js';

/** Hosts that may use plain HTTP during local development. */
export function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * Throws `unsupported_environment` outside a browser page (server-side rendering, workers) and on
 * pages that are not a secure context: the agent encrypts with WebCrypto, which browsers expose only
 * on HTTPS pages and on localhost.
 */
export function checkEnvironment(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new ShieldLabsError('unsupported_environment', 'load() needs a browser page, not server-side rendering or a worker.');
  }
  const location = window.location;
  const secure = typeof window.isSecureContext === 'boolean' ? window.isSecureContext : location.protocol === 'https:';
  if (!secure && !isLocalHost(location.hostname)) {
    throw new ShieldLabsError('unsupported_environment', 'The page is not a secure context: the agent needs HTTPS (or localhost).');
  }
}

/**
 * The agent module URL: `scriptUrl` when given, otherwise the CDN of `environment`, with the
 * `publicKey` query parameter added (an existing one is replaced).
 */
export function agentUrl(publicKey: string, environment?: unknown, scriptUrl?: unknown): string {
  if (environment !== undefined && environment !== 'production' && environment !== 'development') {
    throw invalidOptions('environment must be "production" or "development".');
  }
  let base = environment === 'development' ? DEVELOPMENT_AGENT_URL : PRODUCTION_AGENT_URL;
  if (scriptUrl !== undefined) {
    let url: URL | undefined;
    if (typeof scriptUrl === 'string') {
      try {
        url = new URL(scriptUrl);
      } catch {
        // Not an absolute URL.
      }
    }
    if (!url || !(url.protocol === 'https:' || (url.protocol === 'http:' && isLocalHost(url.hostname)))) {
      throw invalidOptions('scriptUrl must be an absolute https URL (http only for localhost and 127.0.0.1).');
    }
    url.hash = '';
    if (url.searchParams.has('publicKey')) url.searchParams.delete('publicKey');
    if (!url.search) url.search = '';
    base = url.href;
  }
  return base + (base.includes('?') ? '&' : '?') + 'publicKey=' + encodeURIComponent(publicKey);
}
