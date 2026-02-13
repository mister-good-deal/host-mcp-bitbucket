import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { BitbucketClient } from "../bitbucket/client.js";
import { BitbucketClientError } from "../bitbucket/client.js";
import type { BitbucketComment } from "../bitbucket/types.js";
import type { PathBuilder } from "../bitbucket/utils.js";
import { getLogger } from "../logger.js";
import { toMcpResult, toolError, toolNotFound, toolSuccess } from "../response.js";
import {
    getPullRequestCommentsOutput, getPullRequestCommentOutput, addPullRequestCommentOutput,
    updatePullRequestCommentOutput, deletePullRequestCommentOutput, resolveCommentOutput, reopenCommentOutput
} from "./output-schemas.js";

export function registerCommentTools(server: McpServer, client: BitbucketClient, paths: PathBuilder, defaultWorkspace?: string): void {
    const logger = getLogger();

    function resolveWorkspace(workspace?: string) {
        return workspace ?? defaultWorkspace;
    }

    // ── getPullRequestComments ───────────────────────────────────────────
    server.registerTool(
        "getPullRequestComments",
        {
            description: "List comments on a pull request",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID"),
                pagelen: z.number().int().min(1).max(100).optional().describe("Number of items per page"),
                page: z.number().int().min(1).optional().describe("Page number"),
                all: z.boolean().optional().describe("Fetch all pages")
            },
            outputSchema: getPullRequestCommentsOutput,
            annotations: { readOnlyHint: true }
        },
        async({ workspace, repoSlug, pullRequestId, pagelen, page, all }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`getPullRequestComments: ${ws}/${repoSlug}#${pullRequestId}`);

            try {
                const result = await client.getPaginated<BitbucketComment>(
                    paths.pullRequestComments(ws, repoSlug, pullRequestId),
                    { pagelen, page, all }
                );

                return toMcpResult(toolSuccess(result.values));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Pull Request", `${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    // ── getPullRequestComment ────────────────────────────────────────────
    server.registerTool(
        "getPullRequestComment",
        {
            description: "Get a specific comment on a pull request",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID"),
                commentId: z.number().int().describe("Comment ID")
            },
            outputSchema: getPullRequestCommentOutput,
            annotations: { readOnlyHint: true }
        },
        async({ workspace, repoSlug, pullRequestId, commentId }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`getPullRequestComment: ${ws}/${repoSlug}#${pullRequestId}, comment=${commentId}`);

            try {
                const comment = await client.get<BitbucketComment>(
                    paths.pullRequestComment(ws, repoSlug, pullRequestId, commentId)
                );

                return toMcpResult(toolSuccess(comment));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Comment", `${commentId} on PR ${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    // ── addPullRequestComment ────────────────────────────────────────────
    server.registerTool(
        "addPullRequestComment",
        {
            description: "Add a comment to a pull request (general or inline on a specific file/line)",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID"),
                content: z.string().describe("Comment content in markdown format"),
                inline: z.object({
                    path: z.string().describe("Path to the file in the repository"),
                    from: z.number().optional().describe("Line number in the old version (for deleted/modified lines)"),
                    to: z.number().optional().describe("Line number in the new version (for added/modified lines)")
                }).optional().describe("Inline comment position for commenting on specific lines"),
                parentId: z.number().int().optional().describe("Parent comment ID for threaded replies")
            },
            outputSchema: addPullRequestCommentOutput,
            annotations: { readOnlyHint: false }
        },
        async({ workspace, repoSlug, pullRequestId, content, inline, parentId }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`addPullRequestComment: ${ws}/${repoSlug}#${pullRequestId}`);

            try {
                let body: Record<string, unknown>;

                if (paths.isCloud) {
                    body = { content: { raw: content }};

                    if (inline) body.inline = inline;

                    if (parentId) body.parent = { id: parentId };
                } else {
                    body = { text: content };

                    if (inline) {
                        body.anchor = {
                            path: inline.path,
                            line: inline.to ?? inline.from,
                            lineType: inline.to ? "ADDED" : "REMOVED",
                            fileType: inline.to ? "TO" : "FROM"
                        };
                    }

                    if (parentId) body.parent = { id: parentId };
                }

                const comment = await client.post<BitbucketComment>(
                    paths.pullRequestComments(ws, repoSlug, pullRequestId),
                    body
                );

                return toMcpResult(toolSuccess(comment, "Comment added."));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Pull Request", `${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    // ── updatePullRequestComment ─────────────────────────────────────────
    server.registerTool(
        "updatePullRequestComment",
        {
            description: "Update a comment on a pull request",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID"),
                commentId: z.number().int().describe("Comment ID"),
                content: z.string().describe("Updated comment content in markdown format")
            },
            outputSchema: updatePullRequestCommentOutput,
            annotations: { readOnlyHint: false }
        },
        async({ workspace, repoSlug, pullRequestId, commentId, content }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`updatePullRequestComment: ${ws}/${repoSlug}#${pullRequestId}, comment=${commentId}`);

            try {
                const body = paths.isCloud
                    ? { content: { raw: content }}
                    : { text: content };

                const comment = await client.put<BitbucketComment>(
                    paths.pullRequestComment(ws, repoSlug, pullRequestId, commentId),
                    body
                );

                return toMcpResult(toolSuccess(comment, "Comment updated."));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Comment", `${commentId} on PR ${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    // ── deletePullRequestComment ─────────────────────────────────────────
    server.registerTool(
        "deletePullRequestComment",
        {
            description: "Delete a comment on a pull request",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID"),
                commentId: z.number().int().describe("Comment ID")
            },
            outputSchema: deletePullRequestCommentOutput,
            annotations: { readOnlyHint: false }
        },
        async({ workspace, repoSlug, pullRequestId, commentId }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`deletePullRequestComment: ${ws}/${repoSlug}#${pullRequestId}, comment=${commentId}`);

            try {
                await client.delete(
                    paths.pullRequestComment(ws, repoSlug, pullRequestId, commentId)
                );

                return toMcpResult(toolSuccess(true, "Comment deleted."));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Comment", `${commentId} on PR ${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    // ── resolveComment ───────────────────────────────────────────────────
    server.registerTool(
        "resolveComment",
        {
            description: "Resolve a comment thread on a pull request",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID"),
                commentId: z.number().int().describe("Comment ID")
            },
            outputSchema: resolveCommentOutput,
            annotations: { readOnlyHint: false }
        },
        async({ workspace, repoSlug, pullRequestId, commentId }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`resolveComment: ${ws}/${repoSlug}#${pullRequestId}, comment=${commentId}`);

            try {
                const result = await client.put<BitbucketComment>(
                    paths.pullRequestCommentResolve(ws, repoSlug, pullRequestId, commentId)
                );

                return toMcpResult(toolSuccess(result, "Comment resolved."));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Comment", `${commentId} on PR ${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    // ── reopenComment ────────────────────────────────────────────────────
    server.registerTool(
        "reopenComment",
        {
            description: "Reopen a resolved comment thread on a pull request",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID"),
                commentId: z.number().int().describe("Comment ID")
            },
            outputSchema: reopenCommentOutput,
            annotations: { readOnlyHint: false }
        },
        async({ workspace, repoSlug, pullRequestId, commentId }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`reopenComment: ${ws}/${repoSlug}#${pullRequestId}, comment=${commentId}`);

            try {
                await client.delete(
                    paths.pullRequestCommentResolve(ws, repoSlug, pullRequestId, commentId)
                );

                return toMcpResult(toolSuccess(true, "Comment reopened."));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Comment", `${commentId} on PR ${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );
}
