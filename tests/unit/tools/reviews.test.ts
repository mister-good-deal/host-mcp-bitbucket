import { describe, it, expect, beforeEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerReviewTools } from "../../../src/tools/reviews.js";
import { createMockClient, createPaths, extractToolResponse, make404 } from "./helpers.js";

function setupToolHandlers(platform: "cloud" | "datacenter" = "datacenter") {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const client = createMockClient(platform);
    const toolHandlers = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();
    const paths = createPaths(platform);

    const originalRegisterTool = server.registerTool.bind(server);

    server.registerTool = ((...args: unknown[]) => {
        const name = args[0] as string;
        const handler = args[args.length - 1] as (args: Record<string, unknown>) => Promise<unknown>;

        toolHandlers.set(name, handler);

        return originalRegisterTool(...(args as Parameters<typeof originalRegisterTool>));
    }) as typeof server.registerTool;

    registerReviewTools(server, client, paths, "default-ws");

    return { server, client, toolHandlers, paths };
}

describe("Review Tools", () => {
    // ── Data Center ──────────────────────────────────────────────────────

    describe("Data Center", () => {
        let client: ReturnType<typeof createMockClient>;
        let toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<unknown>>;

        beforeEach(() => {
            ({ client, toolHandlers } = setupToolHandlers("datacenter"));
        });

        // ── addPendingReviewComment ──────────────────────────────────────

        describe("addPendingReviewComment", () => {
            it("should create a pending comment", async() => {
                const mockComment = { id: 100, text: "Needs refactoring", state: "PENDING" };

                client.post.mockResolvedValueOnce(mockComment);

                const handler = toolHandlers.get("addPendingReviewComment")!;
                const result = await handler({
                    repoSlug: "my-repo",
                    pullRequestId: 1,
                    content: "Needs refactoring"
                }) as ReturnType<typeof extractToolResponse>;
                const response = extractToolResponse(result as never);

                expect(response.status).toBe("COMPLETED");
                expect(response.message).toContain("Pending review comment added");
                expect(response.result).toEqual(mockComment);
                expect(client.post).toHaveBeenCalledWith(
                    expect.stringContaining("/comments"),
                    expect.objectContaining({
                        text: "Needs refactoring",
                        state: "PENDING"
                    })
                );
            });

            it("should create an inline pending comment", async() => {
                const mockComment = { id: 101, text: "Fix this line", state: "PENDING" };

                client.post.mockResolvedValueOnce(mockComment);

                const handler = toolHandlers.get("addPendingReviewComment")!;

                await handler({
                    repoSlug: "my-repo",
                    pullRequestId: 1,
                    content: "Fix this line",
                    inline: { path: "src/main.ts", to: 42 }
                });

                expect(client.post).toHaveBeenCalledWith(
                    expect.anything(),
                    expect.objectContaining({
                        text: "Fix this line",
                        state: "PENDING",
                        anchor: {
                            path: "src/main.ts",
                            line: 42,
                            lineType: "ADDED",
                            fileType: "TO"
                        }
                    })
                );
            });

            it("should support reply to parent comment", async() => {
                client.post.mockResolvedValueOnce({ id: 102 });

                const handler = toolHandlers.get("addPendingReviewComment")!;

                await handler({
                    repoSlug: "my-repo",
                    pullRequestId: 1,
                    content: "Good point",
                    parentId: 50
                });

                expect(client.post).toHaveBeenCalledWith(
                    expect.anything(),
                    expect.objectContaining({
                        text: "Good point",
                        state: "PENDING",
                        parent: { id: 50 }
                    })
                );
            });

            it("should handle 404", async() => {
                client.post.mockRejectedValueOnce(make404());

                const handler = toolHandlers.get("addPendingReviewComment")!;
                const result = await handler({
                    repoSlug: "my-repo",
                    pullRequestId: 999,
                    content: "test"
                }) as ReturnType<typeof extractToolResponse>;
                const response = extractToolResponse(result as never);

                expect(response.status).toBe("FAILED");
                expect(response.message).toContain("not found");
            });

            it("should require workspace", async() => {
                // Set up without a default workspace
                const server = new McpServer({ name: "test", version: "0.0.1" });
                const noWsClient = createMockClient("datacenter");
                const handlers = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();
                const paths = createPaths("datacenter");

                const orig = server.registerTool.bind(server);

                server.registerTool = ((...args: unknown[]) => {
                    handlers.set(args[0] as string, args[args.length - 1] as (args: Record<string, unknown>) => Promise<unknown>);

                    return orig(...(args as Parameters<typeof orig>));
                }) as typeof server.registerTool;

                registerReviewTools(server, noWsClient, paths);

                const handler = handlers.get("addPendingReviewComment")!;
                const result = await handler({
                    repoSlug: "my-repo",
                    pullRequestId: 1,
                    content: "test"
                }) as ReturnType<typeof extractToolResponse>;
                const response = extractToolResponse(result as never);

                expect(response.status).toBe("FAILED");
                expect(response.message).toContain("Workspace is required");
            });
        });

        // ── getPendingReview ─────────────────────────────────────────────

        describe("getPendingReview", () => {
            it("should return pending review details", async() => {
                const mockReview = {
                    pullRequest: { id: 1 },
                    commentThreads: [{ id: 100, text: "Fix this", state: "PENDING" }]
                };

                client.get.mockResolvedValueOnce(mockReview);

                const handler = toolHandlers.get("getPendingReview")!;
                const result = await handler({
                    repoSlug: "my-repo",
                    pullRequestId: 1
                }) as ReturnType<typeof extractToolResponse>;
                const response = extractToolResponse(result as never);

                expect(response.status).toBe("COMPLETED");
                expect(response.result).toEqual(mockReview);
                expect(client.get).toHaveBeenCalledWith(
                    expect.stringContaining("/review")
                );
            });

            it("should handle 404", async() => {
                client.get.mockRejectedValueOnce(make404());

                const handler = toolHandlers.get("getPendingReview")!;
                const result = await handler({
                    repoSlug: "my-repo",
                    pullRequestId: 999
                }) as ReturnType<typeof extractToolResponse>;
                const response = extractToolResponse(result as never);

                expect(response.status).toBe("FAILED");
                expect(response.message).toContain("not found");
            });
        });

        // ── submitPendingReview ──────────────────────────────────────────

        describe("submitPendingReview", () => {
            it("should submit a pending review with no options", async() => {
                const mockResult = { participantStatus: "APPROVED" };

                client.put.mockResolvedValueOnce(mockResult);

                const handler = toolHandlers.get("submitPendingReview")!;
                const result = await handler({
                    repoSlug: "my-repo",
                    pullRequestId: 1
                }) as ReturnType<typeof extractToolResponse>;
                const response = extractToolResponse(result as never);

                expect(response.status).toBe("COMPLETED");
                expect(response.message).toContain("submitted");
                expect(client.put).toHaveBeenCalledWith(
                    expect.stringContaining("/review"),
                    {}
                );
            });

            it("should submit with participant status", async() => {
                client.put.mockResolvedValueOnce({});

                const handler = toolHandlers.get("submitPendingReview")!;

                await handler({
                    repoSlug: "my-repo",
                    pullRequestId: 1,
                    participantStatus: "NEEDS_WORK"
                });

                expect(client.put).toHaveBeenCalledWith(
                    expect.anything(),
                    expect.objectContaining({
                        participantStatus: "NEEDS_WORK"
                    })
                );
            });

            it("should submit with comment text and last reviewed commit", async() => {
                client.put.mockResolvedValueOnce({});

                const handler = toolHandlers.get("submitPendingReview")!;

                await handler({
                    repoSlug: "my-repo",
                    pullRequestId: 1,
                    commentText: "Overall looks good",
                    lastReviewedCommit: "abc123",
                    participantStatus: "APPROVED"
                });

                expect(client.put).toHaveBeenCalledWith(
                    expect.anything(),
                    expect.objectContaining({
                        participantStatus: "APPROVED",
                        commentText: "Overall looks good",
                        lastReviewedCommit: "abc123"
                    })
                );
            });

            it("should handle 404", async() => {
                client.put.mockRejectedValueOnce(make404());

                const handler = toolHandlers.get("submitPendingReview")!;
                const result = await handler({
                    repoSlug: "my-repo",
                    pullRequestId: 999
                }) as ReturnType<typeof extractToolResponse>;
                const response = extractToolResponse(result as never);

                expect(response.status).toBe("FAILED");
                expect(response.message).toContain("not found");
            });
        });

        // ── discardPendingReview ─────────────────────────────────────────

        describe("discardPendingReview", () => {
            it("should discard a pending review", async() => {
                client.delete.mockResolvedValueOnce(undefined);

                const handler = toolHandlers.get("discardPendingReview")!;
                const result = await handler({
                    repoSlug: "my-repo",
                    pullRequestId: 1
                }) as ReturnType<typeof extractToolResponse>;
                const response = extractToolResponse(result as never);

                expect(response.status).toBe("COMPLETED");
                expect(response.message).toContain("discarded");
                expect(client.delete).toHaveBeenCalledWith(
                    expect.stringContaining("/review")
                );
            });

            it("should handle 404", async() => {
                client.delete.mockRejectedValueOnce(make404());

                const handler = toolHandlers.get("discardPendingReview")!;
                const result = await handler({
                    repoSlug: "my-repo",
                    pullRequestId: 999
                }) as ReturnType<typeof extractToolResponse>;
                const response = extractToolResponse(result as never);

                expect(response.status).toBe("FAILED");
                expect(response.message).toContain("not found");
            });
        });
    });

    // ── Cloud (unsupported) ──────────────────────────────────────────────

    describe("Cloud", () => {
        let toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<unknown>>;

        beforeEach(() => {
            ({ toolHandlers } = setupToolHandlers("cloud"));
        });

        it("addPendingReviewComment should reject on Cloud", async() => {
            const handler = toolHandlers.get("addPendingReviewComment")!;
            const result = await handler({
                repoSlug: "my-repo",
                pullRequestId: 1,
                content: "test"
            }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("FAILED");
            expect(response.message).toContain("Data Center");
        });

        it("getPendingReview should reject on Cloud", async() => {
            const handler = toolHandlers.get("getPendingReview")!;
            const result = await handler({
                repoSlug: "my-repo",
                pullRequestId: 1
            }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("FAILED");
            expect(response.message).toContain("Data Center");
        });

        it("submitPendingReview should reject on Cloud", async() => {
            const handler = toolHandlers.get("submitPendingReview")!;
            const result = await handler({
                repoSlug: "my-repo",
                pullRequestId: 1
            }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("FAILED");
            expect(response.message).toContain("Data Center");
        });

        it("discardPendingReview should reject on Cloud", async() => {
            const handler = toolHandlers.get("discardPendingReview")!;
            const result = await handler({
                repoSlug: "my-repo",
                pullRequestId: 1
            }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("FAILED");
            expect(response.message).toContain("Data Center");
        });
    });
});
