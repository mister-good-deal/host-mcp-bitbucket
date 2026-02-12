import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { BitbucketClient } from "../bitbucket/client.js";
import { BitbucketClientError } from "../bitbucket/client.js";
import type { BitbucketDiffStat } from "../bitbucket/types.js";
import { getLogger } from "../logger.js";
import { toMcpResult, toolError, toolNotFound, toolSuccess } from "../response.js";

export function registerDiffTools(server: McpServer, client: BitbucketClient, defaultWorkspace?: string): void {
    const logger = getLogger();

    function resolveWorkspace(workspace?: string) {
        return workspace ?? defaultWorkspace;
    }

    // ── getPullRequestDiff ───────────────────────────────────────────────
    server.registerTool(
        "getPullRequestDiff",
        {
            description: "Get the raw diff for a pull request",
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

            logger.debug(`getPullRequestDiff: ${ws}/${repoSlug}#${pullRequestId}`);

            try {
                const diff = await client.getText(
                    `/repositories/${ws}/${repoSlug}/pullrequests/${pullRequestId}/diff`
                );

                return toMcpResult(toolSuccess(diff));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Pull Request", `${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    // ── getPullRequestDiffStat ───────────────────────────────────────────
    server.registerTool(
        "getPullRequestDiffStat",
        {
            description: "Get diff statistics for a pull request (files changed, lines added/removed)",
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

            logger.debug(`getPullRequestDiffStat: ${ws}/${repoSlug}#${pullRequestId}`);

            try {
                const result = await client.getPaginated<BitbucketDiffStat>(
                    `/repositories/${ws}/${repoSlug}/pullrequests/${pullRequestId}/diffstat`,
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

    // ── getPullRequestPatch ──────────────────────────────────────────────
    server.registerTool(
        "getPullRequestPatch",
        {
            description: "Get the patch for a pull request",
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

            logger.debug(`getPullRequestPatch: ${ws}/${repoSlug}#${pullRequestId}`);

            try {
                const patch = await client.getText(
                    `/repositories/${ws}/${repoSlug}/pullrequests/${pullRequestId}/patch`
                );

                return toMcpResult(toolSuccess(patch));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Pull Request", `${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );
}
