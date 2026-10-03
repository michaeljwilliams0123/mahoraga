import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const mount = readFileSync(join(root, "components/cockpit/UndiciSecurityBumpCard.tsx"), "utf8");
const card = readFileSync(join(root, "components/cockpit/BotAuthorityParityCard.tsx"), "utf8");

describe("7.0.0-alpha.2 bot authority parity cockpit", () => {
  it("surfaces drift-guarded bot parity as observational and not traffic authority", () => {
    assert.match(cockpit, /<UndiciSecurityBumpCard \/>/);
    assert.match(cockpit, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(cockpit, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.doesNotMatch(cockpit, /<h2>7\.0\.0-alpha\.2/);
    assert.match(mount, /import \{ BotAuthorityParityCard \} from "\.\/BotAuthorityParityCard"/);
    assert.match(mount, /<BotAuthorityParityCard \/>/);
    assert.match(card, /Bot operational parity/);
    assert.match(card, /Drift-guarded \/ not live/);
    assert.match(card, /issue #962/);
    assert.match(card, /Bot identity alone never grants power/);
    assert.match(card, /bot-authority-drift/);
    assert.match(card, /non-delegable/);
    assert.match(card, /No blanket bot == owner shortcut/);
    assert.match(card, /Closed #964 is not live authority/);
    assert.match(card, /zero-route, zero-influence, zero-fallback, zero-authority/);
    assert.match(card, /does not grant traffic authority/);
  });
});
