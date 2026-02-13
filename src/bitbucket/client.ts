import type { BitbucketDCPaginatedResponse, BitbucketPaginatedResponse } from "./types.js";
import { buildQueryString, type BitbucketPlatform } from "./utils.js";
import { getLogger } from "../logger.js";

export interface BitbucketClientConfig {
    baseUrl: string;
    token: string;
    timeout: number;
    platform: BitbucketPlatform;

    /** Maximum number of retries for transient errors (default: 3). */
    maxRetries?: number;

    /** Base delay in ms for exponential backoff (default: 1000). */
    retryDelay?: number;
}

/** HTTP status codes that are worth retrying. */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/** Maximum number of items to fetch when using `all` pagination. */
const ALL_ITEMS_CAP = 1000;

/** Default page length for paginated requests. */
const DEFAULT_PAGE_LEN = 10;

/** Maximum page length allowed by Bitbucket API. */
const MAX_PAGE_LEN = 100;

export class BitbucketClientError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number,
        public readonly body?: string
    ) {
        super(message);
        this.name = "BitbucketClientError";
    }
}

export interface PaginationOptions {
    pagelen?: number;
    page?: number;
    all?: boolean;
}

export class BitbucketClient {
    private readonly baseUrl: string;
    private readonly authHeader: string;
    private readonly timeout: number;
    private readonly maxRetries: number;
    private readonly retryDelay: number;
    readonly platform: BitbucketPlatform;

    constructor(config: BitbucketClientConfig) {
        this.baseUrl = config.baseUrl.replace(/\/+$/, "");
        this.authHeader = `Bearer ${config.token}`;
        this.timeout = config.timeout;
        this.maxRetries = config.maxRetries ?? 3;
        this.retryDelay = config.retryDelay ?? 1000;
        this.platform = config.platform;
    }

    get isCloud(): boolean {
        return this.platform === "cloud";
    }

    get isDataCenter(): boolean {
        return this.platform === "datacenter";
    }

    /**
     * Perform a GET request returning parsed JSON.
     */
    async get<T = unknown>(
        path: string,
        query?: Record<string, string | number | boolean | undefined | null>
    ): Promise<T> {
        const qs = query ? buildQueryString(query) : "";
        const url = `${this.baseUrl}${path}${qs}`;

        return this.request<T>("GET", url);
    }

    /**
     * Perform a GET request returning raw text (e.g., diffs, patches).
     */
    async getText(
        path: string,
        query?: Record<string, string | number | boolean | undefined | null>
    ): Promise<string> {
        const qs = query ? buildQueryString(query) : "";
        const url = `${this.baseUrl}${path}${qs}`;

        return this.requestText("GET", url);
    }

    /**
     * Perform a POST request returning parsed JSON.
     */
    async post<T = unknown>(
        path: string,
        body?: Record<string, unknown>,
        query?: Record<string, string | number | boolean | undefined | null>
    ): Promise<T> {
        const qs = query ? buildQueryString(query) : "";
        const url = `${this.baseUrl}${path}${qs}`;
        const logger = getLogger();

        logger.debug(`POST ${url}`);

        const headers: Record<string, string> = {
            "Authorization": this.authHeader,
            "Content-Type": "application/json"
        };

        const response = await this.fetchWithRetry(url, {
            method: "POST",
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(this.timeout)
        });

        if (!response.ok) await this.handleError(response, url);

        const text = await response.text();

        if (text.length === 0) return null as T;

        return JSON.parse(text) as T;
    }

    /**
     * Perform a PUT request returning parsed JSON.
     */
    async put<T = unknown>(
        path: string,
        body?: Record<string, unknown>,
        query?: Record<string, string | number | boolean | undefined | null>
    ): Promise<T> {
        const qs = query ? buildQueryString(query) : "";
        const url = `${this.baseUrl}${path}${qs}`;
        const logger = getLogger();

        logger.debug(`PUT ${url}`);

        const headers: Record<string, string> = {
            "Authorization": this.authHeader,
            "Content-Type": "application/json"
        };

        const response = await this.fetchWithRetry(url, {
            method: "PUT",
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(this.timeout)
        });

        if (!response.ok) await this.handleError(response, url);

        const text = await response.text();

        if (text.length === 0) return null as T;

        return JSON.parse(text) as T;
    }

    /**
     * Perform a DELETE request.
     */
    async delete(
        path: string,
        query?: Record<string, string | number | boolean | undefined | null>
    ): Promise<void> {
        const qs = query ? buildQueryString(query) : "";
        const url = `${this.baseUrl}${path}${qs}`;
        const logger = getLogger();

        logger.debug(`DELETE ${url}`);

        const response = await this.fetchWithRetry(url, {
            method: "DELETE",
            headers: { Authorization: this.authHeader },
            signal: AbortSignal.timeout(this.timeout)
        });

        if (!response.ok) await this.handleError(response, url);
    }

    /**
     * Fetch a paginated Bitbucket endpoint.
     * Supports both Cloud (page/pagelen/next) and DC (start/limit/isLastPage) pagination.
     * When `all` is true, follows pages until all items are collected (capped at 1000).
     */
    async getPaginated<T>(
        path: string,
        options: PaginationOptions = {},
        extraQuery?: Record<string, string | number | boolean | undefined | null>
    ): Promise<{ values: T[]; total?: number }> {
        if (this.isDataCenter) {
            return this.getPaginatedDC<T>(path, options, extraQuery);
        }

        return this.getPaginatedCloud<T>(path, options, extraQuery);
    }

    private async getPaginatedCloud<T>(
        path: string,
        options: PaginationOptions,
        extraQuery?: Record<string, string | number | boolean | undefined | null>
    ): Promise<{ values: T[]; total?: number }> {
        const pagelen = Math.min(options.pagelen ?? DEFAULT_PAGE_LEN, MAX_PAGE_LEN);
        const query: Record<string, string | number | boolean | undefined | null> = {
            ...extraQuery,
            pagelen
        };

        if (options.page !== undefined) query.page = options.page;

        const shouldFetchAll = options.all === true && options.page === undefined;

        if (!shouldFetchAll) {
            const response = await this.get<BitbucketPaginatedResponse<T>>(path, query);

            return { values: response.values, total: response.size };
        }

        // Fetch all pages
        const allValues: T[] = [];
        let nextUrl: string | undefined;

        const firstPage = await this.get<BitbucketPaginatedResponse<T>>(path, query);

        allValues.push(...firstPage.values);
        nextUrl = firstPage.next;

        while (nextUrl && allValues.length < ALL_ITEMS_CAP) {
            const response = await this.request<BitbucketPaginatedResponse<T>>("GET", nextUrl);

            allValues.push(...response.values);
            nextUrl = response.next;
        }

        return { values: allValues, total: firstPage.size };
    }

    private async getPaginatedDC<T>(
        path: string,
        options: PaginationOptions,
        extraQuery?: Record<string, string | number | boolean | undefined | null>
    ): Promise<{ values: T[]; total?: number }> {
        const limit = Math.min(options.pagelen ?? 25, MAX_PAGE_LEN);
        const query: Record<string, string | number | boolean | undefined | null> = {
            ...extraQuery,
            limit
        };

        // DC uses 0-based `start` index; convert 1-based `page` to `start`
        if (options.page !== undefined) query.start = (options.page - 1) * limit;

        const shouldFetchAll = options.all === true && options.page === undefined;

        if (!shouldFetchAll) {
            const response = await this.get<BitbucketDCPaginatedResponse<T>>(path, query);

            return { values: response.values, total: response.size };
        }

        // Fetch all pages
        const allValues: T[] = [];
        let start = 0;

        while (allValues.length < ALL_ITEMS_CAP) {
            query.start = start;

            const response = await this.get<BitbucketDCPaginatedResponse<T>>(path, query);

            allValues.push(...response.values);

            if (response.isLastPage || response.nextPageStart === undefined) break;

            start = response.nextPageStart;
        }

        return { values: allValues, total: allValues.length };
    }

    private async request<T>(method: string, url: string): Promise<T> {
        const logger = getLogger();

        logger.debug(`${method} ${url}`);

        const response = await this.fetchWithRetry(url, {
            method,
            headers: { Authorization: this.authHeader },
            signal: AbortSignal.timeout(this.timeout)
        });

        if (!response.ok) await this.handleError(response, url);

        return response.json() as Promise<T>;
    }

    private async requestText(method: string, url: string): Promise<string> {
        const logger = getLogger();

        logger.debug(`${method} ${url}`);

        const response = await this.fetchWithRetry(url, {
            method,
            headers: { Authorization: this.authHeader },
            signal: AbortSignal.timeout(this.timeout)
        });

        if (!response.ok) await this.handleError(response, url);

        return response.text();
    }

    /**
     * Fetch with exponential backoff retry for transient failures.
     * Retries on network errors and 429/5xx status codes.
     */
    private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
        const logger = getLogger();
        let lastError: unknown;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await fetch(url, init);

                if (attempt < this.maxRetries && RETRYABLE_STATUS_CODES.has(response.status)) {
                    const delay = this.computeBackoff(attempt);

                    logger.warn(`Retryable HTTP ${response.status} for ${url}, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`);
                    await this.sleep(delay);

                    continue;
                }

                return response;
            } catch (error) {
                lastError = error;

                // Don't retry AbortError (timeout) — the caller set an explicit timeout
                if (error instanceof DOMException && error.name === "AbortError") throw error;

                if (attempt < this.maxRetries) {
                    const delay = this.computeBackoff(attempt);

                    logger.warn(`Network error for ${url}, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries}): ${error instanceof Error ? error.message : error}`);
                    await this.sleep(delay);
                }
            }
        }

        throw lastError;
    }

    /** Compute backoff delay with jitter: baseDelay * 2^attempt + random jitter. */
    private computeBackoff(attempt: number): number {
        const exponential = this.retryDelay * Math.pow(2, attempt);
        const jitter = Math.random() * this.retryDelay;

        return Math.min(exponential + jitter, 30_000);
    }

    /** Sleep for the given number of milliseconds. */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async handleError(response: Response, url: string): Promise<never> {
        const body = await response.text().catch(() => "");

        if (response.status === 401 || response.status === 403) {
            throw new BitbucketClientError(
                `Authentication failed (${response.status}). Check your Bitbucket API token.`,
                response.status,
                body
            );
        }

        if (response.status === 404) {
            throw new BitbucketClientError(
                `Resource not found: ${url}`,
                response.status,
                body
            );
        }

        throw new BitbucketClientError(
            `Bitbucket API error (${response.status}): ${body || response.statusText}`,
            response.status,
            body
        );
    }
}
