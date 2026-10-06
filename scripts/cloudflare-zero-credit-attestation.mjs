import { createHash } from "node:crypto";
import { buildZeroCreditBillingAttestation, fetchZeroCreditBillingEvidence } from "../src/cloudflare-zero-credit-billing.ts";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export { buildZeroCreditBillingAttestation, fetchZeroCreditBillingEvidence };

const run = async () => {
  const outputIndex = process.argv.indexOf("--output");
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : "";
  const token = (process.env.CLOUDFLARE_API_TOKEN ?? "").trim();
  const billingReadToken = (process.env.CLOUDFLARE_BILLING_READ_TOKEN ?? "").trim();
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  if (!output || !token || !/^[a-f0-9]{32}$/i.test(accountId)) throw new Error("cloudflare-billing-evidence-config-invalid");
  const { accountSettingsEnvelope, subscriptionsEnvelope } = await fetchZeroCreditBillingEvidence({
    accountId, deploymentToken: token, billingReadToken,
  });
  const accountIdHash = createHash("sha256").update(accountId).digest("hex");
  const attestation = buildZeroCreditBillingAttestation({ accountIdHash, accountSettingsEnvelope, subscriptionsEnvelope });
  await writeFile(output, JSON.stringify(attestation), { encoding: "utf8", mode: 0o600 });
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
