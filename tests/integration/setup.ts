import { BitbucketClient } from "../../src/bitbucket/client.js";
import { detectPlatform, normalizeBaseUrl, PathBuilder, type BitbucketPlatform } from "../../src/bitbucket/utils.js";

/** Raw URL before normalisation (mock or real). */
const RAW_URL = process.env.BITBUCKET_URL ?? "http://localhost:7990/2.0";

/** Detected platform. */
export const TEST_PLATFORM: BitbucketPlatform = detectPlatform(RAW_URL);

/** Default integration test Bitbucket config. */
export const BITBUCKET_CONFIG = {
    baseUrl: normalizeBaseUrl(RAW_URL),
    token: process.env.BITBUCKET_TOKEN ?? "test-token",
    timeout: 15_000,
    platform: TEST_PLATFORM
};

/** Default workspace for integration tests. */
export const TEST_WORKSPACE = process.env.BITBUCKET_WORKSPACE ?? "test-workspace";

/** Pre-built PathBuilder scoped to the detected platform. */
export const TEST_PATHS = new PathBuilder(TEST_PLATFORM);

/** Create a BitbucketClient for integration tests. */
export function createIntegrationClient(): BitbucketClient {
    return new BitbucketClient(BITBUCKET_CONFIG);
}

/** Wait until Bitbucket API is reachable, with a timeout. */
export async function waitForBitbucket(client: BitbucketClient, timeoutMs = 30_000): Promise<void> {
    const start = Date.now();
    const endpoint = TEST_PLATFORM === "cloud" ? "/user" : "/application-properties";

    while (Date.now() - start < timeoutMs) {
        try {
            await client.get(endpoint);

            return;
        } catch {
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    throw new Error(`Bitbucket API did not become reachable within ${timeoutMs}ms`);
}
