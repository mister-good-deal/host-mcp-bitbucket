// Bitbucket REST API response types

export interface BitbucketWorkspace {
    uuid: string;
    name: string;
    slug: string;
    is_private: boolean;
    type: "workspace";
    created_on?: string;
    updated_on?: string;
    links: Record<string, BitbucketLink | BitbucketLink[]>;
    [key: string]: unknown;
}

export interface BitbucketRepository {
    uuid: string;
    name: string;
    full_name: string;
    slug: string;
    description?: string;
    is_private: boolean;
    language?: string;
    created_on: string;
    updated_on: string;
    size?: number;
    has_issues?: boolean;
    has_wiki?: boolean;
    mainbranch?: BitbucketBranch;
    owner?: BitbucketAccount;
    project?: BitbucketProject;
    links: Record<string, BitbucketLink | BitbucketLink[]>;
    [key: string]: unknown;
}

export interface BitbucketProject {
    uuid: string;
    key: string;
    name: string;
    description?: string;
    is_private: boolean;
    type: "project";
    links: Record<string, BitbucketLink | BitbucketLink[]>;
}

export interface BitbucketAccount {
    uuid?: string;
    display_name: string;
    nickname?: string;
    account_id?: string;
    type: "user" | "team";
    links?: Record<string, BitbucketLink | BitbucketLink[]>;
}

export interface BitbucketBranch {
    name: string;
    type: "branch" | "named_branch";
}

export interface BitbucketLink {
    href: string;
    name?: string;
}

export interface BitbucketBranchReference {
    branch: BitbucketBranch;
    commit: { hash: string; links?: Record<string, BitbucketLink | BitbucketLink[]> };
    repository: { full_name: string; name: string; uuid: string };
}

// ── Pull Requests ────────────────────────────────────────────────────────

export type PullRequestState = "OPEN" | "MERGED" | "DECLINED" | "SUPERSEDED";

export interface BitbucketPullRequest {
    id: number;
    title: string;
    description: string;
    state: PullRequestState;
    author: BitbucketAccount;
    source: BitbucketBranchReference;
    destination: BitbucketBranchReference;
    created_on: string;
    updated_on: string;
    closed_on?: string;
    comment_count: number;
    task_count: number;
    close_source_branch: boolean;
    reviewers: BitbucketAccount[];
    participants: BitbucketParticipant[];
    merge_commit?: { hash: string };
    reason?: string;
    links: Record<string, BitbucketLink | BitbucketLink[]>;
    [key: string]: unknown;
}

export interface BitbucketParticipant {
    user: BitbucketAccount;
    role: "PARTICIPANT" | "REVIEWER" | "AUTHOR";
    approved: boolean;
    state?: "approved" | "changes_requested" | null;
}

// ── PR Comments ──────────────────────────────────────────────────────────

export interface BitbucketComment {
    id: number;
    content: { raw: string; markup: string; html: string };
    created_on: string;
    updated_on: string;
    user: BitbucketAccount;
    inline?: BitbucketInlineComment;
    parent?: { id: number };
    deleted: boolean;
    pending: boolean;
    type: "pullrequest_comment";
    links: Record<string, BitbucketLink | BitbucketLink[]>;
    [key: string]: unknown;
}

export interface BitbucketInlineComment {
    path: string;
    from?: number | null;
    to?: number | null;
}

// ── PR Tasks ─────────────────────────────────────────────────────────────

export type TaskState = "OPEN" | "RESOLVED";

export interface BitbucketTask {
    id: number;
    state: TaskState;
    content: { raw: string; markup: string; html: string };
    created_on: string;
    updated_on: string;
    creator: BitbucketAccount;
    comment?: { id: number };
    links: Record<string, BitbucketLink | BitbucketLink[]>;
    [key: string]: unknown;
}

// ── PR Diff ──────────────────────────────────────────────────────────────

export interface BitbucketDiffStat {
    status: "added" | "removed" | "modified" | "renamed";
    old?: { path: string; type: string };
    new?: { path: string; type: string };
    lines_added: number;
    lines_removed: number;
    [key: string]: unknown;
}

export interface BitbucketCommit {
    hash: string;
    message: string;
    author: { raw: string; user?: BitbucketAccount };
    date: string;
    parents?: Array<{ hash: string }>;
    links: Record<string, BitbucketLink | BitbucketLink[]>;
    [key: string]: unknown;
}

export interface BitbucketStatus {
    uuid: string;
    key: string;
    state: "SUCCESSFUL" | "FAILED" | "INPROGRESS" | "STOPPED";
    name: string;
    description?: string;
    url: string;
    created_on: string;
    updated_on: string;
    links: Record<string, BitbucketLink | BitbucketLink[]>;
    [key: string]: unknown;
}

// ── Paginated response ──────────────────────────────────────────────────

export interface BitbucketPaginatedResponse<T> {
    pagelen: number;
    size?: number;
    page?: number;
    next?: string;
    previous?: string;
    values: T[];
}

// ── Branching model ──────────────────────────────────────────────────────

export interface BitbucketBranchingModel {
    type: "branching_model";
    branch_types: Array<{ kind: string; prefix: string }>;
    development?: { branch: BitbucketBranch; name: string; use_mainbranch: boolean };
    production?: { branch: BitbucketBranch; name: string; use_mainbranch: boolean };
    links: Record<string, BitbucketLink | BitbucketLink[]>;
}
