# host-mcp-bitbucket

A local MCP (Model Context Protocol) server for Bitbucket that provides AI assistants with access to Bitbucket repositories, pull requests, comments, diffs, and tasks via REST API.

Works with both **Bitbucket Cloud** and **Bitbucket Server/Data Center** instances.

## Compatibility

| Platform | Versions | Status |
|----------|----------|--------|
| Bitbucket Cloud | Current | ✅ Fully supported |
| Bitbucket Data Center | 8.x | ✅ Fully supported |
| Bitbucket Data Center | 9.x | ✅ Fully supported |
| Bitbucket Data Center | 10.x | ✅ Fully supported |

> **Note:** Tasks on Data Center use the blocker-comments API (`/blocker-comments`) introduced in Bitbucket 7.2. The legacy `/tasks` endpoint was removed in Bitbucket 9.0. This MCP server uses the modern blocker-comments API, which is the only option on DC 8.0+.

## Features

- **Dual platform** — full support for both Bitbucket Cloud and Bitbucket Server/Data Center APIs
- **Repository operations** — list and get repository details
- **Pull request management** — create, update, approve, merge, decline, request changes
- **PR comments** — add, update, delete, resolve/reopen comments (including inline comments)
- **PR diffs** — get raw diffs, diff statistics, and patches
- **PR tasks** — create, update, delete tasks on pull requests
- **Branch & tag listing** — list branches and tags with optional filtering
- **Pagination** — automatic pagination with `all` mode (capped at 1000 items); Cloud and DC pagination styles handled transparently
- **Dual transport** — stdio (default) and Streamable HTTP
- **Retry with backoff** — automatic retry on transient errors (429, 5xx)

## Quick Start

### Install from npm

```bash
npx @mister-good-deal/host-mcp-bitbucket --bitbucket-token <YOUR_TOKEN>
```

### Use with Claude Desktop / VS Code

Add to your MCP configuration:

```json
{
    "mcpServers": {
        "bitbucket": {
            "command": "npx",
            "args": [
                "-y",
                "@mister-good-deal/host-mcp-bitbucket",
                "--bitbucket-token", "<YOUR_TOKEN>",
                "--default-workspace", "<YOUR_WORKSPACE>"
            ]
        }
    }
}
```

### Environment Variables

You can also configure via environment variables:

```bash
export BITBUCKET_TOKEN="your-app-password-or-access-token"
export BITBUCKET_WORKSPACE="your-workspace"
export BITBUCKET_URL="https://api.bitbucket.org/2.0"  # optional, default for Cloud
```

## Configuration

| Flag | Env Variable | Default | Description |
|------|-------------|---------|-------------|
| `--bitbucket-url` | `BITBUCKET_URL` | `https://api.bitbucket.org/2.0` | Bitbucket API base URL |
| `--bitbucket-token` | `BITBUCKET_TOKEN` | — | **Required.** API token (app password or access token) |
| `--default-workspace` | `BITBUCKET_WORKSPACE` | — | Default workspace (auto-extracted from URL if possible) |
| `--insecure` | `BITBUCKET_INSECURE=true` | `false` | Skip TLS certificate verification |
| `--log-level` | `LOG_LEVEL` | `info` | Log level (debug\|info\|warn\|error) |
| `--timeout` | `BITBUCKET_TIMEOUT` | `30000` | HTTP timeout in ms |
| `--max-retries` | `BITBUCKET_MAX_RETRIES` | `3` | Max retries for transient errors |
| `--retry-delay` | `BITBUCKET_RETRY_DELAY` | `1000` | Base retry delay in ms |
| `--transport` | `MCP_TRANSPORT` | `stdio` | Transport type (stdio\|http) |
| `--port` | `MCP_PORT` | `3000` | HTTP port (only with `--transport http`) |

### Bitbucket Server / Data Center

For self-hosted instances, point `--bitbucket-url` to your server URL (the REST API path is auto-appended):

```bash
npx @mister-good-deal/host-mcp-bitbucket \
    --bitbucket-url "https://bitbucket.mycompany.com" \
    --bitbucket-token "<YOUR_HTTP_ACCESS_TOKEN>" \
    --default-workspace "<PROJECT_KEY>"
```

The server auto-detects the platform (Cloud vs Data Center) from the URL and uses the correct API paths, pagination style, and request bodies. For DC, the `--default-workspace` value maps to a **project key**.

## Available Tools

### Pagination

Unless noted otherwise, listing tools accept the following optional parameters:

- `pagelen` — Number of items per page (default: 10, max: 100)
- `page` — 1-based page number
- `all` — When `true`, fetches all pages automatically (capped at 1000 items)

### Workspace / Connectivity

| Tool | Description |
|------|-------------|
| `getCurrentUser` | Get the authenticated user (Cloud) or verify connectivity (DC) |
| `getWorkspace` | Get workspace (Cloud) or project (DC) details |

### Repository Operations

| Tool | Description |
|------|-------------|
| `listRepositories` | List repositories in a workspace |
| `getRepository` | Get details for a specific repository |

### Pull Request Operations

| Tool | Description |
|------|-------------|
| `getPullRequests` | List pull requests for a repository (filterable by state) |
| `createPullRequest` | Create a new pull request (supports draft mode) |
| `getPullRequest` | Get details for a specific pull request |
| `updatePullRequest` | Update pull request title and/or description |
| `getPullRequestActivity` | Get the activity log for a pull request |
| `approvePullRequest` | Approve a pull request |
| `unapprovePullRequest` | Remove approval from a pull request |
| `requestChanges` | Request changes on a pull request |
| `removeChangeRequest` | Remove a change request |
| `declinePullRequest` | Decline a pull request |
| `mergePullRequest` | Merge a pull request (merge_commit, squash, fast_forward) |
| `getPullRequestCommits` | List commits on a pull request |
| `getPullRequestStatuses` | List commit statuses for a pull request |

### Pull Request Comment Operations

| Tool | Description |
|------|-------------|
| `getPullRequestComments` | List comments on a pull request |
| `getPullRequestComment` | Get a specific comment |
| `addPullRequestComment` | Add a comment (general or inline on a file/line) |
| `updatePullRequestComment` | Update a comment |
| `deletePullRequestComment` | Delete a comment |
| `resolveComment` | Resolve a comment thread |
| `reopenComment` | Reopen a resolved comment thread |

### Pull Request Diff Operations

| Tool | Description |
|------|-------------|
| `getPullRequestDiff` | Get the raw diff for a pull request |
| `getPullRequestDiffStat` | Get diff statistics (files changed, lines added/removed) |
| `getPullRequestPatch` | Get the patch for a pull request |

### Pull Request Task Operations

Tasks on Cloud use the standard tasks API. On Data Center, tasks are implemented via blocker-comments (`/blocker-comments`), which is the canonical replacement since Bitbucket 7.2+.

| Tool | Description |
|------|-------------|
| `getPullRequestTasks` | List tasks on a pull request |
| `createPullRequestTask` | Create a task on a pull request |
| `getPullRequestTask` | Get a specific task |
| `updatePullRequestTask` | Update a task (content, state). On DC, version is fetched automatically for optimistic concurrency |
| `deletePullRequestTask` | Delete a task. On DC, version is fetched automatically for optimistic concurrency |

### Branch & Tag Operations

| Tool | Description |
|------|-------------|
| `listBranches` | List branches in a repository (with optional name filter) |
| `listTags` | List tags in a repository (with optional name filter) |

## Development

```bash
pnpm install
pnpm run build
pnpm run lint
pnpm run test
pnpm run dev   # Run with tsx in dev mode
```

## License

MIT
