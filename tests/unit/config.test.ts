import { describe, it, expect } from "@jest/globals";

import { parseConfig } from "../../src/config.js";

describe("parseConfig", () => {
    const validArgs = [
        "node",
        "index.js",
        "--bitbucket-token",
        "my-api-token"
    ];

    it("should parse valid CLI arguments with defaults", () => {
        const config = parseConfig(validArgs);

        expect(config.bitbucketUrl).toBe("https://api.bitbucket.org/2.0");
        expect(config.bitbucketToken).toBe("my-api-token");
        expect(config.defaultWorkspace).toBeUndefined();
        expect(config.insecure).toBe(false);
        expect(config.logLevel).toBe("info");
        expect(config.timeout).toBe(30000);
        expect(config.maxRetries).toBe(3);
        expect(config.retryDelay).toBe(1000);
        expect(config.transport).toBe("stdio");
        expect(config.port).toBe(3000);
    });

    it("should parse --bitbucket-url option", () => {
        const config = parseConfig([...validArgs, "--bitbucket-url", "https://bitbucket.mycompany.com"]);

        expect(config.bitbucketUrl).toBe("https://bitbucket.mycompany.com");
    });

    it("should parse --default-workspace option", () => {
        const config = parseConfig([...validArgs, "--default-workspace", "my-workspace"]);

        expect(config.defaultWorkspace).toBe("my-workspace");
    });

    it("should parse --insecure flag", () => {
        const config = parseConfig([...validArgs, "--insecure"]);

        expect(config.insecure).toBe(true);
    });

    it("should parse --log-level option", () => {
        const config = parseConfig([...validArgs, "--log-level", "debug"]);

        expect(config.logLevel).toBe("debug");
    });

    it("should parse --timeout option", () => {
        const config = parseConfig([...validArgs, "--timeout", "10000"]);

        expect(config.timeout).toBe(10000);
    });

    it("should throw if --bitbucket-token is missing", () => {
        expect(() => parseConfig([
            "node",
            "index.js"
        ])).toThrow(/Missing required configuration.*bitbucket-token/);
    });

    it("should throw on invalid log level", () => {
        expect(() => parseConfig([
            ...validArgs,
            "--log-level",
            "verbose"
        ])).toThrow(/Invalid log level/);
    });

    it("should parse --transport http with --port", () => {
        const config = parseConfig([...validArgs, "--transport", "http", "--port", "8080"]);

        expect(config.transport).toBe("http");
        expect(config.port).toBe(8080);
    });

    it("should throw on invalid transport type", () => {
        expect(() => parseConfig([
            ...validArgs,
            "--transport",
            "websocket"
        ])).toThrow(/Invalid transport/);
    });

    it("should fall back to environment variables", () => {
        const originalEnv = { ...process.env };

        process.env.BITBUCKET_URL = "https://bitbucket.mycompany.com";
        process.env.BITBUCKET_TOKEN = "env-token";
        process.env.BITBUCKET_WORKSPACE = "env-workspace";

        try {
            const config = parseConfig(["node", "index.js"]);

            expect(config.bitbucketUrl).toBe("https://bitbucket.mycompany.com");
            expect(config.bitbucketToken).toBe("env-token");
            expect(config.defaultWorkspace).toBe("env-workspace");
        } finally {
            process.env = originalEnv;
        }
    });

    it("should parse --max-retries and --retry-delay options", () => {
        const config = parseConfig([...validArgs, "--max-retries", "5", "--retry-delay", "2000"]);

        expect(config.maxRetries).toBe(5);
        expect(config.retryDelay).toBe(2000);
    });

    it("should throw on invalid timeout", () => {
        expect(() => parseConfig([
            ...validArgs,
            "--timeout",
            "0"
        ])).toThrow(/Invalid timeout/);
    });

    it("should throw on invalid port with http transport", () => {
        expect(() => parseConfig([
            ...validArgs,
            "--transport",
            "http",
            "--port",
            "99999"
        ])).toThrow(/Invalid port/);
    });
});
