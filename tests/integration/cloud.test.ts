/**
 * Integration tests for Bitbucket Cloud API tool handlers.
 *
 * These tests exercise every registered tool via `callTool()` against the
 * Docker mock server running on port 7990 with Cloud paths (/2.0/...).
 *
 * Mirror of datacenter.test.ts — ensures 100% tool coverage on the Cloud
 * code path.
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { BitbucketClient } from "../../src/bitbucket/client.js";
import { PathBuilder } from "../../src/bitbucket/utils.js";
import { registerWorkspaceTools } from "../../src/tools/workspace.js";
import { registerRepositoryTools } from "../../src/tools/repositories.js";
import { registerPullRequestTools } from "../../src/tools/pull-requests.js";
import { registerCommentTools } from "../../src/tools/comments.js";
import { registerDiffTools } from "../../src/tools/diffs.js";
import { registerTaskTools } from "../../src/tools/tasks.js";
import { registerRefTools } from "../../src/tools/refs.js";

// ── Cloud-specific config ───────────────────────────────────────────────

const CLOUD_URL = "http://localhost:7990/2.0";
const CLOUD_TOKEN = "test-token";
const CLOUD_WORKSPACE = "test-workspace";
const CLOUD_REPO = "test-repo";
const CLOUD_PR_ID = 1;

const paths = new PathBuilder("cloud");

const client = new BitbucketClient({
    baseUrl: CLOUD_URL,
    token: CLOUD_TOKEN,
    timeout: 15_000,
    platform: "cloud"
});

// ── Helpers ──────────────────────────────────────────────────────────────

type ToolResult = {
    content: Array<{ type: string; text: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
};

type ToolResponse = {
    status: string;
    message: string;
    result: unknown;
};

function parseToolResult(raw: unknown): ToolResponse {
    const result = raw as ToolResult;

    return JSON.parse(result.content[0].text) as ToolResponse;
}

// ── Test suite ───────────────────────────────────────────────────────────

describe("Integration: Bitbucket Cloud (mock)", () => {
    let toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<unknown>>;

    beforeAll(async() => {
        // Wait for mock server to be reachable
        const start = Date.now();

        while (Date.now() - start < 30_000) {
            try {
                await client.get("/user");
                break;
            } catch {
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        // Register all tools and capture handlers
        const server = new McpServer({ name: "cloud-integration-test", version: "0.0.1" });

        toolHandlers = new Map();

        const originalRegisterTool = server.registerTool.bind(server);

        server.registerTool = ((...args: unknown[]) => {
            const name = args[0] as string;
            const handler = args[args.length - 1] as (args: Record<string, unknown>) => Promise<unknown>;

            toolHandlers.set(name, handler);

            return originalRegisterTool(...(args as Parameters<typeof originalRegisterTool>));
        }) as typeof server.registerTool;

        registerWorkspaceTools(server, client, paths, CLOUD_WORKSPACE);
        registerRepositoryTools(server, client, paths, CLOUD_WORKSPACE);
        registerPullRequestTools(server, client, paths, CLOUD_WORKSPACE);
        registerCommentTools(server, client, paths, CLOUD_WORKSPACE);
        registerDiffTools(server, client, paths, CLOUD_WORKSPACE);
        registerTaskTools(server, client, paths, CLOUD_WORKSPACE);
        registerRefTools(server, client, paths, CLOUD_WORKSPACE);
    }, 60_000);

    async function callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResponse> {
        const handler = toolHandlers.get(name);

        if (!handler) throw new Error(`Tool "${name}" is not registered`);

        return parseToolResult(await handler(args));
    }

    // ── Workspace / Connectivity ─────────────────────────────────────

    describe("getCurrentUser", () => {
        it("should return the current user", async() => {
            const res = await callTool("getCurrentUser");

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("Authenticated");

            const user = res.result as Record<string, unknown>;

            expect(user.nickname).toBe("admin");
        });
    });

    describe("getWorkspace", () => {
        it("should return workspace details", async() => {
            const res = await callTool("getWorkspace");

            expect(res.status).toBe("COMPLETED");

            const ws = res.result as Record<string, unknown>;

            expect(ws.slug).toBe("test-workspace");
            expect(ws.name).toBe("Integration Test Workspace");
        });

        it("should return not found for a non-existent workspace", async() => {
            const res = await callTool("getWorkspace", { workspace: "nonexistent-ws-xyz" });

            expect(res.status).toBe("FAILED");
        });
    });

    // ── Repositories ─────────────────────────────────────────────────

    describe("listRepositories", () => {
        it("should list repositories in the workspace", async() => {
            const res = await callTool("listRepositories", { pagelen: 10 });

            expect(res.status).toBe("COMPLETED");

            const repos = res.result as Array<Record<string, unknown>>;

            expect(Array.isArray(repos)).toBe(true);
            expect(repos.length).toBe(2);
            expect(repos[0]).toHaveProperty("slug");
            expect(repos[0].slug).toBe("test-repo");
        });
    });

    describe("getRepository", () => {
        it("should return repository details", async() => {
            const res = await callTool("getRepository", { repoSlug: CLOUD_REPO });

            expect(res.status).toBe("COMPLETED");

            const repo = res.result as Record<string, unknown>;

            expect(repo.slug).toBe("test-repo");
            expect(repo.full_name).toBe("test-workspace/test-repo");
        });

        it("should return not found for a non-existent repo", async() => {
            const res = await callTool("getRepository", { repoSlug: "nonexistent-repo-xyz" });

            expect(res.status).toBe("FAILED");
        });
    });

    // ── Branches & Tags ──────────────────────────────────────────────

    describe("listBranches", () => {
        it("should list branches for a repository", async() => {
            const res = await callTool("listBranches", { repoSlug: CLOUD_REPO });

            expect(res.status).toBe("COMPLETED");

            const branches = res.result as Array<Record<string, unknown>>;

            expect(Array.isArray(branches)).toBe(true);
            expect(branches.length).toBeGreaterThan(0);
        });
    });

    describe("listTags", () => {
        it("should list tags for a repository", async() => {
            const res = await callTool("listTags", { repoSlug: CLOUD_REPO });

            expect(res.status).toBe("COMPLETED");

            const tags = res.result as Array<Record<string, unknown>>;

            expect(Array.isArray(tags)).toBe(true);
            expect(tags.length).toBeGreaterThan(0);
        });
    });

    // ── Pull Requests ────────────────────────────────────────────────

    describe("getPullRequests", () => {
        it("should list open pull requests", async() => {
            const res = await callTool("getPullRequests", { repoSlug: CLOUD_REPO, state: "OPEN" });

            expect(res.status).toBe("COMPLETED");

            const prs = res.result as Array<Record<string, unknown>>;

            expect(Array.isArray(prs)).toBe(true);
            expect(prs.length).toBeGreaterThan(0);
            expect(prs[0]).toHaveProperty("id");
            expect(prs[0]).toHaveProperty("title");
            expect(prs[0]).toHaveProperty("source");
            expect(prs[0]).toHaveProperty("destination");
        });
    });

    describe("getPullRequest", () => {
        it("should return pull request details", async() => {
            const res = await callTool("getPullRequest", { repoSlug: CLOUD_REPO, pullRequestId: CLOUD_PR_ID });

            expect(res.status).toBe("COMPLETED");

            const pr = res.result as Record<string, unknown>;

            expect(pr.id).toBe(CLOUD_PR_ID);
            expect(pr.title).toBe("Add new feature");
            expect(pr.state).toBe("OPEN");
            expect(pr).toHaveProperty("source");
            expect(pr).toHaveProperty("destination");
        });

        it("should return not found for a non-existent PR", async() => {
            const res = await callTool("getPullRequest", { repoSlug: CLOUD_REPO, pullRequestId: 999999 });

            expect(res.status).toBe("FAILED");
        });
    });

    describe("updatePullRequest", () => {
        it("should update the PR title", async() => {
            const res = await callTool("updatePullRequest", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID,
                title: "Updated title via Cloud test"
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("updated");

            const pr = res.result as Record<string, unknown>;

            expect(pr.title).toBe("Updated title via Cloud test");
        });
    });

    describe("getPullRequestActivity", () => {
        it("should return pull request activities", async() => {
            const res = await callTool("getPullRequestActivity", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID,
                pagelen: 10
            });

            expect(res.status).toBe("COMPLETED");

            const activities = res.result as Array<Record<string, unknown>>;

            expect(Array.isArray(activities)).toBe(true);
            expect(activities.length).toBeGreaterThan(0);
        });
    });

    describe("getPullRequestCommits", () => {
        it("should return pull request commits", async() => {
            const res = await callTool("getPullRequestCommits", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID,
                pagelen: 5
            });

            expect(res.status).toBe("COMPLETED");

            const commits = res.result as Array<Record<string, unknown>>;

            expect(Array.isArray(commits)).toBe(true);
            expect(commits.length).toBeGreaterThan(0);
            expect(commits[0]).toHaveProperty("hash");
            expect(commits[0]).toHaveProperty("message");
        });
    });

    // ── PR Actions ───────────────────────────────────────────────────

    describe("approvePullRequest / unapprovePullRequest", () => {
        it("should approve the PR", async() => {
            const res = await callTool("approvePullRequest", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("approved");
        });

        it("should remove approval", async() => {
            const res = await callTool("unapprovePullRequest", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("removed");
        });
    });

    describe("requestChanges / removeChangeRequest", () => {
        it("should request changes on the PR", async() => {
            const res = await callTool("requestChanges", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID
            });

            expect(res.status).toBe("COMPLETED");
        });

        it("should remove the change request", async() => {
            const res = await callTool("removeChangeRequest", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID
            });

            expect(res.status).toBe("COMPLETED");
        });
    });

    // ── PR Lifecycle: create → decline ───────────────────────────────

    describe("createPullRequest → declinePullRequest", () => {
        let createdPrId: number | undefined;

        it("createPullRequest should create a new PR", async() => {
            const res = await callTool("createPullRequest", {
                repoSlug: CLOUD_REPO,
                title: "Cloud test PR",
                description: "Automated Cloud integration test",
                sourceBranch: "feature/test-branch",
                targetBranch: "main"
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("created");

            const pr = res.result as { id: number; state: string; title: string };

            expect(pr.id).toBeDefined();
            expect(pr.state).toBe("OPEN");
            expect(pr.title).toBe("Cloud test PR");
            createdPrId = pr.id;
        });

        it("declinePullRequest should decline the PR", async() => {
            if (!createdPrId) return;

            const res = await callTool("declinePullRequest", {
                repoSlug: CLOUD_REPO,
                pullRequestId: createdPrId,
                message: "Closing test PR"
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("declined");

            const pr = res.result as Record<string, unknown>;

            expect(pr.state).toBe("DECLINED");
        });
    });

    // ── PR Lifecycle: merge ──────────────────────────────────────────

    describe("mergePullRequest", () => {
        it("should merge the PR", async() => {
            const res = await callTool("mergePullRequest", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID,
                message: "Merge via Cloud test"
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("merged");

            const pr = res.result as Record<string, unknown>;

            expect(pr.state).toBe("MERGED");
        });
    });

    // ── Diffs ────────────────────────────────────────────────────────

    describe("getPullRequestDiff", () => {
        it("should return a raw text diff", async() => {
            const res = await callTool("getPullRequestDiff", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID
            });

            expect(res.status).toBe("COMPLETED");
            expect(typeof res.result).toBe("string");
            expect((res.result as string)).toContain("diff --git");
        });
    });

    describe("getPullRequestDiffStat", () => {
        it("should return diff statistics", async() => {
            const res = await callTool("getPullRequestDiffStat", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID
            });

            expect(res.status).toBe("COMPLETED");

            const stats = res.result as Array<Record<string, unknown>>;

            expect(Array.isArray(stats)).toBe(true);
            expect(stats.length).toBeGreaterThan(0);
            expect(stats[0]).toHaveProperty("status");
        });
    });

    describe("getPullRequestPatch", () => {
        it("should return the patch content", async() => {
            const res = await callTool("getPullRequestPatch", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID
            });

            expect(res.status).toBe("COMPLETED");
            expect(typeof res.result).toBe("string");
        });
    });

    // ── Comments CRUD lifecycle ──────────────────────────────────────

    describe("comments (CRUD lifecycle)", () => {
        let createdCommentId: number | undefined;

        it("getPullRequestComments should list comments", async() => {
            const res = await callTool("getPullRequestComments", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID
            });

            expect(res.status).toBe("COMPLETED");

            const comments = res.result as Array<Record<string, unknown>>;

            expect(Array.isArray(comments)).toBe(true);
            expect(comments.length).toBeGreaterThanOrEqual(1);
        });

        it("addPullRequestComment should add a general comment", async() => {
            const res = await callTool("addPullRequestComment", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID,
                content: "Cloud integration test comment"
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("added");

            const comment = res.result as { id: number };

            expect(comment.id).toBeDefined();
            createdCommentId = comment.id;
        });

        it("getPullRequestComment should get the created comment", async() => {
            if (!createdCommentId) return;

            const res = await callTool("getPullRequestComment", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID,
                commentId: createdCommentId
            });

            expect(res.status).toBe("COMPLETED");

            const comment = res.result as { id: number };

            expect(comment.id).toBe(createdCommentId);
        });

        it("updatePullRequestComment should update the comment text", async() => {
            if (!createdCommentId) return;

            const res = await callTool("updatePullRequestComment", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID,
                commentId: createdCommentId,
                content: "Cloud integration test comment - UPDATED"
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("updated");
        });

        it("resolveComment should resolve the comment thread", async() => {
            if (!createdCommentId) return;

            const res = await callTool("resolveComment", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID,
                commentId: createdCommentId
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("resolved");
        });

        it("reopenComment should reopen a resolved comment thread", async() => {
            if (!createdCommentId) return;

            const res = await callTool("reopenComment", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID,
                commentId: createdCommentId
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("reopened");
        });

        it("deletePullRequestComment should delete the comment", async() => {
            if (!createdCommentId) return;

            const res = await callTool("deletePullRequestComment", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID,
                commentId: createdCommentId
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("deleted");
        });

        it("getPullRequestComment should return not found after deletion", async() => {
            if (!createdCommentId) return;

            const res = await callTool("getPullRequestComment", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID,
                commentId: createdCommentId
            });

            expect(res.status).toBe("FAILED");
        });
    });

    // ── Tasks CRUD lifecycle ─────────────────────────────────────────

    describe("tasks (CRUD lifecycle)", () => {
        let createdTaskId: number | undefined;

        it("getPullRequestTasks should list existing tasks", async() => {
            const res = await callTool("getPullRequestTasks", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID
            });

            expect(res.status).toBe("COMPLETED");

            const tasks = res.result as Array<Record<string, unknown>>;

            expect(Array.isArray(tasks)).toBe(true);
            expect(tasks.length).toBeGreaterThanOrEqual(1);
        });

        it("createPullRequestTask should create a task", async() => {
            const res = await callTool("createPullRequestTask", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID,
                content: "Cloud integration test task"
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("created");

            const task = res.result as { id: number };

            expect(task.id).toBeDefined();
            createdTaskId = task.id;
        });

        it("getPullRequestTask should get the created task", async() => {
            if (!createdTaskId) return;

            const res = await callTool("getPullRequestTask", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID,
                taskId: createdTaskId
            });

            expect(res.status).toBe("COMPLETED");

            const task = res.result as { id: number };

            expect(task.id).toBe(createdTaskId);
        });

        it("updatePullRequestTask should resolve the task", async() => {
            if (!createdTaskId) return;

            const res = await callTool("updatePullRequestTask", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID,
                taskId: createdTaskId,
                state: "RESOLVED"
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("updated");
        });

        it("deletePullRequestTask should delete the task", async() => {
            if (!createdTaskId) return;

            const res = await callTool("deletePullRequestTask", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID,
                taskId: createdTaskId
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("deleted");
        });
    });

    // ── PR Statuses ──────────────────────────────────────────────────

    describe("getPullRequestStatuses", () => {
        it("should return build statuses", async() => {
            const res = await callTool("getPullRequestStatuses", {
                repoSlug: CLOUD_REPO,
                pullRequestId: CLOUD_PR_ID
            });

            expect(res.status).toBe("COMPLETED");

            const statuses = res.result as Array<Record<string, unknown>>;

            expect(Array.isArray(statuses)).toBe(true);
            expect(statuses.length).toBeGreaterThan(0);
            expect(statuses[0]).toHaveProperty("state");
        });
    });
});
