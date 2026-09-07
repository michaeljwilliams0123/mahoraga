import { createInternetEgressController } from '../src/internet-egress.mjs';
import { createInternetEvidencePlane } from '../src/internet-evidence-plane.mjs';
import { runResearchAssimilation } from '../src/research-assimilation-loop.mjs';
import { planResearchJobs } from '../src/research-scheduler.mjs';
import { deriveResearchSignals } from '../src/research-signal-deriver.mjs';

// Importing this module never starts network work or writes repository state.
export async function runStewardResearchCycle({
  registry, priorState = null, now = new Date().toISOString(),
  networkAvailable = true, fetchImpl = globalThis.fetch, resolveHost,
} = {}) {
  if (registry?.schemaVersion !== 1) throw new TypeError('steward-research-registry-invalid');
  if (priorState !== null && (priorState.schemaVersion !== 1 ||
      priorState.zeroCredit !== true || priorState.providerRequired !== false ||
      priorState.creditCost !== 0 || priorState.paidFallback !== false ||
      !Array.isArray(priorState.history) || !Array.isArray(priorState.memoryRecords))) {
    throw new TypeError('steward-research-state-invalid');
  }
  const maximumResponseBytes = registry.budget?.maximumResponseBytes ?? 200_000;
  if (!Number.isInteger(maximumResponseBytes) || maximumResponseBytes < 1 || maximumResponseBytes > 2 * 1024 * 1024) {
    throw new TypeError('steward-research-response-budget-invalid');
  }
  const input = {
    objectives: registry.objectives, sources: registry.sources,
    budget: registry.budget, history: priorState?.history ?? [], now, networkAvailable,
  };
  // Validate the entire plan before any request; each source's reservation is enforced.
  const plan = planResearchJobs(input);
  const evidencePlane = {
    async ingest(request) {
      const job = plan.jobs.find((item) => item.url === request.url && item.objectiveId === request.objectiveId &&
        item.capability === request.capability && item.sourceClass === request.sourceClass);
      if (!job) throw new TypeError('steward-research-unplanned-request');
      const limit = Math.min(maximumResponseBytes, ...plan.jobs.filter((item) => item.url === request.url).map((item) => item.maximumBytes));
      const egressController = createInternetEgressController({
        now: () => new Date(now), resolveHost, maximumBytes: limit,
        fetchImpl: async (url, options) => {
          const response = await fetchImpl(url, options);
          if (!response || response.status < 200 || response.status >= 300) throw new TypeError('steward-research-http-failed');
          const reader = response.body?.getReader();
          if (!reader) throw new TypeError('steward-research-body-missing');
          const chunks = [];
          let size = 0;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > limit) throw new TypeError('steward-research-response-too-large');
              chunks.push(Buffer.from(value));
            }
          } finally {
            await reader.cancel().catch(() => {});
            reader.releaseLock();
          }
          return new Response(Buffer.concat(chunks), { status: response.status, headers: response.headers });
        },
      });
      return createInternetEvidencePlane({ egressController, deriveSignals: deriveResearchSignals }).ingest(request);
    },
  };
  const result = await runResearchAssimilation({
    ...input, existingMemoryRecords: priorState?.memoryRecords ?? [], evidencePlane,
  });
  return Object.freeze({
    summary: Object.freeze({ status: result.plan.status, completedCount: result.run.completedCount,
      deferredCount: result.plan.deferredCount, newMemoryCount: result.newMemoryIds.length }),
    state: Object.freeze({ schemaVersion: 1, history: result.history, memoryRecords: result.memory.records,
      zeroCredit: true, providerRequired: false, creditCost: 0, paidFallback: false }),
  });
}
