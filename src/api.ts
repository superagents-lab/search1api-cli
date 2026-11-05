import { fetchWithAuth } from "./auth.js";
import { API_BASE } from "./config.js";

export interface RequestOptions {
  apiKey?: string;
  signal?: AbortSignal;
}

/** Sends an authenticated request and returns the response, whatever its status. */
export async function send(
  path: string,
  init: RequestInit,
  options: RequestOptions = {}
): Promise<Response> {
  const url = `${API_BASE}${path}`;
  const withSignal: RequestInit = { ...init, signal: options.signal };
  return options.apiKey
    ? fetch(url, {
        ...withSignal,
        headers: {
          ...Object.fromEntries(new Headers(init.headers).entries()),
          Authorization: `Bearer ${options.apiKey}`,
        },
      })
    : fetchWithAuth(url, withSignal);
}

export async function request<T>(
  path: string,
  body: unknown,
  options: RequestOptions = {}
): Promise<T> {
  const res = await send(
    path,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    options
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}
