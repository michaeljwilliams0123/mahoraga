import { startRedditEvolutionApiServer } from "../src/reddit-evolution-api.mjs";
import { DEFAULT_REDDIT_EVOLUTION_USER } from "../src/reddit-evolution-intake.mjs";

const secret = process.env.MAHORAGA_REDDIT_INGRESS_SECRET;
const allowedUser = process.env.MAHORAGA_REDDIT_ALLOWED_USER ?? DEFAULT_REDDIT_EVOLUTION_USER;
const host = process.env.MAHORAGA_REDDIT_INGRESS_HOST ?? "127.0.0.1";
const port = Number(process.env.MAHORAGA_REDDIT_INGRESS_PORT ?? "4784");

if (typeof secret !== "string" || secret.length < 32) {
  console.error("MAHORAGA_REDDIT_INGRESS_SECRET must be set to a high-entropy value of at least 32 characters.");
  process.exit(2);
}

const runtime = await startRedditEvolutionApiServer({ secret, allowedUser, host, port });
const address = runtime.address;
console.log(`Reddit evolution API ready at http://${address.address}:${address.port} for u/${allowedUser}`);
console.log("Accepted path: POST /api/intake/reddit/evolution-signal with x-mahoraga-reddit-timestamp and x-mahoraga-reddit-signature.");
console.log("This ingress emits receipts and read-only proposal plans only; it does not execute Reddit text or vend GitHub authority.");

const shutdown = async () => {
  await runtime.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
