# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
