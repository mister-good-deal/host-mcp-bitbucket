import { describe, it, expect, beforeEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerTaskTools } from "../../../src/tools/tasks.js";
import { createMockClient, createPaths, extractToolResponse, make404 } from "./helpers.js";

describe("Task Tools", () => {
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

        registerTaskTools(server, client, paths, "default-ws");
    });

    describe("getPullRequestTasks", () => {
        it("should return tasks for a pull request", async() => {
            const mockTasks = [
                { id: 1, content: { raw: "Fix bug" }, state: "OPEN" },
                { id: 2, content: { raw: "Update docs" }, state: "RESOLVED" }
            ];

            client.getPaginated.mockResolvedValueOnce({ values: mockTasks, total: 2 });

            const handler = toolHandlers.get("getPullRequestTasks")!;
            const result = await handler({ repoSlug: "my-repo", pullRequestId: 1 }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.result).toEqual(mockTasks);
        });

        it("should handle 404", async() => {
            client.getPaginated.mockRejectedValueOnce(make404());

            const handler = toolHandlers.get("getPullRequestTasks")!;
            const result = await handler({ repoSlug: "my-repo", pullRequestId: 999 }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("FAILED");
            expect(response.message).toContain("not found");
        });
    });

    describe("createPullRequestTask", () => {
        it("should create a task", async() => {
            const mockTask = { id: 10, content: { raw: "New task" }, state: "OPEN" };

            client.post.mockResolvedValueOnce(mockTask);

            const handler = toolHandlers.get("createPullRequestTask")!;
            const result = await handler({
                repoSlug: "my-repo",
                pullRequestId: 1,
                content: "New task"
            }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.message).toContain("created");
            expect(client.post).toHaveBeenCalledWith(
                expect.stringContaining("/tasks"),
                expect.objectContaining({
                    content: { raw: "New task" }
                })
            );
        });

        it("should attach task to a comment", async() => {
            client.post.mockResolvedValueOnce({ id: 11 });

            const handler = toolHandlers.get("createPullRequestTask")!;

            await handler({
                repoSlug: "my-repo",
                pullRequestId: 1,
                content: "Fix this",
                commentId: 42
            });

            expect(client.post).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    comment: { id: 42 }
                })
            );
        });

        it("should pass initial state", async() => {
            client.post.mockResolvedValueOnce({ id: 12 });

            const handler = toolHandlers.get("createPullRequestTask")!;

            await handler({
                repoSlug: "my-repo",
                pullRequestId: 1,
                content: "Already done",
                state: "RESOLVED"
            });

            expect(client.post).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    state: "RESOLVED"
                })
            );
        });
    });

    describe("getPullRequestTask", () => {
        it("should return a specific task", async() => {
            const mockTask = { id: 42, content: { raw: "Fix it" }, state: "OPEN" };

            client.get.mockResolvedValueOnce(mockTask);

            const handler = toolHandlers.get("getPullRequestTask")!;
            const result = await handler({
                repoSlug: "my-repo",
                pullRequestId: 1,
                taskId: 42
            }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.result).toEqual(mockTask);
        });

        it("should handle 404", async() => {
            client.get.mockRejectedValueOnce(make404());

            const handler = toolHandlers.get("getPullRequestTask")!;
            const result = await handler({
                repoSlug: "my-repo",
                pullRequestId: 1,
                taskId: 999
            }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("FAILED");
            expect(response.message).toContain("not found");
        });
    });

    describe("updatePullRequestTask", () => {
        it("should update a task", async() => {
            const mockTask = { id: 42, content: { raw: "Updated" }, state: "RESOLVED" };

            client.put.mockResolvedValueOnce(mockTask);

            const handler = toolHandlers.get("updatePullRequestTask")!;
            const result = await handler({
                repoSlug: "my-repo",
                pullRequestId: 1,
                taskId: 42,
                content: "Updated",
                state: "RESOLVED"
            }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.message).toContain("updated");
        });
    });

    describe("deletePullRequestTask", () => {
        it("should delete a task", async() => {
            client.delete.mockResolvedValueOnce(undefined);

            const handler = toolHandlers.get("deletePullRequestTask")!;
            const result = await handler({
                repoSlug: "my-repo",
                pullRequestId: 1,
                taskId: 42
            }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.message).toContain("deleted");
        });

        it("should handle 404", async() => {
            client.delete.mockRejectedValueOnce(make404());

            const handler = toolHandlers.get("deletePullRequestTask")!;
            const result = await handler({
                repoSlug: "my-repo",
                pullRequestId: 1,
                taskId: 999
            }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("FAILED");
            expect(response.message).toContain("not found");
        });
    });
});
