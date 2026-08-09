import type { User } from "@supabase/supabase-js";

import { createPanelPrincipal, type PanelPrincipal } from "./panel-access";
import type { createClient } from "../supabase";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

export type PanelAccess =
  | { readonly kind: "anonymous" }
  | { readonly kind: "denied" }
  | { readonly kind: "granted"; readonly principal: PanelPrincipal }
  | { readonly kind: "unavailable" };

export interface PanelAccountLookupResult {
  readonly account: {
    readonly active: boolean;
    readonly role: unknown;
    readonly user_id: string;
  } | null;
  readonly failed: boolean;
}

export type PanelAccountLookup = (userId: string) => Promise<PanelAccountLookupResult>;

export async function resolvePanelAccess(
  user: Pick<User, "id"> | null,
  lookupPanelAccount: PanelAccountLookup,
): Promise<PanelAccess> {
  if (!user) {
    return { kind: "anonymous" };
  }

  let result: PanelAccountLookupResult;
  try {
    result = await lookupPanelAccount(user.id);
  } catch {
    return { kind: "unavailable" };
  }
  if (result.failed) {
    return { kind: "unavailable" };
  }

  const account = result.account?.user_id === user.id ? result.account : null;
  const principal = createPanelPrincipal(
    account
      ? {
          userId: account.user_id,
          role: account.role,
          active: account.active,
          assignedTeamIds: [],
        }
      : null,
  );

  return principal ? { kind: "granted", principal } : { kind: "denied" };
}

export async function lookupPanelAccount(supabase: SupabaseClient, userId: string): Promise<PanelAccountLookupResult> {
  const { data, error } = await supabase
    .from("panel_accounts")
    .select("user_id, role, active")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    account: data,
    failed: error !== null,
  };
}

export function resolvePanelAccessForRequest(user: Pick<User, "id"> | null, supabase: SupabaseClient) {
  return resolvePanelAccess(user, (userId) => lookupPanelAccount(supabase, userId));
}
