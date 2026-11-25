// scripts/verify-sse-scope.ts
// Quick assertion harness for the SSE org-scoping rule (lib/sseScope.ts).
// Run:  npx tsx scripts/verify-sse-scope.ts
//
// Not a full test framework — this repo has no test runner yet. It exists so the
// security-critical scoping predicate can be executed and checked before deploy.

import { inScope, GLOBAL_SCOPE } from "../lib/sseScope"

const COUNTRY = "ethiopia"
const DIV     = "ethiopia/fixed-network"
const REGION  = "ethiopia/fixed-network/o&m/ser"
const AREA    = "ethiopia/fixed-network/o&m/ser/adama-1"
const OTHER   = "ethiopia/wireless-network/o&m/naaz"

const cases: [string, boolean, string][] = [
  // [desc, expected, viewerPath/targetPath]
  ["country viewer sees country-scoped event",        true,  `${COUNTRY}|${COUNTRY}`],
  ["country viewer sees area event",                  true,  `${COUNTRY}|${AREA}`],
  ["division viewer sees its own region event",       true,  `${DIV}|${REGION}`],
  ["division viewer sees its own event",              true,  `${DIV}|${DIV}`],
  ["area viewer sees its own event",                  true,  `${AREA}|${AREA}`],
  ["region viewer does NOT see a deeper area event",  true,  `${REGION}|${AREA}`],
  ["area viewer does NOT see region event",           false, `${AREA}|${REGION}`],
  ["region viewer does NOT see sibling org event",    false, `${REGION}|${OTHER}`],
  ["division viewer does NOT see other division",     false, `${DIV}|${OTHER}`],
  ["prefix collision protected (eth vs eth-x)",       false, `ethiopia|ethiopiax/site`],
  ["explicit global signal delivered",                true,  `${AREA}|${GLOBAL_SCOPE}`],
  ["missing orgPath fails closed",                    false, `${COUNTRY}|${undefined}`],
  ["null orgPath fails closed",                       false, `${COUNTRY}|${null}`],
  ["empty orgPath fails closed",                      false, `${COUNTRY}|${""}`],
  ["non-string orgPath fails closed",                 false, `${COUNTRY}|${123}`],
  ["object orgPath fails closed",                     false, `${COUNTRY}|${{}}`],
]

let pass = 0
let fail = 0

for (const [desc, expected, spec] of cases) {
  const [viewer, target] = spec.split("|")
  // the last two cases pass non-string values through the split — handle them
  const targetValue: unknown =
    target === String(undefined) ? undefined
    : target === String(null)    ? null
    : target === "123"           ? 123
    : target === "[object Object]" ? {}
    : target
  const actual = inScope(viewer, targetValue)
  const ok = actual === expected
  if (ok) pass++
  else fail++
  console.log(`${ok ? "PASS" : "FAIL"}  ${desc}  (viewer=${viewer} target=${String(targetValue)})`)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
