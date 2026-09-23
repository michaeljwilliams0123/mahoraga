import { readFile } from "node:fs/promises";

const state = JSON.parse(await readFile(new URL("../state/zero-credit-provider.json", import.meta.url), "utf8"));
const valid = state.billingBoundary === "standalone-workers-free-account"
  && state.provider === "cloudflare-workers-ai"
  && state.paidFallback !== true
  && state.trafficAuthorityVerified === false;
if (!valid) {
  process.stderr.write("zero-credit-provider-state-invalid\n");
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({ status: state.status, liveCognitionAuthorized: state.liveCognitionAuthorized, zeroDollarStopGuaranteed: state.zeroDollarStopGuaranteed })}\n`);
}
