import { defineConfig } from "vitest/config";

// Without its own config, vitest would pick up the Next app's one in the parent
// directory.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Pinned here because Envio also reads indexer/.env, whose values are for a
    // real run. Both chains are on in the tests, so they can prove the two never
    // share a row; the real default skips Monad until there is an API token.
    env: {
      ENVIO_THENAR_SKIP_MONAD: "false",
      ENVIO_THENAR_SKIP_LOCAL: "false",
      ENVIO_THENAR_MONAD_START_BLOCK: "64987386",
      ENVIO_THENAR_LOCAL_START_BLOCK: "0",
    },
  },
});
