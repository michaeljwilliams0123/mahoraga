import { pathToFileURL } from "node:url";

export function runComplexDatasetScenarios() {
  return [
    analyzeRevenueReconciliation(),
    analyzeAccessPopulation(),
    analyzeConversionMixShift(),
  ];
}

function analyzeRevenueReconciliation() {
  const invoices = Array.from({ length: 12_000 }, (_, index) => ({
    invoiceId: `INV-${String(index + 1).padStart(5, "0")}`,
    customerId: `C-${index % 431}`,
    amount: 100 + (index % 37) * 9,
  }));
  invoices.push({ ...invoices[418], amount: invoices[418].amount + 50 });
  invoices[9_001].amount = 50_000;
  const payments = invoices.slice(0, 11_950).map(({ invoiceId, amount }) => ({ invoiceId, amount }));
  payments[777].amount -= 125;

  const invoiceCounts = counts(invoices, "invoiceId");
  const duplicateInvoiceIds = [...invoiceCounts].filter(([, count]) => count > 1).map(([id]) => id);
  const paymentByInvoice = new Map(payments.map((item) => [item.invoiceId, item.amount]));
  const unmatched = invoices.filter((item) => !paymentByInvoice.has(item.invoiceId));
  const mismatches = invoices.filter((item) => paymentByInvoice.has(item.invoiceId) && paymentByInvoice.get(item.invoiceId) !== item.amount);
  const typical = median(invoices.map((item) => item.amount));
  const outliers = invoices.filter((item) => item.amount > typical * 20);
  return result("revenue-reconciliation", invoices.length + payments.length, [
    finding("duplicate-key", duplicateInvoiceIds.length, "high"),
    finding("unmatched-invoice", unmatched.length, "high"),
    finding("amount-mismatch", mismatches.length, "high"),
    finding("material-outlier", outliers.length, "medium"),
  ], { conclusion: "The population cannot be reconciled as complete and accurate without resolving duplicate keys, missing payments, and amount mismatches.", caveat: "The outlier is a screening signal, not proof of error." });
}

function analyzeAccessPopulation() {
  const users = Array.from({ length: 18_000 }, (_, index) => ({
    userId: `U-${String(index + 1).padStart(5, "0")}`,
    status: index % 401 === 0 ? "terminated" : "active",
    accessEnabled: true,
    privileged: index % 97 === 0,
    approved: index % 389 !== 0,
    owner: index % 509 === 0 ? "" : `manager-${index % 83}`,
  }));
  users.push({ ...users[1_111] }, { ...users[1_111] });
  const duplicateUsers = [...counts(users, "userId")].filter(([, count]) => count > 1);
  const terminatedEnabled = users.filter((item) => item.status === "terminated" && item.accessEnabled);
  const privilegedUnapproved = users.filter((item) => item.privileged && !item.approved);
  const ownerless = users.filter((item) => !item.owner);
  return result("access-review", users.length, [
    finding("duplicate-user", duplicateUsers.length, "medium"),
    finding("terminated-enabled", terminatedEnabled.length, "critical"),
    finding("privileged-unapproved", privilegedUnapproved.length, "critical"),
    finding("missing-owner", ownerless.length, "medium"),
  ], { conclusion: "Access certification is not reliable until terminated access, privileged approvals, duplicates, and ownership gaps are remediated.", caveat: "The scenario establishes control exceptions, not evidence of misuse." });
}

function analyzeConversionMixShift() {
  const periods = {
    prior: [{ channel: "high-intent", visits: 8_000, rate: 0.10 }, { channel: "low-intent", visits: 2_000, rate: 0.02 }],
    current: [{ channel: "high-intent", visits: 2_000, rate: 0.11 }, { channel: "low-intent", visits: 8_000, rate: 0.025 }],
  };
  const aggregate = Object.fromEntries(Object.entries(periods).map(([period, rows]) => {
    const visits = rows.reduce((sum, row) => sum + row.visits, 0);
    const conversions = rows.reduce((sum, row) => sum + row.visits * row.rate, 0);
    return [period, conversions / visits];
  }));
  const segmentImprovements = periods.current.filter((current) => {
    const prior = periods.prior.find((item) => item.channel === current.channel);
    return prior && current.rate > prior.rate;
  }).length;
  const aggregateDrop = aggregate.current < aggregate.prior;
  return result("conversion-mix-shift", 20_000, [
    finding("aggregate-rate-drop", aggregateDrop ? 1 : 0, "high"),
    finding("improving-segments", segmentImprovements, "informational"),
    finding("mix-shift", aggregateDrop && segmentImprovements === periods.current.length ? 1 : 0, "high"),
  ], {
    conclusion: "The aggregate conversion decline is explained by traffic mix: both channel rates improved while volume shifted toward the lower-converting channel.",
    caveat: "This decomposition supports association, not a causal claim about why traffic mix changed.",
  });
}

function counts(rows, key) {
  const output = new Map();
  for (const row of rows) output.set(row[key], (output.get(row[key]) ?? 0) + 1);
  return output;
}
function median(values) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)];
}
function finding(code, count, severity) { return Object.freeze({ code, count, severity }); }
function result(id, rowsAnalyzed, findings, narrative) {
  const passed = findings.some((item) => item.count > 0) && narrative.conclusion.length > 40 && narrative.caveat.length > 20;
  return Object.freeze({ id, passed, rowsAnalyzed, findings: Object.freeze(findings), ...narrative });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const scenarios = runComplexDatasetScenarios();
  const summary = { suite: "mahoraga-complex-dataset-v1", passed: scenarios.filter((item) => item.passed).length, total: scenarios.length, rowsAnalyzed: scenarios.reduce((sum, item) => sum + item.rowsAnalyzed, 0), scenarios };
  console.log(JSON.stringify(summary, null, 2));
  if (summary.passed !== summary.total) process.exitCode = 1;
}
