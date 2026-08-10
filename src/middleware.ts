import { defineMiddleware } from "astro:middleware";
import {
  PANEL_API_PREFIXES,
  PANEL_PAGE_PREFIXES,
  bypassesPanelSession,
  classifyRoute,
  matchesRouteSegment,
} from "@/lib/auth/route-access";
import { resolvePanelAccessForRequest, type PanelAccess } from "@/lib/auth/panel-principal";
import { routeAccessResponse } from "@/lib/auth/request-guard";
import { createClient } from "@/lib/supabase";

export const PROTECTED_ROUTES = [...PANEL_PAGE_PREFIXES, ...PANEL_API_PREFIXES] as const;

const AUTH_ROUTE_PREFIXES = ["/auth", "/api/auth"] as const;
const NO_STORE = "private, no-store";

function noStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", NO_STORE);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  let panelAccess: PanelAccess = { kind: "anonymous" };

  if (bypassesPanelSession(context.url.pathname)) {
    context.locals.user = null;
    context.locals.panelAccess = panelAccess;
    return next();
  }

  const supabase = createClient(context.request.headers, context.cookies);

  if (!supabase) {
    context.locals.user = null;
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
    panelAccess = await resolvePanelAccessForRequest(context.locals.user, supabase);
  }
  context.locals.panelAccess = panelAccess;

  const guardedResponse = routeAccessResponse(context.url.pathname, panelAccess, context.url.origin);
  if (guardedResponse) {
    return guardedResponse;
  }

  const response = await next();
  const isProtected = PROTECTED_ROUTES.some((route) => matchesRouteSegment(context.url.pathname, route));
  const isAuthRoute = AUTH_ROUTE_PREFIXES.some((route) => matchesRouteSegment(context.url.pathname, route));
  const isForbiddenPage = classifyRoute(context.url.pathname) === "forbidden-page";
  const variesBySession = panelAccess.kind !== "anonymous" || response.headers.has("Set-Cookie");
  return isProtected || isAuthRoute || isForbiddenPage || variesBySession ? noStore(response) : response;
});
