import { Command } from "commander";
import { ask } from "../sdk.js";
import { printAskResults, printJson } from "../output.js";

export function registerAskCommand(program: Command): void {
  program
    .command("ask <query>")
    .description("Describe what you need; Search1API picks the engines (5 credits)")
    .option("--json", "output raw JSON")
    .action(async (query: string, opts) => {
      const data = await ask(query);

      if (opts.json) {
        printJson(data);
      } else {
        printAskResults(data);
      }
    });
}
