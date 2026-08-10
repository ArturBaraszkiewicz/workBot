import { describe, expect, it } from "vitest";

import {
  bypassesPanelSession,
  classifyRoute,
  decideRouteAccess,
  matchesRouteSegment,
} from "../../../src/lib/auth/route-access";

describe("panel route access contract", () => {
  describe("segment matching", () => {
    it("matches an exact prefix and its descendant segment", () => {
      expect(matchesRouteSegment("/dashboard", "/dashboard")).toBe(true);
      expect(matchesRouteSegment("/dashboard/reports", "/dashboard")).toBe(true);
    });

    it("does not match a similar path that is not a descendant", () => {
      expect(matchesRouteSegment("/dashboard-preview", "/dashboard")).toBe(false);
      expect(matchesRouteSegment("/api/panelled", "/api/panel")).toBe(false);
    });
  });

  describe("route classification", () => {
    it.each([
      ["/dashboard", "panel-page"],
      ["/dashboard/reports", "panel-page"],
      ["/api/panel", "panel-api"],
      ["/api/panel/statistics", "panel-api"],
      ["/forbidden", "forbidden-page"],
      ["/api/bot/google-chat", "external-callback"],
      ["/", "public"],
      ["/dashboard-preview", "public"],
      ["/api/panelled", "public"],
      ["/forbidden/details", "public"],
      ["/api/bot/google-chat-extra", "public"],
      ["/api/bot/google-chat/details", "public"],
    ] as const)("classifies %s as %s", (pathname, expected) => {
      expect(classifyRoute(pathname)).toBe(expected);
    });
  });

  describe("external callback bypass", () => {
    it("bypasses the panel session only for the exact Google Chat callback", () => {
      expect(bypassesPanelSession("/api/bot/google-chat")).toBe(true);
      expect(bypassesPanelSession("/api/bot/google-chat-extra")).toBe(false);
      expect(bypassesPanelSession("/api/bot/google-chat/details")).toBe(false);
      expect(bypassesPanelSession("/api/panel")).toBe(false);
      expect(bypassesPanelSession("/dashboard")).toBe(false);
    });
  });

  describe("response decisions", () => {
    it("redirects an anonymous panel page request to sign-in", () => {
      expect(decideRouteAccess("panel-page", "anonymous")).toEqual({
        kind: "redirect",
        status: 302,
        location: "/auth/signin",
      });
    });

    it("uses JSON 401 instead of an HTML redirect for an anonymous panel API request", () => {
      expect(decideRouteAccess("panel-api", "anonymous")).toEqual({
        kind: "error",
        status: 401,
        response: "json",
        code: "unauthenticated",
      });
    });

    it.each([
      ["panel-page", "html"],
      ["panel-api", "json"],
    ] as const)("returns 403 with the correct response kind for denied %s", (route, response) => {
      expect(decideRouteAccess(route, "denied")).toEqual({
        kind: "error",
        status: 403,
        response,
        code: "forbidden",
      });
    });

    it.each([
      ["panel-page", "html"],
      ["panel-api", "json"],
    ] as const)("returns 503 with the correct response kind for unavailable %s", (route, response) => {
      expect(decideRouteAccess(route, "unavailable")).toEqual({
        kind: "error",
        status: 503,
        response,
        code: "access_unavailable",
      });
    });

    it("allows granted panel requests and every public route", () => {
      expect(decideRouteAccess("panel-page", "granted")).toEqual({ kind: "allow" });
      expect(decideRouteAccess("panel-api", "granted")).toEqual({ kind: "allow" });
      expect(decideRouteAccess("public", "anonymous")).toEqual({ kind: "allow" });
      expect(decideRouteAccess("public", "unavailable")).toEqual({ kind: "allow" });
      expect(decideRouteAccess("external-callback", "anonymous")).toEqual({ kind: "allow" });
      expect(decideRouteAccess("external-callback", "unavailable")).toEqual({ kind: "allow" });
    });

    it("keeps the forbidden page available only to authenticated users", () => {
      expect(decideRouteAccess("forbidden-page", "anonymous")).toEqual({
        kind: "redirect",
        status: 302,
        location: "/auth/signin",
      });
      expect(decideRouteAccess("forbidden-page", "denied")).toEqual({ kind: "allow" });
      expect(decideRouteAccess("forbidden-page", "unavailable")).toEqual({ kind: "allow" });
      expect(decideRouteAccess("forbidden-page", "granted")).toEqual({ kind: "allow" });
    });
  });
});
