# Changelog

## 2.1.0 - 2026-10-26

Add `s1 feedback` to report wrong results, errors and missing capabilities to the Search1API team, built on the public Agentback SDK. Supports `--category`, `--intent`, `--request-id`, `--model`, `--json` and `-` for stdin. When logged in, the report carries the signed account.

## 2.0.0 - 2026-10-12

Fix repeated browser OAuth login on Node 18 by closing callback connections before the temporary server port is reused. Add PR CI for Node 18 and 22.

Breaking: search/news engine-specific fields move from each result's top level to optional `metadata` (`kind`, `stars`, `language`, `num_comments`, `points`, `story_url`). Read e.g. `result.metadata.stars` instead of `result.stars`. `published_date` stays at the top level. No legacy field aliases.
