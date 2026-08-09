import type { APIRoute } from "astro";
import { startGoogleOAuth } from "@/lib/auth/oauth-flow";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  const outcome = await startGoogleOAuth(
    context.url.origin,
    supabase
      ? {
          async signInWithGoogle({ redirectTo }) {
            const { data, error } = await supabase.auth.signInWithOAuth({
              provider: "google",
              options: { redirectTo },
            });

            return { url: data.url, failed: error !== null };
          },
        }
      : null,
  );

  return context.redirect(outcome.kind === "redirect" ? outcome.location : "/auth/signin?error=oauth_failed", 303);
};
