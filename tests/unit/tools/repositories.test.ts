import { describe, it, expect, beforeEach } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { BitbucketClientError } from "../../../src/bitbucket/client.js";
import { registerRepositoryTools } from "../../../src/tools/repositories.js";
import { createMockClient, createPaths, extractToolResponse, make404 } from "./helpers.js";

describe("Repository Tools", () => {
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

        registerRepositoryTools(server, client, paths, "default-ws");
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

            registerRepositoryTools(serverNoWs, client, paths);

            const handler = handlersNoWs.get("listRepositories")!;
            const result = await handler({}) as ReturnType<typeof extractToolResponse>;
            const response = extractToolResponse(result as never);

            expect(response.status).toBe("FAILED");
            expect(response.message).toContain("is required");
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

    describe("createRepository", () => {
        describe("Cloud", () => {
            it("should create a repository and derive the slug from the name", async() => {
                const mockRepo = { slug: "my-new-repo", full_name: "ws/my-new-repo" };

                client.post.mockResolvedValueOnce(mockRepo);

                const handler = toolHandlers.get("createRepository")!;
                const result = await handler({ name: "My New Repo", workspace: "ws" }) as ReturnType<typeof extractToolResponse>;
                const response = extractToolResponse(result as never);

                expect(response.status).toBe("COMPLETED");
                expect(response.result).toEqual(mockRepo);
                expect(client.post).toHaveBeenCalledWith(
                    "/repositories/ws/my-new-repo",
                    { scm: "git", name: "My New Repo", is_private: true }
                );
            });

            it("should honour an explicit repoSlug", async() => {
                client.post.mockResolvedValueOnce({});

                const handler = toolHandlers.get("createRepository")!;

                await handler({ name: "My New Repo", repoSlug: "custom-slug" });

                expect(client.post).toHaveBeenCalledWith("/repositories/default-ws/custom-slug", expect.anything());
            });

            it("should map optional fields to the Cloud body", async() => {
                client.post.mockResolvedValueOnce({});

                const handler = toolHandlers.get("createRepository")!;

                await handler({
                    name: "devstack",
                    description: "A stack",
                    isPrivate: false,
                    projectKey: "POC",
                    forkable: false
                });

                expect(client.post).toHaveBeenCalledWith(
                    "/repositories/default-ws/devstack",
                    {
                        scm: "git",
                        name: "devstack",
                        is_private: false,
                        description: "A stack",
                        project: { key: "POC" },
                        fork_policy: "no_forks"
                    }
                );
            });

            it("should map forkable=true to allow_forks", async() => {
                client.post.mockResolvedValueOnce({});

                const handler = toolHandlers.get("createRepository")!;

                await handler({ name: "devstack", forkable: true });

                expect(client.post).toHaveBeenCalledWith(
                    "/repositories/default-ws/devstack",
                    expect.objectContaining({ fork_policy: "allow_forks" })
                );
            });

            it("should ignore defaultBranch and report it in the message", async() => {
                client.post.mockResolvedValueOnce({});

                const handler = toolHandlers.get("createRepository")!;
                const result = await handler({ name: "devstack", defaultBranch: "main" }) as ReturnType<typeof extractToolResponse>;
                const response = extractToolResponse(result as never);

                expect(response.status).toBe("COMPLETED");
                expect(response.message).toContain("defaultBranch is not supported");
                expect(client.post).toHaveBeenCalledWith(
                    "/repositories/default-ws/devstack",
                    expect.not.objectContaining({ defaultBranch: expect.anything() })
                );
            });

            it("should fail when no slug can be derived from the name", async() => {
                const handler = toolHandlers.get("createRepository")!;
                const result = await handler({ name: "!!!" }) as ReturnType<typeof extractToolResponse>;
                const response = extractToolResponse(result as never);

                expect(response.status).toBe("FAILED");
                expect(response.message).toContain("repoSlug");
                expect(client.post).not.toHaveBeenCalled();
            });
        });

        describe("Data Center", () => {
            let dcHandlers: Map<string, (args: Record<string, unknown>) => Promise<unknown>>;
            let dcClient: ReturnType<typeof createMockClient>;

            beforeEach(() => {
                const dcServer = new McpServer({ name: "test", version: "0.0.1" });

                dcClient = createMockClient("datacenter");
                dcHandlers = new Map();

                const origReg = dcServer.registerTool.bind(dcServer);

                dcServer.registerTool = ((...args: unknown[]) => {
                    dcHandlers.set(args[0] as string, args[args.length - 1] as (args: Record<string, unknown>) => Promise<unknown>);

                    return origReg(...(args as Parameters<typeof origReg>));
                }) as typeof dcServer.registerTool;

                registerRepositoryTools(dcServer, dcClient, createPaths("datacenter"), "TEST");
            });

            it("should POST to the project repos endpoint", async() => {
                const mockRepo = { slug: "devstack", name: "devstack" };

                dcClient.post.mockResolvedValueOnce(mockRepo);

                const handler = dcHandlers.get("createRepository")!;
                const result = await handler({ name: "devstack" }) as ReturnType<typeof extractToolResponse>;
                const response = extractToolResponse(result as never);

                expect(response.status).toBe("COMPLETED");
                expect(response.result).toEqual(mockRepo);
                expect(dcClient.post).toHaveBeenCalledWith("/projects/TEST/repos", { name: "devstack", scmId: "git" });
            });

            it("should map optional fields to the DC body", async() => {
                dcClient.post.mockResolvedValueOnce({});

                const handler = dcHandlers.get("createRepository")!;

                await handler({
                    name: "devstack",
                    description: "A stack",
                    defaultBranch: "main",
                    forkable: true,
                    isPrivate: false
                });

                expect(dcClient.post).toHaveBeenCalledWith(
                    "/projects/TEST/repos",
                    {
                        name: "devstack",
                        scmId: "git",
                        description: "A stack",
                        defaultBranch: "main",
                        forkable: true,
                        public: true
                    }
                );
            });

            it("should map isPrivate=true to public=false", async() => {
                dcClient.post.mockResolvedValueOnce({});

                const handler = dcHandlers.get("createRepository")!;

                await handler({ name: "devstack", isPrivate: true });

                expect(dcClient.post).toHaveBeenCalledWith("/projects/TEST/repos", expect.objectContaining({ public: false }));
            });

            it("should accept projectKey as an alias for the workspace", async() => {
                dcClient.post.mockResolvedValueOnce({});

                const handler = dcHandlers.get("createRepository")!;

                await handler({ name: "devstack", projectKey: "OTHER" });

                expect(dcClient.post).toHaveBeenCalledWith("/projects/OTHER/repos", { name: "devstack", scmId: "git" });
            });

            it("should ignore repoSlug and report it in the message", async() => {
                dcClient.post.mockResolvedValueOnce({});

                const handler = dcHandlers.get("createRepository")!;
                const result = await handler({ name: "devstack", repoSlug: "custom" }) as ReturnType<typeof extractToolResponse>;
                const response = extractToolResponse(result as never);

                expect(response.message).toContain("repoSlug is ignored");
                expect(dcClient.post).toHaveBeenCalledWith("/projects/TEST/repos", { name: "devstack", scmId: "git" });
            });
        });

        describe("error mapping", () => {
            it("should report a conflict when the repository already exists", async() => {
                client.post.mockRejectedValueOnce(new BitbucketClientError("Conflict", 409));

                const handler = toolHandlers.get("createRepository")!;
                const result = await handler({ name: "devstack", workspace: "ws" }) as ReturnType<typeof extractToolResponse>;
                const response = extractToolResponse(result as never);

                expect(response.status).toBe("FAILED");
                expect(response.message).toContain("already exists");
                expect(response.message).toContain("devstack");
                expect(response.message).toContain("ws");
            });

            it("should name the workspace on a permission error", async() => {
                client.post.mockRejectedValueOnce(new BitbucketClientError("Authentication failed (403).", 403));

                const handler = toolHandlers.get("createRepository")!;
                const result = await handler({ name: "devstack", workspace: "ws" }) as ReturnType<typeof extractToolResponse>;
                const response = extractToolResponse(result as never);

                expect(response.status).toBe("FAILED");
                expect(response.message).toContain("repository-creation permission");
                expect(response.message).toContain("ws");
            });

            it("should report a missing workspace on 404", async() => {
                client.post.mockRejectedValueOnce(make404());

                const handler = toolHandlers.get("createRepository")!;
                const result = await handler({ name: "devstack", workspace: "nonexistent" }) as ReturnType<typeof extractToolResponse>;
                const response = extractToolResponse(result as never);

                expect(response.status).toBe("FAILED");
                expect(response.message).toContain("not found");
            });

            it("should error when no workspace is available", async() => {
                const serverNoWs = new McpServer({ name: "test", version: "0.0.1" });
                const handlersNoWs = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();
                const origReg = serverNoWs.registerTool.bind(serverNoWs);

                serverNoWs.registerTool = ((...args: unknown[]) => {
                    handlersNoWs.set(args[0] as string, args[args.length - 1] as (args: Record<string, unknown>) => Promise<unknown>);

                    return origReg(...(args as Parameters<typeof origReg>));
                }) as typeof serverNoWs.registerTool;

                registerRepositoryTools(serverNoWs, client, paths);

                const handler = handlersNoWs.get("createRepository")!;
                const result = await handler({ name: "devstack" }) as ReturnType<typeof extractToolResponse>;
                const response = extractToolResponse(result as never);

                expect(response.status).toBe("FAILED");
                expect(response.message).toContain("is required");
            });

            it("should handle unexpected errors gracefully", async() => {
                client.post.mockRejectedValueOnce(new Error("Connection refused"));

                const handler = toolHandlers.get("createRepository")!;
                const result = await handler({ name: "devstack", workspace: "ws" }) as ReturnType<typeof extractToolResponse>;
                const response = extractToolResponse(result as never);

                expect(response.status).toBe("FAILED");
                expect(response.message).toContain("Unexpected error");
            });
        });
    });
});
