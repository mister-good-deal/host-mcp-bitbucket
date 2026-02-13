import { describe, it, expect, beforeEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerWorkspaceTools } from "../../../src/tools/workspace.js";
import { createMockClient, createPaths, extractToolResponse, make404 } from "./helpers.js";

describe("Workspace Tools", () => {
    let server: McpServer;
    let client: ReturnType<typeof createMockClient>;
    let toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<unknown>>;
    let paths: ReturnType<typeof createPaths>;

    beforeEach(() => {
        server = new McpServer({ name: "test", version: "0.0.1" });
        client = createMockClient();
        toolHandlers = new Map();
        paths = createPaths();

        const originalRegisterTool = server.registerTool.bind(server);

        server.registerTool = ((...args: unknown[]) => {
            const name = args[0] as string;
            const handler = args[args.length - 1] as (args: Record<string, unknown>) => Promise<unknown>;

            toolHandlers.set(name, handler);

            return originalRegisterTool(...(args as Parameters<typeof originalRegisterTool>));
        }) as typeof server.registerTool;

        registerWorkspaceTools(server, client, paths, "default-ws");
    });

    describe("getCurrentUser", () => {
        it("should return the authenticated user", async() => {
            const mockUser = {
                uuid: "{user-123}",
                display_name: "Test User",
                nickname: "testuser",
                account_id: "123456",
                type: "user"
            };

            client.get.mockResolvedValueOnce(mockUser);

            const handler = toolHandlers.get("getCurrentUser")!;
            const result = await handler({}) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.message).toBe("Authenticated successfully.");
            expect(response.result).toEqual(mockUser);
            expect(client.get).toHaveBeenCalledWith("/user");
        });

        it("should return error on auth failure", async() => {
            client.get.mockRejectedValueOnce(new Error("Authentication failed"));

            const handler = toolHandlers.get("getCurrentUser")!;
            const result = await handler({}) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("FAILED");
            expect(response.message).toContain("Authentication failed");
        });
    });

    describe("getWorkspace", () => {
        it("should return workspace details", async() => {
            const mockWorkspace = {
                uuid: "{ws-123}",
                name: "My Workspace",
                slug: "my-ws",
                is_private: false,
                type: "workspace"
            };

            client.get.mockResolvedValueOnce(mockWorkspace);

            const handler = toolHandlers.get("getWorkspace")!;
            const result = await handler({ workspace: "my-ws" }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("COMPLETED");
            expect(response.result).toEqual(mockWorkspace);
            expect(client.get).toHaveBeenCalledWith("/workspaces/my-ws");
        });

        it("should use default workspace when none provided", async() => {
            const mockWorkspace = {
                uuid: "{ws-default}",
                name: "Default",
                slug: "default-ws",
                is_private: false,
                type: "workspace"
            };

            client.get.mockResolvedValueOnce(mockWorkspace);

            const handler = toolHandlers.get("getWorkspace")!;

            await handler({});

            expect(client.get).toHaveBeenCalledWith("/workspaces/default-ws");
        });

        it("should return error when no workspace is available", async() => {
            // Create a server without default workspace
            const noDefaultServer = new McpServer({ name: "test", version: "0.0.1" });
            const noDefaultHandlers = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();
            const originalRegister = noDefaultServer.registerTool.bind(noDefaultServer);

            noDefaultServer.registerTool = ((...args: unknown[]) => {
                const name = args[0] as string;
                const handler = args[args.length - 1] as (args: Record<string, unknown>) => Promise<unknown>;

                noDefaultHandlers.set(name, handler);

                return originalRegister(...(args as Parameters<typeof originalRegister>));
            }) as typeof noDefaultServer.registerTool;

            registerWorkspaceTools(noDefaultServer, client, paths);

            const handler = noDefaultHandlers.get("getWorkspace")!;
            const result = await handler({}) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("FAILED");
            expect(response.message).toContain("is required");
        });

        it("should return not found for non-existent workspace", async() => {
            client.get.mockRejectedValueOnce(make404());

            const handler = toolHandlers.get("getWorkspace")!;
            const result = await handler({ workspace: "nonexistent" }) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("FAILED");
            expect(response.message).toContain("not found");
        });
    });
});
