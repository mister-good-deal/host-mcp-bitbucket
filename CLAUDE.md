# CLAUDE.md

Project context and conventions for AI assistants working on this codebase.

## Project Overview

`@mister-good-deal/host-mcp-bitbucket` — A local MCP (Model Context Protocol) server for Bitbucket that provides AI assistants with access to Bitbucket repositories, pull requests, comments, diffs, and tasks via REST API.

**Stack:** TypeScript 5.7+, Node.js >=20, pnpm 10.29.2, ESM modules, MCP SDK v1.26.0

## Commands

```bash
pnpm install              # Install dependencies
pnpm run build            # Compile TypeScript (tsc)
pnpm run lint             # ESLint check
pnpm run lint:fix         # ESLint auto-fix
pnpm run test             # Unit tests (Jest)
pnpm run dev              # Run in dev mode (tsx)
```

## Architecture

```
src/
  index.ts          # Entry point — CLI parsing, transport setup (stdio/http)
  config.ts         # CLI arguments + env vars via commander
  server.ts         # McpServer creation, registers all tool groups
  logger.ts         # Winston logger (levels: debug|info|warn|error|silent)
  response.ts       # ToolResponse envelope helpers (toolSuccess/toolFailure/toolNotFound)
  version.ts        # Version read from package.json
  bitbucket/
    client.ts       # BitbucketClient — HTTP client with retry, auth, pagination, error handling
    types.ts        # Bitbucket API type definitions
    utils.ts        # URL normalization, query string building, workspace extraction
  tools/
    output-schemas.ts # Zod output schemas for all 39 tools (wired into registerTool)
    workspace.ts    # 2 tools: getCurrentUser, getWorkspace
    repositories.ts # 3 tools: listRepositories, getRepository, createRepository
    pull-requests.ts # 13 tools: getPullRequests, createPullRequest, getPullRequest, updatePullRequest, getPullRequestActivity, approvePullRequest, unapprovePullRequest, requestChanges, removeChangeRequest, declinePullRequest, mergePullRequest, getPullRequestCommits, getPullRequestStatuses
    comments.ts     # 7 tools: getPullRequestComments, getPullRequestComment, addPullRequestComment, updatePullRequestComment, deletePullRequestComment, resolveComment, reopenComment
    diffs.ts        # 3 tools: getPullRequestDiff, getPullRequestDiffStat, getPullRequestPatch
    tasks.ts        # 5 tools: getPullRequestTasks, createPullRequestTask, getPullRequestTask, updatePullRequestTask, deletePullRequestTask
    refs.ts         # 2 tools: listBranches, listTags
    reviews.ts      # 4 tools (Data Center only): addPendingReviewComment, getPendingReview, submitPendingReview, discardPendingReview
tests/
  unit/
    setup.ts        # Global test setup — silences logger
```

### Key Patterns

- **Tool registration:** Uses `server.registerTool()` with Zod input schemas and output schemas
- **Output schemas:** All tools have Zod output schemas defined in `output-schemas.ts` and wired into `registerTool({ outputSchema })`
- **Response envelope:** All tools return `{ status: "COMPLETED"|"FAILED", message, result }` via helpers in `response.ts`
- **Error handling:** Tools catch `BitbucketClientError` and return `toolNotFound()` for 404s, `toolError()` for others — never throw
- **HTTP retry:** `BitbucketClient` uses exponential backoff with jitter for 429/5xx errors
- **Pagination:** `BitbucketClient.getPaginated()` follows `next` links when `all: true` (capped at 1000 items)
- **Default workspace:** Auto-resolved from config or URL, used when tools omit the workspace parameter
- **URL normalization:** Converts `bitbucket.org/<workspace>` to `api.bitbucket.org/2.0` and handles self-hosted URLs
- **ESM imports:** Always use `.js` extension in relative imports (`./config.js`, not `./config`)

## Code Style

- **4-space indentation**, double quotes, semicolons always
- **No braces on single-statement bodies** (`curly: "multi"` rule): `if (x) return y;`
- **1TBS brace style** with single-line blocks allowed
- **Blank lines** before `return`, `try`, `throw`, `for`, `while`, `class` statements
- **Consistent type imports:** `import type { Foo }` for type-only imports
- **Unused vars:** Prefix with `_` (e.g., `_unused`)
- **No trailing spaces, no tabs**, max 1 consecutive blank line
- Run `pnpm run lint:fix` to auto-format

## Testing

- **Framework:** Jest 29 with ts-jest ESM preset
- **Test location:** `tests/unit/` mirrors `src/` structure
- **Logger is silenced** globally via `tests/unit/setup.ts`
- **Mock pattern:** Tests create a `jest.Mocked<BitbucketClient>` via `createMockClient()` from `helpers.ts`
- **ESM requirement:** Tests need `--experimental-vm-modules` (handled automatically by npm scripts)
- **Integration tests:** Docker-based mock Bitbucket API server (`tests/integration/`)
  - Mock server: `tests/integration/mock-server/server.mjs` (Node.js HTTP server stubbing Bitbucket Cloud 2.0 API)
  - Started via `docker compose -f docker-compose.integration.yml up -d --wait`
  - No real credentials needed — uses `test-token` and `test-workspace` by default
  - Run with `pnpm run test:integration` (after starting Docker)

## CI/CD

- **CI** (`ci.yml`): Lint + build + test on Node 20 and 22, triggers on push/PR to main
- **Integration** (`integration.yml`): Smoke tests against Docker mock Bitbucket API (no secrets needed)
- **Release** (`release.yml`): On push to main — runs CI, creates git tag + GitHub Release, publishes to npm via OIDC trusted publisher (no tokens)
- **Versioning:** Manual bump in `package.json`, automatic tag creation from version field

## Git Conventions

- **Commit messages:** Conventional Commits (`feat:`, `fix:`, `style:`, `test:`, `docs:`, `ci:`)
- **Author:** Romain Laneuville <romain.laneuville@hotmail.fr>
- **Branch strategy:** `main` for releases, `dev` for work-in-progress
