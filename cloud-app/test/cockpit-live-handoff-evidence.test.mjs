import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const pagesStatus = readFileSync(join(root, "components/cockpit/PagesWorkspaceStatusCard.tsx"), "utf8");
const sessionCard = readFileSync(join(root, "components/cockpit/PagesSameOriginSessionCard.tsx"), "utf8");

test("cockpit presents bounded handoff and live capability evidence without authority claims", () => {
  assert.match(sessionCard, /one automatic handoff per tab/);
  assert.match(sessionCard, /HTTPS origin is validated/);
  assert.match(sessionCard, /retains the current view/);
  assert.match(sessionCard, /loop protection is unavailable, automatic navigation stops/);
  assert.match(sessionCard, /explicitly choose Cloudflare sign-in/);
  assert.match(sessionCard, /not an always-on redirect/);
  assert.match(sessionCard, /does not change authenticated runtime-connection handling/);

  assert.match(pagesStatus, /dynamic runtime client/);
  assert.match(pagesStatus, /Capability refresh follows the authenticated runtime connection regardless of publication host/);
  assert.match(pagesStatus, /health metadata alone is not live capability evidence/);
  assert.match(cockpit, /runtimeCapabilities\.length === 0/);
  assert.match(cockpit, /Not capability-ready · no abilities loaded/);
  assert.match(cockpit, /malformed replies are rejected/);
  assert.match(cockpit, /not proof of AGI or SGI/);
  assert.match(cockpit, /Execution readiness, cognition readiness, and traffic authority remain separate/);
  assert.doesNotMatch(`${cockpit}\n${pagesStatus}\n${sessionCard}`, /authenticated owner execution proven/i);
});
