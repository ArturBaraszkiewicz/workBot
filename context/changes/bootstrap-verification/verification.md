---
bootstrapped_at: 2026-07-31T13:06:30Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: workbot
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

```yaml
---
starter_id: 10x-astro-starter
package_manager: npm
project_name: workbot
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---
```

## Why this stack

workBot is a TypeScript web application with API endpoints, persistent data, authentication, and a three-week after-hours delivery window. The recommended Astro starter combines a React administration panel, typed API routes, Supabase PostgreSQL and authentication, and a Cloudflare deployment path in one conventional codebase. It keeps the initial architecture compact while supporting the Google Chat bot endpoint and reporting features. Company SSO requires explicit provider configuration, but the underlying authentication capability is present. GitHub Actions with automatic deployment after merge follows the selected defaults. Bootstrapper support is first-class: the starter is registered with a valid scaffold command, though occasional manual setup may still be needed.

## Pre-scaffold verification

| Signal | Value | Severity | Notes |
| --- | --- | --- | --- |
| npm package | not run | n/a | Starter command begins with `git clone`; no create-package could be derived. |
| GitHub repo | `przeprogramowani/10x-astro-starter` last pushed `2026-05-17T10:33:39Z` | fresh | Read from the public GitHub API. Local `gh` was unavailable, so the API was queried directly. |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`

**Strategy**: git-clone

**Exit code**: 0

**Files moved**: 31536

**Conflicts (.scaffold siblings)**: none

**.gitignore handling**: moved silently

**.bootstrap-scaffold cleanup**: deleted

**Upstream Git history**: `.bootstrap-scaffold/.git/` deleted before move-up; no root `.git/` was created.

**Shell compatibility note**: Windows PowerShell did not accept `&&`, so the successful run used an equivalent single-shell sequence with explicit exit-code guards between `git clone`, directory change, and `npm install`.

## Post-scaffold audit

**Tool**: `npm audit --json`

**Exit code**: 1 (expected when findings are present)

**Summary**: 1 CRITICAL, 12 HIGH, 7 MODERATE, 2 LOW

**Direct vs transitive**: 0/1/2/0 direct of total 1/12/7/2. Direct findings are `astro` (HIGH), `supabase` (MODERATE), and `wrangler` (MODERATE); the CRITICAL finding is transitive.

All 22 finding groups reported `fixAvailable: true`; npm did not provide exact fixed versions in this report.

### CRITICAL findings

- **tar 7.5.13** — transitive through `supabase`. Advisories: `GHSA-vmf3-w455-68vh`, `GHSA-w8wr-v893-vjvp`, `GHSA-23hp-3jrh-7fpw`, `GHSA-8x88-c5mf-7j5w`, `GHSA-gvwx-54wh-qm9j`, `GHSA-r292-9mhp-454m`. Includes decompression/parse denial of service and archive parsing issues. Fix available.

### HIGH findings

- **astro 6.3.1** — direct. Advisories: `GHSA-8hv8-536x-4wqp`, `GHSA-2pvr-wf23-7pc7`, `GHSA-jrpj-wcv7-9fh9`, `GHSA-4g3v-8h47-v7g6`, `GHSA-f48w-9m4c-m7f5`, `GHSA-7pw4-f3q4-r2p2`; also inherits findings through `esbuild` and `sharp`. Includes XSS and SSRF issues. Fix available.
- **brace-expansion 1.1.14 and 5.0.6** — transitive. Advisories: `GHSA-3jxr-9vmj-r5cp`, `GHSA-mh99-v99m-4gvg`. Denial of service through unbounded or exponential expansion. Fix available.
- **devalue 5.8.0** — transitive. Advisory: `GHSA-77vg-94rm-hx3p`. Sparse-array deserialization denial of service. Fix available.
- **fast-uri 3.1.2** — transitive. Advisories: `GHSA-v2hh-gcrm-f6hx`, `GHSA-4c8g-83qw-93j6`. Host confusion during URI canonicalization. Fix available.
- **js-yaml 4.1.1** — transitive. Advisories: `GHSA-h67p-54hq-rp68`, `GHSA-52cp-r559-cp3m`. Quadratic CPU consumption through YAML merge-key chains. Fix available.
- **miniflare 4.20260507.1** — transitive. Inherits findings through `sharp`, `undici`, and `ws`. Fix available.
- **postcss 8.5.14** — transitive. Advisory: `GHSA-r28c-9q8g-f849`. Source-map path traversal and file disclosure. Fix available.
- **sharp 0.34.5** — transitive. Advisory: `GHSA-f88m-g3jw-g9cj`. Inherited libvips vulnerabilities. Fix available.
- **svgo 4.0.1** — transitive. Advisory: `GHSA-2p49-hgcm-8545`. Script-removal bypass. Fix available.
- **undici 7.24.8** — transitive. Advisories: `GHSA-vmh5-mc38-953g`, `GHSA-p88m-4jfj-68fv`, `GHSA-vxpw-j846-p89q`, `GHSA-hm92-r4w5-c3mj`, `GHSA-35p6-xmwp-9g52`, `GHSA-g8m3-5g58-fq7m`, `GHSA-pr7r-676h-xcf6`. Includes TLS validation bypass, request-routing, queue-poisoning, and denial-of-service issues. Fix available.
- **vite 7.3.3** — transitive. Advisories: `GHSA-v6wh-96g9-6wx3`, `GHSA-fx2h-pf6j-xcff`. Windows path handling can disclose credentials or bypass filesystem deny rules. Fix available.
- **ws 8.18.0 and 8.20.0** — transitive. Advisories: `GHSA-58qx-3vcg-4xpx`, `GHSA-96hv-2xvq-fx4p`. Memory disclosure and fragmentation-based denial of service. Fix available.

### MODERATE findings

- **@astrojs/language-server 2.16.8** — transitive through `volar-service-yaml`. Fix available.
- **@cloudflare/vite-plugin 1.36.3** — transitive through `miniflare`, `wrangler`, and `ws`. Fix available.
- **supabase 2.98.2** — direct; inherits the `tar` finding. Fix available.
- **volar-service-yaml 0.0.70** — transitive through `yaml-language-server`. Fix available.
- **wrangler 4.90.0** — direct; inherits findings through `esbuild` and `miniflare`. Fix available.
- **yaml 2.7.1** — transitive. Advisory: `GHSA-48c2-rrv3-qjmp`. Deeply nested collections can cause stack overflow. Fix available.
- **yaml-language-server 1.20.0** — transitive through `yaml`. Fix available.

### LOW / INFO findings

- **@babel/core 7.29.0** — transitive. Advisory: `GHSA-4x5r-pxfx-6jf8`. Local arbitrary file read through source-map comments. Fix available.
- **esbuild 0.27.7 and 0.27.3** — transitive. Advisory: `GHSA-g7r4-m6w7-qqqr`. Development-server file read on Windows. Fix available.

## Hints recorded but not acted on

| Hint | Value |
| --- | --- |
| bootstrapper_confidence | first-class |
| quality_override | false |
| path_taken | standard |
| self_check_answers | null |
| team_size | solo |
| deployment_target | cloudflare-pages |
| ci_provider | github-actions |
| ci_default_flow | auto-deploy-on-merge |
| has_auth | true |
| has_payments | false |
| has_realtime | false |
| has_ai | false |
| has_background_jobs | false |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:

- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
