import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const writeServer = readFileSync(join(root, "operator-deck/src/lib/fleet/write.server.ts"), "utf8");
const arsenal = readFileSync(join(root, "operator-deck/src/lib/fleet/arsenal.ts"), "utf8");

const ACTIVE_RULESET_ID = "22502690";
const RETIRED_RULESET_ID = "22327855";

test("operator write plane targets the active Protect main ruleset", () => {
  assert.match(writeServer, new RegExp(`const RULESET_ID = "${ACTIVE_RULESET_ID}"`));
  assert.doesNotMatch(writeServer, new RegExp(RETIRED_RULESET_ID));
});

test("operator arsenal identifies the active Protect main ruleset", () => {
  assert.match(arsenal, new RegExp(`Ruleset ${ACTIVE_RULESET_ID}`));
  assert.doesNotMatch(arsenal, new RegExp(`Ruleset ${RETIRED_RULESET_ID}`));
});
