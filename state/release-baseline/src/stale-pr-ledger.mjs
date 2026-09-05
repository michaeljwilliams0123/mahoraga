const CYCLE_LEDGER_PATH = "reports/sovereign-cycle-outcome.json";

function frozen(value) {
  return Object.freeze(value);
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

function requireObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

export function classifyOpenPullRequest(input = {}) {
  const pr = requireObject(input, "stale-pr-invalid");
  const number = pr.number;
  if (!Number.isSafeInteger(number) || number < 1) fail("stale-pr-number-invalid");
  const state = typeof pr.state === "string" ? pr.state.toLowerCase() : "open";
  if (state !== "open") {
    return frozen({
      number,
      disposition: "keep",
      reason: "not-open",
      creditCost: 0,
      paidFallback: false,
    });
  }

  const files = Array.isArray(pr.files) ? pr.files : fail("stale-pr-files-invalid");
  if (files.some((file) => typeof file !== "string" || file.length < 1 || file.length > 240)) {
    fail("stale-pr-files-invalid");
  }

  const ledgerOnly = files.length === 1 && files[0] === CYCLE_LEDGER_PATH;
  const title = typeof pr.title === "string" ? pr.title : "";
  const ledgerTitle = /refresh sovereign cycle outcome ledger/i.test(title);
  const baseSha = pr.baseSha;
  const currentMainSha = pr.currentMainSha;
  const staleBase =
    typeof baseSha === "string"
    && typeof currentMainSha === "string"
    && /^[a-f0-9]{40}$/.test(baseSha)
    && /^[a-f0-9]{40}$/.test(currentMainSha)
    && baseSha !== currentMainSha;

  if (ledgerOnly && (staleBase || ledgerTitle)) {
    return frozen({
      number,
      disposition: "close-eligible",
      reason: "cycle-ledger-noop-stale",
      files: frozen([...files]),
      creditCost: 0,
      paidFallback: false,
      note: "A cycleId stamp is not a candidate. The Actions step summary is the $0 pulse.",
    });
  }

  return frozen({
    number,
    disposition: "keep",
    reason: "implementation-or-active",
    files: frozen([...files]),
    creditCost: 0,
    paidFallback: false,
  });
}

export function reduceStalePullRequestLedger(pullRequests = [], { evaluatedAt = new Date().toISOString() } = {}) {
  if (!Array.isArray(pullRequests)) fail("stale-prs-invalid");
  const records = pullRequests.map((item) => classifyOpenPullRequest(item));
  const counts = { keep: 0, "close-eligible": 0 };
  for (const record of records) counts[record.disposition] += 1;
  return frozen({
    schemaVersion: 1,
    kind: "stale-pr-ledger",
    evaluatedAt,
    counts: frozen(counts),
    records: frozen(records),
    creditCost: 0,
    paidFallback: false,
    note: "Ledger-only sovereign pulses that do not change gap composition are close-eligible at $0. Buying review is not a recovery path.",
  });
}
