import type { APIRoute } from "astro";
import { GOOGLE_CHAT_AUDIENCE } from "astro:env/server";

import { createGoogleChatRequestVerifier } from "@/lib/bot/google-chat-auth";
import { handleGoogleChatCallback } from "@/lib/bot/google-chat-callback";
import type { GoogleChatCallbackDependencies, GoogleChatCallbackLog } from "@/lib/bot/google-chat-contract";

function logCallback(record: GoogleChatCallbackLog): void {
  if (record.status >= 500) {
    globalThis.console.error(record);
    return;
  }

  globalThis.console.info(record);
}

export function createGoogleChatApiRoute(dependencies: GoogleChatCallbackDependencies): APIRoute {
  return ({ request }) => handleGoogleChatCallback(request, dependencies);
}

const callbackRoute = createGoogleChatApiRoute({
  verifier: createGoogleChatRequestVerifier(GOOGLE_CHAT_AUDIENCE),
  now: () => performance.now(),
  createRequestId: () => crypto.randomUUID(),
  log: logCallback,
});

export const POST: APIRoute = callbackRoute;
export const ALL: APIRoute = callbackRoute;
