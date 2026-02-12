import { Command } from "commander";

import type { LogLevel } from "./logger.js";
import { VERSION } from "./version.js";

export type TransportType = "stdio" | "http";

export interface Config {
    bitbucketUrl: string;
    bitbucketToken: string;
    defaultWorkspace: string | undefined;
    insecure: boolean;
    logLevel: LogLevel;
    timeout: number;
    maxRetries: number;
    retryDelay: number;
    transport: TransportType;
    port: number;
}

export function parseConfig(argv: string[] = process.argv): Config {
    const program = new Command();

    program.
        name("host-mcp-bitbucket").
        description("Local MCP server for Bitbucket — provides AI assistants with access to Bitbucket repositories and pull requests via REST API").
        version(VERSION).
        option(
            "--bitbucket-url <url>",
            "Bitbucket API base URL",
            process.env.BITBUCKET_URL ?? "https://api.bitbucket.org/2.0"
        ).
        option(
            "--bitbucket-token <token>",
            "Bitbucket API token (app password or access token)",
            process.env.BITBUCKET_TOKEN
        ).
        option(
            "--default-workspace <workspace>",
            "Default Bitbucket workspace (used when workspace parameter is omitted)",
            process.env.BITBUCKET_WORKSPACE
        ).
        option(
            "--insecure",
            "Skip TLS certificate verification",
            process.env.BITBUCKET_INSECURE === "true"
        ).
        option(
            "--log-level <level>",
            "Log level (debug|info|warn|error)",
            process.env.LOG_LEVEL ?? "info"
        ).
        option(
            "--timeout <ms>",
            "HTTP request timeout in milliseconds",
            process.env.BITBUCKET_TIMEOUT ?? "30000"
        ).
        option(
            "--max-retries <count>",
            "Maximum number of retries for transient errors",
            process.env.BITBUCKET_MAX_RETRIES ?? "3"
        ).
        option(
            "--retry-delay <ms>",
            "Base delay in ms for exponential backoff between retries",
            process.env.BITBUCKET_RETRY_DELAY ?? "1000"
        ).
        option(
            "--transport <type>",
            "MCP transport type (stdio or http)",
            process.env.MCP_TRANSPORT ?? "stdio"
        ).
        option(
            "--port <port>",
            "HTTP server port (only used with --transport http)",
            process.env.MCP_PORT ?? "3000"
        );

    program.parse(argv);

    const opts = program.opts();

    const config: Config = {
        bitbucketUrl: opts.bitbucketUrl,
        bitbucketToken: opts.bitbucketToken,
        defaultWorkspace: opts.defaultWorkspace,
        insecure: opts.insecure ?? false,
        logLevel: opts.logLevel as LogLevel,
        timeout: parseInt(String(opts.timeout), 10),
        maxRetries: parseInt(String(opts.maxRetries), 10),
        retryDelay: parseInt(String(opts.retryDelay), 10),
        transport: opts.transport as TransportType,
        port: parseInt(String(opts.port), 10)
    };

    validate(config);

    return config;
}

function validate(config: Config): void {
    const missing: string[] = [];

    if (!config.bitbucketToken) missing.push("--bitbucket-token or BITBUCKET_TOKEN");

    if (missing.length > 0) throw new Error(`Missing required configuration: ${missing.join(", ")}`);

    const validLevels: LogLevel[] = ["debug", "info", "warn", "error"];

    if (!validLevels.includes(config.logLevel)) {
        throw new Error(`Invalid log level: ${config.logLevel}. Must be one of: ${validLevels.join(", ")}`);
    }

    if (isNaN(config.timeout) || config.timeout <= 0) throw new Error(`Invalid timeout: ${config.timeout}. Must be a positive number.`);

    const validTransports: TransportType[] = ["stdio", "http"];

    if (!validTransports.includes(config.transport)) {
        throw new Error(`Invalid transport: ${config.transport}. Must be one of: ${validTransports.join(", ")}`);
    }

    if (config.transport === "http" && (isNaN(config.port) || config.port <= 0 || config.port > 65535)) {
        throw new Error(`Invalid port: ${config.port}. Must be between 1 and 65535.`);
    }
}
