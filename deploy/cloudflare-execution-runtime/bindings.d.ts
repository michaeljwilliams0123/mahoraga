interface WorkersAiBinding {
  run(model: string, input: { messages: Array<{ role: "user" | "assistant" | "system"; content: string }> }): Promise<unknown>;
}

interface Env {
  AI: WorkersAiBinding;
  BYPASS_SECRET: string;
  CONTENT_VAULT_KEY: string;
  TARGET_SHA: string;
  RAILWAY_ANCHOR_URL: string;
}

declare namespace Cloudflare {
  interface Env {
    AI: WorkersAiBinding;
    BYPASS_SECRET: string;
    CONTENT_VAULT_KEY: string;
    TARGET_SHA: string;
    RAILWAY_ANCHOR_URL: string;
  }
}
