import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { BitbucketClient } from "../bitbucket/client.js";
import { BitbucketClientError } from "../bitbucket/client.js";
import type { BitbucketComment, BitbucketDCPendingReview, BitbucketDCReviewSubmitRequest } from "../bitbucket/types.js";
import type { PathBuilder } from "../bitbucket/utils.js";
import { getLogger } from "../logger.js";
import { toMcpResult, toolError, toolFailure, toolNotFound, toolSuccess } from "../response.js";
import {
    addPendingReviewCommentOutput, getPendingReviewOutput,
    submitPendingReviewOutput, discardPendingReviewOutput
} from "./output-schemas.js";

const ParticipantStatusEnum = z.enum(["APPROVED", "NEEDS_WORK", "UNAPPROVED"]);

export function registerReviewTools(server: McpServer, client: BitbucketClient, paths: PathBuilder, defaultWorkspace?: string): void {
    const logger = getLogger();

    function resolveWorkspace(workspace?: string) {
        return workspace ?? defaultWorkspace;
    }

    /*
     * ── addPendingReviewComment ──────────────────────────────────────────
     * DC:   POST /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests/{pullRequestId}/comments
     *   https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-pull-requests/#api-api-latest-projects-projectkey-repos-repositoryslug-pull-requests-pullrequestid-comments-post
     *   Body includes `"state": "PENDING"` to create a draft comment visible only to the author until the review is submitted.
     */
    server.registerTool(
        "addPendingReviewComment",
        {
            description: "Add a pending (draft) review comment to a pull request. The comment remains invisible to other users " +
              "until the review is submitted. Supports general, inline (file/line), and reply comments. Data Center only.",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace or project key (uses default if omitted)"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID"),
                content: z.string().describe("Comment content in markdown format"),
                inline: z.object({
                    path: z.string().describe("Path to the file in the repository"),
                    from: z.number().optional().describe("Line number in the old version (for deleted/modified lines)"),
                    to: z.number().optional().describe("Line number in the new version (for added/modified lines)")
                }).optional().describe("Inline comment position for commenting on specific file lines"),
                parentId: z.number().int().optional().describe("Parent comment ID for threaded replies")
            },
            outputSchema: addPendingReviewCommentOutput,
            annotations: { readOnlyHint: false }
        },
        async({ workspace, repoSlug, pullRequestId, content, inline, parentId }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            if (paths.isCloud) return toMcpResult(toolFailure("Pending review comments are only supported on Bitbucket Data Center."));

            logger.debug(`addPendingReviewComment: ${ws}/${repoSlug}#${pullRequestId}`);

            try {
                const body: Record<string, unknown> = {
                    text: content,
                    state: "PENDING"
                };

                if (inline) {
                    body.anchor = {
                        path: inline.path,
                        line: inline.to ?? inline.from,
                        lineType: inline.to ? "ADDED" : "REMOVED",
                        fileType: inline.to ? "TO" : "FROM"
                    };
                }

                if (parentId) body.parent = { id: parentId };

                const comment = await client.post<BitbucketComment>(
                    paths.pullRequestComments(ws, repoSlug, pullRequestId),
                    body
                );

                return toMcpResult(toolSuccess(comment, "Pending review comment added."));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Pull Request", `${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    /*
     * ── getPendingReview ─────────────────────────────────────────────────
     * DC:   GET /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests/{pullRequestId}/review
     *   https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-pull-requests/#api-api-latest-projects-projectkey-repos-repositoryslug-pull-requests-pullrequestid-review-get
     */
    server.registerTool(
        "getPendingReview",
        {
            description: "Get the current user's pending (draft) review on a pull request, including all pending comment threads. Data Center only.",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace or project key (uses default if omitted)"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID")
            },
            outputSchema: getPendingReviewOutput,
            annotations: { readOnlyHint: true }
        },
        async({ workspace, repoSlug, pullRequestId }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            if (paths.isCloud) return toMcpResult(toolFailure("Pending reviews are only supported on Bitbucket Data Center."));

            logger.debug(`getPendingReview: ${ws}/${repoSlug}#${pullRequestId}`);

            try {
                const review = await client.get<BitbucketDCPendingReview>(
                    paths.pullRequestReview(ws, repoSlug, pullRequestId)
                );

                return toMcpResult(toolSuccess(review));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Pending Review", `${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    /*
     * ── submitPendingReview ──────────────────────────────────────────────
     * DC:   PUT /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests/{pullRequestId}/review
     *   https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-pull-requests/#api-api-latest-projects-projectkey-repos-repositoryslug-pull-requests-pullrequestid-review-put
     */
    server.registerTool(
        "submitPendingReview",
        {
            description: "Submit (publish) the current user's pending review on a pull request. " +
              "All pending comments become visible. Optionally set approval status and add a summary comment. Data Center only.",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace or project key (uses default if omitted)"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID"),
                participantStatus: ParticipantStatusEnum.optional().describe(
                    "Review verdict: APPROVED, NEEDS_WORK, or UNAPPROVED (default: no status change)"
                ),
                commentText: z.string().optional().describe("Optional summary comment published alongside the review"),
                lastReviewedCommit: z.string().optional().describe("SHA of the last commit reviewed (for staleness detection)")
            },
            outputSchema: submitPendingReviewOutput,
            annotations: { readOnlyHint: false }
        },
        async({ workspace, repoSlug, pullRequestId, participantStatus, commentText, lastReviewedCommit }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            if (paths.isCloud) return toMcpResult(toolFailure("Pending reviews are only supported on Bitbucket Data Center."));

            logger.debug(`submitPendingReview: ${ws}/${repoSlug}#${pullRequestId}`);

            try {
                const body: BitbucketDCReviewSubmitRequest = {};

                if (participantStatus) body.participantStatus = participantStatus;

                if (commentText) body.commentText = commentText;

                if (lastReviewedCommit) body.lastReviewedCommit = lastReviewedCommit;

                const result = await client.put<Record<string, unknown>>(
                    paths.pullRequestReview(ws, repoSlug, pullRequestId),
                    body
                );

                return toMcpResult(toolSuccess(result, "Pending review submitted."));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Pending Review", `${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    /*
     * ── discardPendingReview ─────────────────────────────────────────────
     * DC:   DELETE /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests/{pullRequestId}/review
     *   https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-pull-requests/#api-api-latest-projects-projectkey-repos-repositoryslug-pull-requests-pullrequestid-review-delete
     */
    server.registerTool(
        "discardPendingReview",
        {
            description: "Discard the current user's pending review on a pull request. All pending (draft) comments are permanently deleted. Data Center only.",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace or project key (uses default if omitted)"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID")
            },
            outputSchema: discardPendingReviewOutput,
            annotations: { readOnlyHint: false }
        },
        async({ workspace, repoSlug, pullRequestId }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            if (paths.isCloud) return toMcpResult(toolFailure("Pending reviews are only supported on Bitbucket Data Center."));

            logger.debug(`discardPendingReview: ${ws}/${repoSlug}#${pullRequestId}`);

            try {
                await client.delete(
                    paths.pullRequestReview(ws, repoSlug, pullRequestId)
                );

                return toMcpResult(toolSuccess(null, "Pending review discarded. All draft comments have been deleted."));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Pending Review", `${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );
}
