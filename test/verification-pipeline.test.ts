import test from "node:test";
import assert from "node:assert/strict";
import { VerificationPipeline } from "../src/core/VerificationPipeline.ts";
import type { BrandedASTNode } from "../src/types/mahoraga.ts";

const branded = (value: string) => value as BrandedASTNode;

test("verifier returns stable SHA-256 evidence without executing candidate source", async () => {
  const source = branded("function stable() { return 1; }");
  const first = await VerificationPipeline.evaluatePreRollbackCanary(source, 1000);
  const second = await VerificationPipeline.evaluatePreRollbackCanary(source, 1000);
  assert.equal(first.isVerifiedStable, true);
  assert.equal(first.computedSignature, second.computedSignature);
  assert.match(first.computedSignature, /^[a-f0-9]{64}$/);
});

test("verifier rejects empty, non-function, and syntactically malformed source while retaining evidence", async () => {
  for (const candidate of ["", "undefined_locus", "// function", "function stable(", "function stable() {} this is invalid"]) {
    const report = await VerificationPipeline.evaluatePreRollbackCanary(branded(candidate), 1000);
    assert.equal(report.isVerifiedStable, false);
    assert.match(report.computedSignature, /^[a-f0-9]{64}$/);
  }
});

test("verifier parses syntax instead of rejecting delimiter characters inside literals", async () => {
  const report = await VerificationPipeline.evaluatePreRollbackCanary(
    branded("function stable() { return '{ unmatched-looking literal'; }"),
    1000,
  );
  assert.equal(report.isVerifiedStable, true);
});

test("verifier hashes Unicode source deterministically", async () => {
  const candidate = branded("function Ω() { return '輪'; }");
  const first = await VerificationPipeline.evaluatePreRollbackCanary(candidate, 1000);
  const second = await VerificationPipeline.evaluatePreRollbackCanary(candidate, 1000);
  assert.equal(first.computedSignature, second.computedSignature);
  assert.equal(first.computedSignature.length, 64);
});

test("non-positive or non-finite CPU budgets fail closed", async () => {
  for (const budget of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    await assert.rejects(
      VerificationPipeline.evaluatePreRollbackCanary(branded("function stable() {}"), budget),
      /ERR_MAHORAGA_CPU_003/,
    );
  }
});
