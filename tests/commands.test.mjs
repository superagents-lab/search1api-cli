import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cliPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));

function runCli(...args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    env: { ...process.env, NO_UPDATE_NOTIFIER: "1" },
  });
}

function assertRetiredCommandsAreAbsent(output) {
  assert.doesNotMatch(output, /\breason(?:ing)?\b/i);
  assert.doesNotMatch(output, /\bmodels?\b/i);
}

test("does not expose retired reasoning or model commands", () => {
  const help = runCli("--help");
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /search \[options\] <query>/);
  assertRetiredCommandsAreAbsent(help.stdout);

  const welcome = runCli();
  assert.equal(welcome.status, 0, welcome.stderr);
  assert.match(welcome.stdout, /Quick start:/);
  assertRetiredCommandsAreAbsent(welcome.stdout);
});

test("exposes ask and the new search options", () => {
  const help = runCli("--help");
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /ask \[options\] <query>/);

  const searchHelp = runCli("search", "--help");
  assert.equal(searchHelp.status, 0, searchHelp.stderr);
  assert.match(searchHelp.stdout, /--page <number>/);
  assert.match(searchHelp.stdout, /grokipedia/);
  assert.match(searchHelp.stdout, /day, week, month, year/);
});

test("points agents at s1 feedback when a command fails", () => {
  const configDir = mkdtempSync(join(tmpdir(), "s1-config-"));
  const { SEARCH1API_KEY: _key, ...env } = process.env;
  const result = spawnSync(process.execPath, [cliPath, "search", "hello"], {
    encoding: "utf8",
    env: { ...env, NO_UPDATE_NOTIFIER: "1", SEARCH1API_CONFIG_DIR: configDir },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^Error: /);
  assert.match(result.stderr, /s1 feedback "<what happened>"/);
});
