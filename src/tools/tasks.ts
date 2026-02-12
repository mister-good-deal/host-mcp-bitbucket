import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { BitbucketClient } from "../bitbucket/client.js";
import { BitbucketClientError } from "../bitbucket/client.js";
import type { BitbucketTask, TaskState } from "../bitbucket/types.js";
import { getLogger } from "../logger.js";
import { toMcpResult, toolError, toolNotFound, toolSuccess } from "../response.js";

const TaskStateEnum = z.enum(["OPEN", "RESOLVED"]);

export function registerTaskTools(server: McpServer, client: BitbucketClient, defaultWorkspace?: string): void {
    const logger = getLogger();

    function resolveWorkspace(workspace?: string) {
        return workspace ?? defaultWorkspace;
    }

    function prTasksPath(ws: string, repoSlug: string, pullRequestId: number) {
        return `/repositories/${ws}/${repoSlug}/pullrequests/${pullRequestId}/tasks`;
    }

    // ── getPullRequestTasks ──────────────────────────────────────────────
    server.registerTool(
        "getPullRequestTasks",
        {
            description: "List tasks on a pull request",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID"),
                pagelen: z.number().int().min(1).max(100).optional().describe("Number of items per page"),
                page: z.number().int().min(1).optional().describe("Page number"),
                all: z.boolean().optional().describe("Fetch all pages")
            },
            annotations: { readOnlyHint: true }
        },
        async({ workspace, repoSlug, pullRequestId, pagelen, page, all }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`getPullRequestTasks: ${ws}/${repoSlug}#${pullRequestId}`);

            try {
                const result = await client.getPaginated<BitbucketTask>(
                    prTasksPath(ws, repoSlug, pullRequestId),
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

    // ── createPullRequestTask ────────────────────────────────────────────
    server.registerTool(
        "createPullRequestTask",
        {
            description: "Create a task on a pull request",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID"),
                content: z.string().describe("Task content"),
                commentId: z.number().int().optional().describe("Comment ID to attach the task to"),
                state: TaskStateEnum.optional().describe("Initial task state (OPEN or RESOLVED)")
            },
            annotations: { readOnlyHint: false }
        },
        async({ workspace, repoSlug, pullRequestId, content, commentId, state }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`createPullRequestTask: ${ws}/${repoSlug}#${pullRequestId}`);

            try {
                const body: Record<string, unknown> = {
                    content: { raw: content }
                };

                if (commentId !== undefined) body.comment = { id: commentId };

                if (state) body.state = state;

                const task = await client.post<BitbucketTask>(
                    prTasksPath(ws, repoSlug, pullRequestId),
                    body
                );

                return toMcpResult(toolSuccess(task, "Task created."));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Pull Request", `${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    // ── getPullRequestTask ───────────────────────────────────────────────
    server.registerTool(
        "getPullRequestTask",
        {
            description: "Get a specific task on a pull request",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID"),
                taskId: z.number().int().describe("Task ID")
            },
            annotations: { readOnlyHint: true }
        },
        async({ workspace, repoSlug, pullRequestId, taskId }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`getPullRequestTask: ${ws}/${repoSlug}#${pullRequestId}, task=${taskId}`);

            try {
                const task = await client.get<BitbucketTask>(
                    `${prTasksPath(ws, repoSlug, pullRequestId)}/${taskId}`
                );

                return toMcpResult(toolSuccess(task));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Task", `${taskId} on PR ${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    // ── updatePullRequestTask ────────────────────────────────────────────
    server.registerTool(
        "updatePullRequestTask",
        {
            description: "Update a task on a pull request (content, state)",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID"),
                taskId: z.number().int().describe("Task ID"),
                content: z.string().optional().describe("Updated task content"),
                state: TaskStateEnum.optional().describe("Updated task state (OPEN or RESOLVED)")
            },
            annotations: { readOnlyHint: false }
        },
        async({ workspace, repoSlug, pullRequestId, taskId, content, state }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`updatePullRequestTask: ${ws}/${repoSlug}#${pullRequestId}, task=${taskId}`);

            try {
                const body: Record<string, unknown> = {};

                if (content !== undefined) body.content = { raw: content };

                if (state !== undefined) body.state = state as TaskState;

                const task = await client.put<BitbucketTask>(
                    `${prTasksPath(ws, repoSlug, pullRequestId)}/${taskId}`,
                    body
                );

                return toMcpResult(toolSuccess(task, "Task updated."));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Task", `${taskId} on PR ${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );

    // ── deletePullRequestTask ────────────────────────────────────────────
    server.registerTool(
        "deletePullRequestTask",
        {
            description: "Delete a task from a pull request",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID"),
                taskId: z.number().int().describe("Task ID")
            },
            annotations: { readOnlyHint: false }
        },
        async({ workspace, repoSlug, pullRequestId, taskId }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`deletePullRequestTask: ${ws}/${repoSlug}#${pullRequestId}, task=${taskId}`);

            try {
                await client.delete(
                    `${prTasksPath(ws, repoSlug, pullRequestId)}/${taskId}`
                );

                return toMcpResult(toolSuccess(true, "Task deleted."));
            } catch (error) {
                if (error instanceof BitbucketClientError && error.statusCode === 404) {
                    return toMcpResult(toolNotFound("Task", `${taskId} on PR ${ws}/${repoSlug}#${pullRequestId}`));
                }

                return toMcpResult(toolError(error));
            }
        }
    );
}
