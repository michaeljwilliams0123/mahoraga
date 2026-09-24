interface Env {
  BYPASS_SECRET: string;
  CONTENT_VAULT_KEY: string;
  OWNER_GATEWAY_SECRET: string;
  PROVIDER_REFRESH_SECRET: string;
  ZERO_CREDIT_PROVIDER_URL: string;
  ZERO_CREDIT_PROVIDER_TOKEN: string;
  ZERO_CREDIT_ACCOUNT_ID_HASH: string;
  ZERO_CREDIT_BILLING_ATTESTATION: string;
  TARGET_SHA: string;
  RAILWAY_ANCHOR_URL: string;
}

declare namespace Cloudflare {
  interface Env {
    BYPASS_SECRET: string;
    CONTENT_VAULT_KEY: string;
    OWNER_GATEWAY_SECRET: string;
    PROVIDER_REFRESH_SECRET: string;
    ZERO_CREDIT_PROVIDER_URL: string;
    ZERO_CREDIT_PROVIDER_TOKEN: string;
    ZERO_CREDIT_ACCOUNT_ID_HASH: string;
    ZERO_CREDIT_BILLING_ATTESTATION: string;
    TARGET_SHA: string;
    RAILWAY_ANCHOR_URL: string;
  }
}
