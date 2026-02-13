#!/usr/bin/env node

/**
 * Mock Bitbucket REST API server for integration testing.
 *
 * Stubs both Bitbucket Cloud 2.0 API and Data Center REST API endpoints
 * with deterministic responses. Runs as a standalone HTTP server in Docker.
 *
 * Cloud paths:  /2.0/...
 * DC paths:     /rest/api/latest/...
 *
 * NOTE: Atlassian publishes an official Bitbucket DC Docker image
 * (atlassian/bitbucket — https://hub.docker.com/r/atlassian/bitbucket)
 * but it requires ~2 GB RAM, 1-3 min startup, and a license.
 * This lightweight mock starts in <1s with deterministic fixtures.
 */

import { createServer } from "node:http";

const PORT = parseInt(process.env.PORT ?? "7990", 10);
const TOKEN = process.env.MOCK_TOKEN ?? "test-token";

// ── Fixtures ─────────────────────────────────────────────────────────────

const WORKSPACE = {
    uuid: "{workspace-001}",
    name: "Integration Test Workspace",
    slug: "test-workspace",
    is_private: false,
    type: "workspace",
    created_on: "2025-01-01T00:00:00Z",
    links: { self: { href: "http://localhost:7990/2.0/workspaces/test-workspace" } }
};

const USER = {
    uuid: "{user-001}",
    display_name: "Test Admin",
    nickname: "admin",
    account_id: "admin-001",
    type: "user",
    links: { self: { href: "http://localhost:7990/2.0/user" } }
};

const REPOSITORIES = [
    {
        uuid: "{repo-001}",
        name: "test-repo",
        full_name: "test-workspace/test-repo",
        slug: "test-repo",
        description: "A test repository for integration testing",
        is_private: false,
        language: "typescript",
        created_on: "2025-01-01T00:00:00Z",
        updated_on: "2025-06-01T00:00:00Z",
        size: 1024,
        mainbranch: { name: "main", type: "branch" },
        owner: USER,
        links: { self: { href: "http://localhost:7990/2.0/repositories/test-workspace/test-repo" } }
    },
    {
        uuid: "{repo-002}",
        name: "another-repo",
        full_name: "test-workspace/another-repo",
        slug: "another-repo",
        description: "Another test repository",
        is_private: true,
        language: "python",
        created_on: "2025-02-01T00:00:00Z",
        updated_on: "2025-06-15T00:00:00Z",
        size: 2048,
        mainbranch: { name: "main", type: "branch" },
        owner: USER,
        links: { self: { href: "http://localhost:7990/2.0/repositories/test-workspace/another-repo" } }
    }
];

const PULL_REQUESTS = [
    {
        id: 1,
        title: "Add new feature",
        description: "This PR adds a new feature",
        state: "OPEN",
        author: USER,
        source: {
            branch: { name: "feature/new-feature", type: "branch" },
            commit: { hash: "abc123" },
            repository: { full_name: "test-workspace/test-repo", name: "test-repo", uuid: "{repo-001}" }
        },
        destination: {
            branch: { name: "main", type: "branch" },
            commit: { hash: "def456" },
            repository: { full_name: "test-workspace/test-repo", name: "test-repo", uuid: "{repo-001}" }
        },
        created_on: "2025-06-01T10:00:00Z",
        updated_on: "2025-06-02T12:00:00Z",
        comment_count: 2,
        task_count: 1,
        close_source_branch: true,
        reviewers: [],
        participants: [],
        links: { self: { href: "http://localhost:7990/2.0/repositories/test-workspace/test-repo/pullrequests/1" } }
    }
];

const COMMENTS = [
    {
        id: 1,
        content: { raw: "Looks good!", markup: "markdown", html: "<p>Looks good!</p>" },
        created_on: "2025-06-01T11:00:00Z",
        updated_on: "2025-06-01T11:00:00Z",
        user: USER,
        deleted: false,
        pending: false,
        type: "pullrequest_comment",
        links: {}
    },
    {
        id: 2,
        content: { raw: "Please fix this line", markup: "markdown", html: "<p>Please fix this line</p>" },
        created_on: "2025-06-01T12:00:00Z",
        updated_on: "2025-06-01T12:00:00Z",
        user: USER,
        inline: { path: "src/index.ts", from: null, to: 10 },
        deleted: false,
        pending: false,
        type: "pullrequest_comment",
        links: {}
    }
];

const TASKS = [
    {
        id: 1,
        state: "OPEN",
        content: { raw: "Fix typo in README", markup: "markdown", html: "<p>Fix typo in README</p>" },
        created_on: "2025-06-01T13:00:00Z",
        updated_on: "2025-06-01T13:00:00Z",
        creator: USER,
        links: {}
    }
];

const DIFF = `diff --git a/src/index.ts b/src/index.ts
index abc123..def456 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,5 @@
 console.log("hello");
+console.log("new line");
+console.log("another line");
`;

const DIFFSTAT = [
    {
        status: "modified",
        old: { path: "src/index.ts", type: "commit_file" },
        new: { path: "src/index.ts", type: "commit_file" },
        lines_added: 2,
        lines_removed: 0
    }
];

const COMMITS = [
    {
        hash: "abc123def456",
        message: "Add new feature",
        author: { raw: "Test Admin <admin@test.com>", user: USER },
        date: "2025-06-01T10:00:00Z",
        parents: [{ hash: "000111" }],
        links: {}
    }
];

const STATUSES = [
    {
        uuid: "{status-001}",
        key: "ci/test",
        state: "SUCCESSFUL",
        name: "CI Tests",
        description: "All tests passed",
        url: "https://ci.example.com/build/1",
        created_on: "2025-06-01T10:30:00Z",
        updated_on: "2025-06-01T10:35:00Z",
        links: {}
    }
];

const BRANCHES = [
    { name: "main", type: "branch", target: { hash: "abc123" }, links: {} },
    { name: "develop", type: "branch", target: { hash: "def456" }, links: {} },
    { name: "feature/new-feature", type: "branch", target: { hash: "ghi789" }, links: {} }
];

const TAGS = [
    { name: "v1.0.0", type: "tag", target: { hash: "aaa111" }, links: {} },
    { name: "v2.0.0", type: "tag", target: { hash: "bbb222" }, links: {} }
];

// Track mutable state for write operations (Cloud)
let nextCommentId = 3;
let nextTaskId = 2;
const dynamicComments = [...COMMENTS];
const dynamicTasks = [...TASKS];

// ── DC Fixtures ──────────────────────────────────────────────────────────

const DC_PROJECT = {
    key: "TEST",
    id: 1,
    name: "Test Project",
    description: "Integration test project",
    public: true,
    type: "NORMAL",
    links: { self: [{ href: "http://localhost:7990/projects/TEST" }] }
};

const DC_APP_PROPERTIES = {
    version: "8.19.25",
    buildNumber: "8019025",
    buildDate: "1700000000000",
    displayName: "Bitbucket"
};

const DC_USER = {
    name: "test-admin",
    emailAddress: "admin@test.com",
    active: true,
    displayName: "Test Admin",
    id: 1,
    slug: "test-admin",
    type: "NORMAL",
    links: { self: [{ href: "http://localhost:7990/users/test-admin" }] }
};

const DC_REPOSITORIES = [
    {
        slug: "test-repo",
        id: 1,
        name: "test-repo",
        description: "A test repository",
        state: "AVAILABLE",
        public: true,
        project: DC_PROJECT,
        links: { self: [{ href: "http://localhost:7990/projects/TEST/repos/test-repo" }],
            clone: [{ href: "http://localhost:7990/scm/TEST/test-repo.git", name: "http" }] }
    },
    {
        slug: "another-repo",
        id: 2,
        name: "another-repo",
        description: "Another test repository",
        state: "AVAILABLE",
        public: false,
        project: DC_PROJECT,
        links: { self: [{ href: "http://localhost:7990/projects/TEST/repos/another-repo" }] }
    }
];

const DC_PULL_REQUESTS = [
    {
        id: 1,
        title: "Add new feature",
        description: "This PR adds a new feature",
        state: "OPEN",
        open: true,
        closed: false,
        author: { user: DC_USER, role: "AUTHOR", approved: false },
        reviewers: [],
        participants: [],
        fromRef: {
            id: "refs/heads/feature/new-feature",
            displayId: "feature/new-feature",
            latestCommit: "abc123"
        },
        toRef: {
            id: "refs/heads/master",
            displayId: "master",
            latestCommit: "def456"
        },
        createdDate: 1700000000000,
        updatedDate: 1700100000000,
        links: { self: [{ href: "http://localhost:7990/projects/TEST/repos/test-repo/pull-requests/1" }] }
    }
];

const DC_COMMENTS = [
    {
        id: 1,
        version: 0,
        text: "Looks good!",
        author: DC_USER,
        createdDate: 1700000000000,
        updatedDate: 1700000000000,
        comments: [],
        severity: "NORMAL",
        state: "OPEN",
        permittedOperations: { editable: true, deletable: true }
    }
];

const DC_ACTIVITIES = [
    {
        id: 1,
        action: "COMMENTED",
        comment: DC_COMMENTS[0],
        createdDate: 1700000000000,
        user: DC_USER
    },
    {
        id: 2,
        action: "OPENED",
        createdDate: 1699900000000,
        user: DC_USER
    }
];

const DC_BLOCKER_COMMENTS = [
    {
        id: 100,
        version: 0,
        text: "Fix this blocker issue",
        author: DC_USER,
        createdDate: 1700000000000,
        updatedDate: 1700000000000,
        comments: [],
        threadResolved: false,
        severity: "BLOCKER",
        state: "OPEN",
        permittedOperations: { editable: true, transitionable: true, deletable: true }
    }
];

const DC_COMMITS = [
    {
        id: "abc123def456",
        displayId: "abc123d",
        message: "Add new feature",
        author: { name: "Test Admin", emailAddress: "admin@test.com" },
        authorTimestamp: 1700000000000,
        committerTimestamp: 1700000000000,
        parents: [{ id: "000111", displayId: "000111" }]
    }
];

const DC_BRANCHES = [
    { id: "refs/heads/master", displayId: "master", type: "BRANCH", latestCommit: "abc123", isDefault: true },
    { id: "refs/heads/develop", displayId: "develop", type: "BRANCH", latestCommit: "def456", isDefault: false },
    { id: "refs/heads/feature/new-feature", displayId: "feature/new-feature", type: "BRANCH", latestCommit: "ghi789", isDefault: false }
];

const DC_TAGS = [
    { id: "refs/tags/v1.0.0", displayId: "v1.0.0", type: "TAG", latestCommit: "aaa111" },
    { id: "refs/tags/v2.0.0", displayId: "v2.0.0", type: "TAG", latestCommit: "bbb222" }
];

const DC_DIFF = `diff --git a/src/index.ts b/src/index.ts
index abc123..def456 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,5 @@
 console.log("hello");
+console.log("new line");
+console.log("another line");
`;

const DC_CHANGES = [
    {
        contentId: "abc123",
        fromContentId: "def456",
        path: { toString: "src/index.ts", name: "index.ts", parent: "src", components: ["src", "index.ts"] },
        type: "MODIFY",
        nodeType: "FILE"
    }
];

// Track mutable state for DC write operations
let dcNextCommentId = 2;
let dcNextBlockerId = 101;
const dcDynamicComments = [...DC_COMMENTS];
const dcDynamicBlockers = [...DC_BLOCKER_COMMENTS];
let dcPullRequest = { ...DC_PULL_REQUESTS[0] };

// ── Helpers ──────────────────────────────────────────────────────────────

function paginate(values, query) {
    const pagelen = Math.min(parseInt(query.pagelen ?? "10", 10), 100);
    const page = parseInt(query.page ?? "1", 10);
    const start = (page - 1) * pagelen;
    const paged = values.slice(start, start + pagelen);

    const result = {
        pagelen,
        size: values.length,
        page,
        values: paged
    };

    if (start + pagelen < values.length) {
        result.next = `?pagelen=${pagelen}&page=${page + 1}`;
    }

    return result;
}

function parseQuery(url) {
    const idx = url.indexOf("?");

    if (idx < 0) return {};

    const params = {};
    const qs = url.slice(idx + 1);

    for (const pair of qs.split("&")) {
        const [k, v] = pair.split("=");

        params[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
    }

    return params;
}

function json(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
}

function text(res, status, body) {
    res.writeHead(status, { "Content-Type": "text/plain" });
    res.end(body);
}

function notFound(res, message = "Resource not found") {
    json(res, 404, { type: "error", error: { message } });
}

function readBody(req) {
    return new Promise((resolve) => {
        let data = "";

        req.on("data", (chunk) => data += chunk);
        req.on("end", () => {
            try {
                resolve(data ? JSON.parse(data) : {});
            } catch {
                resolve({});
            }
        });
    });
}

// ── Router ───────────────────────────────────────────────────────────────

const server = createServer(async(req, res) => {
    const method = req.method ?? "GET";
    const fullUrl = req.url ?? "/";
    const path = fullUrl.split("?")[0].replace(/\/+$/, "");
    const query = parseQuery(fullUrl);

    // Auth check
    const auth = req.headers.authorization;

    if (!auth || auth !== `Bearer ${TOKEN}`) {
        json(res, 401, { type: "error", error: { message: "Authentication failed" } });

        return;
    }

    // Health check
    if (path === "/health" && method === "GET") {
        json(res, 200, { status: "ok" });

        return;
    }

    // ── User ─────────────────────────────────────────────────
    if (path === "/2.0/user" && method === "GET") {
        json(res, 200, USER);

        return;
    }

    // ── Workspaces ───────────────────────────────────────────
    if (path === "/2.0/workspaces/test-workspace" && method === "GET") {
        json(res, 200, WORKSPACE);

        return;
    }

    if (/^\/2\.0\/workspaces\//.test(path) && method === "GET") {
        notFound(res, "Workspace not found");

        return;
    }

    // ── Repositories ─────────────────────────────────────────
    const repoListMatch = path.match(/^\/2\.0\/repositories\/([^\/]+)$/);

    if (repoListMatch && method === "GET") {
        if (repoListMatch[1] !== "test-workspace") {
            notFound(res, "Workspace not found");

            return;
        }

        json(res, 200, paginate(REPOSITORIES, query));

        return;
    }

    const repoGetMatch = path.match(/^\/2\.0\/repositories\/([^\/]+)\/([^\/]+)$/);

    if (repoGetMatch && method === "GET") {
        const repo = REPOSITORIES.find(r => r.slug === repoGetMatch[2]);

        if (!repo) {
            notFound(res, `Repository not found: ${repoGetMatch[1]}/${repoGetMatch[2]}`);

            return;
        }

        json(res, 200, repo);

        return;
    }

    // ── Pull Requests ────────────────────────────────────────
    const prListMatch = path.match(/^\/2\.0\/repositories\/([^\/]+)\/([^\/]+)\/pullrequests$/);

    if (prListMatch && method === "GET") {
        json(res, 200, paginate(PULL_REQUESTS, query));

        return;
    }

    if (prListMatch && method === "POST") {
        const body = await readBody(req);
        const newPR = {
            ...PULL_REQUESTS[0],
            id: 99,
            title: body.title ?? "New PR",
            description: body.description ?? "",
            state: "OPEN",
            source: body.source ?? PULL_REQUESTS[0].source,
            destination: body.destination ?? PULL_REQUESTS[0].destination,
            created_on: new Date().toISOString(),
            updated_on: new Date().toISOString()
        };

        json(res, 201, newPR);

        return;
    }

    const prGetMatch = path.match(/^\/2\.0\/repositories\/([^\/]+)\/([^\/]+)\/pullrequests\/(\d+)$/);

    if (prGetMatch && method === "GET") {
        const pr = PULL_REQUESTS.find(p => p.id === parseInt(prGetMatch[3], 10));

        if (!pr) {
            notFound(res, `Pull request not found: #${prGetMatch[3]}`);

            return;
        }

        json(res, 200, pr);

        return;
    }

    if (prGetMatch && method === "PUT") {
        const pr = PULL_REQUESTS.find(p => p.id === parseInt(prGetMatch[3], 10));

        if (!pr) {
            notFound(res);

            return;
        }

        const body = await readBody(req);

        json(res, 200, { ...pr, ...body, updated_on: new Date().toISOString() });

        return;
    }

    // ── PR Actions ───────────────────────────────────────────
    const prActionMatch = path.match(/^\/2\.0\/repositories\/([^\/]+)\/([^\/]+)\/pullrequests\/(\d+)\/(approve|request-changes|decline|merge)$/);

    if (prActionMatch) {
        const prId = parseInt(prActionMatch[3], 10);
        const pr = PULL_REQUESTS.find(p => p.id === prId) ?? { ...PULL_REQUESTS[0], id: prId };

        if (method === "POST") {
            const action = prActionMatch[4];

            if (action === "approve") {
                json(res, 200, { approved: true, user: USER });
            } else if (action === "decline") {
                json(res, 200, { ...pr, state: "DECLINED" });
            } else if (action === "merge") {
                json(res, 200, { ...pr, state: "MERGED" });
            } else {
                json(res, 200, { user: USER });
            }

            return;
        }

        if (method === "DELETE") {
            json(res, 204, null);

            return;
        }
    }

    // ── PR Activity ──────────────────────────────────────────
    const activityMatch = path.match(/^\/2\.0\/repositories\/([^\/]+)\/([^\/]+)\/pullrequests\/(\d+)\/activity$/);

    if (activityMatch && method === "GET") {
        json(res, 200, paginate([{ update: { state: "OPEN" } }], query));

        return;
    }

    // ── PR Commits ───────────────────────────────────────────
    const commitsMatch = path.match(/^\/2\.0\/repositories\/([^\/]+)\/([^\/]+)\/pullrequests\/(\d+)\/commits$/);

    if (commitsMatch && method === "GET") {
        json(res, 200, paginate(COMMITS, query));

        return;
    }

    // ── PR Statuses ──────────────────────────────────────────
    const statusesMatch = path.match(/^\/2\.0\/repositories\/([^\/]+)\/([^\/]+)\/pullrequests\/(\d+)\/statuses$/);

    if (statusesMatch && method === "GET") {
        json(res, 200, paginate(STATUSES, query));

        return;
    }

    // ── PR Diff ──────────────────────────────────────────────
    const diffMatch = path.match(/^\/2\.0\/repositories\/([^\/]+)\/([^\/]+)\/pullrequests\/(\d+)\/diff$/);

    if (diffMatch && method === "GET") {
        text(res, 200, DIFF);

        return;
    }

    // ── PR Diffstat ──────────────────────────────────────────
    const diffstatMatch = path.match(/^\/2\.0\/repositories\/([^\/]+)\/([^\/]+)\/pullrequests\/(\d+)\/diffstat$/);

    if (diffstatMatch && method === "GET") {
        json(res, 200, paginate(DIFFSTAT, query));

        return;
    }

    // ── PR Patch ─────────────────────────────────────────────
    const patchMatch = path.match(/^\/2\.0\/repositories\/([^\/]+)\/([^\/]+)\/pullrequests\/(\d+)\/patch$/);

    if (patchMatch && method === "GET") {
        text(res, 200, DIFF);

        return;
    }

    // ── Branches ─────────────────────────────────────────────
    const branchesMatch = path.match(/^\/2\.0\/repositories\/([^\/]+)\/([^\/]+)\/refs\/branches$/);

    if (branchesMatch && method === "GET") {
        json(res, 200, paginate(BRANCHES, query));

        return;
    }

    // ── Tags ─────────────────────────────────────────────────
    const tagsMatch = path.match(/^\/2\.0\/repositories\/([^\/]+)\/([^\/]+)\/refs\/tags$/);

    if (tagsMatch && method === "GET") {
        json(res, 200, paginate(TAGS, query));

        return;
    }

    // ── PR Comments ──────────────────────────────────────────
    const commentsListMatch = path.match(/^\/2\.0\/repositories\/([^\/]+)\/([^\/]+)\/pullrequests\/(\d+)\/comments$/);

    if (commentsListMatch && method === "GET") {
        json(res, 200, paginate(dynamicComments, query));

        return;
    }

    if (commentsListMatch && method === "POST") {
        const body = await readBody(req);
        const newComment = {
            id: nextCommentId++,
            content: body.content ?? { raw: "" },
            created_on: new Date().toISOString(),
            updated_on: new Date().toISOString(),
            user: USER,
            inline: body.inline,
            parent: body.parent,
            deleted: false,
            pending: false,
            type: "pullrequest_comment",
            links: {}
        };

        dynamicComments.push(newComment);
        json(res, 201, newComment);

        return;
    }

    const commentGetMatch = path.match(/^\/2\.0\/repositories\/([^\/]+)\/([^\/]+)\/pullrequests\/(\d+)\/comments\/(\d+)$/);

    if (commentGetMatch && method === "GET") {
        const comment = dynamicComments.find(c => c.id === parseInt(commentGetMatch[4], 10));

        if (!comment) {
            notFound(res);

            return;
        }

        json(res, 200, comment);

        return;
    }

    if (commentGetMatch && method === "PUT") {
        const commentId = parseInt(commentGetMatch[4], 10);
        const comment = dynamicComments.find(c => c.id === commentId);

        if (!comment) {
            notFound(res);

            return;
        }

        const body = await readBody(req);

        Object.assign(comment, { content: body.content ?? comment.content, updated_on: new Date().toISOString() });
        json(res, 200, comment);

        return;
    }

    if (commentGetMatch && method === "DELETE") {
        const commentId = parseInt(commentGetMatch[4], 10);
        const idx = dynamicComments.findIndex(c => c.id === commentId);

        if (idx < 0) {
            notFound(res);

            return;
        }

        dynamicComments.splice(idx, 1);
        res.writeHead(204);
        res.end();

        return;
    }

    // ── Comment resolve/reopen ───────────────────────────────
    const commentResolveMatch = path.match(/^\/2\.0\/repositories\/([^\/]+)\/([^\/]+)\/pullrequests\/(\d+)\/comments\/(\d+)\/resolve$/);

    if (commentResolveMatch && method === "PUT") {
        const comment = dynamicComments.find(c => c.id === parseInt(commentResolveMatch[4], 10));

        if (!comment) {
            notFound(res);

            return;
        }

        json(res, 200, { ...comment, resolved: true });

        return;
    }

    if (commentResolveMatch && method === "DELETE") {
        const comment = dynamicComments.find(c => c.id === parseInt(commentResolveMatch[4], 10));

        if (!comment) {
            notFound(res);

            return;
        }

        res.writeHead(204);
        res.end();

        return;
    }

    // ── PR Tasks ─────────────────────────────────────────────
    const tasksListMatch = path.match(/^\/2\.0\/repositories\/([^\/]+)\/([^\/]+)\/pullrequests\/(\d+)\/tasks$/);

    if (tasksListMatch && method === "GET") {
        json(res, 200, paginate(dynamicTasks, query));

        return;
    }

    if (tasksListMatch && method === "POST") {
        const body = await readBody(req);
        const newTask = {
            id: nextTaskId++,
            state: body.state ?? "OPEN",
            content: body.content ?? { raw: "" },
            created_on: new Date().toISOString(),
            updated_on: new Date().toISOString(),
            creator: USER,
            comment: body.comment,
            links: {}
        };

        dynamicTasks.push(newTask);
        json(res, 201, newTask);

        return;
    }

    const taskGetMatch = path.match(/^\/2\.0\/repositories\/([^\/]+)\/([^\/]+)\/pullrequests\/(\d+)\/tasks\/(\d+)$/);

    if (taskGetMatch && method === "GET") {
        const task = dynamicTasks.find(t => t.id === parseInt(taskGetMatch[4], 10));

        if (!task) {
            notFound(res);

            return;
        }

        json(res, 200, task);

        return;
    }

    if (taskGetMatch && method === "PUT") {
        const taskId = parseInt(taskGetMatch[4], 10);
        const task = dynamicTasks.find(t => t.id === taskId);

        if (!task) {
            notFound(res);

            return;
        }

        const body = await readBody(req);

        if (body.content) task.content = body.content;

        if (body.state) task.state = body.state;

        task.updated_on = new Date().toISOString();
        json(res, 200, task);

        return;
    }

    if (taskGetMatch && method === "DELETE") {
        const taskId = parseInt(taskGetMatch[4], 10);
        const idx = dynamicTasks.findIndex(t => t.id === taskId);

        if (idx < 0) {
            notFound(res);

            return;
        }

        dynamicTasks.splice(idx, 1);
        res.writeHead(204);
        res.end();

        return;
    }

    // ══════════════════════════════════════════════════════════
    // ██  Data Center REST API routes  (/rest/api/latest/...) ██
    // ══════════════════════════════════════════════════════════

    const DC = "/rest/api/latest";

    /** DC-style paginated response. */
    function dcPaginate(values, query) {
        const limit = Math.min(parseInt(query.limit ?? "25", 10), 100);
        const start = parseInt(query.start ?? "0", 10);
        const paged = values.slice(start, start + limit);
        const isLastPage = start + limit >= values.length;

        return {
            size: values.length,
            limit,
            start,
            isLastPage,
            values: paged,
            ...(isLastPage ? {} : { nextPageStart: start + limit })
        };
    }

    // ── DC: Application properties (auth/connectivity check) ─
    if (path === `${DC}/application-properties` && method === "GET") {
        json(res, 200, DC_APP_PROPERTIES);

        return;
    }

    // ── DC: Projects ─────────────────────────────────────────
    const dcProjectMatch = path.match(/^\/rest\/api\/latest\/projects\/([^\/]+)$/);

    if (dcProjectMatch && method === "GET") {
        if (dcProjectMatch[1] !== "TEST") {
            json(res, 404, { errors: [{ message: `Project ${dcProjectMatch[1]} does not exist.` }] });

            return;
        }

        json(res, 200, DC_PROJECT);

        return;
    }

    // ── DC: Repositories list ────────────────────────────────
    const dcRepoListMatch = path.match(/^\/rest\/api\/latest\/projects\/([^\/]+)\/repos$/);

    if (dcRepoListMatch && method === "GET") {
        if (dcRepoListMatch[1] !== "TEST") {
            json(res, 404, { errors: [{ message: "Project not found" }] });

            return;
        }

        let repos = DC_REPOSITORIES;

        if (query.name) {
            repos = repos.filter(r => r.name.toLowerCase().includes(query.name.toLowerCase()));
        }

        json(res, 200, dcPaginate(repos, query));

        return;
    }

    // ── DC: Global repos endpoint (used for name filtering) ──
    if (path === `${DC}/repos` && method === "GET") {
        let repos = DC_REPOSITORIES;

        if (query.name) {
            repos = repos.filter(r => r.name.toLowerCase().includes(query.name.toLowerCase()));
        }

        json(res, 200, dcPaginate(repos, query));

        return;
    }

    // ── DC: Repository get ───────────────────────────────────
    const dcRepoGetMatch = path.match(/^\/rest\/api\/latest\/projects\/([^\/]+)\/repos\/([^\/]+)$/);

    if (dcRepoGetMatch && method === "GET") {
        const repo = DC_REPOSITORIES.find(r => r.slug === dcRepoGetMatch[2]);

        if (!repo) {
            json(res, 404, { errors: [{ message: `Repository ${dcRepoGetMatch[2]} does not exist.` }] });

            return;
        }

        json(res, 200, repo);

        return;
    }

    // ── DC: Branches ─────────────────────────────────────────
    const dcBranchMatch = path.match(/^\/rest\/api\/latest\/projects\/([^\/]+)\/repos\/([^\/]+)\/branches$/);

    if (dcBranchMatch && method === "GET") {
        let branches = DC_BRANCHES;

        if (query.filterText) {
            branches = branches.filter(b => b.displayId.toLowerCase().includes(query.filterText.toLowerCase()));
        }

        json(res, 200, dcPaginate(branches, query));

        return;
    }

    // ── DC: Tags ─────────────────────────────────────────────
    const dcTagMatch = path.match(/^\/rest\/api\/latest\/projects\/([^\/]+)\/repos\/([^\/]+)\/tags$/);

    if (dcTagMatch && method === "GET") {
        let tags = DC_TAGS;

        if (query.filterText) {
            tags = tags.filter(t => t.displayId.toLowerCase().includes(query.filterText.toLowerCase()));
        }

        json(res, 200, dcPaginate(tags, query));

        return;
    }

    // ── DC: Pull Requests list ───────────────────────────────
    const dcPRListMatch = path.match(/^\/rest\/api\/latest\/projects\/([^\/]+)\/repos\/([^\/]+)\/pull-requests$/);

    if (dcPRListMatch && method === "GET") {
        json(res, 200, dcPaginate([dcPullRequest], query));

        return;
    }

    if (dcPRListMatch && method === "POST") {
        const body = await readBody(req);
        const newPR = {
            ...DC_PULL_REQUESTS[0],
            id: 99,
            title: body.title ?? "New PR",
            description: body.description ?? "",
            state: "OPEN",
            open: true,
            closed: false,
            fromRef: body.fromRef ?? DC_PULL_REQUESTS[0].fromRef,
            toRef: body.toRef ?? DC_PULL_REQUESTS[0].toRef,
            createdDate: Date.now(),
            updatedDate: Date.now()
        };

        json(res, 201, newPR);

        return;
    }

    // ── DC: Pull Request get/update ──────────────────────────
    const dcPRGetMatch = path.match(/^\/rest\/api\/latest\/projects\/([^\/]+)\/repos\/([^\/]+)\/pull-requests\/(\d+)$/);

    if (dcPRGetMatch && method === "GET") {
        const prId = parseInt(dcPRGetMatch[3], 10);

        if (prId !== dcPullRequest.id) {
            json(res, 404, { errors: [{ message: `Pull request ${prId} does not exist.` }] });

            return;
        }

        json(res, 200, dcPullRequest);

        return;
    }

    if (dcPRGetMatch && method === "PUT") {
        const prId = parseInt(dcPRGetMatch[3], 10);

        if (prId !== dcPullRequest.id) {
            json(res, 404, { errors: [{ message: `Pull request ${prId} does not exist.` }] });

            return;
        }

        const body = await readBody(req);

        if (body.title !== undefined) dcPullRequest.title = body.title;

        if (body.description !== undefined) dcPullRequest.description = body.description;

        dcPullRequest.updatedDate = Date.now();
        json(res, 200, { ...dcPullRequest });

        return;
    }

    // ── DC: PR .diff (raw) ───────────────────────────────────
    const dcDiffMatch = path.match(/^\/rest\/api\/latest\/projects\/([^\/]+)\/repos\/([^\/]+)\/pull-requests\/(\d+)\.diff$/);

    if (dcDiffMatch && method === "GET") {
        text(res, 200, DC_DIFF);

        return;
    }

    // ── DC: PR changes (diffstat) ────────────────────────────
    const dcChangesMatch = path.match(/^\/rest\/api\/latest\/projects\/([^\/]+)\/repos\/([^\/]+)\/pull-requests\/(\d+)\/changes$/);

    if (dcChangesMatch && method === "GET") {
        json(res, 200, dcPaginate(DC_CHANGES, query));

        return;
    }

    // ── DC: PR Activities ────────────────────────────────────
    const dcActivityMatch = path.match(/^\/rest\/api\/latest\/projects\/([^\/]+)\/repos\/([^\/]+)\/pull-requests\/(\d+)\/activities$/);

    if (dcActivityMatch && method === "GET") {
        json(res, 200, dcPaginate(DC_ACTIVITIES, query));

        return;
    }

    // ── DC: PR Commits ───────────────────────────────────────
    const dcCommitsMatch = path.match(/^\/rest\/api\/latest\/projects\/([^\/]+)\/repos\/([^\/]+)\/pull-requests\/(\d+)\/commits$/);

    if (dcCommitsMatch && method === "GET") {
        json(res, 200, dcPaginate(DC_COMMITS, query));

        return;
    }

    // ── DC: PR Approve ───────────────────────────────────────
    const dcApproveMatch = path.match(/^\/rest\/api\/latest\/projects\/([^\/]+)\/repos\/([^\/]+)\/pull-requests\/(\d+)\/approve$/);

    if (dcApproveMatch && method === "POST") {
        json(res, 200, { user: DC_USER, role: "REVIEWER", approved: true, status: "APPROVED" });

        return;
    }

    if (dcApproveMatch && method === "DELETE") {
        json(res, 200, { user: DC_USER, role: "REVIEWER", approved: false, status: "UNAPPROVED" });

        return;
    }

    // ── DC: PR Request Changes ───────────────────────────────
    const dcRequestChangesMatch = path.match(/^\/rest\/api\/latest\/projects\/([^\/]+)\/repos\/([^\/]+)\/pull-requests\/(\d+)\/request-changes$/);

    if (dcRequestChangesMatch && method === "POST") {
        json(res, 200, { user: DC_USER, role: "REVIEWER", status: "NEEDS_WORK" });

        return;
    }

    if (dcRequestChangesMatch && method === "DELETE") {
        json(res, 200, { user: DC_USER, role: "REVIEWER", status: "UNAPPROVED" });

        return;
    }

    // ── DC: PR Decline ───────────────────────────────────────
    const dcDeclineMatch = path.match(/^\/rest\/api\/latest\/projects\/([^\/]+)\/repos\/([^\/]+)\/pull-requests\/(\d+)\/decline$/);

    if (dcDeclineMatch && method === "POST") {
        json(res, 200, { ...dcPullRequest, state: "DECLINED", open: false, closed: true });

        return;
    }

    // ── DC: PR Merge ─────────────────────────────────────────
    const dcMergeMatch = path.match(/^\/rest\/api\/latest\/projects\/([^\/]+)\/repos\/([^\/]+)\/pull-requests\/(\d+)\/merge$/);

    if (dcMergeMatch && method === "POST") {
        json(res, 200, { ...dcPullRequest, state: "MERGED", open: false, closed: true });

        return;
    }

    // ── DC: PR Comments ──────────────────────────────────────
    const dcCommentsMatch = path.match(/^\/rest\/api\/latest\/projects\/([^\/]+)\/repos\/([^\/]+)\/pull-requests\/(\d+)\/comments$/);

    if (dcCommentsMatch && method === "GET") {
        json(res, 200, dcPaginate(dcDynamicComments, query));

        return;
    }

    if (dcCommentsMatch && method === "POST") {
        const body = await readBody(req);
        const newComment = {
            id: dcNextCommentId++,
            version: 0,
            text: body.text ?? "",
            author: DC_USER,
            createdDate: Date.now(),
            updatedDate: Date.now(),
            comments: [],
            severity: "NORMAL",
            state: "OPEN",
            permittedOperations: { editable: true, deletable: true }
        };

        if (body.anchor) newComment.anchor = body.anchor;

        if (body.parent) newComment.parent = body.parent;

        dcDynamicComments.push(newComment);
        json(res, 201, newComment);

        return;
    }

    const dcCommentGetMatch = path.match(/^\/rest\/api\/latest\/projects\/([^\/]+)\/repos\/([^\/]+)\/pull-requests\/(\d+)\/comments\/(\d+)$/);

    if (dcCommentGetMatch && method === "GET") {
        const comment = dcDynamicComments.find(c => c.id === parseInt(dcCommentGetMatch[4], 10));

        if (!comment) {
            json(res, 404, { errors: [{ message: "Comment not found" }] });

            return;
        }

        json(res, 200, comment);

        return;
    }

    if (dcCommentGetMatch && method === "PUT") {
        const commentId = parseInt(dcCommentGetMatch[4], 10);
        const comment = dcDynamicComments.find(c => c.id === commentId);

        if (!comment) {
            json(res, 404, { errors: [{ message: "Comment not found" }] });

            return;
        }

        const body = await readBody(req);

        if (body.text !== undefined) comment.text = body.text;

        comment.version++;
        comment.updatedDate = Date.now();
        json(res, 200, { ...comment });

        return;
    }

    if (dcCommentGetMatch && method === "DELETE") {
        const commentId = parseInt(dcCommentGetMatch[4], 10);
        const idx = dcDynamicComments.findIndex(c => c.id === commentId);

        if (idx < 0) {
            json(res, 404, { errors: [{ message: "Comment not found" }] });

            return;
        }

        dcDynamicComments.splice(idx, 1);
        res.writeHead(204);
        res.end();

        return;
    }

    // ── DC: Comment resolve/reopen ───────────────────────────
    const dcCommentResolveMatch = path.match(/^\/rest\/api\/latest\/projects\/([^\/]+)\/repos\/([^\/]+)\/pull-requests\/(\d+)\/comments\/(\d+)\/resolve$/);

    if (dcCommentResolveMatch && method === "PUT") {
        const comment = dcDynamicComments.find(c => c.id === parseInt(dcCommentResolveMatch[4], 10));

        if (!comment) {
            json(res, 404, { errors: [{ message: "Comment not found" }] });

            return;
        }

        comment.state = "RESOLVED";
        comment.version++;
        json(res, 200, { ...comment });

        return;
    }

    if (dcCommentResolveMatch && method === "DELETE") {
        const comment = dcDynamicComments.find(c => c.id === parseInt(dcCommentResolveMatch[4], 10));

        if (!comment) {
            json(res, 404, { errors: [{ message: "Comment not found" }] });

            return;
        }

        comment.state = "OPEN";
        comment.version++;
        res.writeHead(204);
        res.end();

        return;
    }

    // ── DC: Blocker-comments (tasks) ─────────────────────────
    const dcBlockerListMatch = path.match(/^\/rest\/api\/latest\/projects\/([^\/]+)\/repos\/([^\/]+)\/pull-requests\/(\d+)\/blocker-comments$/);

    if (dcBlockerListMatch && method === "GET") {
        json(res, 200, dcPaginate(dcDynamicBlockers, query));

        return;
    }

    if (dcBlockerListMatch && method === "POST") {
        const body = await readBody(req);
        const newBlocker = {
            id: dcNextBlockerId++,
            version: 0,
            text: body.text ?? "",
            author: DC_USER,
            createdDate: Date.now(),
            updatedDate: Date.now(),
            comments: [],
            threadResolved: false,
            severity: body.severity ?? "BLOCKER",
            state: "OPEN",
            permittedOperations: { editable: true, transitionable: true, deletable: true }
        };

        dcDynamicBlockers.push(newBlocker);
        json(res, 201, newBlocker);

        return;
    }

    const dcBlockerGetMatch = path.match(/^\/rest\/api\/latest\/projects\/([^\/]+)\/repos\/([^\/]+)\/pull-requests\/(\d+)\/blocker-comments\/(\d+)$/);

    if (dcBlockerGetMatch && method === "GET") {
        const blocker = dcDynamicBlockers.find(b => b.id === parseInt(dcBlockerGetMatch[4], 10));

        if (!blocker) {
            json(res, 404, { errors: [{ message: "Blocker comment not found" }] });

            return;
        }

        json(res, 200, blocker);

        return;
    }

    if (dcBlockerGetMatch && method === "PUT") {
        const blockerId = parseInt(dcBlockerGetMatch[4], 10);
        const blocker = dcDynamicBlockers.find(b => b.id === blockerId);

        if (!blocker) {
            json(res, 404, { errors: [{ message: "Blocker comment not found" }] });

            return;
        }

        const body = await readBody(req);

        if (body.text !== undefined) blocker.text = body.text;

        if (body.state !== undefined) blocker.state = body.state;

        blocker.version++;
        blocker.updatedDate = Date.now();
        json(res, 200, { ...blocker });

        return;
    }

    if (dcBlockerGetMatch && method === "DELETE") {
        const blockerId = parseInt(dcBlockerGetMatch[4], 10);
        const idx = dcDynamicBlockers.findIndex(b => b.id === blockerId);

        if (idx < 0) {
            json(res, 404, { errors: [{ message: "Blocker comment not found" }] });

            return;
        }

        dcDynamicBlockers.splice(idx, 1);
        res.writeHead(204);
        res.end();

        return;
    }

    // ── DC: PR Statuses (no direct equivalent — return empty) ─
    const dcStatusesMatch = path.match(/^\/rest\/api\/latest\/projects\/([^\/]+)\/repos\/([^\/]+)\/pull-requests\/(\d+)\/statuses$/);

    if (dcStatusesMatch && method === "GET") {
        json(res, 200, dcPaginate([], query));

        return;
    }

    // ── DC: PR Patch (not supported on DC) ───────────────────
    const dcPatchMatch = path.match(/^\/rest\/api\/latest\/projects\/([^\/]+)\/repos\/([^\/]+)\/pull-requests\/(\d+)\/patch$/);

    if (dcPatchMatch && method === "GET") {
        json(res, 404, { errors: [{ message: "Patch is not available on Data Center." }] });

        return;
    }

    // ── Catch-all ────────────────────────────────────────────
    notFound(res, `No mock handler for ${method} ${path}`);
});

server.listen(PORT, () => {
    console.log(`Mock Bitbucket API server listening on http://0.0.0.0:${PORT}`);
});
