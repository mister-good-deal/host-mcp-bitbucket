/**
 * Integration tests for Bitbucket Data Center.
 *
 * These tests run against a REAL Bitbucket DC instance and verify
 * that every tool works end-to-end through the MCP tool layer.
 *
 * Required env vars (set in `.vscode/mcp.json` or CI):
 *   BITBUCKET_URL      – e.g. https://bitbucket.mycompany.com
 *   BITBUCKET_TOKEN    – HTTP access token
 *   BITBUCKET_WORKSPACE – project key (e.g. "PL")
 *
 * Additional optional env vars for test data:
 *   TEST_REPO          – repository slug with at least one open PR (default: "evacom_m7")
 *   TEST_PR_ID         – open pull request ID to use for read tests   (default: "64")
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createIntegrationClient, waitForBitbucket, TEST_WORKSPACE, TEST_PATHS, TEST_PLATFORM } from "./setup.js";
import { registerWorkspaceTools } from "../../src/tools/workspace.js";
import { registerRepositoryTools } from "../../src/tools/repositories.js";
import { registerPullRequestTools } from "../../src/tools/pull-requests.js";
import { registerCommentTools } from "../../src/tools/comments.js";
import { registerDiffTools } from "../../src/tools/diffs.js";
import { registerTaskTools } from "../../src/tools/tasks.js";
import { registerRefTools } from "../../src/tools/refs.js";

// ── Skip unless targeting a real DC instance ────────────────────────────

const SKIP = TEST_PLATFORM !== "datacenter";

const describedc = SKIP ? describe.skip : describe;

// ── Test data ────────────────────────────────────────────────────────────

const TEST_REPO = process.env.TEST_REPO ?? "evacom_m7";
const TEST_PR_ID = parseInt(process.env.TEST_PR_ID ?? "64", 10);

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

describedc("Integration: Bitbucket Data Center", () => {
    const client = createIntegrationClient();
    const paths = TEST_PATHS;

    // Tool handlers map: tool name → handler function
    let toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<unknown>>;

    beforeAll(async() => {
        await waitForBitbucket(client);

        // Register all tools and capture handlers
        const server = new McpServer({ name: "integration-test", version: "0.0.1" });

        toolHandlers = new Map();

        const originalRegisterTool = server.registerTool.bind(server);

        server.registerTool = ((...args: unknown[]) => {
            const name = args[0] as string;
            const handler = args[args.length - 1] as (args: Record<string, unknown>) => Promise<unknown>;

            toolHandlers.set(name, handler);

            return originalRegisterTool(...(args as Parameters<typeof originalRegisterTool>));
        }) as typeof server.registerTool;

        registerWorkspaceTools(server, client, paths, TEST_WORKSPACE);
        registerRepositoryTools(server, client, paths, TEST_WORKSPACE);
        registerPullRequestTools(server, client, paths, TEST_WORKSPACE);
        registerCommentTools(server, client, paths, TEST_WORKSPACE);
        registerDiffTools(server, client, paths, TEST_WORKSPACE);
        registerTaskTools(server, client, paths, TEST_WORKSPACE);
        registerRefTools(server, client, paths, TEST_WORKSPACE);
    }, 60_000);

    async function callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResponse> {
        const handler = toolHandlers.get(name);

        if (!handler) throw new Error(`Tool "${name}" is not registered`);

        return parseToolResult(await handler(args));
    }

    // ── Workspace / Connectivity ─────────────────────────────────────

    describe("getCurrentUser", () => {
        it("should authenticate and return server properties", async() => {
            const res = await callTool("getCurrentUser");

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("Authenticated");
            expect(res.result).toBeDefined();

            const result = res.result as Record<string, unknown>;

            expect(result.displayName).toBe("Bitbucket");
            expect(result.version).toBeTruthy();
        });
    });

    describe("getWorkspace", () => {
        it("should return project details for the default project key", async() => {
            const res = await callTool("getWorkspace");

            expect(res.status).toBe("COMPLETED");

            const result = res.result as Record<string, unknown>;

            expect(result.key).toBe(TEST_WORKSPACE);
            expect(result.name).toBeTruthy();
            expect(result.type).toBe("NORMAL");
        });

        it("should return not found for a non-existent project", async() => {
            const res = await callTool("getWorkspace", { workspace: "NONEXISTENT_PROJECT_ZZZZ" });

            expect(res.status).toBe("FAILED");
        });
    });

    // ── Repositories ─────────────────────────────────────────────────

    describe("listRepositories", () => {
        it("should list repositories in the project", async() => {
            const res = await callTool("listRepositories", { pagelen: 5 });

            expect(res.status).toBe("COMPLETED");

            const repos = res.result as Array<Record<string, unknown>>;

            expect(Array.isArray(repos)).toBe(true);
            expect(repos.length).toBeGreaterThan(0);
            expect(repos[0]).toHaveProperty("slug");
        });

        it("should filter repositories by name", async() => {
            const res = await callTool("listRepositories", { name: TEST_REPO, pagelen: 10 });

            expect(res.status).toBe("COMPLETED");

            const repos = res.result as Array<Record<string, unknown>>;

            expect(repos.length).toBeGreaterThan(0);
            expect(repos.some(r => r.slug === TEST_REPO)).toBe(true);
        });
    });

    describe("getRepository", () => {
        it("should return repository details", async() => {
            const res = await callTool("getRepository", { repoSlug: TEST_REPO });

            expect(res.status).toBe("COMPLETED");

            const repo = res.result as Record<string, unknown>;

            expect(repo.slug).toBe(TEST_REPO);
            expect(repo).toHaveProperty("project");
        });

        it("should return not found for a non-existent repo", async() => {
            const res = await callTool("getRepository", { repoSlug: "this-repo-does-not-exist-xyz-12345" });

            expect(res.status).toBe("FAILED");
            expect(res.message).toContain("not found");
        });
    });

    // ── Branches & Tags ──────────────────────────────────────────────

    describe("listBranches", () => {
        it("should list branches for a repository", async() => {
            const res = await callTool("listBranches", { repoSlug: TEST_REPO });

            expect(res.status).toBe("COMPLETED");

            const branches = res.result as Array<Record<string, unknown>>;

            expect(Array.isArray(branches)).toBe(true);
            expect(branches.length).toBeGreaterThan(0);
            expect(branches[0]).toHaveProperty("displayId");
        });

        it("should filter branches by name", async() => {
            const res = await callTool("listBranches", { repoSlug: TEST_REPO, filter: "master" });

            expect(res.status).toBe("COMPLETED");

            const branches = res.result as Array<Record<string, unknown>>;

            expect(branches.length).toBeGreaterThan(0);
            expect(branches.every(b => (b.displayId as string).toLowerCase().includes("master"))).toBe(true);
        });
    });

    describe("listTags", () => {
        it("should list tags for a repository", async() => {
            const res = await callTool("listTags", { repoSlug: TEST_REPO });

            expect(res.status).toBe("COMPLETED");

            const tags = res.result as Array<Record<string, unknown>>;

            expect(Array.isArray(tags)).toBe(true);
            expect(tags.length).toBeGreaterThan(0);
            expect(tags[0]).toHaveProperty("displayId");
        });

        it("should filter tags by name", async() => {
            const res = await callTool("listTags", { repoSlug: TEST_REPO, filter: "7.0" });

            expect(res.status).toBe("COMPLETED");

            const tags = res.result as Array<Record<string, unknown>>;

            expect(tags.length).toBeGreaterThan(0);
            expect(tags.every(t => (t.displayId as string).includes("7.0"))).toBe(true);
        });
    });

    // ── Pull Requests ────────────────────────────────────────────────

    describe("getPullRequests", () => {
        it("should list open pull requests", async() => {
            const res = await callTool("getPullRequests", { repoSlug: TEST_REPO, state: "OPEN" });

            expect(res.status).toBe("COMPLETED");

            const prs = res.result as Array<Record<string, unknown>>;

            expect(Array.isArray(prs)).toBe(true);
            expect(prs.length).toBeGreaterThan(0);
            expect(prs[0]).toHaveProperty("id");
            expect(prs[0]).toHaveProperty("title");
        });
    });

    describe("getPullRequest", () => {
        it("should return pull request details", async() => {
            const res = await callTool("getPullRequest", { repoSlug: TEST_REPO, pullRequestId: TEST_PR_ID });

            expect(res.status).toBe("COMPLETED");

            const pr = res.result as Record<string, unknown>;

            expect(pr.id).toBe(TEST_PR_ID);
            expect(pr.title).toBeTruthy();
            expect(pr.state).toBe("OPEN");
            expect(pr).toHaveProperty("fromRef");
            expect(pr).toHaveProperty("toRef");
        });

        it("should return not found for a non-existent PR", async() => {
            const res = await callTool("getPullRequest", { repoSlug: TEST_REPO, pullRequestId: 999999 });

            expect(res.status).toBe("FAILED");
            expect(res.message).toContain("not found");
        });
    });

    describe("getPullRequestActivity", () => {
        it("should return pull request activities", async() => {
            const res = await callTool("getPullRequestActivity", {
                repoSlug: TEST_REPO,
                pullRequestId: TEST_PR_ID,
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
                repoSlug: TEST_REPO,
                pullRequestId: TEST_PR_ID,
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

    // ── Comments ─────────────────────────────────────────────────────

    describe("getPullRequestComments", () => {
        it("should return comments (via activities fallback on DC)", async() => {
            const res = await callTool("getPullRequestComments", {
                repoSlug: TEST_REPO,
                pullRequestId: TEST_PR_ID
            });

            expect(res.status).toBe("COMPLETED");

            // May be empty if no comments exist — that's fine
            expect(Array.isArray(res.result)).toBe(true);
        });
    });

    // ── Diffs ────────────────────────────────────────────────────────

    describe("getPullRequestDiff", () => {
        it("should return a raw text diff", async() => {
            const res = await callTool("getPullRequestDiff", {
                repoSlug: TEST_REPO,
                pullRequestId: TEST_PR_ID
            });

            expect(res.status).toBe("COMPLETED");
            expect(typeof res.result).toBe("string");
            expect((res.result as string).startsWith("diff --git")).toBe(true);
        });
    });

    describe("getPullRequestDiffStat", () => {
        it("should return diff statistics (changes on DC)", async() => {
            const res = await callTool("getPullRequestDiffStat", {
                repoSlug: TEST_REPO,
                pullRequestId: TEST_PR_ID
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
                repoSlug: TEST_REPO,
                pullRequestId: TEST_PR_ID
            });

            expect(res.status).toBe("FAILED");
            expect(res.message).toContain("not available");
        });
    });

    // ── Tasks (via blocker-comments on DC) ─────────────────────────────

    describe("tasks (blocker-comments)", () => {
        let createdTaskId: number | undefined;

        it("getPullRequestTasks should list blocker-comments", async() => {
            const res = await callTool("getPullRequestTasks", {
                repoSlug: TEST_REPO,
                pullRequestId: TEST_PR_ID
            });

            expect(res.status).toBe("COMPLETED");
            expect(Array.isArray(res.result)).toBe(true);
        });

        it("createPullRequestTask should create a blocker-comment", async() => {
            const res = await callTool("createPullRequestTask", {
                repoSlug: TEST_REPO,
                pullRequestId: TEST_PR_ID,
                content: "Integration test task"
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("created");

            const task = res.result as { id: number; text: string; severity: string };

            expect(task.id).toBeDefined();
            expect(task.severity).toBe("BLOCKER");
            createdTaskId = task.id;
        });

        it("getPullRequestTask should get a specific blocker-comment", async() => {
            if (!createdTaskId) return;

            const res = await callTool("getPullRequestTask", {
                repoSlug: TEST_REPO,
                pullRequestId: TEST_PR_ID,
                taskId: createdTaskId
            });

            expect(res.status).toBe("COMPLETED");

            const task = res.result as { id: number; text: string };

            expect(task.id).toBe(createdTaskId);
            expect(task.text).toBe("Integration test task");
        });

        it("updatePullRequestTask should resolve a blocker-comment", async() => {
            if (!createdTaskId) return;

            const res = await callTool("updatePullRequestTask", {
                repoSlug: TEST_REPO,
                pullRequestId: TEST_PR_ID,
                taskId: createdTaskId,
                state: "RESOLVED"
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("updated");
        });

        it("deletePullRequestTask should delete a blocker-comment", async() => {
            if (!createdTaskId) return;

            const res = await callTool("deletePullRequestTask", {
                repoSlug: TEST_REPO,
                pullRequestId: TEST_PR_ID,
                taskId: createdTaskId
            });

            expect(res.status).toBe("COMPLETED");
            expect(res.message).toContain("deleted");
        });
    });

    // ── PR Statuses ──────────────────────────────────────────────────

    describe("getPullRequestStatuses", () => {
        it("should handle missing statuses endpoint on DC gracefully", async() => {
            const res = await callTool("getPullRequestStatuses", {
                repoSlug: TEST_REPO,
                pullRequestId: TEST_PR_ID
            });

            // DC doesn't have a direct statuses endpoint — may 404 or return empty
            expect(["COMPLETED", "FAILED"].includes(res.status)).toBe(true);
        });
    });
});
