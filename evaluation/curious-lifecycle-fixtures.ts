export const GENERATIVE_FIXTURE = Object.freeze({
  claims: Object.freeze([
    Object.freeze({ text: "Repository inspection is separately permissioned.", evidenceRefs: Object.freeze(["evidence:repository-route"]) }),
    Object.freeze({ text: "Coding execution remains unavailable.", evidenceRefs: Object.freeze(["evidence:codex-state"]) }),
  ]),
  allowedEvidenceRefs: Object.freeze(["evidence:repository-route", "evidence:codex-state"]),
  uncertaintyDeclared: true,
});

export const PREDICTIVE_FIXTURE = Object.freeze({
  observedState: Object.freeze({ queueDepth: 4 }),
  effects: Object.freeze({ queueDepth: -2 }),
  predictedState: Object.freeze({ queueDepth: 2 }),
  simulationOnly: true,
});

export const AGENTIC_FIXTURE = Object.freeze({
  materialDissent: Object.freeze(["dissent:capacity-risk"]),
  preservedDissent: Object.freeze(["dissent:capacity-risk"]),
  planAuthorized: true,
  executed: false,
});

export const CROSS_MODE_FIXTURE = Object.freeze({
  originalConclusion: "hold",
  revisedConclusion: "proceed-with-bounded-test",
  originalEvidenceRefs: Object.freeze(["evidence:baseline", "evidence:dissent"]),
  revisedEvidenceRefs: Object.freeze(["evidence:baseline", "evidence:dissent", "evidence:research"]),
});

export const CURIOUS_LIFECYCLE_FIXTURES = Object.freeze({
  generative: GENERATIVE_FIXTURE,
  predictive: PREDICTIVE_FIXTURE,
  agentic: AGENTIC_FIXTURE,
  crossMode: CROSS_MODE_FIXTURE,
});
