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
    .description("Sign in with your browser, on this machine or any other device")
    .option("--no-browser", "print the authorization URL instead of opening a browser")
    .option("--timeout <seconds>", "wait timeout in seconds", "300")
    .option("--port <number>", "callback port (default: random)")
    .option(
      "--device",
      "only use the short-code flow (no local callback or browser)"
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

      // Wait for whichever finishes first: the browser callback on this
      // machine, or approval of the device code from any other device.
      // The device hint prints after the browser line so the output reads in order.
      let markBrowserReady: () => void = () => {};
      const browserReady = new Promise<void>((resolve) => {
        markBrowserReady = resolve;
      });
      const oauth = await firstSuccessful([
        (signal) =>
          loginWithBrowser({
            openBrowser: opts.browser,
            port,
            timeoutMs: timeoutSeconds * 1000,
            signal,
            onReady: ({ authUrl, browserOpened }) => {
              if (browserOpened) {
                console.log(chalk.green("Opened your browser. Complete sign-in to continue."));
              } else {
                console.log("Open this URL in a browser on this machine:");
                console.log(`  ${chalk.cyan(authUrl)}`);
              }
              markBrowserReady();
            },
          })
            .then((result) => result.oauth)
            .finally(() => markBrowserReady()),
        (signal) =>
          loginWithDeviceCode({
            timeoutMs: timeoutSeconds * 1000,
            signal,
            onPrompt: ({ userCode, verificationUri, verificationUriComplete }) => {
              void browserReady.then(() => {
                console.log(
                  `${chalk.yellow("Browser on another device?")} Open this URL there and sign in:`
                );
                console.log(`  ${chalk.cyan(verificationUriComplete ?? verificationUri)}`);
                console.log(`Confirm this code: ${chalk.bold(userCode)}`);
              });
            },
          }),
      ]);
      await finishLogin(oauth);
    });
}

/**
 * Runs the login methods side by side and resolves with the first one that
 * succeeds, cancelling the rest. Rejects only when every method fails.
 */
async function firstSuccessful<T>(
  tasks: Array<(signal: AbortSignal) => Promise<T>>
): Promise<T> {
  const controller = new AbortController();
  const errors: Error[] = [];
  try {
    return await new Promise<T>((resolve, reject) => {
      let pending = tasks.length;
      for (const task of tasks) {
        task(controller.signal).then(resolve, (error: unknown) => {
          errors.push(error instanceof Error ? error : new Error(String(error)));
          pending -= 1;
          if (pending === 0) reject(errors[0]);
        });
      }
    });
  } finally {
    controller.abort();
  }
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
