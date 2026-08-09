import { classifyRoute, decideRouteAccess, type RouteAccessDecision } from "./route-access";
import type { PanelAccess } from "./panel-principal";

const NO_STORE = "no-store";

function errorResponse(decision: Extract<RouteAccessDecision, { kind: "error" }>): Response {
  if (decision.response === "json") {
    return new Response(JSON.stringify({ error: { code: decision.code } }), {
      status: decision.status,
      headers: {
        "Cache-Control": NO_STORE,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  }

  const title = decision.status === 403 ? "Brak dostępu" : "Dostęp chwilowo niedostępny";
  const signOut =
    decision.status === 403
      ? '<form action="/api/auth/signout" method="post"><button type="submit">Wyloguj</button></form>'
      : "";

  return new Response(
    `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${title}</title></head><body><main><h1>${title}</h1>${signOut}</main></body></html>`,
    {
      status: decision.status,
      headers: {
        "Cache-Control": NO_STORE,
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}

export function routeAccessResponse(pathname: string, panelAccess: PanelAccess, origin: string): Response | null {
  const decision = decideRouteAccess(classifyRoute(pathname), panelAccess.kind);

  if (decision.kind === "allow") {
    return null;
  }

  if (decision.kind === "redirect") {
    return new Response(null, {
      status: decision.status,
      headers: {
        "Cache-Control": NO_STORE,
        Location: new URL(decision.location, origin).toString(),
      },
    });
  }

  return errorResponse(decision);
}
