/**
 * @shieldlabs/js — thin browser loader.
 *
 * This package contains NO signal-collection logic. It only loads the
 * ShieldLabs agent from the CDN (cdn.shieldlabs.ai) and exposes its result.
 * All collection and scoring happen inside the hosted agent and the API.
 */

export interface ShieldLabsOptions {
  /** Public API key (client token) issued in the ShieldLabs dashboard. */
  apiKey: string;
  /** Optional agent script origin. Defaults to the ShieldLabs CDN. */
  scriptUrl?: string;
}

export interface IdentificationResult {
  /** Stable per-visitor identifier. */
  visitorId: string;
  /** Stable per-device identifier. */
  deviceId: string;
  /** Explainable risk score, 0-100. */
  riskScore: number;
  /** Opaque request id for correlating with server-side webhooks. */
  requestId: string;
}

export const DEFAULT_SCRIPT_URL = "https://cdn.shieldlabs.ai/snippet.js";

/**
 * Load the ShieldLabs agent and return the current identification result.
 * Full browser loader lands with the first published release; until then this
 * throws so integrators fail loudly rather than silently.
 */
export async function getResult(_options: ShieldLabsOptions): Promise<IdentificationResult> {
  throw new Error(
    "@shieldlabs/js loader is not published yet. Use the snippet from https://docs.shieldlabs.ai until then.",
  );
}
