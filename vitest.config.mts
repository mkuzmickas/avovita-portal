import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // server-only is a guard module that throws when bundled into a client
      // component. Vitest doesn't run inside Next's RSC graph, so we stub it.
      "server-only": fileURLToPath(
        new URL("./src/__tests__/_stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: false,
  },
});
