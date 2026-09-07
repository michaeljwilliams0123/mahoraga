/**
 * EXPERIMENT ONLY — in-process metric emission for L7 Mesh↔Cluster Grafana contract.
 * Names (stable):
 *   mahoraga_l7_queue_depth
 *   mahoraga_l7_active_variant
 *   mahoraga_l7_snapshot_count
 *   mahoraga_l7_mutation_ok_total
 *   mahoraga_l7_mutation_fail_total
 *
 * Optional scrape file: set L7_METRICS_FILE to a path; renderPrometheus() is always available.
 */
import * as fs from "fs";
import * as path from "path";

export const L7_METRIC_NAMES = {
  queueDepth: "mahoraga_l7_queue_depth",
  activeVariant: "mahoraga_l7_active_variant",
  snapshotCount: "mahoraga_l7_snapshot_count",
  mutationOk: "mahoraga_l7_mutation_ok_total",
  mutationFail: "mahoraga_l7_mutation_fail_total"
} as const;

export class MetricsRegistry {
  private queueDepth = 0;
  private activeVariant = 0;
  private snapshotCount = 0;
  private mutationOk = 0;
  private mutationFail = 0;
  private metricsFile: string | null;

  constructor(metricsFile: string | null = process.env.L7_METRICS_FILE || null) {
    this.metricsFile = metricsFile && metricsFile.length > 0 ? metricsFile : null;
  }

  public setQueueDepth(n: number): void {
    this.queueDepth = Math.max(0, Math.floor(n));
    this.flush();
  }

  public setActiveVariant(n: number): void {
    this.activeVariant = Math.floor(n);
    this.flush();
  }

  public setSnapshotCount(n: number): void {
    this.snapshotCount = Math.max(0, Math.floor(n));
    this.flush();
  }

  public incMutationOk(by = 1): void {
    this.mutationOk += by;
    this.flush();
  }

  public incMutationFail(by = 1): void {
    this.mutationFail += by;
    this.flush();
  }

  public snapshot(): Record<string, number> {
    return {
      [L7_METRIC_NAMES.queueDepth]: this.queueDepth,
      [L7_METRIC_NAMES.activeVariant]: this.activeVariant,
      [L7_METRIC_NAMES.snapshotCount]: this.snapshotCount,
      [L7_METRIC_NAMES.mutationOk]: this.mutationOk,
      [L7_METRIC_NAMES.mutationFail]: this.mutationFail
    };
  }

  public renderPrometheus(): string {
    const s = this.snapshot();
    const lines: string[] = [
      `# HELP ${L7_METRIC_NAMES.queueDepth} In-memory task queue depth`,
      `# TYPE ${L7_METRIC_NAMES.queueDepth} gauge`,
      `${L7_METRIC_NAMES.queueDepth} ${s[L7_METRIC_NAMES.queueDepth]}`,
      `# HELP ${L7_METRIC_NAMES.activeVariant} Active metamorphic variant index (Atomics)`,
      `# TYPE ${L7_METRIC_NAMES.activeVariant} gauge`,
      `${L7_METRIC_NAMES.activeVariant} ${s[L7_METRIC_NAMES.activeVariant]}`,
      `# HELP ${L7_METRIC_NAMES.snapshotCount} Nodes present in last persistence checkpoint`,
      `# TYPE ${L7_METRIC_NAMES.snapshotCount} gauge`,
      `${L7_METRIC_NAMES.snapshotCount} ${s[L7_METRIC_NAMES.snapshotCount]}`,
      `# HELP ${L7_METRIC_NAMES.mutationOk} Fail-closed mutations that verified and swapped`,
      `# TYPE ${L7_METRIC_NAMES.mutationOk} counter`,
      `${L7_METRIC_NAMES.mutationOk} ${s[L7_METRIC_NAMES.mutationOk]}`,
      `# HELP ${L7_METRIC_NAMES.mutationFail} Mutations dropped; prior pointer kept`,
      `# TYPE ${L7_METRIC_NAMES.mutationFail} counter`,
      `${L7_METRIC_NAMES.mutationFail} ${s[L7_METRIC_NAMES.mutationFail]}`,
      ""
    ];
    return lines.join("\n");
  }

  private flush(): void {
    if (!this.metricsFile) return;
    try {
      const dir = path.dirname(this.metricsFile);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.metricsFile, this.renderPrometheus(), "utf-8");
    } catch (err) {
      console.error("[MetricsRegistry] flush failed:", err);
    }
  }
}
