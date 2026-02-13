import { describe, it, expect } from "@jest/globals";

import { normalizeBaseUrl, extractWorkspaceFromUrl, buildQueryString, detectPlatform, PathBuilder } from "../../../src/bitbucket/utils.js";

describe("detectPlatform", () => {
    it("should detect bitbucket.org as cloud", () => {
        expect(detectPlatform("https://bitbucket.org/myworkspace")).toBe("cloud");
    });

    it("should detect www.bitbucket.org as cloud", () => {
        expect(detectPlatform("https://www.bitbucket.org/myworkspace")).toBe("cloud");
    });

    it("should detect api.bitbucket.org as cloud", () => {
        expect(detectPlatform("https://api.bitbucket.org/2.0")).toBe("cloud");
    });

    it("should detect self-hosted URL as datacenter", () => {
        expect(detectPlatform("https://bitbucket.mycompany.com")).toBe("datacenter");
    });

    it("should detect self-hosted URL with REST path as datacenter", () => {
        expect(detectPlatform("https://bitbucket.mycompany.com/rest/api/latest")).toBe("datacenter");
    });

    it("should detect localhost URL with /2.0 path as cloud", () => {
        expect(detectPlatform("http://localhost:7990/2.0")).toBe("cloud");
    });

    it("should detect proxy URL with /2.0 path as cloud", () => {
        expect(detectPlatform("https://proxy.mycompany.com/2.0")).toBe("cloud");
    });
});

describe("normalizeBaseUrl", () => {
    it("should convert bitbucket.org web URL to API URL", () => {
        expect(normalizeBaseUrl("https://bitbucket.org/myworkspace")).toBe("https://api.bitbucket.org/2.0");
    });

    it("should convert www.bitbucket.org web URL to API URL", () => {
        expect(normalizeBaseUrl("https://www.bitbucket.org/myworkspace")).toBe("https://api.bitbucket.org/2.0");
    });

    it("should add /2.0 suffix to api.bitbucket.org", () => {
        expect(normalizeBaseUrl("https://api.bitbucket.org")).toBe("https://api.bitbucket.org/2.0");
    });

    it("should leave api.bitbucket.org/2.0 unchanged", () => {
        expect(normalizeBaseUrl("https://api.bitbucket.org/2.0")).toBe("https://api.bitbucket.org/2.0");
    });

    it("should strip trailing slashes from self-hosted URLs", () => {
        expect(normalizeBaseUrl("https://bitbucket.mycompany.com/rest/api/1.0/")).toBe("https://bitbucket.mycompany.com/rest/api/1.0");
    });

    it("should strip multiple trailing slashes and add REST path", () => {
        expect(normalizeBaseUrl("https://bitbucket.mycompany.com///")).toBe("https://bitbucket.mycompany.com/rest/api/latest");
    });

    it("should add REST API path to bare self-hosted URL", () => {
        expect(normalizeBaseUrl("https://bitbucket.mycompany.com")).toBe("https://bitbucket.mycompany.com/rest/api/latest");
    });

    it("should handle bare bitbucket.org without path", () => {
        expect(normalizeBaseUrl("https://bitbucket.org")).toBe("https://api.bitbucket.org/2.0");
    });

    it("should keep /2.0 URL unchanged for proxy or mock servers", () => {
        expect(normalizeBaseUrl("http://localhost:7990/2.0")).toBe("http://localhost:7990/2.0");
    });
});

describe("extractWorkspaceFromUrl", () => {
    it("should extract workspace from bitbucket.org URL", () => {
        expect(extractWorkspaceFromUrl("https://bitbucket.org/myworkspace")).toBe("myworkspace");
    });

    it("should extract workspace from www.bitbucket.org URL", () => {
        expect(extractWorkspaceFromUrl("https://www.bitbucket.org/myworkspace")).toBe("myworkspace");
    });

    it("should extract workspace from URL with trailing path", () => {
        expect(extractWorkspaceFromUrl("https://bitbucket.org/myworkspace/some-repo")).toBe("myworkspace");
    });

    it("should return undefined for api.bitbucket.org URL", () => {
        expect(extractWorkspaceFromUrl("https://api.bitbucket.org/2.0")).toBeUndefined();
    });

    it("should return undefined for self-hosted URL", () => {
        expect(extractWorkspaceFromUrl("https://bitbucket.mycompany.com/rest/api/1.0")).toBeUndefined();
    });

    it("should return undefined for bare bitbucket.org without workspace", () => {
        expect(extractWorkspaceFromUrl("https://bitbucket.org")).toBeUndefined();
    });

    it("should return undefined for bitbucket.org with trailing slash only", () => {
        expect(extractWorkspaceFromUrl("https://bitbucket.org/")).toBeUndefined();
    });
});

describe("buildQueryString", () => {
    it("should build a query string from params", () => {
        expect(buildQueryString({ pagelen: 10, page: 2 })).toBe("?pagelen=10&page=2");
    });

    it("should URL-encode special characters", () => {
        expect(buildQueryString({ q: "name ~ \"test\"" })).toBe("?q=name%20~%20%22test%22");
    });

    it("should skip undefined and null values", () => {
        expect(buildQueryString({ pagelen: 10, state: undefined, foo: null })).toBe("?pagelen=10");
    });

    it("should return empty string when no valid params", () => {
        expect(buildQueryString({ a: undefined, b: null })).toBe("");
    });

    it("should return empty string for empty object", () => {
        expect(buildQueryString({})).toBe("");
    });

    it("should handle boolean values", () => {
        expect(buildQueryString({ all: true })).toBe("?all=true");
    });
});

describe("PathBuilder", () => {
    describe("Cloud", () => {
        const paths = new PathBuilder("cloud");

        it("should use /tasks path for pullRequestTasks", () => {
            expect(paths.pullRequestTasks("ws", "repo", 1)).toBe("/repositories/ws/repo/pullrequests/1/tasks");
        });

        it("should use /tasks/{id} path for pullRequestTask", () => {
            expect(paths.pullRequestTask("ws", "repo", 1, 42)).toBe("/repositories/ws/repo/pullrequests/1/tasks/42");
        });
    });

    describe("Data Center", () => {
        const paths = new PathBuilder("datacenter");

        it("should use /blocker-comments path for pullRequestTasks", () => {
            expect(paths.pullRequestTasks("PL", "my-repo", 1)).toBe("/projects/PL/repos/my-repo/pull-requests/1/blocker-comments");
        });

        it("should use /blocker-comments/{id} path for pullRequestTask", () => {
            expect(paths.pullRequestTask("PL", "my-repo", 1, 42)).toBe("/projects/PL/repos/my-repo/pull-requests/1/blocker-comments/42");
        });
    });
});
