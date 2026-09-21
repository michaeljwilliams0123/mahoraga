interface Env {
  BYPASS_SECRET: string;
  TARGET_SHA: string;
  RAILWAY_ANCHOR_URL: string;
}

declare namespace Cloudflare {
  interface Env {
    BYPASS_SECRET: string;
    TARGET_SHA: string;
    RAILWAY_ANCHOR_URL: string;
  }
}
