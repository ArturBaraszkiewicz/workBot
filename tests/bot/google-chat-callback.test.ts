import { describe, expect, it, vi } from "vitest";

import { GOOGLE_CHAT_CALLBACK_MAX_BODY_BYTES, handleGoogleChatCallback } from "../../src/lib/bot/google-chat-callback";
import type {
  GoogleChatAuthorizationResult,
  GoogleChatCallbackDependencies,
  GoogleChatCallbackLog,
} from "../../src/lib/bot/google-chat-contract";
import { isTextResponse } from "../contracts/bot/response-schema";

const CALLBACK_URL = "https://workbot.example.com/api/bot/google-chat";
const VALID_AUTHORIZATION = "Bearer valid-token";

interface Harness {
  readonly dependencies: GoogleChatCallbackDependencies;
  readonly logs: GoogleChatCallbackLog[];
  readonly verify: ReturnType<typeof vi.fn>;
}

function createHarness(verifyResult: GoogleChatAuthorizationResult = { kind: "valid" }): Harness {
  const logs: GoogleChatCallbackLog[] = [];
  const verify = vi.fn().mockResolvedValue(verifyResult);
  let currentTime = 1_000;

  return {
    dependencies: {
      verifier: { verify },
      now: () => {
        currentTime += 7;
        return currentTime;
      },
      createRequestId: () => "request-123",
      log: (record) => logs.push(record),
    },
    logs,
    verify,
  };
}

function callbackRequest(
  body = JSON.stringify({ type: "MESSAGE" }),
  options: {
    readonly method?: string;
    readonly authorization?: string | null;
    readonly contentType?: string | null;
    readonly contentLength?: string | null;
  } = {},
): Request {
  const method = options.method ?? "POST";
  const headers = new Headers();
  const authorization = options.authorization === undefined ? VALID_AUTHORIZATION : options.authorization;
  const contentType = options.contentType === undefined ? "application/json" : options.contentType;

  if (authorization !== null) {
    headers.set("authorization", authorization);
  }
  if (contentType !== null) {
    headers.set("content-type", contentType);
  }
  if (options.contentLength !== undefined && options.contentLength !== null) {
    headers.set("content-length", options.contentLength);
  }

  return new Request(CALLBACK_URL, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? null : body,
  });
}

function requestBody(request: Request): ReadableStream<Uint8Array> {
  if (!request.body) {
    throw new Error("Test request must have a body");
  }
  return request.body;
}

async function expectSafeJsonError(response: Response, status: number, code: string): Promise<void> {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
  await expect(response.json()).resolves.toEqual({ error: { code } });
}

describe("Google Chat callback handler", () => {
  it("rejects non-POST methods before invoking the verifier", async () => {
    const harness = createHarness();

    const response = await handleGoogleChatCallback(callbackRequest("", { method: "GET" }), harness.dependencies);

    await expectSafeJsonError(response, 405, "method_not_allowed");
    expect(response.headers.get("allow")).toBe("POST");
    expect(harness.verify).not.toHaveBeenCalled();
  });

  it.each([null, "", "Basic opaque", "Bearer", "Bearer wrong-token"])(
    "maps an invalid Authorization variant to 401: %j",
    async (authorization) => {
      const harness = createHarness({ kind: "invalid" });

      const response = await handleGoogleChatCallback(
        callbackRequest("not-json", { authorization }),
        harness.dependencies,
      );

      await expectSafeJsonError(response, 401, "unauthorized");
      expect(harness.verify).toHaveBeenCalledWith(authorization);
    },
  );

  it("returns 503 when request verification is unavailable", async () => {
    const harness = createHarness({ kind: "unavailable" });

    const response = await handleGoogleChatCallback(callbackRequest(), harness.dependencies);

    await expectSafeJsonError(response, 503, "verification_unavailable");
  });

  it("maps an unexpected verifier failure to a safe 500", async () => {
    const harness = createHarness();
    harness.verify.mockRejectedValue(new Error("secret verifier detail"));

    const response = await handleGoogleChatCallback(callbackRequest(), harness.dependencies);
    const responseCopy = response.clone();

    await expectSafeJsonError(response, 500, "internal_error");
    expect(await responseCopy.text()).not.toContain("secret verifier detail");
  });

  it.each([null, "text/plain", "application/problem+json"])(
    "rejects an unsupported content type: %j",
    async (contentType) => {
      const harness = createHarness();

      const response = await handleGoogleChatCallback(
        callbackRequest(undefined, { contentType }),
        harness.dependencies,
      );

      await expectSafeJsonError(response, 415, "unsupported_media_type");
    },
  );

  it("accepts application/json parameters", async () => {
    const harness = createHarness();

    const response = await handleGoogleChatCallback(
      callbackRequest(undefined, { contentType: "Application/JSON; charset=utf-8" }),
      harness.dependencies,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects a declared body larger than 256 KiB without reading it", async () => {
    const harness = createHarness();
    const request = callbackRequest(undefined, {
      contentLength: String(GOOGLE_CHAT_CALLBACK_MAX_BODY_BYTES + 1),
    });
    const readBody = vi.spyOn(requestBody(request), "getReader");

    const response = await handleGoogleChatCallback(request, harness.dependencies);

    await expectSafeJsonError(response, 413, "payload_too_large");
    expect(readBody).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["understated", "1"],
    ["invalid", "not-a-number"],
  ] as const)("enforces the real UTF-8 body size when Content-Length is %s", async (_case, contentLength) => {
    const harness = createHarness();
    const oversizedUtf8Body = "ą".repeat(GOOGLE_CHAT_CALLBACK_MAX_BODY_BYTES / 2 + 1);

    const response = await handleGoogleChatCallback(
      callbackRequest(oversizedUtf8Body, { contentLength }),
      harness.dependencies,
    );

    await expectSafeJsonError(response, 413, "payload_too_large");
  });

  it.each([
    ["malformed JSON", "{"],
    ["a scalar", JSON.stringify("MESSAGE")],
    ["a missing type", JSON.stringify({ message: {} })],
    ["an unknown type", JSON.stringify({ type: "UNSPECIFIED" })],
    ["conflicting aliases", JSON.stringify({ type: "MESSAGE", eventType: "ADDED_TO_SPACE" })],
  ])("rejects %s as an invalid event", async (_case, body) => {
    const harness = createHarness();

    const response = await handleGoogleChatCallback(callbackRequest(body), harness.dependencies);

    await expectSafeJsonError(response, 400, "invalid_event");
  });

  it.each(["MESSAGE", "ADDED_TO_SPACE", "CARD_CLICKED", "WIDGET_UPDATED", "APP_COMMAND"])(
    "returns a contract-compatible static response for %s",
    async (type) => {
      const harness = createHarness();

      const response = await handleGoogleChatCallback(
        callbackRequest(JSON.stringify({ type, user: { email: "private@example.com" } })),
        harness.dependencies,
      );
      const payload: unknown = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(isTextResponse(payload)).toBe(true);
    },
  );

  it("normalizes the eventType alias before logging", async () => {
    const harness = createHarness();

    const response = await handleGoogleChatCallback(
      callbackRequest(JSON.stringify({ eventType: " message " })),
      harness.dependencies,
    );

    expect(response.status).toBe(200);
    expect(harness.logs[0]?.eventType).toBe("MESSAGE");
  });

  it("returns an empty 204 response for REMOVED_FROM_SPACE", async () => {
    const harness = createHarness();

    const response = await handleGoogleChatCallback(
      callbackRequest(JSON.stringify({ type: "REMOVED_FROM_SPACE" })),
      harness.dependencies,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBeNull();
    expect(await response.text()).toBe("");
  });

  it("authenticates before attempting to parse the body", async () => {
    const harness = createHarness({ kind: "invalid" });
    const request = callbackRequest("{", { authorization: "Bearer rejected" });
    const readBody = vi.spyOn(requestBody(request), "getReader");

    const response = await handleGoogleChatCallback(request, harness.dependencies);

    expect(response.status).toBe(401);
    expect(readBody).not.toHaveBeenCalled();
  });

  it("emits exactly one terminal log with only the approved fields", async () => {
    const harness = createHarness();
    const body = JSON.stringify({
      type: "MESSAGE",
      token: "payload-secret",
      user: { email: "private@example.com", displayName: "Private User" },
    });

    await handleGoogleChatCallback(callbackRequest(body), harness.dependencies);

    expect(harness.logs).toEqual([
      {
        requestId: "request-123",
        outcome: "accepted",
        status: 200,
        durationMs: 7,
        eventType: "MESSAGE",
      },
    ]);
    expect(Object.keys(harness.logs[0] ?? {}).sort()).toEqual(
      ["durationMs", "eventType", "outcome", "requestId", "status"].sort(),
    );
    expect(JSON.stringify(harness.logs)).not.toMatch(/payload-secret|private@example\.com|Private User|valid-token/);
  });

  it("maps body read failures to 500 without leaking the exception", async () => {
    const harness = createHarness();
    const request = callbackRequest();
    vi.spyOn(requestBody(request), "getReader").mockImplementation(() => {
      throw new Error("raw runtime failure");
    });

    const response = await handleGoogleChatCallback(request, harness.dependencies);
    const responseText = await response.text();

    expect(response.status).toBe(500);
    expect(responseText).not.toContain("raw runtime failure");
    expect(harness.logs).toHaveLength(1);
    expect(harness.logs[0]).toEqual({
      requestId: "request-123",
      outcome: "internal_error",
      status: 500,
      durationMs: 7,
    });
  });
});
