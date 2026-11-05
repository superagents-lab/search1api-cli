# Changelog

## 2.3.0 - 2026-11-05

Adds `s1 deepcrawl <url>` and `deepcrawl()` / `deepcrawlStatus()` SDK helpers for `POST /deepcrawl` and `GET /deepcrawl/status/{taskId}`: crawl a whole site or section in one task and get every page as Markdown. The command starts the task, waits for it (`--timeout`, default 300 s, polling every 2 s), then prints the stats, one line per page, failed URLs and the result URL. Options: `--type sitemap|all`, `-n/--max-pages` (1-1000), repeatable `--include`/`--exclude` path rules (up to 20 each), `--format json|zip` (the CLI defaults to `json`), `-o/--output` (pages JSON or the ZIP), `--no-wait`, `--json`. `s1 deepcrawl status <taskId>` checks a task for free. 20 credits per task, any page count. Options after a subcommand now belong to that subcommand, so a global `-V` must come before it. The agent skill routes "crawl this whole site" requests to it.

## 2.2.0 - 2026-11-03

Adds `s1 maps "<query>"` and a `maps()` SDK helper for `POST /maps`: one Google Maps page of up to 20 places with category, rating, address, phone, website, open state and Maps link. Options: `-n/--max-results`, `--near <lat,lng>`, `--zoom`, `-p/--page` (page 2+ needs `--near`), `--country`, `-l/--lang`, `--json`. 3 credits per completed page. The agent skill routes "where is / nearby / list of businesses" requests to it.

## 2.1.2 - 2026-10-29

When a command fails, `s1` prints a one-line hint under the error pointing to `s1 feedback`, so agents know they can report the problem. Updates the Agentback SDK to 0.3.0. No other behavior changes.

## 2.1.1 - 2026-10-27

`s1 login` adds `utm_source=search1api-cli` to the browser authorization URL, so Search1API can tell sign-ups that start from the CLI. No other behavior changes.

## 2.1.0 - 2026-10-26

Add `s1 feedback` to report wrong results, errors and missing capabilities to the Search1API team, built on the public Agentback SDK. Supports `--category`, `--intent`, `--request-id`, `--model`, `--json` and `-` for stdin. When logged in, the report carries the signed account.

## 2.0.0 - 2026-10-12

Fix repeated browser OAuth login on Node 18 by closing callback connections before the temporary server port is reused. Add PR CI for Node 18 and 22.

Breaking: search/news engine-specific fields move from each result's top level to optional `metadata` (`kind`, `stars`, `language`, `num_comments`, `points`, `story_url`). Read e.g. `result.metadata.stars` instead of `result.stars`. `published_date` stays at the top level. No legacy field aliases.
