import { Command } from "commander";
import { Agentback, type Identity } from "agentback";
import { runFeedbackCommand } from "agentback/cli";
import { fetchWithAuth } from "../auth.js";
import { AGENTBACK_PROJECT_KEY, API_BASE } from "../config.js";

// Signed so Agentback can trust which Search1API user sent the report. Without
// a working credential the report is sent without an account.
async function identify(): Promise<Identity | undefined> {
  try {
    const res = await fetchWithAuth(`${API_BASE}/feedback/identity`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as Partial<Identity>;
    return typeof body.account === "string" &&
      typeof body.signature === "string"
      ? { account: body.account, signature: body.signature }
      : undefined;
  } catch {
    return undefined;
  }
}

export function registerFeedbackCommand(program: Command): void {
  program
    .command("feedback")
    .description("Report a problem with Search1API to its developers")
    // runFeedbackCommand parses its own options and prints its own help.
    .helpOption(false)
    .allowUnknownOption()
    .argument("[args...]")
    .action(async (args: string[]) => {
      process.exitCode = await runFeedbackCommand(
        new Agentback({ projectKey: AGENTBACK_PROJECT_KEY }),
        args,
        { program: "s1", identify }
      );
    });
}
