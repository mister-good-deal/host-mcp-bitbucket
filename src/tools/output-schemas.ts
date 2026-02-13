/**
 * Output schema definitions for all MCP tools.
 *
 * Each schema describes the JSON structure returned by the tool inside
 * the MCP text content block: `{ status, message, result }`.
 *
 * These schemas are meant to be wired into `registerTool({ outputSchema })`.
 */
import { z } from "zod";

// ── Base envelope ────────────────────────────────────────────────────────

export const ToolResponseSchema = z.object({
    status: z.enum(["COMPLETED", "FAILED"]).describe("Whether the tool call succeeded"),
    message: z.string().describe("Human-readable status message"),
    result: z.unknown().describe("Tool-specific result payload")
});

// ── Shared schemas ───────────────────────────────────────────────────────

const AccountSchema = z.object({
    uuid: z.string().optional(),
    display_name: z.string(),
    nickname: z.string().optional(),
    account_id: z.string().optional(),
    type: z.enum(["user", "team"])
});

const RepositorySchema = z.object({
    uuid: z.string(),
    name: z.string(),
    full_name: z.string(),
    slug: z.string(),
    description: z.string().optional(),
    is_private: z.boolean(),
    language: z.string().optional(),
    created_on: z.string(),
    updated_on: z.string()
});

const PullRequestSchema = z.object({
    id: z.number(),
    title: z.string(),
    description: z.string(),
    state: z.enum(["OPEN", "MERGED", "DECLINED", "SUPERSEDED"]),
    author: AccountSchema,
    created_on: z.string(),
    updated_on: z.string(),
    comment_count: z.number(),
    task_count: z.number()
});

const CommentSchema = z.object({
    id: z.number(),
    content: z.object({ raw: z.string() }),
    created_on: z.string(),
    updated_on: z.string(),
    user: AccountSchema,
    deleted: z.boolean()
});

const TaskSchema = z.object({
    id: z.number(),
    state: z.enum(["OPEN", "RESOLVED"]),
    content: z.object({ raw: z.string() }),
    created_on: z.string(),
    updated_on: z.string()
});

const DiffStatSchema = z.object({
    status: z.enum(["added", "removed", "modified", "renamed"]),
    lines_added: z.number(),
    lines_removed: z.number()
});

// ── Workspace tools ──────────────────────────────────────────────────────

export const getCurrentUserOutput = ToolResponseSchema.extend({
    result: AccountSchema.describe("Authenticated Bitbucket user info")
}).describe("Current Bitbucket user");

export const getWorkspaceOutput = ToolResponseSchema.extend({
    result: z.object({
        uuid: z.string(),
        name: z.string(),
        slug: z.string(),
        is_private: z.boolean(),
        type: z.literal("workspace")
    }).describe("Bitbucket workspace details")
}).describe("Bitbucket workspace details");

// ── Repository tools ─────────────────────────────────────────────────────

export const listRepositoriesOutput = ToolResponseSchema.extend({
    result: z.array(RepositorySchema).describe("List of repositories in the workspace")
}).describe("Repositories in the workspace");

export const getRepositoryOutput = ToolResponseSchema.extend({
    result: RepositorySchema.describe("Repository details")
}).describe("Repository details");

// ── Pull request tools ───────────────────────────────────────────────────

export const getPullRequestsOutput = ToolResponseSchema.extend({
    result: z.array(PullRequestSchema).describe("List of pull requests")
}).describe("Pull requests for a repository");

export const createPullRequestOutput = ToolResponseSchema.extend({
    result: PullRequestSchema.describe("Created pull request")
}).describe("Created pull request");

export const getPullRequestOutput = ToolResponseSchema.extend({
    result: PullRequestSchema.describe("Pull request details")
}).describe("Pull request details");

export const updatePullRequestOutput = ToolResponseSchema.extend({
    result: PullRequestSchema.describe("Updated pull request")
}).describe("Updated pull request");

export const getPullRequestActivityOutput = ToolResponseSchema.describe("Pull request activity log");

export const approvePullRequestOutput = ToolResponseSchema.describe("Pull request approval result");

export const unapprovePullRequestOutput = ToolResponseSchema.describe("Pull request unapproval result");

export const requestChangesOutput = ToolResponseSchema.describe("Change request result");

export const removeChangeRequestOutput = ToolResponseSchema.describe("Change request removal result");

export const declinePullRequestOutput = ToolResponseSchema.extend({
    result: PullRequestSchema.describe("Declined pull request")
}).describe("Declined pull request");

export const mergePullRequestOutput = ToolResponseSchema.extend({
    result: PullRequestSchema.describe("Merged pull request")
}).describe("Merged pull request");

export const getPullRequestCommitsOutput = ToolResponseSchema.describe("Pull request commits");

export const getPullRequestStatusesOutput = ToolResponseSchema.describe("Pull request commit statuses");

// ── Comment tools ────────────────────────────────────────────────────────

export const getPullRequestCommentsOutput = ToolResponseSchema.extend({
    result: z.array(CommentSchema).describe("List of comments on the pull request")
}).describe("Pull request comments");

export const getPullRequestCommentOutput = ToolResponseSchema.extend({
    result: CommentSchema.describe("Comment details")
}).describe("Pull request comment details");

export const addPullRequestCommentOutput = ToolResponseSchema.extend({
    result: CommentSchema.describe("Created comment")
}).describe("Created comment");

export const updatePullRequestCommentOutput = ToolResponseSchema.extend({
    result: CommentSchema.describe("Updated comment")
}).describe("Updated comment");

export const deletePullRequestCommentOutput = ToolResponseSchema.describe("Comment deletion result");

export const resolveCommentOutput = ToolResponseSchema.describe("Comment resolution result");

export const reopenCommentOutput = ToolResponseSchema.describe("Comment reopen result");

// ── Diff tools ───────────────────────────────────────────────────────────

export const getPullRequestDiffOutput = ToolResponseSchema.extend({
    result: z.string().describe("Raw diff output")
}).describe("Pull request raw diff");

export const getPullRequestDiffStatOutput = ToolResponseSchema.extend({
    result: z.array(DiffStatSchema).describe("Diff statistics per file")
}).describe("Pull request diff statistics");

export const getPullRequestPatchOutput = ToolResponseSchema.extend({
    result: z.string().describe("Patch output")
}).describe("Pull request patch");

// ── Task tools ───────────────────────────────────────────────────────────

export const getPullRequestTasksOutput = ToolResponseSchema.extend({
    result: z.array(TaskSchema).describe("List of tasks on the pull request")
}).describe("Pull request tasks");

export const createPullRequestTaskOutput = ToolResponseSchema.extend({
    result: TaskSchema.describe("Created task")
}).describe("Created task");

export const getPullRequestTaskOutput = ToolResponseSchema.extend({
    result: TaskSchema.describe("Task details")
}).describe("Task details");

export const updatePullRequestTaskOutput = ToolResponseSchema.extend({
    result: TaskSchema.describe("Updated task")
}).describe("Updated task");

export const deletePullRequestTaskOutput = ToolResponseSchema.describe("Task deletion result");

/**
 * Map of tool name → output schema, for easy wiring into registerTool.
 */
export const OUTPUT_SCHEMAS: Record<string, z.ZodType> = {
    // Workspace
    getCurrentUser: getCurrentUserOutput,
    getWorkspace: getWorkspaceOutput,
    // Repositories
    listRepositories: listRepositoriesOutput,
    getRepository: getRepositoryOutput,
    // Pull requests
    getPullRequests: getPullRequestsOutput,
    createPullRequest: createPullRequestOutput,
    getPullRequest: getPullRequestOutput,
    updatePullRequest: updatePullRequestOutput,
    getPullRequestActivity: getPullRequestActivityOutput,
    approvePullRequest: approvePullRequestOutput,
    unapprovePullRequest: unapprovePullRequestOutput,
    requestChanges: requestChangesOutput,
    removeChangeRequest: removeChangeRequestOutput,
    declinePullRequest: declinePullRequestOutput,
    mergePullRequest: mergePullRequestOutput,
    getPullRequestCommits: getPullRequestCommitsOutput,
    getPullRequestStatuses: getPullRequestStatusesOutput,
    // Comments
    getPullRequestComments: getPullRequestCommentsOutput,
    getPullRequestComment: getPullRequestCommentOutput,
    addPullRequestComment: addPullRequestCommentOutput,
    updatePullRequestComment: updatePullRequestCommentOutput,
    deletePullRequestComment: deletePullRequestCommentOutput,
    resolveComment: resolveCommentOutput,
    reopenComment: reopenCommentOutput,
    // Diffs
    getPullRequestDiff: getPullRequestDiffOutput,
    getPullRequestDiffStat: getPullRequestDiffStatOutput,
    getPullRequestPatch: getPullRequestPatchOutput,
    // Tasks
    getPullRequestTasks: getPullRequestTasksOutput,
    createPullRequestTask: createPullRequestTaskOutput,
    getPullRequestTask: getPullRequestTaskOutput,
    updatePullRequestTask: updatePullRequestTaskOutput,
    deletePullRequestTask: deletePullRequestTaskOutput
};
