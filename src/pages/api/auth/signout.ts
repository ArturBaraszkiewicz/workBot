import type { APIRoute } from "astro";
import { finishSignOut } from "@/lib/auth/oauth-flow";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  const outcome = await finishSignOut(
    supabase
      ? {
          async signOut() {
            const { error } = await supabase.auth.signOut();
            return { failed: error !== null };
          },
        }
      : null,
  );

  return context.redirect(outcome.kind === "redirect" ? outcome.location : "/auth/signin", 303);
};
