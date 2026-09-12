import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

async function source(relative) {
  return readFile(path.join(ROOT, relative), "utf8");
}

test("Windows cloud runtime persists encrypted relay credentials across verified convergence", async () => {
  const [install, runner, convergence] = await Promise.all([
    source("scripts/install-cloud-runtime.ps1"),
    source("scripts/run-cloud-runtime.ps1"),
    source("scripts/runtime-convergence.ps1"),
  ]);

  assert.match(install, /ConvertFrom-SecureString/);
  assert.match(install, /relay-token\.dpapi/);
  assert.match(install, /Mahoraga Cloud Runtime/);
  assert.match(install, /New-ScheduledTaskTrigger -AtLogOn/);
  assert.match(install, /RepetitionInterval/);
  assert.match(install, /MultipleInstances IgnoreNew/);

  assert.match(runner, /ConvertTo-SecureString/);
  assert.match(runner, /MAHORAGA_RELAY_LOCAL_ACCESS_TOKEN/);
  assert.match(runner, /MAHORAGA_DATABASE_FILE/);
  assert.match(runner, /src\\cli\.mjs/);
  assert.doesNotMatch(runner, /Write-Output.*RELAY_LOCAL_ACCESS_TOKEN|echo.*RELAY_LOCAL_ACCESS_TOKEN/i);

  assert.match(convergence, /relay-token\.dpapi/);
  assert.match(convergence, /MAHORAGA_RELAY_LOCAL_ACCESS_TOKEN/);
  assert.match(convergence, /ConvertTo-SecureString/);
});
