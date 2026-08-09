<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Minimalny kontrakt dostępu do panelu

- **Plan**: `context/changes/panel-access-contract/plan.md`
- **Scope**: Phases 1–4 of 4
- **Date**: 2026-08-09
- **Verdict**: REJECTED
- **Findings**: 1 critical, 6 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | FAIL |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | FAIL |

## Verification

| Command / evidence | Result |
|--------------------|--------|
| `npm ci` | PASS — 794 packages installed from lockfile |
| `npm test` | PASS — 5 files, 74 tests |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| stale signup/password `rg` scan | PASS — no references in `src` or `tests` |
| `npx supabase db reset` | BLOCKED — local Docker/Supabase is not running |
| `npm run test:db` | BLOCKED — no local Postgres on `127.0.0.1:54322` |
| `npm run test:db:linked` | FAIL — 1 of 27 pgTAP tests failed on linked staging |
| manual Google PKCE / grant bootstrap / inactive account | PASS — exercised in the browser during phase 4 |
| manual PM-with-empty-scope smoke | NO DURABLE EVIDENCE — contract test exists, but no real PM smoke was recorded |

`npm ci` initially encountered Windows file locks from stale Node/workerd processes. After resolving the exact project
processes and recreating only `node_modules`, the clean install passed. The install reported dependency audit findings,
but dependency versions were not changed by this implementation review.

## Findings

### F1 — Core implementation is absent from Git history

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `context/changes/panel-access-contract/change.md:4`
- **Detail**: Before this review the change declared `status: implemented` and every progress item was checked, but commits
  `be25d81` and `74fd705` contain only phase-4 configuration/documentation and workflow metadata. The phase 1–3 auth
  modules, OAuth callback, forbidden page, migration, pgTAP tests, contract tests, middleware changes, and signup removals
  remain modified/untracked in the working tree. A clean checkout of `HEAD` therefore does not contain the access contract
  described by the completed plan.
- **Fix**: Select only the intended phase 1–3 files and deletions, commit them in controlled phase commits, then run all
  gates on a clean checkout while leaving unrelated working-tree changes out.
  - Strength: Makes the reviewed behavior reproducible and prevents the feature from disappearing outside this workspace.
  - Tradeoff: Requires careful staging because unrelated edits are mixed into the same dirty worktree.
  - Confidence: HIGH — `git status`, `git ls-files`, and commit contents directly prove the gap.
  - Blind spot: No remote PR or unpublished commit outside the current repository was inspected.
- **Decision**: FIXED — committed as `95c3fac` (p1), `3d66ab0` (p2), and `2572bdb` (p3)

### F2 — Auth infrastructure failures are treated as anonymous users

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `src/middleware.ts:24`, `src/pages/api/auth/callback.ts:24`
- **Detail**: Middleware initializes `panelAccess` as `anonymous`, leaves it there when the Supabase client is unavailable,
  and ignores the `error` returned by `auth.getUser()`. The callback also ignores `getUser()` errors. An Auth/network failure
  is therefore mapped to signin/401 or `/forbidden`, while the plan requires `unavailable` and 503 whenever access cannot be
  verified.
- **Fix**: Distinguish a genuine missing session from Supabase/Auth errors; set middleware access to `unavailable` and make
  callback access resolution throw or return `unavailable` on `getUser()` failure.
  - Strength: Restores fail-closed 503 semantics and makes operational failures distinguishable from authorization denial.
  - Tradeoff: Requires tests for both no-session and infrastructure-error branches at the real adapter boundary.
  - Confidence: HIGH — the Supabase result is destructured without its error in both locations.
  - Blind spot: Exact Supabase error taxonomy for expired sessions versus network faults still needs to be encoded.
- **Decision**: SKIPPED

### F3 — Linked pgTAP test is not isolated from existing staging data

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `supabase/tests/database/panel_access_contract.test.sql:205`
- **Detail**: `npm run test:db:linked` currently fails 1 of 27 tests. The test inserts four synthetic grants and asserts that
  HR sees exactly four rows, but linked staging now contains one real bootstrap grant (confirmed with a count-only query).
  The transaction rolls back synthetic data but does not isolate reads from pre-existing rows, so the assertion sees five.
  This contradicts README's claim that the linked staging test is safe and repeatable.
- **Fix A ⭐ Recommended**: Assert visibility of the four known synthetic UUIDs instead of the total table row count.
  - Strength: Keeps the useful staging test and proves HR can read every synthetic target without depending on ambient data.
  - Tradeoff: It no longer asserts the absolute row count, which was never a stable contract on a shared database.
  - Confidence: HIGH — staging has exactly one pre-existing grant and the failing assertion expects four total rows.
  - Blind spot: The CLI error only exposed the aggregate 1/27 failure; the root cause is a strong evidence-based inference.
- **Fix B**: Make pgTAP strictly local/ephemeral and remove the linked-staging substitution from docs and progress evidence.
  - Strength: Preserves whole-table count assertions in a clean database.
  - Tradeoff: Requires Docker locally and removes the currently documented no-Docker verification path.
  - Confidence: HIGH — CI's clean Supabase stack provides exactly this isolation.
  - Blind spot: Local Docker was unavailable during this review, so the local pass was not reproduced.
- **Decision**: FIXED via Fix A — linked staging pgTAP verified 27/27

### F4 — CI targets `master`, while the repository uses `main`

- **Severity**: ⚠️ WARNING
- **Impact**: 🟢 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `.github/workflows/ci.yml:5`
- **Detail**: Both push and pull-request triggers are restricted to `master`, but the current branch and only tracked remote
  branch are `main` / `origin/main`. The declared migration, pgTAP, lint, and build gates can therefore be skipped for the
  branch actually used by the repository.
- **Fix**: Change both workflow branch filters to `main` (or deliberately include both names during a migration period).
- **Decision**: FIXED — workflow push and pull-request triggers now target `main`

### F5 — Personalized public SSR can be returned without `no-store`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/middleware.ts:42`, `src/components/Topbar.astro:11`
- **Detail**: The public home page is rendered from session-dependent `Astro.locals` and can include the user's email, but
  middleware adds `Cache-Control: no-store` only to protected, auth, and forbidden routes. `/` can therefore return
  personalized HTML without the cache policy promised by the deployment runbook, risking shared edge-cache disclosure.
- **Fix A ⭐ Recommended**: Mark `/` and every other session-dependent response `private, no-store`, including responses
  that may carry refreshed Supabase cookies.
  - Strength: Preserves the current personalized navigation and closes the cache/privacy gap.
  - Tradeoff: Personalized public pages cannot benefit from shared HTML caching.
  - Confidence: HIGH — Topbar renders `user?.email`, while `/` is excluded from the current no-store condition.
  - Blind spot: No deployed Cloudflare cache rule was inspected; the response remains unsafe as an application default.
- **Fix B**: Remove session-dependent UI from public pages and keep personalization only on explicitly private routes.
  - Strength: Allows the marketing/public page to remain cacheable.
  - Tradeoff: Changes the current signed-in navigation experience and requires a separate private navigation surface.
  - Confidence: MEDIUM — it solves the data variance, but product preference is not documented.
  - Blind spot: Other layouts may later consume `Astro.locals` and need the same classification.
- **Decision**: FIXED via Fix A — session-dependent and cookie-mutating responses use `private, no-store`

### F6 — Failed global signout can leave a live local session

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/auth/signout.ts:10`
- **Detail**: The handler calls the default/global Supabase `signOut()` once. On a non-auth infrastructure error it redirects
  with `signout_failed`, but does not perform a local-only cookie/session cleanup. The next request can still be authenticated
  and immediately redirect away from signin, leaving a user on a shared device with a live session after an attempted logout.
- **Fix**: If global revocation fails, perform a local-scope signout/cookie cleanup, preserve a safe error code, and add a
  handler-level test proving the session cookies are expired.
  - Strength: Guarantees the user's browser session ends even when remote revocation is unavailable.
  - Tradeoff: Other refresh tokens/sessions may remain valid until remote revocation recovers.
  - Confidence: MEDIUM — Supabase SSR cookie behavior should be verified in the real handler, not only the pure adapter.
  - Blind spot: The current tests do not inspect `Set-Cookie` behavior.
- **Decision**: SKIPPED

### F7 — Manual PM smoke is checked without durable evidence

- **Severity**: ⚠️ WARNING
- **Impact**: 🟢 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `context/changes/panel-access-contract/plan.md:602`
- **Detail**: Progress item 4.7 combines no-grant, inactive-account, and PM-with-empty-scope behavior. Browser evidence covers
  the first two, while PM behavior is covered only by synthetic contract tests; no real role switch or PM smoke result was
  recorded. The item is nevertheless fully checked.
- **Fix**: Either run and record the real PM smoke or split/reword the progress evidence so automated contract coverage is not
  presented as completed manual verification.
- **Decision**: SKIPPED

### F8 — Repository agent guidance contradicts the implemented project

- **Severity**: 👁 OBSERVATION
- **Impact**: 🟢 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `AGENTS.md:20`
- **Detail**: The guidance says no test runner or tests exist, references deleted `SignInForm.tsx`, and tells PRs to target
  `master`. The current project has Vitest/pgTAP, no password form, and uses `main`; future agents are likely to skip required
  tests or follow dead paths.
- **Fix**: Update the command/testing, auth-component, and target-branch guidance after the implementation is committed.
- **Decision**: FIXED — guidance now documents Vitest/pgTAP, current auth patterns, and the `main` target branch

### F9 — Review scope contains unrelated and overly broad working-tree changes

- **Severity**: 👁 OBSERVATION
- **Impact**: 🟢 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `context/foundation/prd.md:50`, `eslint.config.js:62`
- **Detail**: The dirty worktree includes an unrelated PRD change to `/who`, workflow artifacts/foundation files not listed by
  this plan, and a global Astro override disabling `no-misused-promises` for every `.astro` file. The auth extraction files
  `oauth-flow.ts` and `request-guard.ts` are sensible plan-aligned additions, but the unrelated edits should not be bundled
  into the delivery commit and the lint exception is broader than the triggering files.
- **Fix**: Stage only the reviewed feature files, keep unrelated foundation edits separate, and narrow the ESLint override to
  the smallest affected Astro files or replace the parser-triggering control-flow pattern.
- **Decision**: FIXED — ESLint exception narrowed to the three Astro redirect pages; unrelated files remain unstaged

## Triage Summary

- **Fixed**: F1, F3 (Fix A), F4, F5 (Fix A), F8, F9
- **Skipped**: F2, F6, F7
- **Accepted as rule**: none
- **Pending**: none
