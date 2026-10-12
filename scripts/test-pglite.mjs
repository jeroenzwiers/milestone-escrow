// Runs the unit tests against the Postgres backend, using PGlite (Postgres compiled to
// WebAssembly, in-process) instead of a real server. Each test file gets its own database.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
execFileSync(process.execPath, [require.resolve("tsx/cli"), "--test", "--test-concurrency=2", "tests/*.test.ts"], {
  stdio: "inherit",
  env: { ...process.env, STORE: "pglite", DATABASE_URL: "" },
});
