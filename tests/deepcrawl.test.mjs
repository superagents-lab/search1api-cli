import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cliPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));

const TASK_ID = "0b6e1d2c-task";
const PAGES = [
  { url: "https://hono.dev/docs/", title: "Hono", content: "# Hono\n\nUltrafast web framework." },
  { url: "https://hono.dev/docs/api/routing", title: "Routing", content: "# Routing\n\napp.get()" },
];
const COMPLETED_JSON = {
  taskId: TASK_ID,
  status: "completed",
  message: "Successfully crawled 2 URLs and created JSON.",
  format: "json",
  stats: { discovered: 120, matched: 40, skipped: 37, crawled: 2, failed: 1 },
  failed: [{ url: "https://hono.dev/docs/broken", error: "404 Not Found" }],
  resultUrl: "https://files.example.test/result.json",
  pages: PAGES,
};

/**
 * A stand-in Search1API: POST /deepcrawl starts a task, each status call
 * returns the next scripted [httpStatus, body] (or a function of the base URL
 * that returns one), and /files/site.zip serves a download.
 */
async function startApi(statuses) {
  const calls = [];
  const queue = [...statuses];
  let base;
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      calls.push({
        method: req.method,
        url: req.url,
        auth: req.headers.authorization,
        body: raw ? JSON.parse(raw) : undefined,
      });
      const reply = (code, body) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (req.method === "POST" && req.url === "/deepcrawl") {
        return reply(202, { taskId: TASK_ID, status: "queued" });
      }
      if (req.method === "GET" && req.url.startsWith("/deepcrawl/status/")) {
        const next = queue.length > 1 ? queue.shift() : queue[0];
        return reply(...(typeof next === "function" ? next(base) : next));
      }
      if (req.method === "GET" && req.url === "/files/site.zip") {
        res.writeHead(200, { "Content-Type": "application/zip" });
        return res.end(Buffer.from("PK-fake-zip"));
      }
      reply(404, { error: "Not Found" });
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  return { base, calls, close: () => new Promise((resolve) => server.close(resolve)) };
}

function runCli(base, ...args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: {
        ...process.env,
        NO_UPDATE_NOTIFIER: "1",
        FORCE_COLOR: "0",
        SEARCH1API_KEY: "test-key",
        SEARCH1API_API_BASE: base,
        SEARCH1API_CONFIG_DIR: mkdtempSync(join(tmpdir(), "s1-config-")),
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("deepcrawl sends the options, waits, and lists the pages", async () => {
  const api = await startApi([[200, COMPLETED_JSON]]);
  try {
    const result = await runCli(
      api.base,
      "deepcrawl", "https://hono.dev/docs/",
      "--type", "all", "-n", "20",
      "--include", "/docs", "--include", "/blog/*", "--exclude", "/docs/changelog"
    );
    assert.equal(result.status, 0, result.stderr);

    const [start, poll] = api.calls;
    assert.equal(start.method, "POST");
    assert.equal(start.auth, "Bearer test-key");
    assert.deepEqual(start.body, {
      url: "https://hono.dev/docs/",
      type: "all",
      max_pages: 20,
      include_paths: ["/docs", "/blog/*"],
      exclude_paths: ["/docs/changelog"],
      format: "json",
    });
    assert.equal(poll.method, "GET");
    assert.equal(poll.url, `/deepcrawl/status/${TASK_ID}`);

    assert.match(result.stderr, /Started deepcrawl task 0b6e1d2c-task \(20 credits\)/);
    assert.match(result.stdout, /^Successfully crawled 2 URLs and created JSON\./);
    assert.match(result.stdout, /120 discovered · 40 matched · 37 over max-pages · 2 crawled · 1 failed/);
    assert.match(result.stdout, /1\. Hono https:\/\/hono\.dev\/docs\/ · 32 chars/);
    assert.match(result.stdout, /2\. Routing https:\/\/hono\.dev\/docs\/api\/routing/);
    assert.match(result.stdout, /https:\/\/hono\.dev\/docs\/broken — 404 Not Found/);
    assert.match(result.stdout, /Result: https:\/\/files\.example\.test\/result\.json/);
    assert.match(result.stdout, /s1 deepcrawl status 0b6e1d2c-task -o pages\.json/);
  } finally {
    await api.close();
  }
});

test("deepcrawl polls until the task completes and --json prints the status", async () => {
  const api = await startApi([
    [200, { taskId: TASK_ID, status: "processing", message: "Workflow is currently running." }],
    [200, COMPLETED_JSON],
  ]);
  try {
    const result = await runCli(api.base, "deepcrawl", "https://hono.dev/docs/", "--json");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(api.calls.filter((call) => call.method === "GET").length, 2);
    assert.deepEqual(JSON.parse(result.stdout), COMPLETED_JSON);
    assert.deepEqual(api.calls[0].body, { url: "https://hono.dev/docs/", type: "sitemap", format: "json" });
  } finally {
    await api.close();
  }
});

test("deepcrawl -o writes the pages and failures as JSON", async () => {
  const api = await startApi([[200, COMPLETED_JSON]]);
  const file = join(mkdtempSync(join(tmpdir(), "s1-deepcrawl-")), "pages.json");
  try {
    const result = await runCli(api.base, "deepcrawl", "https://hono.dev/docs/", "-o", file);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), {
      pages: PAGES,
      failed: COMPLETED_JSON.failed,
    });
    assert.match(result.stdout, /Saved 2 pages to .*pages\.json/);
  } finally {
    await api.close();
  }
});

test("deepcrawl status -o downloads the ZIP", async () => {
  const api = await startApi([
    (base) => [200, {
      taskId: TASK_ID,
      status: "completed",
      message: "Successfully crawled 2 URLs and created ZIP.",
      format: "zip",
      stats: { discovered: 2, matched: 2, skipped: 0, crawled: 2, failed: 0 },
      failed: [],
      zipUrl: `${base}/files/site.zip`,
    }],
  ]);
  const file = join(mkdtempSync(join(tmpdir(), "s1-deepcrawl-")), "site.zip");
  try {
    const result = await runCli(api.base, "deepcrawl", "status", TASK_ID, "-o", file);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(file, "utf8"), "PK-fake-zip");
    assert.match(result.stdout, /ZIP: http:\/\/127\.0\.0\.1:\d+\/files\/site\.zip/);
    assert.match(result.stdout, /Saved the ZIP to .*site\.zip/);
    assert.equal(api.calls.some((call) => call.method === "POST"), false);
  } finally {
    await api.close();
  }
});

test("deepcrawl status passes --json to the subcommand", async () => {
  const processing = { taskId: TASK_ID, status: "processing", message: "Workflow is currently running." };
  const api = await startApi([[200, processing]]);
  try {
    const json = await runCli(api.base, "deepcrawl", "status", TASK_ID, "--json");
    assert.equal(json.status, 0, json.stderr);
    assert.deepEqual(JSON.parse(json.stdout), processing);

    const human = await runCli(api.base, "deepcrawl", "status", TASK_ID);
    assert.equal(human.status, 0, human.stderr);
    assert.match(human.stdout, /Task 0b6e1d2c-task is processing\. Workflow is currently running\./);
  } finally {
    await api.close();
  }
});

test("deepcrawl --no-wait prints the task id without polling", async () => {
  const api = await startApi([]);
  try {
    const result = await runCli(api.base, "deepcrawl", "https://example.com", "--no-wait");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Started deepcrawl task 0b6e1d2c-task \(20 credits\)\./);
    assert.match(result.stdout, /s1 deepcrawl status 0b6e1d2c-task/);
    assert.deepEqual(api.calls.map((call) => call.method), ["POST"]);

    const json = await runCli(api.base, "deepcrawl", "https://example.com", "--no-wait", "--json");
    assert.deepEqual(JSON.parse(json.stdout), { taskId: TASK_ID, status: "queued" });
  } finally {
    await api.close();
  }
});

test("deepcrawl reports a failed task and exits non-zero", async () => {
  const api = await startApi([
    [500, { taskId: TASK_ID, status: "failed", message: "Workflow errored.", error: "sitemap fetch timed out" }],
  ]);
  try {
    const result = await runCli(api.base, "deepcrawl", "https://example.com");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Deepcrawl task 0b6e1d2c-task failed: sitemap fetch timed out/);
  } finally {
    await api.close();
  }
});

test("deepcrawl stops waiting at --timeout and says how to check later", async () => {
  const api = await startApi([[200, { taskId: TASK_ID, status: "processing" }]]);
  try {
    const result = await runCli(api.base, "deepcrawl", "https://example.com", "--timeout", "1");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /still processing after 1s\. It keeps running; check it with: s1 deepcrawl status 0b6e1d2c-task/);
  } finally {
    await api.close();
  }
});

test("deepcrawl shows a completed task that found nothing", async () => {
  const empty = {
    taskId: TASK_ID,
    status: "completed",
    message: "None of the 12 discovered URLs matched the path rules.",
    format: "json",
    stats: { discovered: 12, matched: 0, skipped: 0, crawled: 0, failed: 0 },
  };
  const api = await startApi([[200, empty]]);
  try {
    const result = await runCli(api.base, "deepcrawl", "https://example.com", "--include", "/nothing");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /None of the 12 discovered URLs matched the path rules\./);
    assert.doesNotMatch(result.stdout, /Result:|ZIP:/);
  } finally {
    await api.close();
  }
});

test("deepcrawl rejects bad options before starting a task", async () => {
  const api = await startApi([]);
  const tooMany = Array.from({ length: 21 }, (_, i) => ["--exclude", `/p${i}`]).flat();
  const cases = [
    [["ftp://example.com"], /must start with http/],
    [["https://example.com", "-n", "0"], /--max-pages must be an integer between 1 and 1000/],
    [["https://example.com", "-n", "1001"], /--max-pages must be an integer between 1 and 1000/],
    [["https://example.com", "-n", "2.5"], /--max-pages must be an integer/],
    [["https://example.com", "--type", "links"], /--type must be one of: sitemap, all/],
    [["https://example.com", "--format", "csv"], /--format must be one of: json, zip/],
    [["https://example.com", ...tooMany], /--exclude accepts at most 20 rules/],
    [["https://example.com", "--include", "/" + "a".repeat(200)], /at most 200 characters/],
    [["https://example.com", "--include", " "], /non-empty path/],
    [["https://example.com", "--timeout", "0"], /--timeout must be a positive number/],
    [["https://example.com", "--no-wait", "-o", "x.json"], /--output needs the result/],
  ];
  try {
    for (const [args, message] of cases) {
      const result = await runCli(api.base, "deepcrawl", ...args);
      assert.equal(result.status, 1, `expected failure for ${args.join(" ")}`);
      assert.match(result.stderr, message);
    }
    assert.equal(api.calls.length, 0);
  } finally {
    await api.close();
  }
});
