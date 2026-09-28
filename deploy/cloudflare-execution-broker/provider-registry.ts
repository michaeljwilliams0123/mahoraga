export type ProviderBindingName =
  | "REPOSITORY_PROVIDER" | "CLOUD_PROVIDER" | "INTEGRATION_PROVIDER"
  | "BROWSER_PROVIDER" | "DESKTOP_PROVIDER" | "CODEX_PROVIDER"
  | "MEMORY_PROVIDER" | "ARTIFACT_PROVIDER" | "IMAGE_PROVIDER"
  | "WORKSPACE_PROVIDER";

type Rule = {
  prefixes?: readonly string[];
  exact?: readonly string[];
  contained?: readonly string[];
};

export const PROVIDER_REGISTRY: Readonly<Record<ProviderBindingName, Rule>> = Object.freeze({
  REPOSITORY_PROVIDER: Object.freeze({ prefixes:["repository."] }),
  CLOUD_PROVIDER: Object.freeze({ prefixes:["cloud."] }),
  INTEGRATION_PROVIDER: Object.freeze({ prefixes:["integration."] }),
  BROWSER_PROVIDER: Object.freeze({ prefixes:["browser."] }),
  DESKTOP_PROVIDER: Object.freeze({ prefixes:["desktop."] }),
  CODEX_PROVIDER: Object.freeze({ prefixes:["codex."], contained:["codex.execute"] }),
  MEMORY_PROVIDER: Object.freeze({ prefixes:["memory."] }),
  ARTIFACT_PROVIDER: Object.freeze({ prefixes:["artifact."] }),
  IMAGE_PROVIDER: Object.freeze({ exact:["image.generate"] }),
  WORKSPACE_PROVIDER: Object.freeze({ prefixes:["workspace-agent."], exact:["self.evolve"], contained:["self.evolve"] }),
});

export function attestationAllowedForBinding(binding: ProviderBindingName, value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const capabilities = (value as { capabilities?: unknown }).capabilities;
  if (!Array.isArray(capabilities) || capabilities.length === 0) return false;
  const rule = PROVIDER_REGISTRY[binding];
  return capabilities.every((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const capability = String((raw as { capability?: unknown }).capability ?? "");
    const permissionClass = String((raw as { permissionClass?: unknown }).permissionClass ?? "");
    const allowed = (rule.exact ?? []).includes(capability)
      || (rule.prefixes ?? []).some((prefix) => capability.startsWith(prefix));
    if (!allowed) return false;
    if ((rule.contained ?? []).includes(capability) && permissionClass !== "contained") return false;
    return true;
  });
}
