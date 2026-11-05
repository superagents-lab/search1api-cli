import chalk from "chalk";
import { Command } from "commander";
import { writeFileSync } from "node:fs";
import {
  deepcrawl,
  deepcrawlStatus,
  type DeepcrawlFormat,
  type DeepcrawlOptions,
  type DeepcrawlStatusResponse,
  type SitemapType,
} from "../sdk.js";
import { printDeepcrawlResult, printJson } from "../output.js";

// Limits the API enforces; checked here so a bad option costs no credits.
const MAX_PAGES_LIMIT = 1000;
const MAX_PATH_RULES = 20;
const MAX_PATH_RULE_LENGTH = 200;
const TYPES: SitemapType[] = ["sitemap", "all"];
const FORMATS: DeepcrawlFormat[] = ["json", "zip"];
const POLL_INTERVAL_MS = 2000;
const FINISHED = new Set(["completed", "failed", "not_found"]);

function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

function parseMaxPages(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PAGES_LIMIT) {
    throw new Error(`--max-pages must be an integer between 1 and ${MAX_PAGES_LIMIT}`);
  }
  return parsed;
}

function parsePathRules(rules: string[] | undefined, flag: string): string[] | undefined {
  if (!rules?.length) return undefined;
  if (rules.length > MAX_PATH_RULES) {
    throw new Error(`${flag} accepts at most ${MAX_PATH_RULES} rules`);
  }
  return rules.map((rule) => {
    const trimmed = rule.trim();
    if (!trimmed || rule.length > MAX_PATH_RULE_LENGTH) {
      throw new Error(`Each ${flag} rule must be a non-empty path of at most ${MAX_PATH_RULE_LENGTH} characters`);
    }
    return trimmed;
  });
}

function parseTimeout(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("--timeout must be a positive number of seconds");
  }
  return parsed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function download(url: string, file: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) from ${url}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

/** Writes the finished result to `file`; returns what was saved, or undefined if there was nothing. */
async function saveResult(
  status: DeepcrawlStatusResponse,
  file: string
): Promise<string | undefined> {
  if (status.pages) {
    const body = { pages: status.pages, failed: status.failed ?? [] };
    writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
    return `Saved ${status.pages.length} pages to ${file}`;
  }
  // Results over 5 MB are not inlined; resultUrl holds the same { pages, failed } file.
  const url = status.zipUrl ?? status.resultUrl;
  if (url) {
    await download(url, file);
    return `Saved ${status.zipUrl ? "the ZIP" : "the result"} to ${file}`;
  }
  console.error(chalk.yellow(`Nothing to save to ${file}: the task produced no result.`));
  return undefined;
}

/** Prints a finished or in-progress status. A failed task exits non-zero. */
async function report(
  status: DeepcrawlStatusResponse,
  opts: { json?: boolean; output?: string }
): Promise<void> {
  if (status.status === "failed") {
    if (opts.json) printJson(status);
    throw new Error(
      `Deepcrawl task ${status.taskId} failed: ${status.error || status.message || "no reason given"}`
    );
  }

  if (status.status !== "completed") {
    if (opts.json) {
      printJson(status);
    } else {
      console.log(`Task ${status.taskId} is ${status.status ?? "pending"}.${status.message ? ` ${status.message}` : ""}`);
    }
    if (opts.output) {
      console.error(chalk.yellow(`Not saved to ${opts.output}: the task has not finished.`));
    }
    return;
  }

  const saved = opts.output ? await saveResult(status, opts.output) : undefined;
  if (opts.json) {
    printJson(status);
    if (saved) console.error(saved);
  } else {
    printDeepcrawlResult(status, saved);
  }
}

export function registerDeepcrawlCommand(program: Command): void {
  const command = program
    .command("deepcrawl <url>")
    .description("Crawl a whole site into Markdown pages (20 credits per task, any page count)")
    .option("--type <type>", "sitemap reads sitemap.xml; all follows the links on the page", "sitemap")
    .option("-n, --max-pages <number>", `pages to crawl (1-${MAX_PAGES_LIMIT}, default ${MAX_PAGES_LIMIT})`)
    .option(
      "--include <path>",
      `only crawl URL paths matching this rule; repeatable, up to ${MAX_PATH_RULES}. ` +
        "/docs matches /docs/api, not /docsearch; * matches anything, e.g. /blog/*",
      collect
    )
    .option("--exclude <path>", `skip URL paths matching this rule; repeatable, up to ${MAX_PATH_RULES}; wins over --include`, collect)
    .option("--format <format>", "json lists the pages inline; zip packs them as Markdown files", "json")
    .option("--no-wait", "start the task, print its id and exit")
    .option("--timeout <seconds>", "how long to wait for the result", "300")
    .option("-o, --output <file>", "save the result: the pages as JSON (json) or the ZIP (zip)")
    .option("--json", "output the raw status JSON")
    // With the program's positional options, `status <id> --json` reaches the subcommand.
    .enablePositionalOptions()
    .helpCommand(false)
    .action(async (url: string, opts) => {
      if (!/^https?:\/\//i.test(url)) {
        throw new Error("The URL must start with http:// or https://");
      }
      if (!TYPES.includes(opts.type)) {
        throw new Error(`--type must be one of: ${TYPES.join(", ")}`);
      }
      if (!FORMATS.includes(opts.format)) {
        throw new Error(`--format must be one of: ${FORMATS.join(", ")}`);
      }
      const options: DeepcrawlOptions = { type: opts.type, format: opts.format };
      if (opts.maxPages !== undefined) options.maxPages = parseMaxPages(opts.maxPages);
      options.includePaths = parsePathRules(opts.include, "--include");
      options.excludePaths = parsePathRules(opts.exclude, "--exclude");
      const timeoutMs = parseTimeout(opts.timeout) * 1000;
      if (!opts.wait && opts.output) {
        throw new Error("--output needs the result; drop --no-wait, or save it later with s1 deepcrawl status <taskId> -o <file>");
      }

      const task = await deepcrawl(url, options);
      const later = `s1 deepcrawl status ${task.taskId}`;

      if (!opts.wait) {
        if (opts.json) {
          printJson(task);
        } else {
          console.log(`Started deepcrawl task ${task.taskId} (20 credits).`);
          console.log(chalk.dim(`Check it with: ${later}`));
        }
        return;
      }

      const log = (message: string) => {
        if (!opts.json) console.error(chalk.dim(message));
      };
      log(`Started deepcrawl task ${task.taskId} (20 credits); waiting up to ${opts.timeout}s.`);

      const deadline = Date.now() + timeoutMs;
      let status: DeepcrawlStatusResponse;
      let last: string | undefined;
      for (;;) {
        status = await deepcrawlStatus(task.taskId);
        if (status.status && FINISHED.has(status.status)) break;
        if (status.status !== last) {
          log(`Task is ${status.status ?? "pending"}...`);
          last = status.status;
        }
        if (Date.now() + POLL_INTERVAL_MS > deadline) {
          if (opts.json) printJson(status);
          console.error(
            `Task ${task.taskId} is still ${status.status ?? "pending"} after ${opts.timeout}s. ` +
              `It keeps running; check it with: ${later}`
          );
          process.exitCode = 1;
          return;
        }
        await sleep(POLL_INTERVAL_MS);
      }

      await report(status, opts);
    });

  command
    .command("status <taskId>")
    .description("Check a deepcrawl task and show its result once it has finished (free)")
    .option("-o, --output <file>", "save the result: the pages as JSON (json) or the ZIP (zip)")
    .option("--json", "output the raw status JSON")
    .action(async (taskId: string, opts) => {
      await report(await deepcrawlStatus(taskId), opts);
    });
}
