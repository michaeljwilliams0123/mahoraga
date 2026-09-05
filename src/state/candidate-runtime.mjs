import path from "node:path";

export const UCCP_CANDIDATE_PORT = 4783;

export function resolveCandidateRuntimePaths({
  root,
  manifest,
  port,
  databaseFile = null,
  artifactRoot = null,
  contentVaultRoot = null,
  contentVaultKeyFile = null,
} = {}) {
  if (typeof root !== "string" || !root) throw new TypeError("candidate-runtime-root-required");
  if (!manifest?.runtime?.database || !manifest?.truthContracts?.contentVault?.root) throw new TypeError("candidate-runtime-manifest-invalid");
  const candidate = port === UCCP_CANDIDATE_PORT;

  if (candidate) {
    const stateRoot = databaseFile ? path.dirname(path.resolve(databaseFile)) : path.join(root, "state", "candidate-4783");
    return {
      candidate: true,
      stateRoot,
      databaseFile: databaseFile ? path.resolve(databaseFile) : path.join(stateRoot, "mahoraga.sqlite"),
      uccpDatabaseFile: path.join(stateRoot, "uccp.sqlite"),
      artifactRoot: artifactRoot ? path.resolve(artifactRoot) : path.join(stateRoot, "artifacts"),
      contentVaultRoot: contentVaultRoot ? path.resolve(contentVaultRoot) : path.join(stateRoot, "content-vault"),
      contentVaultKeyFile: contentVaultKeyFile ? path.resolve(contentVaultKeyFile) : path.join(stateRoot, "content-vault.key.dpapi"),
    };
  }

  const resolvedDatabase = databaseFile ? path.resolve(databaseFile) : path.join(root, manifest.runtime.database);
  const stateRoot = path.dirname(resolvedDatabase);
  return {
    candidate: false,
    stateRoot,
    databaseFile: resolvedDatabase,
    uccpDatabaseFile: null,
    artifactRoot: artifactRoot ? path.resolve(artifactRoot) : path.join(stateRoot, "artifacts"),
    contentVaultRoot: contentVaultRoot
      ? path.resolve(contentVaultRoot)
      : databaseFile ? path.join(stateRoot, "content-vault") : path.join(root, manifest.truthContracts.contentVault.root),
    contentVaultKeyFile: contentVaultKeyFile ? path.resolve(contentVaultKeyFile) : path.join(stateRoot, "content-vault.key.dpapi"),
  };
}