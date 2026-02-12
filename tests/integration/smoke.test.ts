import { describe, it, expect, beforeAll } from "@jest/globals";

import type { BitbucketAccount, BitbucketRepository } from "../../src/bitbucket/types.js";

import { createIntegrationClient, waitForBitbucket, TEST_WORKSPACE, canRunIntegration } from "./setup.js";

const describeIntegration = canRunIntegration ? describe : describe.skip;

describeIntegration("Integration: Smoke Tests", () => {
    const client = createIntegrationClient();

    beforeAll(async() => {
        await waitForBitbucket(client);
    }, 60_000);

    it("should connect to Bitbucket and get current user", async() => {
        const user = await client.get<BitbucketAccount>("/user");

        expect(user).toBeDefined();
        expect(user.display_name).toBeTruthy();
    });

    it("should list repositories in the workspace", async() => {
        if (!TEST_WORKSPACE) return;

        const result = await client.getPaginated<BitbucketRepository>(
            `/repositories/${TEST_WORKSPACE}`,
            { pagelen: 5 }
        );

        expect(result).toBeDefined();
        expect(result.values).toBeDefined();
        expect(Array.isArray(result.values)).toBe(true);
    });

    it("should handle 404 for non-existent repository", async() => {
        if (!TEST_WORKSPACE) return;

        await expect(
            client.get(`/repositories/${TEST_WORKSPACE}/this-repo-does-not-exist-12345`)
        ).rejects.toThrow(/not found/i);
    });

    it("should handle 404 for non-existent workspace", async() => {
        await expect(
            client.get("/repositories/this-workspace-does-not-exist-xyz-12345")
        ).rejects.toThrow(/not found|404/i);
    });

    it("should paginate repositories correctly", async() => {
        if (!TEST_WORKSPACE) return;

        const page1 = await client.getPaginated<BitbucketRepository>(
            `/repositories/${TEST_WORKSPACE}`,
            { pagelen: 1, page: 1 }
        );

        expect(page1.values.length).toBeLessThanOrEqual(1);

        if (page1.total && page1.total > 1) {
            const page2 = await client.getPaginated<BitbucketRepository>(
                `/repositories/${TEST_WORKSPACE}`,
                { pagelen: 1, page: 2 }
            );

            expect(page2.values.length).toBeLessThanOrEqual(1);

            // Pages should return different repos (if multiple exist)
            if (page1.values.length > 0 && page2.values.length > 0) {
                expect(page1.values[0].uuid).not.toBe(page2.values[0].uuid);
            }
        }
    });
});
