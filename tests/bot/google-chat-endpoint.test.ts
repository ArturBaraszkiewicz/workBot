import type { APIRoute } from "astro";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GoogleChatCallbackDependencies } from "../../src/lib/bot/google-chat-contract";

vi.mock("astro:env/server", () => ({ GOOGLE_CHAT_AUDIENCE: undefined }));

import { ALL, POST, createGoogleChatApiRoute } from "../../src/pages/api/bot/google-chat";

const CALLBACK_URL = "https://workbot.example.com/api/bot/google-chat";

function routeContext(request: Request): Parameters<APIRoute>[0] {
  return { request } as Parameters<APIRoute>[0];
}

function callbackRequest(method = "POST"): Request {
  return new Request(CALLBACK_URL, {
    method,
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json",
    },
    body: method === "GET" || method === "HEAD" ? null : JSON.stringify({ type: "MESSAGE" }),
  });
}

function validDependencies(): GoogleChatCallbackDependencies {
  return {
    verifier: { verify: vi.fn().mockResolvedValue({ kind: "valid" }) },
    now: vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(105),
    createRequestId: () => "request-from-route",
    log: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Google Chat Astro endpoint", () => {
  it("exports uppercase POST and ALL handlers backed by the same route", () => {
    expect(POST).toBe(ALL);
  });

  it("delegates POST to the pure callback contract", async () => {
    const route = createGoogleChatApiRoute(validDependencies());

    const response = await route(routeContext(callbackRequest()));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ text: "workBot odebrał zdarzenie Google Chat." });
  });

  it("returns no-store 405 through ALL for unsupported methods", async () => {
    const info = vi.spyOn(globalThis.console, "info").mockImplementation(() => undefined);

    const response = await ALL(routeContext(callbackRequest("GET")));

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(info).toHaveBeenCalledOnce();
    expect(Object.keys(info.mock.calls[0]?.[0] as object).sort()).toEqual(
      ["durationMs", "outcome", "requestId", "status"].sort(),
    );
  });

  it("fails closed with 503 and error-level safe logging when audience is absent", async () => {
    const error = vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined);

    const response = await POST(routeContext(callbackRequest()));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: { code: "verification_unavailable" } });
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]?.[0]).toMatchObject({
      outcome: "verification_unavailable",
      status: 503,
    });
    expect(Object.keys(error.mock.calls[0]?.[0] as object).sort()).toEqual(
      ["durationMs", "outcome", "requestId", "status"].sort(),
    );
  });
});
