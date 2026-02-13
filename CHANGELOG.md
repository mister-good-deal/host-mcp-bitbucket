# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Bitbucket Data Center support**: full API compatibility with Bitbucket Server/Data Center
  - Platform auto-detection from URL (`detectPlatform()`)
  - `PathBuilder` class for platform-specific API paths (Cloud vs DC)
  - Dual pagination: Cloud (`page`/`pagelen`/`next`) and DC (`start`/`limit`/`isLastPage`/`nextPageStart`)
  - DC-aware request bodies for pull requests (`fromRef`/`toRef`), comments (`text` + `anchor`), and comment updates
  - Self-hosted URLs automatically get `/rest/api/latest` appended
- **Ref tools**: `listBranches` and `listTags` with platform-aware filtering (`q=` for Cloud, `filterText=` for DC)
- **Structured content**: `toMcpResult()` now returns `structuredContent` alongside text blocks, satisfying MCP SDK output schema validation

### Changed

- All tool registration functions now accept a `PathBuilder` parameter for platform-aware routing
- Output schemas simplified to use `z.any()` for the `result` field — supports both Cloud and DC response shapes
- `getCurrentUser` on DC uses `/application-properties` endpoint (no `/user` equivalent on DC)
- `getWorkspace` on DC maps to `/projects/{key}` instead of `/workspaces/{slug}`
- Repository filtering uses `name=` parameter on DC instead of Cloud's `q=name ~` syntax
- Error messages updated from "Workspace" to "Workspace/project" for DC clarity

## [0.2.0] - 2026-02-13

### Added

- **Workspace tools**: `getCurrentUser`, `getWorkspace`
- **Output schemas**: Zod-based response schemas for all 32 tools, wired into `registerTool({ outputSchema })`
- **Docker-based integration tests**: Mock Bitbucket API server (`tests/integration/mock-server/`) running in Docker, no real credentials required

### Changed

- Integration tests now use a Docker mock server instead of requiring real Bitbucket Cloud API credentials
- Integration workflow (`integration.yml`) uses `docker compose` to start/stop the mock server

## [0.1.0] - 2026-02-12

### Added

- **Repository tools**: `listRepositories`, `getRepository`
- **Pull request tools**: `getPullRequests`, `createPullRequest`, `getPullRequest`, `updatePullRequest`, `getPullRequestActivity`, `approvePullRequest`, `unapprovePullRequest`, `requestChanges`, `removeChangeRequest`, `declinePullRequest`, `mergePullRequest`, `getPullRequestCommits`, `getPullRequestStatuses`
- **Comment tools**: `getPullRequestComments`, `getPullRequestComment`, `addPullRequestComment`, `updatePullRequestComment`, `deletePullRequestComment`, `resolveComment`, `reopenComment`
- **Diff tools**: `getPullRequestDiff`, `getPullRequestDiffStat`, `getPullRequestPatch`
- **Task tools**: `getPullRequestTasks`, `createPullRequestTask`, `getPullRequestTask`, `updatePullRequestTask`, `deletePullRequestTask`
- **Dual transport**: stdio (default) and Streamable HTTP
- **Pagination**: automatic pagination with `all` mode (capped at 1000 items)
- **HTTP retry**: exponential backoff with jitter for transient errors (429/5xx)
- **Bitbucket Cloud + Server/DC support**: URL normalization for both variants
- **CI workflow**: lint + build + test on Node 20 and 22
- **Integration tests**: smoke tests against Bitbucket Cloud API
- **Release workflow**: automatic GitHub Release + npm publish via OIDC trusted publisher
