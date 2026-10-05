import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { transformSync } from "next/dist/build/swc/index.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const dataModule = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const helper = dataModule(stripTypeScriptTypes(readFileSync(new URL("../lib/capability-families.ts", import.meta.url), "utf8")));
const component = transformSync(readFileSync(new URL("../components/workspace/CapabilityExplorer.tsx", import.meta.url), "utf8"), { jsc: { parser: { syntax: "typescript", tsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "es6" } }).code
  .replace('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")))
  .replace('"react"', JSON.stringify(import.meta.resolve("react")))
  .replace('"@/lib/capability-families"', JSON.stringify(helper));
const { CapabilityExplorer } = await import(dataModule(component));
const capabilities = [{ capability: "cognitive.predict", enabled: true, routable: true, costClass: "deterministic", workerIds: ["predictor"] }, { capability: "repository.write", routable: false, workerIds: [], routingReason: "owner-approval-required" }];
const render = coreReady => renderToStaticMarkup(createElement(CapabilityExplorer, { coreReady, capabilities, onChooseStarter: () => { throw new Error("Rendering must not submit work"); } }));
test("explorer renders blocked reasons and a draft-only prediction starter", () => {
  const html = render(true);
  assert.match(html, /repository.write/);
  assert.match(html, /owner-approval-required/);
  assert.match(html, /Try prediction/);
  assert.doesNotMatch(html, /Try planning/);
});
test("disconnect removes actionable starters from cached capability cards", () => {
  const html = render(false);
  assert.match(html, /Connect to the runtime/);
  assert.doesNotMatch(html, /Try prediction|predictor/);
});
