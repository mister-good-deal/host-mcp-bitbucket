# Adding a New Feature Mapped to a Bitbucket API Route

This procedure describes how to add a new MCP tool backed by a concrete Bitbucket REST API endpoint. The server supports **Bitbucket Cloud (2.0)** and **Bitbucket Data Center** simultaneously, so every feature must account for both platforms.

## API Reference

| Platform         | Documentation                                                                 |
| ---------------- | ----------------------------------------------------------------------------- |
| Bitbucket Cloud  | https://developer.atlassian.com/cloud/bitbucket/rest/                         |
| Bitbucket DC     | https://developer.atlassian.com/server/bitbucket/rest/                        |

## Step-by-step Procedure

### 1. Identify the API endpoint

Open the Bitbucket REST API documentation for the target platform and locate the endpoint you want to expose:

- **Cloud** – find the _API group_ page (e.g. `api-group-pullrequests`) and note the HTTP method, path, query parameters, request body and response shape.
- **Data Center** – do the same for the DC variant; paths and payload shapes often differ (e.g. `pullrequests` vs `pull-requests`, `content.raw` vs `text`).

### 2. Add a path to `PathBuilder` (`src/bitbucket/utils.ts`)

Add a new method to the `PathBuilder` class that returns the **platform-specific** path segment.

```typescript
/**
 * Path for <description>.
 *
 * Cloud:  <HTTP_METHOD> /2.0/<cloud_path>
 * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-<group>/#api-<anchor>
 *
 * DC:    <HTTP_METHOD> /rest/api/latest/<dc_path>
 * @see https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-<group>/#api-<anchor>
 */
newEndpoint(ws: string, repoSlug: string, ...ids: number[]): string {
    return this.isCloud
        ? `${this.repoBase(ws, repoSlug)}/<cloud-suffix>`
        : `${this.repoBase(ws, repoSlug)}/<dc-suffix>`;
}
```

Follow the existing naming pattern: the method name matches the resource noun (e.g. `pullRequestTasks`, `branches`).

### 3. Define the output schema (`src/tools/output-schemas.ts`)

Add a new constant and wire it into the `OUTPUT_SCHEMAS` map:

```typescript
export const newToolOutput = ToolResponseSchema.describe("Description of the result");
```

Then register it in the `OUTPUT_SCHEMAS` record at the bottom of the file:

```typescript
export const OUTPUT_SCHEMAS: Record<string, z.ZodType> = {
    // …existing entries
    newTool: newToolOutput,
};
```

### 4. Register the MCP tool (`src/tools/<domain>.ts`)

Inside the appropriate `register*Tools()` function, call `server.registerTool()`.

Add a comment linking to the API documentation _above_ the tool registration:

```typescript
// ── newTool ──────────────────────────────────────────────────────────
// Cloud: <HTTP_METHOD> /2.0/<cloud_path>
//   https://developer.atlassian.com/cloud/bitbucket/rest/api-group-<group>/#api-<anchor>
// DC:   <HTTP_METHOD> /rest/api/latest/<dc_path>
//   https://developer.atlassian.com/server/bitbucket/rest/v1000/api-group-<group>/#api-<anchor>
server.registerTool(
    "newTool",
    {
        description: "What the tool does",
        inputSchema: {
            workspace: z.string().optional().describe("Bitbucket workspace or project key (uses default if omitted)"),
            repoSlug: z.string().describe("Repository slug"),
            // …additional parameters
        },
        outputSchema: newToolOutput,
        annotations: { readOnlyHint: true } // false for mutating operations
    },
    async ({ workspace, repoSlug /*, … */ }) => {
        const ws = resolveWorkspace(workspace);
        if (!ws) return toMcpResult(toolError(new Error("Workspace is required.")));

        logger.debug(`newTool: ${ws}/${repoSlug}`);

        try {
            const result = await client.get<SomeType>(paths.newEndpoint(ws, repoSlug));
            return toMcpResult(toolSuccess(result));
        } catch (error) {
            if (error instanceof BitbucketClientError && error.statusCode === 404) {
                return toMcpResult(toolNotFound("Resource", `${ws}/${repoSlug}`));
            }
            return toMcpResult(toolError(error));
        }
    }
);
```

**Key conventions:**

| Concern                | Guideline                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| HTTP method            | `client.get` / `client.post` / `client.put` / `client.delete` / `client.getText` / `client.getPaginated` |
| Platform branching     | Use `paths.isCloud` / `paths.isDataCenter` when payloads differ                                         |
| Pagination             | Accept `pagelen`, `page`, `all` params; pass them to `client.getPaginated()`                            |
| Read-only hint         | Set `readOnlyHint: true` for GET endpoints, `false` for POST/PUT/DELETE                                 |
| Error handling         | Catch `BitbucketClientError` with `statusCode === 404` → `toolNotFound()`; everything else → `toolError()` |
| Default workspace      | Always fall back to `defaultWorkspace` via `resolveWorkspace()`                                         |

### 5. Wire the registration into `src/server.ts`

If you created a **new** tool file (i.e. a new domain), import and call its `register*Tools()` function inside `createServer()`:

```typescript
import { registerNewDomainTools } from "./tools/new-domain.js";
// …
registerNewDomainTools(server, client, paths, defaultWorkspace);
```

If you added the tool to an **existing** file, no changes are needed here.

### 6. Add types if needed (`src/bitbucket/types.ts`)

If the API returns a shape not yet covered, add a TypeScript interface:

```typescript
export interface BitbucketNewResource {
    id: number;
    // …
}
```

### 7. Write unit tests (`tests/unit/tools/<domain>.test.ts`)

Follow the existing test pattern in `tests/unit/tools/helpers.ts`:

1. Create a mock `McpServer` / `BitbucketClient` / `PathBuilder`.
2. Call the `register*Tools()` function.
3. Invoke the registered handler via the mock.
4. Assert the returned MCP result.

### 8. Validate

```bash
npm run lint          # ESLint
npm run build         # TypeScript compilation
npm run test          # Unit tests
```

## Quick Checklist

- [ ] PathBuilder method added in `src/bitbucket/utils.ts` (with `@see` doc links)
- [ ] Output schema added in `src/tools/output-schemas.ts` (+ `OUTPUT_SCHEMAS` map)
- [ ] Tool registered in `src/tools/<domain>.ts` (with API doc link comments)
- [ ] Registration wired in `src/server.ts` (only if new file)
- [ ] Types added in `src/bitbucket/types.ts` (if new response shape)
- [ ] Unit tests added in `tests/unit/tools/<domain>.test.ts`
- [ ] `npm run lint && npm run build && npm run test` passes
