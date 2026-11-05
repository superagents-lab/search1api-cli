import assert from "node:assert/strict";
import test from "node:test";

process.env.SEARCH1API_KEY = "test-key";
process.env.SEARCH1API_API_BASE = "https://api.example.test";

const { ask, crawl, deepcrawl, deepcrawlStatus, maps, news, search, sitemap, trending } = await import(
  "../dist/sdk.js"
);

async function captureRequest(run, response, status = 200) {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (input, init) => {
    captured = { input: String(input), init };
    return new Response(JSON.stringify(response), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const result = await run();
    return { captured, result };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("search maps SDK options to the Search1API request", async () => {
  const response = { results: [{ title: "A", link: "https://a.test", snippet: "B" }] };
  const { captured, result } = await captureRequest(
    () =>
      search("open source agents", {
        maxResults: 7,
        searchService: "github",
        crawlResults: 2,
        includeSites: ["github.com"],
        excludeSites: ["gist.github.com"],
        timeRange: "month",
      }),
    response
  );

  assert.deepEqual(result, response);
  assert.equal(captured.input, "https://api.example.test/search");
  assert.equal(new Headers(captured.init.headers).get("Authorization"), "Bearer test-key");
  assert.deepEqual(JSON.parse(captured.init.body), {
    query: "open source agents",
    max_results: 7,
    search_service: "github",
    crawl_results: 2,
    include_sites: ["github.com"],
    exclude_sites: ["gist.github.com"],
    time_range: "month",
  });
});

test("SDK helpers use stable endpoints and defaults", async () => {
  const cases = [
    [() => news("agents"), "/news", { query: "agents", max_results: 10, search_service: "bing", crawl_results: 0 }],
    [() => crawl("https://example.com"), "/crawl", { url: "https://example.com" }],
    [() => sitemap("https://example.com"), "/sitemap", { url: "https://example.com" }],
    [() => trending("github", { maxResults: 5 }), "/trending", { search_service: "github", max_results: 5 }],
  ];

  for (const [run, path, body] of cases) {
    const { captured } = await captureRequest(run, {});
    assert.equal(captured.input, `https://api.example.test${path}`);
    assert.deepEqual(JSON.parse(captured.init.body), body);
  }
});

test("search and news preserve nested metadata and top-level dates", async () => {
  const response = {
    results: [{
      title: "Thread",
      link: "https://example.com/thread",
      snippet: "Discussion",
      published_date: "2026-10-12",
      metadata: { num_comments: 0 },
    }],
  };
  for (const run of [() => search("q"), () => news("q")]) {
    const { result } = await captureRequest(run, response);
    assert.deepEqual(result, response);
    assert.equal(result.results[0].metadata.num_comments, 0);
    assert.equal("num_comments" in result.results[0], false);
  }
});

test("an explicit SDK API key overrides shared CLI credentials", async () => {
  const { captured } = await captureRequest(
    () => crawl("https://example.com", { apiKey: "plugin-key" }),
    {}
  );
  assert.equal(
    new Headers(captured.init.headers).get("Authorization"),
    "Bearer plugin-key"
  );
});

test("search sends pagination and accepts the new engines", async () => {
  for (const searchService of ["bingcn", "yandex", "grokipedia"]) {
    const { captured } = await captureRequest(
      () => search("kubernetes", { searchService, page: 2, timeRange: "week" }),
      { results: [] }
    );
    assert.deepEqual(JSON.parse(captured.init.body), {
      query: "kubernetes",
      max_results: 10,
      search_service: searchService,
      crawl_results: 0,
      page: 2,
      time_range: "week",
    });
  }
});

test("ask sends only the query to /ask", async () => {
  const response = {
    query: "recent papers on speculative decoding",
    intent: { search_query: "speculative decoding", sources: ["arxiv"], time_range: null },
    results: [],
    errors: [],
  };
  const { captured, result } = await captureRequest(
    () => ask("recent papers on speculative decoding"),
    response
  );
  assert.deepEqual(result, response);
  assert.equal(captured.input, "https://api.example.test/ask");
  assert.deepEqual(JSON.parse(captured.init.body), {
    query: "recent papers on speculative decoding",
  });
});

test("maps sends only the options that were set to /maps", async () => {
  const response = { searchParameters: { query: "coffee shops" }, results: [] };
  const { captured, result } = await captureRequest(
    () =>
      maps("coffee shops", {
        location: { latitude: 40.7455, longitude: -74.0083, zoom: 15 },
        page: 2,
        maxResults: 5,
        country: "us",
      }),
    response
  );
  assert.deepEqual(result, response);
  assert.equal(captured.input, "https://api.example.test/maps");
  assert.deepEqual(JSON.parse(captured.init.body), {
    query: "coffee shops",
    country: "us",
    location: { latitude: 40.7455, longitude: -74.0083, zoom: 15 },
    page: 2,
    max_results: 5,
  });

  const minimal = await captureRequest(() => maps("ramen in Shibuya"), response);
  assert.deepEqual(JSON.parse(minimal.captured.init.body), { query: "ramen in Shibuya" });
});

test("deepcrawl sends only the options that were set to /deepcrawl", async () => {
  const response = { taskId: "task-1", status: "queued" };
  const { captured, result } = await captureRequest(
    () =>
      deepcrawl("https://hono.dev/docs/", {
        type: "all",
        maxPages: 20,
        includePaths: ["/docs"],
        excludePaths: ["/docs/changelog"],
        format: "json",
      }),
    response,
    202
  );
  assert.deepEqual(result, response);
  assert.equal(captured.input, "https://api.example.test/deepcrawl");
  assert.equal(captured.init.method, "POST");
  assert.deepEqual(JSON.parse(captured.init.body), {
    url: "https://hono.dev/docs/",
    type: "all",
    max_pages: 20,
    include_paths: ["/docs"],
    exclude_paths: ["/docs/changelog"],
    format: "json",
  });

  const minimal = await captureRequest(
    () => deepcrawl("https://example.com", { includePaths: [] }),
    response,
    202
  );
  assert.deepEqual(JSON.parse(minimal.captured.init.body), { url: "https://example.com" });
});

test("deepcrawlStatus GETs the task and returns a failed task instead of throwing", async () => {
  const completed = { taskId: "a/b", status: "completed", format: "json", pages: [] };
  const { captured, result } = await captureRequest(() => deepcrawlStatus("a/b"), completed);
  assert.deepEqual(result, completed);
  assert.equal(captured.input, "https://api.example.test/deepcrawl/status/a%2Fb");
  assert.equal(captured.init.method, "GET");
  assert.equal(captured.init.body, undefined);
  assert.equal(new Headers(captured.init.headers).get("Authorization"), "Bearer test-key");

  const failed = { taskId: "t", status: "failed", message: "Workflow errored.", error: "boom" };
  const failure = await captureRequest(() => deepcrawlStatus("t"), failed, 500);
  assert.deepEqual(failure.result, failed);

  await assert.rejects(
    captureRequest(
      () => deepcrawlStatus("missing"),
      { taskId: "missing", status: "not_found", message: "Task not found: missing" },
      404
    ),
    /API error \(404\): .*Task not found: missing/
  );
  await assert.rejects(
    captureRequest(() => deepcrawlStatus("t"), { error: "Upstream failed" }, 502),
    /API error \(502\)/
  );
});
