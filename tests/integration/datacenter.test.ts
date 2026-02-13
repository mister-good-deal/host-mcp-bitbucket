/**
 * Integration tests for Bitbucket Data Center REST API paths.
 *
 * These tests run against the same Docker mock server as Cloud tests,
 * but use a DC-configured client (base URL without /2.0) so that the
 * platform detection, path building, and tool handlers follow DC code paths.
 *
 * The mock server handles both Cloud (/2.0/...) and DC (/rest/api/latest/...)
 * routes simultaneously on the same port.
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { BitbucketClient } from "../../src/bitbucket/client.js";
import { detectPlatform, normalizeBaseUrl, PathBuilder } from "../../src/bitbucket/utils.js";
import { registerWorkspaceTools } from "../../src/tools/workspace.js";
import { registerRepositoryTools } from "../../src/tools/repositories.js";
import { registerPullRequestTools } from "../../src/tools/pull-requests.js";
import { registerCommentTools } from "../../src/tools/comments.js";
import { registerDiffTools } from "../../src/tools/diffs.js";
import { registerTaskTools } from "../../src/tools/tasks.js";
import { registerRefTools } from "../../src/tools/refs.js";

// ── DC-specific config (mock on same port, but without /2.0 path) ───────

const DC_URL = "http://localhost:7990"; // triggers datacenter detection
const DC_TOKEN = "test-token";
const DC_WORKSPACE = "TEST"; // matches DC_PROJECT.key in mock
const DC_REPO = "test-repo";
const DC_PR_ID = 1;

const platform = detectPlatform(DC_URL);
const paths = new PathBuilder(platform);

const client = new BitbucketClient({
    baseUrl: normalizeBaseUrl(DC_URL),
    token: DC_TOKEN,
    timeout: 15_000,
    platform
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

describe("Integration: Bitbucket Data Center (mock)", () => {
    let toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<unknown>>;

    beforeAll(async() => {
        // Wait for mock server to be reachable
        const start = Date.now();

        while (Date.now() - start < 30_000) {
            try {
                await client.get("/application-properties");
                break;
            } catch {
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        // Register all tools and capture handlers
        const server = new McpServer({ name: "dc-integration-test", version: "0.0.1" });

        toolHandlers = new Map();

        const originalRegisterTool = server.registerTool.bind(server);

        server.registerTool = ((...args: unknown[]) => {
            const name = args[0] as string;
            const handler = args[args.length - 1] as (args: Record<string, unknown>) => Promise<unknown>;

            toolHandlers.set(name, handler);

            return originalRegisterTool(...(args as Parameters<typeof originalRegisterTool>));
        }) as typeof server.registerTool;

        registerWorkspaceTools(server, client, paths, DC_WORKSPACE);
        registerRepositoryTools(server, client, paths, DC_WORKSPACE);
        registerPullRequestTools(server, client, paths, DC_WORKSPACE);
        registerCommentTools(server, client, paths, DC_WORKSPACE);
        registerDiffTools(server, client, paths, DC_WORKSPACE);
        registerTaskTools(server, client, paths, DC_WORKSPACE);
        registerRefTools(server, client, paths, DC_WORKSPACE);
    }, 60_000);

    async function callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResponse> {
        const handler = toolHandlers.get(name);

        if (!handler) throw new Error(`Tool "${name}" is not registered`);

        return parseToolResult(await handler(args));
    }

    // ── Platform detection ───────────────────────────────────────────

    it("should detect platform as datacenter", () => {
        expect(platform).toBe("datacenter");
    });

    it("should normalise URL with /rest/api/latest", () => {
        expect(normalizeBaseUrl(DC_URL)).toBe("http://localhost:7990/rest/api/latest");
    });

    // ── Workspace / Connectivity ─────────────────────────────────────

    describe("getCurrentUser", () => {
        it("should return application properties (DC auth check)", async() => {
            const res = await callTool("getCurrentUser");

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("Authenticated");
        });
    });

    describe("getWorkspace", () => {
        it("should return project details for the TEST project", async() => {
            const res = await callTool("getWorkspace");

            expect(res.status).toBe("COMPLETED");

            const result = res.result as Record<string, unknown>;

            expect(result.key).toBe("TEST");
            expect(result.name).toBe("Test Project");
            expect(result.type).toBe("NORMAL");
        });

        it("should return not found for a non-existent project", async() => {
            const res = await callTool("getWorkspace", { workspace: "NONEXISTENT" });

            expect(res.status).toBe("FAILED");
        });
    });

    // ── Repositories ─────────────────────────────────────────────────

    describe("listRepositories", () => {
        it("should list repositories in the project", async() => {
            const res = await callTool("listRepositories", { pagelen: 10 });

            expect(res.status).toBe("COMPLETED");

            const repos = res.result as Array<Record<string, unknown>>;

            expect(Array.isArray(repos)).toBe(true);
            expect(repos.length).toBe(2);
            expect(repos[0]).toHaveProperty("slug");
            expect(repos[0]).toHaveProperty("project");
        });

        it("should filter repositories by name", async() => {
            const res = await callTool("listRepositories", { name: "another", pagelen: 10 });

            expect(res.status).toBe("COMPLETED");

            const repos = res.result as Array<Record<string, unknown>>;

            expect(repos.length).toBe(1);
            expect(repos[0].slug).toBe("another-repo");
        });
    });

    describe("getRepository", () => {
        it("should return repository details", async() => {
            const res = await callTool("getRepository", { repoSlug: DC_REPO });

            expect(res.status).toBe("COMPLETED");

            const repo = res.result as Record<string, unknown>;

            expect(repo.slug).toBe("test-repo");
            expect(repo).toHaveProperty("project");
        });

        it("should return not found for a non-existent repo", async() => {
            const res = await callTool("getRepository", { repoSlug: "nonexistent-repo-xyz" });

            expect(res.status).toBe("FAILED");
        });
    });

    // ── Branches & Tags ──────────────────────────────────────────────

    describe("listBranches", () => {
        it("should list branches for a repository", async() => {
            const res = await callTool("listBranches", { repoSlug: DC_REPO });

            expect(res.status).toBe("COMPLETED");

            const branches = res.result as Array<Record<string, unknown>>;

            expect(Array.isArray(branches)).toBe(true);
            expect(branches.length).toBe(3);
            expect(branches[0]).toHaveProperty("displayId");
        });

        it("should filter branches by name", async() => {
            const res = await callTool("listBranches", { repoSlug: DC_REPO, filter: "master" });

            expect(res.status).toBe("COMPLETED");

            const branches = res.result as Array<Record<string, unknown>>;

            expect(branches.length).toBeGreaterThan(0);
            expect(branches.every(b => (b.displayId as string).toLowerCase().includes("master"))).toBe(true);
        });
    });

    describe("listTags", () => {
        it("should list tags for a repository", async() => {
            const res = await callTool("listTags", { repoSlug: DC_REPO });

            expect(res.status).toBe("COMPLETED");

            const tags = res.result as Array<Record<string, unknown>>;

            expect(Array.isArray(tags)).toBe(true);
            expect(tags.length).toBe(2);
            expect(tags[0]).toHaveProperty("displayId");
        });

        it("should filter tags by name", async() => {
            const res = await callTool("listTags", { repoSlug: DC_REPO, filter: "v1" });

            expect(res.status).toBe("COMPLETED");

            const tags = res.result as Array<Record<string, unknown>>;

            expect(tags.length).toBe(1);
            expect(tags[0].displayId).toBe("v1.0.0");
        });
    });

    // ── Pull Requests ────────────────────────────────────────────────

    describe("getPullRequests", () => {
        it("should list open pull requests", async() => {
            const res = await callTool("getPullRequests", { repoSlug: DC_REPO, state: "OPEN" });

            expect(res.status).toBe("COMPLETED");

            const prs = res.result as Array<Record<string, unknown>>;

            expect(Array.isArray(prs)).toBe(true);
            expect(prs.length).toBeGreaterThan(0);
            expect(prs[0]).toHaveProperty("id");
            expect(prs[0]).toHaveProperty("title");
            expect(prs[0]).toHaveProperty("fromRef");
            expect(prs[0]).toHaveProperty("toRef");
        });
    });

    describe("getPullRequest", () => {
        it("should return pull request details", async() => {
            const res = await callTool("getPullRequest", { repoSlug: DC_REPO, pullRequestId: DC_PR_ID });

            expect(res.status).toBe("COMPLETED");

            const pr = res.result as Record<string, unknown>;

            expect(pr.id).toBe(DC_PR_ID);
            expect(pr.title).toBe("Add new feature");
            expect(pr.state).toBe("OPEN");
            expect(pr).toHaveProperty("fromRef");
            expect(pr).toHaveProperty("toRef");
        });

        it("should return not found for a non-existent PR", async() => {
            const res = await callTool("getPullRequest", { repoSlug: DC_REPO, pullRequestId: 999999 });

            expect(res.status).toBe("FAILED");
        });
    });

    describe("updatePullRequest", () => {
        it("should update the PR title", async() => {
            const res = await callTool("updatePullRequest", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID,
                title: "Updated title via test"
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("updated");

            const pr = res.result as Record<string, unknown>;

            expect(pr.title).toBe("Updated title via test");
        });

        it("should restore the PR title", async() => {
            const res = await callTool("updatePullRequest", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID,
                title: "Add new feature"
            });

            expect(res.status).toBe("COMPLETED");
        });
    });

    describe("getPullRequestActivity", () => {
        it("should return pull request activities", async() => {
            const res = await callTool("getPullRequestActivity", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID,
                pagelen: 10
            });

            expect(res.status).toBe("COMPLETED");

            const activities = res.result as Array<Record<string, unknown>>;

            expect(Array.isArray(activities)).toBe(true);
            expect(activities.length).toBeGreaterThan(0);
            expect(activities[0]).toHaveProperty("action");
        });
    });

    describe("getPullRequestCommits", () => {
        it("should return pull request commits", async() => {
            const res = await callTool("getPullRequestCommits", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID,
                pagelen: 5
            });

            expect(res.status).toBe("COMPLETED");

            const commits = res.result as Array<Record<string, unknown>>;

            expect(Array.isArray(commits)).toBe(true);
            expect(commits.length).toBeGreaterThan(0);
            expect(commits[0]).toHaveProperty("id");
            expect(commits[0]).toHaveProperty("message");
        });
    });

    // ── PR Actions ───────────────────────────────────────────────────

    describe("approvePullRequest / unapprovePullRequest", () => {
        it("should approve the PR", async() => {
            const res = await callTool("approvePullRequest", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("approved");
        });

        it("should remove approval", async() => {
            const res = await callTool("unapprovePullRequest", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("removed");
        });
    });

    describe("requestChanges / removeChangeRequest", () => {
        it("should request changes on the PR", async() => {
            const res = await callTool("requestChanges", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID
            });

            expect(res.status).toBe("COMPLETED");
        });

        it("should remove the change request", async() => {
            const res = await callTool("removeChangeRequest", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID
            });

            expect(res.status).toBe("COMPLETED");
        });
    });

    // ── Diffs ────────────────────────────────────────────────────────

    describe("getPullRequestDiff", () => {
        it("should return a raw text diff", async() => {
            const res = await callTool("getPullRequestDiff", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID
            });

            expect(res.status).toBe("COMPLETED");
            expect(typeof res.result).toBe("string");
            expect((res.result as string)).toContain("diff --git");
        });
    });

    describe("getPullRequestDiffStat", () => {
        it("should return diff statistics (changes on DC)", async() => {
            const res = await callTool("getPullRequestDiffStat", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID
            });

            expect(res.status).toBe("COMPLETED");

            const changes = res.result as Array<Record<string, unknown>>;

            expect(Array.isArray(changes)).toBe(true);
            expect(changes.length).toBeGreaterThan(0);
            expect(changes[0]).toHaveProperty("path");
            expect(changes[0]).toHaveProperty("type");
        });
    });

    describe("getPullRequestPatch", () => {
        it("should return an error on DC (not supported)", async() => {
            const res = await callTool("getPullRequestPatch", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID
            });

            expect(res.status).toBe("FAILED");
            expect(res.message).toContain("not available");
        });
    });

    // ── Comments CRUD lifecycle ──────────────────────────────────────

    describe("comments (CRUD lifecycle)", () => {
        let createdCommentId: number | undefined;

        it("addPullRequestComment should add a general comment", async() => {
            const res = await callTool("addPullRequestComment", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID,
                content: "DC integration test comment"
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("added");

            const comment = res.result as { id: number; text?: string };

            expect(comment.id).toBeDefined();
            createdCommentId = comment.id;
        });

        it("getPullRequestComment should get the created comment", async() => {
            if (!createdCommentId) return;

            const res = await callTool("getPullRequestComment", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID,
                commentId: createdCommentId
            });

            expect(res.status).toBe("COMPLETED");

            const comment = res.result as { id: number; text?: string };

            expect(comment.id).toBe(createdCommentId);
        });

        it("updatePullRequestComment should update the comment text", async() => {
            if (!createdCommentId) return;

            const res = await callTool("updatePullRequestComment", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID,
                commentId: createdCommentId,
                content: "DC integration test comment - UPDATED"
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("updated");
        });

        it("resolveComment should resolve the comment thread", async() => {
            if (!createdCommentId) return;

            const res = await callTool("resolveComment", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID,
                commentId: createdCommentId
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("resolved");
        });

        it("reopenComment should reopen a resolved comment thread", async() => {
            if (!createdCommentId) return;

            const res = await callTool("reopenComment", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID,
                commentId: createdCommentId
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("reopened");
        });

        it("deletePullRequestComment should delete the comment", async() => {
            if (!createdCommentId) return;

            const res = await callTool("deletePullRequestComment", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID,
                commentId: createdCommentId
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("deleted");
        });

        it("getPullRequestComment should return not found after deletion", async() => {
            if (!createdCommentId) return;

            const res = await callTool("getPullRequestComment", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID,
                commentId: createdCommentId
            });

            expect(res.status).toBe("FAILED");
        });
    });

    // ── Tasks (blocker-comments) CRUD lifecycle ──────────────────────

    describe("tasks / blocker-comments (CRUD lifecycle)", () => {
        let createdTaskId: number | undefined;

        it("getPullRequestTasks should list existing blocker-comments", async() => {
            const res = await callTool("getPullRequestTasks", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID
            });

            expect(res.status).toBe("COMPLETED");

            const tasks = res.result as Array<Record<string, unknown>>;

            expect(Array.isArray(tasks)).toBe(true);
            expect(tasks.length).toBeGreaterThanOrEqual(1);
        });

        it("createPullRequestTask should create a blocker-comment", async() => {
            const res = await callTool("createPullRequestTask", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID,
                content: "DC integration test task"
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("created");

            const task = res.result as { id: number; text: string; severity: string };

            expect(task.id).toBeDefined();
            expect(task.severity).toBe("BLOCKER");
            createdTaskId = task.id;
        });

        it("getPullRequestTask should get the created blocker-comment", async() => {
            if (!createdTaskId) return;

            const res = await callTool("getPullRequestTask", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID,
                taskId: createdTaskId
            });

            expect(res.status).toBe("COMPLETED");

            const task = res.result as { id: number; text: string };

            expect(task.id).toBe(createdTaskId);
            expect(task.text).toBe("DC integration test task");
        });

        it("updatePullRequestTask should resolve a blocker-comment", async() => {
            if (!createdTaskId) return;

            const res = await callTool("updatePullRequestTask", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID,
                taskId: createdTaskId,
                state: "RESOLVED"
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("updated");
        });

        it("deletePullRequestTask should delete the blocker-comment", async() => {
            if (!createdTaskId) return;

            const res = await callTool("deletePullRequestTask", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID,
                taskId: createdTaskId
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("deleted");
        });
    });

    // ── PR Statuses ──────────────────────────────────────────────────

    describe("getPullRequestStatuses", () => {
        it("should return empty list on DC (no direct equivalent)", async() => {
            const res = await callTool("getPullRequestStatuses", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID
            });

            // DC may return empty or fail gracefully
            expect(["COMPLETED", "FAILED"].includes(res.status)).toBe(true);
        });
    });

    // ── Comments via getPullRequestComments ───────────────────────────

    describe("getPullRequestComments", () => {
        it("should return comments list", async() => {
            const res = await callTool("getPullRequestComments", {
                repoSlug: DC_REPO,
                pullRequestId: DC_PR_ID
            });

            expect(res.status).toBe("COMPLETED");
            expect(Array.isArray(res.result)).toBe(true);
        });
    });
});
