import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { BitbucketClient } from "../bitbucket/client.js";
import { BitbucketClientError } from "../bitbucket/client.js";
import type { BitbucketBlockerComment, BitbucketTask, TaskState } from "../bitbucket/types.js";
import type { PathBuilder } from "../bitbucket/utils.js";
import { getLogger } from "../logger.js";
import { toMcpResult, toolError, toolNotFound, toolSuccess } from "../response.js";
import {
    getPullRequestTasksOutput, createPullRequestTaskOutput, getPullRequestTaskOutput,
    updatePullRequestTaskOutput, deletePullRequestTaskOutput
} from "./output-schemas.js";

const TaskStateEnum = z.enum(["OPEN", "RESOLVED"]);

export function registerTaskTools(server: McpServer, client: BitbucketClient, paths: PathBuilder, defaultWorkspace?: string): void {
    const logger = getLogger();

    function resolveWorkspace(workspace?: string) {
        return workspace ?? defaultWorkspace;
    }

    /*
     * ── getPullRequestTasks ──────────────────────────────────────────────
     * Cloud: GET /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/tasks
     *   https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/#api-repositories-workspace-repo-slug-pullrequests-pull-request-id-tasks-get
     * DC:   GET /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests/{pullRequestId}/blocker-comments
     *   https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-pull-requests/#api-api-latest-projects-projectkey-repos-repositoryslug-pull-requests-pullrequestid-blocker-comments-get
     */
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
            outputSchema: getPullRequestTasksOutput,
            annotations: { readOnlyHint: true }
        },
        async({ workspace, repoSlug, pullRequestId, pagelen, page, all }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`getPullRequestTasks: ${ws}/${repoSlug}#${pullRequestId}`);

            try {
                if (paths.isDataCenter) {
                    const result = await client.getPaginated<BitbucketBlockerComment>(
                        paths.pullRequestTasks(ws, repoSlug, pullRequestId),
                        { pagelen, page, all }
                    );

                    return toMcpResult(toolSuccess(result.values));
                }

                const result = await client.getPaginated<BitbucketTask>(
                    paths.pullRequestTasks(ws, repoSlug, pullRequestId),
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

    /*
     * ── createPullRequestTask ────────────────────────────────────────────
     * Cloud: POST /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/tasks
     *   https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/#api-repositories-workspace-repo-slug-pullrequests-pull-request-id-tasks-post
     * DC:   POST /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests/{pullRequestId}/blocker-comments
     *   https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-pull-requests/#api-api-latest-projects-projectkey-repos-repositoryslug-pull-requests-pullrequestid-blocker-comments-post
     */
    server.registerTool(
        "createPullRequestTask",
        {
            description: "Create a task on a pull request",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID"),
                content: z.string().describe("Task content"),
                commentId: z.number().int().optional().describe("Comment ID to attach the task to (Cloud only)"),
                state: TaskStateEnum.optional().describe("Initial task state (OPEN or RESOLVED)")
            },
            outputSchema: createPullRequestTaskOutput,
            annotations: { readOnlyHint: false }
        },
        async({ workspace, repoSlug, pullRequestId, content, commentId, state }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`createPullRequestTask: ${ws}/${repoSlug}#${pullRequestId}`);

            try {
                if (paths.isDataCenter) {
                    const body: Record<string, unknown> = {
                        text: content,
                        severity: "BLOCKER"
                    };

                    if (state) body.state = state;

                    const task = await client.post<BitbucketBlockerComment>(
                        paths.pullRequestTasks(ws, repoSlug, pullRequestId),
                        body
                    );

                    return toMcpResult(toolSuccess(task, "Task created."));
                }

                const body: Record<string, unknown> = {
                    content: { raw: content }
                };

                if (commentId !== undefined) body.comment = { id: commentId };

                if (state) body.state = state;

                const task = await client.post<BitbucketTask>(
                    paths.pullRequestTasks(ws, repoSlug, pullRequestId),
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

    /*
     * ── getPullRequestTask ───────────────────────────────────────────────
     * Cloud: GET /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/tasks/{task_id}
     *   https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/#api-repositories-workspace-repo-slug-pullrequests-pull-request-id-tasks-task-id-get
     * DC:   GET /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests/{pullRequestId}/blocker-comments/{blockerId}
     *   https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-pull-requests/#api-api-latest-projects-projectkey-repos-repositoryslug-pull-requests-pullrequestid-blocker-comments-blockerid-get
     */
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
            outputSchema: getPullRequestTaskOutput,
            annotations: { readOnlyHint: true }
        },
        async({ workspace, repoSlug, pullRequestId, taskId }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`getPullRequestTask: ${ws}/${repoSlug}#${pullRequestId}, task=${taskId}`);

            try {
                if (paths.isDataCenter) {
                    const task = await client.get<BitbucketBlockerComment>(
                        paths.pullRequestTask(ws, repoSlug, pullRequestId, taskId)
                    );

                    return toMcpResult(toolSuccess(task));
                }

                const task = await client.get<BitbucketTask>(
                    paths.pullRequestTask(ws, repoSlug, pullRequestId, taskId)
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

    /*
     * ── updatePullRequestTask ────────────────────────────────────────────
     * Cloud: PUT /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/tasks/{task_id}
     *   https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/#api-repositories-workspace-repo-slug-pullrequests-pull-request-id-tasks-task-id-put
     * DC:   PUT /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests/{pullRequestId}/blocker-comments/{blockerId}
     *   https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-pull-requests/#api-api-latest-projects-projectkey-repos-repositoryslug-pull-requests-pullrequestid-blocker-comments-blockerid-put
     */
    server.registerTool(
        "updatePullRequestTask",
        {
            description: "Update a task on a pull request (content, state). On Data Center, the task version is fetched automatically for optimistic concurrency.",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID"),
                taskId: z.number().int().describe("Task ID"),
                content: z.string().optional().describe("Updated task content"),
                state: TaskStateEnum.optional().describe("Updated task state (OPEN or RESOLVED)")
            },
            outputSchema: updatePullRequestTaskOutput,
            annotations: { readOnlyHint: false }
        },
        async({ workspace, repoSlug, pullRequestId, taskId, content, state }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`updatePullRequestTask: ${ws}/${repoSlug}#${pullRequestId}, task=${taskId}`);

            try {
                if (paths.isDataCenter) {
                    // DC requires version for optimistic concurrency — fetch current task first
                    const current = await client.get<BitbucketBlockerComment>(
                        paths.pullRequestTask(ws, repoSlug, pullRequestId, taskId)
                    );

                    const body: Record<string, unknown> = {
                        id: taskId,
                        version: current.version
                    };

                    if (content !== undefined) body.text = content;

                    if (state !== undefined) body.state = state as TaskState;

                    const task = await client.put<BitbucketBlockerComment>(
                        paths.pullRequestTask(ws, repoSlug, pullRequestId, taskId),
                        body
                    );

                    return toMcpResult(toolSuccess(task, "Task updated."));
                }

                const body: Record<string, unknown> = {};

                if (content !== undefined) body.content = { raw: content };

                if (state !== undefined) body.state = state as TaskState;

                const task = await client.put<BitbucketTask>(
                    paths.pullRequestTask(ws, repoSlug, pullRequestId, taskId),
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

    /*
     * ── deletePullRequestTask ────────────────────────────────────────────
     * Cloud: DELETE /2.0/repositories/{workspace}/{repo_slug}/pullrequests/{pull_request_id}/tasks/{task_id}
     *   https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/#api-repositories-workspace-repo-slug-pullrequests-pull-request-id-tasks-task-id-delete
     * DC:   DELETE /rest/api/latest/projects/{projectKey}/repos/{repositorySlug}/pull-requests/{pullRequestId}/blocker-comments/{blockerId}
     *   https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-pull-requests/#api-api-latest-projects-projectkey-repos-repositoryslug-pull-requests-pullrequestid-blocker-comments-blockerid-delete
     */
    server.registerTool(
        "deletePullRequestTask",
        {
            description: "Delete a task from a pull request. On Data Center, the task version is fetched automatically for optimistic concurrency.",
            inputSchema: {
                workspace: z.string().optional().describe("Bitbucket workspace name"),
                repoSlug: z.string().describe("Repository slug"),
                pullRequestId: z.number().int().describe("Pull request ID"),
                taskId: z.number().int().describe("Task ID")
            },
            outputSchema: deletePullRequestTaskOutput,
            annotations: { readOnlyHint: false }
        },
        async({ workspace, repoSlug, pullRequestId, taskId }) => {
            const ws = resolveWorkspace(workspace);

            if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

            logger.debug(`deletePullRequestTask: ${ws}/${repoSlug}#${pullRequestId}, task=${taskId}`);

            try {
                if (paths.isDataCenter) {
                    // DC requires version for optimistic concurrency — fetch current task first
                    const current = await client.get<BitbucketBlockerComment>(
                        paths.pullRequestTask(ws, repoSlug, pullRequestId, taskId)
                    );

                    await client.delete(
                        paths.pullRequestTask(ws, repoSlug, pullRequestId, taskId),
                        { version: current.version }
                    );

                    return toMcpResult(toolSuccess(true, "Task deleted."));
                }

                await client.delete(
                    paths.pullRequestTask(ws, repoSlug, pullRequestId, taskId)
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
