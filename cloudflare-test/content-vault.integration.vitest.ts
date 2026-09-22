import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import {
  decryptConversationContent,
  encryptConversationContent,
} from "../deploy/cloudflare-execution-runtime/content-vault";
import { type ExecutionDurableObject } from "../deploy/cloudflare-execution-runtime/worker";

const vaultSecret = (): string => {
  const bytes = new Uint8Array(32).fill(7);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

describe("Cloudflare encrypted conversation vault", () => {
  it("round-trips content while binding ciphertext to conversation identity", async () => {
    const secret = vaultSecret();
    const record = await encryptConversationContent({
      contentId: "content-1",
      conversationId: "conversation-1",
      role: "user",
      plaintext: "private prompt body",
      createdAt: 1000,
    }, secret);

    expect(record.ciphertext).not.toContain("private prompt body");
    await expect(decryptConversationContent(record, secret)).resolves.toBe("private prompt body");

    await expect(decryptConversationContent({
      ...record,
      conversationId: "conversation-other",
    }, secret)).rejects.toThrow("content-vault-decryption-failed");
  });

  it("uses a unique IV for repeated plaintext and fails closed on ciphertext tampering", async () => {
    const secret = vaultSecret();
    const first = await encryptConversationContent({
      contentId: "content-1",
      conversationId: "conversation-1",
      role: "assistant",
      plaintext: "same body",
      createdAt: 1000,
    }, secret);
    const second = await encryptConversationContent({
      contentId: "content-2",
      conversationId: "conversation-1",
      role: "assistant",
      plaintext: "same body",
      createdAt: 1001,
    }, secret);

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);

    const replacement = first.ciphertext.startsWith("A") ? "B" : "A";
    await expect(decryptConversationContent({
      ...first,
      ciphertext: `${replacement}${first.ciphertext.slice(1)}`,
    }, secret)).rejects.toThrow("content-vault-decryption-failed");
  });

  it("persists only encrypted content records in Durable Object storage", async () => {
    const stub = env.EXECUTION_DO.getByName("assistant-content-vault");
    await stub.fetch("https://execution.example/api/ready");
    const record = await encryptConversationContent({
      contentId: "content-storage-1",
      conversationId: "conversation-storage-1",
      role: "user",
      plaintext: "must never be a plaintext column",
      createdAt: 2000,
    }, vaultSecret());

    await runInDurableObject<ExecutionDurableObject, void>(stub, (instance, state) => {
      instance.storage.saveContentRecord(record);
      expect(instance.storage.getContentRecord(record.contentId)).toEqual(record);

      const columns = state.storage.sql
        .exec<{ name: string }>("PRAGMA table_info(conversation_content)")
        .toArray()
        .map((row) => row.name);
      expect(columns).toEqual([
        "content_id",
        "conversation_id",
        "role",
        "ciphertext",
        "iv",
        "content_hash",
        "created_at",
      ]);
    });
  });
});
