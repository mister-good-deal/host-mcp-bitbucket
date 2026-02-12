import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { BitbucketClient } from "../bitbucket/client.js";
import { BitbucketClientError } from "../bitbucket/client.js";
import type { BitbucketPullRequest } from "../bitbucket/types.js";
import { getLogger } from "../logger.js";
import { toMcpResult, toolError, toolNotFound, toolSuccess } from "../response.js";

const PullRequestStateEnum = z.enum(["OPEN", "MERGED", "DECLINED", "SUPERSEDED"]);
const MergeStrategyEnum = z.enum(["merge_commit", "squash", "fast_forward"]);

export function registerPullRequestTools(server: McpServer, client: BitbucketClient, defaultWorkspace?: string): void {
    const logger = getLogger();

    function resolveWorkspace(workspace?: string) {
        return workspace ?? defaultWorkspace;
    }

    // ── getPullRequests ──────────────────────────────────────────────────
    server.registerTool(
        "getPullRequests",
        {
            description: "List pull requests for a repository",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name (uses default if omitted)"),
                repoSlug: z.string().describe("Repository slug"),
                state: PullRequestStateEnum.optional().describe("Filter by pull request state"),
                pagelen: z.number().int().min(1).max(100).optional().describe("Number of items per page (default: 10, max: 100)"),
                page: z.number().int().min(1).optional().describe("Page number (1-based)"),
                all: z.boolean().optional().describe("Fetch all pages (capped at 1000)")
            },
            annotations: { readOnlyHint: true }
        },
        async({ workspace, repoSlug, state, pagelen, page, all }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`getPullRequests: ${ws}/${repoSlug}, state=${state ?? "all"}`);

            try {
                const extraQuery: Record<string, string | number | boolean | undefined | null> = {};

                if (state) extraQuery.state = state;

                const result = await client.getPaginated<BitbucketPullRequest>(
                    `/repositories/${ws}/${repoSlug}/pullrequests`,
                    { pagelen, page, all },
                    extraQuery
                );

                return toMcpResult(toolSuccess(result.values));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Repository", `${ws}/${repoSlug}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    // ── createPullRequest ────────────────────────────────────────────────
    server.registerTool(
        "createPullRequest",
        {
            description: "Create a new pull request",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                title: z.string().describe("Pull request title"),
                description: z.string().optional().describe("Pull request description"),
                sourceBranch: z.string().describe("Source branch name"),
                targetBranch: z.string().describe("Target branch name"),
                reviewers: z.array(z.string()).optional().describe("List of reviewer UUIDs"),
                draft: z.boolean().optional().describe("Create as draft pull request"),
                closeSourceBranch: z.boolean().optional().describe("Close source branch after merge")
            },
            annotations: { readOnlyHint: false }
        },
        async({ workspace, repoSlug, title, description, sourceBranch, targetBranch, reviewers, draft, closeSourceBranch }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`createPullRequest: ${ws}/${repoSlug}, ${sourceBranch} → ${targetBranch}`);

            try {
                const body: Record<string, unknown> = {
                    title,
                    source: { branch: { name: sourceBranch }},
                    destination: { branch: { name: targetBranch }}
                };

                if (description !== undefined) body.description = description;

                if (reviewers && reviewers.length > 0) body.reviewers = reviewers.map(uuid => ({ uuid }));

                if (draft !== undefined) body.draft = draft;

                if (closeSourceBranch !== undefined) body.close_source_branch = closeSourceBranch;

                const pr = await client.post<BitbucketPullRequest>(
                    `/repositories/${ws}/${repoSlug}/pullrequests`,
                    body
                );

                return toMcpResult(toolSuccess(pr, "Pull request created successfully."));
            } catch (error) {
                return toMcpResult(toolError(error));
            }
        }
    );

    // ── getPullRequest ───────────────────────────────────────────────────
    server.registerTool(
        "getPullRequest",
        {
            description: "Get details for a specific pull request",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID")
            },
            annotations: { readOnlyHint: true }
        },
        async({ workspace, repoSlug, pullRequestId }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`getPullRequest: ${ws}/${repoSlug}#${pullRequestId}`);

            try {
                const pr = await client.get<BitbucketPullRequest>(
                    `/repositories/${ws}/${repoSlug}/pullrequests/${pullRequestId}`
                );

                return toMcpResult(toolSuccess(pr));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Pull Request", `${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    // ── updatePullRequest ────────────────────────────────────────────────
    server.registerTool(
        "updatePullRequest",
        {
            description: "Update a pull request (title, description)",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID"),
                title: z.string().optional().describe("New pull request title"),
                description: z.string().optional().describe("New pull request description")
            },
            annotations: { readOnlyHint: false }
        },
        async({ workspace, repoSlug, pullRequestId, title, description }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`updatePullRequest: ${ws}/${repoSlug}#${pullRequestId}`);

            try {
                const body: Record<string, unknown> = {};

                if (title !== undefined) body.title = title;

                if (description !== undefined) body.description = description;

                const pr = await client.put<BitbucketPullRequest>(
                    `/repositories/${ws}/${repoSlug}/pullrequests/${pullRequestId}`,
                    body
                );

                return toMcpResult(toolSuccess(pr, "Pull request updated successfully."));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Pull Request", `${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    // ── getPullRequestActivity ───────────────────────────────────────────
    server.registerTool(
        "getPullRequestActivity",
        {
            description: "Get the activity log for a pull request (comments, approvals, updates, etc.)",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID"),
                pagelen: z.number().int().min(1).max(100).optional().describe("Number of items per page"),
                page: z.number().int().min(1).optional().describe("Page number"),
                all: z.boolean().optional().describe("Fetch all pages")
            },
            annotations: { readOnlyHint: true }
        },
        async({ workspace, repoSlug, pullRequestId, pagelen, page, all }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`getPullRequestActivity: ${ws}/${repoSlug}#${pullRequestId}`);

            try {
                const result = await client.getPaginated(
                    `/repositories/${ws}/${repoSlug}/pullrequests/${pullRequestId}/activity`,
                    { pagelen, page, all }
                );

                return toMcpResult(toolSuccess(result.values));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Pull Request", `${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    // ── approvePullRequest ───────────────────────────────────────────────
    server.registerTool(
        "approvePullRequest",
        {
            description: "Approve a pull request",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID")
            },
            annotations: { readOnlyHint: false }
        },
        async({ workspace, repoSlug, pullRequestId }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`approvePullRequest: ${ws}/${repoSlug}#${pullRequestId}`);

            try {
                const result = await client.post(
                    `/repositories/${ws}/${repoSlug}/pullrequests/${pullRequestId}/approve`
                );

                return toMcpResult(toolSuccess(result, "Pull request approved."));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Pull Request", `${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    // ── unapprovePullRequest ─────────────────────────────────────────────
    server.registerTool(
        "unapprovePullRequest",
        {
            description: "Remove approval from a pull request",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID")
            },
            annotations: { readOnlyHint: false }
        },
        async({ workspace, repoSlug, pullRequestId }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`unapprovePullRequest: ${ws}/${repoSlug}#${pullRequestId}`);

            try {
                await client.delete(
                    `/repositories/${ws}/${repoSlug}/pullrequests/${pullRequestId}/approve`
                );

                return toMcpResult(toolSuccess(true, "Approval removed."));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Pull Request", `${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    // ── requestChanges ───────────────────────────────────────────────────
    server.registerTool(
        "requestChanges",
        {
            description: "Request changes on a pull request",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID")
            },
            annotations: { readOnlyHint: false }
        },
        async({ workspace, repoSlug, pullRequestId }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`requestChanges: ${ws}/${repoSlug}#${pullRequestId}`);

            try {
                const result = await client.post(
                    `/repositories/${ws}/${repoSlug}/pullrequests/${pullRequestId}/request-changes`
                );

                return toMcpResult(toolSuccess(result, "Changes requested."));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Pull Request", `${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    // ── removeChangeRequest ──────────────────────────────────────────────
    server.registerTool(
        "removeChangeRequest",
        {
            description: "Remove a change request from a pull request",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID")
            },
            annotations: { readOnlyHint: false }
        },
        async({ workspace, repoSlug, pullRequestId }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`removeChangeRequest: ${ws}/${repoSlug}#${pullRequestId}`);

            try {
                await client.delete(
                    `/repositories/${ws}/${repoSlug}/pullrequests/${pullRequestId}/request-changes`
                );

                return toMcpResult(toolSuccess(true, "Change request removed."));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Pull Request", `${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    // ── declinePullRequest ───────────────────────────────────────────────
    server.registerTool(
        "declinePullRequest",
        {
            description: "Decline a pull request",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID"),
                message: z.string().optional().describe("Reason for declining")
            },
            annotations: { readOnlyHint: false }
        },
        async({ workspace, repoSlug, pullRequestId, message }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`declinePullRequest: ${ws}/${repoSlug}#${pullRequestId}`);

            try {
                const body: Record<string, unknown> = {};

                if (message) body.message = message;

                const result = await client.post<BitbucketPullRequest>(
                    `/repositories/${ws}/${repoSlug}/pullrequests/${pullRequestId}/decline`,
                    Object.keys(body).length > 0 ? body : undefined
                );

                return toMcpResult(toolSuccess(result, "Pull request declined."));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Pull Request", `${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    // ── mergePullRequest ─────────────────────────────────────────────────
    server.registerTool(
        "mergePullRequest",
        {
            description: "Merge a pull request",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID"),
                message: z.string().optional().describe("Merge commit message"),
                mergeStrategy: MergeStrategyEnum.optional().describe("Merge strategy (merge_commit, squash, fast_forward)"),
                closeSourceBranch: z.boolean().optional().describe("Close source branch after merge")
            },
            annotations: { readOnlyHint: false }
        },
        async({ workspace, repoSlug, pullRequestId, message, mergeStrategy, closeSourceBranch }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`mergePullRequest: ${ws}/${repoSlug}#${pullRequestId}`);

            try {
                const body: Record<string, unknown> = {};

                if (message) body.message = message;

                if (mergeStrategy) body.merge_strategy = mergeStrategy;

                if (closeSourceBranch !== undefined) body.close_source_branch = closeSourceBranch;

                const result = await client.post<BitbucketPullRequest>(
                    `/repositories/${ws}/${repoSlug}/pullrequests/${pullRequestId}/merge`,
                    Object.keys(body).length > 0 ? body : undefined
                );

                return toMcpResult(toolSuccess(result, "Pull request merged."));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Pull Request", `${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    // ── getPullRequestCommits ────────────────────────────────────────────
    server.registerTool(
        "getPullRequestCommits",
        {
            description: "List commits on a pull request",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID"),
                pagelen: z.number().int().min(1).max(100).optional().describe("Number of items per page"),
                page: z.number().int().min(1).optional().describe("Page number"),
                all: z.boolean().optional().describe("Fetch all pages")
            },
            annotations: { readOnlyHint: true }
        },
        async({ workspace, repoSlug, pullRequestId, pagelen, page, all }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`getPullRequestCommits: ${ws}/${repoSlug}#${pullRequestId}`);

            try {
                const result = await client.getPaginated(
                    `/repositories/${ws}/${repoSlug}/pullrequests/${pullRequestId}/commits`,
                    { pagelen, page, all }
                );

                return toMcpResult(toolSuccess(result.values));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Pull Request", `${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    // ── getPullRequestStatuses ───────────────────────────────────────────
    server.registerTool(
        "getPullRequestStatuses",
        {
            description: "List commit statuses associated with a pull request",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID"),
                pagelen: z.number().int().min(1).max(100).optional().describe("Number of items per page"),
                page: z.number().int().min(1).optional().describe("Page number"),
                all: z.boolean().optional().describe("Fetch all pages")
            },
            annotations: { readOnlyHint: true }
        },
        async({ workspace, repoSlug, pullRequestId, pagelen, page, all }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`getPullRequestStatuses: ${ws}/${repoSlug}#${pullRequestId}`);

            try {
                const result = await client.getPaginated(
                    `/repositories/${ws}/${repoSlug}/pullrequests/${pullRequestId}/statuses`,
                    { pagelen, page, all }
                );

                return toMcpResult(toolSuccess(result.values));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Pull Request", `${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );
}
