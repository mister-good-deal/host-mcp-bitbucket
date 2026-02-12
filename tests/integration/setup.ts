import { BitbucketClient } from "../../src/bitbucket/client.js";

/** Default integration test Bitbucket config. */
export const BITBUCKET_CONFIG = {
    baseUrl: process.env.BITBUCKET_URL ?? "https://api.bitbucket.org/2.0",
    token: process.env.BITBUCKET_TOKEN ?? "",
    timeout: 15_000
};

/** Default workspace for integration tests. */
export const TEST_WORKSPACE = process.env.BITBUCKET_WORKSPACE ?? "";

/** Create a BitbucketClient for integration tests. */
export function createIntegrationClient(): BitbucketClient {
    if (!BITBUCKET_CONFIG.token) {
        throw new Error("BITBUCKET_TOKEN is required for integration tests. Set it as an environment variable.");
    }

    return new BitbucketClient(BITBUCKET_CONFIG);
}

/** Wait until Bitbucket API is reachable, with a timeout. */
export async function waitForBitbucket(client: BitbucketClient, timeoutMs = 30_000): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        try {
            await client.get("/user");

            return;
        } catch {
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    throw new Error(`Bitbucket API did not become reachable within ${timeoutMs}ms`);
}
