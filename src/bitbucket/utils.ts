/** Bitbucket platform variant. */
export type BitbucketPlatform = "cloud" | "datacenter";

/**
 * Detects whether a URL points to Bitbucket Cloud or a self-hosted Data Center instance.
 */
export function detectPlatform(url: string): BitbucketPlatform {
    const normalized = url.replace(/\/+$/, "");

    if ((/^https?:\/\/(www\.)?bitbucket\.org/i).test(normalized)) return "cloud";

    if ((/^https?:\/\/api\.bitbucket\.org/i).test(normalized)) return "cloud";

    // URLs containing the Cloud REST API /2.0 path (e.g. proxies or mock servers)
    if ((/\/2\.0(\/|$)/).test(normalized)) return "cloud";

    return "datacenter";
}

/**
 * Normalizes a Bitbucket base URL:
 * - `https://bitbucket.org/workspace` → `https://api.bitbucket.org/2.0`
 * - `https://api.bitbucket.org` → `https://api.bitbucket.org/2.0`
 * - Self-hosted URLs get `/rest/api/latest` appended if no REST path is present
 */
export function normalizeBaseUrl(url: string): string {
    const normalized = url.replace(/\/+$/, "");

    // Convert bitbucket.org web URLs to API URLs
    if ((/^https?:\/\/(www\.)?bitbucket\.org/i).test(normalized)) return "https://api.bitbucket.org/2.0";

    // Ensure api.bitbucket.org has /2.0 suffix
    if ((/^https?:\/\/api\.bitbucket\.org(\/|$)/i).test(normalized)) {
        return normalized.endsWith("/2.0") ? normalized : "https://api.bitbucket.org/2.0";
    }

    // URLs with Cloud API /2.0 path (e.g. proxy or mock server) — keep as-is
    if ((/\/2\.0(\/|$)/).test(normalized)) return normalized;

    // Self-hosted: add /rest/api/latest if no REST path is already present
    if (!(/\/rest\/api\//i).test(normalized)) return `${normalized}/rest/api/latest`;

    return normalized;
}

/**
 * Extracts the default workspace from a bitbucket.org URL.
 * e.g. `https://bitbucket.org/myworkspace` → `myworkspace`
 */
export function extractWorkspaceFromUrl(url: string): string | undefined {
    const match = url.match(/^https?:\/\/(www\.)?bitbucket\.org\/([^\/]+)/i);

    return match?.[2];
}

/**
 * Builds a query string from a record of key-value pairs.
 * Skips undefined and null values.
 */
export function buildQueryString(params: Record<string, string | number | boolean | undefined | null>): string {
    const parts: string[] = [];

    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);

    return parts.length > 0 ? `?${parts.join("&")}` : "";
}

// ── Path builder ─────────────────────────────────────────────────────────

/**
 * Builds platform-specific API paths for Bitbucket Cloud and Data Center.
 *
 * Cloud uses `/repositories/{workspace}/{repo}/pullrequests/...`
 * DC uses `/projects/{projectKey}/repos/{repoSlug}/pull-requests/...`
 */
export class PathBuilder {
    constructor(private readonly platform: BitbucketPlatform) {}

    get isCloud(): boolean {
        return this.platform === "cloud";
    }

    get isDataCenter(): boolean {
        return this.platform === "datacenter";
    }

    /**
     * Path to get the authenticated user.
     *
     * Cloud: GET /2.0/user
     * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-users/#api-user-get
     *
     * DC:   Returns /users — the tool handler falls back to GET /rest/api/latest/application-properties for auth verification.
     * @see https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-system-maintenance/#api-api-latest-application-properties-get
     */
    currentUser(): string {
        return this.isCloud ? "/user" : "/users";
    }

    /**
     * Path for a workspace (Cloud) or project (DC).
     *
     * Cloud: GET /2.0/workspaces/{workspace}
     * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-workspaces/#api-workspaces-workspace-get
     *
     * DC:   GET /rest/api/latest/projects/{projectKey}
     * @see https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-project/#api-api-latest-projects-projectkey-get
     */
    workspace(ws: string): string {
        return this.isCloud ? `/workspaces/${ws}` : `/projects/${ws}`;
    }

    /**
     * Path to list repositories.
     *
     * Cloud: GET /2.0/repositories/{workspace}
     * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-repositories/#api-repositories-workspace-get
     *
     * DC:   GET /rest/api/latest/projects/{projectKey}/repos
     * @see https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-repository/#api-api-latest-projects-projectkey-repos-get
     */
    repositories(ws: string): string {
        return this.isCloud ? `/repositories/${ws}` : `/projects/${ws}/repos`;
    }

    /**
     * Path for a specific repository.
     *
     * Cloud: GET /2.0/repositories/{workspace}/{repo_slug}
     * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-repositories/#api-repositories-workspace-repo-slug-get
     *
     * DC:   GET /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}
     * @see https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-repository/#api-api-latest-projects-projectkey-repos-repositoryslug-get
     */
    repository(ws: string, repoSlug: string): string {
        return this.isCloud ? `/repositories/${ws}/${repoSlug}` : `/projects/${ws}/repos/${repoSlug}`;
    }

    /** Base path for a repository's resources (used as prefix). */
    private repoBase(ws: string, repoSlug: string): string {
        return this.repository(ws, repoSlug);
    }

    /**
     * Path to list pull requests.
     *
     * Cloud: GET /2.0/repositories/{workspace}/{repo_slug}/pullrequests
     * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/#api-repositories-workspace-repo-slug-pullrequests-get
     *
     * DC:   GET /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests
     * @see https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-pull-requests/#api-api-latest-projects-projectkey-repos-repositoryslug-pull-requests-get
     */
    pullRequests(ws: string, repoSlug: string): string {
        return this.isCloud
            ? `${this.repoBase(ws, repoSlug)}/pullrequests`
            : `${this.repoBase(ws, repoSlug)}/pull-requests`;
    }

    /**
     * Path for a specific pull request.
     *
     * Cloud: GET /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}
     * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/#api-repositories-workspace-repo-slug-pullrequests-pull-request-id-get
     *
     * DC:   GET /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests/{pullRequestId}
     * @see https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-pull-requests/#api-api-latest-projects-projectkey-repos-repositoryslug-pull-requests-pullrequestid-get
     */
    pullRequest(ws: string, repoSlug: string, prId: number): string {
        return `${this.pullRequests(ws, repoSlug)}/${prId}`;
    }

    /**
     * Path for PR activity.
     *
     * Cloud: GET /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/activity
     * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/#api-repositories-workspace-repo-slug-pullrequests-pull-request-id-activity-get
     *
     * DC:   GET /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests/{pullRequestId}/activities
     * @see https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-pull-requests/#api-api-latest-projects-projectkey-repos-repositoryslug-pull-requests-pullrequestid-activities-get
     */
    pullRequestActivity(ws: string, repoSlug: string, prId: number): string {
        return this.isCloud
            ? `${this.pullRequest(ws, repoSlug, prId)}/activity`
            : `${this.pullRequest(ws, repoSlug, prId)}/activities`;
    }

    /**
     * Path for PR approve.
     *
     * Cloud: POST /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/approve
     * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/#api-repositories-workspace-repo-slug-pullrequests-pull-request-id-approve-post
     *
     * DC:   POST /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests/{pullRequestId}/approve
     * @see https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-pull-requests/#api-api-latest-projects-projectkey-repos-repositoryslug-pull-requests-pullrequestid-approve-post
     */
    pullRequestApprove(ws: string, repoSlug: string, prId: number): string {
        return `${this.pullRequest(ws, repoSlug, prId)}/approve`;
    }

    /**
     * Path for PR request-changes (Cloud only — DC uses approve with status).
     *
     * Cloud: POST /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/request-changes
     * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/#api-repositories-workspace-repo-slug-pullrequests-pull-request-id-request-changes-post
     */
    pullRequestRequestChanges(ws: string, repoSlug: string, prId: number): string {
        return `${this.pullRequest(ws, repoSlug, prId)}/request-changes`;
    }

    /**
     * Path for PR decline.
     *
     * Cloud: POST /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/decline
     * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/#api-repositories-workspace-repo-slug-pullrequests-pull-request-id-decline-post
     *
     * DC:   POST /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests/{pullRequestId}/decline
     * @see https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-pull-requests/#api-api-latest-projects-projectkey-repos-repositoryslug-pull-requests-pullrequestid-decline-post
     */
    pullRequestDecline(ws: string, repoSlug: string, prId: number): string {
        return `${this.pullRequest(ws, repoSlug, prId)}/decline`;
    }

    /**
     * Path for PR merge.
     *
     * Cloud: POST /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/merge
     * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/#api-repositories-workspace-repo-slug-pullrequests-pull-request-id-merge-post
     *
     * DC:   POST /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests/{pullRequestId}/merge
     * @see https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-pull-requests/#api-api-latest-projects-projectkey-repos-repositoryslug-pull-requests-pullrequestid-merge-post
     */
    pullRequestMerge(ws: string, repoSlug: string, prId: number): string {
        return `${this.pullRequest(ws, repoSlug, prId)}/merge`;
    }

    /**
     * Path for PR commits.
     *
     * Cloud: GET /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/commits
     * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/#api-repositories-workspace-repo-slug-pullrequests-pull-request-id-commits-get
     *
     * DC:   GET /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests/{pullRequestId}/commits
     * @see https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-pull-requests/#api-api-latest-projects-projectkey-repos-repositoryslug-pull-requests-pullrequestid-commits-get
     */
    pullRequestCommits(ws: string, repoSlug: string, prId: number): string {
        return `${this.pullRequest(ws, repoSlug, prId)}/commits`;
    }

    /**
     * Path for PR statuses (Cloud) or changes (DC — no direct equivalent).
     *
     * Cloud: GET /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/statuses
     * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/#api-repositories-workspace-repo-slug-pullrequests-pull-request-id-statuses-get
     *
     * DC:   No direct equivalent; uses commit build statuses.
     */
    pullRequestStatuses(ws: string, repoSlug: string, prId: number): string {
        return `${this.pullRequest(ws, repoSlug, prId)}/statuses`;
    }

    /**
     * Path for PR comments.
     *
     * Cloud: GET /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments
     * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/#api-repositories-workspace-repo-slug-pullrequests-pull-request-id-comments-get
     *
     * DC:   GET /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests/{pullRequestId}/comments
     * @see https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-pull-requests/#api-api-latest-projects-projectkey-repos-repositoryslug-pull-requests-pullrequestid-comments-get
     */
    pullRequestComments(ws: string, repoSlug: string, prId: number): string {
        return `${this.pullRequest(ws, repoSlug, prId)}/comments`;
    }

    /**
     * Path for a specific PR comment.
     *
     * Cloud: GET /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments/{comment_id}
     * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/#api-repositories-workspace-repo-slug-pullrequests-pull-request-id-comments-comment-id-get
     *
     * DC:   GET /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests/{pullRequestId}/comments/{commentId}
     * @see https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-pull-requests/#api-api-latest-projects-projectkey-repos-repositoryslug-pull-requests-pullrequestid-comments-commentid-get
     */
    pullRequestComment(ws: string, repoSlug: string, prId: number, commentId: number): string {
        return `${this.pullRequestComments(ws, repoSlug, prId)}/${commentId}`;
    }

    /**
     * Path for resolving a comment.
     *
     * Cloud: PUT /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/comments/{comment_id}/resolve
     * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/#api-repositories-workspace-repo-slug-pullrequests-pull-request-id-comments-comment-id-resolve-put
     *
     * DC:   PUT /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests/{pullRequestId}/comments/{commentId}/resolve
     */
    pullRequestCommentResolve(ws: string, repoSlug: string, prId: number, commentId: number): string {
        return `${this.pullRequestComment(ws, repoSlug, prId, commentId)}/resolve`;
    }

    /**
     * Path for PR diff (raw text). On DC uses `.diff` extension for raw output.
     *
     * Cloud: GET /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/diff
     * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/#api-repositories-workspace-repo-slug-pullrequests-pull-request-id-diff-get
     *
     * DC:   GET /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests/{pullRequestId}.diff
     * @see https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-pull-requests/#api-api-latest-projects-projectkey-repos-repositoryslug-pull-requests-pullrequestid-diff-get
     */
    pullRequestDiff(ws: string, repoSlug: string, prId: number): string {
        return this.isCloud
            ? `${this.pullRequest(ws, repoSlug, prId)}/diff`
            : `${this.pullRequests(ws, repoSlug)}/${prId}.diff`;
    }

    /**
     * Path for PR diffstat (Cloud) or changes (DC).
     *
     * Cloud: GET /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/diffstat
     * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/#api-repositories-workspace-repo-slug-pullrequests-pull-request-id-diffstat-get
     *
     * DC:   GET /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests/{pullRequestId}/changes
     * @see https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-pull-requests/#api-api-latest-projects-projectkey-repos-repositoryslug-pull-requests-pullrequestid-changes-get
     */
    pullRequestDiffStat(ws: string, repoSlug: string, prId: number): string {
        return this.isCloud
            ? `${this.pullRequest(ws, repoSlug, prId)}/diffstat`
            : `${this.pullRequest(ws, repoSlug, prId)}/changes`;
    }

    /**
     * Path for PR patch.
     *
     * Cloud: GET /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/patch
     * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/#api-repositories-workspace-repo-slug-pullrequests-pull-request-id-patch-get
     *
     * DC:   Not available.
     */
    pullRequestPatch(ws: string, repoSlug: string, prId: number): string {
        return `${this.pullRequest(ws, repoSlug, prId)}/patch`;
    }

    /**
     * Path for PR tasks (Cloud) or blocker-comments (DC).
     *
     * Cloud: GET /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/tasks
     * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/#api-repositories-workspace-repo-slug-pullrequests-pull-request-id-tasks-get
     *
     * DC:   GET /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests/{pullRequestId}/blocker-comments
     * @see https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-pull-requests/#api-api-latest-projects-projectkey-repos-repositoryslug-pull-requests-pullrequestid-blocker-comments-get
     */
    pullRequestTasks(ws: string, repoSlug: string, prId: number): string {
        return this.isCloud
            ? `${this.pullRequest(ws, repoSlug, prId)}/tasks`
            : `${this.pullRequest(ws, repoSlug, prId)}/blocker-comments`;
    }

    /**
     * Path for a specific PR task (Cloud) or blocker-comment (DC).
     *
     * Cloud: GET /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/tasks/{task_id}
     * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/#api-repositories-workspace-repo-slug-pullrequests-pull-request-id-tasks-task-id-get
     *
     * DC:   GET /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests/{pullRequestId}/blocker-comments/{blockerId}
     * @see https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-pull-requests/#api-api-latest-projects-projectkey-repos-repositoryslug-pull-requests-pullrequestid-blocker-comments-blockerid-get
     */
    pullRequestTask(ws: string, repoSlug: string, prId: number, taskId: number): string {
        return `${this.pullRequestTasks(ws, repoSlug, prId)}/${taskId}`;
    }

    /**
     * Path for the pending review on a pull request (DC only).
     *
     * DC:   GET|PUT|DELETE /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests/{pullRequestId}/review
     * @see https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-pull-requests/#api-api-latest-projects-projectkey-repos-repositoryslug-pull-requests-pullrequestid-review-get
     */
    pullRequestReview(ws: string, repoSlug: string, prId: number): string {
        return `${this.pullRequest(ws, repoSlug, prId)}/review`;
    }

    /**
     * Path for listing branches.
     *
     * Cloud: GET /2.0/repositories/{workspace}/{repo_slug}/refs/branches
     * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-refs/#api-repositories-workspace-repo-slug-refs-branches-get
     *
     * DC:   GET /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/branches
     * @see https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-repository/#api-api-latest-projects-projectkey-repos-repositoryslug-branches-get
     */
    branches(ws: string, repoSlug: string): string {
        return this.isCloud
            ? `${this.repoBase(ws, repoSlug)}/refs/branches`
            : `${this.repoBase(ws, repoSlug)}/branches`;
    }

    /**
     * Path for listing tags.
     *
     * Cloud: GET /2.0/repositories/{workspace}/{repo_slug}/refs/tags
     * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-refs/#api-repositories-workspace-repo-slug-refs-tags-get
     *
     * DC:   GET /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/tags
     * @see https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-repository/#api-api-latest-projects-projectkey-repos-repositoryslug-tags-get
     */
    tags(ws: string, repoSlug: string): string {
        return this.isCloud
            ? `${this.repoBase(ws, repoSlug)}/refs/tags`
            : `${this.repoBase(ws, repoSlug)}/tags`;
    }
}
