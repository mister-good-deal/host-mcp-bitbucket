import { describe, it, expect, beforeEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerPullRequestTools } from "../../../src/tools/pull-requests.js";
import { createMockClient, extractToolResponse, make404 } from "./helpers.js";

describe("Pull Request Tools", () => {
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

        registerPullRequestTools(server, client, "default-ws");
    });

    describe("getPullRequests", () => {
        it("should return pull requests for a repository", async() => {
            const mockPRs = [
                { id: 1, title: "PR 1", state: "OPEN" },
                { id: 2, title: "PR 2", state: "MERGED" }
            ];

            client.getPaginated.mockResolvedValueOnce({ values: mockPRs, total: 2 });

            const handler = toolHandlers.get("getPullRequests")!;
            const result = await handler({ repoSlug: "my-repo" }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.result).toEqual(mockPRs);
        });

        it("should pass state filter", async() => {
            client.getPaginated.mockResolvedValueOnce({ values: [], total: 0 });

            const handler = toolHandlers.get("getPullRequests")!;

            await handler({ repoSlug: "my-repo", state: "OPEN" });

            expect(client.getPaginated).toHaveBeenCalledWith(
                "/repositories/default-ws/my-repo/pullrequests",
                expect.anything(),
                expect.objectContaining({ state: "OPEN" })
            );
        });

        it("should handle 404 for non-existent repository", async() => {
            client.getPaginated.mockRejectedValueOnce(make404());

            const handler = toolHandlers.get("getPullRequests")!;
            const result = await handler({ repoSlug: "nonexistent" }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("FAILED");
            expect(response.message).toContain("not found");
        });
    });

    describe("createPullRequest", () => {
        it("should create a pull request", async() => {
            const mockPR = { id: 42, title: "New Feature", state: "OPEN" };

            client.post.mockResolvedValueOnce(mockPR);

            const handler = toolHandlers.get("createPullRequest")!;
            const result = await handler({
                repoSlug: "my-repo",
                title: "New Feature",
                sourceBranch: "feature/new",
                targetBranch: "main"
            }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.message).toContain("created");
            expect(response.result).toEqual(mockPR);
            expect(client.post).toHaveBeenCalledWith(
                "/repositories/default-ws/my-repo/pullrequests",
                expect.objectContaining({
                    title: "New Feature",
                    source: { branch: { name: "feature/new" }},
                    destination: { branch: { name: "main" }}
                })
            );
        });

        it("should pass optional fields", async() => {
            client.post.mockResolvedValueOnce({ id: 1 });

            const handler = toolHandlers.get("createPullRequest")!;

            await handler({
                repoSlug: "my-repo",
                title: "PR",
                sourceBranch: "feat",
                targetBranch: "main",
                description: "Description",
                reviewers: ["uuid-1", "uuid-2"],
                draft: true,
                closeSourceBranch: true
            });

            expect(client.post).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    description: "Description",
                    reviewers: [{ uuid: "uuid-1" }, { uuid: "uuid-2" }],
                    draft: true,
                    close_source_branch: true
                })
            );
        });

        it("should handle errors", async() => {
            client.post.mockRejectedValueOnce(new Error("Bad Request"));

            const handler = toolHandlers.get("createPullRequest")!;
            const result = await handler({
                repoSlug: "my-repo",
                title: "PR",
                sourceBranch: "feat",
                targetBranch: "main"
            }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("FAILED");
            expect(response.message).toContain("Unexpected error");
        });
    });

    describe("getPullRequest", () => {
        it("should return a single pull request", async() => {
            const mockPR = { id: 1, title: "PR 1", state: "OPEN" };

            client.get.mockResolvedValueOnce(mockPR);

            const handler = toolHandlers.get("getPullRequest")!;
            const result = await handler({ repoSlug: "my-repo", pullRequestId: 1 }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.result).toEqual(mockPR);
            expect(client.get).toHaveBeenCalledWith("/repositories/default-ws/my-repo/pullrequests/1");
        });

        it("should handle 404", async() => {
            client.get.mockRejectedValueOnce(make404());

            const handler = toolHandlers.get("getPullRequest")!;
            const result = await handler({ repoSlug: "my-repo", pullRequestId: 999 }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("FAILED");
            expect(response.message).toContain("not found");
        });
    });

    describe("updatePullRequest", () => {
        it("should update a pull request", async() => {
            const mockPR = { id: 1, title: "Updated Title" };

            client.put.mockResolvedValueOnce(mockPR);

            const handler = toolHandlers.get("updatePullRequest")!;
            const result = await handler({
                repoSlug: "my-repo",
                pullRequestId: 1,
                title: "Updated Title"
            }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.message).toContain("updated");
        });
    });

    describe("approvePullRequest", () => {
        it("should approve a pull request", async() => {
            client.post.mockResolvedValueOnce({ approved: true });

            const handler = toolHandlers.get("approvePullRequest")!;
            const result = await handler({ repoSlug: "my-repo", pullRequestId: 1 }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.message).toContain("approved");
        });
    });

    describe("unapprovePullRequest", () => {
        it("should remove approval", async() => {
            client.delete.mockResolvedValueOnce(undefined);

            const handler = toolHandlers.get("unapprovePullRequest")!;
            const result = await handler({ repoSlug: "my-repo", pullRequestId: 1 }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.message).toContain("removed");
        });
    });

    describe("requestChanges", () => {
        it("should request changes on a pull request", async() => {
            client.post.mockResolvedValueOnce({});

            const handler = toolHandlers.get("requestChanges")!;
            const result = await handler({ repoSlug: "my-repo", pullRequestId: 1 }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.message).toContain("requested");
        });
    });

    describe("removeChangeRequest", () => {
        it("should remove a change request", async() => {
            client.delete.mockResolvedValueOnce(undefined);

            const handler = toolHandlers.get("removeChangeRequest")!;
            const result = await handler({ repoSlug: "my-repo", pullRequestId: 1 }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.message).toContain("removed");
        });
    });

    describe("declinePullRequest", () => {
        it("should decline a pull request", async() => {
            client.post.mockResolvedValueOnce({ state: "DECLINED" });

            const handler = toolHandlers.get("declinePullRequest")!;
            const result = await handler({ repoSlug: "my-repo", pullRequestId: 1 }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.message).toContain("declined");
        });

        it("should pass decline message", async() => {
            client.post.mockResolvedValueOnce({ state: "DECLINED" });

            const handler = toolHandlers.get("declinePullRequest")!;

            await handler({ repoSlug: "my-repo", pullRequestId: 1, message: "Not needed" });

            expect(client.post).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ message: "Not needed" })
            );
        });
    });

    describe("mergePullRequest", () => {
        it("should merge a pull request", async() => {
            client.post.mockResolvedValueOnce({ state: "MERGED" });

            const handler = toolHandlers.get("mergePullRequest")!;
            const result = await handler({ repoSlug: "my-repo", pullRequestId: 1 }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.message).toContain("merged");
        });

        it("should pass merge strategy and message", async() => {
            client.post.mockResolvedValueOnce({ state: "MERGED" });

            const handler = toolHandlers.get("mergePullRequest")!;

            await handler({
                repoSlug: "my-repo",
                pullRequestId: 1,
                message: "Merged!",
                mergeStrategy: "squash",
                closeSourceBranch: true
            });

            expect(client.post).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    message: "Merged!",
                    merge_strategy: "squash",
                    close_source_branch: true
                })
            );
        });
    });

    describe("getPullRequestCommits", () => {
        it("should return commits for a pull request", async() => {
            const mockCommits = [{ hash: "abc123", message: "Commit 1" }];

            client.getPaginated.mockResolvedValueOnce({ values: mockCommits, total: 1 });

            const handler = toolHandlers.get("getPullRequestCommits")!;
            const result = await handler({ repoSlug: "my-repo", pullRequestId: 1 }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.result).toEqual(mockCommits);
        });
    });

    describe("getPullRequestStatuses", () => {
        it("should return statuses for a pull request", async() => {
            const mockStatuses = [{ state: "SUCCESSFUL", key: "build/123" }];

            client.getPaginated.mockResolvedValueOnce({ values: mockStatuses, total: 1 });

            const handler = toolHandlers.get("getPullRequestStatuses")!;
            const result = await handler({ repoSlug: "my-repo", pullRequestId: 1 }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.result).toEqual(mockStatuses);
        });
    });

    describe("getPullRequestActivity", () => {
        it("should return activity log for a pull request", async() => {
            const mockActivity = [{ type: "approval" }, { type: "comment" }];

            client.getPaginated.mockResolvedValueOnce({ values: mockActivity, total: 2 });

            const handler = toolHandlers.get("getPullRequestActivity")!;
            const result = await handler({ repoSlug: "my-repo", pullRequestId: 1 }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.result).toEqual(mockActivity);
        });
    });
});
