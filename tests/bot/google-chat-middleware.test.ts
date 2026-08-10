import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ createClient }));

import { onRequest } from "../../src/middleware";

function middlewareContext(pathname: string): Parameters<typeof onRequest>[0] {
  const url = new URL(pathname, "https://workbot.example.com");

  return {
    request: new Request(url),
    url,
    cookies: {},
    locals: {},
  } as Parameters<typeof onRequest>[0];
}

beforeEach(() => {
  createClient.mockReset();
  createClient.mockReturnValue(null);
});

describe("Google Chat middleware bypass", () => {
  it("skips Supabase for the exact external callback and initializes anonymous locals", async () => {
    const context = middlewareContext("/api/bot/google-chat");
    const next = vi.fn().mockResolvedValue(new Response("callback", { headers: { "cache-control": "no-store" } }));

    const response = (await onRequest(context, next)) as Response;

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("callback");
    expect(createClient).not.toHaveBeenCalled();
    expect(context.locals.user).toBeNull();
    expect(context.locals.panelAccess).toEqual({ kind: "anonymous" });
    expect(next).toHaveBeenCalledOnce();
  });

  it.each(["/api/bot/google-chat-extra", "/api/bot/google-chat/details", "/dashboard"])(
    "does not extend the bypass to %s",
    async (pathname) => {
      const context = middlewareContext(pathname);
      const next = vi.fn().mockResolvedValue(new Response("ordinary"));

      await onRequest(context, next);

      expect(createClient).toHaveBeenCalledOnce();
    },
  );
});
