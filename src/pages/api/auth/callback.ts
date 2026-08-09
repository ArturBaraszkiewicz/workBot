import type { APIRoute } from "astro";

import { finishGoogleOAuth } from "@/lib/auth/oauth-flow";
import { resolvePanelAccessForRequest } from "@/lib/auth/panel-principal";
import { createClient } from "@/lib/supabase";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
} as const;

export const GET: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  const outcome = await finishGoogleOAuth({
    code: context.url.searchParams.get("code"),
    providerError: context.url.searchParams.get("error"),
    adapter: supabase
      ? {
          async exchangeCode(code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            return { failed: error !== null };
          },
          async resolveAccess() {
            const {
              data: { user },
            } = await supabase.auth.getUser();
            return resolvePanelAccessForRequest(user, supabase);
          },
        }
      : null,
  });

  if (outcome.kind === "unavailable") {
    return new Response(JSON.stringify({ error: { code: "access_unavailable" } }), {
      status: 503,
      headers: NO_STORE_HEADERS,
    });
  }

  return context.redirect(outcome.location);
};
