import chalk from "chalk";
import { Command } from "commander";
import { loginWithBrowser, loginWithDeviceCode, validateCredential } from "../auth.js";
import { getConfigFilePath, saveOAuthConfig, type OAuthConfig } from "../config.js";

function parseInteger(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Authorize with OAuth 2.1 in your browser")
    .option("--no-browser", "print the authorization URL instead of opening a browser")
    .option("--timeout <seconds>", "wait timeout in seconds", "300")
    .option("--port <number>", "callback port (default: random)")
    .option(
      "--device",
      "sign in with a short code from any device (for SSH, servers, and containers)"
    )
    .action(async (opts) => {
      const timeoutSeconds = parseInteger(opts.timeout, "timeout");
      const port = opts.port ? parseInteger(opts.port, "port") : undefined;

      console.log(chalk.bold.blue("Search1API Login"));

      if (opts.device) {
        const oauth = await loginWithDeviceCode({
          openBrowser: false,
          timeoutMs: timeoutSeconds * 1000,
          onPrompt: ({ userCode, verificationUri, verificationUriComplete }) => {
            console.log("Open this URL on any device and sign in:");
            console.log(`  ${chalk.cyan(verificationUriComplete ?? verificationUri)}`);
            console.log(`Confirm this code: ${chalk.bold(userCode)}`);
            if (verificationUriComplete) {
              console.log(chalk.dim(`Or go to ${verificationUri} and enter the code.`));
            }
            console.log(chalk.dim("Waiting for approval..."));
          },
        });
        await finishLogin(oauth);
        return;
      }

      if (isRemoteSession()) {
        console.log(
          chalk.yellow(
            "Looks like an SSH session. If the browser is on another device, use `s1 login --device`."
          )
        );
      }

      const result = await loginWithBrowser({
        openBrowser: opts.browser,
        port,
        timeoutMs: timeoutSeconds * 1000,
        onReady: ({ authUrl, callbackUrl, browserOpened }) => {
          console.log(`${chalk.dim("Callback:")} ${callbackUrl}`);
          if (browserOpened) {
            console.log(chalk.green("Opened your browser. Complete sign-in to continue."));
          } else {
            console.log(chalk.yellow("Open this URL to continue sign-in:"));
            console.log(authUrl);
          }
        },
      });

      await finishLogin(result.oauth);
    });
}

function isRemoteSession(): boolean {
  return Boolean(
    process.env.SSH_CONNECTION || process.env.SSH_CLIENT || process.env.SSH_TTY
  );
}

async function finishLogin(oauth: OAuthConfig): Promise<void> {
  console.log(chalk.dim("Validating OAuth access token..."));
  await validateCredential(oauth.accessToken);
  saveOAuthConfig(oauth);

  console.log(chalk.green("Authorization complete. OAuth tokens saved."));
  console.log(`${chalk.dim("Config file:")} ${getConfigFilePath()}`);

  if (process.env.SEARCH1API_KEY) {
    console.log(
      chalk.yellow(
        "Note: SEARCH1API_KEY is set in your environment and will override the saved key."
      )
    );
  }
}
