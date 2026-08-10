import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const srcRoot = fileURLToPath(new URL("./src/", import.meta.url));
const testRoot = fileURLToPath(new URL("./tests/", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: "astro:env/server", replacement: `${testRoot}shims/astro-env-server.ts` },
      { find: "astro:middleware", replacement: `${testRoot}shims/astro-middleware.ts` },
      { find: /^@\//, replacement: srcRoot },
    ],
  },
});
