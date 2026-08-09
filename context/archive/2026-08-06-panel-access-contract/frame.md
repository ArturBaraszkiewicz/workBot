# Frame Brief: Local Supabase configuration warning

> Framing step for the failed Phase 4 manual verification. This document separates
> the visible warning from the initially suspected authorization defect.

## Reported Observation

The application running on `http://localhost:4321` displays: “Supabase nie jest
skonfigurowany — funkcje uwierzytelniania są wyłączone.” The user expected an
`hr_admin` account to have working panel access.

## Initial Framing (preserved)

- **User's stated cause or approach**: this is probably an application bug.
- **User's proposed direction**: inspect the running localhost application with Chrome DevTools.
- **Pre-dispatch narrowing**: the warning is visible on the home and sign-in pages before role evaluation.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Development environment loading** — the dev process may not load the file containing Supabase values.
2. **Configuration status code** — the TypeScript check may reject values that are actually available.
3. **OAuth endpoint** — the sign-in handler may fail after configuration succeeds.
4. **Panel grant resolution** — an `hr_admin` grant may be missing or denied.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Dev mode does not load the populated env file | `npm run dev` uses Astro development mode; Vite reports both values absent in development and present in production | STRONG |
| The TypeScript status check is incorrect | `config-status.ts` performs the intended non-empty check on exactly the two schema fields | NONE |
| OAuth fails independently of configuration | Chrome shows `oauth_unavailable`, matching the client factory returning `null` before provider access | WEAK |
| The `hr_admin` grant causes the warning | The warning is rendered on public pages before authentication and grant lookup | NONE |

## Narrowing Signals

- Chrome DevTools reproduced the warning on `/` and `/auth/signin`.
- `POST /api/auth/signin` returns `303` to `/auth/signin?error=oauth_unavailable`.
- The repository has populated `.env.production` values but no `.env`, `.env.local`,
  `.env.development`, or `.env.development.local`.
- Sanitized environment loading reports `false/false` for development and `true/true` for production.

## Cross-System Convention

Astro/Vite development loads `.env`, `.env.local`, `.env.development`, and
`.env.development.local`. `.env.production` is reserved for production mode. Local
development configuration should therefore live in an ignored development env file,
while deployment configuration remains separate.

## Reframed Problem Statement

> **The actual problem to address is**: local development is configured only through
> `.env.production`, which `astro dev` does not load, and the README currently directs
> developers through an environment setup that does not satisfy its own dev command.

The authorization implementation is not reached, so changing roles or RLS cannot remove
the warning. Local dev configuration and its documentation must be aligned before the
Phase 4 Google/administrator smoke test can be meaningful.

## Confidence

- **HIGH** — reproduced in Chrome DevTools, confirmed through sanitized mode-specific
  environment loading, and independently verified against the installed Astro/Vite code.

## What Changes for the Existing Plan

Phase 4 remains the correct scope. Its local setup must supply the two application values
to Astro development mode and document that source explicitly; no authorization redesign
is required.

## References

- `package.json:6`
- `README.md:14-47`
- `astro.config.mjs:19-20`
- `src/lib/config-status.ts:11-21`
- `src/lib/supabase.ts:6-10`
- `src/layouts/Layout.astro:22-37`
- Investigation tasks: `astro_env_loading`, `env_ts_trace`, `independent_root_cause`
