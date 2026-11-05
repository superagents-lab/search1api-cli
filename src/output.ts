import chalk from "chalk";

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  content?: string;
  published_date?: string;
}

interface AskResult extends SearchResult {
  source: string;
  relevance: number;
}

interface AskResponse {
  intent: {
    search_query: string;
    sources: string[];
    time_range: string | null;
  };
  results: AskResult[];
  errors: Array<{ source: string; message: string }>;
}

interface TrendingResult {
  title: string;
  url: string;
  description?: string;
}

export function printSearchResults(results: SearchResult[], showContent = false): void {
  if (!results.length) {
    console.log(chalk.yellow("No results found."));
    return;
  }

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(chalk.bold.blue(`${i + 1}. ${r.title}`));
    console.log(chalk.dim(r.published_date ? `${r.link} · ${r.published_date}` : r.link));
    console.log(r.snippet);
    if (showContent && r.content) {
      console.log(chalk.cyan("\n--- Content ---"));
      console.log(r.content);
    }
    console.log();
  }
}

export function printAskResults(data: AskResponse): void {
  const { intent } = data;
  const window = intent.time_range ? `, past ${intent.time_range}` : "";
  console.log(
    chalk.dim(`Searched ${intent.sources.join(", ") || "no engines"} for "${intent.search_query}"${window}\n`)
  );

  if (!data.results.length) {
    console.log(chalk.yellow("No relevant results found."));
  }
  for (let i = 0; i < data.results.length; i++) {
    const r = data.results[i];
    console.log(chalk.bold.blue(`${i + 1}. ${r.title}`));
    const meta = [r.source, r.relevance.toFixed(2), r.published_date].filter(Boolean).join(" · ");
    console.log(chalk.dim(`${r.link} · ${meta}`));
    console.log(r.snippet);
    console.log();
  }
  for (const error of data.errors) {
    console.log(chalk.yellow(`${error.source} failed: ${error.message}`));
  }
}

interface MapsPlace {
  name: string;
  maps_url: string;
  address?: string;
  phone?: string;
  website?: string;
  category?: string;
  rating?: number;
  review_count?: number;
  open_state?: string;
  price?: string;
}

export function printMapsResults(results: MapsPlace[]): void {
  if (!results.length) {
    console.log(chalk.yellow("No places found."));
    return;
  }

  for (let i = 0; i < results.length; i++) {
    const p = results[i];
    console.log(chalk.bold.blue(`${i + 1}. ${p.name}`));
    const rating =
      p.rating !== undefined
        ? `${p.rating}★${p.review_count !== undefined ? ` (${p.review_count})` : ""}`
        : undefined;
    const summary = [p.category, rating, p.price, p.open_state].filter(Boolean).join(" · ");
    if (summary) console.log(summary);
    if (p.address) console.log(p.address);
    const contact = [p.phone, p.website].filter(Boolean).join(" · ");
    if (contact) console.log(contact);
    console.log(chalk.dim(p.maps_url));
    console.log();
  }
}

export function printTrendingResults(results: TrendingResult[]): void {
  if (!results.length) {
    console.log(chalk.yellow("No trending results."));
    return;
  }

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(chalk.bold.blue(`${i + 1}. ${r.title}`));
    console.log(chalk.dim(r.url));
    if (r.description) console.log(r.description);
    console.log();
  }
}

export function printCrawlResult(result: { title: string; link: string; content: string }): void {
  console.log(chalk.bold.blue(result.title));
  console.log(chalk.dim(result.link));
  console.log();
  console.log(result.content);
}

export function printSitemapLinks(links: string[]): void {
  if (!links.length) {
    console.log(chalk.yellow("No links found."));
    return;
  }
  for (const link of links) {
    console.log(link);
  }
  console.log(chalk.dim(`\nTotal: ${links.length} links`));
}

interface DeepcrawlResult {
  taskId: string;
  message?: string;
  stats?: { discovered: number; matched: number; skipped: number; crawled: number; failed: number };
  failed?: Array<{ url: string; error: string }>;
  zipUrl?: string | null;
  resultUrl?: string | null;
  pages?: Array<{ url: string; title: string | null; content: string }>;
}

export function printDeepcrawlResult(result: DeepcrawlResult, savedTo?: string): void {
  if (result.message) console.log(result.message);
  const { stats } = result;
  if (stats) {
    console.log(
      chalk.dim(
        `${stats.discovered} discovered · ${stats.matched} matched · ${stats.skipped} over max-pages · ` +
          `${stats.crawled} crawled · ${stats.failed} failed`
      )
    );
  }

  const pages = result.pages ?? [];
  if (pages.length) console.log();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const chars = `${page.content.length.toLocaleString("en-US")} chars`;
    const title = page.title?.trim();
    console.log(
      `${chalk.bold.blue(`${i + 1}.`)} ${title ? `${chalk.bold(title)} ` : ""}${chalk.dim(`${page.url} · ${chars}`)}`
    );
  }

  const failed = result.failed ?? [];
  if (failed.length) {
    console.log();
    console.log(chalk.yellow(`Failed (${failed.length}):`));
    for (const item of failed) console.log(chalk.yellow(`  ${item.url} — ${item.error}`));
  }

  if (result.zipUrl || result.resultUrl || savedTo) console.log();
  if (result.zipUrl) console.log(`ZIP: ${result.zipUrl}`);
  if (result.resultUrl) console.log(`Result: ${result.resultUrl}`);
  if (savedTo) {
    console.log(chalk.green(savedTo));
  } else if (pages.length) {
    console.log(
      chalk.dim(`Page Markdown: s1 deepcrawl status ${result.taskId} -o pages.json (free)`)
    );
  }
}

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}
