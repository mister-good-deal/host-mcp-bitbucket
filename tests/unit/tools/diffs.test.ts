import { describe, it, expect, beforeEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerDiffTools } from "../../../src/tools/diffs.js";
import { createMockClient, createPaths, extractToolResponse, make404 } from "./helpers.js";

describe("Diff Tools", () => {
    let server: McpServer;
    let client: ReturnType<typeof createMockClient>;
    let toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<unknown>>;

    beforeEach(() => {
        server = new McpServer({ name: "test", version: "0.0.1" });
        client = createMockClient();
        toolHandlers = new Map();
        const paths = createPaths();

        const originalRegisterTool = server.registerTool.bind(server);

        server.registerTool = ((...args: unknown[]) => {
            const name = args[0] as string;
            const handler = args[args.length - 1] as (args: Record<string, unknown>) => Promise<unknown>;

            toolHandlers.set(name, handler);

            return originalRegisterTool(...(args as Parameters<typeof originalRegisterTool>));
        }) as typeof server.registerTool;

        registerDiffTools(server, client, paths, "default-ws");
    });

    describe("getPullRequestDiff", () => {
        it("should return the raw diff", async() => {
            const mockDiff = "diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new";

            client.getText.mockResolvedValueOnce(mockDiff);

            const handler = toolHandlers.get("getPullRequestDiff")!;
            const result = await handler({ repoSlug: "my-repo", pullRequestId: 1 }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.result).toBe(mockDiff);
            expect(client.getText).toHaveBeenCalledWith(
                "/repositories/default-ws/my-repo/pullrequests/1/diff"
            );
        });

        it("should handle 404", async() => {
            client.getText.mockRejectedValueOnce(make404());

            const handler = toolHandlers.get("getPullRequestDiff")!;
            const result = await handler({ repoSlug: "my-repo", pullRequestId: 999 }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("FAILED");
            expect(response.message).toContain("not found");
        });
    });

    describe("getPullRequestDiffStat", () => {
        it("should return diff statistics", async() => {
            const mockDiffStats = [{ old: { path: "file.ts" }, new: { path: "file.ts" }, status: "modified", lines_added: 5, lines_removed: 2 }];

            client.getPaginated.mockResolvedValueOnce({ values: mockDiffStats, total: 1 });

            const handler = toolHandlers.get("getPullRequestDiffStat")!;
            const result = await handler({ repoSlug: "my-repo", pullRequestId: 1 }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.result).toEqual(mockDiffStats);
        });

        it("should handle 404", async() => {
            client.getPaginated.mockRejectedValueOnce(make404());

            const handler = toolHandlers.get("getPullRequestDiffStat")!;
            const result = await handler({ repoSlug: "my-repo", pullRequestId: 999 }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("FAILED");
            expect(response.message).toContain("not found");
        });
    });

    describe("getPullRequestPatch", () => {
        it("should return the patch", async() => {
            const mockPatch = "From abc123\nSubject: [PATCH] Fix bug\n---\n file.ts | 2 +-\n 1 file changed";

            client.getText.mockResolvedValueOnce(mockPatch);

            const handler = toolHandlers.get("getPullRequestPatch")!;
            const result = await handler({ repoSlug: "my-repo", pullRequestId: 1 }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.result).toBe(mockPatch);
            expect(client.getText).toHaveBeenCalledWith(
                "/repositories/default-ws/my-repo/pullrequests/1/patch"
            );
        });

        it("should handle 404", async() => {
            client.getText.mockRejectedValueOnce(make404());

            const handler = toolHandlers.get("getPullRequestPatch")!;
            const result = await handler({ repoSlug: "my-repo", pullRequestId: 999 }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("FAILED");
            expect(response.message).toContain("not found");
        });
    });
});
