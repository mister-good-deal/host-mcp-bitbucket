#!/usr/bin/env node

/**
 * Mock Bitbucket REST API server for integration testing.
 *
 * Stubs the Bitbucket Cloud 2.0 API endpoints with deterministic responses.
 * Runs as a standalone HTTP server in Docker, no external dependencies required.
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

// Track mutable state for write operations
let nextCommentId = 3;
let nextTaskId = 2;
const dynamicComments = [...COMMENTS];
const dynamicTasks = [...TASKS];

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
        const pr = PULL_REQUESTS.find(p => p.id === prId);

        if (!pr) {
            notFound(res);

            return;
        }

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

    // ── Catch-all ────────────────────────────────────────────
    notFound(res, `No mock handler for ${method} ${path}`);
});

server.listen(PORT, () => {
    console.log(`Mock Bitbucket API server listening on http://0.0.0.0:${PORT}`);
});
