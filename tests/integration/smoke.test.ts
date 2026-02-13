import { describe, it, expect, beforeAll } from "@jest/globals";

import type { BitbucketAccount, BitbucketRepository } from "../../src/bitbucket/types.js";

import { createIntegrationClient, waitForBitbucket, TEST_WORKSPACE } from "./setup.js";

describe("Integration: Smoke Tests", () => {
    const client = createIntegrationClient();

    beforeAll(async() => {
        await waitForBitbucket(client);
    }, 60_000);

    it("should connect to Bitbucket and get current user", async() => {
        const user = await client.get<BitbucketAccount>("/user");

        expect(user).toBeDefined();
        expect(user.display_name).toBeTruthy();
        expect(user.nickname).toBe("admin");
    });

    it("should list repositories in the workspace", async() => {
        const result = await client.getPaginated<BitbucketRepository>(
            `/repositories/${TEST_WORKSPACE}`,
            { pagelen: 5 }
        );

        expect(result).toBeDefined();
        expect(result.values).toBeDefined();
        expect(Array.isArray(result.values)).toBe(true);
        expect(result.values.length).toBe(2);
        expect(result.values[0].slug).toBe("test-repo");
    });

    it("should get a single repository", async() => {
        const repo = await client.get<BitbucketRepository>(
            `/repositories/${TEST_WORKSPACE}/test-repo`
        );

        expect(repo).toBeDefined();
        expect(repo.slug).toBe("test-repo");
        expect(repo.full_name).toBe("test-workspace/test-repo");
    });

    it("should handle 404 for non-existent repository", async() => {
        await expect(
            client.get(`/repositories/${TEST_WORKSPACE}/this-repo-does-not-exist-12345`)
        ).rejects.toThrow();
    });

    it("should handle 404 for non-existent workspace", async() => {
        await expect(
            client.get("/repositories/this-workspace-does-not-exist-xyz-12345")
        ).rejects.toThrow();
    });

    it("should paginate repositories correctly", async() => {
        const page1 = await client.getPaginated<BitbucketRepository>(
            `/repositories/${TEST_WORKSPACE}`,
            { pagelen: 1, page: 1 }
        );

        expect(page1.values.length).toBe(1);

        const page2 = await client.getPaginated<BitbucketRepository>(
            `/repositories/${TEST_WORKSPACE}`,
            { pagelen: 1, page: 2 }
        );

        expect(page2.values.length).toBe(1);
        expect(page1.values[0].uuid).not.toBe(page2.values[0].uuid);
    });

    it("should reject unauthenticated requests", async() => {
        const badClient = new (await import("../../src/bitbucket/client.js")).BitbucketClient({
            baseUrl: process.env.BITBUCKET_URL ?? "http://localhost:7990/2.0",
            token: "bad-token",
            timeout: 5_000
        });

        await expect(badClient.get("/user")).rejects.toThrow();
    });
});
