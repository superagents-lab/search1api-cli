import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

const state = { script: [] };

function startMockAuthServer() {
  const calls = { device: [], token: [] };
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const base = `http://127.0.0.1:${server.address().port}`;
    const send = (status, json) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    };
    if (req.url === "/.well-known/oauth-protected-resource") {
      return send(200, { resource: base, authorization_servers: [base] });
    }
    if (req.url === "/.well-known/oauth-authorization-server") {
      return send(200, {
        issuer: base,
        authorization_endpoint: `${base}/oauth/authorize`,
        token_endpoint: `${base}/oauth/token`,
        device_authorization_endpoint: `${base}/oauth/device_authorization`,
      });
    }
    if (req.url === "/oauth/device_authorization") {
      calls.device.push(new URLSearchParams(body));
      return send(200, {
        device_code: "secret-device-code",
        user_code: "BCDF-GHJK",
        verification_uri: `${base}/device`,
        verification_uri_complete: `${base}/device?user_code=BCDF-GHJK`,
        expires_in: 600,
        interval: 1,
      });
    }
    if (req.url === "/oauth/token") {
      calls.token.push(new URLSearchParams(body));
      const script = state.script;
      const [status, json] = script[Math.min(calls.token.length - 1, script.length - 1)];
      return send(status, json);
    }
    send(404, {});
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ server, calls }))
  );
}

// config.js reads the metadata URL once, so all tests share one mock server.
const { server, calls } = await startMockAuthServer();
process.env.SEARCH1API_OAUTH_RESOURCE_METADATA = `http://127.0.0.1:${server.address().port}/.well-known/oauth-protected-resource`;
const { loginWithDeviceCode } = await import("../dist/auth.js");
test.after(() => server.close());
test.beforeEach(() => {
  calls.device.length = 0;
  calls.token.length = 0;
});

test("device login polls through pending and slow_down, then returns tokens", async () => {
  state.script = [
    [400, { error: "authorization_pending" }],
    [400, { error: "slow_down" }],
    [200, { access_token: "at", refresh_token: "rt", expires_in: 3600, token_type: "Bearer" }],
  ];
  {
    const sleeps = [];
    let prompt;
    const oauth = await loginWithDeviceCode({
      clientId: "public-client",
      sleep: async (ms) => { sleeps.push(ms); },
      onPrompt: (p) => { prompt = p; },
    });
    assert.equal(prompt.userCode, "BCDF-GHJK");
    assert.equal(oauth.accessToken, "at");
    assert.equal(oauth.refreshToken, "rt");
    assert.equal(oauth.clientId, "public-client");
    assert.deepEqual(sleeps, [1000, 1000, 6000]);
    assert.equal(calls.device[0].get("client_id"), "public-client");
    assert.match(calls.device[0].get("scope"), /offline_access/);
    const tokenCall = calls.token[0];
    assert.equal(tokenCall.get("grant_type"), "urn:ietf:params:oauth:grant-type:device_code");
    assert.equal(tokenCall.get("device_code"), "secret-device-code");
  }
});

test("device login stops when the user denies access", async () => {
  state.script = [[400, { error: "access_denied" }]];
  {
    await assert.rejects(
      loginWithDeviceCode({ clientId: "public-client", sleep: async () => {} }),
      /denied/
    );
  }
});

test("device login explains when no client id is configured", async () => {
  state.script = [];
  {
    await assert.rejects(loginWithDeviceCode({ clientId: "" }), /not configured/);
  }
});
