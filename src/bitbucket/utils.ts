/** Bitbucket platform variant. */
export type BitbucketPlatform = "cloud" | "datacenter";

/**
 * Detects whether a URL points to Bitbucket Cloud or a self-hosted Data Center instance.
 */
export function detectPlatform(url: string): BitbucketPlatform {
    const normalized = url.replace(/\/+$/, "");

    if ((/^https?:\/\/(www\.)?bitbucket\.org/i).test(normalized)) return "cloud";

    if ((/^https?:\/\/api\.bitbucket\.org/i).test(normalized)) return "cloud";

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

    /** Path to get the authenticated user. */
    currentUser(): string {
        return this.isCloud ? "/user" : "/users";
    }

    /** Path for a workspace (Cloud) or project (DC). */
    workspace(ws: string): string {
        return this.isCloud ? `/workspaces/${ws}` : `/projects/${ws}`;
    }

    /** Path to list repositories. */
    repositories(ws: string): string {
        return this.isCloud ? `/repositories/${ws}` : `/projects/${ws}/repos`;
    }

    /** Path for a specific repository. */
    repository(ws: string, repoSlug: string): string {
        return this.isCloud ? `/repositories/${ws}/${repoSlug}` : `/projects/${ws}/repos/${repoSlug}`;
    }

    /** Base path for a repository's resources (used as prefix). */
    private repoBase(ws: string, repoSlug: string): string {
        return this.repository(ws, repoSlug);
    }

    /** Path to list pull requests. */
    pullRequests(ws: string, repoSlug: string): string {
        return this.isCloud
            ? `${this.repoBase(ws, repoSlug)}/pullrequests`
            : `${this.repoBase(ws, repoSlug)}/pull-requests`;
    }

    /** Path for a specific pull request. */
    pullRequest(ws: string, repoSlug: string, prId: number): string {
        return `${this.pullRequests(ws, repoSlug)}/${prId}`;
    }

    /** Path for PR activity. */
    pullRequestActivity(ws: string, repoSlug: string, prId: number): string {
        return this.isCloud
            ? `${this.pullRequest(ws, repoSlug, prId)}/activity`
            : `${this.pullRequest(ws, repoSlug, prId)}/activities`;
    }

    /** Path for PR approve. */
    pullRequestApprove(ws: string, repoSlug: string, prId: number): string {
        return `${this.pullRequest(ws, repoSlug, prId)}/approve`;
    }

    /** Path for PR request-changes (Cloud only — DC uses approve with status). */
    pullRequestRequestChanges(ws: string, repoSlug: string, prId: number): string {
        return `${this.pullRequest(ws, repoSlug, prId)}/request-changes`;
    }

    /** Path for PR decline. */
    pullRequestDecline(ws: string, repoSlug: string, prId: number): string {
        return `${this.pullRequest(ws, repoSlug, prId)}/decline`;
    }

    /** Path for PR merge. */
    pullRequestMerge(ws: string, repoSlug: string, prId: number): string {
        return `${this.pullRequest(ws, repoSlug, prId)}/merge`;
    }

    /** Path for PR commits. */
    pullRequestCommits(ws: string, repoSlug: string, prId: number): string {
        return `${this.pullRequest(ws, repoSlug, prId)}/commits`;
    }

    /** Path for PR statuses (Cloud) or changes (DC — no direct equivalent). */
    pullRequestStatuses(ws: string, repoSlug: string, prId: number): string {
        return `${this.pullRequest(ws, repoSlug, prId)}/statuses`;
    }

    /** Path for PR comments. */
    pullRequestComments(ws: string, repoSlug: string, prId: number): string {
        return `${this.pullRequest(ws, repoSlug, prId)}/comments`;
    }

    /** Path for a specific PR comment. */
    pullRequestComment(ws: string, repoSlug: string, prId: number, commentId: number): string {
        return `${this.pullRequestComments(ws, repoSlug, prId)}/${commentId}`;
    }

    /** Path for resolving a comment. */
    pullRequestCommentResolve(ws: string, repoSlug: string, prId: number, commentId: number): string {
        return `${this.pullRequestComment(ws, repoSlug, prId, commentId)}/resolve`;
    }

    /** Path for PR diff. */
    pullRequestDiff(ws: string, repoSlug: string, prId: number): string {
        return `${this.pullRequest(ws, repoSlug, prId)}/diff`;
    }

    /** Path for PR diffstat (Cloud) or changes (DC). */
    pullRequestDiffStat(ws: string, repoSlug: string, prId: number): string {
        return this.isCloud
            ? `${this.pullRequest(ws, repoSlug, prId)}/diffstat`
            : `${this.pullRequest(ws, repoSlug, prId)}/changes`;
    }

    /** Path for PR patch. */
    pullRequestPatch(ws: string, repoSlug: string, prId: number): string {
        return `${this.pullRequest(ws, repoSlug, prId)}/patch`;
    }

    /** Path for PR tasks. */
    pullRequestTasks(ws: string, repoSlug: string, prId: number): string {
        return `${this.pullRequest(ws, repoSlug, prId)}/tasks`;
    }

    /** Path for a specific PR task. */
    pullRequestTask(ws: string, repoSlug: string, prId: number, taskId: number): string {
        return `${this.pullRequestTasks(ws, repoSlug, prId)}/${taskId}`;
    }

    /** Path for listing branches. */
    branches(ws: string, repoSlug: string): string {
        return this.isCloud
            ? `${this.repoBase(ws, repoSlug)}/refs/branches`
            : `${this.repoBase(ws, repoSlug)}/branches`;
    }

    /** Path for listing tags. */
    tags(ws: string, repoSlug: string): string {
        return this.isCloud
            ? `${this.repoBase(ws, repoSlug)}/refs/tags`
            : `${this.repoBase(ws, repoSlug)}/tags`;
    }
}
