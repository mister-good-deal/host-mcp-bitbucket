import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { BitbucketClient } from "../bitbucket/client.js";
import { BitbucketClientError } from "../bitbucket/client.js";
import type { BitbucketRepository } from "../bitbucket/types.js";
import type { PathBuilder } from "../bitbucket/utils.js";
import { slugify } from "../bitbucket/utils.js";
import { getLogger } from "../logger.js";
import { toMcpResult, toolError, toolFailure, toolNotFound, toolSuccess } from "../response.js";
import { listRepositoriesOutput, getRepositoryOutput, createRepositoryOutput } from "./output-schemas.js";

export function registerRepositoryTools(server: McpServer, client: BitbucketClient, paths: PathBuilder, defaultWorkspace?: string): void {
    const logger = getLogger();

    /*
     * ── listRepositories ─────────────────────────────────────────────────
     * Cloud: GET /2.0/repositories/{workspace}
     *   https://developer.atlassian.com/cloud/bitbucket/rest/api-group-repositories/#api-repositories-workspace-get
     * DC:   GET /rest/api/latest/projects/{projectKey}/repos
     *   https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-repository/#api-api-latest-projects-projectkey-repos-get
     */
    server.registerTool(
        "listRepositories",
        {
            description: "List Bitbucket repositories in a workspace (Cloud) or project (Data Center)",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace or project key (uses default if omitted)"),
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
                return toMcpResult(toolError(new Error("Workspace/project is required. Provide it as a parameter or set BITBUCKET_WORKSPACE.")));
            }

            logger.debug(`listRepositories: workspace=${ws}, name=${name ?? "all"}`);

            try {
                const extraQuery: Record<string, string | number | boolean | undefined | null> = {};

                if (name) {
                    // Cloud uses q= filter syntax
                    if (paths.isCloud) {
                        extraQuery.q = `name ~ "${name}"`;
                    } else {
                        // DC: project-scoped /repos doesn't support name filter; use global /repos endpoint
                        extraQuery.name = name;

                        const result = await client.getPaginated<BitbucketRepository>(
                            "/repos",
                            { pagelen, page, all },
                            extraQuery
                        );

                        return toMcpResult(toolSuccess(result.values));
                    }
                }

                const result = await client.getPaginated<BitbucketRepository>(
                    paths.repositories(ws),
                    { pagelen, page, all },
                    extraQuery
                );

                return toMcpResult(toolSuccess(result.values));
            } catch(error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) return toMcpResult(toolNotFound("Workspace/Project", ws));

                return toMcpResult(toolError(error));
            }
        }
    );

    /*
     * ── getRepository ────────────────────────────────────────────────────
     * Cloud: GET /2.0/repositories/{workspace}/{repo_slug}
     *   https://developer.atlassian.com/cloud/bitbucket/rest/api-group-repositories/#api-repositories-workspace-repo-slug-get
     * DC:   GET /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}
     *   https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-repository/#api-api-latest-projects-projectkey-repos-repositoryslug-get
     */
    server.registerTool(
        "getRepository",
        {
            description: "Get details for a specific Bitbucket repository",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace or project key (uses default if omitted)"),
                repoSlug: z.string().describe("Repository slug")
            },
            outputSchema: getRepositoryOutput,
            annotations: { readOnlyHint: true }
        },
        async({ workspace, repoSlug }) => {
            const ws = workspace ?? defaultWorkspace;

            if (!ws) {
                return toMcpResult(toolError(new Error("Workspace/project is required. Provide it as a parameter or set BITBUCKET_WORKSPACE.")));
            }

            logger.debug(`getRepository: ${ws}/${repoSlug}`);

            try {
                const repo = await client.get<BitbucketRepository>(paths.repository(ws, repoSlug));

                return toMcpResult(toolSuccess(repo));
            } catch(error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Repository", `${ws}/${repoSlug}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    /*
     * ── createRepository ─────────────────────────────────────────────────
     * Cloud: POST /2.0/repositories/{workspace}/{repo_slug}
     *   https://developer.atlassian.com/cloud/bitbucket/rest/api-group-repositories/#api-repositories-workspace-repo-slug-post
     * DC:   POST /rest/api/latest/projects/{projectKey}/repos
     *   https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-project/#api-api-latest-projects-projectkey-repos-post
     */
    server.registerTool(
        "createRepository",
        {
            description: "Create a new Bitbucket repository in a workspace (Cloud) or project (Data Center)",
            inputSchema: {
                name: z.string().min(1).describe("Repository name"),
                workspace: z.string().optional().describe("Bitbucket workspace or project key (uses default if omitted)"),
                repoSlug: z.string().optional().describe("Repository slug (Cloud only; derived from the name if omitted — Data Center always derives it server-side)"),
                projectKey: z.string().optional().describe("Project key the repository belongs to (Cloud: optional, defaults to the workspace's oldest project; Data Center: alias for workspace)"),
                description: z.string().optional().describe("Repository description"),
                isPrivate: z.boolean().optional().describe("Create the repository as private (Cloud default: true; Data Center default: inherits the project visibility)"),
                defaultBranch: z.string().optional().describe("Default branch name (Data Center only — ignored on Cloud, where it can only be set once a branch exists)"),
                forkable: z.boolean().optional().describe("Allow forks (Data Center: forkable; Cloud: fork_policy allow_forks/no_forks)")
            },
            outputSchema: createRepositoryOutput,
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
        },
        async({ name, workspace, repoSlug, projectKey, description, isPrivate, defaultBranch, forkable }) => {
            // On DC the workspace *is* the project key, so projectKey doubles as an alias for it.
            const ws = workspace ?? (paths.isCloud ? undefined : projectKey) ?? defaultWorkspace;

            if (!ws) {
                return toMcpResult(toolError(new Error("Workspace/project is required. Provide it as a parameter or set BITBUCKET_WORKSPACE.")));
            }

            const notes: string[] = [];
            let path: string;
            let body: Record<string, unknown>;

            if (paths.isCloud) {
                const slug = repoSlug ?? slugify(name);

                if (!slug) {
                    return toMcpResult(toolFailure(`Cannot derive a repository slug from name '${name}'. Provide an explicit repoSlug.`));
                }

                body = { scm: "git", name, is_private: isPrivate ?? true };

                if (description !== undefined) body.description = description;

                if (projectKey !== undefined) body.project = { key: projectKey };

                if (forkable !== undefined) body.fork_policy = forkable ? "allow_forks" : "no_forks";

                if (defaultBranch !== undefined) notes.push("defaultBranch is not supported at creation on Bitbucket Cloud and was ignored.");

                path = paths.repository(ws, slug);
            } else {
                body = { name, scmId: "git" };

                if (description !== undefined) body.description = description;

                if (defaultBranch !== undefined) body.defaultBranch = defaultBranch;

                if (forkable !== undefined) body.forkable = forkable;

                // DC exposes visibility as `public`, the inverse of Cloud's `is_private`.
                if (isPrivate !== undefined) body.public = !isPrivate;

                if (repoSlug !== undefined) notes.push("repoSlug is ignored on Bitbucket Data Center — the slug is derived from the name by the server.");

                path = paths.repositories(ws);
            }

            logger.debug(`createRepository: ${ws}/${name} (${paths.isCloud ? "cloud" : "datacenter"})`);

            try {
                const repo = await client.post<BitbucketRepository>(path, body);
                const message = ["Repository created successfully.", ...notes].join(" ");

                return toMcpResult(toolSuccess(repo, message));
            } catch(error) {
                if (error instanceof BitbucketClientError) {
                    if (error.statusCode === 409) {
                        return toMcpResult(toolFailure(`A repository named '${name}' already exists in '${ws}'.`));
                    }

                    if (error.statusCode === 401 || error.statusCode === 403) {
                        return toMcpResult(toolFailure(`Not allowed to create a repository in '${ws}' (${error.statusCode}). The token lacks repository-creation permission on this ${paths.isCloud ? "workspace" : "project"}, or is invalid.`));
                    }

                    if (error.statusCode === 404) return toMcpResult(toolNotFound("Workspace/Project", ws));
                }

                return toMcpResult(toolError(error));
            }
        }
    );
}
