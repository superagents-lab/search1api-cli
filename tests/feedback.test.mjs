import assert from "node:assert/strict";
import test from "node:test";
import { Command } from "commander";

process.env.SEARCH1API_KEY = "test-key";
process.env.SEARCH1API_API_BASE = "https://api.example.test";

const { registerFeedbackCommand } = await import("../dist/commands/feedback.js");

async function runFeedback(args, identityResponse) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalWrite = process.stdout.write;
  let stdout = "";
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "https://api.example.test/feedback/identity") return identityResponse();
    return Response.json({ id: "fb_1", status: "new" }, { status: 201 });
  };
  process.stdout.write = (text) => {
    stdout += text;
    return true;
  };
  try {
    const program = new Command("s1").exitOverride();
    registerFeedbackCommand(program);
    await program.parseAsync(["feedback", ...args], { from: "user" });
    return { calls, stdout, exitCode: process.exitCode };
  } finally {
    globalThis.fetch = originalFetch;
    process.stdout.write = originalWrite;
    process.exitCode = undefined;
  }
}

test("feedback is sent under the signed-in Search1API account", async () => {
  const { calls, stdout, exitCode } = await runFeedback(
    ["-c", "bug", "--intent", "find docs", "bingcn", "returned", "nothing"],
    () => Response.json({ account: "user_123", signature: "a".repeat(64) })
  );

  assert.equal(exitCode, 0);
  assert.match(stdout, /Feedback sent \(fb_1\)/);
  assert.equal(new Headers(calls[0].init.headers).get("authorization"), "Bearer test-key");
  assert.match(calls[1].url, /^https:\/\/agentback\.app\/f\/af_[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    message: "bingcn returned nothing",
    intent: "find docs",
    category: "bug",
    source: "cli",
    account: "user_123",
    account_signature: "a".repeat(64),
  });
});

test("feedback is still sent when the account lookup fails", async () => {
  const { calls, exitCode } = await runFeedback(["--json", "it broke"], () =>
    Response.json({ error: "Unauthorized" }, { status: 401 })
  );

  assert.equal(exitCode, 0);
  const body = JSON.parse(calls.at(-1).init.body);
  assert.equal(body.account, undefined);
  assert.equal(body.source, "cli");
});
