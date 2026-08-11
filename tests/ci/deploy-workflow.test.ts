import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const workflow = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8").replaceAll(
  "\r\n",
  "\n",
);

function job(name: string, nextName?: string): string {
  const start = workflow.indexOf(`  ${name}:`);
  const end = nextName ? workflow.indexOf(`  ${nextName}:`, start + 1) : workflow.length;

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return workflow.slice(start, end);
}

describe("production deployment workflow", () => {
  const ciJob = job("ci", "deploy");
  const deployJob = job("deploy");

  it("never deploys pull requests and waits for the main-branch CI job", () => {
    expect(workflow).toContain("pull_request:\n    branches: [main]");
    expect(deployJob).toContain("needs: ci");
    expect(deployJob).toContain("if: github.event_name == 'push' && github.ref == 'refs/heads/main'");
    expect(deployJob).not.toContain("pull_request_target");
  });

  it("uses minimal GitHub permissions and only Cloudflare deployment secrets", () => {
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(deployJob).toContain("CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}");
    expect(deployJob).toContain("CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}");
    expect(deployJob).not.toMatch(/\$\{\{\s*secrets\.(?:SUPABASE|GOOGLE)/);
  });

  it("runs all CI gates before a clean production build and deploy", () => {
    expect(ciJob).toContain("- run: npm test");
    expect(ciJob).toContain("- run: npm run test:db");
    expect(ciJob).toContain("- run: npm run lint");
    expect(ciJob).toContain("- run: npm run build");
    expect(deployJob).toContain("- run: npm ci");

    const build = deployJob.indexOf("npm run build -- --mode production");
    const deploy = deployJob.indexOf("npx wrangler deploy --config");

    expect(build).toBeGreaterThanOrEqual(0);
    expect(deploy).toBeGreaterThan(build);
  });

  it("records the rollback target, deployed version, and Worker address", () => {
    expect(deployJob).toContain("wrangler deployments status");
    expect(deployJob).toContain("Previous version");
    expect(deployJob).toContain("npx wrangler rollback");
    expect(deployJob).toContain("New version");
    expect(deployJob).toContain("Address:");
    expect(deployJob.match(/GITHUB_STEP_SUMMARY/g)).toHaveLength(2);
  });
});
