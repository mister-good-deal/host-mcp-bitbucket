import { describe, it, expect, beforeEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerRepositoryTools } from "../../../src/tools/repositories.js";
import { createMockClient, extractToolResponse, make404 } from "./helpers.js";

describe("Repository Tools", () => {
    let server: McpServer;
    let client: ReturnType<typeof createMockClient>;
    let toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<unknown>>;

    beforeEach(() => {
        server = new McpServer({ name: "test", version: "0.0.1" });
        client = createMockClient();
        toolHandlers = new Map();

        const originalRegisterTool = server.registerTool.bind(server);

        server.registerTool = ((...args: unknown[]) => {
            const name = args[0] as string;
            const handler = args[args.length - 1] as (args: Record<string, unknown>) => Promise<unknown>;

            toolHandlers.set(name, handler);

            return originalRegisterTool(...(args as Parameters<typeof originalRegisterTool>));
        }) as typeof server.registerTool;

        registerRepositoryTools(server, client, "default-ws");
    });

    describe("listRepositories", () => {
        it("should return repositories for a workspace", async() => {
            const mockRepos = [
                { slug: "repo-a", full_name: "ws/repo-a" },
                { slug: "repo-b", full_name: "ws/repo-b" }
            ];

            client.getPaginated.mockResolvedValueOnce({ values: mockRepos, total: 2 });

            const handler = toolHandlers.get("listRepositories")!;
            const result = await handler({ workspace: "ws" }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.result).toEqual(mockRepos);
            expect(client.getPaginated).toHaveBeenCalledWith(
                "/repositories/ws",
                { pagelen: undefined, page: undefined, all: undefined },
                {}
            );
        });

        it("should use default workspace when none provided", async() => {
            client.getPaginated.mockResolvedValueOnce({ values: [], total: 0 });

            const handler = toolHandlers.get("listRepositories")!;

            await handler({});

            expect(client.getPaginated).toHaveBeenCalledWith(
                "/repositories/default-ws",
                expect.anything(),
                expect.anything()
            );
        });

        it("should filter by name", async() => {
            client.getPaginated.mockResolvedValueOnce({ values: [], total: 0 });

            const handler = toolHandlers.get("listRepositories")!;

            await handler({ name: "my-repo" });

            expect(client.getPaginated).toHaveBeenCalledWith(
                "/repositories/default-ws",
                expect.anything(),
                { q: "name ~ \"my-repo\"" }
            );
        });

        it("should handle 404 for non-existent workspace", async() => {
            client.getPaginated.mockRejectedValueOnce(make404());

            const handler = toolHandlers.get("listRepositories")!;
            const result = await handler({ workspace: "nonexistent" }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("FAILED");
            expect(response.message).toContain("not found");
        });

        it("should error when no workspace is available", async() => {
            // Re-register without default workspace
            const serverNoWs = new McpServer({ name: "test", version: "0.0.1" });
            const handlersNoWs = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();
            const origReg = serverNoWs.registerTool.bind(serverNoWs);

            serverNoWs.registerTool = ((...args: unknown[]) => {
                handlersNoWs.set(args[0] as string, args[args.length - 1] as (args: Record<string, unknown>) => Promise<unknown>);

                return origReg(...(args as Parameters<typeof origReg>));
            }) as typeof serverNoWs.registerTool;

            registerRepositoryTools(serverNoWs, client);

            const handler = handlersNoWs.get("listRepositories")!;
            const result = await handler({}) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("FAILED");
            expect(response.message).toContain("Workspace is required");
        });

        it("should handle unexpected errors gracefully", async() => {
            client.getPaginated.mockRejectedValueOnce(new Error("Connection refused"));

            const handler = toolHandlers.get("listRepositories")!;
            const result = await handler({ workspace: "ws" }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("FAILED");
            expect(response.message).toContain("Unexpected error");
            expect(response.message).toContain("Connection refused");
        });
    });

    describe("getRepository", () => {
        it("should return a repository", async() => {
            const mockRepo = { slug: "my-repo", full_name: "ws/my-repo" };

            client.get.mockResolvedValueOnce(mockRepo);

            const handler = toolHandlers.get("getRepository")!;
            const result = await handler({ repoSlug: "my-repo", workspace: "ws" }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.result).toEqual(mockRepo);
            expect(client.get).toHaveBeenCalledWith("/repositories/ws/my-repo");
        });

        it("should handle 404 for non-existent repository", async() => {
            client.get.mockRejectedValueOnce(make404());

            const handler = toolHandlers.get("getRepository")!;
            const result = await handler({ repoSlug: "nonexistent", workspace: "ws" }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("FAILED");
            expect(response.message).toContain("not found");
        });
    });
});
