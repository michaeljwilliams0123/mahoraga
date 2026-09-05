import crypto from "node:crypto";

const MIN_SECRET_BYTES = 32;

export function signN8nPayload(payload, secret) {
  const key = validatedSecret(secret);
  return crypto.createHmac("sha256", key).update(payloadBytes(payload)).digest("hex");
}

export function verifyN8nSignature(payload, signature, secret) {
  const key = validatedSecret(secret);
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac("sha256", key).update(payloadBytes(payload)).digest();
  const supplied = Buffer.from(signature, "hex");
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

export function verifyN8nWebhookSignature(request, response, next, { secret = process.env.MAHORAGA_N8N_SECRET } = {}) {
  let authorized = false;
  try {
    const signature = singleHeader(request?.headers?.["x-mahoraga-signature"]);
    authorized = verifyN8nSignature(request?.rawBody ?? Buffer.alloc(0), signature, secret);
  } catch {
    authorized = false;
  }
  if (!authorized) {
    response.writeHead(403, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ error: "n8n-signature-invalid" }));
    return false;
  }
  if (typeof next !== "function") throw new TypeError("n8n-next-required");
  next();
  return true;
}

function validatedSecret(secret) {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) throw new TypeError("n8n-secret-invalid");
  return secret;
}

function payloadBytes(payload) {
  if (Buffer.isBuffer(payload)) return payload;
  if (typeof payload === "string") return Buffer.from(payload, "utf8");
  if (payload instanceof Uint8Array) return Buffer.from(payload);
  throw new TypeError("n8n-payload-must-be-raw-bytes");
}

function singleHeader(value) {
  if (Array.isArray(value)) return String(value[0] ?? "");
  return String(value ?? "");
}