import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { BitbucketClient } from "../bitbucket/client.js";
import { BitbucketClientError } from "../bitbucket/client.js";
import type { PathBuilder } from "../bitbucket/utils.js";
import { getLogger } from "../logger.js";
import { toMcpResult, toolError, toolNotFound, toolSuccess } from "../response.js";
import { listBranchesOutput, listTagsOutput } from "./output-schemas.js";

export function registerRefTools(server: McpServer, client: BitbucketClient, paths: PathBuilder, defaultWorkspace?: string): void {
    const logger = getLogger();

    function resolveWorkspace(workspace?: string) {
        return workspace ?? defaultWorkspace;
    }

    // ── listBranches ─────────────────────────────────────────────────────
    server.registerTool(
        "listBranches",
        {
            description: "List branches in a repository",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace or project key (uses default if omitted)"),
                repoSlug: z.string().describe("Repository slug"),
                filter: z.string().optional().describe("Filter branches by name (partial match)"),
                pagelen: z.number().int().min(1).max(100).optional().describe("Number of items per page"),
                page: z.number().int().min(1).optional().describe("Page number (1-based)"),
                all: z.boolean().optional().describe("Fetch all pages (capped at 1000)")
            },
            outputSchema: listBranchesOutput,
            annotations: { readOnlyHint: true }
        },
        async({ workspace, repoSlug, filter, pagelen, page, all }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace/project is required.")));

            logger.debug(`listBranches: ${ws}/${repoSlug}, filter=${filter ?? "all"}`);

            try {
                const extraQuery: Record<string, string | number | boolean | undefined | null> = {};

                if (filter) {
                    if (paths.isCloud) {
                        extraQuery.q = `name ~ "${filter}"`;
                    } else {
                        extraQuery.filterText = filter;
                    }
                }

                const result = await client.getPaginated(
                    paths.branches(ws, repoSlug),
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

    // ── listTags ─────────────────────────────────────────────────────────
    server.registerTool(
        "listTags",
        {
            description: "List tags in a repository",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace or project key (uses default if omitted)"),
                repoSlug: z.string().describe("Repository slug"),
                filter: z.string().optional().describe("Filter tags by name (partial match)"),
                pagelen: z.number().int().min(1).max(100).optional().describe("Number of items per page"),
                page: z.number().int().min(1).optional().describe("Page number (1-based)"),
                all: z.boolean().optional().describe("Fetch all pages (capped at 1000)")
            },
            outputSchema: listTagsOutput,
            annotations: { readOnlyHint: true }
        },
        async({ workspace, repoSlug, filter, pagelen, page, all }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace/project is required.")));

            logger.debug(`listTags: ${ws}/${repoSlug}, filter=${filter ?? "all"}`);

            try {
                const extraQuery: Record<string, string | number | boolean | undefined | null> = {};

                if (filter) {
                    if (paths.isCloud) {
                        extraQuery.q = `name ~ "${filter}"`;
                    } else {
                        extraQuery.filterText = filter;
                    }
                }

                const result = await client.getPaginated(
                    paths.tags(ws, repoSlug),
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
}
