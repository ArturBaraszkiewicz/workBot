import type { PanelAccess } from "./panel-principal";

export const AUTH_ERROR_CODES = [
  "oauth_unavailable",
  "oauth_failed",
  "missing_code",
  "callback_failed",
  "signout_failed",
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export type AuthFlowOutcome =
  | { readonly kind: "redirect"; readonly location: string }
  | { readonly kind: "unavailable" };

export interface OAuthStartAdapter {
  signInWithGoogle(input: { readonly redirectTo: string }): Promise<{
    readonly url: string | null;
    readonly failed: boolean;
  }>;
}

export interface OAuthCallbackAdapter {
  exchangeCode(code: string): Promise<{ readonly failed: boolean }>;
  resolveAccess(): Promise<PanelAccess>;
}

export interface SignOutAdapter {
  signOut(): Promise<{ readonly failed: boolean }>;
}

export function authErrorLocation(code: AuthErrorCode): string {
  return `/auth/signin?error=${code}`;
}

export async function startGoogleOAuth(origin: string, adapter: OAuthStartAdapter | null): Promise<AuthFlowOutcome> {
  if (!adapter) {
    return { kind: "redirect", location: authErrorLocation("oauth_unavailable") };
  }

  let result: Awaited<ReturnType<OAuthStartAdapter["signInWithGoogle"]>>;
  try {
    result = await adapter.signInWithGoogle({
      redirectTo: new URL("/api/auth/callback", origin).toString(),
    });
  } catch {
    return { kind: "redirect", location: authErrorLocation("oauth_failed") };
  }

  if (result.failed || !result.url) {
    return { kind: "redirect", location: authErrorLocation("oauth_failed") };
  }

  return { kind: "redirect", location: result.url };
}

export async function finishGoogleOAuth(input: {
  readonly code: string | null;
  readonly providerError: string | null;
  readonly adapter: OAuthCallbackAdapter | null;
}): Promise<AuthFlowOutcome> {
  if (input.providerError) {
    return { kind: "redirect", location: authErrorLocation("oauth_failed") };
  }

  if (!input.code) {
    return { kind: "redirect", location: authErrorLocation("missing_code") };
  }

  if (!input.adapter) {
    return { kind: "redirect", location: authErrorLocation("oauth_unavailable") };
  }

  let exchange: Awaited<ReturnType<OAuthCallbackAdapter["exchangeCode"]>>;
  try {
    exchange = await input.adapter.exchangeCode(input.code);
  } catch {
    return { kind: "redirect", location: authErrorLocation("callback_failed") };
  }
  if (exchange.failed) {
    return { kind: "redirect", location: authErrorLocation("callback_failed") };
  }

  let access: PanelAccess;
  try {
    access = await input.adapter.resolveAccess();
  } catch {
    return { kind: "unavailable" };
  }
  if (access.kind === "unavailable") {
    return { kind: "unavailable" };
  }

  return {
    kind: "redirect",
    location: access.kind === "granted" ? "/dashboard" : "/forbidden",
  };
}

export async function finishSignOut(adapter: SignOutAdapter | null): Promise<AuthFlowOutcome> {
  if (!adapter) {
    return { kind: "redirect", location: authErrorLocation("signout_failed") };
  }

  let result: Awaited<ReturnType<SignOutAdapter["signOut"]>>;
  try {
    result = await adapter.signOut();
  } catch {
    return { kind: "redirect", location: authErrorLocation("signout_failed") };
  }
  return {
    kind: "redirect",
    location: result.failed ? authErrorLocation("signout_failed") : "/auth/signin",
  };
}
