type BrokerFetcher = { fetch(request: Request): Promise<Response> };
interface Env {
  CONNECTOR_CAPABILITY_BROKER?: BrokerFetcher;
  REPOSITORY_PROVIDER?: BrokerFetcher;
  CLOUD_PROVIDER?: BrokerFetcher;
  INTEGRATION_PROVIDER?: BrokerFetcher;
  BROWSER_PROVIDER?: BrokerFetcher;
  DESKTOP_PROVIDER?: BrokerFetcher;
  CODEX_PROVIDER?: BrokerFetcher;
  MEMORY_PROVIDER?: BrokerFetcher;
  ARTIFACT_PROVIDER?: BrokerFetcher;
  IMAGE_PROVIDER?: BrokerFetcher;
  WORKSPACE_PROVIDER?: BrokerFetcher;
}
declare namespace Cloudflare { interface Env extends globalThis.Env {} }