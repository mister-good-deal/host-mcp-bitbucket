#!/usr/bin/env node

import { createServer as createHttpServer } from "node:http";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { parseConfig } from "./config.js";
import { initLogger } from "./logger.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
    const config = parseConfig();

    // Handle --insecure: skip TLS verification
    if (config.insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    const logger = initLogger(config.logLevel);

    logger.info("Starting host-mcp-bitbucket MCP server");
    logger.debug(`Config: url=${config.bitbucketUrl}, workspace=${config.defaultWorkspace ?? "not set"}, insecure=${config.insecure}, timeout=${config.timeout}ms, transport=${config.transport}`);

    if (config.transport === "http") await startHttpTransport(config, config.port);
    else await startStdioTransport(createServer(config));
}

async function startStdioTransport(server: ReturnType<typeof createServer>): Promise<void> {
    const logger = (await import("./logger.js")).getLogger();
    const transport = new StdioServerTransport();

    await server.connect(transport);

    logger.info("MCP server connected via stdio transport");
}

async function startHttpTransport(config: ReturnType<typeof parseConfig>, port: number): Promise<void> {
    const logger = (await import("./logger.js")).getLogger();

    const httpServer = createHttpServer(async(req, res) => {
        const url = req.url ?? "/";

        // Health check endpoint
        if (url === "/health" && req.method === "GET") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "ok" }));

            return;
        }

        // MCP endpoint at /mcp
        if (url === "/mcp") {
            // Stateless transport: no server->client stream to resume, so only POST is serviced on /mcp; GET (SSE) and DELETE (session teardown) return 405.
            if (req.method !== "POST") {
                res.writeHead(405, { "Content-Type": "application/json", "Allow": "POST" });
                res.end(JSON.stringify({
                    jsonrpc: "2.0",
                    error: { code: -32000, message: "Method not allowed: stateless server only accepts POST on /mcp" },
                    id: null
                }));

                return;
            }

            /*
             * Build a fresh server + transport per request (sessionIdGenerator: undefined = stateless).
             * Sharing a single global server/transport made every client after the first fail the MCP
             * handshake with -32600 "Server already initialized" (and broke reconnections). With a
             * per-request instance, concurrent clients and reconnects each get their own session.
             */
            const server = createServer(config);
            const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

            res.on("close", () => {
                void transport.close();
                void server.close();
            });

            try {
                await server.connect(transport);
                await transport.handleRequest(req, res);
            } catch (error) {
                logger.error(`Error handling MCP request: ${error instanceof Error ? error.message : error}`);

                if (!res.headersSent) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({
                        jsonrpc: "2.0",
                        error: { code: -32603, message: "Internal server error" },
                        id: null
                    }));
                }
            }

            return;
        }

        res.writeHead(404);
        res.end("Not Found");
    });

    httpServer.listen(port, () => {
        logger.info(`MCP server listening on http://localhost:${port}/mcp (Streamable HTTP transport, stateless)`);
    });

    // Graceful shutdown
    const shutdown = () => {
        logger.info("Shutting down HTTP server...");
        httpServer.close();
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

main().catch(error => {
    console.error("Fatal error:", error instanceof Error ? error.message : error);
    process.exit(1);
});
