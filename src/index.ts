/**
 * @shieldlabs/js — thin browser loader.
 *
 * This package contains NO signal-collection logic. It only loads the
 * ShieldLabs agent from the CDN (cdn.shieldlabs.ai) and exposes its result.
 * All collection and scoring happen inside the hosted agent and the API.
 *
 * Status: pre-launch scaffold. The public surface below is a placeholder and
 * will be finalized from the OpenAPI specification before the first release.
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

const DEFAULT_SCRIPT_URL = "https://cdn.shieldlabs.ai/agent.js";

/**
 * Load the ShieldLabs agent and return the current identification result.
 * Not implemented yet — placeholder for the pre-launch scaffold.
 */
export async function getResult(_options: ShieldLabsOptions): Promise<IdentificationResult> {
  void DEFAULT_SCRIPT_URL;
  throw new Error("@shieldlabs/js is not published yet. See https://shieldlabs.ai");
}
