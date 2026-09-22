export type ConversationContentRole = "user" | "assistant";

export interface ConversationContentInput {
  contentId: string;
  conversationId: string;
  role: ConversationContentRole;
  plaintext: string;
  createdAt: number;
}

export interface EncryptedContentRecord {
  contentId: string;
  conversationId: string;
  role: ConversationContentRole;
  ciphertext: string;
  iv: string;
  contentHash: string;
  createdAt: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const AES_GCM_IV_BYTES = 12;
const AES_256_KEY_BYTES = 32;
const AAD_VERSION = 1;

const encodeBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

const decodeBase64Url = (value: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("content-vault-encoding-invalid");
  const standard = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = `${standard}${"=".repeat((4 - (standard.length % 4)) % 4)}`;
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const importVaultKey = async (secret: string): Promise<CryptoKey> => {
  let raw: Uint8Array;
  try {
    raw = decodeBase64Url(secret);
  } catch {
    throw new Error("content-vault-key-invalid");
  }
  if (raw.byteLength !== AES_256_KEY_BYTES) throw new Error("content-vault-key-invalid");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
};

const additionalData = (record: Pick<EncryptedContentRecord, "contentId" | "conversationId" | "role">): Uint8Array =>
  encoder.encode(JSON.stringify([
    AAD_VERSION,
    record.contentId,
    record.conversationId,
    record.role,
  ]));

const sha256 = async (value: Uint8Array): Promise<string> =>
  encodeBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", value)));

const secureEqualText = (left: string, right: string): boolean => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

const assertIdentity = (input: Pick<ConversationContentInput, "contentId" | "conversationId" | "role">): void => {
  if (!input.contentId.trim() || !input.conversationId.trim()) throw new Error("content-vault-identity-invalid");
  if (input.role !== "user" && input.role !== "assistant") throw new Error("content-vault-role-invalid");
};

export const encryptConversationContent = async (
  input: ConversationContentInput,
  secret: string,
): Promise<EncryptedContentRecord> => {
  assertIdentity(input);
  if (!Number.isSafeInteger(input.createdAt) || input.createdAt < 0) throw new Error("content-vault-created-at-invalid");
  const key = await importVaultKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const plaintext = encoder.encode(input.plaintext);
  const recordIdentity = {
    contentId: input.contentId,
    conversationId: input.conversationId,
    role: input.role,
  } satisfies Pick<EncryptedContentRecord, "contentId" | "conversationId" | "role">;
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: additionalData(recordIdentity), tagLength: 128 },
    key,
    plaintext,
  );

  return {
    ...recordIdentity,
    ciphertext: encodeBase64Url(new Uint8Array(encrypted)),
    iv: encodeBase64Url(iv),
    contentHash: await sha256(plaintext),
    createdAt: input.createdAt,
  };
};

export const decryptConversationContent = async (
  record: EncryptedContentRecord,
  secret: string,
): Promise<string> => {
  try {
    assertIdentity({
      contentId: record.contentId,
      conversationId: record.conversationId,
      role: record.role,
    });
    const key = await importVaultKey(secret);
    const iv = decodeBase64Url(record.iv);
    if (iv.byteLength !== AES_GCM_IV_BYTES) throw new Error("content-vault-iv-invalid");
    const ciphertext = decodeBase64Url(record.ciphertext);
    const decrypted = new Uint8Array(await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: additionalData(record), tagLength: 128 },
      key,
      ciphertext,
    ));
    const digest = await sha256(decrypted);
    if (!secureEqualText(digest, record.contentHash)) throw new Error("content-vault-hash-mismatch");
    return decoder.decode(decrypted);
  } catch {
    throw new Error("content-vault-decryption-failed");
  }
};
