import { describe, expect, it, vi } from "vitest";

import {
  finishGoogleOAuth,
  finishSignOut,
  startGoogleOAuth,
  type OAuthCallbackAdapter,
} from "../../src/lib/auth/oauth-flow";
import { resolvePanelAccess, type PanelAccess } from "../../src/lib/auth/panel-principal";
import { routeAccessResponse } from "../../src/lib/auth/request-guard";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORIGIN = "https://panel.example.com";

function callbackAdapter(access: PanelAccess, exchangeFailed = false): OAuthCallbackAdapter {
  return {
    exchangeCode: vi.fn().mockResolvedValue({ failed: exchangeFailed }),
    resolveAccess: vi.fn().mockResolvedValue(access),
  };
}

describe("Google OAuth flow", () => {
  it("starts Google OAuth with the fixed PKCE callback and redirects to the provider URL", async () => {
    const signInWithGoogle = vi.fn().mockResolvedValue({
      url: "https://accounts.google.com/o/oauth2/v2/auth?opaque=value",
      failed: false,
    });

    const outcome = await startGoogleOAuth(ORIGIN, { signInWithGoogle });

    expect(signInWithGoogle).toHaveBeenCalledWith({
      redirectTo: "https://panel.example.com/api/auth/callback",
    });
    expect(outcome).toEqual({
      kind: "redirect",
      location: "https://accounts.google.com/o/oauth2/v2/auth?opaque=value",
    });
  });

  it.each([
    [null, "oauth_unavailable"],
    [
      {
        signInWithGoogle: vi.fn().mockResolvedValue({ url: null, failed: false }),
      },
      "oauth_failed",
    ],
    [
      {
        signInWithGoogle: vi.fn().mockResolvedValue({ url: null, failed: true }),
      },
      "oauth_failed",
    ],
  ] as const)("returns a safe code when OAuth cannot start", async (adapter, errorCode) => {
    await expect(startGoogleOAuth(ORIGIN, adapter)).resolves.toEqual({
      kind: "redirect",
      location: `/auth/signin?error=${errorCode}`,
    });
  });

  it("rejects a callback without a code before invoking the adapter", async () => {
    const exchangeCode = vi.fn().mockResolvedValue({ failed: false });
    const adapter: OAuthCallbackAdapter = {
      exchangeCode,
      resolveAccess: vi.fn().mockResolvedValue({ kind: "denied" }),
    };

    await expect(finishGoogleOAuth({ code: null, providerError: null, adapter })).resolves.toEqual({
      kind: "redirect",
      location: "/auth/signin?error=missing_code",
    });
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it("does not reflect provider errors or descriptions into the redirect", async () => {
    const rawProviderError = "access_denied: user@example.com secret-provider-detail";

    const outcome = await finishGoogleOAuth({
      code: null,
      providerError: rawProviderError,
      adapter: callbackAdapter({ kind: "denied" }),
    });

    expect(outcome).toEqual({ kind: "redirect", location: "/auth/signin?error=oauth_failed" });
    expect(JSON.stringify(outcome)).not.toContain(rawProviderError);
  });

  it("maps a missing or already-used PKCE code to a safe callback failure", async () => {
    const resolveAccess = vi.fn().mockResolvedValue({
      kind: "granted",
      principal: { userId: USER_ID, role: "hr_admin" },
    });
    const adapter: OAuthCallbackAdapter = {
      exchangeCode: vi.fn().mockResolvedValue({ failed: true }),
      resolveAccess,
    };

    await expect(finishGoogleOAuth({ code: "already-used", providerError: null, adapter })).resolves.toEqual({
      kind: "redirect",
      location: "/auth/signin?error=callback_failed",
    });
    expect(resolveAccess).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: "granted", principal: { userId: USER_ID, role: "hr_admin" } }, "/dashboard"],
    [{ kind: "denied" }, "/forbidden"],
    [{ kind: "anonymous" }, "/forbidden"],
  ] as const)("routes a resolved callback without accepting an arbitrary next", async (access, location) => {
    const adapter = callbackAdapter(access);

    await expect(finishGoogleOAuth({ code: "one-time-code", providerError: null, adapter })).resolves.toEqual({
      kind: "redirect",
      location,
    });
  });

  it("fails closed with 503 when the grant store is unavailable", async () => {
    await expect(
      finishGoogleOAuth({
        code: "one-time-code",
        providerError: null,
        adapter: callbackAdapter({ kind: "unavailable" }),
      }),
    ).resolves.toEqual({ kind: "unavailable" });
  });

  it("always returns to sign-in on logout and exposes only a fixed failure code", async () => {
    await expect(finishSignOut({ signOut: vi.fn().mockResolvedValue({ failed: false }) })).resolves.toEqual({
      kind: "redirect",
      location: "/auth/signin",
    });
    await expect(finishSignOut({ signOut: vi.fn().mockResolvedValue({ failed: true }) })).resolves.toEqual({
      kind: "redirect",
      location: "/auth/signin?error=signout_failed",
    });
    await expect(finishSignOut(null)).resolves.toEqual({
      kind: "redirect",
      location: "/auth/signin?error=signout_failed",
    });
  });
});

describe("request-scoped panel principal", () => {
  it("keeps anonymous requests anonymous without querying the grant store", async () => {
    const lookup = vi.fn();

    await expect(resolvePanelAccess(null, lookup)).resolves.toEqual({ kind: "anonymous" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each([
    ["missing grant", null],
    ["inactive grant", { user_id: USER_ID, role: "pm", active: false }],
    ["unknown role", { user_id: USER_ID, role: "employee", active: true }],
  ] as const)("denies an authenticated user with a %s", async (_description, account) => {
    await expect(
      resolvePanelAccess({ id: USER_ID }, () => Promise.resolve({ account, failed: false })),
    ).resolves.toEqual({
      kind: "denied",
    });
  });

  it.each([
    ["hr_admin", { kind: "granted", principal: { userId: USER_ID, role: "hr_admin" } }],
    [
      "pm",
      {
        kind: "granted",
        principal: { userId: USER_ID, role: "pm", assignedTeamIds: [] },
      },
    ],
  ] as const)("maps an active %s grant to the canonical principal", async (role, expected) => {
    await expect(
      resolvePanelAccess({ id: USER_ID }, () =>
        Promise.resolve({
          account: { user_id: USER_ID, role, active: true },
          failed: false,
        }),
      ),
    ).resolves.toEqual(expected);
  });

  it("distinguishes a database error from a denied grant", async () => {
    await expect(
      resolvePanelAccess({ id: USER_ID }, () => Promise.resolve({ account: null, failed: true })),
    ).resolves.toEqual({ kind: "unavailable" });
  });
});

describe("page and API guards", () => {
  it("redirects only an anonymous page request and marks it no-store", () => {
    const response = routeAccessResponse("/dashboard", { kind: "anonymous" }, ORIGIN);

    expect(response?.status).toBe(302);
    expect(response?.headers.get("location")).toBe("https://panel.example.com/auth/signin");
    expect(response?.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    ["anonymous", 401, "unauthenticated"],
    ["denied", 403, "forbidden"],
    ["unavailable", 503, "access_unavailable"],
  ] as const)("returns the expected JSON denial for API state %s", async (kind, status, code) => {
    const response = routeAccessResponse("/api/panel/statistics", { kind }, ORIGIN);

    expect(response?.status).toBe(status);
    expect(response?.headers.get("content-type")).toContain("application/json");
    expect(response?.headers.get("cache-control")).toBe("no-store");
    await expect(response?.json()).resolves.toEqual({ error: { code } });
  });

  it.each([
    ["denied", 403],
    ["unavailable", 503],
  ] as const)("returns the expected HTML denial for page state %s", (kind, status) => {
    const response = routeAccessResponse("/dashboard", { kind }, ORIGIN);

    expect(response?.status).toBe(status);
    expect(response?.headers.get("content-type")).toContain("text/html");
    expect(response?.headers.get("cache-control")).toBe("no-store");
  });

  it("allows a granted panel request and public routes", () => {
    const granted: PanelAccess = {
      kind: "granted",
      principal: { userId: USER_ID, role: "hr_admin" },
    };

    expect(routeAccessResponse("/dashboard", granted, ORIGIN)).toBeNull();
    expect(routeAccessResponse("/", { kind: "anonymous" }, ORIGIN)).toBeNull();
  });
});
