import { Command } from "commander";
import { maps, type MapsOptions } from "../sdk.js";
import { printMapsResults, printJson } from "../output.js";

function parseNumber(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number`);
  }
  return parsed;
}

/** `--near 40.7455,-74.0083` → `{ latitude, longitude }`. */
function parseNear(value: string): { latitude: number; longitude: number } {
  const parts = value.split(",").map((part) => part.trim());
  if (parts.length !== 2) {
    throw new Error('--near must be "latitude,longitude", e.g. 40.7455,-74.0083');
  }
  return {
    latitude: parseNumber(parts[0], "latitude"),
    longitude: parseNumber(parts[1], "longitude"),
  };
}

export function registerMapsCommand(program: Command): void {
  program
    .command("maps <query>")
    .description("Find businesses and places on Google Maps (3 credits per page of up to 20)")
    .option("-n, --max-results <number>", "places to return from the page (1-20)")
    .option("--near <lat,lng>", "search around this point, e.g. 40.7455,-74.0083")
    .option("--zoom <number>", "map zoom with --near (3-30, default 14)")
    .option("-p, --page <number>", "Google Maps page (1-6); page 2+ needs --near")
    .option("--country <code>", "two-letter country code (default us)")
    .option("-l, --lang <language>", "result language, e.g. en, de, zh-CN (default en)")
    .option("--json", "output raw JSON")
    .action(async (query: string, opts) => {
      const options: MapsOptions = {};
      if (opts.maxResults) options.maxResults = parseInt(opts.maxResults);
      if (opts.page) options.page = parseInt(opts.page);
      if (opts.country) options.country = opts.country;
      if (opts.lang) options.language = opts.lang;
      if (opts.near) {
        options.location = parseNear(opts.near);
        if (opts.zoom) options.location.zoom = parseNumber(opts.zoom, "zoom");
      } else if (opts.zoom) {
        throw new Error("--zoom needs --near");
      }

      const data = await maps(query, options);

      if (opts.json) {
        printJson(data);
      } else {
        printMapsResults(data.results);
      }
    });
}
