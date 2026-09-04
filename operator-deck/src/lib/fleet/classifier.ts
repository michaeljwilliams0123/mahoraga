import { extractHttpsUrls, isDeniedTunnelRequest } from "./allowlist";
import { matchArsenalCommand, searchArsenal, type ArsenalCommand } from "./arsenal";
import type { AgentId, Classification, IntentKind, WriteVerb } from "./types";

function result(
  intent: IntentKind,
  owner: AgentId,
  agents: AgentId[],
  reasonCode: string,
  extra: Partial<Classification> = {},
): Classification {
  return {
    intent,
    owner,
    agents: unique([owner, ...agents]),
    reasonCode,
    credit: "deterministic",
    allowHosts: [],
    denyReasons: [],
    targetUrl: null,
    issueNumber: null,
    workflowFile: null,
    cliHint: null,
    writeVerb: null,
    writeBody: null,
    ...extra,
  };
}

function unique(ids: AgentId[]): AgentId[] {
  return [...new Set(ids)];
}

export function extractIssueNumber(text: string): number | null {
  const match =
    text.match(/#(\d{1,4})\b/) ??
    text.match(/\b(?:issue|pr|pull request)\s+#?(\d{1,4})\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

const WORKFLOW_MAP: Array<{ test: RegExp; file: string }> = [
  { test: /\bverify mahoraga\b/i, file: "verify.yml" },
  { test: /\bautonomous integration\b/i, file: "autonomous-integration.yml" },
  { test: /\bdestiny( codex)? relay\b/i, file: "destiny-codex-relay.yml" },
  { test: /\b(publish staged|staged mahoraga update|release workflow)\b/i, file: "release.yml" },
  { test: /\bcloud task gateway\b/i, file: "cloud-task-gateway.yml" },
  { test: /\bcodex cloud\b/i, file: "codex-cloud-dispatch.yml" },
  { test: /\bworkspace agent receiver\b/i, file: "workspace-agent-receiver.yml" },
  { test: /\bchromebook control plane\b/i, file: "chromebook-control-plane.yml" },
];

function classifyWrite(text: string, lower: string, issueNumber: number | null): Classification | null {
  const body = text.includes(":") ? text.slice(text.indexOf(":") + 1).trim() : text;

  if (/\bapprove\b/.test(lower) && /\b(pr|pull request)\b/.test(lower) && issueNumber) {
    return write("approve-pr", "admin", "github-approve-pr", issueNumber);
  }
  if (/\bmerge\b/.test(lower) && /\b(pr|pull request|#\d+)\b/.test(lower) && issueNumber) {
    return write("merge-pr", "admin", "github-merge-pr", issueNumber);
  }
  if (/\b(comment|post)\b/.test(lower) && issueNumber) {
    return write("comment", "admin", "github-comment", issueNumber, body);
  }
  if (/\bclose\b/.test(lower) && /\bissue\b/.test(lower) && issueNumber) {
    return write("close-issue", "admin", "github-close-issue", issueNumber);
  }
  if (/\bcreate\b/.test(lower) && /\bissue\b/.test(lower) && !issueNumber) {
    return write("create-issue", "admin", "github-create-issue", null, body);
  }
  if (
    /\b(dispatch|workflow_dispatch|run the (four[- ]hour|4 ?hr) cycle|fire the (four[- ]hour|4 ?hr))\b/.test(lower) &&
    !/\bdestiny\b/.test(lower)
  ) {
    const file = /\bverify\b/.test(lower)
      ? "verify.yml"
      : /\bintegration\b/.test(lower)
        ? "autonomous-integration.yml"
        : "sovereign-eight-hour-cycle.yml";
    return result("github-write", "repair", ["admin", "assurance"], "github-dispatch", {
      writeVerb: "dispatch-workflow",
      workflowFile: file,
      writeBody: /force/.test(lower) ? "force" : null,
    });
  }
  if (/\bpreview\b/.test(lower) && /\b(wave a|contained branch|delete)\b/.test(lower)) {
    return write("delete-preview", "admin", "github-delete-preview", 83);
  }
  if (/\bdelete\b/.test(lower) && /\b(wave a|contained branch)/.test(lower) && !/\bpreview\b/.test(lower)) {
    return write("delete-branch", "admin", "github-delete-eligible", 83);
  }
  if (/\b(protect main|ruleset|main protection)\b/.test(lower) && /\b(inspect|read|prove|status)\b/.test(lower)) {
    return write("protect-inspect", "admin", "github-protect-inspect", 78);
  }
  return null;
}

function arsenalExtras(command: ArsenalCommand): Partial<Classification> {
  let writeBody: string | null = null;
  if (command.writeVerb === "comment") {
    const idx = command.command.indexOf(":");
    writeBody = idx >= 0 ? command.command.slice(idx + 1).trim() : null;
  } else if (command.writeVerb === "dispatch-workflow" && /force/i.test(command.command)) {
    writeBody = "force";
  } else if (command.writeVerb === "create-issue") {
    writeBody = command.command;
  }
  return {
    workflowFile: command.workflowFile ?? null,
    cliHint: command.cliHint ?? null,
    issueNumber: command.issueNumber ?? null,
    targetUrl: command.targetUrl ?? null,
    writeVerb: command.writeVerb ?? null,
    writeBody,
    allowHosts: command.targetUrl ? ["github.com", "docs.github.com", "api.github.com"] : [],
  };
}

function write(
  verb: WriteVerb,
  owner: AgentId,
  reason: string,
  issueNumber: number | null,
  body: string | null = null,
): Classification {
  return result("github-write", owner, ["admin", "assurance"], reason, {
    writeVerb: verb,
    writeBody: body,
    issueNumber,
  });
}

export function classifyDirective(command: string): Classification {
  const text = command.trim();
  const lower = text.toLowerCase();
  const urls = extractHttpsUrls(text);
  const issueNumber = extractIssueNumber(text);
  const wantsIsolate =
    (/\b(isolate|isolation|allocate|assign)\b/.test(lower) && /\bissues?\b/.test(lower)) ||
    /\bisolate all\b/.test(lower);

  if (!text) {
    return result("decompose", "coordinator", [], "empty-directive");
  }

  const exact = matchArsenalCommand(text);
  if (exact) {
    return result(exact.intent, exact.owner, [exact.owner, "coordinator", "assurance"], `arsenal:${exact.id}`, arsenalExtras(exact));
  }

  const ranked = searchArsenal(text);
  if (ranked.length === 1) {
    const hit = ranked[0];
    return result(hit.intent, hit.owner, [hit.owner, "coordinator", "assurance"], `arsenal-fuzzy:${hit.id}`, arsenalExtras(hit));
  }

  if (isDeniedTunnelRequest(text)) {
    return result("inbound-tunnel-denied", "assurance", ["relay"], "inbound-tunnel-denied", {
      denyReasons: ["inbound-listener", "device-exposure", "unwanted-tunnel"],
    });
  }

  if (/\b(fire a destiny|spend cloud pro|activate mahoraga 7|destiny:create)\b/i.test(text)) {
    return result("authority-denied", "assurance", ["admin"], "authority-not-on-this-plane", {
      denyReasons: ["credit-spend-or-windows-activate"],
    });
  }

  const writeHit = classifyWrite(text, lower, issueNumber);
  if (writeHit) return writeHit;

  if (
    /\b(four[- ]hour|4 ?hr|sovereign( candidate)? cycle|candidate cycle|self-?heal|self-?fix)\b/.test(lower) &&
    !/\bself-upgrade:validate\b/.test(lower)
  ) {
    return result("cycle-inspect", "repair", ["admin", "assurance"], "sovereign-cycle-inspect", {
      workflowFile: "sovereign-eight-hour-cycle.yml",
    });
  }

  if (/\b(arsenal|all commands|what can you do|command palette|coverage)\b/.test(lower)) {
    return result("arsenal-list", "coordinator", ["admin", "assurance"], "arsenal-coverage");
  }

  if (/\b(version ledger|versions? ledger|show versions?|3\.6\.0|7\.0\.0-alpha|operator deck|language lock)\b/.test(lower)) {
    return result("version-inspect", "repository", ["admin", "assurance"], "version-ledger");
  }

  const workflow = WORKFLOW_MAP.find((entry) => entry.test.test(text));
  if (workflow) {
    return result("workflow-inspect", "admin", ["repository"], "workflow-run-inspect", {
      workflowFile: workflow.file,
    });
  }

  if (
    /\b(npm run |npm test|src\/cli\.mjs|127\.0\.0\.1:4782|local mahoraga runtime|local runtime|windows host)\b/.test(
      lower,
    )
  ) {
    const cli = text.match(/npm run [a-z0-9:_-]+/i)?.[0] ?? (/\bnpm test\b/i.test(text) ? "npm test" : "npm run status");
    return result("loopback-denied", "assurance", ["repair"], "loopback-unreachable", {
      cliHint: cli,
      denyReasons: ["loopback-control-plane", "no-device-path"],
    });
  }

  if (issueNumber) {
    return result("issue-inspect", "admin", ["coordinator", "assurance"], "single-issue-inspect", {
      issueNumber,
    });
  }

  if (wantsIsolate) {
    return result("issue-isolate", "admin", ["coordinator", "assurance"], "issue-isolation-map");
  }

  if (/\b(audit|posture|connection|relay|outbound|inbound|tunnel)\b/.test(lower) && !urls.length) {
    return result("posture-audit", "assurance", ["relay", "admin"], "connection-posture");
  }

  if (/\b(health|status|gap|verify mahoraga|head sha)\b/.test(lower) && /\b(repo|repository|github|mahoraga|main|system)\b/.test(lower)) {
    return result("health-scan", "repository", ["admin", "assurance"], "live-health-scan");
  }

  if (/\b(inspect|review|examine)\b/.test(lower) && /\b(repo|repository|mahoraga|codebase|architecture)\b/.test(lower)) {
    return result("repository-inspect", "repository", ["admin", "coordinator"], "repository-inspection");
  }

  if (/\b(issues?|pull request|\bpr\b|branch|label|release|github admin|protect main)\b/.test(lower)) {
    return result("github-admin", "admin", ["repository", "assurance"], "github-admin-read", {
      issueNumber,
    });
  }

  if (/\b(fix|repair|incident|quarantine)\b/.test(lower)) {
    return result("repair-isolate", "repair", ["assurance", "coordinator"], "incident-isolation");
  }

  if (urls.length > 0 || /\b(fetch|browse|scout|look up|visit|open https)\b/.test(lower)) {
    return result("web-scout", "scout", ["assurance"], "allowlisted-outbound-get", {
      targetUrl: urls[0] ?? "https://github.com/michaeljwilliams0123/mahoraga",
      allowHosts: ["github.com", "api.github.com", "raw.githubusercontent.com"],
    });
  }

  if (/\bmahoraga\b/.test(lower) || /\b(what can you do|help|status)\b/.test(lower)) {
    return result("repository-inspect", "repository", ["admin", "coordinator"], "default-live-inspect");
  }

  return result("decompose", "coordinator", ["admin", "repository"], "coordinator-decompose");
}

export function assignIssueOwner(title: string, labels: string[]): AgentId {
  const hay = `${title} ${labels.join(" ")}`.toLowerCase();
  if (/\b(destin|trigger|relay|cipher)\b/.test(hay)) return "relay";
  if (/\b(protect|ruleset|branch|cleanup|github)\b/.test(hay)) return "admin";
  if (/\b(security|privacy|trust|assurance|identity)\b/.test(hay)) return "assurance";
  if (/\b(ui|workspace|starter|experience|accessibility)\b/.test(hay)) return "coordinator";
  if (/\b(repair|fail|handoff|gap|sovereign)\b/.test(hay)) return "repair";
  if (/\b(codex|answer-quality|verify|test)\b/.test(hay)) return "repository";
  return "admin";
}
