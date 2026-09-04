import { AGENTS } from "./agents";
import { ARSENAL, arsenalStats } from "./arsenal";
import { inspectTargetUrl } from "./allowlist";
import { classifyDirective } from "./classifier";
import { REVIEW_FINDINGS } from "./findings";
import { fetchAllowlistedPage, loadGithubIssue, loadGithubSnapshot, loadRepoContracts, loadWorkflowRun } from "./github.server";
import { sha256Hex, shortId } from "./hash";
import { laneFor } from "./lanes";
import { VERSION_SURFACES, versionReceipt, APP_HOST, LANGUAGE_LOCK, WORKSPACE_NOTE, REPO_URL, CLOUD_APP_URL } from "./versions";
import { runGithubWrite } from "./write.server";
import type {
  AgentId,
  CellState,
  EvidenceItem,
  ExecuteResult,
  FleetEvent,
  GithubIssueLite,
  IntentKind,
  TaskCell,
} from "./types";

function stamp(): string {
  return new Date().toISOString();
}

function event(agent: AgentId, kind: FleetEvent["kind"], message: string): FleetEvent {
  return { at: stamp(), agent, kind, message };
}

async function makeCell(params: {
  seed: string;
  title: string;
  intent: IntentKind;
  owner: AgentId;
  supporting: AgentId[];
  state: CellState;
  summary: string;
  evidence: EvidenceItem[];
  events: FleetEvent[];
  issueNumber?: number;
  pathFence?: string;
}): Promise<TaskCell> {
  const requestHash = await sha256Hex(`fleet:v1:${params.seed}`);
  const now = stamp();
  return {
    id: shortId(requestHash, params.issueNumber ? `i${params.issueNumber}` : "cell"),
    title: params.title,
    intent: params.intent,
    owner: params.owner,
    supporting: params.supporting.filter((agent) => agent !== params.owner),
    state: params.state,
    credit: "deterministic",
    fencingToken: 1,
    requestHash,
    summary: params.summary,
    evidence: params.evidence,
    events: params.events,
    isolated: true,
    createdAt: now,
    completedAt: now,
    issueNumber: params.issueNumber,
    pathFence: params.pathFence,
  };
}

function issueCellSeed(issue: GithubIssueLite, command: string): Parameters<typeof makeCell>[0] {
  const owner = issue.assignedAgent;
  const lane = laneFor(issue.number, issue.title);
  return {
    seed: `issue:${issue.number}:${issue.updatedAt}:${command.toLowerCase()}`,
    title: `#${issue.number} ${issue.title}`.slice(0, 96),
    intent: "issue-inspect",
    owner,
    supporting: ["coordinator", "assurance"],
    state: "succeeded",
    summary: `${AGENTS[owner].label} owns #${issue.number}. Fence: ${lane.fence}. Next: ${lane.next}`,
    evidence: [
      { label: "Issue", value: `#${issue.number}`, href: issue.htmlUrl },
      { label: "Owner", value: AGENTS[owner].label },
      { label: "Path fence", value: lane.fence },
      { label: "Labels", value: issue.labels.join(", ") || "unlabeled" },
    ],
    events: [
      event("coordinator", "lease", `#${issue.number} → ${AGENTS[owner].label}`),
      event(owner, "observe", lane.next),
      event("assurance", "complete", "Isolated. A stall here cannot freeze sibling cells."),
    ],
    issueNumber: issue.number,
    pathFence: lane.fence,
  };
}

export async function runDirective(command: string): Promise<ExecuteResult> {
  const normalized = command.replace(/\s+/g, " ").trim().slice(0, 800);
  const classification = classifyDirective(normalized);
  const supporting = classification.agents.filter((agent) => agent !== classification.owner);
  const routeEvents: FleetEvent[] = [
    event("coordinator", "route", `Intent ${classification.intent} · ${classification.reasonCode} · credit ${classification.credit}`),
    event(
      "coordinator",
      "lease",
      `Owner ${AGENTS[classification.owner].label}; supporting ${supporting.map((a) => AGENTS[a].label).join(", ") || "none"}`,
    ),
  ];

  if (classification.intent === "inbound-tunnel-denied") {
    const cell = await makeCell({
      seed: `deny:${normalized.toLowerCase()}`,
      title: "Inbound tunnel denied",
      intent: classification.intent,
      owner: classification.owner,
      supporting,
      state: "denied",
      summary:
        "Assurance refused the request. Mahoraga will not punch a hole into your Chromebook or Windows host. Use outbound HTTPS, a scoped GitHub App, or the existing Destiny event lane. The control plane stays on loopback.",
      evidence: [
        { label: "Verdict", value: "denied-inbound" },
        { label: "Safer path", value: "GitHub App + outbound poll, or Destiny event envelope" },
        { label: "Credit class", value: classification.credit },
      ],
      events: [
        ...routeEvents,
        event("assurance", "deny", "Inbound tunnel language detected. Device exposure is refused."),
        event("relay", "deny", "No public listener, ngrok, cloudflared, or reverse SSH will be opened."),
      ],
    });
    return { cells: [cell] };
  }

  if (classification.intent === "authority-denied") {
    const cell = await makeCell({
      seed: `authority:${normalized.toLowerCase()}`,
      title: "Authority not on this plane",
      intent: classification.intent,
      owner: classification.owner,
      supporting,
      state: "denied",
      summary:
        "This deck will not fire Destiny, spend Cloud Pro, or activate 7.0 on Windows. Merge, comment, close, dispatch, and eligible Wave A deletes are on the write plane when the owner gh session is present.",
      evidence: [
        { label: "Verdict", value: "denied-authority" },
        { label: "Safer path", value: "Write plane for GitHub; loopback CLI for the Windows host" },
        { label: "Still denied", value: "Destiny spend · Cloud Pro fire · Windows 7.0 activate" },
      ],
      events: [
        ...routeEvents,
        event("assurance", "deny", "Credit spend and Windows activation stay fail-closed."),
        event("admin", "observe", "GitHub writes are a different intent on this same deck."),
      ],
    });
    return { cells: [cell] };
  }

  if (classification.intent === "loopback-denied") {
    const cli = classification.cliHint ?? "npm run status";
    const cell = await makeCell({
      seed: `loopback:${cli}:${normalized.toLowerCase()}`,
      title: "Loopback command — not reachable",
      intent: classification.intent,
      owner: classification.owner,
      supporting,
      state: "waiting",
      summary: `Receipt only. This console cannot reach 127.0.0.1:4782. On the Windows host, from the Mahoraga checkout: ${cli}. Production remains 3.6.0 until the 7.0 gate passes.`,
      evidence: [
        { label: "CLI", value: cli },
        { label: "Control API", value: "127.0.0.1:4782 (unreachable from here)" },
        { label: "Why", value: "Outbound-only plane. No device tunnel." },
      ],
      events: [
        ...routeEvents,
        event("assurance", "wait", "Loopback is the correct plane; this deck is not that plane."),
        event("repair", "observe", `Operator CLI: ${cli}`),
      ],
    });
    return { cells: [cell] };
  }

  if (classification.intent === "github-write") {
    const verb = classification.writeVerb ?? "protect-inspect";
    let body = classification.writeBody;
    if (!body && normalized.includes(":")) {
      body = normalized.slice(normalized.indexOf(":") + 1).trim();
    }
    if (!body && verb === "dispatch-workflow" && /force/i.test(normalized)) {
      body = "force";
    }
    const outcome = await runGithubWrite({
      verb,
      issueNumber: classification.issueNumber,
      workflowFile: classification.workflowFile,
      body,
    });
    const snapshot = await loadGithubSnapshot(true);
    const cell = await makeCell({
      seed: `write:${verb}:${classification.issueNumber ?? "none"}:${normalized.toLowerCase()}`,
      title: outcome.title,
      intent: classification.intent,
      owner: classification.owner,
      supporting,
      state: outcome.state,
      summary: outcome.summary,
      evidence: [
        ...outcome.evidence,
        { label: "Write verb", value: verb },
        { label: "Actor", value: snapshot.write?.login ?? "unauthenticated" },
      ],
      events: [
        ...routeEvents,
        event(
          "admin",
          outcome.ok ? "complete" : outcome.state === "denied" ? "deny" : outcome.state === "waiting" ? "wait" : "observe",
          outcome.summary,
        ),
        event("assurance", "observe", "Writes respect Protect main. Destiny spend and Windows 7.0 activate remain denied."),
      ],
      issueNumber: classification.issueNumber ?? undefined,
    });
    return { cells: [cell], snapshot };
  }

  if (classification.intent === "version-inspect") {
    const cell = await makeCell({
      seed: `versions:${normalized.toLowerCase()}`,
      title: "Version ledger",
      intent: classification.intent,
      owner: classification.owner,
      supporting,
      state: "succeeded",
      summary: `${versionReceipt()} Host ${APP_HOST}. Language lock ${LANGUAGE_LOCK}. ${WORKSPACE_NOTE}`,
      evidence: [
        ...VERSION_SURFACES.map((surface) => ({
          label: `${surface.label} ${surface.version}`,
          value: `${surface.role} ${surface.status}`,
          href: surface.href,
        })),
        { label: "Repo", value: "michaeljwilliams0123/mahoraga", href: REPO_URL },
        { label: "Conversation UI", value: "Vercel cloud-app", href: CLOUD_APP_URL },
        { label: "Language lock", value: LANGUAGE_LOCK },
        { label: "App host", value: APP_HOST },
      ],
      events: [
        ...routeEvents,
        event("repository", "observe", "Three surfaces, one operator console. Cloud-app stays conversation. Windows 3.6.0 stays rollback."),
        event("assurance", "complete", "7.0 is not activated on Windows from this receipt."),
      ],
    });
    return { cells: [cell] };
  }

  if (classification.intent === "arsenal-list") {
    const stats = arsenalStats();
    const byPlane = (plane: (typeof ARSENAL)[number]["plane"]) =>
      ARSENAL.filter((item) => item.plane === plane)
        .map((item) => item.label)
        .join(" · ");
    const cell = await makeCell({
      seed: `arsenal:${stats.total}:${normalized.toLowerCase()}`,
      title: "Command arsenal coverage",
      intent: classification.intent,
      owner: classification.owner,
      supporting,
      state: "succeeded",
      summary: `${stats.total} commands are on this deck, the Arsenal page, and Ctrl/⌘K. ${stats.live} run live here. ${stats.write} write GitHub as the owner. ${stats.github} inspect GitHub Actions. ${stats.loopback} return a loopback CLI receipt. ${stats.denied} are proven denies. Type any label, id, or npm script — routing is deterministic.`,
      evidence: [
        { label: "Live", value: `${stats.live} · ${byPlane("live")}` },
        { label: "Write", value: `${stats.write} · ${byPlane("write")}` },
        { label: "GitHub", value: `${stats.github} · ${byPlane("github")}` },
        { label: "Loopback", value: `${stats.loopback}` },
        { label: "Denied", value: `${stats.denied}` },
      ],
      events: [
        ...routeEvents,
        event("coordinator", "complete", "Every listed command is dispatchable from the deck, Arsenal, or the palette."),
      ],
    });
    return { cells: [cell] };
  }

  if (classification.intent === "cycle-inspect") {
    const snapshot = await loadGithubSnapshot(true);
    const cycle = snapshot.cycle;
    const events = [...routeEvents, event("repair", "observe", "Outbound GitHub Actions read of the four-hour cycle.")];
    const evidence: EvidenceItem[] = [{ label: "Workflow file", value: "sovereign-eight-hour-cycle.yml", href: cycle?.htmlUrl }];
    if (!cycle) {
      events.push(event("admin", "wait", "Cycle pulse unreachable on public Actions API."));
      const cell = await makeCell({
        seed: `cycle-wait:${normalized.toLowerCase()}`,
        title: "Four-hour cycle unreachable",
        intent: classification.intent,
        owner: classification.owner,
        supporting,
        state: "waiting",
        summary: "GitHub Actions metadata did not load. The fleet did not fall through to a paid model.",
        evidence,
        events,
      });
      return { cells: [cell], snapshot };
    }
    evidence.push(
      { label: "Last run", value: `#${cycle.lastRunNumber ?? "—"} ${cycle.lastEvent} · ${cycle.lastConclusion}`, href: cycle.lastUrl },
      { label: "Last success", value: cycle.lastSuccessNumber ? `#${cycle.lastSuccessNumber} ${cycle.lastSuccessEvent}` : "none", href: cycle.lastSuccessUrl },
      { label: "Last schedule", value: `${cycle.lastScheduleConclusion || "none"} · ${cycle.lastScheduleAt || "—"}`, href: cycle.lastScheduleUrl },
      { label: "Skipped streak", value: String(cycle.skippedStreak) },
      { label: "Anchor", value: cycle.anchorUtc ?? "missing" },
      { label: "Next window", value: cycle.nextWindowUtc ?? "unknown" },
      { label: "Current window", value: cycle.currentWindowComplete ? "already tagged complete" : "open — worker eligible" },
      { label: "Producer smoke", value: cycle.smokeComplete ? "sovereign-producer-smoke-v1 present" : "not tagged" },
      {
        label: "Owner dispatch",
        value: "workflow_dispatch · actor must be michaeljwilliams0123",
        href: cycle.htmlUrl,
      },
    );
    if (cycle.candidatePr) {
      evidence.push({
        label: "Candidate PR",
        value: `#${cycle.candidatePr.number} ${cycle.candidatePr.title}`,
        href: cycle.candidatePr.htmlUrl,
      });
    }
    if (cycle.integrationPr) {
      evidence.push({
        label: "Integration gap PR",
        value: `#${cycle.integrationPr.number} ${cycle.integrationPr.title}`,
        href: cycle.integrationPr.htmlUrl,
      });
    }
    events.push(
      event("admin", "observe", `Cron heartbeats every 15 minutes; software window is 4 hours from ${cycle.anchorUtc ?? "unset anchor"}.`),
      event(
        "repair",
        "observe",
        `Last GitHub run ${cycle.lastConclusion} via ${cycle.lastEvent}. Last success #${cycle.lastSuccessNumber ?? "—"} ${cycle.lastSuccessEvent || ""}. ${cycle.skippedStreak} trailing skipped workflow_run pulses.`,
      ),
      event(
        "assurance",
        "complete",
        cycle.candidatePr
          ? `Producer smoke opened ${cycle.candidatePr.htmlUrl}. That is a candidate, not Windows activation and not a merge.`
          : "No open candidate PR on the current snapshot.",
      ),
    );
    const summary = [
      `Four-hour cycle is armed. Filename still says eight-hour. Cron is :07/:22/:37/:52 every hour — a heartbeat, not the window.`,
      cycle.anchorUtc ? `Durable anchor ${cycle.anchorUtc}.` : "No durable anchor tag.",
      cycle.currentWindowComplete
        ? `Current 4hr window is tagged complete; next eligible window ${cycle.nextWindowUtc ?? "unknown"}.`
        : cycle.nextWindowUtc
          ? `Current window is open (${cycle.nextWindowUtc}).`
          : "",
      `Last run #${cycle.lastRunNumber ?? "—"} ${cycle.lastEvent} concluded ${cycle.lastConclusion}.`,
      cycle.lastSuccessNumber
        ? `Last success #${cycle.lastSuccessNumber} (${cycle.lastSuccessEvent}). A scheduled green often still skips the worker when the window is already tagged complete.`
        : "",
      cycle.candidatePr
        ? `Self-update evidence: PR #${cycle.candidatePr.number} “${cycle.candidatePr.title}” from ${cycle.candidatePr.author} (producer smoke, candidate-ready). It does not activate 7.0 on Windows and does not squash-merge.`
        : "No candidate PR is open.",
      cycle.integrationPr
        ? `PR #${cycle.integrationPr.number} still open — producing a PR is not the same as integrating it. Mergeable state has been blocked.`
        : "No integration-gap PR on the snapshot.",
      "This deck can workflow_dispatch the cycle when the owner gh session is present. Dispatch does not activate Windows 7.0.",
    ]
      .filter(Boolean)
      .join(" ");
    const cell = await makeCell({
      seed: `cycle:${cycle.lastRunNumber}:${cycle.lastAt}:${normalized.toLowerCase()}`,
      title: "Four-hour sovereign cycle",
      intent: classification.intent,
      owner: classification.owner,
      supporting,
      state: "succeeded",
      summary,
      evidence,
      events,
    });
    return { cells: [cell], snapshot };
  }

  if (classification.intent === "workflow-inspect") {
    const file = classification.workflowFile ?? "verify.yml";
    const [run, snapshot] = await Promise.all([loadWorkflowRun(file), loadGithubSnapshot()]);
    const events = [...routeEvents, event("admin", "observe", `Outbound Actions read ${file}`)];
    const evidence: EvidenceItem[] = [
      { label: "Workflow", value: file, href: run.htmlUrl },
      { label: "Credit class", value: classification.credit },
    ];
    let state: CellState = "succeeded";
    let summary = "";
    if (!run.ok) {
      state = "waiting";
      summary = `Admin could not read ${file} (${run.error}). No model fallback.`;
      events.push(event("admin", "wait", run.error ?? "workflow-unreachable"));
    } else {
      evidence.push(
        { label: "Run", value: run.number ? `#${run.number}` : "none", href: run.htmlUrl },
        { label: "Event", value: run.event || "—" },
        { label: "Conclusion", value: run.conclusion },
        { label: "Head", value: run.headSha.slice(0, 12) || "—" },
        { label: "When", value: run.createdAt || "—" },
      );
      events.push(event("admin", "complete", `Run ${run.number ?? "none"} ${run.conclusion} via ${run.event || "n/a"}`));
      summary = `Last ${run.name} run ${run.number ? `#${run.number}` : "none"} concluded ${run.conclusion} (${run.event || "no event"}) at ${run.createdAt || "unknown"}. Inspect is live. Dispatch of the four-hour cycle is a separate write command.`;
    }
    const cell = await makeCell({
      seed: `workflow:${file}:${run.number}:${normalized.toLowerCase()}`,
      title: `Workflow ${file}`,
      intent: classification.intent,
      owner: classification.owner,
      supporting,
      state,
      summary,
      evidence,
      events,
    });
    return { cells: [cell], snapshot: snapshot.ok ? snapshot : undefined };
  }

  if (classification.intent === "web-scout") {
    const raw = classification.targetUrl ?? "https://github.com/michaeljwilliams0123/mahoraga";
    const inspected = inspectTargetUrl(raw);
    const events = [...routeEvents, event("scout", "observe", `Outbound GET candidate ${raw}`)];
    const evidence: EvidenceItem[] = [{ label: "Credit class", value: classification.credit }];
    let state: CellState = "succeeded";
    let summary = "";
    if (!inspected.ok) {
      events.push(event("assurance", "deny", `Scout blocked: ${inspected.reason}`));
      summary = `Scout refused the URL. Reason: ${inspected.reason}. Only HTTPS hosts on the public allowlist are reachable, and never your LAN.`;
      state = "denied";
      evidence.push({ label: "Deny reason", value: inspected.reason });
    } else {
      const finalHost = inspected.url.hostname.toLowerCase();
      const page = await fetchAllowlistedPage(inspected.url.toString());
      const landed = (() => {
        try {
          return new URL(page.finalUrl).hostname.toLowerCase();
        } catch {
          return finalHost;
        }
      })();
      if (landed !== finalHost) {
        events.push(event("assurance", "deny", `Redirect left ${finalHost} for ${landed}`));
        state = "denied";
        summary = "Scout followed a redirect off the original host and stopped. Off-allowlist hops are not trusted.";
      } else {
        events.push(event("scout", "complete", `HTTP ${page.status} · ${page.bytes} bytes · ${page.title || "untitled"}`));
        evidence.push(
          { label: "Status", value: String(page.status) },
          { label: "Title", value: page.title || "—" },
          { label: "Bytes", value: String(page.bytes), href: page.finalUrl },
        );
        summary = page.ok
          ? `Scout retrieved ${page.title || page.finalUrl} (${page.status}). Excerpt: ${page.excerpt || "no extractable text"}.`
          : `Scout reached the host but the page failed (${page.status || page.error || "error"}).`;
        if (!page.ok) state = "failed";
      }
    }
    const cell = await makeCell({
      seed: `scout:${raw}:${normalized.toLowerCase()}`,
      title: normalized.slice(0, 96) || "Web scout",
      intent: classification.intent,
      owner: classification.owner,
      supporting,
      state,
      summary,
      evidence,
      events,
    });
    return { cells: [cell] };
  }

  if (classification.intent === "issue-inspect" && classification.issueNumber) {
    const issue = await loadGithubIssue(classification.issueNumber);
    const snapshot = await loadGithubSnapshot();
    if (!issue.ok) {
      const cell = await makeCell({
        seed: `issue-miss:${classification.issueNumber}:${normalized.toLowerCase()}`,
        title: `Issue #${classification.issueNumber} unreachable`,
        intent: classification.intent,
        owner: "admin",
        supporting: ["assurance"],
        state: "waiting",
        summary: `Admin could not read #${classification.issueNumber} (${issue.error}). No model fallback.`,
        evidence: [{ label: "Issue", value: `#${classification.issueNumber}`, href: issue.htmlUrl }],
        events: [...routeEvents, event("admin", "wait", issue.error ?? "issue-unreachable")],
        issueNumber: classification.issueNumber,
      });
      return { cells: [cell], snapshot: snapshot.ok ? snapshot : undefined };
    }
    const seed = issueCellSeed(issue, normalized);
    if (issue.bodyExcerpt) {
      seed.evidence.push({ label: "Body", value: issue.bodyExcerpt });
      seed.summary = `${seed.summary} Body: ${issue.bodyExcerpt}`;
    }
    seed.events = [...routeEvents, ...seed.events];
    const cell = await makeCell(seed);
    return { cells: [cell], snapshot: snapshot.ok ? snapshot : undefined };
  }

  if (classification.intent === "issue-isolate") {
    const snapshot = await loadGithubSnapshot();
    if (!snapshot.ok) {
      const cell = await makeCell({
        seed: `isolate-wait:${normalized.toLowerCase()}`,
        title: "Issue isolation waiting on GitHub",
        intent: classification.intent,
        owner: "admin",
        supporting,
        state: "waiting",
        summary: `GitHub public API did not answer (${snapshot.error}). The fleet did not fall through to a paid model.`,
        evidence: [{ label: "Credit class", value: classification.credit }],
        events: [...routeEvents, event("admin", "wait", snapshot.error ?? "github-unreachable")],
      });
      return { cells: [cell], snapshot };
    }
    const byAgent = snapshot.issues.reduce<Record<string, number>>((acc, issue) => {
      acc[issue.assignedAgent] = (acc[issue.assignedAgent] ?? 0) + 1;
      return acc;
    }, {});
    const receipt = await makeCell({
      seed: `isolate-receipt:${snapshot.fetchedAt}:${normalized.toLowerCase()}`,
      title: "Issue isolation map",
      intent: classification.intent,
      owner: "coordinator",
      supporting: ["admin", "assurance"],
      state: "succeeded",
      summary: `Isolated ${snapshot.issues.length} open issues into specialist cells: ${Object.entries(byAgent)
        .map(([id, count]) => `${AGENTS[id as AgentId].label} ${count}`)
        .join(", ") || "none"}. Each cell has one owner so a Destiny stall cannot freeze Admin or Scout.`,
      evidence: [
        { label: "Repository", value: snapshot.fullName, href: `https://github.com/${snapshot.fullName}` },
        { label: "Open issues", value: String(snapshot.openIssues) },
        { label: "Open pulls", value: String(snapshot.openPrs) },
      ],
      events: [
        ...routeEvents,
        ...snapshot.issues.slice(0, 6).map((issue) =>
          event("coordinator", "lease", `#${issue.number} → ${AGENTS[issue.assignedAgent].label}`),
        ),
        ...(snapshot.issues.length > 6
          ? [event("coordinator", "complete", `${snapshot.issues.length - 6} additional issues leased into owner cells below.`)]
          : []),
      ],
    });
    const issueCells = await Promise.all(
      snapshot.issues.map((issue) => makeCell(issueCellSeed(issue, normalized))),
    );
    return { cells: [receipt, ...issueCells], snapshot };
  }

  if (
    classification.intent === "repository-inspect" ||
    classification.intent === "health-scan" ||
    classification.intent === "github-admin"
  ) {
    const [snapshot, contracts] = await Promise.all([loadGithubSnapshot(), loadRepoContracts()]);
    const events = [...routeEvents, event("admin", "observe", "Outbound GitHub API read — no token, public metadata only.")];
    const evidence: EvidenceItem[] = [{ label: "Credit class", value: classification.credit }];
    if (!snapshot.ok) {
      events.push(event("admin", "wait", snapshot.error ?? "github-unreachable"));
      const cell = await makeCell({
        seed: `gh-wait:${classification.intent}:${normalized.toLowerCase()}`,
        title: "GitHub unreachable",
        intent: classification.intent,
        owner: classification.owner,
        supporting,
        state: "waiting",
        summary: `GitHub public API did not answer (${snapshot.error}). The fleet did not fall through to a paid model.`,
        evidence,
        events,
      });
      return { cells: [cell], snapshot };
    }
    events.push(
      event("repository", "observe", `Head ${snapshot.headSha.slice(0, 12)} on ${snapshot.defaultBranch}`),
      event("admin", "complete", `${snapshot.openIssues} open issues · ${snapshot.openPrs} open pulls`),
    );
    evidence.push(
      { label: "Repository", value: snapshot.fullName, href: `https://github.com/${snapshot.fullName}` },
      { label: "Head", value: snapshot.headSha.slice(0, 12) },
      { label: "Open issues", value: String(snapshot.openIssues) },
      { label: "Open pulls", value: String(snapshot.openPrs) },
    );
    if (contracts.ok) {
      events.push(
        event("repository", "observe", `package ${contracts.packageVersion || "unknown"} · workers ${contracts.workerNames.length}`),
      );
      if (contracts.packageVersion) evidence.push({ label: "Declared version", value: contracts.packageVersion });
      if (contracts.workerNames.length) evidence.push({ label: "Manifest workers", value: contracts.workerNames.join(", ") });
      if (contracts.agentContract) evidence.push({ label: "AGENTS.md", value: contracts.agentContract });
    }
    if (snapshot.cycle) {
      evidence.push({
        label: "4hr cycle",
        value: `#${snapshot.cycle.lastRunNumber ?? "—"} ${snapshot.cycle.lastConclusion}`,
        href: snapshot.cycle.lastUrl,
      });
    }
    if (snapshot.write) {
      evidence.push({
        label: "Write plane",
        value: snapshot.write.ok
          ? `${snapshot.write.login} · ${snapshot.write.rulesetName ?? "ruleset"} ${snapshot.write.rulesetEnforcement ?? ""}`
          : snapshot.write.error ?? "waiting",
      });
    }

    let title = normalized.slice(0, 96);
    let summary = "";
    if (classification.intent === "health-scan") {
      const p0 = REVIEW_FINDINGS.filter((finding) => finding.severity === "p0").length;
      summary = `Live health: ${snapshot.fullName} @ ${snapshot.headSha.slice(0, 12)} “${snapshot.headMessage}”. ${snapshot.openIssues} issues, ${snapshot.openPrs} pulls. ${p0} P0 control-plane gaps remain (main protection, live specialists, immediate dispatch). Zero tokens spent.`;
      title = "Live health scan";
    } else if (classification.intent === "github-admin") {
      summary = `Admin read of ${snapshot.fullName}. Visibility ${snapshot.visibility}, default ${snapshot.defaultBranch}, last push ${snapshot.pushedAt}. Write plane ${snapshot.write?.ok ? `as ${snapshot.write.login}` : "waiting for gh"}. Protect main is ${snapshot.write?.rulesetEnforcement ?? "unread"}. Merge still requires exact-head Verify. Destiny spend and Windows 7.0 activate remain denied.`;
      title = "GitHub admin read";
    } else {
      summary = `Repository inspect of ${snapshot.fullName}: ${snapshot.description || "autonomous local control plane"}. Head ${snapshot.headSha.slice(0, 12)} — ${snapshot.headMessage}. ${snapshot.openIssues} open issues allocated conceptually to specialists. ${contracts.readmeExcerpt ? `README: ${contracts.readmeExcerpt}` : "Routing was deterministic."}`;
      title = "Live repository inspect";
    }

    const cell = await makeCell({
      seed: `${classification.intent}:${snapshot.headSha}:${normalized.toLowerCase()}`,
      title,
      intent: classification.intent,
      owner: classification.owner,
      supporting,
      state: "succeeded",
      summary,
      evidence,
      events,
    });
    return { cells: [cell], snapshot };
  }

  if (classification.intent === "posture-audit") {
    const cell = await makeCell({
      seed: `posture:${normalized.toLowerCase()}`,
      title: "Connection posture",
      intent: classification.intent,
      owner: classification.owner,
      supporting,
      state: "succeeded",
      summary:
        "Posture is fail-closed. Mahoraga’s control API belongs on 127.0.0.1. This fleet may GET allowlisted public hosts and read public GitHub. It cannot open ngrok, cloudflared, reverse SSH, or any inbound path into your devices. Flexible connections = outbound GitHub App, Destiny events, encrypted relay pairing.",
      evidence: [
        { label: "Device reachability", value: "none — this console cannot see your LAN" },
        { label: "Inbound tunnels", value: "denied" },
        { label: "GitHub", value: "public outbound read" },
        { label: "Model spend", value: "none" },
      ],
      events: [
        ...routeEvents,
        event("assurance", "observe", "Loopback control plane · outbound HTTPS allowlist · GitHub events."),
        event("relay", "observe", "No public local listener. Pairing is outbound-only."),
        event("assurance", "complete", "Inbound tunnels remain a hard deny."),
      ],
    });
    return { cells: [cell] };
  }

  if (classification.intent === "repair-isolate") {
    const cell = await makeCell({
      seed: `repair:${normalized.toLowerCase()}`,
      title: "Incident isolation",
      intent: classification.intent,
      owner: classification.owner,
      supporting,
      state: "succeeded",
      summary:
        "Repair will isolate the named incident as its own cell. Automatic paid retries are prohibited. Restore from the verified release baseline if core files drifted. This console does not activate code on the Windows host.",
      evidence: [{ label: "Credit class", value: classification.credit }],
      events: [
        ...routeEvents,
        event("repair", "lease", "Quarantine the failing cell; remainder of the fleet stays routable."),
        event("assurance", "observe", "No credit-spending retry. No supervisor shell."),
      ],
    });
    return { cells: [cell] };
  }

  const cell = await makeCell({
    seed: `decompose:${normalized.toLowerCase()}`,
    title: "Coordinator decomposition",
    intent: "decompose",
    owner: "coordinator",
    supporting: ["admin", "repository"],
    state: "succeeded",
    summary: `Coordinator split the directive without a model. Suggested owners: ${classification.agents
      .map((id) => AGENTS[id].label)
      .join(", ") || AGENTS.coordinator.label}. Open Arsenal or press Ctrl/⌘K — every command in the fleet is listed and dispatchable.`,
    evidence: [
      { label: "Credit class", value: "deterministic" },
      { label: "Directive", value: normalized || "(empty)" },
    ],
    events: [
      ...routeEvents,
      event("coordinator", "complete", "No model. Operator should pick a bounded cell from the arsenal."),
    ],
  });
  return { cells: [cell] };
}
