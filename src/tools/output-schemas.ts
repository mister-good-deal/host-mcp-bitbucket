/**
 * Output schema definitions for all MCP tools.
 *
 * Each schema describes the JSON structure returned by the tool inside
 * the MCP text content block: `{ status, message, result }`.
 *
 * These schemas are meant to be wired into `registerTool({ outputSchema })`.
 *
 * The `result` field is left as `z.any()` to accommodate both
 * Bitbucket Cloud and Data Center response shapes.
 */
import { z } from "zod";

// ── Base envelope ────────────────────────────────────────────────────────

export const ToolResponseSchema = z.object({
    status: z.enum(["COMPLETED", "FAILED"]).describe("Whether the tool call succeeded"),
    message: z.string().describe("Human-readable status message"),
    result: z.any().describe("Tool-specific result payload")
});

// ── Workspace tools ──────────────────────────────────────────────────────

export const getCurrentUserOutput = ToolResponseSchema.describe("Current Bitbucket user");

export const getWorkspaceOutput = ToolResponseSchema.describe("Bitbucket workspace/project details");

// ── Repository tools ─────────────────────────────────────────────────────

export const listRepositoriesOutput = ToolResponseSchema.describe("Repositories in the workspace");

export const getRepositoryOutput = ToolResponseSchema.describe("Repository details");

// ── Pull request tools ───────────────────────────────────────────────────

export const getPullRequestsOutput = ToolResponseSchema.describe("Pull requests for a repository");

export const createPullRequestOutput = ToolResponseSchema.describe("Created pull request");

export const getPullRequestOutput = ToolResponseSchema.describe("Pull request details");

export const updatePullRequestOutput = ToolResponseSchema.describe("Updated pull request");

export const getPullRequestActivityOutput = ToolResponseSchema.describe("Pull request activity log");

export const approvePullRequestOutput = ToolResponseSchema.describe("Pull request approval result");

export const unapprovePullRequestOutput = ToolResponseSchema.describe("Pull request unapproval result");

export const requestChangesOutput = ToolResponseSchema.describe("Change request result");

export const removeChangeRequestOutput = ToolResponseSchema.describe("Change request removal result");

export const declinePullRequestOutput = ToolResponseSchema.describe("Declined pull request");

export const mergePullRequestOutput = ToolResponseSchema.describe("Merged pull request");

export const getPullRequestCommitsOutput = ToolResponseSchema.describe("Pull request commits");

export const getPullRequestStatusesOutput = ToolResponseSchema.describe("Pull request commit statuses");

// ── Comment tools ────────────────────────────────────────────────────────

export const getPullRequestCommentsOutput = ToolResponseSchema.describe("Pull request comments");

export const getPullRequestCommentOutput = ToolResponseSchema.describe("Pull request comment details");

export const addPullRequestCommentOutput = ToolResponseSchema.describe("Created comment");

export const updatePullRequestCommentOutput = ToolResponseSchema.describe("Updated comment");

export const deletePullRequestCommentOutput = ToolResponseSchema.describe("Comment deletion result");

export const resolveCommentOutput = ToolResponseSchema.describe("Comment resolution result");

export const reopenCommentOutput = ToolResponseSchema.describe("Comment reopen result");

// ── Diff tools ───────────────────────────────────────────────────────────

export const getPullRequestDiffOutput = ToolResponseSchema.describe("Pull request raw diff");

export const getPullRequestDiffStatOutput = ToolResponseSchema.describe("Pull request diff statistics");

export const getPullRequestPatchOutput = ToolResponseSchema.describe("Pull request patch");

// ── Task tools ───────────────────────────────────────────────────────────

export const getPullRequestTasksOutput = ToolResponseSchema.describe("Pull request tasks");

export const createPullRequestTaskOutput = ToolResponseSchema.describe("Created task");

export const getPullRequestTaskOutput = ToolResponseSchema.describe("Task details");

export const updatePullRequestTaskOutput = ToolResponseSchema.describe("Updated task");

export const deletePullRequestTaskOutput = ToolResponseSchema.describe("Task deletion result");

// ── Ref tools (branches/tags) ────────────────────────────────────────────

export const listBranchesOutput = ToolResponseSchema.describe("Repository branches");

export const listTagsOutput = ToolResponseSchema.describe("Repository tags");

// ── Review tools (DC pending review) ─────────────────────────────────────

export const addPendingReviewCommentOutput = ToolResponseSchema.describe("Pending review comment added");

export const getPendingReviewOutput = ToolResponseSchema.describe("Pending review details");

export const submitPendingReviewOutput = ToolResponseSchema.describe("Pending review submitted");

export const discardPendingReviewOutput = ToolResponseSchema.describe("Pending review discarded");

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
    deletePullRequestTask: deletePullRequestTaskOutput,
    // Refs (branches/tags)
    listBranches: listBranchesOutput,
    listTags: listTagsOutput,
    // Reviews (DC pending review)
    addPendingReviewComment: addPendingReviewCommentOutput,
    getPendingReview: getPendingReviewOutput,
    submitPendingReview: submitPendingReviewOutput,
    discardPendingReview: discardPendingReviewOutput
};
