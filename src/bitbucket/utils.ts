/**
 * Normalizes a Bitbucket base URL:
 * - `https://bitbucket.org/workspace` → `https://api.bitbucket.org/2.0`
 * - `https://api.bitbucket.org` → `https://api.bitbucket.org/2.0`
 * - Self-hosted URLs are left as-is but trailing slashes are removed
 */
export function normalizeBaseUrl(url: string): string {
    const normalized = url.replace(/\/+$/, "");

    // Convert bitbucket.org web URLs to API URLs
    if ((/^https?:\/\/(www\.)?bitbucket\.org/i).test(normalized)) return "https://api.bitbucket.org/2.0";

    // Ensure api.bitbucket.org has /2.0 suffix
    if ((/^https?:\/\/api\.bitbucket\.org$/i).test(normalized)) return `${normalized}/2.0`;

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
