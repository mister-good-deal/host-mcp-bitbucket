import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { BitbucketClient } from "../bitbucket/client.js";
import { BitbucketClientError } from "../bitbucket/client.js";
import type { BitbucketRepository } from "../bitbucket/types.js";
import { getLogger } from "../logger.js";
import { toMcpResult, toolError, toolNotFound, toolSuccess } from "../response.js";
import { listRepositoriesOutput, getRepositoryOutput } from "./output-schemas.js";

export function registerRepositoryTools(server: McpServer, client: BitbucketClient, defaultWorkspace?: string): void {
    const logger = getLogger();

    // ── listRepositories ─────────────────────────────────────────────────
    server.registerTool(
        "listRepositories",
        {
            description: "List Bitbucket repositories in a workspace",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name (uses default workspace if omitted)"),
                name: z.string().optional().describe("Filter repositories by name (partial match)"),
                pagelen: z.number().int().min(1).max(100).optional().describe("Number of items per page (default: 10, max: 100)"),
                page: z.number().int().min(1).optional().describe("Page number (1-based)"),
                all: z.boolean().optional().describe("When true, fetches all pages (capped at 1000 items)")
            },
            outputSchema: listRepositoriesOutput,
            annotations: { readOnlyHint: true }
        },
        async({ workspace, name, pagelen, page, all }) => {
            const ws = workspace ?? defaultWorkspace;

            if (!ws) {
                return toMcpResult(toolError(new Error("Workspace is required. Provide it as a parameter or set BITBUCKET_WORKSPACE.")));
            }

            logger.debug(`listRepositories: workspace=${ws}, name=${name ?? "all"}`);

            try {
                const extraQuery: Record<string, string | number | boolean | undefined | null> = {};

                if (name) extraQuery.q = `name ~ "${name}"`;

                const result = await client.getPaginated<BitbucketRepository>(
                    `/repositories/${ws}`,
                    { pagelen, page, all },
                    extraQuery
                );

                return toMcpResult(toolSuccess(result.values));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) return toMcpResult(toolNotFound("Workspace", ws));

                return toMcpResult(toolError(error));
            }
        }
    );

    // ── getRepository ────────────────────────────────────────────────────
    server.registerTool(
        "getRepository",
        {
            description: "Get details for a specific Bitbucket repository",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name (uses default workspace if omitted)"),
                repoSlug: z.string().describe("Repository slug")
            },
            outputSchema: getRepositoryOutput,
            annotations: { readOnlyHint: true }
        },
        async({ workspace, repoSlug }) => {
            const ws = workspace ?? defaultWorkspace;

            if (!ws) {
                return toMcpResult(toolError(new Error("Workspace is required. Provide it as a parameter or set BITBUCKET_WORKSPACE.")));
            }

            logger.debug(`getRepository: ${ws}/${repoSlug}`);

            try {
                const repo = await client.get<BitbucketRepository>(`/repositories/${ws}/${repoSlug}`);

                return toMcpResult(toolSuccess(repo));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Repository", `${ws}/${repoSlug}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );
}
