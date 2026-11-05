import { request, send } from "./api.js";

export type TimeRange = "day" | "week" | "month" | "year";

export type SearchService =
  | "google"
  | "bing"
  | "bingcn"
  | "duckduckgo"
  | "yahoo"
  | "yandex"
  | "x"
  | "reddit"
  | "github"
  | "youtube"
  | "arxiv"
  | "wechat"
  | "bilibili"
  | "imdb"
  | "wikipedia"
  | "grokipedia";

export type NewsService =
  | "google"
  | "bing"
  | "duckduckgo"
  | "yahoo"
  | "hackernews";

export type TrendingService = "github" | "hackernews";

export interface RequestOptions {
  apiKey?: string;
  signal?: AbortSignal;
}

export interface SearchOptions extends RequestOptions {
  maxResults?: number;
  searchService?: SearchService;
  /** Native results page (1-100); only bing, bingcn, baidu, and grokipedia paginate. */
  page?: number;
  crawlResults?: number;
  includeSites?: string[];
  excludeSites?: string[];
  timeRange?: TimeRange;
}

export interface NewsOptions extends RequestOptions {
  maxResults?: number;
  searchService?: NewsService;
  crawlResults?: number;
  includeSites?: string[];
  excludeSites?: string[];
  timeRange?: TimeRange;
}

export interface SearchResultMetadata {
  /** GitHub: result type, repository stars/language, or thread comments. */
  kind?: "repo" | "issue" | "pr" | "discussion";
  stars?: number;
  language?: string;
  /** GitHub threads and Hacker News news results. */
  num_comments?: number;
  /** Hacker News: votes and submitted article URL; link is the discussion. */
  points?: number;
  story_url?: string;
  [key: string]: unknown;
}

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  content?: string;
  /** ISO 8601, when the source exposes a date. */
  published_date?: string;
  metadata?: SearchResultMetadata;
}

export interface SearchResponse {
  results: SearchResult[];
}

export interface CrawlResult {
  title: string;
  link: string;
  content: string;
}

export interface CrawlResponse {
  crawlParameters?: { url: string };
  results: CrawlResult;
}

export interface SitemapResponse {
  links: string[];
}

export type SitemapType = "sitemap" | "all";

export interface SitemapOptions extends RequestOptions {
  /** `sitemap` reads sitemap.xml; `all` follows the links found on the page. */
  type?: SitemapType;
}

export interface TrendingResult {
  title: string;
  url: string;
  description?: string;
}

export interface TrendingResponse {
  results: TrendingResult[];
}

export interface AskResult {
  title: string;
  link: string;
  snippet: string;
  published_date?: string;
  /** Engine that returned the result. */
  source: string;
  /** Relevance to the query, 0.5-1. */
  relevance: number;
}

export interface AskResponse {
  query: string;
  intent: {
    search_query: string;
    sources: string[];
    time_range: TimeRange | null;
  };
  results: AskResult[];
  errors: Array<{ source: string; message: string }>;
}

export interface MapsLocation {
  latitude: number;
  longitude: number;
  /** Map zoom, 3-30. The API defaults to 14. */
  zoom?: number;
}

export interface MapsOptions extends RequestOptions {
  /** Two-letter country code. The API defaults to `us`. */
  country?: string;
  /** Result language such as `en` or `zh-CN`. The API defaults to `en`. */
  language?: string;
  /** Search around this point. Required for page 2 and later. */
  location?: MapsLocation;
  /** Google Maps page, 1-6. Each page is billed separately. */
  page?: number;
  /** Places to return from the page, 1-20. Fewer places do not lower the price. */
  maxResults?: number;
}

export interface MapsPlace {
  position: number;
  name: string;
  place_id: string;
  maps_url: string;
  address?: string;
  phone?: string;
  website?: string;
  thumbnail?: string;
  category?: string;
  categories?: string[];
  rating?: number;
  review_count?: number;
  coordinates?: { latitude: number; longitude: number };
  opening_hours?: Partial<Record<string, string>>;
  open_state?: string;
  price?: string;
  description?: string;
}

export interface MapsResponse {
  searchParameters: Record<string, unknown>;
  results: MapsPlace[];
}

export type DeepcrawlFormat = "zip" | "json";

export interface DeepcrawlOptions extends RequestOptions {
  /** `sitemap` (the API default) reads sitemap.xml; `all` follows the links found on the page. */
  type?: SitemapType;
  /** Pages to crawl, 1-1000. The API defaults to 1000. */
  maxPages?: number;
  /**
   * Only crawl URLs whose path matches one of these rules (up to 20). Without
   * `*` a rule is a path prefix on segment boundaries (`/docs` matches
   * `/docs/api`, not `/docsearch`); with `*` it must match the whole path.
   */
  includePaths?: string[];
  /** Skip URLs whose path matches one of these rules (up to 20). Exclusion wins. */
  excludePaths?: string[];
  /** `zip` (the API default) or `json`, which returns the pages in the status response. */
  format?: DeepcrawlFormat;
}

export interface DeepcrawlTask {
  taskId: string;
  status: "queued";
}

export type DeepcrawlState =
  | "queued"
  | "waiting"
  | "processing"
  | "completed"
  | "failed"
  | "not_found";

export interface DeepcrawlStats {
  discovered: number;
  matched: number;
  /** Matched pages left out by max_pages. */
  skipped: number;
  crawled: number;
  failed: number;
}

export interface DeepcrawlPage {
  url: string;
  title: string | null;
  /** Page body as Markdown. */
  content: string;
}

export interface DeepcrawlStatusResponse {
  taskId: string;
  status?: DeepcrawlState;
  message?: string;
  error?: string | null;
  format?: DeepcrawlFormat;
  stats?: DeepcrawlStats;
  failed?: Array<{ url: string; error: string }>;
  /** format=zip: the Markdown files as one ZIP. */
  zipUrl?: string | null;
  /** format=json: the JSON result file, `{ pages, failed }`. */
  resultUrl?: string | null;
  /** format=json: the pages inline; omitted when the result is over 5 MB. */
  pages?: DeepcrawlPage[];
  [key: string]: unknown;
}

export interface TrendingOptions extends RequestOptions {
  maxResults?: number;
}

function searchBody(
  query: string,
  options: SearchOptions | NewsOptions,
  defaults: { maxResults: number; searchService: SearchService | NewsService }
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    query,
    max_results: options.maxResults ?? defaults.maxResults,
    search_service: options.searchService ?? defaults.searchService,
    crawl_results: options.crawlResults ?? 0,
  };
  if ("page" in options && options.page !== undefined) body.page = options.page;
  if (options.includeSites) body.include_sites = options.includeSites;
  if (options.excludeSites) body.exclude_sites = options.excludeSites;
  if (options.timeRange) body.time_range = options.timeRange;
  return body;
}

export async function search(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResponse> {
  return request<SearchResponse>(
    "/search",
    searchBody(query, options, { maxResults: 10, searchService: "google" }),
    options
  );
}

export async function news(
  query: string,
  options: NewsOptions = {}
): Promise<SearchResponse> {
  return request<SearchResponse>(
    "/news",
    searchBody(query, options, { maxResults: 10, searchService: "bing" }),
    options
  );
}

/**
 * Agentic search: Search1API picks up to five engines and a time window from a
 * natural-language query and returns at most 10 relevant results. 5 credits.
 */
export async function ask(
  query: string,
  options: RequestOptions = {}
): Promise<AskResponse> {
  return request<AskResponse>("/ask", { query }, options);
}

/**
 * Google Maps place search: one page of up to 20 businesses and places.
 * 3 credits per completed page.
 */
export async function maps(
  query: string,
  options: MapsOptions = {}
): Promise<MapsResponse> {
  const body: Record<string, unknown> = { query };
  if (options.country) body.country = options.country;
  if (options.language) body.language = options.language;
  if (options.location) body.location = options.location;
  if (options.page !== undefined) body.page = options.page;
  if (options.maxResults !== undefined) body.max_results = options.maxResults;
  return request<MapsResponse>("/maps", body, options);
}

export async function crawl(
  url: string,
  options: RequestOptions = {}
): Promise<CrawlResponse> {
  return request<CrawlResponse>("/crawl", { url }, options);
}

export async function sitemap(
  url: string,
  options: SitemapOptions = {}
): Promise<SitemapResponse> {
  const body: Record<string, unknown> = { url };
  if (options.type) body.type = options.type;
  return request<SitemapResponse>("/sitemap", body, options);
}

/**
 * Crawl several URLs in one request. Billed per URL, same as calling `crawl`
 * once per page, but with a single round trip.
 */
export async function crawlBatch(
  urls: string[],
  options: RequestOptions = {}
): Promise<CrawlResponse[]> {
  if (!urls.length) return [];
  return request<CrawlResponse[]>(
    "/crawl",
    urls.map((url) => ({ url })),
    options
  );
}

/**
 * Start a whole-site crawl. Returns a task id right away; poll
 * `deepcrawlStatus` until it reports `completed` or `failed`.
 * 20 credits per task, however many pages it crawls.
 */
export async function deepcrawl(
  url: string,
  options: DeepcrawlOptions = {}
): Promise<DeepcrawlTask> {
  const body: Record<string, unknown> = { url };
  if (options.type) body.type = options.type;
  if (options.maxPages !== undefined) body.max_pages = options.maxPages;
  if (options.includePaths?.length) body.include_paths = options.includePaths;
  if (options.excludePaths?.length) body.exclude_paths = options.excludePaths;
  if (options.format) body.format = options.format;
  return request<DeepcrawlTask>("/deepcrawl", body, options);
}

/**
 * Check a deepcrawl task. Free. A task that failed is returned with
 * `status: "failed"` rather than thrown; an unknown task id throws.
 */
export async function deepcrawlStatus(
  taskId: string,
  options: RequestOptions = {}
): Promise<DeepcrawlStatusResponse> {
  const res = await send(
    `/deepcrawl/status/${encodeURIComponent(taskId)}`,
    { method: "GET" },
    options
  );
  const text = await res.text();
  if (res.ok) return JSON.parse(text) as DeepcrawlStatusResponse;

  // A failed task comes back as a 500 that still describes the task.
  let body: Partial<DeepcrawlStatusResponse> | undefined;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  if (body?.taskId && body.status === "failed") {
    return body as DeepcrawlStatusResponse;
  }
  throw new Error(`API error (${res.status}): ${text}`);
}

export async function trending(
  service: TrendingService,
  options: TrendingOptions = {}
): Promise<TrendingResponse> {
  return request<TrendingResponse>(
    "/trending",
    {
      search_service: service,
      max_results: options.maxResults ?? 10,
    },
    options
  );
}
