import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { BitbucketClient } from "../bitbucket/client.js";
import { BitbucketClientError } from "../bitbucket/client.js";
import type { BitbucketAccount, BitbucketWorkspace } from "../bitbucket/types.js";
import { getLogger } from "../logger.js";
import { toMcpResult, toolError, toolNotFound, toolSuccess } from "../response.js";
import { getCurrentUserOutput, getWorkspaceOutput } from "./output-schemas.js";

export function registerWorkspaceTools(server: McpServer, client: BitbucketClient, defaultWorkspace?: string): void {
    const logger = getLogger();

    // ── getCurrentUser ───────────────────────────────────────────────────
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
                const user = await client.get<BitbucketAccount>("/user");

                return toMcpResult(toolSuccess(user, "Authenticated successfully."));
            } catch (error) {
                return toMcpResult(toolError(error));
            }
        }
    );

    // ── getWorkspace ─────────────────────────────────────────────────────
    server.registerTool(
        "getWorkspace",
        {
            description: "Get details about a Bitbucket workspace",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace slug (uses default workspace if omitted)")
            },
            outputSchema: getWorkspaceOutput,
            annotations: { readOnlyHint: true }
        },
        async({ workspace }) => {
            const ws = workspace ?? defaultWorkspace;

            if (!ws) {
                return toMcpResult(toolError(new Error("Workspace is required. Provide it as a parameter or set BITBUCKET_WORKSPACE.")));
            }

            logger.debug(`getWorkspace: ${ws}`);

            try {
                const result = await client.get<BitbucketWorkspace>(`/workspaces/${ws}`);

                return toMcpResult(toolSuccess(result));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Workspace", ws));
                }

                return toMcpResult(toolError(error));
            }
        }
    );
}
