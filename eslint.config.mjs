import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local-only: .kilo/ holds agent worktrees — complete, stale CHECKOUTS of
    // this repo (git-ignored via .git/info/exclude, never present in CI). Linting
    // them doubled the report and made `npm run lint` diverge from the gate that
    // actually runs in .github/workflows/ci.yml.
    ".kilo/**",
  ]),
]);

export default eslintConfig;
