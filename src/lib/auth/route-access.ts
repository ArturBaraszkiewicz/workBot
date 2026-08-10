export const PANEL_PAGE_PREFIXES = ["/dashboard"] as const;
export const PANEL_API_PREFIXES = ["/api/panel"] as const;
export const FORBIDDEN_PAGE_PATH = "/forbidden";
export const SIGN_IN_PATH = "/auth/signin";
export const GOOGLE_CHAT_CALLBACK_PATH = "/api/bot/google-chat";

export type RouteAccessKind = "public" | "panel-page" | "panel-api" | "forbidden-page" | "external-callback";
export type PanelAccessState = "anonymous" | "denied" | "granted" | "unavailable";

export type RouteAccessDecision =
  | { readonly kind: "allow" }
  | { readonly kind: "redirect"; readonly status: 302; readonly location: typeof SIGN_IN_PATH }
  | {
      readonly kind: "error";
      readonly status: 401 | 403 | 503;
      readonly response: "html" | "json";
      readonly code: "unauthenticated" | "forbidden" | "access_unavailable";
    };

export function matchesRouteSegment(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function classifyRoute(pathname: string): RouteAccessKind {
  if (pathname === GOOGLE_CHAT_CALLBACK_PATH) {
    return "external-callback";
  }

  if (pathname === FORBIDDEN_PAGE_PATH) {
    return "forbidden-page";
  }

  if (PANEL_API_PREFIXES.some((prefix) => matchesRouteSegment(pathname, prefix))) {
    return "panel-api";
  }

  if (PANEL_PAGE_PREFIXES.some((prefix) => matchesRouteSegment(pathname, prefix))) {
    return "panel-page";
  }

  return "public";
}

export function bypassesPanelSession(pathname: string): boolean {
  return classifyRoute(pathname) === "external-callback";
}

export function decideRouteAccess(route: RouteAccessKind, accessState: PanelAccessState): RouteAccessDecision {
  if (route === "public" || route === "external-callback" || accessState === "granted") {
    return { kind: "allow" };
  }

  if (route === "forbidden-page") {
    return accessState === "anonymous" ? { kind: "redirect", status: 302, location: SIGN_IN_PATH } : { kind: "allow" };
  }

  if (accessState === "anonymous") {
    return route === "panel-api"
      ? { kind: "error", status: 401, response: "json", code: "unauthenticated" }
      : { kind: "redirect", status: 302, location: SIGN_IN_PATH };
  }

  const response = route === "panel-api" ? "json" : "html";

  return accessState === "unavailable"
    ? { kind: "error", status: 503, response, code: "access_unavailable" }
    : { kind: "error", status: 403, response, code: "forbidden" };
}
