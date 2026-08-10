import type {
  GoogleChatCallbackDependencies,
  GoogleChatCallbackLog,
  GoogleChatCallbackOutcome,
} from "./google-chat-contract";

export const GOOGLE_CHAT_CALLBACK_MAX_BODY_BYTES = 256 * 1024;

const GOOGLE_CHAT_EVENT_TYPES = new Set([
  "MESSAGE",
  "ADDED_TO_SPACE",
  "REMOVED_FROM_SPACE",
  "CARD_CLICKED",
  "WIDGET_UPDATED",
  "APP_COMMAND",
]);

const JSON_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonError(status: number, code: string, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(JSON_HEADERS);
  if (extraHeaders) {
    new Headers(extraHeaders).forEach((value, name) => {
      headers.set(name, value);
    });
  }

  return new Response(JSON.stringify({ error: { code } }), {
    status,
    headers,
  });
}

function isJsonContentType(contentType: string | null): boolean {
  return contentType?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

function exceedsDeclaredLimit(contentLength: string | null): boolean {
  if (!contentLength || !/^\d+$/.test(contentLength.trim())) {
    return false;
  }

  return Number(contentLength) > GOOGLE_CHAT_CALLBACK_MAX_BODY_BYTES;
}

function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

async function readBodyWithinLimit(request: Request): Promise<Uint8Array | null> {
  if (!request.body) {
    return new Uint8Array();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > GOOGLE_CHAT_CALLBACK_MAX_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The size rejection remains authoritative even if stream cancellation fails.
        }
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function normalizeEventType(payload: JsonObject): string | null {
  const type = typeof payload.type === "string" ? payload.type.trim().toUpperCase() : null;
  const eventType = typeof payload.eventType === "string" ? payload.eventType.trim().toUpperCase() : null;

  if (type && eventType && type !== eventType) {
    return null;
  }

  const normalized = type ?? eventType;
  return normalized && GOOGLE_CHAT_EVENT_TYPES.has(normalized) ? normalized : null;
}

function durationSince(startedAt: number, now: () => number): number {
  try {
    return Math.max(0, now() - startedAt);
  } catch {
    return 0;
  }
}

function emitLog(dependencies: GoogleChatCallbackDependencies, record: GoogleChatCallbackLog): void {
  try {
    dependencies.log(record);
  } catch {
    // A logging failure must not change the callback response or expose request details.
  }
}

export async function handleGoogleChatCallback(
  request: Request,
  dependencies: GoogleChatCallbackDependencies,
): Promise<Response> {
  const startedAt = dependencies.now();
  const requestId = dependencies.createRequestId();
  let eventType: string | undefined;
  let outcome: GoogleChatCallbackOutcome = "internal_error";
  let status = 500;

  try {
    if (request.method !== "POST") {
      outcome = "method_not_allowed";
      status = 405;
      return jsonError(status, outcome, { allow: "POST" });
    }

    const authorization = await dependencies.verifier.verify(request.headers.get("authorization"));
    if (authorization.kind === "invalid") {
      outcome = "unauthorized";
      status = 401;
      return jsonError(status, outcome);
    }
    if (authorization.kind === "unavailable") {
      outcome = "verification_unavailable";
      status = 503;
      return jsonError(status, outcome);
    }

    if (!isJsonContentType(request.headers.get("content-type"))) {
      outcome = "unsupported_media_type";
      status = 415;
      return jsonError(status, outcome);
    }

    if (exceedsDeclaredLimit(request.headers.get("content-length"))) {
      outcome = "payload_too_large";
      status = 413;
      return jsonError(status, outcome);
    }

    const body = await readBodyWithinLimit(request);
    if (!body) {
      outcome = "payload_too_large";
      status = 413;
      return jsonError(status, outcome);
    }

    let payload: unknown;
    try {
      payload = parseJson(new TextDecoder().decode(body));
    } catch {
      outcome = "invalid_event";
      status = 400;
      return jsonError(status, outcome);
    }

    if (!isObject(payload)) {
      outcome = "invalid_event";
      status = 400;
      return jsonError(status, outcome);
    }

    const normalizedEventType = normalizeEventType(payload);
    if (!normalizedEventType) {
      outcome = "invalid_event";
      status = 400;
      return jsonError(status, outcome);
    }
    eventType = normalizedEventType;

    if (eventType === "REMOVED_FROM_SPACE") {
      outcome = "removed";
      status = 204;
      return new Response(null, {
        status,
        headers: { "cache-control": "no-store" },
      });
    }

    outcome = "accepted";
    status = 200;
    return new Response(JSON.stringify({ text: "workBot odebrał zdarzenie Google Chat." }), {
      status,
      headers: JSON_HEADERS,
    });
  } catch {
    outcome = "internal_error";
    status = 500;
    return jsonError(status, outcome);
  } finally {
    const common = {
      requestId,
      outcome,
      status,
      durationMs: durationSince(startedAt, dependencies.now),
    };
    emitLog(dependencies, eventType ? { ...common, eventType } : common);
  }
}
