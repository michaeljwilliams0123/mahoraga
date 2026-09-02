const DEFAULT_PATHS = Object.freeze(["src", "test"]);

const GROUPS = Object.freeze([
  Object.freeze({ pattern: /\b(interface|ui|frontend|control\s+center|workspace|page|layout|design|accessib)/i, paths: Object.freeze(["cloud"]) }),
  Object.freeze({ pattern: /\b(doc|docs|documentation|readme|document)/i, paths: Object.freeze(["docs"]) }),
  Object.freeze({ pattern: /\b(manifest|provider)/i, paths: Object.freeze(["mahoraga.manifest.json"]) }),
  Object.freeze({ pattern: /\b(package|packages|dependency|dependencies)/i, paths: Object.freeze(["package.json"]) }),
  Object.freeze({ pattern: /\b(release|automation|script|scripts)/i, paths: Object.freeze(["scripts"]) }),
]);

export function autonomyAllowedPaths(message) {
  const text = String(message ?? "").replace(/\s+/g, " ").trim().slice(0, 12_000);
  const paths = new Set(DEFAULT_PATHS);
  for (const group of GROUPS) {
    if (group.pattern.test(text)) for (const path of group.paths) paths.add(path);
  }
  return Object.freeze([...paths].sort());
}
