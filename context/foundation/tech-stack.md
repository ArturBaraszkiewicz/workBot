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

## Why this stack

workBot is a TypeScript web application with API endpoints, persistent data, authentication, and a three-week after-hours delivery window. The recommended Astro starter combines a React administration panel, typed API routes, Supabase PostgreSQL and authentication, and a Cloudflare deployment path in one conventional codebase. It keeps the initial architecture compact while supporting the Google Chat bot endpoint and reporting features. Company SSO requires explicit provider configuration, but the underlying authentication capability is present. GitHub Actions with automatic deployment after merge follows the selected defaults. Bootstrapper support is first-class: the starter is registered with a valid scaffold command, though occasional manual setup may still be needed.
