import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const uiOnly = { skip: existsSync(new URL("../node_modules/react/package.json", import.meta.url)) ? false : "Renderer runs when UI dependencies are installed." };

test("chat details show the turn source as reported metadata and retain unknown provenance", uiOnly, async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const directory = await mkdtemp(join(tmpdir(), "mahoraga-chat-details-"));
  try {
    execFileSync(process.execPath, [fileURLToPath(new URL("./bin/tsc", import.meta.resolve("typescript/package.json"))),
      fileURLToPath(new URL("../components/workspace/ChatExecutionDetails.tsx", import.meta.url)),
      "--ignoreConfig", "--noCheck", "--jsx", "react-jsx", "--module", "esnext", "--target", "es2022", "--outDir", directory]);
    const code = (await readFile(join(directory, "ChatExecutionDetails.js"), "utf8"))
      .replace('import "./chat-execution-details.css";', "")
      .replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")));
    const Details = (await import(`data:text/javascript,${encodeURIComponent(code)}`)).ChatExecutionDetails;
    const evidence = { status: "reported", taskId: "turn", workerId: "worker", providerId: "provider", costClass: "deterministic", creditPolicy: "zero-codex" };
    for (const sourceSHA of ["b".repeat(40), undefined]) {
      const html = renderToStaticMarkup(createElement(Details, { evidence: { ...evidence, sourceSHA } }));
      assert.match(html, /Runtime-reported task metadata/);
      assert.ok(html.includes(`<dt>Execution source SHA</dt><dd>${sourceSHA ?? "Unknown"}</dd>`));
      assert.match(html, /Independent execution verification: not supplied/);
      assert.match(html, /Independent source verification, authentication, authority, routing, durable-result and replay receipts: not supplied/);
    }
    assert.match(renderToStaticMarkup(createElement(Details)), /Execution metadata unavailable/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
