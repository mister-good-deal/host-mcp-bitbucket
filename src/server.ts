import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { Config } from "./config.js";
import { BitbucketClient } from "./bitbucket/client.js";
import { normalizeBaseUrl, extractWorkspaceFromUrl } from "./bitbucket/utils.js";
import { getLogger } from "./logger.js";
import { VERSION } from "./version.js";
import { registerRepositoryTools } from "./tools/repositories.js";
import { registerPullRequestTools } from "./tools/pull-requests.js";
import { registerCommentTools } from "./tools/comments.js";
import { registerDiffTools } from "./tools/diffs.js";
import { registerTaskTools } from "./tools/tasks.js";

export function createServer(config: Config): McpServer {
    const logger = getLogger();

    const server = new McpServer({
        name: "host-mcp-bitbucket",
        version: VERSION
    });

    const baseUrl = normalizeBaseUrl(config.bitbucketUrl);

    // Auto-extract workspace from URL if not explicitly set
    const defaultWorkspace = config.defaultWorkspace ?? extractWorkspaceFromUrl(config.bitbucketUrl);

    const client = new BitbucketClient({
        baseUrl,
        token: config.bitbucketToken,
        timeout: config.timeout,
        maxRetries: config.maxRetries,
        retryDelay: config.retryDelay
    });

    logger.info(`Registering tools for Bitbucket instance: ${baseUrl}`);

    if (defaultWorkspace) logger.info(`Default workspace: ${defaultWorkspace}`);

    registerRepositoryTools(server, client, defaultWorkspace);
    registerPullRequestTools(server, client, defaultWorkspace);
    registerCommentTools(server, client, defaultWorkspace);
    registerDiffTools(server, client, defaultWorkspace);
    registerTaskTools(server, client, defaultWorkspace);

    logger.info("All MCP tools registered successfully");

    return server;
}
