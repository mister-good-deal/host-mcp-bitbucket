import { describe, it, expect, jest, beforeEach } from "@jest/globals";

import { BitbucketClient, BitbucketClientError } from "../../../src/bitbucket/client.js";

// Mock global fetch
const mockFetch = jest.fn();

global.fetch = mockFetch;

describe("BitbucketClient", () => {
    let client: BitbucketClient;

    beforeEach(() => {
        mockFetch.mockReset();
        client = new BitbucketClient({
            baseUrl: "https://api.bitbucket.org/2.0",
            token: "test-token",
            timeout: 5000
        });
    });

    describe("get", () => {
        it("should make authenticated GET requests", async() => {
            const mockData = { slug: "my-repo", full_name: "ws/my-repo" };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async() => mockData
            });

            const result = await client.get("/repositories/ws/my-repo");

            expect(mockFetch).toHaveBeenCalledWith(
                "https://api.bitbucket.org/2.0/repositories/ws/my-repo",
                expect.objectContaining({
                    method: "GET",
                    headers: { Authorization: "Bearer test-token" }
                })
            );
            expect(result).toEqual(mockData);
        });

        it("should append query parameters", async() => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async() => ({ values: [] })
            });

            await client.get("/repositories/ws", { pagelen: 10, page: 2 });

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining("?pagelen=10&page=2"),
                expect.anything()
            );
        });

        it("should throw BitbucketClientError on 404", async() => {
            const mock404 = {
                ok: false,
                status: 404,
                statusText: "Not Found",
                text: async() => "Not Found"
            };

            mockFetch.mockResolvedValueOnce(mock404).mockResolvedValueOnce(mock404);

            await expect(client.get("/repositories/ws/nonexistent")).rejects.toThrow(BitbucketClientError);
            await expect(client.get("/repositories/ws/nonexistent")).rejects.toThrow(/not found/i);
        });

        it("should throw BitbucketClientError on 401", async() => {
            const mock401 = {
                ok: false,
                status: 401,
                statusText: "Unauthorized",
                text: async() => "Unauthorized"
            };

            mockFetch.mockResolvedValueOnce(mock401).mockResolvedValueOnce(mock401);

            await expect(client.get("/repositories/ws")).rejects.toThrow(BitbucketClientError);
            await expect(client.get("/repositories/ws")).rejects.toThrow(/Authentication failed/);
        });

        it("should throw BitbucketClientError on 403", async() => {
            const mock403 = {
                ok: false,
                status: 403,
                statusText: "Forbidden",
                text: async() => "Forbidden"
            };

            mockFetch.mockResolvedValueOnce(mock403).mockResolvedValueOnce(mock403);

            await expect(client.get("/repositories/ws")).rejects.toThrow(BitbucketClientError);
            await expect(client.get("/repositories/ws")).rejects.toThrow(/Authentication failed/);
        });
    });

    describe("getText", () => {
        it("should return raw text", async() => {
            const diffContent = "diff --git a/file.ts b/file.ts\n+added line";

            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: async() => diffContent
            });

            const result = await client.getText("/repositories/ws/repo/pullrequests/1/diff");

            expect(result).toBe(diffContent);
        });
    });

    describe("post", () => {
        it("should make authenticated POST requests with JSON body", async() => {
            const mockPR = { id: 1, title: "New PR" };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: async() => JSON.stringify(mockPR)
            });

            const result = await client.post("/repositories/ws/repo/pullrequests", {
                title: "New PR",
                source: { branch: { name: "feature" }}
            });

            expect(mockFetch).toHaveBeenCalledWith(
                "https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests",
                expect.objectContaining({
                    method: "POST",
                    headers: expect.objectContaining({
                        "Authorization": "Bearer test-token",
                        "Content-Type": "application/json"
                    }),
                    body: expect.any(String)
                })
            );
            expect(result).toEqual(mockPR);
        });

        it("should handle empty response body", async() => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: async() => ""
            });

            const result = await client.post("/repositories/ws/repo/pullrequests/1/approve");

            expect(result).toBeNull();
        });
    });

    describe("put", () => {
        it("should make authenticated PUT requests with JSON body", async() => {
            const mockUpdated = { id: 1, title: "Updated PR" };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: async() => JSON.stringify(mockUpdated)
            });

            const result = await client.put("/repositories/ws/repo/pullrequests/1", {
                title: "Updated PR"
            });

            expect(mockFetch).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    method: "PUT",
                    headers: expect.objectContaining({
                        "Authorization": "Bearer test-token",
                        "Content-Type": "application/json"
                    })
                })
            );
            expect(result).toEqual(mockUpdated);
        });
    });

    describe("delete", () => {
        it("should make authenticated DELETE requests", async() => {
            mockFetch.mockResolvedValueOnce({
                ok: true
            });

            await client.delete("/repositories/ws/repo/pullrequests/1/comments/42");

            expect(mockFetch).toHaveBeenCalledWith(
                "https://api.bitbucket.org/2.0/repositories/ws/repo/pullrequests/1/comments/42",
                expect.objectContaining({
                    method: "DELETE",
                    headers: { Authorization: "Bearer test-token" }
                })
            );
        });
    });

    describe("getPaginated", () => {
        it("should return a single page", async() => {
            const mockResponse = {
                values: [{ slug: "repo1" }, { slug: "repo2" }],
                size: 5,
                page: 1,
                pagelen: 2
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async() => mockResponse
            });

            const result = await client.getPaginated("/repositories/ws", { pagelen: 2, page: 1 });

            expect(result.values).toHaveLength(2);
            expect(result.total).toBe(5);
        });

        it("should fetch all pages when all=true", async() => {
            const page1 = {
                values: [{ slug: "repo1" }, { slug: "repo2" }],
                size: 4,
                page: 1,
                pagelen: 2,
                next: "https://api.bitbucket.org/2.0/repositories/ws?page=2&pagelen=2"
            };
            const page2 = {
                values: [{ slug: "repo3" }, { slug: "repo4" }],
                size: 4,
                page: 2,
                pagelen: 2
            };

            mockFetch.
                mockResolvedValueOnce({ ok: true, json: async() => page1 }).
                mockResolvedValueOnce({ ok: true, json: async() => page2 });

            const result = await client.getPaginated("/repositories/ws", { all: true });

            expect(result.values).toHaveLength(4);
            expect(result.total).toBe(4);
        });

        it("should not fetch all pages when page is specified even with all=true", async() => {
            const mockResponse = {
                values: [{ slug: "repo1" }],
                size: 10,
                page: 3,
                pagelen: 1
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async() => mockResponse
            });

            const result = await client.getPaginated("/repositories/ws", { all: true, page: 3, pagelen: 1 });

            expect(result.values).toHaveLength(1);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });
    });

    describe("retry logic", () => {
        let retryClient: BitbucketClient;

        beforeEach(() => {
            retryClient = new BitbucketClient({
                baseUrl: "https://api.bitbucket.org/2.0",
                token: "test-token",
                timeout: 5000,
                maxRetries: 2,
                retryDelay: 10 // Very short for tests
            });
        });

        it("should retry on 503 and succeed", async() => {
            mockFetch.
                mockResolvedValueOnce({ ok: false, status: 503, statusText: "Service Unavailable", text: async() => "" }).
                mockResolvedValueOnce({ ok: true, json: async() => ({ status: "ok" }) });

            const result = await retryClient.get("/repositories/ws");

            expect(result).toEqual({ status: "ok" });
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it("should retry on 429 (rate limit) and succeed", async() => {
            mockFetch.
                mockResolvedValueOnce({ ok: false, status: 429, statusText: "Too Many Requests", text: async() => "" }).
                mockResolvedValueOnce({ ok: true, json: async() => ({ status: "ok" }) });

            const result = await retryClient.get("/repositories/ws");

            expect(result).toEqual({ status: "ok" });
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it("should retry on 500 and fail after max retries", async() => {
            const mock500 = { ok: false, status: 500, statusText: "Internal Server Error", text: async() => "error" };

            mockFetch.
                mockResolvedValueOnce(mock500).
                mockResolvedValueOnce(mock500).
                mockResolvedValueOnce(mock500);

            await expect(retryClient.get("/repositories/ws")).rejects.toThrow(BitbucketClientError);
            expect(mockFetch).toHaveBeenCalledTimes(3); // initial + 2 retries
        });

        it("should not retry on 404", async() => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: "Not Found",
                text: async() => "Not Found"
            });

            await expect(retryClient.get("/repositories/ws/nope")).rejects.toThrow(/not found/i);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it("should not retry on 401", async() => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: "Unauthorized",
                text: async() => "Unauthorized"
            });

            await expect(retryClient.get("/repositories/ws")).rejects.toThrow(/Authentication failed/);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it("should retry on network errors", async() => {
            mockFetch.
                mockRejectedValueOnce(new TypeError("fetch failed")).
                mockResolvedValueOnce({ ok: true, json: async() => ({ status: "ok" }) });

            const result = await retryClient.get("/repositories/ws");

            expect(result).toEqual({ status: "ok" });
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });
    });

    describe("constructor", () => {
        it("should strip trailing slashes from base URL", () => {
            const c = new BitbucketClient({
                baseUrl: "https://api.bitbucket.org/2.0///",
                token: "token",
                timeout: 5000
            });

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async() => ({})
            });

            c.get("/repositories/ws");

            expect(mockFetch).toHaveBeenCalledWith(
                "https://api.bitbucket.org/2.0/repositories/ws",
                expect.anything()
            );
        });
    });
});
