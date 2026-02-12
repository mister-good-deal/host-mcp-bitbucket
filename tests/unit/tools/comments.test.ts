import { describe, it, expect, beforeEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerCommentTools } from "../../../src/tools/comments.js";
import { createMockClient, extractToolResponse, make404 } from "./helpers.js";

describe("Comment Tools", () => {
    let server: McpServer;
    let client: ReturnType<typeof createMockClient>;
    let toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<unknown>>;

    beforeEach(() => {
        server = new McpServer({ name: "test", version: "0.0.1" });
        client = createMockClient();
        toolHandlers = new Map();

        const originalRegisterTool = server.registerTool.bind(server);

        server.registerTool = ((...args: unknown[]) => {
            const name = args[0] as string;
            const handler = args[args.length - 1] as (args: Record<string, unknown>) => Promise<unknown>;

            toolHandlers.set(name, handler);

            return originalRegisterTool(...(args as Parameters<typeof originalRegisterTool>));
        }) as typeof server.registerTool;

        registerCommentTools(server, client, "default-ws");
    });

    describe("getPullRequestComments", () => {
        it("should return comments for a pull request", async() => {
            const mockComments = [
                { id: 1, content: { raw: "LGTM" }},
                { id: 2, content: { raw: "Needs fixing" }}
            ];

            client.getPaginated.mockResolvedValueOnce({ values: mockComments, total: 2 });

            const handler = toolHandlers.get("getPullRequestComments")!;
            const result = await handler({ repoSlug: "my-repo", pullRequestId: 1 }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.result).toEqual(mockComments);
        });

        it("should handle 404", async() => {
            client.getPaginated.mockRejectedValueOnce(make404());

            const handler = toolHandlers.get("getPullRequestComments")!;
            const result = await handler({ repoSlug: "my-repo", pullRequestId: 999 }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("FAILED");
            expect(response.message).toContain("not found");
        });
    });

    describe("getPullRequestComment", () => {
        it("should return a single comment", async() => {
            const mockComment = { id: 42, content: { raw: "Great work!" }};

            client.get.mockResolvedValueOnce(mockComment);

            const handler = toolHandlers.get("getPullRequestComment")!;
            const result = await handler({ repoSlug: "my-repo", pullRequestId: 1, commentId: 42 }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.result).toEqual(mockComment);
        });
    });

    describe("addPullRequestComment", () => {
        it("should add a general comment", async() => {
            const mockComment = { id: 10, content: { raw: "New comment" }};

            client.post.mockResolvedValueOnce(mockComment);

            const handler = toolHandlers.get("addPullRequestComment")!;
            const result = await handler({
                repoSlug: "my-repo",
                pullRequestId: 1,
                content: "New comment"
            }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.message).toContain("added");
            expect(client.post).toHaveBeenCalledWith(
                expect.stringContaining("/comments"),
                expect.objectContaining({
                    content: { raw: "New comment" }
                })
            );
        });

        it("should add an inline comment with file and line", async() => {
            client.post.mockResolvedValueOnce({ id: 11 });

            const handler = toolHandlers.get("addPullRequestComment")!;

            await handler({
                repoSlug: "my-repo",
                pullRequestId: 1,
                content: "Fix this",
                inline: { path: "src/main.ts", to: 42 }
            });

            expect(client.post).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    inline: { path: "src/main.ts", to: 42 }
                })
            );
        });
    });

    describe("updatePullRequestComment", () => {
        it("should update a comment", async() => {
            const mockComment = { id: 42, content: { raw: "Updated" }};

            client.put.mockResolvedValueOnce(mockComment);

            const handler = toolHandlers.get("updatePullRequestComment")!;
            const result = await handler({
                repoSlug: "my-repo",
                pullRequestId: 1,
                commentId: 42,
                content: "Updated"
            }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.message).toContain("updated");
        });
    });

    describe("deletePullRequestComment", () => {
        it("should delete a comment", async() => {
            client.delete.mockResolvedValueOnce(undefined);

            const handler = toolHandlers.get("deletePullRequestComment")!;
            const result = await handler({
                repoSlug: "my-repo",
                pullRequestId: 1,
                commentId: 42
            }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.message).toContain("deleted");
        });
    });

    describe("resolveComment", () => {
        it("should resolve a comment", async() => {
            const mockResolved = { id: 42, resolution: { type: "resolved" }};

            client.put.mockResolvedValueOnce(mockResolved);

            const handler = toolHandlers.get("resolveComment")!;
            const result = await handler({
                repoSlug: "my-repo",
                pullRequestId: 1,
                commentId: 42
            }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.message).toContain("resolved");
        });
    });

    describe("reopenComment", () => {
        it("should reopen a comment", async() => {
            const mockReopened = { id: 42, resolution: null };

            client.put.mockResolvedValueOnce(mockReopened);

            const handler = toolHandlers.get("reopenComment")!;
            const result = await handler({
                repoSlug: "my-repo",
                pullRequestId: 1,
                commentId: 42
            }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.message).toContain("reopened");
        });
    });
});
