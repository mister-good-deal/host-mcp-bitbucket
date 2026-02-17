import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { BitbucketClient } from "../bitbucket/client.js";
import { BitbucketClientError } from "../bitbucket/client.js";
import type { BitbucketAccount, BitbucketWorkspace } from "../bitbucket/types.js";
import type { PathBuilder } from "../bitbucket/utils.js";
import { getLogger } from "../logger.js";
import { toMcpResult, toolError, toolNotFound, toolSuccess } from "../response.js";
import { getCurrentUserOutput, getWorkspaceOutput } from "./output-schemas.js";

export function registerWorkspaceTools(server: McpServer, client: BitbucketClient, paths: PathBuilder, defaultWorkspace?: string): void {
    const logger = getLogger();

    /*
     * ── getCurrentUser ───────────────────────────────────────────────────
     * Cloud: GET /2.0/user
     *   https://developer.atlassian.com/cloud/bitbucket/rest/api-group-users/#api-user-get
     * DC:   GET /rest/api/latest/application-properties
     *   https://developer.atlassian.com/server/bitbucket/rest/v823/api-group-system-maintenance/#api-api-latest-application-properties-get
     */
    server.registerTool(
        "getCurrentUser",
        {
            description: "Get the currently authenticated Bitbucket user. Useful for verifying connectivity and credentials.",
            inputSchema: {},
            outputSchema: getCurrentUserOutput,
            annotations: { readOnlyHint: true }
        },
        async() => {
            logger.debug("getCurrentUser");

            try {
                if (paths.isCloud) {
                    const user = await client.get<BitbucketAccount>("/user");

                    return toMcpResult(toolSuccess(user, "Authenticated successfully."));
                }

                // DC: no direct /user endpoint — use /application-properties to verify connectivity
                const props = await client.get<Record<string, unknown>>("/application-properties");

                // Return server properties as a proxy for auth verification
                return toMcpResult(toolSuccess({
                    display_name: "Authenticated User",
                    type: "user" as const,
                    ...props
                }, "Authenticated successfully (Data Center)."));
            } catch (error) {
                return toMcpResult(toolError(error));
            }
        }
    );

    /*
     * ── getWorkspace ─────────────────────────────────────────────────────
     * Cloud: GET /2.0/workspaces/{workspace}
     *   https://developer.atlassian.com/cloud/bitbucket/rest/api-group-workspaces/#api-workspaces-workspace-get
     * DC:   GET /rest/api/latest/projects/{projectKey}
     *   https://developer.atlassian.com/server/bitbucket/rest/v823/api-group-project/#api-api-latest-projects-projectkey-get
     */
    server.registerTool(
        "getWorkspace",
        {
            description: "Get details about a Bitbucket workspace (Cloud) or project (Data Center)",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace slug or project key (uses default if omitted)")
            },
            outputSchema: getWorkspaceOutput,
            annotations: { readOnlyHint: true }
        },
        async({ workspace }) => {
            const ws = workspace ?? defaultWorkspace;

            if (!ws) {
                return toMcpResult(toolError(new Error("Workspace/project is required. Provide it as a parameter or set BITBUCKET_WORKSPACE.")));
            }

            logger.debug(`getWorkspace: ${ws}`);

            try {
                const result = await client.get<BitbucketWorkspace>(paths.workspace(ws));

                return toMcpResult(toolSuccess(result));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Workspace/Project", ws));
                }

                return toMcpResult(toolError(error));
            }
        }
    );
}
