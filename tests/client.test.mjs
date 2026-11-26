import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import test from "node:test";
import { fileURLToPath } from "node:url";

const { clientHeaders, detectAgent, setClientVersion } = await import("../dist/client.js");
const CLI = fileURLToPath(new URL("../dist/index.js", import.meta.url));

test("library use sends no client headers", () => {
  assert.deepEqual(clientHeaders({ CLAUDECODE: "1" }), {});
});

test("detects the agent running the CLI", () => {
  assert.equal(detectAgent({ AI_AGENT: "claude-code_2-1-332_agent", CODEX_SANDBOX: "seatbelt" }), "claude-code_2-1-332_agent");
  assert.equal(detectAgent({ CLAUDECODE: "1" }), "claude-code");
  assert.equal(detectAgent({ CODEX_SANDBOX: "seatbelt" }), "codex");
  assert.equal(detectAgent({ GEMINI_CLI: "1" }), "gemini-cli");
  assert.equal(detectAgent({ CURSOR_AGENT: "1", CURSOR_TRACE_ID: "x" }), "cursor");
  assert.equal(detectAgent({}), undefined);
  assert.equal(detectAgent({ AI_AGENT: "x".repeat(300) }).length, 100);
});

test("names the CLI version and the agent once the entry point sets it", () => {
  setClientVersion("2.4.0");
  assert.deepEqual(clientHeaders({ CLAUDECODE: "1" }), {
    "X-Search1API-Client": "cli/2.4.0",
    "X-Search1API-Client-App": "claude-code",
  });
  assert.deepEqual(clientHeaders({}), { "X-Search1API-Client": "cli/2.4.0" });
});

test("s1 search sends the client headers to the API", async (context) => {
  const seen = [];
  const server = createServer((req, res) => {
    seen.push(req.headers);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ results: [] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const { port } = server.address();
  const env = { ...process.env, SEARCH1API_KEY: "test-key", SEARCH1API_API_BASE: `http://127.0.0.1:${port}`, NO_UPDATE_NOTIFIER: "1" };
  for (const name of Object.keys(env)) {
    if (/^(AI_AGENT|CLAUDECODE|CURSOR_|GEMINI_CLI|CODEX_|OPENCODE|AUGMENT_AGENT)/.test(name)) delete env[name];
  }
  env.GEMINI_CLI = "1";
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, "search", "agents", "--json"], { env, stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", resolve);
  });
  assert.equal(seen.length, 1);
  assert.match(seen[0]["x-search1api-client"], /^cli\/\d+\.\d+\.\d+/);
  assert.equal(seen[0]["x-search1api-client-app"], "gemini-cli");
});
