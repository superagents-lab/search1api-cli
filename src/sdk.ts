import { request } from "./api.js";

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
