import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { Config } from "./config.js";
import { BitbucketClient } from "./bitbucket/client.js";
import { normalizeBaseUrl, extractWorkspaceFromUrl, detectPlatform, PathBuilder } from "./bitbucket/utils.js";
import { getLogger } from "./logger.js";
import { VERSION } from "./version.js";
import { registerRepositoryTools } from "./tools/repositories.js";
import { registerPullRequestTools } from "./tools/pull-requests.js";
import { registerCommentTools } from "./tools/comments.js";
import { registerDiffTools } from "./tools/diffs.js";
import { registerTaskTools } from "./tools/tasks.js";
import { registerWorkspaceTools } from "./tools/workspace.js";
import { registerRefTools } from "./tools/refs.js";

export function createServer(config: Config): McpServer {
    const logger = getLogger();

    const server = new McpServer({
        name: "host-mcp-bitbucket",
        version: VERSION
    });

    const platform = detectPlatform(config.bitbucketUrl);
    const baseUrl = normalizeBaseUrl(config.bitbucketUrl);

    // Auto-extract workspace from URL if not explicitly set
    const defaultWorkspace = config.defaultWorkspace ?? extractWorkspaceFromUrl(config.bitbucketUrl);

    const client = new BitbucketClient({
        baseUrl,
        token: config.bitbucketToken,
        timeout: config.timeout,
        maxRetries: config.maxRetries,
        retryDelay: config.retryDelay,
        platform
    });

    const paths = new PathBuilder(platform);

    logger.info(`Registering tools for Bitbucket instance: ${baseUrl} (${platform})`);

    if (defaultWorkspace) logger.info(`Default workspace/project: ${defaultWorkspace}`);

    registerWorkspaceTools(server, client, paths, defaultWorkspace);
    registerRepositoryTools(server, client, paths, defaultWorkspace);
    registerPullRequestTools(server, client, paths, defaultWorkspace);
    registerCommentTools(server, client, paths, defaultWorkspace);
    registerDiffTools(server, client, paths, defaultWorkspace);
    registerTaskTools(server, client, paths, defaultWorkspace);
    registerRefTools(server, client, paths, defaultWorkspace);

    logger.info("All MCP tools registered successfully");

    return server;
}
