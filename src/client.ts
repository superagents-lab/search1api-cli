/**
 * Names the CLI, and the coding agent running it, to the Search1API gateway:
 * `X-Search1API-Client: cli/<version>` and `X-Search1API-Client-App`. The
 * gateway reduces the agent name to a fixed list for its request analytics.
 * Analytics only: it never bills or authorizes on it.
 *
 * Only the `s1` entry point turns this on: code that imports the package as
 * a library is not the CLI and sends no client headers.
 */
let version: string | undefined;

/** Called once by the CLI entry point, which knows the package version. */
export function setClientVersion(value: string): void {
  version = value;
}

// Variables agents set in the shells they run commands in. AI_AGENT is the
// shared convention (e.g. "claude-code_2-1-332_agent"); the rest are each
// agent's own marker, checked in order.
const AGENT_MARKERS: ReadonlyArray<readonly [string, string]> = [
  ["CLAUDECODE", "claude-code"],
  ["CURSOR_AGENT", "cursor"],
  ["GEMINI_CLI", "gemini-cli"],
  ["CODEX_SANDBOX", "codex"],
  ["CODEX_THREAD_ID", "codex"],
  ["OPENCODE", "opencode"],
  ["OPENCODE_CLIENT", "opencode"],
  ["AUGMENT_AGENT", "augment"],
  // Any Cursor terminal, agent or not; least specific, so last.
  ["CURSOR_TRACE_ID", "cursor"],
];

export function detectAgent(
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const declared = env.AI_AGENT?.replace(/[^\x20-\x7e]/g, "").trim();
  if (declared) return declared.slice(0, 100);
  for (const [name, agent] of AGENT_MARKERS) {
    if (env[name]) return agent;
  }
  return undefined;
}

export function clientHeaders(
  env: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  if (version === undefined) return {};
  const agent = detectAgent(env);
  return {
    "X-Search1API-Client": `cli/${version}`,
    ...(agent ? { "X-Search1API-Client-App": agent } : {}),
  };
}
