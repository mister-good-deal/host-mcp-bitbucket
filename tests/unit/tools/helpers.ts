import { jest } from "@jest/globals";

import type { BitbucketClient } from "../../../src/bitbucket/client.js";
import { BitbucketClientError } from "../../../src/bitbucket/client.js";
import { PathBuilder } from "../../../src/bitbucket/utils.js";

// Logger is now silenced globally in tests/unit/setup.ts

/**
 * Create a mock BitbucketClient for testing tools.
 * Defaults to "cloud" platform.
 */
export function createMockClient(platform: "cloud" | "datacenter" = "cloud"): jest.Mocked<BitbucketClient> {
    return {
        get: jest.fn(),
        getText: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
        getPaginated: jest.fn(),
        platform,
        isCloud: platform === "cloud",
        isDataCenter: platform === "datacenter"
    } as unknown as jest.Mocked<BitbucketClient>;
}

/**
 * Create a PathBuilder for testing, defaulting to Cloud.
 */
export function createPaths(platform: "cloud" | "datacenter" = "cloud"): PathBuilder {
    return new PathBuilder(platform);
}

/**
 * Helper to make a 404 error.
 */
export function make404(url = "test"): BitbucketClientError {
    return new BitbucketClientError(`Resource not found: ${url}`, 404);
}

/**
 * Extract the ToolResponse from an MCP CallToolResult.
 */
export function extractToolResponse(result: { content: Array<{ type: string; text: string }>; isError?: boolean }) {
    const text = result.content[0].text;

    return JSON.parse(text) as { status: string; message: string; result: unknown };
}
