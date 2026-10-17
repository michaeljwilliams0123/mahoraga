import type { ChatExecutionEvidence } from "@/lib/chat-execution-evidence";
import "./chat-execution-details.css";

export function ChatExecutionDetails({ evidence }: { evidence?: ChatExecutionEvidence }) {
  const reported = evidence?.status === "reported" ? evidence : null;
  return <details className="chat-execution-details">
    <summary>Execution details</summary>
    <p>{reported ? "Runtime-reported task metadata" : "Execution metadata unavailable for this message"}</p>
    {reported && <dl>
      <dt>Execution source SHA</dt><dd>{reported.sourceSHA ?? "Unknown"}</dd>
      <dt>Task</dt><dd>{reported.taskId}</dd>
      <dt>Worker</dt><dd>{reported.workerId}</dd>
      <dt>Provider</dt><dd>{reported.providerId}</dd>
      <dt>Cost class</dt><dd>{reported.costClass}</dd>
      <dt>Credit policy</dt><dd>{reported.creditPolicy}</dd>
      {reported.persistedResultObservation && <><dt>Runtime-stored answer record</dt><dd>{reported.persistedResultObservation === "matched" ? "Matched encrypted record (runtime reported)" : reported.persistedResultObservation === "missing" ? "Missing" : reported.persistedResultObservation === "mismatch" ? "Record mismatch" : "Not observed"}</dd></>}
      {reported.memoryState && <><dt>Memory index</dt><dd>{reported.memoryState}</dd></>}
    </dl>}
    <p>Independent execution verification: not supplied.</p>
    <p>Independent source verification, authentication, authority, routing, durable-result and replay receipts: not supplied for this message.</p>
  </details>;
}
