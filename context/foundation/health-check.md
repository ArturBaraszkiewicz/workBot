---
project: 10x-astro-starter
checked_at: 2026-07-31T13:37:55.0742498Z
health_status: critical-issues
context_type: brownfield
language_family: js
stack_assessment_available: false
checks_run:
  - lockfile
  - dependency_audit
  - outdated_deps
  - test_runner
  - ci_cd
  - configuration
audit_findings:
  critical: 1
  high: 12
  moderate: 7
  low: 2
test_runner_detected: false
ci_provider: GitHub Actions
recommended_fixes: 10
---

## Dependency Health

### Lockfile

Status: present (`package-lock.json`)
Package manager: npm

Lockfile version 3 is present and CI uses `npm ci`, so dependency installation is reproducible.

### Security Audit

Tool: `npm audit --json`
Summary: 1 CRITICAL, 12 HIGH, 7 MODERATE, 2 LOW
Direct vs transitive: 3 affected packages are direct (`astro` HIGH, `supabase` MODERATE, `wrangler` MODERATE); 19 are transitive. The CRITICAL finding is transitive through the direct development dependency `supabase`.

A supplemental `npm audit --omit=dev --json` reported 0 CRITICAL, 11 HIGH, 6 MODERATE, and 2 LOW. This confirms that the CRITICAL `tar` issue is limited to development tooling, while multiple HIGH findings still affect the production dependency graph.

#### CRITICAL findings

- **tar 7.5.13** (transitive through the Supabase CLI) — GHSA-23hp-3jrh-7fpw: denial of service through unlimited decompression/input; affected through `<=7.5.18` (the aggregate `tar` finding covers versions through `7.5.20`). Fix: update the direct `supabase` development dependency and regenerate the lockfile so the resolved `tar` version is newer than `7.5.20`.

#### HIGH findings

- **astro 6.3.1** (direct) — GHSA-8hv8-536x-4wqp and GHSA-2pvr-wf23-7pc7: reflected XSS and host-header SSRF. The HIGH ranges are fixed by Astro `6.4.6+`; update at least to the current compatible `6.4.8`, then reassess the remaining MODERATE Astro advisories before a planned Astro 7 upgrade.
- **brace-expansion** (transitive; root instance 1.1.14 plus nested instances) — GHSA-3jxr-9vmj-r5cp and GHSA-mh99-v99m-4gvg: exponential expansion and memory-exhaustion DoS. Fix through parent dependency updates; safe releases must be outside `<=1.1.15`, `3.x`, and `<=5.0.7` affected ranges.
- **devalue 5.8.0** (transitive) — GHSA-77vg-94rm-hx3p: sparse-array deserialization DoS. Fix through an Astro/adapter dependency update resolving a version newer than `5.8.0`.
- **fast-uri 3.1.2** (transitive) — GHSA-v2hh-gcrm-f6hx and GHSA-4c8g-83qw-93j6: host-confusion vulnerabilities. Fix through a parent update resolving `fast-uri` newer than `3.1.3`.
- **js-yaml 4.1.1** (transitive) — GHSA-52cp-r559-cp3m: quadratic CPU consumption in merge-key chains. Fix through a parent update resolving `js-yaml` `4.3.0+`.
- **miniflare 4.20260507.1** (transitive) — aggregate HIGH exposure through `sharp`, `undici`, and `ws`. Fix by updating the Cloudflare adapter/Wrangler chain beyond the affected Miniflare range.
- **postcss 8.5.14** (transitive) — GHSA-r28c-9q8g-f849: path traversal and source-map disclosure. Fix through a parent update resolving `postcss` newer than `8.5.17`.
- **sharp 0.34.5** (transitive) — GHSA-f88m-g3jw-g9cj: inherited libvips vulnerabilities. Fix through parent updates resolving `sharp` `0.35.0+`.
- **svgo 4.0.1** (transitive) — GHSA-2p49-hgcm-8545: incomplete script removal can leave executable SVG content. Fix through a parent update resolving `svgo` `4.0.2+`.
- **undici 7.24.8** (transitive) — GHSA-vmh5-mc38-953g, GHSA-vxpw-j846-p89q, and GHSA-hm92-r4w5-c3mj: TLS validation bypass, WebSocket DoS, and cross-origin routing issues. Fix through parent updates resolving `undici` `7.28.0+`.
- **vite 7.3.3** (transitive override) — GHSA-fx2h-pf6j-xcff: `server.fs.deny` bypass on Windows alternate paths. Fix by updating the override to a Vite version newer than `7.3.4` and verifying Astro compatibility.
- **ws 8.18.0** plus nested instances (transitive) — GHSA-96hv-2xvq-fx4p: memory-exhaustion DoS from fragmented data. Fix through parent updates resolving `ws` `8.21.0+`.

MODERATE findings: 7 affected packages — `@astrojs/language-server`, `@cloudflare/vite-plugin`, `supabase`, `volar-service-yaml`, `wrangler`, `yaml`, and `yaml-language-server`.

LOW findings: 2 affected packages — `@babel/core` (local arbitrary-file-read conditions) and `esbuild` (Windows development-server file-read conditions).

### Outdated Dependencies

Packages with major version gaps: 8

- **@astrojs/cloudflare**: 13.5.0 → 14.1.7
- **@astrojs/react**: 5.0.4 → 6.0.2
- **@eslint/js**: 9.39.4 → 10.0.1
- **astro**: 6.3.1 → 7.1.6
- **eslint**: 9.39.4 → 10.8.0
- **eslint-plugin-astro**: 1.7.0 → 3.0.1 (2 major versions behind)
- **lint-staged**: 16.4.0 → 17.3.0
- **typescript**: 5.9.3 → 7.0.2 (2 major versions behind)

These are informational gaps, not a recommendation to upgrade all packages at once. Security-compatible updates should come first; framework and tooling major upgrades should be isolated and verified separately.

## Test Suite

Test runner: not detected
Tests found: 0 tests
Test execution: not attempted
Configuration: not found
Framework: not configured

⚠ No test runner, test script, test dependency, test configuration, or `*.test.*`/`*.spec.*` file was detected. The agent cannot verify its own changes.

Recommended: install Vitest with `npm install --save-dev vitest @vitest/coverage-v8`, add a `test` script that runs `vitest run`, and start with unit/integration tests for the PRD's preserved critical behavior: work-time calculations, `/start`, `/who`, poll vote replacement, and leave/work conflicts. Add Playwright later for the highest-value administration-panel flows.

## CI/CD

Provider: GitHub Actions
Configuration: `.github/workflows/ci.yml`

| Stage | Status | Notes |
|---|---|---|
| Lint | ✓ | `npm run lint` is configured, but the local command timed out after 120 seconds and a scoped run failed on line endings. The gate is currently not reliable. |
| Test | ✗ | No test runner or CI test step. |
| Build | ✓ | `npm run build` is configured; it was not executed during this read-only health check because Astro build writes generated output. |
| Type check | ✗ | `npx astro sync` is not a full Astro type check. `tsc --noEmit` passes locally, but templates require `astro check`. |
| Security | ✗ | No dependency or code security scan in CI. |

GitHub Actions is present, so the absence of selected stages is an upcoming CI-hardening task rather than a reason by itself to lower the health verdict. The current lint failure, however, is a local Category A issue because it prevents both people and agents from using the existing verification gate.

## Configuration

### High severity

- **`.git/` repository metadata is absent** — without version history, an agent cannot reliably distinguish, review, or roll back its changes. Fix: initialize Git, review the initial file set, and create a baseline commit before implementation work.

### Medium severity

- **Line-ending policy is missing** — source and configuration files use CRLF while Prettier expects LF. `npx eslint src` reported 920 `Delete ␍` errors; the broader scoped review found the same problem in configuration files. Fix: define deterministic LF behavior in `.gitattributes`, normalize the checkout once, and add a non-writing `format:check` script.
- **The linter scans the 3.35 MB reference bundle `app.js`** — `npm run lint` exceeded 120 seconds and Babel deoptimized this file. The PRD says the old bundled implementation is reference material and will not be evolved. Fix: add `app.js` to the global flat-ESLint ignore list and `.prettierignore`; keep `eslint .` resilient for future files.
- **No full Astro type-check command** — `tsconfig.json` extends `astro/tsconfigs/strict`, and `tsc --noEmit` passed, but `.astro` templates are not covered by that command. Fix: add `"check": "astro check"` to package scripts and run it locally before agent handoff.
- **Husky activation is incomplete** — `.husky/pre-commit` exists, but `package.json` has no `prepare` script and `.husky/_` is absent, so a clean install is unlikely to activate the hook. Fix: add `"prepare": "husky"`, run it after installation, and verify the hook in a fresh clone.

### Low severity

- **`.editorconfig` is missing** — editors can introduce inconsistent whitespace and line endings. Fix: add an EditorConfig matching the repository's LF, UTF-8, final-newline, and two-space formatting policy.
- **Runtime/package-manager pins are inconsistent** — `.nvmrc` pins Node 22.14.0, the current local runtime is 22.22.3/npm 10.9.8, CI requests any Node 22, and `package.json` has no `engines` or `packageManager`. Fix: choose one Node 22 version, use it in `.nvmrc` and CI, and declare npm 10.9.8 (or the chosen team version) in `packageManager`.

Present strengths: `package-lock.json`, `.gitignore`, `.env.example`, Prettier, strict type-aware ESLint, strict TypeScript, `AGENTS.md`, `CLAUDE.md`, Cloudflare deployment configuration, and GitHub Actions are all present.

## Stack Assessment Cross-Reference

No `context/foundation/stack-assessment.md` was found. Run `/10x-stack-assess` for quality-gate analysis. This report used the brownfield PRD's scope to prioritize tests around preserved bot behavior and to classify `app.js` as reference material rather than active implementation.

## Recommended Fixes

### Fix before agent work (Category A)

### 1. Patch CRITICAL and HIGH dependency findings

**Impact**: Vulnerable framework/runtime dependencies make generated and reviewed changes unsafe to deploy; the vulnerable Supabase CLI chain also affects developer and CI environments.
**Severity**: critical
**Effort**: moderate (15–30 min)
**Fix**:

Work on a dedicated branch after establishing a Git baseline. Start with compatible direct updates, regenerate the lockfile, and re-audit:

```powershell
npm install astro@^6.4.8 @astrojs/cloudflare@^13.7.0
npm install --save-dev supabase@^2.111.0 wrangler@^4.118.0
npm update
npm audit
npm audit --omit=dev
```

Confirm with `npm explain tar` that `tar` resolves newer than 7.5.20. If HIGH findings remain, update their owning direct dependencies deliberately; do not use `npm audit fix --force` as a blanket major-version migration.

### 2. Add a working test runner and first critical-path tests

**Impact**: Without tests, an agent cannot prove that changes preserve the work-time rules and chat commands identified as critical in the PRD.
**Severity**: critical
**Effort**: significant (> 1 hour)
**Fix**:

```powershell
npm install --save-dev vitest @vitest/coverage-v8
```

Add scripts for `vitest run`, watch mode, and coverage. Create the first tests around work-time calculation, `/start`, `/who`, vote replacement, leave/work conflict handling, and authorization boundaries. Keep external Supabase/Google Chat calls behind testable adapters.

### 3. Restore a deterministic lint and formatting gate

**Impact**: The current verification command either times out or fails on every source file, so agents cannot use it as a reliable completion check.
**Severity**: high
**Effort**: moderate (15–30 min)
**Fix**:

Add `.gitattributes` containing `* text=auto eol=lf`; globally ignore the reference `app.js` in flat ESLint and `.prettierignore`; add `"format:check": "prettier --check ."`; normalize tracked text once; then require both commands to pass:

```powershell
npm run format
npm run lint
npm run format:check
```

Review the normalization diff before committing. Also split Astro parser options from TS/TSX options so `astro-eslint-parser` is not repeatedly given the unsupported `projectService` option.

### 4. Add a complete local Astro type check

**Impact**: Strict TypeScript is configured, but errors in `.astro` templates can bypass plain `tsc` and surface late during implementation.
**Severity**: medium
**Effort**: quick (< 5 min)
**Fix**:

Add `"check": "astro check"` to `package.json`, then run:

```powershell
npm run check
```

### 5. Establish a Git baseline

**Impact**: Agents need a stable baseline to isolate their edits, produce reviewable diffs, and recover from mistakes.
**Severity**: high
**Effort**: moderate (15–30 min)
**Fix**:

```powershell
git init
git status --short
git add .
git commit -m "chore: establish project baseline"
```

Review ignored files and the staged set before the first commit; do not commit secrets or generated directories.

### 6. Make hooks and tool versions reproducible

**Impact**: A clean environment may silently omit the pre-commit hook or use different Node/npm versions, producing different agent results.
**Severity**: medium
**Effort**: moderate (15–30 min)
**Fix**:

Add `"prepare": "husky"`, `"packageManager": "npm@10.9.8"`, and an agreed Node 22 `engines` range to `package.json`. Pin that same Node version in `.nvmrc` and GitHub Actions, then verify `npm ci` and the hook in a clean checkout.

### 7. Plan framework and tooling major upgrades separately

**Impact**: Eight direct packages have major-version gaps; combining them with feature work would make agent-generated regressions harder to isolate.
**Severity**: medium
**Effort**: significant (> 1 hour)
**Fix**:

Create separate upgrade changes for Astro/adapters, ESLint/plugins, and TypeScript. For each group: read its migration guide, update only that group, run `npm run check`, lint, tests, and build, then commit before starting the next group.

### 8. Add editor-level formatting defaults

**Impact**: Editor defaults can reintroduce line-ending and whitespace churn even after the repository is normalized.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**:

Add `.editorconfig` with UTF-8, LF, final newline, trimming of trailing whitespace, and two-space indentation for JS/TS/JSON/CSS/Astro files.

### Addressed in upcoming lessons (Category B)

### Complete CI quality and security coverage

**Lesson**: [Sprint Zero z Agentem: infrastruktura, walking skeleton i pierwszy deploy (M1L5)](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l5)
**What you'll do there**: Extend the existing GitHub Actions job with `npm run check`, non-writing format validation, tests/coverage, `npm audit --audit-level=high`, minimal permissions, concurrency cancellation, and artifacts after the local commands are healthy.

### Automate deployment safeguards

**Lesson**: [Sprint Zero z Agentem: infrastruktura, walking skeleton i pierwszy deploy (M1L5)](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l5)
**What you'll do there**: Turn the current manual Wrangler deployment configuration into an intentional deployment pipeline with environment protection, secrets, and a verified walking skeleton.

The existing `AGENTS.md` and `CLAUDE.md` mean no missing instruction-file finding is recorded. [Agent Onboarding: Agents.md, AI Rules i feedback loops (M1L4)](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l4) can refine their content rather than create premature stubs.

## Summary

Health status: critical-issues

The project has a reproducible npm lockfile, strict TypeScript, strong lint/format configuration, documented environment variables, deployment configuration, and a GitHub Actions workflow. It is not yet ready for dependable agent-assisted implementation because it has a CRITICAL development-dependency finding, 11 HIGH findings in the production graph, no test runner, no Git baseline, and a lint gate that currently times out or fails solely on repository-wide formatting policy.

Next step: establish the Git baseline, address the security and deterministic-lint findings, and add critical-path tests before feature implementation; then proceed to agent onboarding and the upcoming CI/infrastructure lesson.
